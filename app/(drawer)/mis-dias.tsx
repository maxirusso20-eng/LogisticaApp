// app/(drawer)/mis-dias.tsx
// ─────────────────────────────────────────────────────────────────────────
// "Mi Día a Día" del chofer — el desglose del KPI DÍA POR DÍA, bien
// detallado: una card por fecha con la nota de ESE día y cada envío abierto
// por motivo con su impacto real. Complementa a "Mi Rendimiento" (la nota
// GLOBAL del mes). Misma base (kpis_lightdata), misma fórmula, espejo de la
// pantalla web (PantallaMisDias.jsx).
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import {
  acumularPorChofer, calcularNotaUnificada, colorDesempeno, filtrarPeriodo, fmtPct, type Periodo,
} from '../../lib/desempeno';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const fechaLarga = (iso: string) => {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return iso;
  const s = new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
const fechaCorta = (iso: string) => {
  const [, m, d] = String(iso || '').split('-').map(Number);
  return m && d ? `${d}/${m}` : iso;
};

interface FilaDia {
  label: string; value: number; kpi: string; color: string; icon: string; desc: string;
}

export default function MisDiasScreen() {
  const { colors } = useTheme();
  const [registros, setRegistros] = useState<any[]>([]);
  const [miNombre, setMiNombre] = useState('');
  const [miEmail, setMiEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>('mes');

  const cargar = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const email = (session?.user?.email || '').toLowerCase();
      setMiEmail(email);
      if (email) {
        const { data } = await supabase.from('Choferes').select('nombre').eq('email', email).maybeSingle();
        setMiNombre(data?.nombre || '');
      }
      const { data: kpis } = await supabase.from('kpis_lightdata').select('*').order('fecha', { ascending: false });
      setRegistros(kpis || []);
    } catch (e) {
      console.warn('[mis-dias] error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    let t: ReturnType<typeof setTimeout> | null = null;
    const refrescar = () => { if (t) clearTimeout(t); t = setTimeout(() => cargar(), 1000); };
    const canal = supabase
      .channel('kpis-sync-mis-dias')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kpis_lightdata' }, refrescar)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(canal); };
  }, [cargar]);

  // Mis días: una entrada por fecha, con la nota de ESE día calculada con la
  // MISMA fórmula de siempre (100% base menos descuentos + obs de pendientes).
  const dias = useMemo(() => {
    const nom = miNombre.trim().toLowerCase();
    if (!nom) return [];
    return filtrarPeriodo(registros, periodo)
      .filter((r) => (r.chofer || '').trim().toLowerCase() === nom)
      .map((r) => {
        const acum = acumularPorChofer([r]);
        const k: any = acum[r.chofer] || Object.values(acum)[0];
        // Nota ÚNICA del día (modelo v3): entregas + conducta de ese día.
        const nota = calcularNotaUnificada(k);
        return { fecha: r.fecha as string, k, kpi: nota.pct };
      })
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }, [registros, periodo, miNombre]);

  const conNota = dias.filter((d) => d.kpi != null);
  const mejor = conNota.reduce<typeof dias[number] | null>((mx, d) => (mx == null || (d.kpi as number) > (mx.kpi as number) ? d : mx), null);
  const peor = conNota.reduce<typeof dias[number] | null>((mn, d) => (mn == null || (d.kpi as number) < (mn.kpi as number) ? d : mn), null);

  // Filas del desglose de UN día (idéntico criterio a Mi Rendimiento, por fecha).
  const filasDe = (k: any): FilaDia[] => {
    const otrosDem = Math.max(0, (k.fallos || 0) - (k.demEnCamino || 0) - (k.demNadie || 0) - (k.demNoEntregado || 0) - (k.demCancelado || 0) - (k.demReprogramado || 0));
    const demGrave = k.demEnCamino || 0;
    const demLeve = Math.max(0, (k.fallos || 0) - demGrave);
    const pendConObs = k.neutroConObs || 0;
    const post21 = k.entregas_post21 || 0;
    const kpiTxt = (n: number, tasa: number, signo = '−') => `${signo}${(n * tasa).toFixed(2)}% KPI`;
    return [
      { label: 'Entregados', value: k.entregados || 0, kpi: '', color: colors.green, icon: '✅', desc: 'Llegaron a destino en el día (incluye 2da visita).' },
      { label: 'Entregas tardías (21:00–23:05)', value: post21, kpi: 'no penaliza', color: colors.amber, icon: '🌙', desc: 'Entregados, pero después de las 21hs. Solo informativo: NO bajan tu KPI.' },
      { label: 'Demorados (total)', value: k.fallos || 0, kpi: kpiTxt(1, demGrave * 0.5 + demLeve * 0.2), color: colors.red, icon: '⏱️', desc: 'Los que no se entregaron ese día, abiertos por motivo abajo.' },
      { label: 'En camino al destinatario', value: k.demEnCamino || 0, kpi: kpiTxt(demGrave, 0.5), color: colors.red, icon: '🚚', desc: 'Se quedó en el camión: a fin del día seguía en ruta. −0,5% c/u.' },
      { label: 'Nadie en domicilio +21h', value: k.demNadie || 0, kpi: kpiTxt(k.demNadie || 0, 0.2), color: colors.red, icon: '🚪', desc: 'Tocaste timbre y no había nadie, pasadas las 21hs. −0,2% c/u.' },
      { label: 'Cancelado +21h', value: k.demCancelado || 0, kpi: kpiTxt(k.demCancelado || 0, 0.2), color: colors.red, icon: '🚫', desc: 'Se canceló después de las 21hs, sin llegar a entregarse. −0,2% c/u.' },
      { label: 'Reprogramado +21h', value: k.demReprogramado || 0, kpi: kpiTxt(k.demReprogramado || 0, 0.2), color: colors.red, icon: '🔁', desc: 'Quedó "en camino reprogramado" pasadas las 21hs. −0,2% c/u.' },
      { label: 'No entregado', value: k.demNoEntregado || 0, kpi: kpiTxt(k.demNoEntregado || 0, 0.2), color: colors.red, icon: '📦', desc: 'Marcado "No entregado" en importaciones anteriores. −0,2% c/u.' },
      { label: 'Otros demorados', value: otrosDem, kpi: kpiTxt(otrosDem, 0.2), color: colors.red, icon: '❔', desc: 'De importaciones anteriores al detalle por motivo. −0,2% c/u.' },
      { label: 'Pendientes CON observación', value: pendConObs, kpi: kpiTxt(pendConObs, 0.1, '+'), color: colors.green, icon: '📝', desc: 'Pendientes que documentaste con observación en Light Data: +0,1% c/u.' },
      { label: 'Pendientes', value: k.neutros || 0, kpi: '', color: colors.textMuted, icon: '🔄', desc: 'Todavía podían entregarse (a retirar, nadie antes de 21). No afectan tu KPI.' },
      { label: 'Excluidos', value: k.excluidos || 0, kpi: '', color: colors.textMuted, icon: '⛔', desc: 'Cancelados por ML o el comprador. No es tu responsabilidad.' },
    ].filter((r) => r.label === 'Entregados' || r.value > 0);
  };

  const chipsDe = (k: any) => filasDe(k)
    .filter((r) => r.label !== 'Entregados' && r.label !== 'Demorados (total)')
    .map((r) => `${r.icon} ${r.value}`)
    .join('  ');

  const Header = (
    <View style={styles.header}>
      <View style={[styles.headerIcon, { backgroundColor: colors.blueSubtle }]}>
        <Ionicons name="calendar" size={22} color={colors.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.h1, { color: colors.textPrimary }]}>Mi Día a Día</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>Tu progreso detallado, día por día</Text>
      </View>
    </View>
  );

  const refresh = <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} tintColor={colors.blue} />;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {Header}
        <ActivityIndicator color={colors.blue} style={{ marginTop: 40 }} />
        <Text style={[styles.muted, { color: colors.textMuted }]}>Cargando tus días…</Text>
      </View>
    );
  }

  if (miEmail && !miNombre) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container} refreshControl={refresh}>
        {Header}
        <View style={[styles.emptyCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Ionicons name="alert-circle-outline" size={34} color={colors.amber} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Tu cuenta todavía no está vinculada</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>Pedile a un admin que cargue tu email en tu ficha de chofer.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container} refreshControl={refresh}>
      {Header}

      {/* Selector de período */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        {([{ v: 'mes', l: 'Este mes' }, { v: 'anterior', l: 'Mes pasado' }, { v: 'todo', l: 'Todo' }] as { v: Periodo; l: string }[]).map((o) => {
          const activo = periodo === o.v;
          return (
            <TouchableOpacity key={o.v} onPress={() => setPeriodo(o.v)} activeOpacity={0.8}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', borderWidth: 1, backgroundColor: activo ? colors.blue : colors.bgInput, borderColor: activo ? colors.blue : colors.border }}>
              <Text style={{ fontSize: 12, fontWeight: '800', color: activo ? '#fff' : colors.textMuted }}>{o.l}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {dias.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Ionicons name="bar-chart-outline" size={34} color={colors.textMuted} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Sin días cargados en este período</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>Probá con &quot;Todo&quot;, o esperá el próximo import de estadísticas.</Text>
        </View>
      ) : (
        <>
          {/* Resumen del período */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <View style={[styles.chip, { backgroundColor: colors.blueSubtle, borderColor: colors.blue + '55' }]}>
              <Text style={[styles.chipText, { color: colors.blue }]}>📅 {dias.length} día{dias.length === 1 ? '' : 's'} trabajado{dias.length === 1 ? '' : 's'}</Text>
            </View>
            {mejor && (
              <View style={[styles.chip, { backgroundColor: 'rgba(52,211,153,0.10)', borderColor: 'rgba(52,211,153,0.35)' }]}>
                <Text style={[styles.chipText, { color: colors.green }]}>🏆 Mejor: {fechaCorta(mejor.fecha)} ({fmtPct(mejor.kpi)})</Text>
              </View>
            )}
            {peor && peor.kpi !== mejor?.kpi && (
              <View style={[styles.chip, { backgroundColor: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.35)' }]}>
                <Text style={[styles.chipText, { color: colors.amber }]}>⚠️ A mejorar: {fechaCorta(peor.fecha)} ({fmtPct(peor.kpi)})</Text>
              </View>
            )}
          </View>

          {/* Una card por día, expandible con el desglose completo */}
          {dias.map((d) => {
            const abierto = diaAbierto === d.fecha;
            const col = colorDesempeno(d.kpi);
            const filas = filasDe(d.k);
            return (
              <TouchableOpacity key={d.fecha} activeOpacity={0.85}
                onPress={() => setDiaAbierto(abierto ? null : d.fecha)}
                style={[styles.diaCard, { backgroundColor: colors.bgCard, borderColor: abierto ? col + '66' : colors.border, borderLeftColor: col }]}>
                <View style={styles.diaHeader}>
                  <Text style={[styles.diaFecha, { color: colors.textPrimary }]}>{fechaLarga(d.fecha)}</Text>
                  <View style={[styles.kpiBadge, { backgroundColor: col + '1a', borderColor: col + '44' }]}>
                    <Text style={[styles.kpiBadgeText, { color: col }]}>KPI {fmtPct(d.kpi)}</Text>
                  </View>
                  <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={15} color={colors.textMuted} />
                </View>
                <Text style={[styles.diaSub, { color: colors.textMuted }]}>{d.k.entregados || 0}/{d.k.total || 0} entregados</Text>

                {!abierto && !!chipsDe(d.k) && (
                  <Text style={[styles.diaChips, { color: colors.textSecondary }]}>{chipsDe(d.k)}</Text>
                )}

                {abierto && (
                  <View style={[styles.detalle, { borderTopColor: colors.borderSubtle }]}>
                    <Text style={[styles.detalleTitulo, { color: colors.textMuted }]}>
                      DESGLOSE DE TUS {d.k.total || 0} ENVÍOS DE ESE DÍA
                    </Text>
                    {filas.map((r, i) => (
                      <View key={r.label} style={[styles.fila, i < filas.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle }]}>
                        <Text style={styles.filaIcon}>{r.icon}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.filaLabel, { color: colors.textPrimary }]}>{r.label}</Text>
                          <Text style={[styles.filaDesc, { color: colors.textMuted }]}>{r.desc}</Text>
                        </View>
                        <Text style={[styles.filaValor, { color: r.color }]}>
                          {r.value}{r.kpi ? <Text style={styles.filaKpi}> ({r.kpi})</Text> : null}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          <Text style={[styles.nota, { color: colors.textMuted }]}>
            La nota de cada día arranca en 100% y descuenta por lo de ESE día. Tu nota global (la del SLA) acumula el mes y está en Mi Rendimiento.
          </Text>
        </>
      )}
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  headerIcon: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  sub: { fontSize: 12.5, fontWeight: '500', marginTop: 2 },
  muted: { fontSize: 13, textAlign: 'center', marginTop: 12 },
  emptyCard: { alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, paddingVertical: 36, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 14.5, fontWeight: '700', textAlign: 'center' },
  emptyText: { fontSize: 12.5, fontWeight: '500', textAlign: 'center', lineHeight: 18 },
  chip: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 5 },
  chipText: { fontSize: 11.5, fontWeight: '700' },
  diaCard: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 14, padding: 14, marginBottom: 10 },
  diaHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  diaFecha: { flex: 1, fontSize: 14, fontWeight: '800' },
  kpiBadge: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 },
  kpiBadgeText: { fontSize: 12, fontWeight: '800' },
  diaSub: { fontSize: 11.5, fontWeight: '600', marginTop: 4 },
  diaChips: { fontSize: 12, fontWeight: '600', marginTop: 6 },
  detalle: { marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  detalleTitulo: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6, marginBottom: 4 },
  fila: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 7 },
  filaIcon: { fontSize: 15, lineHeight: 20 },
  filaLabel: { fontSize: 12.5, fontWeight: '700' },
  filaDesc: { fontSize: 10.5, lineHeight: 14, marginTop: 2 },
  filaValor: { fontSize: 13, fontWeight: '800', lineHeight: 20 },
  filaKpi: { fontSize: 11, fontWeight: '700' },
  nota: { fontSize: 11, lineHeight: 16, marginTop: 6 },
});
