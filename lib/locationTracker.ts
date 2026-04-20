// lib/locationTracker.ts
//
// Tracker de ubicación en PRIMER PLANO con REFERENCE COUNTING.
//
// Problema original: colectas.tsx llamaba startTracking() al montar y
// stopTracking() al desmontar. Pero mapa.tsx también usa el tracker.
// Si el chofer estaba en colectas (tracker activo) y navegaba a mapa:
//   - mapa llama startTracking() → OK, ya está corriendo
//   - al salir de colectas, se llamaba stopTracking() → mataba el tracker
//     aunque mapa lo seguía necesitando.
//
// Solución: contador de referencias. stopTracking() solo detiene cuando
// refCount llega a 0. Cada pantalla debe balancear sus start/stop.

import * as Location from 'expo-location';
import { supabase } from './supabase';

// Estado interno del singleton
let watcherSubscription: Location.LocationSubscription | null = null;
let refCount = 0;
let choferIdCache: number | null = null;
let emailActivo: string | null = null;

export type GpsStatus = 'off' | 'foreground' | 'background' | 'denied';

/**
 * Inicia el rastreo de ubicación en foreground y actualiza Supabase.
 * Ref-counted: llamadas múltiples incrementan el contador, stopTracking()
 * solo detiene el watcher cuando el contador llega a 0.
 *
 * @param emailChofer  Email del chofer logueado
 * @returns            Estado del GPS
 */
export async function startTracking(emailChofer: string): Promise<GpsStatus> {
  // Si ya hay tracker activo para OTRO email, detenerlo y reiniciar
  // (caso edge: logout + login con otro usuario sin cerrar la app)
  if (watcherSubscription && emailActivo && emailActivo !== emailChofer) {
    console.log('[GPS] Cambio de usuario → reiniciando tracker');
    watcherSubscription.remove();
    watcherSubscription = null;
    refCount = 0;
    choferIdCache = null;
  }

  // Incrementar ref count
  refCount++;

  // Si ya hay un watcher activo para este mismo email → no-op
  if (watcherSubscription && emailActivo === emailChofer) {
    console.log(`[GPS] Ya activo, refCount=${refCount}`);
    return 'foreground';
  }

  // Pedir permiso de foreground
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    console.warn('[GPS] Permiso denegado');
    refCount = Math.max(0, refCount - 1); // rollback del increment
    return 'denied';
  }

  // Buscar ID del chofer (cache)
  try {
    const { data } = await supabase
      .from('Choferes')
      .select('id')
      .eq('email', emailChofer)
      .maybeSingle();
    choferIdCache = data?.id ?? null;
  } catch (err) {
    console.warn('[GPS] No se pudo obtener el ID del chofer:', err);
  }

  emailActivo = emailChofer;

  // Posición inicial (no bloqueante)
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    if (choferIdCache) {
      void supabase.from('Choferes').update({
        latitud: pos.coords.latitude,
        longitud: pos.coords.longitude,
        ultima_actualizacion: new Date().toISOString(),
      }).eq('id', choferIdCache);
    }
  } catch {
    // silencioso — el watcher se encarga
  }

  // Iniciar watcher
  try {
    watcherSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 20,
        timeInterval: 15000,
        mayShowUserSettingsDialog: false,
      },
      async (location) => {
        if (!choferIdCache) return;
        const { latitude, longitude } = location.coords;
        try {
          await supabase.from('Choferes').update({
            latitud: latitude,
            longitud: longitude,
            ultima_actualizacion: new Date().toISOString(),
          }).eq('id', choferIdCache);
        } catch (err) {
          console.warn('[GPS] Error actualizando posición:', err);
        }
      }
    );
  } catch (err) {
    console.warn('[GPS] watchPositionAsync no disponible:', err);
    refCount = Math.max(0, refCount - 1);
    emailActivo = null;
    return 'denied';
  }

  console.log(`[GPS] Tracker iniciado para ${emailChofer}, refCount=${refCount}`);
  return 'foreground';
}

/**
 * Decrementa el contador. Solo detiene el watcher cuando llega a 0.
 * Cada startTracking() debe tener su stopTracking() correspondiente.
 */
export async function stopTracking(): Promise<void> {
  if (refCount <= 0) return;

  refCount--;
  console.log(`[GPS] stopTracking llamado, refCount=${refCount}`);

  if (refCount === 0 && watcherSubscription) {
    console.log('[GPS] Sin referencias activas → deteniendo watcher');
    watcherSubscription.remove();
    watcherSubscription = null;
    choferIdCache = null;
    emailActivo = null;
  }
}

/**
 * Detiene forzadamente el tracker y resetea el contador.
 * Usar solo en logout para limpiar estado.
 */
export async function forceStopTracking(): Promise<void> {
  if (watcherSubscription) {
    watcherSubscription.remove();
    watcherSubscription = null;
  }
  refCount = 0;
  choferIdCache = null;
  emailActivo = null;
  console.log('[GPS] Force stop — estado limpio');
}

/**
 * Devuelve el estado actual (útil para debug / UI).
 */
export function getTrackerState() {
  return {
    activo: watcherSubscription !== null,
    refCount,
    emailActivo,
    choferId: choferIdCache,
  };
}