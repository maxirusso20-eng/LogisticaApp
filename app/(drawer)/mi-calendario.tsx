// app/(drawer)/mi-calendario.tsx
// ─────────────────────────────────────────────────────────────────────────
// "Mi Calendario" del chofer — espejo de la web. Los días de trabajo que la
// logística le asignó (semititulares/suplentes) en calendario_dias.
// Muestra esta semana y la que viene; realtime + recarga al enfocar.
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const DIAS_LABEL = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const iso = (d: Date) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
};
const lunesDe = (base: Date) => {
  const d = new Date(base);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};
const fmtCorta = (isoStr: string) => { const [, m, d] = String(isoStr).split('-').map(Number); return `${d}/${String(m).padStart(2, '0')}`; };
const nombreDia = (isoStr: string) => {
  const [y, m, d] = String(isoStr).split('-').map(Number);
  return DIAS_LABEL[(new Date(y, m - 1, d).getDay() + 6) % 7];
};

const ACENTO = '#8b5cf6';

export default function MiCalendarioScreen() {
  const { colors } = useTheme();
  const [dias, setDias] = useState<any[]>([]);
  const [miNombre, setMiNombre] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const lunesEsta = useMemo(() => iso(lunesDe(new Date())), []);
  const finProxima = useMemo(() => { const d = lunesDe(new Date()); d.setDate(d.getDate() + 13); return iso(d); }, []);
  const lunesProxima = useMemo(() => { const d = lunesDe(new Date()); d.setDate(d.getDate() + 7); return iso(d); }, []);

  const cargar = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const email = (session?.user?.email || '').toLowerCase();
      let nombre = '';
      if (email) {
        const { data } = await supabase.from('Choferes').select('nombre').eq('email', email).maybeSingle();
        nombre = (data?.nombre || '').trim();
      }
      setMiNombre(nombre);
      if (!nombre) { setDias([]); return; }
      const { data: rows } = await supabase.from('calendario_dias')
        .select('*')
        .eq('chofer', nombre)
        .gte('fecha', lunesEsta)
        .lte('fecha', finProxima)
        .order('fecha');
      setDias(rows || []);
    } catch (e) {
      console.warn('[mi-calendario] error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [lunesEsta, finProxima]);

  // Recarga al enfocar (mismo patrón que Rendimiento) + realtime.
  useFocusEffect(useCallback(() => { cargar(); }, [cargar]));
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    const refrescar = () => { if (t) clearTimeout(t); t = setTimeout(() => cargar(), 600); };
    const canal = supabase.channel('calendario-sync-chofer')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calendario_dias' }, refrescar)
      .subscribe();
    return () => { if (t) clearTimeout(t); supabase.removeChannel(canal); };
  }, [cargar]);

  const hoyIso = iso(new Date());
  const estaSemana = dias.filter(d => d.fecha < lunesProxima);
  const proxSemana = dias.filter(d => d.fecha >= lunesProxima);

  const Bloque = ({ titulo, lista }: { titulo: string; lista: any[] }) => (
    <View style={{ marginBottom: 18 }}>
      <Text style={[styles.tituloBloque, { color: colors.textSecondary }]}>{titulo}</Text>
      {lista.length === 0 ? (
        <View style={[styles.vacio, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          <Text style={{ fontSize: 13, color: colors.textMuted }}>Sin días asignados.</Text>
        </View>
      ) : lista.map(d => {
        const esHoy = d.fecha === hoyIso;
        const pasado = d.fecha < hoyIso;
        return (
          <View key={d.id} style={[styles.diaCard, {
            backgroundColor: colors.bgCard,
            borderColor: esHoy ? ACENTO : colors.borderSubtle,
            borderLeftColor: esHoy ? ACENTO : pasado ? colors.borderSubtle : colors.green,
            opacity: pasado && !esHoy ? 0.55 : 1,
          }]}>
            <Ionicons name="calendar-outline" size={20} color={esHoy ? ACENTO : colors.green} />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary }}>
                {nombreDia(d.fecha)} {fmtCorta(d.fecha)}
              </Text>
              <Text style={{ fontSize: 11.5, color: colors.textMuted }}>
                {pasado && !esHoy ? 'Ya pasó' : esHoy ? '¡Es hoy!' : 'Te toca trabajar'}
              </Text>
            </View>
            {esHoy && (
              <View style={[styles.badgeHoy, { backgroundColor: `${ACENTO}22`, borderColor: `${ACENTO}55` }]}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: ACENTO }}>HOY</Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={ACENTO} size="large" />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} tintColor={ACENTO} />}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: ACENTO }]}>
          <Ionicons name="calendar" size={22} color="#fff" />
        </View>
        <View>
          <Text style={{ fontSize: 21, fontWeight: '800', color: colors.textPrimary }}>Mi Calendario</Text>
          <Text style={{ fontSize: 12.5, color: colors.textSecondary }}>Tus días de trabajo asignados</Text>
        </View>
      </View>

      {!miNombre ? (
        <View style={[styles.vacio, { backgroundColor: colors.bgCard, borderColor: colors.borderSubtle }]}>
          <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: 'center' }}>
            Tu cuenta no está vinculada a una ficha de chofer.
          </Text>
        </View>
      ) : (
        <>
          {/* Llamadas como función (no <Bloque/>): definido dentro del render,
              JSX lo remontaría en cada render. */}
          {Bloque({ titulo: 'ESTA SEMANA', lista: estaSemana })}
          {Bloque({ titulo: 'SEMANA QUE VIENE', lista: proxSemana })}
          <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>
            El calendario lo arma la logística y se actualiza solo. Ante cualquier duda, escribinos por el chat.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  headerIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tituloBloque: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.5, marginBottom: 8 },
  vacio: { padding: 16, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed' },
  diaCard: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 13, borderWidth: 1, borderLeftWidth: 4, marginBottom: 8 },
  badgeHoy: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 99, borderWidth: 1 },
});
