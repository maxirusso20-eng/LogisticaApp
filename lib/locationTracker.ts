// lib/locationTracker.ts
//
// Tracker de ubicación en PRIMER PLANO (foreground).
// NO usa background location tasks para evitar el error:
// "startLocationUpdatesAsync failed — background.location has not been configured"
//
// La estrategia es:
//   • Pedir solo permiso de foreground (whenInUse)
//   • Usar watchPositionAsync (foreground-only, sin task registrada)
//   • Si el permiso está denegado, retornar 'denied' sin tirar error
//   • Toda la lógica de error está contenida acá, nunca revienta la UI

import * as Location from 'expo-location';
import { supabase } from './supabase';

// Referencia interna a la suscripción activa
let watcherSubscription: Location.LocationSubscription | null = null;

export type GpsStatus = 'off' | 'foreground' | 'background' | 'denied';

/**
 * Inicia el rastreo de ubicación en foreground y actualiza Supabase.
 * @param emailChofer  Email del chofer logueado, para hacer match en la tabla Choferes
 * @returns            El estado resultante del GPS
 */
export async function startTracking(emailChofer: string): Promise<GpsStatus> {
  // 1. Detener cualquier watcher previo
  await stopTracking();

  // 2. Pedir permiso de foreground
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== 'granted') {
    console.warn('[GPS] Permiso de ubicación denegado.');
    return 'denied';
  }

  // 3. Buscar el ID del chofer asociado al email
  let choferId: number | null = null;
  try {
    const { data } = await supabase
      .from('Choferes')
      .select('id')
      .eq('email', emailChofer)
      .maybeSingle();
    choferId = data?.id ?? null;
  } catch (err) {
    console.warn('[GPS] No se pudo obtener el ID del chofer:', err);
    // Continuamos de todas formas — igual mostramos el chip GPS
  }

  // 4. Obtener posición inicial (sin bloquear si falla)
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    if (choferId) {
      void supabase.from('Choferes').update({
        latitud: pos.coords.latitude,
        longitud: pos.coords.longitude,
        ultima_actualizacion: new Date().toISOString(),
      }).eq('id', choferId);
    }
  } catch {
    // No crítico — el watchPositionAsync tomará el control
  }

  // 5. Iniciar el watcher en foreground
  try {
    watcherSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 20,      // metros mínimos de movimiento
        timeInterval: 15000,       // máximo cada 15 segundos
        mayShowUserSettingsDialog: false, // no pedir upgrade a "siempre"
      },
      async (location) => {
        if (!choferId) return;
        const { latitude, longitude } = location.coords;
        try {
          await supabase.from('Choferes').update({
            latitud: latitude,
            longitud: longitude,
            ultima_actualizacion: new Date().toISOString(),
          }).eq('id', choferId);
        } catch (err) {
          console.warn('[GPS] Error actualizando posición en Supabase:', err);
        }
      }
    );
  } catch (err) {
    // Capturamos el error de background no configurado sin reventarle la UI al usuario
    console.warn('[GPS] watchPositionAsync no disponible en este entorno:', err);
    return 'denied';
  }

  return 'foreground';
}

/**
 * Detiene el rastreo y libera la suscripción.
 */
export async function stopTracking(): Promise<void> {
  if (watcherSubscription) {
    watcherSubscription.remove();
    watcherSubscription = null;
  }
}