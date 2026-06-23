// app/(drawer)/rendimiento.tsx
// ─────────────────────────────────────────────────────────────────────────
// "Mi Rendimiento" del chofer — réplica nativa de la pantalla de la web.
// El chofer ve SOLO sus KPIs (reputación), su puesto en el ranking de la
// flota, su desempeño (conducta) y el desglose de envíos. Lee kpis_lightdata
// + ausencias (la misma base que la web) y usa el motor lib/desempeno.ts.
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import {
  acumularPorChofer, calcularDesempenoConducta, calcularRendimientoKPI,
  colorDesempeno, cumpleSLA, fmtPct, NEGATIVOS, penalidadAusencias, POSITIVOS, SLA_MINIMO,
} from '../../lib/desempeno';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

export default function RendimientoScreen() {
  const { colors, isDark } = useTheme();
  const [registros, setRegistros] = useState<any[]>([]);
  const [ausencias, setAusencias] = useState<any[]>([]);
  const [miNombre, setMiNombre] = useState('');
  const [miEmail, setMiEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const email = (session?.user?.email || '').toLowerCase();
      setMiEmail(email);
      let nombre = '';
      if (email) {
        const { data } = await supabase.from('Choferes').select('nombre').eq('email', email).maybeSingle();
        nombre = data?.nombre || '';
      }
      setMiNombre(nombre);
      const { data: kpis } = await supabase.from('kpis_lightdata').select('*').order('fecha', { ascending: false });
      setRegistros(kpis || []);
      const { data: aus } = await supabase.from('ausencias').select('*');
      setAusencias(aus || []);
    } catch (e) {
      console.warn('[rendimiento] error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Ranking de la flota (mismo orden que la web → el puesto coincide).
  const ranking = useMemo(() => {
    const porChofer = acumularPorChofer(registros);
    return Object.values(porChofer)
      .map((k) => {
        const kpi = calcularRendimientoKPI(k);
        return { ...k, reputacion: kpi.pct, demorados: kpi.demorados, pctObservacion: kpi.pctObservacion };
      })
      .sort((a, b) => {
        if (a.reputacion === null && b.reputacion === null) return b.total - a.total;
        if (a.reputacion === null) return 1;
        if (b.reputacion === null) return -1;
        if (a.reputacion !== b.reputacion) return (b.reputacion || 0) - (a.reputacion || 0);
        return b.total - a.total;
      });
  }, [registros]);

  const totalFlota = ranking.length;
  const miIndex = useMemo(
    () => ranking.findIndex((k) => (k.chofer || '').trim().toLowerCase() === miNombre.trim().toLowerCase()),
    [ranking, miNombre]
  );
  const yo = miIndex >= 0 ? ranking[miIndex] : null;
  const puesto = miIndex >= 0 ? miIndex + 1 : null;

  const nombreMostrar = miNombre || (miEmail ? miEmail.split('@')[0] : 'Chofer');

  const Header = (
    <View style={styles.header}>
      <View style={[styles.headerIcon, { backgroundColor: colors.blueSubtle }]}>
        <Ionicons name="stats-chart" size={22} color={colors.blue} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.h1, { color: colors.textPrimary }]}>Mi Rendimiento</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>
          Hola, <Text style={{ fontWeight: '700', color: colors.textSecondary }}>{nombreMostrar}</Text> — acá ves tus estadísticas
        </Text>
      </View>
    </View>
  );

  const refresh = <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} tintColor={colors.blue} />;

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        {Header}
        <ActivityIndicator color={colors.blue} style={{ marginTop: 40 }} />
        <Text style={[styles.muted, { color: colors.textMuted }]}>Cargando tus datos…</Text>
      </View>
    );
  }

  // Sin ficha vinculada
  if (miEmail && !miNombre) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container} refreshControl={refresh}>
        {Header}
        <EmptyCard colors={colors} icon="alert-circle-outline" title="Tu cuenta todavía no está vinculada"
          text={`El email ${miEmail} no está en ninguna ficha de chofer. Pedile a un admin que lo cargue en "Email de acceso".`} />
      </ScrollView>
    );
  }
  // Vinculado pero sin KPIs
  if (!yo) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container} refreshControl={refresh}>
        {Header}
        <EmptyCard colors={colors} icon="bar-chart-outline" title="Todavía no hay datos tuyos"
          text="Cuando se carguen las estadísticas de Lightdata vas a ver tu rendimiento acá." />
      </ScrollView>
    );
  }

  const rep = yo.reputacion as number | null;
  const barColor = colorDesempeno(rep);

  const misAusencias = ausencias.filter((a) => (a.chofer || '').trim().toLowerCase() === miNombre.trim().toLowerCase());
  const penalAus = penalidadAusencias(misAusencias);
  const desemp = calcularDesempenoConducta({ ...yo, penalAusencias: penalAus });
  const desempCol = colorDesempeno(desemp.score);
  const desempPos = POSITIVOS.filter((i) => (yo[i.key] || 0) > 0);
  const desempNeg = NEGATIVOS.filter((i) => (yo[i.key] || 0) > 0);
  const hayDesemp = desempPos.length > 0 || desempNeg.length > 0 || misAusencias.length > 0;

  const pct = (n: number) => (yo.total > 0 ? (n / yo.total) * 100 : 0);
  const verdict = rep == null ? null
    : rep === 100 ? { icon: '⭐', text: '¡Perfecto! Seguí así', color: colors.green }
    : rep >= 95 ? { icon: '✅', text: 'Excelente trabajo', color: colors.green }
    : rep >= 80 ? { icon: '🟡', text: 'Bien, con algunos inconvenientes', color: colors.amber }
    : { icon: '⚠️', text: 'Hay que mejorar', color: colors.red };
  const podio = puesto === 1 ? '🥇 1er lugar' : puesto === 2 ? '🥈 2do lugar' : puesto === 3 ? '🥉 3er lugar' : `📊 Puesto ${puesto}°`;

  const rows = [
    { label: 'Entregados', value: yo.entregados, pct: pct(yo.entregados), color: colors.green, icon: '✅', show: true },
    { label: 'Demorados', value: yo.demorados || 0, pct: pct(yo.demorados || 0), color: colors.red, icon: '❌', show: (yo.demorados || 0) > 0 },
    { label: 'Pendientes', value: yo.neutros, pct: pct(yo.neutros), color: colors.textMuted, icon: '🔄', show: yo.neutros > 0 },
    { label: 'Excluidos', value: yo.excluidos, pct: pct(yo.excluidos), color: colors.textMuted, icon: '⛔', show: yo.excluidos > 0 },
  ].filter((r) => r.show);

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container} refreshControl={refresh}>
      {Header}

      {/* HERO: reputación + puesto */}
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: barColor + '55', borderTopColor: barColor, borderTopWidth: 3 }]}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1 }}>
            <View style={[styles.pill, { backgroundColor: barColor + '1f', borderColor: barColor + '55' }]}>
              <Text style={[styles.pillText, { color: barColor }]}>{podio} de {totalFlota}</Text>
            </View>
            <Text style={[styles.choferName, { color: colors.textPrimary }]}>{yo.chofer}</Text>
            {verdict && (
              <View style={[styles.pill, { backgroundColor: verdict.color + '18', borderColor: verdict.color + '44', marginTop: 8 }]}>
                <Text style={[styles.pillText, { color: verdict.color }]}>{verdict.icon} {verdict.text}</Text>
              </View>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.bigPct, { color: barColor }]}>{fmtPct(rep)}</Text>
            <Text style={[styles.smallMuted, { color: colors.textMuted }]}>Rendimiento (KPIs)</Text>
            <Text style={[styles.slaText, { color: cumpleSLA(rep) ? colors.green : colors.red }]}>
              {cumpleSLA(rep) ? '✓ Cumple SLA' : `✗ Bajo SLA (${SLA_MINIMO}%)`}
            </Text>
          </View>
        </View>
        <Bar pct={rep || 0} color={barColor} track={colors.border} />
        <View style={styles.statsRow}>
          <Text style={[styles.stat, { color: colors.green }]}>{yo.entregados}/{yo.total} entregados</Text>
          {(yo.demorados || 0) > 0 && <Text style={[styles.stat, { color: colors.red }]}>{yo.demorados} demorados</Text>}
          {yo.neutros > 0 && <Text style={[styles.stat, { color: colors.textMuted }]}>{yo.neutros} pendientes</Text>}
        </View>
      </View>

      {/* DESEMPEÑO (conducta) */}
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: desempCol + '55', borderTopColor: desempCol, borderTopWidth: 3 }]}>
        <View style={styles.rowBetween}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
            <Ionicons name="speedometer-outline" size={18} color={desempCol} />
            <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Desempeño</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.bigPct, { color: desempCol }]}>{fmtPct(desemp.score)}</Text>
            <Text style={[styles.smallMuted, { color: colors.textMuted }]}>Conducta y operativa</Text>
            <Text style={[styles.slaText, { color: cumpleSLA(desemp.score) ? colors.green : colors.red }]}>
              {cumpleSLA(desemp.score) ? '✓ Cumple SLA' : `✗ Bajo SLA (${SLA_MINIMO}%)`}
            </Text>
          </View>
        </View>
        <Bar pct={desemp.score} color={desempCol} track={colors.border} />
        {hayDesemp ? (
          <View style={styles.tagsWrap}>
            {desempPos.map((i) => (
              <View key={i.key} style={[styles.tag, { backgroundColor: colors.green + '18', borderColor: colors.green + '44' }]}>
                <Text style={[styles.tagText, { color: colors.green }]}>✓ {i.label} ({yo[i.key]})</Text>
              </View>
            ))}
            {desempNeg.map((i) => (
              <View key={i.key} style={[styles.tag, { backgroundColor: colors.red + '18', borderColor: colors.red + '44' }]}>
                <Text style={[styles.tagText, { color: colors.red }]}>✗ {i.label} ({yo[i.key]})</Text>
              </View>
            ))}
            {misAusencias.length > 0 && (
              <View style={[styles.tag, { backgroundColor: colors.red + '18', borderColor: colors.red + '44' }]}>
                <Text style={[styles.tagText, { color: colors.red }]}>🚫 Ausencias ({misAusencias.length}) −{penalAus}%</Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={[styles.muted, { color: colors.textMuted, marginTop: 4 }]}>Todavía no hay indicadores de desempeño cargados para vos.</Text>
        )}
      </View>

      {/* DESGLOSE */}
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Ionicons name="cube-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.cardTitle, { color: colors.textPrimary, fontSize: 14 }]}>Desglose de tus {yo.total} envíos</Text>
        </View>
        {rows.map((r) => (
          <View key={r.label} style={{ marginBottom: 12 }}>
            <View style={styles.rowBetween}>
              <Text style={[styles.smallMuted, { color: colors.textMuted }]}>{r.icon} {r.label}</Text>
              <Text style={{ fontSize: 13, fontWeight: '800', color: r.color }}>{r.value} ({fmtPct(r.pct)})</Text>
            </View>
            <Bar pct={r.pct} color={r.color} track={colors.border} thin />
          </View>
        ))}
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function Bar({ pct, color, track, thin }: { pct: number; color: string; track: string; thin?: boolean }) {
  return (
    <View style={{ height: thin ? 6 : 10, backgroundColor: track, borderRadius: 99, overflow: 'hidden', marginTop: thin ? 5 : 16, marginBottom: thin ? 0 : 12 }}>
      <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', backgroundColor: color, borderRadius: 99 }} />
    </View>
  );
}

function EmptyCard({ colors, icon, title, text }: any) {
  return (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, alignItems: 'center', paddingVertical: 40 }]}>
      <Ionicons name={icon} size={36} color={colors.amber} style={{ marginBottom: 12 }} />
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary, marginBottom: 6, textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 18 },
  headerIcon: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2 },
  muted: { fontSize: 13, textAlign: 'center', marginTop: 12 },
  card: { borderWidth: 1, borderRadius: 18, padding: 18, marginBottom: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  pill: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 },
  pillText: { fontSize: 12, fontWeight: '800' },
  choferName: { fontSize: 20, fontWeight: '800', marginTop: 10 },
  bigPct: { fontSize: 36, fontWeight: '900', lineHeight: 40 },
  smallMuted: { fontSize: 11, fontWeight: '600', marginTop: 2 },
  slaText: { fontSize: 11, fontWeight: '800', marginTop: 4 },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  stat: { fontSize: 13.5, fontWeight: '700' },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { borderWidth: 1, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 5 },
  tagText: { fontSize: 12, fontWeight: '700' },
});
