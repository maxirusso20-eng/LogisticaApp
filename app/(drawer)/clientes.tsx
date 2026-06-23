// app/(drawer)/clientes.tsx
// ─────────────────────────────────────────────────────────────────────────
// Clientes (admin) — gestión básica: pestaña Semana/Sábados, buscador, y
// asignar/cambiar el chofer de cada cliente (la acción clave, que es lo que
// arma las colectas). Lee/escribe la tabla Clientes (mismo backend que la web).
// (La web tiene mucho más: paquetes, importar, mapa, etc. — esto es el núcleo.)
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

type Cliente = { id: number; cliente: string; direccion: string | null; horario: string | null; chofer: string | null; tipo_dia: string | null };
type Chofer = { nombre: string; email: string | null };

export default function ClientesScreen() {
  const { colors } = useTheme();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [tab, setTab] = useState<'SEMANA' | 'SÁBADOS'>('SEMANA');
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [picker, setPicker] = useState<Cliente | null>(null);
  const [buscaChofer, setBuscaChofer] = useState('');

  const cargar = useCallback(async () => {
    try {
      const { data } = await supabase.from('Clientes').select('id, cliente, direccion, horario, chofer, tipo_dia');
      setClientes((data || []) as Cliente[]);
      const { data: ch } = await supabase.from('Choferes').select('nombre, email').order('nombre');
      setChoferes((ch || []).filter((c: any) => c.nombre) as Chofer[]);
    } catch (e) {
      console.warn('[clientes] error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const lista = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return clientes
      .filter((c) => {
        const td = (c.tipo_dia || 'SEMANA').toString().trim().toUpperCase();
        const esTab = tab === 'SÁBADOS' ? td === 'SÁBADOS' : (td === 'SEMANA' || td === '');
        if (!esTab) return false;
        if (!q) return true;
        return (c.cliente || '').toLowerCase().includes(q) ||
          (c.direccion || '').toLowerCase().includes(q) ||
          (c.chofer || '').toLowerCase().includes(q);
      })
      .sort((a, b) => (a.cliente || '').localeCompare(b.cliente || ''));
  }, [clientes, tab, busqueda]);

  const sinChofer = lista.filter((c) => !c.chofer).length;

  const asignar = async (cliente: Cliente, nuevoChofer: string | null) => {
    setClientes((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, chofer: nuevoChofer } : c)));
    setPicker(null);
    setBuscaChofer('');
    const { error } = await supabase.from('Clientes').update({ chofer: nuevoChofer }).eq('id', cliente.id);
    if (error) { console.warn('[clientes] update', error); cargar(); }
  };

  const choferesFiltrados = useMemo(() => {
    const q = buscaChofer.trim().toLowerCase();
    if (!q) return choferes;
    return choferes.filter((c) => (c.nombre || '').toLowerCase().includes(q));
  }, [choferes, buscaChofer]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ActivityIndicator color={colors.blue} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Tabs */}
      <View style={styles.tabs}>
        {(['SEMANA', 'SÁBADOS'] as const).map((t) => {
          const activo = tab === t;
          return (
            <TouchableOpacity key={t} onPress={() => setTab(t)} activeOpacity={0.8}
              style={[styles.tab, { backgroundColor: activo ? colors.blue : colors.bgInput }]}>
              <Text style={{ fontSize: 13, fontWeight: '800', color: activo ? '#fff' : colors.textMuted }}>
                {t === 'SEMANA' ? 'Lunes a Viernes' : 'Sábados'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Buscador */}
      <View style={[styles.search, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={{ flex: 1, color: colors.textPrimary, fontSize: 14, padding: 0 }}
          placeholder="Buscar cliente, dirección o chofer…"
          placeholderTextColor={colors.textPlaceholder}
          value={busqueda} onChangeText={setBusqueda}
        />
        {busqueda ? <TouchableOpacity onPress={() => setBusqueda('')}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity> : null}
      </View>

      <View style={styles.countRow}>
        <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '600' }}>{lista.length} clientes</Text>
        {sinChofer > 0 && (
          <Text style={{ fontSize: 12, color: colors.amber, fontWeight: '800' }}>⚠️ {sinChofer} sin chofer</Text>
        )}
      </View>

      <FlatList
        data={lista}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); cargar(); }} tintColor={colors.blue} />}
        ListEmptyComponent={<Text style={{ textAlign: 'center', color: colors.textMuted, marginTop: 30 }}>Sin clientes.</Text>}
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>{item.cliente}</Text>
            {!!item.direccion && <Text style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 2 }}>📍 {item.direccion}</Text>}
            {!!item.horario && <Text style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 1 }}>🕐 {item.horario}</Text>}
            <TouchableOpacity
              onPress={() => { setPicker(item); setBuscaChofer(''); }}
              activeOpacity={0.7}
              style={[styles.choferBtn, { backgroundColor: item.chofer ? colors.blueSubtle : colors.amber + '1A', borderColor: item.chofer ? colors.blue + '44' : colors.amber + '55' }]}
            >
              <Ionicons name="person-outline" size={14} color={item.chofer ? colors.blue : colors.amber} />
              <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: item.chofer ? colors.blue : colors.amber }}>
                {item.chofer || 'Sin chofer — asignar'}
              </Text>
              <Ionicons name="chevron-down" size={15} color={item.chofer ? colors.blue : colors.amber} />
            </TouchableOpacity>
          </View>
        )}
      />

      {/* Modal: elegir chofer */}
      <Modal visible={!!picker} transparent animationType="slide" onRequestClose={() => setPicker(null)}>
        <View style={[styles.modalOverlay, { backgroundColor: colors.overlay }]}>
          <View style={[styles.modalSheet, { backgroundColor: colors.bgModal }]}>
            <View style={styles.modalHead}>
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.textPrimary }} numberOfLines={1}>
                Chofer para {picker?.cliente}
              </Text>
              <TouchableOpacity onPress={() => setPicker(null)}><Ionicons name="close" size={22} color={colors.textMuted} /></TouchableOpacity>
            </View>
            <View style={[styles.search, { backgroundColor: colors.bgInput, borderColor: colors.border, marginHorizontal: 0 }]}>
              <Ionicons name="search" size={16} color={colors.textMuted} />
              <TextInput style={{ flex: 1, color: colors.textPrimary, fontSize: 14, padding: 0 }} placeholder="Buscar chofer…"
                placeholderTextColor={colors.textPlaceholder} value={buscaChofer} onChangeText={setBuscaChofer} autoFocus />
            </View>
            <FlatList
              data={choferesFiltrados}
              keyExtractor={(c) => c.nombre}
              style={{ maxHeight: 360, marginTop: 8 }}
              ListHeaderComponent={
                <TouchableOpacity onPress={() => picker && asignar(picker, null)} style={[styles.choferRow, { borderColor: colors.border }]}>
                  <Ionicons name="remove-circle-outline" size={18} color={colors.red} />
                  <Text style={{ fontSize: 14, color: colors.red, fontWeight: '700' }}>Sin chofer</Text>
                </TouchableOpacity>
              }
              renderItem={({ item }) => {
                const sel = picker?.chofer === item.nombre;
                return (
                  <TouchableOpacity onPress={() => picker && asignar(picker, item.nombre)} style={[styles.choferRow, { borderColor: colors.border }]}>
                    <Ionicons name={sel ? 'checkmark-circle' : 'person-outline'} size={18} color={sel ? colors.green : colors.textMuted} />
                    <Text style={{ fontSize: 14, color: colors.textPrimary, fontWeight: sel ? '800' : '600' }}>{item.nombre}</Text>
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 6 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  choferBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 12, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1.5 },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 34 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  choferRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, borderBottomWidth: 1 },
});
