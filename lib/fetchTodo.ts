// lib/fetchTodo.ts
// ─────────────────────────────────────────────────────────────────────────
// Espejo nativo de src/utils/fetchTodo.js de la web (paridad web ⇄ app).
// Trae TODAS las filas de una consulta paginando de a 1000. La API de Supabase
// (PostgREST) corta en 1000 filas por request; sin paginar, las tablas que ya
// pasaron ese tope (kpis_lightdata, historial_clientes, envios_registro,
// demorados_registro…) devuelven datos INCOMPLETOS y los totales no cierran.
//
// `build(desde, hasta)` debe devolver la query builder con `.range(desde, hasta)`
// aplicado. Ejemplo:
//   const regs = await fetchTodo((d, h) =>
//     supabase.from('kpis_lightdata').select('*').order('fecha', { ascending: false }).range(d, h));
//
// Corta cuando una página trae menos de 1000 (última). Ante error, devuelve lo
// acumulado hasta ahí (no rompe la pantalla).
type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function fetchTodo<T = any>(
  build: (desde: number, hasta: number) => Page<T>,
  lote = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let desde = 0; desde < 1000000; desde += lote) {
    const { data, error } = await build(desde, desde + lote - 1);
    if (error) { console.warn('[fetchTodo] error paginando:', error.message); break; }
    out.push(...(data || []));
    if (!data || data.length < lote) break;
  }
  return out;
}
