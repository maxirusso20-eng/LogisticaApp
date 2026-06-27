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
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from './supabase';

export type GpsStatus = 'off' | 'foreground' | 'background' | 'denied';

const TASK = 'hogareno-background-location';

// ── Shared: envía coordenadas al RPC verificando sesión ──────────────────
async function reportLocation(lat: number, lng: number) {
  try {
    // Asegurar que la sesión esté cargada desde AsyncStorage.
    // getSession() es no-op si ya está en memoria; si no, lee AsyncStorage.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return; // sin sesión → no hacer nada
    await supabase.rpc('actualizar_mi_ubicacion', { p_lat: lat, p_lng: lng });
  } catch {
    // Sin red o sesión expirada: el próximo tick lo reintenta.
  }
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

  // ── Tarea de fondo (persiste cuando la app está minimizada/cerrada)
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

  estado = bgOk ? 'background' : 'foreground';
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
