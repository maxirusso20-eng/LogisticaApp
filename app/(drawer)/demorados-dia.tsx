// app/(drawer)/demorados-dia.tsx
// ─────────────────────────────────────────────────────────────────────────
// "Demorados por día" (admin) — réplica nativa de PantallaDemoradosDia de la
// web. Responde "¿cuántos demorados hubo tal día y POR QUÉ?": gráfico diario
// de barras + una tarjeta por fecha con el desglose por motivo (la suma de
// los motivos SIEMPRE cierra con el total; lo sin subtipo va como "sin
// detalle") y el detalle por chofer. Lee kpis_lightdata como la web.
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

// Motivos de demorado (mismo orden y textos que la web).
const MOTIVOS = [
  { campo: 'enCamino', icon: '🚚', label: 'en camino al destinatario' },
  { campo: 'nadie', icon: '🚪', label: 'nadie en domicilio +21h' },
  { campo: 'cancelado', icon: '🚫', label: 'cancelado +21h' },
  { campo: 'reprogramado', icon: '🔁', label: 'reprogramado +21h' },
  { campo: 'noEntregado', icon: '📦', label: 'no entregado (regla vieja)' },
  { campo: 'otros', icon: '❔', label: 'sin detalle (import viejo)' },
] as const;

type Dia = {
  fecha: string; total: number; entregados: number; demorados: number;
  enCamino: number; nadie: number; cancelado: number; reprogramado: number;
  noEntregado: number; otros: number;
  choferes: { chofer: string; fallos: number; enCamino: number; nadie: number; cancelado: number; reprogramado: number; noEntregado: number; otros: number }[];
};

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

export default function DemoradosDiaScreen() {
  const { colors } = useTheme();
  const [registros, setRegistros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [diaAbierto, setDiaAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const { data } = await supabase.from('kpis_lightdata').select('*').order('fecha', { ascending: false });
      setRegistros(data || []);
    } catch (e) {
      console.warn('[demorados-dia] error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Agrupa por FECHA: totales del día + desglose por motivo + detalle por
  // chofer. "otros" = residuo sin subtipo (datos viejos) → todo justificado.
  const dias = useMemo<Dia[]>(() => {
    const porDia: Record<string, Dia> = {};
    for (const r of registros) {
      const f = r.fecha;
      if (!f) continue;
      if (!porDia[f]) {
        porDia[f] = {
          fecha: f, total: 0, entregados: 0, demorados: 0,
          enCamino: 0, nadie: 0, cancelado: 0, reprogramado: 0, noEntregado: 0, otros: 0,
          choferes: [],
        };
      }
      const d = porDia[f];
      const fallos = r.fallos || 0;
      d.total += r.total || 0;
      d.entregados += r.entregados || 0;
      d.demorados += fallos;
      d.enCamino += r.dem_en_camino || 0;
      d.nadie += r.dem_nadie || 0;
      d.cancelado += r.dem_cancelado || 0;
      d.reprogramado += r.dem_reprogramado || 0;
      d.noEntregado += r.dem_no_entregado || 0;
      if (fallos > 0) {
        const subt = (r.dem_en_camino || 0) + (r.dem_nadie || 0) + (r.dem_cancelado || 0) + (r.dem_reprogramado || 0) + (r.dem_no_entregado || 0);
        d.choferes.push({
          chofer: r.chofer, fallos,
          enCamino: r.dem_en_camino || 0, nadie: r.dem_nadie || 0,
          cancelado: r.dem_cancelado || 0, reprogramado: r.dem_reprogramado || 0,
          noEntregado: r.dem_no_entregado || 0,
          otros: Math.max(0, fallos - subt),
        });
      }
    }
    return Object.values(porDia)
      .map((d) => ({
        ...d,
        otros: Math.max(0, d.demorados - d.enCamino - d.nadie - d.cancelado - d.reprogramado - d.noEntregado),
        choferes: d.choferes.sort((a, b) => b.fallos - a.fallos),
      }))
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }, [registros]);

  // Barras: últimos 14 días con datos, en orden cronológico.
  const chartData = useMemo(() => dias.slice(0, 14).reverse(), [dias]);
  const maxDia = useMemo(() => Math.max(1, ...chartData.map((d) => d.demorados)), [chartData]);
  const totalPeriodo = useMemo(() => dias.reduce((s, d) => s + d.demorados, 0), [dias]);
  const peorDia = useMemo(() => dias.reduce<Dia | null>((mx, d) => (d.demorados > (mx?.demorados || 0) ? d : mx), null), [dias]);

  const refresh = <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} tintColor={colors.textMuted} />;

  const Chips = ({ obj, size = 12 }: { obj: any; size?: number }) => (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
      {MOTIVOS.filter((m) => (obj[m.campo] || 0) > 0).map((m) => (
        <Text key={m.campo} style={{ fontSize: size, color: colors.textMuted }}>
          {m.icon} {obj[m.campo]} {m.label}
        </Text>
      ))}
    </View>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator color={colors.red} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingTop: 18 }} refreshControl={refresh}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.red + '22' }]}>
          <Ionicons name="calendar-outline" size={22} color={colors.red} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: colors.textPrimary }]}>Demorados por día</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>Cuántos hubo cada día, por qué motivo y de qué choferes</Text>
        </View>
      </View>

      {dias.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>Sin datos de Light Data cargados todavía.</Text>
        </View>
      ) : (
        <>
          {/* Resumen */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            <View style={[styles.pill, { backgroundColor: colors.red + '18', borderColor: colors.red + '44' }]}>
              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.red }}>⏱️ {totalPeriodo} demorados en {dias.length} día{dias.length === 1 ? '' : 's'}</Text>
            </View>
            {peorDia && (
              <View style={[styles.pill, { backgroundColor: colors.amber + '18', borderColor: colors.amber + '44' }]}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: colors.amber }}>⚠️ Peor día: {fechaCorta(peorDia.fecha)} ({peorDia.demorados})</Text>
              </View>
            )}
          </View>

          {/* Gráfico de barras (Views, sin dependencias) */}
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary, marginBottom: 12 }}>
              Demorados por día (últimos {chartData.length} días con datos)
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5, height: 150 }}>
              {chartData.map((d) => (
                <TouchableOpacity key={d.fecha} activeOpacity={0.7} onPress={() => setDiaAbierto(diaAbierto === d.fecha ? null : d.fecha)} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
                  <Text style={{ fontSize: 9.5, fontWeight: '800', color: colors.textMuted, marginBottom: 2 }}>{d.demorados}</Text>
                  <View style={{
                    width: '78%', minHeight: d.demorados > 0 ? 4 : 2, borderRadius: 4,
                    height: `${Math.max(d.demorados > 0 ? 5 : 1, (d.demorados / maxDia) * 78)}%`,
                    backgroundColor: d.demorados > 0 ? colors.red : colors.border,
                  }} />
                  <Text style={{ fontSize: 8.5, color: colors.textMuted, marginTop: 4 }}>{fechaCorta(d.fecha)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Una tarjeta por día, expandible con el detalle por chofer */}
          {dias.map((d) => {
            const abierto = diaAbierto === d.fecha;
            const pctDia = d.total > 0 ? Math.round((d.demorados / d.total) * 100) : 0;
            const col = d.demorados > 0 ? colors.red : colors.green;
            return (
              <TouchableOpacity key={d.fecha} activeOpacity={0.8} onPress={() => setDiaAbierto(abierto ? null : d.fecha)}
                style={[styles.diaCard, { backgroundColor: colors.bgCard, borderColor: abierto ? colors.red + '66' : colors.border, borderLeftColor: col }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ flex: 1, minWidth: 150, fontSize: 13.5, fontWeight: '800', color: colors.textPrimary }}>{fechaLarga(d.fecha)}</Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>{d.entregados}/{d.total} entreg.</Text>
                  <View style={[styles.pill, { backgroundColor: col + '18', borderColor: col + '44' }]}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: col }}>
                      {d.demorados} demorado{d.demorados === 1 ? '' : 's'}{d.demorados > 0 ? ` · ${pctDia}%` : ''}
                    </Text>
                  </View>
                  <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={14} color={colors.textMuted} />
                </View>

                {d.demorados > 0 && <Chips obj={d} />}

                {abierto && d.choferes.length > 0 && (
                  <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderSubtle }}>
                    <Text style={{ fontSize: 10, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 }}>
                      Por chofer — {d.choferes.length} con demorados ese día
                    </Text>
                    {d.choferes.map((ch, i) => (
                      <View key={ch.chofer} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6, borderBottomWidth: i < d.choferes.length - 1 ? 1 : 0, borderBottomColor: colors.borderSubtle }}>
                        <Ionicons name="car-outline" size={13} color={colors.textMuted} style={{ marginTop: 2 }} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.textPrimary }}>{ch.chofer}</Text>
                          <Chips obj={ch} size={11} />
                        </View>
                        <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.red }}>{ch.fallos}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {abierto && d.choferes.length === 0 && (
                  <Text style={{ marginTop: 8, fontSize: 12, color: colors.textMuted }}>Sin demorados ese día 🎉</Text>
                )}
              </TouchableOpacity>
            );
          })}

          <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 10, lineHeight: 16 }}>
            ❔ "Sin detalle" = demorados de días importados antes del desglose por motivo. 📦 "No entregado" hoy no penaliza el KPI (solo aparece en datos viejos).
          </Text>
        </>
      )}

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 16 },
  headerIcon: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2 },
  empty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 14, padding: 30, alignItems: 'center' },
  pill: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99, borderWidth: 1 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 12 },
  diaCard: { borderWidth: 1, borderLeftWidth: 4, borderRadius: 14, padding: 13, marginBottom: 9 },
});
