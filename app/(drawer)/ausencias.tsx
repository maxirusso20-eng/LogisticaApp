// app/(drawer)/ausencias.tsx
// ─────────────────────────────────────────────────────────────────────────
// Ausencias (admin) — registrar cuando un chofer se baja de una colecta/
// recorrido. Penaliza el desempeño según la hora (antes del mediodía −0,1%,
// desde el mediodía −0,5%). Réplica nativa de PantallaAusencias de la web.
// Tabla `ausencias` (chofer, fecha, hora, tipo, detalle, creado_por).
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { penalidadAusencia } from '../../lib/desempeno';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { conLock } from '../../lib/lockAsync';

const hoyLocal = () => new Date().toLocaleDateString('sv-SE');
const pad = (n: number) => String(n).padStart(2, '0');
const sumarDias = (iso: string, n: number) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); };
const fmtFecha = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };

export default function AusenciasScreen() {
  const { colors } = useTheme();
  const [choferes, setChoferes] = useState<string[]>([]);
  const [ausencias, setAusencias] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [picker, setPicker] = useState(false);

  const [choferSel, setChoferSel] = useState('');
  const [fecha, setFecha] = useState(hoyLocal());
  const [hh, setHh] = useState(new Date().getHours());
  const [mm, setMm] = useState(Math.floor(new Date().getMinutes() / 5) * 5);
  const [tipo, setTipo] = useState<'colecta' | 'recorrido'>('colecta');
  const [detalle, setDetalle] = useState('');

  const hora = `${pad(hh)}:${pad(mm)}`;
  const penal = useMemo(() => penalidadAusencia(hora), [hora]);

  const cargar = useCallback(async () => {
    try {
      const { data } = await supabase.from('ausencias').select('*').order('fecha', { ascending: false }).order('hora', { ascending: false }).limit(60);
      setAusencias(data || []);
      const { data: ch } = await supabase.from('Choferes').select('nombre').order('nombre');
      setChoferes((ch || []).map((c: any) => c.nombre).filter(Boolean));
    } catch (e) { console.warn('[ausencias] error', e); } finally { setLoading(false); }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async () => conLock('ausencia-guardar', async () => {
    if (!choferSel) { Alert.alert('Elegí un chofer', 'Primero seleccioná un chofer.'); return; }
    setGuardando(true);
    const { data: { session } } = await supabase.auth.getSession();
    const payload = { chofer: choferSel, fecha, hora, tipo, detalle: detalle.trim() || null, creado_por: session?.user?.email?.toLowerCase() || null };
    const { error } = await supabase.from('ausencias').insert(payload);
    setGuardando(false);
    if (error) { Alert.alert('Error al guardar', error.message); return; }
    setDetalle('');
    cargar();
    Alert.alert('✅ Registrada', `Ausencia de ${choferSel} (−${penal}%)`);
  });

  const borrar = (a: any) => {
    Alert.alert('Eliminar ausencia', `¿Borrar la ausencia de ${a.chofer} del ${fmtFecha(a.fecha)}?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('ausencias').delete().eq('id', a.id);
        if (error) Alert.alert('Error', error.message); else cargar();
      } },
    ]);
  };

  const step = (set: (f: (v: number) => number) => void, delta: number, max: number) =>
    set((v) => (v + delta + max) % max);

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.blue} /></View>;
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.red + '22' }]}><Ionicons name="calendar-clear" size={22} color={colors.red} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: colors.textPrimary }]}>Ausencias</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>Cuando un chofer se baja. Penaliza el desempeño.</Text>
        </View>
      </View>

      {/* Form */}
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <TouchableOpacity onPress={() => setPicker(true)} style={[styles.sel, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
          <Ionicons name="person-outline" size={17} color={colors.blue} />
          <Text style={{ flex: 1, fontSize: 14, fontWeight: '700', color: choferSel ? colors.textPrimary : colors.textMuted }}>{choferSel || 'Elegí un chofer'}</Text>
          <Ionicons name="chevron-down" size={17} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Fecha */}
        <View style={[styles.sel, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
          <TouchableOpacity onPress={() => setFecha((f) => sumarDias(f, -1))}><Ionicons name="chevron-back" size={18} color={colors.blue} /></TouchableOpacity>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: colors.textPrimary }}>{fmtFecha(fecha)}{fecha === hoyLocal() ? ' · hoy' : ''}</Text>
          <TouchableOpacity disabled={fecha >= hoyLocal()} onPress={() => setFecha((f) => sumarDias(f, 1))}><Ionicons name="chevron-forward" size={18} color={fecha >= hoyLocal() ? colors.textPlaceholder : colors.blue} /></TouchableOpacity>
        </View>

        {/* Hora */}
        <View style={styles.horaRow}>
          <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '700' }}>HORA</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Stepper colors={colors} value={pad(hh)} onMinus={() => step(setHh, -1, 24)} onPlus={() => step(setHh, 1, 24)} />
            <Text style={{ fontSize: 18, fontWeight: '900', color: colors.textPrimary }}>:</Text>
            <Stepper colors={colors} value={pad(mm)} onMinus={() => step(setMm, -5, 60)} onPlus={() => step(setMm, 5, 60)} />
          </View>
        </View>
        <Text style={{ fontSize: 12, fontWeight: '700', color: penal === 0 ? colors.green : penal >= 0.5 ? colors.red : colors.amber, marginTop: 4 }}>
          {penal === 0 ? `Antes de las 10:00 → sin impacto` : penal >= 0.5 ? `Desde el mediodía → −0,5%` : `De 10:00 a 11:59 → −0,1%`}
        </Text>

        {/* Tipo */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {(['colecta', 'recorrido'] as const).map((t) => {
            const a = tipo === t;
            return (
              <TouchableOpacity key={t} onPress={() => setTipo(t)} style={[styles.tipoBtn, { backgroundColor: a ? colors.blue : colors.bgInput, borderColor: a ? colors.blue : colors.border }]}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: a ? '#fff' : colors.textMuted, textTransform: 'capitalize' }}>{t}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TextInput
          style={[styles.detalle, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
          placeholder="Detalle (opcional)" placeholderTextColor={colors.textPlaceholder}
          value={detalle} onChangeText={setDetalle}
        />

        <TouchableOpacity onPress={guardar} disabled={guardando} style={[styles.saveBtn, { backgroundColor: colors.red }]}>
          <Ionicons name="save-outline" size={16} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{guardando ? 'Guardando…' : `Registrar ausencia (−${penal}%)`}</Text>
        </TouchableOpacity>
      </View>

      {/* Lista */}
      <Text style={{ fontSize: 13, fontWeight: '800', color: colors.textPrimary, marginTop: 18, marginBottom: 8 }}>Últimas ausencias</Text>
      {ausencias.length === 0 ? (
        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>Sin ausencias registradas.</Text>
      ) : ausencias.map((a) => (
        <View key={a.id} style={[styles.ausItem, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13.5, fontWeight: '700', color: colors.textPrimary }}>{a.chofer}</Text>
            <Text style={{ fontSize: 11.5, color: colors.textMuted }}>
              {fmtFecha(a.fecha)} · {String(a.hora).slice(0, 5)} · {a.tipo}{a.detalle ? ` · ${a.detalle}` : ''}
            </Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '800', color: penalidadAusencia(a.hora) === 0 ? colors.green : penalidadAusencia(a.hora) >= 0.5 ? colors.red : colors.amber }}>−{penalidadAusencia(a.hora)}%</Text>
          <TouchableOpacity onPress={() => borrar(a)} style={{ padding: 4 }}><Ionicons name="trash-outline" size={18} color={colors.red} /></TouchableOpacity>
        </View>
      ))}
      <View style={{ height: 30 }} />

      {/* Modal chofer */}
      <Modal visible={picker} transparent animationType="slide" onRequestClose={() => setPicker(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.bgModal }]}>
            <View style={styles.modalHead}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }}>Elegí un chofer</Text>
              <TouchableOpacity onPress={() => setPicker(false)}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <FlatList data={choferes} keyExtractor={(n) => n} style={{ maxHeight: 420 }}
              renderItem={({ item }) => (
                <TouchableOpacity onPress={() => { setChoferSel(item); setPicker(false); }} style={[styles.choferRow, { borderColor: colors.border }]}>
                  <Ionicons name={choferSel === item ? 'checkmark-circle' : 'person-outline'} size={18} color={choferSel === item ? colors.green : colors.textMuted} />
                  <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: choferSel === item ? '800' : '600' }}>{item}</Text>
                </TouchableOpacity>
              )} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function Stepper({ colors, value, onMinus, onPlus }: any) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <TouchableOpacity onPress={onMinus} style={[stp.btn, { backgroundColor: colors.bgInput }]}><Ionicons name="remove" size={16} color={colors.textMuted} /></TouchableOpacity>
      <Text style={{ minWidth: 26, textAlign: 'center', fontSize: 18, fontWeight: '900', color: colors.textPrimary, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <TouchableOpacity onPress={onPlus} style={[stp.btn, { backgroundColor: colors.blueSubtle }]}><Ionicons name="add" size={16} color={colors.blue} /></TouchableOpacity>
    </View>
  );
}
const stp = StyleSheet.create({ btn: { width: 30, height: 30, borderRadius: 8, justifyContent: 'center', alignItems: 'center' } });

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 16 },
  headerIcon: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 12.5, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  sel: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 10 },
  horaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  tipoBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  detalle: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginTop: 12 },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, paddingVertical: 12, borderRadius: 12 },
  ausItem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 8 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 34 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  choferRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, borderBottomWidth: 1 },
});
