// lib/locationTracker.ts
// ─────────────────────────────────────────────────────────────────────────
// GPS tracking en dos capas:
//   1) Foreground watcher  (watchPositionAsync)   — actualiza mientras el app
//      está abierto; respuesta inmediata (~segundos).
//   2) Background task     (startLocationUpdatesAsync + TaskManager) — sigue
//      actualizando aunque el app esté minimizado o el celular bloqueado.
//
// Ambas capas llaman a `reportLocation()`, que primero restaura la sesión
// de Supabase (AsyncStorage) y luego invoca el RPC seguro
// `actualizar_mi_ubicacion` (SECURITY DEFINER — toma el email del JWT).
//
// IMPORTANTE: este archivo DEBE importarse en _layout.tsx (root) para que
// TaskManager.defineTask() quede registrado antes de que Android despierte
// la tarea en segundo plano.
// ─────────────────────────────────────────────────────────────────────────
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from './supabase';

export type GpsStatus = 'off' | 'foreground' | 'background' | 'denied';

const TASK = 'hogareno-background-location';

// ── Cola offline ──────────────────────────────────────────────────────────
// Cada posición (con su hora real) se guarda en AsyncStorage y se va vaciando
// al historial (RPC registrar_ubicaciones). Si no hay señal, la cola se acumula
// y se manda entera al reconectar → NO se pierde el tramo hecho sin señal.
const QUEUE_KEY = '@ubic_offline_queue';
const MAX_QUEUE = 1500;   // tope defensivo: nunca crece sin límite
const LOTE = 200;         // se manda de a lotes tras una desconexión larga

type Punto = { lat: number; lng: number; ts: string };
let flushing = false;

async function encolar(p: Punto) {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    const q: Punto[] = raw ? JSON.parse(raw) : [];
    q.push(p);
    // Si supera el tope, se descartan los más viejos (prioriza lo reciente).
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q.length > MAX_QUEUE ? q.slice(-MAX_QUEUE) : q));
  } catch { /* ignore */ }
}

// Vacía la cola al historial. Si falla (sin red), la deja para el próximo tick.
async function vaciarCola() {
  if (flushing) return;
  flushing = true;
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    let q: Punto[] = raw ? JSON.parse(raw) : [];
    if (!q.length) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    while (q.length) {
      const lote = q.slice(0, LOTE);
      const { error } = await supabase.rpc('registrar_ubicaciones', { p_puntos: lote });
      if (error) throw error;
      q = q.slice(LOTE);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(q)); // persistir avance
    }
  } catch {
    // Sin red o error: la cola queda intacta y se reintenta en el próximo tick.
  } finally {
    flushing = false;
  }
}

// ── Shared: registra la posición (dot en vivo + cola de historial) ─────────
async function reportLocation(lat: number, lng: number) {
  // 1) Encolar SIEMPRE (aunque no haya red): así el tramo offline no se pierde.
  await encolar({ lat, lng, ts: new Date().toISOString() });
  try {
    // 2) Posición viva (el punto que muestra el mapa). getSession lee AsyncStorage
    //    si hace falta; es no-op si ya está en memoria.
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      await supabase.rpc('actualizar_mi_ubicacion', { p_lat: lat, p_lng: lng });
    }
  } catch {
    // Sin red o sesión expirada: el próximo tick lo reintenta.
  }
  // 3) Intentar vaciar la cola (este punto + los que hayan quedado sin enviar).
  await vaciarCola();
}

// ── Background task ───────────────────────────────────────────────────────
// DEBE definirse a nivel de módulo (top-level) para que TaskManager lo
// registre cuando Android despierta el proceso en segundo plano.
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const loc = locations?.[locations.length - 1];
  if (!loc) return;
  await reportLocation(loc.coords.latitude, loc.coords.longitude);
});

// ── Estado interno ────────────────────────────────────────────────────────
let estado: GpsStatus = 'off';
let foregroundSub: Location.LocationSubscription | null = null;

/**
 * Inicia el seguimiento. Idempotente.
 * Arranca TANTO el watcher de foreground (inmediato) como la tarea de fondo
 * (persiste cuando el app está minimizado).
 */
export async function startTracking(_email?: string): Promise<GpsStatus> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') { estado = 'denied'; return 'denied'; }

  let bgOk = false;
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    bgOk = bg.status === 'granted';
  } catch { /* algunos devices no piden background por separado */ }

  // ── Watcher de foreground (respuesta inmediata mientras la app está abierta)
  if (foregroundSub) { foregroundSub.remove(); foregroundSub = null; }
  foregroundSub = await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15000,
      distanceInterval: 20,
    },
    (loc) => reportLocation(loc.coords.latitude, loc.coords.longitude)
  );

  // ── Tarea de fondo (persiste cuando la app está minimizada/cerrada).
  // Envuelta en try/catch: en Expo Go (o si el módulo nativo de background no
  // está) startLocationUpdatesAsync tira excepción — NO debe tumbar el watcher
  // de foreground que ya quedó activo arriba. Si falla, seguimos solo foreground.
  let bgRunning = false;
  try {
    const yaCorre = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
    if (!yaCorre) {
      await Location.startLocationUpdatesAsync(TASK, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 15000,
        distanceInterval: 20,
        pausesUpdatesAutomatically: false,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
          notificationTitle: 'Logística Hogareño',
          notificationBody: 'Compartiendo tu ubicación con la logística.',
        },
      });
    }
    bgRunning = true;
  } catch (e) {
    console.warn('[GPS] background no disponible, sigo en foreground:', (e as Error)?.message);
  }

  // 'background' solo si el permiso "siempre" está dado Y la tarea arrancó de verdad.
  estado = (bgOk && bgRunning) ? 'background' : 'foreground';
  return estado;
}

/**
 * No-op: el tracking persiste en segundo plano hasta el logout.
 * Se deja para no romper código que lo llama al desmontar pantallas.
 */
export async function stopTracking(): Promise<void> {
  // intencionalmente vacío
}

/** Detiene todo el seguimiento. Llamar en el LOGOUT. */
export async function forceStopTracking(): Promise<void> {
  if (foregroundSub) { foregroundSub.remove(); foregroundSub = null; }
  try {
    const yaCorre = await Location.hasStartedLocationUpdatesAsync(TASK);
    if (yaCorre) await Location.stopLocationUpdatesAsync(TASK);
  } catch { /* ignore */ }
  estado = 'off';
}

export function getTrackerState() {
  return { activo: estado === 'foreground' || estado === 'background', status: estado };
}
