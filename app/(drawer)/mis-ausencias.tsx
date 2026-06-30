// app/(drawer)/mis-ausencias.tsx
// ─────────────────────────────────────────────────────────────────────────
// "Mis Ausencias" del chofer (solo lectura) — réplica de PantallaMisAusencias
// de la web. Ve SOLO sus ausencias y el impacto en su Desempeño (−0,1% antes
// del mediodía, −0,5% desde el mediodía). Tabla `ausencias`.
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  AVISOS, HORA_CORTE_AUSENCIA, HORA_CORTE_TEMPRANA, penalidadAusencia, penalidadAusencias,
} from '../../lib/desempeno';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useRoleGuard } from '../_hooks/useRoleGuard';

const fmtHora = (h?: string | null) => (h ? String(h).slice(0, 5) : '—');
const fmtFecha = (f?: string | null) => {
  if (!f) return '—';
  const [y, m, d] = String(f).split('-');
  return d && m && y ? `${d}/${m}/${y}` : f;
};

export default function MisAusenciasScreen() {
  const { colors } = useTheme();
  const { autorizado, verificando } = useRoleGuard('chofer');
  const [ausencias, setAusencias] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any[]>([]);
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
      if (nombre) {
        const { data } = await supabase.from('ausencias').select('*').eq('chofer', nombre)
          .order('fecha', { ascending: false }).order('hora', { ascending: false });
        setAusencias(data || []);
        const { data: k } = await supabase.from('kpis_lightdata').select('*').eq('chofer', nombre).order('fecha', { ascending: false });
        setKpis(k || []);
      } else {
        setAusencias([]); setKpis([]);
      }
    } catch (e) {
      console.warn('[mis-ausencias] error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    const canal = supabase.channel('mis-ausencias-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ausencias' }, () => cargar())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kpis_lightdata' }, () => cargar())
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [cargar]);

  const totalPenal = useMemo(() => penalidadAusencias(ausencias), [ausencias]);

  // Avisos del chofer (desde kpis_lightdata: cada columna de aviso con count > 0).
  const avisosChofer = useMemo(() => {
    const out: { fecha: string; label: string; count: number; impacto: number }[] = [];
    for (const row of kpis) {
      for (const a of AVISOS) {
        const count = row[a.key] || 0;
        if (count > 0) out.push({ fecha: row.fecha, label: a.label, count, impacto: Math.round(count * a.peso * 100) / 100 });
      }
    }
    return out.sort((x, y) => String(y.fecha || '').localeCompare(String(x.fecha || '')));
  }, [kpis]);
  const totalAvisos = useMemo(() => Math.round(avisosChofer.reduce((s, a) => s + a.impacto, 0) * 100) / 100, [avisosChofer]);
  const totalImpacto = Math.round((totalPenal + totalAvisos) * 100) / 100;

  const Header = (
    <View style={styles.header}>
      <View style={[styles.headerIcon, { backgroundColor: colors.red + '22' }]}>
        <Ionicons name="calendar-clear" size={22} color={colors.red} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.h1, { color: colors.textPrimary }]}>Mis Faltas</Text>
        <Text style={[styles.sub, { color: colors.textMuted }]}>Avisos y ausencias: cuando no venís a un recorrido o colecta</Text>
      </View>
    </View>
  );

  const refresh = <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} tintColor={colors.blue} />;

  if (verificando || loading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.blue} /></View>;
  }
  if (!autorizado) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (miEmail && !miNombre) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container} refreshControl={refresh}>
        {Header}
        <View style={[styles.empty, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Ionicons name="alert-circle-outline" size={36} color={colors.amber} style={{ marginBottom: 12 }} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Tu cuenta todavía no está vinculada</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>El email {miEmail} no está en ninguna ficha de chofer. Pedile a un admin que lo cargue.</Text>
        </View>
      </ScrollView>
    );
  }

  if (ausencias.length === 0 && avisosChofer.length === 0) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container} refreshControl={refresh}>
        {Header}
        <View style={[styles.empty, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Ionicons name="checkmark-circle-outline" size={40} color={colors.green} style={{ marginBottom: 12 }} />
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>¡Sin faltas! 🎉</Text>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>No te bajaste de ninguna colecta ni recorrido. Seguí así.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container} refreshControl={refresh}>
      {Header}

      {/* Resumen */}
      <View style={[styles.resumen, { backgroundColor: colors.bgCard, borderColor: colors.red + '55' }]}>
        <View>
          <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: '600' }}>Faltas (avisos y ausencias)</Text>
          <Text style={{ fontSize: 28, fontWeight: '900', color: colors.textPrimary }}>{ausencias.length + avisosChofer.length}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: '600' }}>Impacto en tu Desempeño</Text>
          <Text style={{ fontSize: 28, fontWeight: '900', color: colors.red }}>−{totalImpacto}%</Text>
        </View>
      </View>

      {/* Explicación */}
      <View style={[styles.info, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
        <Text style={{ fontSize: 12.5, color: colors.textMuted, lineHeight: 19 }}>
          Bajarte antes de las <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>{HORA_CORTE_TEMPRANA}:00</Text> no resta nada; de{' '}
          <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>{HORA_CORTE_TEMPRANA}:00 a {HORA_CORTE_AUSENCIA - 1}:59</Text> resta{' '}
          <Text style={{ color: colors.amber, fontWeight: '800' }}>0,1%</Text>; desde las{' '}
          <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>{HORA_CORTE_AUSENCIA}:00</Text> resta{' '}
          <Text style={{ color: colors.red, fontWeight: '800' }}>0,5%</Text> (avisar tarde desorganiza más la logística).
        </Text>
      </View>

      {/* Lista */}
      <View style={{ gap: 10 }}>
        {ausencias.map((a) => {
          const penal = penalidadAusencia(a.hora);
          const col = penal === 0 ? colors.green : penal >= 0.5 ? colors.red : colors.amber;
          return (
            <View key={a.id} style={[styles.item, { backgroundColor: colors.bgCard, borderColor: colors.border, borderLeftColor: col, borderLeftWidth: 3 }]}>
              <View style={[styles.itemIcon, { backgroundColor: col + '1a' }]}>
                <Ionicons name={a.tipo === 'recorrido' ? 'bus-outline' : 'cube-outline'} size={18} color={col} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textPrimary, textTransform: 'capitalize' }}>{a.tipo}</Text>
                <Text style={{ fontSize: 12.5, color: colors.textMuted }}>
                  {fmtFecha(a.fecha)} · {fmtHora(a.hora)}{a.detalle ? ` · ${a.detalle}` : ''}
                </Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: '900', color: col }}>−{penal}%</Text>
            </View>
          );
        })}
      </View>

      {/* Avisos (no recorrido / no colecta) — cargados en Desempeño */}
      {avisosChofer.length > 0 && (
        <View style={{ gap: 10, marginTop: 18 }}>
          <Text style={{ fontSize: 12, fontWeight: '800', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>Avisos</Text>
          {avisosChofer.map((a, idx) => (
            <View key={idx} style={[styles.item, { backgroundColor: colors.bgCard, borderColor: colors.border, borderLeftColor: colors.amber, borderLeftWidth: 3 }]}>
              <View style={[styles.itemIcon, { backgroundColor: colors.amber + '1a' }]}>
                <Ionicons name="notifications-off-outline" size={18} color={colors.amber} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.textPrimary }}>{a.label}{a.count > 1 ? ` ×${a.count}` : ''}</Text>
                <Text style={{ fontSize: 12.5, color: colors.textMuted }}>{fmtFecha(a.fecha)}</Text>
              </View>
              <Text style={{ fontSize: 15, fontWeight: '900', color: colors.red }}>−{a.impacto}%</Text>
            </View>
          ))}
        </View>
      )}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingTop: 18 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 18 },
  headerIcon: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2 },
  resumen: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderTopWidth: 3, borderTopColor: '#ef4444', borderRadius: 18, padding: 18, marginBottom: 16 },
  info: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  itemIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  empty: { borderWidth: 1, borderRadius: 16, alignItems: 'center', paddingVertical: 44, paddingHorizontal: 20 },
  emptyTitle: { fontSize: 16, fontWeight: '800', marginBottom: 6, textAlign: 'center' },
  emptyText: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
