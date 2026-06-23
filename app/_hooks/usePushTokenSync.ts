// app/_hooks/usePushTokenSync.ts
//
// Hook que registra / refresca el push token de Expo cada vez que
// la app se abre. Antes solo se hacía en index.tsx (admin), ahora
// también en Panel.tsx (chofer).
//
// Por qué es importante:
//   - Expo puede invalidar el token silenciosamente (OS update, reinstall)
//   - El token se guarda en Choferes.push_token o Admins.push_token
//   - Sin token válido, el trigger de las 9am no puede enviar push
//
// Uso:
//   function MiPantalla() {
//     usePushTokenSync();
//     ...
//   }

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

async function obtenerPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4F8EF7',
    });
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) return null;
    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token.data;
  } catch (err) {
    console.warn('[PushToken]', err);
    return null;
  }
}

/**
 * Registra o refresca el push token del usuario actual.
 * Detecta automáticamente si es admin o chofer y escribe en la tabla correcta.
 */
export function usePushTokenSync(): void {
  useEffect(() => {
    const sync = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return;

        const token = await obtenerPushToken();
        if (!token) return;

        // Guardado vía RPC SECURITY DEFINER: el chofer NO puede UPDATE su fila en
        // Choferes (RLS solo admite admin). La RPC actualiza la fila propia del
        // caller (match por email del JWT), salteando RLS de forma acotada. Sirve
        // tanto para chofer (Choferes) como admin (Admins).
        const { error } = await supabase.rpc('guardar_mi_push_token', { p_token: token });

        if (error) console.warn('[PushToken] No se pudo guardar (RPC):', error.message);
      } catch (err) {
        console.warn('[PushToken] Error general:', err);
      }
    };

    void sync();
  }, []);
}

// Default export dummy para silenciar el warning de Expo Router
export default function _HooksRouteIgnore() {
  return null;
}