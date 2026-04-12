// lib/supabase.ts
//
// Cliente de Supabase tipado.
// Renombrado de supabase.js → supabase.ts para que TypeScript
// resuelva los tipos correctamente en todos los archivos del proyecto.
//
// IMPORTANTE: después de crear este archivo, eliminá supabase.js
// para evitar que TypeScript resuelva el módulo duplicado.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Las credenciales vienen de variables de entorno.
// Creá un archivo .env en la raíz del proyecto con:
//   EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
//   EXPO_PUBLIC_SUPABASE_KEY=sb_publishable_xxxx
//
// Si no hay .env (dev local), caen al fallback hardcodeado abajo.
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://caewphtmlhatimnsfubl.supabase.co';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_KEY ?? 'sb_publishable_Mj-TG1nvq7D_Q-6PUOiOXA_LxeUuJIn';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
    },
});