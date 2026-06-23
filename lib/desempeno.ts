// lib/desempeno.ts
// ─────────────────────────────────────────────────────────────────────────
// Motor de KPIs del chofer — PORTADO de la web (src/utils/desempeno.js).
// Mantener en sync con la web: si cambia allá, cambiar acá.
//   1) RENDIMIENTO (KPI): viene de Lightdata. Lo afectan los DEMORADOS.
//   2) DESEMPEÑO: se carga a mano. Cada acción ±0,1% sobre 100.
// ─────────────────────────────────────────────────────────────────────────

export const PESO_PUNTO = 0.1;
export const SLA_MINIMO = 99;
export const cumpleSLA = (pct: number | null) => pct != null && pct >= SLA_MINIMO;

const r2 = (n: number) => Math.round(n * 100) / 100;
export const fmtPct = (n: number | null) =>
  n == null || Number.isNaN(n) ? '—' : `${Number(n).toFixed(2)}%`;

type Indicador = { key: string; label: string };

export const POSITIVOS: Indicador[] = [
  { key: 'subir_obs_fotos', label: 'Subir observaciones y fotos a Light Data' },
  { key: 'llego_puntual', label: 'Llegar puntual a la colecta' },
  { key: 'buena_conducta', label: 'Buena conducta' },
  { key: 'salida_puntual', label: 'Salir temprano de la logística' },
  { key: 'aviso_antelacion', label: 'Avisó falta con antelación' },
  { key: 'marca_directos_ok', label: 'Marcar directos como entregado + foto' },
];

export const NEGATIVOS: Indicador[] = [
  { key: 'salteados', label: 'Saltearse paquetes' },
  { key: 'entregas_post21', label: 'Entregas post 21hs' },
  { key: 'llego_tarde', label: 'Llegó tarde a la colecta' },
  { key: 'salio_tarde', label: 'Salió tarde de la logística' },
  { key: 'mala_conducta', label: 'Mala predisposición' },
  { key: 'aviso_falta_tarde', label: 'Avisó falta / no colectar post 12hs' },
  { key: 'no_marca_directos', label: 'No marcar envíos directos en Light Data' },
  { key: 'mala_comunicacion', label: 'Mala comunicación nocturna' },
  { key: 'no_escanea_logistica', label: 'No escanearse los paquetes en la Logística' },
  { key: 'no_escanea_colecta', label: 'No escanear con Flex en la colecta' },
];

export const CAMPOS_MANUALES = [...POSITIVOS.map((i) => i.key), ...NEGATIVOS.map((i) => i.key)];

export const HORA_CORTE_AUSENCIA = 12;
export const PESO_AUSENCIA_TEMPRANA = 0.1;
export const PESO_AUSENCIA_TARDIA = 0.5;

export function esAusenciaTardia(hora?: string | null): boolean {
  if (!hora) return false;
  const h = parseInt(String(hora).slice(0, 2), 10);
  return Number.isFinite(h) && h >= HORA_CORTE_AUSENCIA;
}
export function penalidadAusencia(hora?: string | null): number {
  return esAusenciaTardia(hora) ? PESO_AUSENCIA_TARDIA : PESO_AUSENCIA_TEMPRANA;
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
  demEnCamino: number; demNadie: number; neutros: number; excluidos: number;
  conObservacion: number; latestId: any; latestFecha: any;
  reputacion?: number | null; demorados?: number; pctObservacion?: number | null;
  penalAusencias?: number;
  [k: string]: any;
};

export function acumularPorChofer(registros: any[]): Record<string, ChoferKpi> {
  const porChofer: Record<string, ChoferKpi> = {};
  for (const r of registros || []) {
    const nom = r.chofer;
    if (!nom) continue;
    if (!porChofer[nom]) {
      porChofer[nom] = {
        chofer: nom, total: 0, entregados: 0, fallos: 0,
        demEnCamino: 0, demNadie: 0, neutros: 0, excluidos: 0, conObservacion: 0,
        latestId: null, latestFecha: null,
        ...Object.fromEntries(CAMPOS_MANUALES.map((k) => [k, 0])),
      } as ChoferKpi;
    }
    const k = porChofer[nom];
    k.total += r.total || 0;
    k.entregados += r.entregados || 0;
    k.fallos += r.fallos || 0;
    k.demEnCamino += r.dem_en_camino || 0;
    k.demNadie += r.dem_nadie || 0;
    k.neutros += r.neutros || 0;
    k.excluidos += r.excluidos || 0;
    k.conObservacion += r.con_observacion || 0;
    for (const c of CAMPOS_MANUALES) k[c] += r[c] || 0;
    if (k.latestId === null) { k.latestId = r.id; k.latestFecha = r.fecha; }
  }
  return porChofer;
}

export function demoradosTotal(k: ChoferKpi): number {
  return k.fallos || 0;
}

export function calcularRendimientoKPI(k: ChoferKpi) {
  const entregados = k.entregados || 0;
  const demorados = demoradosTotal(k);
  const base = entregados + demorados;
  const pct = base > 0 ? r2((entregados / base) * 100) : null;
  const pctObservacion = k.total > 0 && k.conObservacion > 0
    ? Math.round((k.conObservacion / k.total) * 100) : null;
  return { pct, demorados, pctObservacion, cumpleSLA: cumpleSLA(pct) };
}

export function calcularDesempenoConducta(k: ChoferKpi) {
  const positivos = POSITIVOS.reduce((s, i) => s + (k[i.key] || 0), 0);
  const negativos = NEGATIVOS.reduce((s, i) => s + (k[i.key] || 0), 0);
  const penalAusencias = k.penalAusencias || 0;
  const score = r2(Math.max(0, Math.min(100, 100 + (positivos - negativos) * PESO_PUNTO - penalAusencias)));
  return { score, positivos, negativos, penalAusencias, cumpleSLA: cumpleSLA(score) };
}

export function colorDesempeno(score: number | null): string {
  if (score == null) return '#64748b';
  if (score >= SLA_MINIMO) return '#10b981';
  if (score >= 95) return '#f59e0b';
  if (score >= 85) return '#f97316';
  return '#ef4444';
}
