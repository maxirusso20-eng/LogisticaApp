// Re-export desde la ubicación correcta fuera de app/
// Este archivo existe solo para compatibilidad — no es una pantalla
export { supabase } from '../lib/supabase';

// Expo Router requiere un default export para no mostrar warning.
// Exportamos null (no se renderiza nada, no es una ruta real).
export default function SupabaseStub() { return null; }