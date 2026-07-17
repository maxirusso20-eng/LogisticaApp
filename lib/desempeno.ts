// lib/desempeno.ts
// ─────────────────────────────────────────────────────────────────────────
// Motor de KPIs del chofer — PORTADO de la web (src/utils/desempeno.js).
// Mantener en sync con la web: si cambia allá, cambiar acá.
//   1) RENDIMIENTO (KPI): viene de Lightdata. Lo afectan los DEMORADOS.
//   2) DESEMPEÑO: se carga a mano. Cada acción ±0,1% sobre 100.
// ─────────────────────────────────────────────────────────────────────────

export const PESO_PUNTO = 0.1;

// SLA: una nota cumple si es >= 90%.
export const SLA_MINIMO = 90;
export const cumpleSLA = (pct: number | null) => pct != null && pct >= SLA_MINIMO;

const r2 = (n: number) => Math.round(n * 100) / 100;
export const fmtPct = (n: number | null) =>
  n == null || Number.isNaN(n) ? '—' : `${Number(n).toFixed(2)}%`;

type Indicador = { key: string; label: string };

// ── Indicadores que SUMAN al desempeño ─────────────────────────────────────
// Eliminados: hoy NADA suma al desempeño. Lo de "subir observaciones" pasó al
// KPI (demorado con/sin observación). Export vacío para no romper imports.
export const POSITIVOS: Indicador[] = [];

// ── Indicadores que RESTAN al desempeño (−0,1% c/u) ────────────────────────
export const NEGATIVOS: Indicador[] = [
  { key: 'salteados', label: 'Saltearse paquetes' },
  { key: 'llego_tarde', label: 'Impuntual colecta' },
  { key: 'salio_tarde', label: 'Salida tarde Logística' },
  { key: 'no_marca_directos', label: 'No marcar envíos directos en Light Data' },
  { key: 'no_escanea_logistica', label: 'No escanearse los paquetes en la Logística' },
  { key: 'no_escanea_colecta', label: 'No escanear con Flex en la colecta' },
  { key: 'no_visualiza_alternativas', label: 'No visualizar alternativa' },
  { key: 'no_cobra_destino', label: 'No cobro alternativa' },
  { key: 'no_asigna_envio', label: 'No asignación de envío' },
  { key: 'error_mapeo', label: 'Error mapeo' },
  { key: 'mal_marcado_flex', label: 'Mal marcado flex' },
  { key: 'impuntual_recorrido', label: 'Impuntual recorrido' },
];

// ── Avisos (pesos variables: no entran en NEGATIVOS porque no todos son 0,1%) ─
type Aviso = { key: string; label: string; peso: number };
export const AVISOS: Aviso[] = [
  { key: 'aviso_post10_no_recorrido', label: 'Aviso 8 a 10hs — no recorrido', peso: 0.1 },
  { key: 'aviso_recorrido_10a12', label: 'Aviso 10 a 12hs — no recorrido', peso: 0.5 },
  { key: 'aviso_post12_no_recorrido', label: 'Aviso post 12hs — no recorrido', peso: 2.0 },
  { key: 'aviso_post10_no_colectar', label: 'Aviso post 10hs — no colecta', peso: 0.1 },
  { key: 'aviso_post12_no_colectar', label: 'Aviso post 12hs — no colecta', peso: 0.5 },
];

// Todos los campos manuales (se guardan en kpis_lightdata).
// entregas_post21 es solo para el KPI de rendimiento (no para desempeño).
// entregas_post21 ya NO es manual: lo calcula el parser de Light Data.
export const CAMPOS_MANUALES = [
  ...NEGATIVOS.map((i) => i.key),
  ...AVISOS.map((i) => i.key),
];

// ── Ausencias (el chofer se baja de una colecta/recorrido) ─────────────────
//   • antes de las 10:00 → 0%
//   • 10:00 a 11:59      → −0,1%
//   • desde las 12:00    → −0,5%
export const HORA_CORTE_TEMPRANA = 10;
export const HORA_CORTE_AUSENCIA = 12;
export const PESO_AUSENCIA_TEMPRANA = 0.1;
export const PESO_AUSENCIA_TARDIA = 0.5;

export function esAusenciaTardia(hora?: string | null): boolean {
  if (!hora) return false;
  const h = parseInt(String(hora).slice(0, 2), 10);
  return Number.isFinite(h) && h >= HORA_CORTE_AUSENCIA;
}
export function penalidadAusencia(hora?: string | null): number {
  if (!hora) return PESO_AUSENCIA_TEMPRANA;
  const h = parseInt(String(hora).slice(0, 2), 10);
  if (!Number.isFinite(h)) return PESO_AUSENCIA_TEMPRANA;
  if (h >= HORA_CORTE_AUSENCIA) return PESO_AUSENCIA_TARDIA;
  if (h >= HORA_CORTE_TEMPRANA) return PESO_AUSENCIA_TEMPRANA;
  return 0;
}
export function penalidadAusencias(ausencias: any[]): number {
  return r2((ausencias || []).reduce((s, a) => s + penalidadAusencia(a.hora), 0));
}
// Mapa { chofer: penalidadTotal } desde filas de la tabla `ausencias`.
export function penalAusenciasPorChofer(ausencias: any[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const a of ausencias || []) {
    if (!a.chofer) continue;
    m[a.chofer] = r2((m[a.chofer] || 0) + penalidadAusencia(a.hora));
  }
  return m;
}

export type ChoferKpi = {
  chofer: string; total: number; entregados: number; fallos: number;
  demEnCamino: number; demNadie: number; demNoEntregado: number; demCancelado: number; demReprogramado: number;
  neutros: number; excluidos: number;
  conObservacion: number; neutroConObs: number; latestId: any; latestFecha: any;
  reputacion?: number | null; demorados?: number; pctObservacion?: number | null;
  penalAusencias?: number;
  [k: string]: any;
};

// Acumula los registros diarios por chofer (suma entre fechas).
export function acumularPorChofer(registros: any[]): Record<string, ChoferKpi> {
  const porChofer: Record<string, ChoferKpi> = {};
  for (const r of registros || []) {
    const nom = r.chofer;
    if (!nom) continue;
    if (!porChofer[nom]) {
      porChofer[nom] = {
        chofer: nom, total: 0, entregados: 0, fallos: 0,
        demEnCamino: 0, demNadie: 0, demNoEntregado: 0, demCancelado: 0, demReprogramado: 0,
        neutros: 0, excluidos: 0, conObservacion: 0, neutroConObs: 0,
        entregas_post21: 0, dem_con_obs: 0,
        latestId: null, latestFecha: null,
        ...Object.fromEntries(CAMPOS_MANUALES.map((k) => [k, 0])),
      } as ChoferKpi;
    }
    const k = porChofer[nom];
    // Día "obviado" (ML no contó demorados ese día): sumamos entregados/total y
    // los positivos, pero NO las penalizaciones del KPI (demorados y tardías).
    // Espejo del mismo fix en la web (utils/desempeno.js).
    const obv = r.obviar_demorados === true;
    k.total += r.total || 0;
    k.entregados += r.entregados || 0;
    k.fallos += obv ? 0 : (r.fallos || 0);
    k.demEnCamino += obv ? 0 : (r.dem_en_camino || 0);
    k.demNadie += obv ? 0 : (r.dem_nadie || 0);
    k.demNoEntregado += obv ? 0 : (r.dem_no_entregado || 0);
    k.demCancelado += obv ? 0 : (r.dem_cancelado || 0);
    k.demReprogramado += obv ? 0 : (r.dem_reprogramado || 0);
    k.neutros += r.neutros || 0;
    k.excluidos += r.excluidos || 0;
    k.conObservacion += r.con_observacion || 0;
    k.neutroConObs += r.neutro_con_obs || 0;       // pendientes con observación (+0,1)
    k.entregas_post21 += obv ? 0 : (r.entregas_post21 || 0);   // auto desde Light Data
    k.dem_con_obs += obv ? 0 : (r.dem_con_obs || 0);
    for (const c of CAMPOS_MANUALES) k[c] += r[c] || 0;
    if (k.latestId === null) { k.latestId = r.id; k.latestFecha = r.fecha; }
  }
  return porChofer;
}

// Filtra registros de kpis_lightdata al MES calendario actual (por r.fecha,
// formato 'YYYY-MM-DD'). El ranking de la flota se mide por mes: arranca de
// cero cada mes. (Portado de la web, usar en Rendimiento/Ranking.)
export function filtrarMesActual(registros: any[]): any[] {
  const now = new Date();
  const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  return (registros || []).filter((r) => String(r.fecha || '').startsWith(ym));
}

// Filtra por período seleccionable: 'mes' (actual) | 'anterior' | 'todo'.
// (Espejo de filtrarPeriodo de la web — mantener sincronizados.)
export type Periodo = 'mes' | 'anterior' | 'todo';
export function filtrarPeriodo(registros: any[], periodo: Periodo): any[] {
  if (periodo === 'todo') return registros || [];
  const now = new Date();
  const d = periodo === 'anterior' ? new Date(now.getFullYear(), now.getMonth() - 1, 1) : now;
  const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  return (registros || []).filter((r) => String(r.fecha || '').startsWith(ym));
}

// Total de DEMORADOS (umbrella). El parser ya cuenta TODOS los demorados en
// `fallos`; demEnCamino/demNadie son solo el desglose.
export function demoradosTotal(k: ChoferKpi): number {
  return k.fallos || 0;
}

// ── Card 1: RENDIMIENTO (KPI) ──────────────────────────────────────────────
// 100% base. −0,5% "en camino al destinatario" (demGrave). −0,2% resto de
// demorados: nadie/cancelado/reprogramado post-21 (demLeve). Entregas tardías:
// NO penalizan (pedido 2026-07-08; antes −0,05% c/u), solo se informa el total.
// +0,1% por cada PENDIENTE con observación (la obs de un demorado ya NO suma).
// Piso 0%, tope 100%.
export function calcularRendimientoKPI(k: ChoferKpi) {
  const entregados = k.entregados || 0;
  const demorados = demoradosTotal(k);
  const demGrave = k.demEnCamino || 0;                   // "en camino al destinatario" → −0,5%
  const demLeve = Math.max(0, demorados - demGrave);     // nadie/cancelado/reprogramado +21 → −0,2%
  const neutroConObs = k.neutroConObs || 0;              // PENDIENTES con observación → +0,1%
  const entregasPost21 = k.entregas_post21 || 0;         // entregados 21:00–23:05hs → solo informativo

  const pct = (entregados + demorados) > 0
    ? r2(Math.max(0, Math.min(100,
        100
        - demGrave * 0.5
        - demLeve * 0.2
        + neutroConObs * 0.1
      )))
    : null;

  const pctObservacion = k.total > 0 && k.conObservacion > 0
    ? Math.round((k.conObservacion / k.total) * 100) : null;
  return { pct, demorados, demGrave, demLeve, neutroConObs, entregasPost21, pctObservacion, cumpleSLA: cumpleSLA(pct) };
}

// ── Card 2: DESEMPEÑO ──────────────────────────────────────────────────────
// Arranca en 100. Cada positivo +0,1; cada negativo −0,1. Tope 100, piso 0.
// Los avisos restan según su peso individual (0,1 / 0,5 / 2,0).
// Las ausencias restan aparte (k.penalAusencias, ya en puntos %).
export function calcularDesempenoConducta(k: ChoferKpi) {
  const positivos = POSITIVOS.reduce((s, i) => s + (k[i.key] || 0), 0);
  const negativos = NEGATIVOS.reduce((s, i) => s + (k[i.key] || 0), 0);
  const penalAusencias = k.penalAusencias || 0;
  const penalAvisos = r2(AVISOS.reduce((s, a) => s + (k[a.key] || 0) * a.peso, 0));
  const score = r2(Math.max(0, Math.min(100,
    100 + (positivos - negativos) * PESO_PUNTO - penalAusencias - penalAvisos
  )));
  return { score, positivos, negativos, penalAusencias, penalAvisos, cumpleSLA: cumpleSLA(score) };
}

// ── NOTA ÚNICA (modelo v3, 2026-07-16 — espejo de la web) ──────────────────
// Se unificaron el KPI y el Desempeño en UNA sola nota: demorados de Light
// Data + conducta manual + avisos + ausencias impactan el mismo %.
// Base 100, tope 100, piso 0. pct null solo si NO hay ningún dato.
export function calcularNotaUnificada(k: ChoferKpi) {
  const entregados = k.entregados || 0;
  const demorados = demoradosTotal(k);
  const demGrave = k.demEnCamino || 0;                   // "en camino al destinatario" → −0,5%
  const demLeve = Math.max(0, demorados - demGrave);     // nadie/cancelado/reprogramado +21 → −0,2%
  const neutroConObs = k.neutroConObs || 0;              // PENDIENTES con observación → +0,1%
  const entregasPost21 = k.entregas_post21 || 0;         // solo informativo
  const positivos = POSITIVOS.reduce((s, i) => s + (k[i.key] || 0), 0);
  const negativos = NEGATIVOS.reduce((s, i) => s + (k[i.key] || 0), 0);
  const penalAusencias = k.penalAusencias || 0;
  const penalAvisos = r2(AVISOS.reduce((s, a) => s + (k[a.key] || 0) * a.peso, 0));
  const avisosCant = AVISOS.reduce((s, a) => s + (k[a.key] || 0), 0);

  const hayDatos = (entregados + demorados) > 0
    || positivos > 0 || negativos > 0 || avisosCant > 0 || penalAusencias > 0;

  const pct = hayDatos
    ? r2(Math.max(0, Math.min(100,
        100
        - demGrave * 0.5
        - demLeve * 0.2
        + neutroConObs * 0.1
        + positivos * PESO_PUNTO
        - negativos * PESO_PUNTO
        - penalAvisos
        - penalAusencias
      )))
    : null;

  const pctObservacion = k.total > 0 && k.conObservacion > 0
    ? Math.round((k.conObservacion / k.total) * 100) : null;

  return {
    pct, demorados, demGrave, demLeve, neutroConObs, entregasPost21, pctObservacion,
    positivos, negativos, penalAusencias, penalAvisos, avisosCant,
    cumpleSLA: cumpleSLA(pct),
  };
}

// Semáforo de notas (espejo de la web, pedido 2026-07-08):
//   verde ≥ 97% · naranja 90–96.99% · rojo < 90%
export function colorDesempeno(score: number | null): string {
  if (score == null) return '#64748b';
  if (score >= 97) return '#10b981';
  if (score >= 90) return '#f59e0b';
  return '#ef4444';
}

// Color de la CARD del chofer: manda la PEOR de las dos notas.
export function colorCardChofer(kpi: number | null, desempeno: number | null): string {
  const notas = [kpi, desempeno].filter((n): n is number => n != null);
  if (notas.length === 0) return '#64748b';
  return colorDesempeno(Math.min(...notas));
}
