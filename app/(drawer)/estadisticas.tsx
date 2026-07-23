// app/(drawer)/estadisticas.tsx
// ─────────────────────────────────────────────────────────────────────────
// Estadísticas (admin) — réplica nativa de PantallaEstadisticas de la web.
// Totales del equipo + lista de choferes con su reputación/desempeño,
// tappable para ver el desglose. Lee kpis_lightdata + ausencias con el motor
// lib/desempeno.ts. (La importación de Lightdata y "limpiar" quedan en la web.)
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import {
  acumularPorChofer, calcularNotaUnificada,
  type ChoferKpi, colorDesempeno, fmtPct, penalAusenciasPorChofer,
} from '../../lib/desempeno';
import { fetchTodo } from '../../lib/fetchTodo';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useRoleGuard } from '../_hooks/useRoleGuard';

export default function EstadisticasScreen() {
  const { colors } = useTheme();
  const { autorizado, verificando } = useRoleGuard('admin');
  const [registros, setRegistros] = useState<any[]>([]);
  const [ausencias, setAusencias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const data = await fetchTodo((d, h) => supabase.from('kpis_lightdata').select('*').order('fecha', { ascending: false }).range(d, h));
      setRegistros(data || []);
      const { data: aus } = await supabase.from('ausencias').select('*');
      setAusencias(aus || []);
    } catch (e) {
      console.warn('[estadisticas] error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    // Realtime (igual que la web): recargar con debounce cuando cambian los
    // KPIs o las ausencias — antes solo refrescaba al abrir o con pull-to-refresh.
    let t: ReturnType<typeof setTimeout> | null = null;
    const refrescar = () => { if (t) clearTimeout(t); t = setTimeout(() => cargar(), 1000); };
    const canal = supabase
      .channel('kpis-sync-estadisticas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kpis_lightdata' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ausencias' }, refrescar)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(canal); };
  }, [cargar]);

  const kpis = useMemo(() => {
    const porChofer = acumularPorChofer(registros);
    const penalMap = penalAusenciasPorChofer(ausencias);
    return Object.values(porChofer)
      .map((k): ChoferKpi => {
        // NOTA ÚNICA (modelo v3): demorados + conducta + avisos + ausencias.
        const penalAusencias = penalMap[k.chofer] || 0;
        const nota = calcularNotaUnificada({ ...k, penalAusencias });
        return { ...k, penalAusencias, reputacion: nota.pct, demorados: nota.demorados, pctObservacion: nota.pctObservacion };
      })
      .sort((a, b) => {
        if (a.reputacion === null && b.reputacion === null) return b.total - a.total;
        if (a.reputacion == null) return 1;
        if (b.reputacion == null) return -1;
        if (a.reputacion !== b.reputacion) return (b.reputacion || 0) - (a.reputacion || 0);
        return b.total - a.total;
      });
  }, [registros, ausencias]);

  const totales = useMemo(() => {
    let enCamino = 0, nadie = 0, entregados = 0, total = 0;
    for (const k of kpis) { enCamino += k.demEnCamino; nadie += k.demNadie; entregados += k.entregados; total += k.total; }
    return { demorados: enCamino + nadie, enCamino, nadie, entregados, total };
  }, [kpis]);

  const Header = (
    <View style={styles.header}>
      <View style={[styles.headerIcon, { backgroundColor: colors.purple + '22' }]}>
        <Ionicons name="bar-chart" size={22} color={colors.purple} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.h1, { color: colors.textPrimary }]}>Estadísticas</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>Rendimiento del equipo (Lightdata)</Text>
      </View>
    </View>
  );

  const refresh = <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} tintColor={colors.blue} />;

  if (verificando || !autorizado) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
        {Header}
        <ActivityIndicator color={colors.blue} style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingTop: 18 }} refreshControl={refresh}>
      {Header}

      {/* Totales del equipo */}
      <View style={styles.metricRow}>
        <Metric colors={colors} label="Choferes" value={kpis.length} color={colors.blue} />
        <Metric colors={colors} label="Entregados" value={totales.entregados} color={colors.green} />
      </View>
      <View style={styles.metricRow}>
        <Metric colors={colors} label="Demorados" value={totales.demorados} color={colors.red} />
        <Metric colors={colors} label="Total envíos" value={totales.total} color={colors.textSecondary} />
      </View>

      {/* Alerta de demorados */}
      {totales.demorados > 0 && (
        <View style={[styles.alert, { backgroundColor: colors.red + '14', borderColor: colors.red + '4D' }]}>
          <Text style={{ fontSize: 13.5, fontWeight: '800', color: colors.red, marginBottom: 4 }}>
            ⚠️ {totales.demorados} envíos demorados / con problema
          </Text>
          <Text style={{ fontSize: 12, color: colors.textMuted }}>
            {totales.enCamino} en camino · {totales.nadie} &quot;nadie en domicilio&quot; +21hs
          </Text>
        </View>
      )}

      {kpis.length === 0 ? (
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, alignItems: 'center', paddingVertical: 40 }]}>
          <Ionicons name="layers-outline" size={34} color={colors.textMuted} style={{ marginBottom: 10 }} />
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '700', marginBottom: 4 }}>Todavía no hay datos</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center' }}>Importá un Excel de Lightdata desde la web para ver los KPIs.</Text>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          {kpis.map((k, i) => {
            const rc = colorDesempeno(k.reputacion ?? null);
            const medalla = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}°`;
            const abierto = expandido === k.chofer;
            const pct = (n: number) => (k.total > 0 ? Math.round((n / k.total) * 100) : 0);
            const rows = [
              { label: 'Entregados', value: k.entregados, pct: pct(k.entregados), color: colors.green, show: true },
              { label: 'Fallos', value: k.fallos, pct: pct(k.fallos), color: colors.red, show: k.fallos > 0 },
              { label: 'En camino', value: k.demEnCamino, pct: pct(k.demEnCamino), color: '#f87171', show: k.demEnCamino > 0 },
              { label: 'Nadie +21h', value: k.demNadie, pct: pct(k.demNadie), color: '#f87171', show: k.demNadie > 0 },
              { label: 'En proceso', value: k.neutros, pct: pct(k.neutros), color: colors.textMuted, show: k.neutros > 0 },
              { label: 'Excluidos', value: k.excluidos, pct: pct(k.excluidos), color: colors.textMuted, show: k.excluidos > 0 },
            ].filter((r) => r.show);
            return (
              <View key={k.chofer}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setExpandido(abierto ? null : k.chofer)}
                  style={[styles.row, { backgroundColor: colors.bgInput, borderColor: abierto ? rc + '66' : 'transparent' }]}
                >
                  <Text style={[styles.medal, { color: i < 3 ? colors.textPrimary : colors.textMuted, fontSize: i < 3 ? 17 : 13 }]}>{medalla}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: '700', color: colors.textPrimary }}>{k.chofer}</Text>
                    <Text numberOfLines={1} style={{ fontSize: 11.5, color: colors.textMuted }}>
                      {k.entregados}/{k.total} entregados{k.fallos > 0 ? ` · ${k.fallos} fallos` : ''}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 15, fontWeight: '900', color: rc }}>{fmtPct(k.reputacion ?? null)}</Text>
                    <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textMuted }}>Nota única</Text>
                  </View>
                  <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} style={{ marginLeft: 4 }} />
                </TouchableOpacity>

                {abierto && (
                  <View style={[styles.detail, { borderColor: colors.border }]}>
                    {rows.map((r) => (
                      <View key={r.label} style={{ marginBottom: 8 }}>
                        <View style={styles.rowBetween}>
                          <Text style={{ fontSize: 11.5, color: colors.textMuted }}>{r.label}</Text>
                          <Text style={{ fontSize: 11.5, fontWeight: '700', color: r.color }}>{r.value} ({r.pct}%)</Text>
                        </View>
                        <View style={{ height: 4, backgroundColor: colors.border, borderRadius: 99, overflow: 'hidden', marginTop: 3 }}>
                          <View style={{ width: `${r.pct}%`, height: '100%', backgroundColor: r.color }} />
                        </View>
                      </View>
                    ))}
                    {(k.fallos || 0) > 0 && (
                      <Text style={{ fontSize: 11.5, color: colors.purple, fontWeight: '700', marginTop: 2 }}>
                        📝 Demorados con obs {k.dem_con_obs || 0}/{k.fallos} ({Math.round(((k.dem_con_obs || 0) / k.fallos) * 100)}%)
                      </Text>
                    )}
                    {(k.penalAusencias || 0) > 0 && (
                      <Text style={{ fontSize: 11.5, color: colors.red, fontWeight: '700', marginTop: 4 }}>
                        🚫 Ausencias −{k.penalAusencias}%
                      </Text>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

function Metric({ colors, label, value, color }: any) {
  return (
    <View style={[styles.metric, { backgroundColor: colors.bgInput }]}>
      <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '600' }}>{label}</Text>
      <Text style={{ fontSize: 24, fontWeight: '900', color, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 16 },
  headerIcon: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2 },
  metricRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  metric: { flex: 1, borderRadius: 12, padding: 14 },
  alert: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16, marginTop: 4 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, marginBottom: 6 },
  medal: { width: 28, textAlign: 'center', fontWeight: '800' },
  detail: { borderTopWidth: 1, paddingTop: 10, paddingHorizontal: 12, paddingBottom: 12, marginTop: -2, marginBottom: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
