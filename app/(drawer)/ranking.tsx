// app/(drawer)/ranking.tsx
// ─────────────────────────────────────────────────────────────────────────
// Ranking de la flota — réplica nativa de la web (PantallaRanking).
// Lista de choferes de mejor a peor rendimiento. El chofer ve su fila
// resaltada ("vos"). Lee kpis_lightdata con el motor lib/desempeno.ts.
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import {
  acumularPorChofer, calcularNotaUnificada,
  type ChoferKpi, colorDesempeno, demoradosTotal, fmtPct, penalAusenciasPorChofer,
} from '../../lib/desempeno';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useRoleGuard } from '../_hooks/useRoleGuard';

export default function RankingScreen() {
  const { colors } = useTheme();
  const { autorizado, verificando } = useRoleGuard('admin');
  const [registros, setRegistros] = useState<any[]>([]);
  const [ausencias, setAusencias] = useState<any[]>([]);
  const [miNombre, setMiNombre] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const email = (session?.user?.email || '').toLowerCase();
      if (email) {
        const { data } = await supabase.from('Choferes').select('nombre').eq('email', email).maybeSingle();
        setMiNombre((data?.nombre || '').trim().toLowerCase());
      }
      const [{ data: kpis }, { data: aus }] = await Promise.all([
        supabase.from('kpis_lightdata').select('*').order('fecha', { ascending: false }),
        supabase.from('ausencias').select('*'),
      ]);
      setRegistros(kpis || []);
      setAusencias(aus || []);
    } catch (e) {
      console.warn('[ranking] error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Recarga cada vez que la pantalla toma foco (montaje inicial incluido). Antes
  // corría UNA sola vez al montar y, si salía antes de que la sesión estuviera
  // lista, el ranking quedaba vacío hasta cambiar de apartado. Ver rendimiento.tsx.
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));

  useEffect(() => {
    // Realtime (igual que la web): recargar con debounce cuando cambian los KPIs.
    let t: ReturnType<typeof setTimeout> | null = null;
    const refrescar = () => { if (t) clearTimeout(t); t = setTimeout(() => cargar(), 1000); };
    const canal = supabase
      .channel('kpis-sync-ranking')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kpis_lightdata' }, refrescar)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ausencias' }, refrescar)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(canal); };
  }, [cargar]);

  // MISMA base que Estadísticas: TODO lo cargado (sin filtro de mes; con el
  // filtro mensual quedaba vacío al arrancar el mes). El puesto premia
  // VOLUMEN con CALIDAD (igual que la web):
  //   tasa de éxito = entregados / (entregados + demorados)
  //   puntaje       = entregados × tasa de éxito
  const ranking = useMemo(() => {
    const porChofer = acumularPorChofer(registros);
    const penalMap = penalAusenciasPorChofer(ausencias);
    return Object.values(porChofer)
      .map((k): ChoferKpi => {
        // NOTA ÚNICA (modelo v3): demorados + conducta + avisos + ausencias.
        const nota = calcularNotaUnificada({ ...k, penalAusencias: penalMap[k.chofer] || 0 });
        const base = (k.entregados || 0) + (k.fallos || 0);
        const tasa = base > 0 ? (k.entregados || 0) / base : 0;
        return { ...k, reputacion: nota.pct, tasa, puntaje: (k.entregados || 0) * tasa };
      })
      .sort((a, b) => ((b.puntaje || 0) - (a.puntaje || 0)) || (b.entregados - a.entregados));
  }, [registros, ausencias]);

  const miIndex = ranking.findIndex((k) => (k.chofer || '').trim().toLowerCase() === miNombre);

  // Ranking de DEMORADOS (de más a menos) con el POR QUÉ (motivo por motivo,
  // la suma cierra con el total). Igual que la web: sin filtro de mes.
  const rankingDemorados = useMemo(() => {
    const porChofer = acumularPorChofer(registros);
    return Object.values(porChofer)
      .map((k) => {
        const fallos = k.fallos || 0;
        const enCamino = k.demEnCamino || 0, nadie = k.demNadie || 0,
          cancelado = k.demCancelado || 0, reprogramado = k.demReprogramado || 0,
          noEntregado = k.demNoEntregado || 0;
        return {
          chofer: k.chofer,
          demorados: demoradosTotal(k),
          enCamino, nadie, cancelado, reprogramado, noEntregado,
          otros: Math.max(0, fallos - enCamino - nadie - cancelado - reprogramado - noEntregado),
          total: k.total || 0,
        };
      })
      .filter((k) => k.demorados > 0)
      .sort((a, b) => b.demorados - a.demorados);
  }, [registros]);

  const Header = (
    <View style={styles.header}>
      <View style={[styles.headerIcon, { backgroundColor: colors.amber + '22' }]}>
        <Ionicons name="trophy" size={22} color={colors.amber} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.h1, { color: colors.textPrimary }]}>Ranking de la flota</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>Los que más entregan con mayor tasa de éxito</Text>
      </View>
    </View>
  );

  const refresh = (
    <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} tintColor={colors.blue} />
  );

  if (verificando || !autorizado) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (loading) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.bg, padding: 16 }]}>
        {Header}
        <ActivityIndicator color={colors.blue} style={{ marginTop: 40 }} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingTop: 18 }} refreshControl={refresh}>
      {Header}

      {ranking.length === 0 ? (
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, alignItems: 'center', paddingVertical: 40 }]}>
          <Ionicons name="bar-chart-outline" size={34} color={colors.textMuted} style={{ marginBottom: 10 }} />
          <Text style={{ color: colors.textMuted, fontSize: 14 }}>Todavía no hay datos cargados.</Text>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Ionicons name="trophy-outline" size={16} color={colors.amber} />
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>{ranking.length} choferes</Text>
          </View>

          {ranking.map((k, i) => {
            const soyYo = i === miIndex;
            const rc = colorDesempeno(k.reputacion ?? null);
            const medalla = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}°`;
            return (
              <View
                key={k.chofer}
                style={[
                  styles.row,
                  { backgroundColor: soyYo ? rc + '14' : colors.bgInput, borderColor: soyYo ? rc + '66' : 'transparent' },
                ]}
              >
                <Text style={[styles.medal, { color: i < 3 ? colors.textPrimary : colors.textMuted, fontSize: i < 3 ? 17 : 13 }]}>
                  {medalla}
                </Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: soyYo ? '800' : '700', color: colors.textPrimary }}>
                    {k.chofer}{soyYo ? <Text style={{ color: rc, fontWeight: '800' }}> · vos</Text> : ''}
                  </Text>
                  <Text numberOfLines={1} style={{ fontSize: 11.5, color: colors.textMuted }}>
                    {k.total} paq. · Nota <Text style={{ color: rc, fontWeight: '700' }}>{fmtPct(k.reputacion ?? null)}</Text>{k.fallos > 0 ? ` · ${k.fallos} dem.` : ''}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 17, fontWeight: '900', color: colors.green }}>{k.entregados}</Text>
                  <Text style={{ fontSize: 9.5, fontWeight: '700', color: colors.textMuted }}>entreg. · {Math.round((k.tasa || 0) * 100)}% éxito</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Ranking de DEMORADOS ── */}
      {rankingDemorados.length > 0 && (
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Ionicons name="time-outline" size={16} color="#F59E0B" />
            <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>Ranking de demorados</Text>
          </View>
          <Text style={{ fontSize: 11.5, color: colors.textMuted, marginBottom: 14 }}>Quién acumula más demorados y por qué</Text>

          {rankingDemorados.map((k, i) => {
            const soyYo = (k.chofer || '').trim().toLowerCase() === miNombre;
            const peor = rankingDemorados[0].demorados || 1;
            const ratio = k.demorados / peor;
            const col = ratio >= 0.66 ? '#EF4444' : ratio >= 0.33 ? '#F59E0B' : '#F97316';
            return (
              <View
                key={k.chofer}
                style={[styles.row, { backgroundColor: soyYo ? col + '14' : colors.bgInput, borderColor: soyYo ? col + '66' : 'transparent', borderLeftColor: col, borderLeftWidth: 3 }]}
              >
                <Text style={[styles.medal, { color: i === 0 ? '#EF4444' : colors.textMuted, fontSize: 14 }]}>{i + 1}°</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: soyYo ? '800' : '700', color: colors.textPrimary }}>
                    {k.chofer}{soyYo ? <Text style={{ color: col, fontWeight: '800' }}> · vos</Text> : ''}
                  </Text>
                  {/* El POR QUÉ: motivo por motivo (la suma cierra con el total) */}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 }}>
                    {k.enCamino > 0 && <Text style={{ fontSize: 11, color: colors.textMuted }}>🚚 {k.enCamino} en camino</Text>}
                    {k.nadie > 0 && <Text style={{ fontSize: 11, color: colors.textMuted }}>🚪 {k.nadie} nadie +21hs</Text>}
                    {k.cancelado > 0 && <Text style={{ fontSize: 11, color: colors.textMuted }}>🚫 {k.cancelado} cancelado +21hs</Text>}
                    {k.reprogramado > 0 && <Text style={{ fontSize: 11, color: colors.textMuted }}>🔁 {k.reprogramado} reprogramado +21hs</Text>}
                    {k.noEntregado > 0 && <Text style={{ fontSize: 11, color: colors.textMuted }}>📦 {k.noEntregado} no entregado (viejo)</Text>}
                    {k.otros > 0 && <Text style={{ fontSize: 11, color: colors.textMuted }}>❔ {k.otros} sin detalle</Text>}
                    <Text style={{ fontSize: 11, color: colors.textMuted, opacity: 0.7 }}>de {k.total} paq.</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 18, fontWeight: '900', color: col }}>{k.demorados}</Text>
                  <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textMuted }}>demorados</Text>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 18 },
  headerIcon: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1.5, marginBottom: 6 },
  medal: { width: 30, textAlign: 'center', fontWeight: '800' },
});
