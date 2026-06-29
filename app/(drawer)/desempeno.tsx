// app/(drawer)/desempeno.tsx
// ─────────────────────────────────────────────────────────────────────────
// Desempeño (admin) — carga la conducta diaria de cada chofer (los indicadores
// +/- que alimentan el "desempeño"). Réplica nativa de PantallaDesempeno de la
// web. Elegís chofer + fecha, ajustás los contadores y guardás (upsert por
// fecha+chofer en kpis_lightdata, sin pisar los datos de Lightdata).
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { CAMPOS_MANUALES, NEGATIVOS } from '../../lib/desempeno';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

const hoyLocal = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD local
const ceros = (): Record<string, number> => Object.fromEntries(CAMPOS_MANUALES.map((k) => [k, 0]));
const sumarDias = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString('sv-SE');
};
const fmtFecha = (iso: string) => {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' });
};

export default function DesempenoScreen() {
  const { colors } = useTheme();
  const [choferes, setChoferes] = useState<string[]>([]);
  const [registros, setRegistros] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [choferSel, setChoferSel] = useState('');
  const [fecha, setFecha] = useState(hoyLocal());
  const [valores, setValores] = useState<Record<string, number>>(ceros());
  const [guardando, setGuardando] = useState(false);
  const [guardadoOk, setGuardadoOk] = useState(false);
  const [picker, setPicker] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data } = await supabase.from('kpis_lightdata').select('*').order('fecha', { ascending: false });
      setRegistros(data || []);
      const { data: ch } = await supabase.from('Choferes').select('nombre').order('nombre');
      setChoferes((ch || []).map((c: any) => c.nombre).filter(Boolean));
    } catch (e) {
      console.warn('[desempeno] error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Al cambiar chofer/fecha, precargar los valores existentes de esa fila.
  useEffect(() => {
    if (!choferSel) { setValores(ceros()); return; }
    const row = registros.find((r) => r.chofer === choferSel && r.fecha === fecha);
    setValores(Object.fromEntries(CAMPOS_MANUALES.map((k) => [k, row?.[k] ?? 0])));
    setGuardadoOk(false);
  }, [choferSel, fecha, registros]);

  const setVal = (k: string, delta: number) =>
    setValores((prev) => ({ ...prev, [k]: Math.max(0, (prev[k] || 0) + delta) }));

  const guardar = async () => {
    if (!choferSel) { Alert.alert('Elegí un chofer', 'Primero seleccioná un chofer.'); return; }
    setGuardando(true);
    const payload = { fecha, chofer: choferSel, ...valores, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('kpis_lightdata').upsert(payload, { onConflict: 'fecha,chofer' });
    setGuardando(false);
    if (error) { Alert.alert('Error al guardar', error.message); return; }
    setGuardadoOk(true);
    cargar();
  };

  const totalNegativos = useMemo(() => NEGATIVOS.reduce((s, i) => s + (valores[i.key] || 0), 0), [valores]);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.blue} /></View>;
  }

  const Fila = ({ k, label, positivo }: { k: string; label: string; positivo: boolean }) => (
    <View style={[styles.fila, { borderColor: colors.borderSubtle }]}>
      <Text style={{ flex: 1, fontSize: 12.5, color: colors.textSecondary }}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity onPress={() => setVal(k, -1)} style={[styles.stepBtn, { backgroundColor: colors.bgInput }]}>
          <Ionicons name="remove" size={16} color={colors.textMuted} />
        </TouchableOpacity>
        <Text style={[styles.stepVal, { color: (valores[k] || 0) > 0 ? (positivo ? colors.green : colors.red) : colors.textMuted }]}>
          {valores[k] || 0}
        </Text>
        <TouchableOpacity onPress={() => setVal(k, 1)} style={[styles.stepBtn, { backgroundColor: positivo ? colors.green + '22' : colors.red + '22' }]}>
          <Ionicons name="add" size={16} color={positivo ? colors.green : colors.red} />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.purple + '22' }]}>
          <Ionicons name="speedometer" size={22} color={colors.purple} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: colors.textPrimary }]}>Desempeño</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>Cargá la conducta del día por chofer</Text>
        </View>
      </View>

      {/* Chofer + fecha */}
      <TouchableOpacity onPress={() => setPicker(true)} activeOpacity={0.7}
        style={[styles.selector, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Ionicons name="person-outline" size={18} color={colors.blue} />
        <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: choferSel ? colors.textPrimary : colors.textMuted }}>
          {choferSel || 'Elegí un chofer'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={colors.textMuted} />
      </TouchableOpacity>

      <View style={[styles.selector, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => setFecha((f) => sumarDias(f, -1))} style={styles.dateNav}><Ionicons name="chevron-back" size={18} color={colors.blue} /></TouchableOpacity>
        <Ionicons name="calendar-outline" size={16} color={colors.textMuted} />
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>
          {fmtFecha(fecha)}{fecha === hoyLocal() ? ' · hoy' : ''}
        </Text>
        <TouchableOpacity disabled={fecha >= hoyLocal()} onPress={() => setFecha((f) => sumarDias(f, 1))} style={styles.dateNav}>
          <Ionicons name="chevron-forward" size={18} color={fecha >= hoyLocal() ? colors.textPlaceholder : colors.blue} />
        </TouchableOpacity>
      </View>

      {choferSel ? (
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={styles.secHead}>
            <Ionicons name="trending-down" size={15} color={colors.red} />
            <Text style={{ fontSize: 12.5, fontWeight: '800', color: colors.red }}>Errores ({totalNegativos})</Text>
          </View>
          {NEGATIVOS.map((i) => <Fila key={i.key} k={i.key} label={i.label} positivo={false} />)}

          <TouchableOpacity onPress={guardar} disabled={guardando} activeOpacity={0.85}
            style={[styles.saveBtn, { backgroundColor: guardadoOk ? colors.green : colors.blue }]}>
            <Ionicons name={guardadoOk ? 'checkmark' : 'save-outline'} size={17} color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>
              {guardando ? 'Guardando…' : guardadoOk ? 'Guardado ✓' : 'Guardar indicadores del día'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, alignItems: 'center', paddingVertical: 36 }]}>
          <Ionicons name="person-add-outline" size={32} color={colors.textMuted} style={{ marginBottom: 10 }} />
          <Text style={{ color: colors.textMuted, fontSize: 13.5 }}>Elegí un chofer para cargar su conducta.</Text>
        </View>
      )}

      <View style={{ height: 30 }} />

      {/* Modal: elegir chofer */}
      <Modal visible={picker} transparent animationType="slide" onRequestClose={() => setPicker(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.bgModal }]}>
            <View style={styles.modalHead}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>Elegí un chofer</Text>
              <TouchableOpacity onPress={() => setPicker(false)}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <FlatList
              data={choferes}
              keyExtractor={(n) => n}
              style={{ maxHeight: 420 }}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => { setChoferSel(item); setPicker(false); }} style={[styles.choferRow, { borderColor: colors.border }]}>
                  <Ionicons name={choferSel === item ? 'checkmark-circle' : 'person-outline'} size={18} color={choferSel === item ? colors.green : colors.textMuted} />
                  <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: choferSel === item ? '800' : '600' }}>{item}</Text>
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 16 },
  headerIcon: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2 },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 13, borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  dateNav: { padding: 4 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginTop: 4 },
  secHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  stepVal: { minWidth: 22, textAlign: 'center', fontSize: 15, fontWeight: '800', fontVariant: ['tabular-nums'] },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 18, paddingVertical: 13, borderRadius: 12 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 34 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  choferRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, borderBottomWidth: 1 },
});
