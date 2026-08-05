import { supabase } from './supabase';

// ─────────────────────────────────────────────────────────────────────────
// QUÉ APARTADOS VE EL CHOFER — espejo de utils/apartadosVisibles.js de la web.
// Mantener los dos sincronizados (ver regla de paridad web ⇄ app).
//
// Salió de un bug real: al crear el apartado "PLANIFICACION NUEVA" (95 filas
// en Clientes), sus colectas le aparecieron a los choferes dentro de
// "Lun a Vie". La causa es `normTipo`, que manda a SEMANA todo lo que no sea
// SÁBADOS ni ESPECIALES — cualquier apartado nuevo se disfraza de Lun a Vie.
//
// El filtro va sobre el `tipo_dia` CRUDO, ANTES de normalizar.
//
// DEFAULTS: los 3 base se ven si no hay fila; cualquier apartado NUEVO no se
// ve hasta prenderlo desde la pantalla Clientes.
// ─────────────────────────────────────────────────────────────────────────

export const APARTADOS_BASE = ['SEMANA', 'SÁBADOS', 'ESPECIALES'];

export const normApartado = (t?: string | null): string =>
  (t || '').toString().trim().toUpperCase();

export async function cargarApartadosVisibles(): Promise<Map<string, boolean>> {
  const m = new Map<string, boolean>();
  const { data, error } = await supabase
    .from('apartados_visibles').select('tipo_dia, visible_app');
  if (!error) for (const r of (data || [])) m.set(normApartado(r.tipo_dia), !!r.visible_app);
  return m;
}

export function apartadoVisible(tipoDia: string | null | undefined, mapa: Map<string, boolean>): boolean {
  const t = normApartado(tipoDia);
  const clave = t || 'SEMANA';           // tipo_dia vacío = SEMANA (filas viejas)
  if (mapa?.has(clave)) return !!mapa.get(clave);
  return APARTADOS_BASE.includes(clave); // sin fila: base sí, nuevos no
}

export const filtrarVisibles = <T extends { tipo_dia?: string | null }>(
  filas: T[], mapa: Map<string, boolean>,
): T[] => (filas || []).filter(r => apartadoVisible(r?.tipo_dia, mapa));
