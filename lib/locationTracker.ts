/**
 * lib/locationTracker.ts
 *
 * Módulo de rastreo GPS en segundo plano para choferes.
 *
 * FIX CRÍTICO respecto a la versión anterior:
 *   El email del chofer ahora se persiste en AsyncStorage.
 *   Esto es necesario porque el TaskManager de Expo corre en un contexto
 *   JS separado cuando la app está en background/cerrada, y las variables
 *   de módulo (let _emailChofer) se reinician a null en ese contexto.
 *   Sin este fix, el task se ejecuta pero no envía nada (falla silenciosa).
 *
 * Estrategia de envío:
 *  - Manda un upsert a `ubicaciones_en_vivo` solo si:
 *    (a) pasaron más de INTERVALO_MS (60 segundos), o
 *    (b) el chofer se movió más de DISTANCIA_MIN_M (100 metros)
 *  - Funciona en primer plano en Expo Go.
 *  - Funciona en segundo plano (pantalla bloqueada, otra app) con build nativo (EAS Build).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { supabase } from './supabase';

// ─── Constantes ───────────────────────────────────────────────────────────────

export const LOCATION_TASK_NAME = 'chofer-location-task';

const STORAGE_KEY_EMAIL = '@gps_email_chofer';

const INTERVALO_MS = 60_000;  // 60 segundos entre envíos obligatorios
const DISTANCIA_MIN_M = 100;     // 100 metros de movimiento = envío inmediato

// ─── Estado en memoria (solo válido en foreground) ────────────────────────────
// En background, estas variables se resetean. Por eso el email va a AsyncStorage
// y lat/lon/tiempo se manejan solo como optimización en foreground.

let _ultimaLat: number | null = null;
let _ultimaLon: number | null = null;
let _ultimoEnvio: number = 0;

// ─── Helpers de persistencia ──────────────────────────────────────────────────

/** Guardar email en AsyncStorage (persiste entre contextos JS) */
export async function setEmailChofer(email: string): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY_EMAIL, email);
}

/** Leer email desde AsyncStorage (funciona tanto en fore como en background) */
async function getEmailChofer(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEY_EMAIL);
}

/** Borrar email al detener el tracking */
async function clearEmailChofer(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY_EMAIL);
}

// ─── Haversine: distancia entre dos coordenadas en metros ────────────────────

function haversineMetros(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Envío a Supabase ─────────────────────────────────────────────────────────

async function enviarUbicacion(
  lat: number,
  lon: number,
  precision?: number | null,
  velocidad?: number | null,
): Promise<void> {
  // FIX: leer email desde AsyncStorage en lugar de la variable de módulo
  const emailChofer = await getEmailChofer();
  if (!emailChofer) {
    console.warn('[GPS] No hay email de chofer guardado — abortando envío.');
    return;
  }

  const ahora = Date.now();
  const tiempoDesdeUltimo = ahora - _ultimoEnvio;
  const distancia =
    _ultimaLat != null && _ultimaLon != null
      ? haversineMetros(_ultimaLat, _ultimaLon, lat, lon)
      : Infinity; // primera vez → siempre enviar

  const debePorTiempo = tiempoDesdeUltimo >= INTERVALO_MS;
  const debePorDistancia = distancia >= DISTANCIA_MIN_M;

  if (!debePorTiempo && !debePorDistancia) return; // throttle: no enviar

  _ultimaLat = lat;
  _ultimaLon = lon;
  _ultimoEnvio = ahora;

  const velocidadKmh =
    velocidad != null && velocidad >= 0 ? velocidad * 3.6 : null;

  const { error } = await supabase
    .from('ubicaciones_en_vivo')
    .upsert(
      {
        email_chofer: emailChofer,
        latitud: lat,
        longitud: lon,
        precision_m: precision ?? null,
        velocidad_kmh: velocidadKmh,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'email_chofer' }, // usa email_chofer como clave única ✓
    );

  if (error) {
    console.error('[GPS] Error enviando ubicación a Supabase:', error.message);
  } else {
    console.log(
      `[GPS] Enviado — dist: ${distancia.toFixed(0)}m, ` +
      `tiempo: ${(tiempoDesdeUltimo / 1000).toFixed(0)}s, ` +
      `chofer: ${emailChofer}`,
    );
  }
}

// ─── TaskManager: definir la tarea en segundo plano ──────────────────────────
// IMPORTANTE: esta llamada DEBE estar en el scope raíz del módulo (no dentro de
// ninguna función ni hook), para que Expo la registre correctamente al arrancar.

TaskManager.defineTask(
  LOCATION_TASK_NAME,
  async ({
    data,
    error,
  }: TaskManager.TaskManagerTaskBody<{ locations: Location.LocationObject[] }>) => {
    if (error) {
      console.error('[GPS Background] Error en task:', error.message);
      return;
    }
    if (!data?.locations?.length) return;

    const loc = data.locations[data.locations.length - 1]; // la más reciente
    await enviarUbicacion(
      loc.coords.latitude,
      loc.coords.longitude,
      loc.coords.accuracy,
      loc.coords.speed,
    );
  },
);

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * startTracking(email)
 *
 * 1. Persiste el email del chofer en AsyncStorage
 * 2. Pide permisos de ubicación (foreground + background si es posible)
 * 3. Lanza el task de background
 *
 * Devuelve 'background' | 'foreground' | 'denied' según lo que se logró.
 */
export async function startTracking(
  email: string,
): Promise<'background' | 'foreground' | 'denied'> {
  // FIX: guardar en AsyncStorage para que el background task lo pueda leer
  await setEmailChofer(email);

  // Verificar si ya está corriendo
  const yaActivo = await Location.hasStartedLocationUpdatesAsync(
    LOCATION_TASK_NAME,
  ).catch(() => false);
  if (yaActivo) return 'background';

  // ── Permiso de foreground ──
  const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
  if (fgStatus !== 'granted') {
    console.warn('[GPS] Permiso de ubicación denegado (foreground).');
    return 'denied';
  }

  // ── Permiso de background (solo disponible en build nativo) ──
  const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync().catch(
    () => ({ status: 'denied' as const }),
  );
  const tieneBackground = bgStatus === 'granted';

  // ── Opciones del tracker ──
  const options: Location.LocationTaskOptions = {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: INTERVALO_MS,
    distanceInterval: DISTANCIA_MIN_M,
    showsBackgroundLocationIndicator: true, // iOS: barra azul
    foregroundService: {                    // Android: notificación persistente
      notificationTitle: 'Logística Hogareño',
      notificationBody: 'Tu ubicación está siendo compartida durante el reparto.',
      notificationColor: '#4F8EF7',
    },
  };

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, options);
  console.log(
    `[GPS] Tracking iniciado — modo: ${tieneBackground ? 'background' : 'foreground'}`,
  );
  return tieneBackground ? 'background' : 'foreground';
}

/**
 * stopTracking()
 * Detiene el task y limpia el estado (memoria + AsyncStorage).
 */
export async function stopTracking(): Promise<void> {
  const activo = await Location.hasStartedLocationUpdatesAsync(
    LOCATION_TASK_NAME,
  ).catch(() => false);

  if (activo) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    console.log('[GPS] Tracking detenido.');
  }

  // Limpiar tanto la memoria como AsyncStorage
  await clearEmailChofer();
  _ultimaLat = null;
  _ultimaLon = null;
  _ultimoEnvio = 0;
}