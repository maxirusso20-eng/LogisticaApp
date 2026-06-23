// lib/locationTracker.ts
// ─────────────────────────────────────────────────────────────────────────
// Tracker de ubicación en SEGUNDO PLANO (background) para el chofer.
//
// A diferencia de la web (PWA, solo foreground) y de la versión anterior de
// este archivo (watchPositionAsync, también foreground), esto usa
// expo-task-manager + Location.startLocationUpdatesAsync: la posición se sigue
// reportando AUNQUE la app esté minimizada o el celular bloqueado, hasta que
// el chofer cierra sesión (forceStopTracking).
//
// Escribe via RPC seguro `actualizar_mi_ubicacion` (SECURITY DEFINER, toma el
// email del JWT) — la RLS de Choferes es admin-only para escritura, así que un
// UPDATE directo del chofer NO funcionaría.
//
// Requisitos (ya configurados en app.json): permisos de background location
// (iOS UIBackgroundModes=location, Android ACCESS_BACKGROUND_LOCATION) + plugin
// expo-location con isAndroidBackgroundLocationEnabled. NO funciona en Expo Go:
// necesita un dev build / build de EAS para que corra la tarea de fondo.
// ─────────────────────────────────────────────────────────────────────────
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from './supabase';

export type GpsStatus = 'off' | 'foreground' | 'background' | 'denied';

const TASK = 'hogareno-background-location';

// Tarea de fondo: corre en su propio contexto (incluso con la app cerrada/
// bloqueada). Toma la última posición del lote y la manda con el RPC seguro.
TaskManager.defineTask(TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data as { locations: Location.LocationObject[] };
  const loc = locations?.[locations.length - 1];
  if (!loc) return;
  try {
    await supabase.rpc('actualizar_mi_ubicacion', {
      p_lat: loc.coords.latitude,
      p_lng: loc.coords.longitude,
    });
  } catch {
    // Sin sesión/red en este tick: el próximo intento reescribe igual.
  }
});

let estado: GpsStatus = 'off';

/**
 * Inicia el seguimiento en segundo plano. Idempotente (si ya está corriendo,
 * no lo duplica). El `email` se mantiene por compatibilidad con quienes lo
 * llaman; la identidad real la resuelve el RPC desde el JWT.
 */
export async function startTracking(email?: string): Promise<GpsStatus> {
  void email;
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') { estado = 'denied'; return 'denied'; }

  // Permiso "en todo momento". Si lo deniegan, igual se trackea en foreground.
  let bgOk = false;
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    bgOk = bg.status === 'granted';
  } catch { /* algunos devices no piden background por separado */ }

  const yaCorre = await Location.hasStartedLocationUpdatesAsync(TASK).catch(() => false);
  if (!yaCorre) {
    await Location.startLocationUpdatesAsync(TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 15000,      // ~cada 15s
      distanceInterval: 20,     // o cada 20 m
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true, // iOS: indicador azul
      foregroundService: {       // Android: notificación persistente (obligatoria)
        notificationTitle: 'Logística Hogareño',
        notificationBody: 'Compartiendo tu ubicación con la logística.',
      },
    });
  }
  estado = bgOk ? 'background' : 'foreground';
  return estado;
}

/**
 * NO detiene el seguimiento. En la versión foreground anterior, salir de una
 * pantalla lo apagaba; para tracking de flota queremos que SIGA en segundo
 * plano. El corte real es al cerrar sesión (forceStopTracking). Se deja como
 * no-op para no romper a colectas/mapa que lo llaman al desmontar.
 */
export async function stopTracking(): Promise<void> {
  // intencionalmente vacío — el tracking persiste hasta el logout.
}

/** Detiene de verdad el seguimiento. Llamar en el LOGOUT. */
export async function forceStopTracking(): Promise<void> {
  try {
    const yaCorre = await Location.hasStartedLocationUpdatesAsync(TASK);
    if (yaCorre) await Location.stopLocationUpdatesAsync(TASK);
  } catch { /* ignore */ }
  estado = 'off';
}

export function getTrackerState() {
  return { activo: estado === 'foreground' || estado === 'background', status: estado };
}
