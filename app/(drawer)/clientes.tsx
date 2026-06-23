// app/(drawer)/clientes.tsx
// ─────────────────────────────────────────────────────────────────────────
// Clientes (admin) — símil web. Pestaña Semana/Sábados, buscador, asignar
// chofer, y el núcleo de la web reciente:
//   - Enviar colecta por fila (✈️) al chat del chofer
//   - Enviar colectas a todos (un mensaje por chofer con sus colectas)
//   - Tilde verde "enviado" (wa_enviado) por colecta, sincronizado con la web
// Lee/escribe Clientes, mensajes y pantalla_clientes (mismo backend que la web).
// (Importar Excel y mapa quedan como aparte.)
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Modal, RefreshControl, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useToast } from '../../lib/toast';
import { useRoleGuard } from '../_hooks/useRoleGuard';

type Cliente = { id: number; cliente: string; direccion: string | null; horario: string | null; chofer: string | null; tipo_dia: string | null };
type Chofer = { nombre: string; email: string | null };

// Emisor del mensaje del sistema (mismos valores que la web / el cron).
const OWNER_EMAIL = 'maxirusso20@gmail.com';
const OWNER_UID = '40ebc81f-6d48-4d66-8ba7-5c14db7e2cdc';
const REMITENTE_LOGISTICA = 'Logística Hogareño';

const bloqueColecta = (c: Cliente) => {
  const horario = (c.horario || '').toString().trim();
  const direccion = (c.direccion || '').toString().trim();
  return `${c.cliente}${horario ? ` ${horario}` : ''}${direccion ? `\n${direccion}` : ''}`;
};

export default function ClientesScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const { autorizado, verificando } = useRoleGuard('admin');
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [wa, setWa] = useState<Record<string, boolean>>({}); // `${tipo_dia}:${cliente_id}` → enviado
  const [tab, setTab] = useState<'SEMANA' | 'SÁBADOS'>('SEMANA');
  const [busqueda, setBusqueda] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [picker, setPicker] = useState<Cliente | null>(null);
  const [buscaChofer, setBuscaChofer] = useState('');

  const cargar = useCallback(async () => {
    try {
      const { data } = await supabase.from('Clientes').select('id, cliente, direccion, horario, chofer, tipo_dia');
      setClientes((data || []) as Cliente[]);
      const { data: ch } = await supabase.from('Choferes').select('nombre, email').order('nombre');
      setChoferes((ch || []).filter((c: any) => c.nombre) as Chofer[]);
      const { data: pc } = await supabase.from('pantalla_clientes').select('cliente_id, tipo_dia, wa_enviado');
      const map: Record<string, boolean> = {};
      (pc || []).forEach((r: any) => { if (r.cliente_id != null && r.wa_enviado) map[`${r.tipo_dia}:${r.cliente_id}`] = true; });
      setWa(map);
    } catch (e) {
      console.warn('[clientes] error', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Realtime: si la web (u otra PC) manda colectas o cambia asignaciones, refrescar.
  useEffect(() => {
    const canal = supabase.channel('clientes-app-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pantalla_clientes' }, () => cargar())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Clientes' }, () => cargar())
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [cargar]);

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
  const enviadas = lista.filter((c) => wa[`${tab}:${c.id}`]).length;

  const emailDe = useCallback((nombre: string | null) => {
    const nom = (nombre || '').trim();
    if (!nom) return '';
    const ch = choferes.find((c) => (c.nombre || '').trim() === nom);
    return (ch?.email || '').trim().toLowerCase();
  }, [choferes]);

  const asignar = async (cliente: Cliente, nuevoChofer: string | null) => {
    setClientes((prev) => prev.map((c) => (c.id === cliente.id ? { ...c, chofer: nuevoChofer } : c)));
    setPicker(null);
    setBuscaChofer('');
    const { error } = await supabase.from('Clientes').update({ chofer: nuevoChofer }).eq('id', cliente.id);
    if (error) { console.warn('[clientes] update', error); cargar(); }
  };

  // Marca colectas como enviadas (tilde verde) — optimista + persistir en pantalla_clientes.
  const marcarWa = useCallback(async (items: Cliente[]) => {
    if (!items.length) return;
    setWa((prev) => { const n = { ...prev }; items.forEach((c) => { n[`${tab}:${c.id}`] = true; }); return n; });
    const rows = items.map((c) => ({
      tipo_dia: tab, cliente_id: c.id, cliente_nombre: c.cliente || '',
      chofer: c.chofer || '', horario_programado: c.horario || '', direccion: c.direccion || '',
      wa_enviado: true,
    }));
    await supabase.from('pantalla_clientes').upsert(rows, { onConflict: 'tipo_dia,cliente_id' });
  }, [tab]);

  // Enviar UNA colecta al chat del chofer.
  const enviarUno = async (c: Cliente) => {
    const email = emailDe(c.chofer);
    if (!c.chofer) { toast.error('Asigná un chofer primero'); return; }
    if (!email) { toast.error(`${c.chofer} no tiene email cargado`); return; }
    const saludo = tab === 'SÁBADOS' ? `Buenas noches ${c.chofer}!` : `Buenos días ${c.chofer}!`;
    const texto = `${saludo}\n\nLa colecta asignada del día es:\n\n${bloqueColecta(c)}`;
    const { error } = await supabase.from('mensajes').insert([{
      texto, remitente: REMITENTE_LOGISTICA, user_id: OWNER_UID, admin_id: OWNER_EMAIL,
      chofer_email: email, visto_admin: true, visto_chofer: false, estado: 'enviado',
    }]);
    if (error) { toast.error('No se pudo enviar al chat'); return; }
    await marcarWa([c]);
    toast.success(`Enviado a ${c.chofer}`);
  };

  // Enviar a TODOS los choferes sus colectas de la pestaña (un mensaje c/u).
  const enviarMasivo = () => {
    const grupos: Record<string, Cliente[]> = {};
    lista.forEach((c) => { const nom = (c.chofer || '').trim(); if (nom) (grupos[nom] ||= []).push(c); });
    const nombres = Object.keys(grupos);
    if (!nombres.length) { toast.error('No hay colectas con chofer asignado'); return; }
    Alert.alert(
      'Enviar colectas a todos',
      `Se le enviará a cada chofer (${nombres.length}) sus colectas de ${tab === 'SÁBADOS' ? 'Sábados' : 'Lunes a Viernes'} por chat. Cada uno recibe un mensaje con su lista.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Enviar', onPress: async () => {
            setEnviando(true);
            try {
              const saludoBase = tab === 'SÁBADOS' ? 'Buenas noches' : 'Buenos días';
              const filas: any[] = [];
              const enviados: Cliente[] = [];
              let sinEmail = 0;
              for (const nom of nombres) {
                const email = emailDe(nom);
                if (!email) { sinEmail++; continue; }
                const ls = grupos[nom];
                const una = ls.length === 1;
                const intro = una ? 'La colecta asignada del día es:' : 'Las colectas asignadas del día son:';
                const bloques = ls.map(bloqueColecta).join('\n\n');
                filas.push({
                  texto: `${saludoBase} ${nom}!\n\n${intro}\n\n${bloques}`,
                  remitente: REMITENTE_LOGISTICA, user_id: OWNER_UID, admin_id: OWNER_EMAIL,
                  chofer_email: email, visto_admin: true, visto_chofer: false, estado: 'enviado',
                });
                enviados.push(...ls);
              }
              if (!filas.length) { toast.error('Ningún chofer con email cargado'); return; }
              const { error } = await supabase.from('mensajes').insert(filas);
              if (error) { toast.error('Error al enviar'); return; }
              await marcarWa(enviados);
              toast.success(`Enviado a ${filas.length} chofer${filas.length === 1 ? '' : 'es'}${sinEmail ? ` · ${sinEmail} sin email` : ''}`);
            } finally {
              setEnviando(false);
            }
          },
        },
      ]
    );
  };

  const choferesFiltrados = useMemo(() => {
    const q = buscaChofer.trim().toLowerCase();
    if (!q) return choferes;
    return choferes.filter((c) => (c.nombre || '').toLowerCase().includes(q));
  }, [choferes, buscaChofer]);

  if (verificando) return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.blue} /></View>;
  if (!autorizado) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (loading) return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.blue} /></View>;

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

      {/* Botón enviar colectas a todos */}
      <TouchableOpacity onPress={enviarMasivo} disabled={enviando} activeOpacity={0.85}
        style={[styles.enviarTodos, { backgroundColor: enviando ? colors.bgInput : '#6366f1' }]}>
        {enviando ? <ActivityIndicator color={colors.textMuted} size="small" /> : <Ionicons name="paper-plane" size={16} color="#fff" />}
        <Text style={{ fontSize: 14, fontWeight: '800', color: enviando ? colors.textMuted : '#fff' }}>
          {enviando ? 'Enviando…' : 'Enviar colectas a todos'}
        </Text>
      </TouchableOpacity>

      <View style={styles.countRow}>
        <Text style={{ fontSize: 12, color: colors.textMuted, fontWeight: '600' }}>{lista.length} clientes · {enviadas} enviadas</Text>
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
        renderItem={({ item }) => {
          const enviado = !!wa[`${tab}:${item.id}`];
          return (
            <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: enviado ? colors.green + '66' : colors.border }, enviado && { borderLeftWidth: 4, borderLeftColor: colors.green }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary }}>{item.cliente}</Text>
                {enviado && (
                  <View style={[styles.tilde, { backgroundColor: colors.green + '1f' }]}>
                    <Ionicons name="checkmark-done" size={13} color={colors.green} />
                    <Text style={{ fontSize: 11, fontWeight: '800', color: colors.green }}>Enviada</Text>
                  </View>
                )}
              </View>
              {!!item.direccion && <Text style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 2 }}>📍 {item.direccion}</Text>}
              {!!item.horario && <Text style={{ fontSize: 12.5, color: colors.textMuted, marginTop: 1 }}>🕐 {item.horario}</Text>}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity
                  onPress={() => { setPicker(item); setBuscaChofer(''); }}
                  activeOpacity={0.7}
                  style={[styles.choferBtn, { flex: 1, backgroundColor: item.chofer ? colors.blueSubtle : colors.amber + '1A', borderColor: item.chofer ? colors.blue + '44' : colors.amber + '55' }]}
                >
                  <Ionicons name="person-outline" size={14} color={item.chofer ? colors.blue : colors.amber} />
                  <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: item.chofer ? colors.blue : colors.amber }} numberOfLines={1}>
                    {item.chofer || 'Sin chofer — asignar'}
                  </Text>
                  <Ionicons name="chevron-down" size={15} color={item.chofer ? colors.blue : colors.amber} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => enviarUno(item)}
                  activeOpacity={0.7}
                  disabled={!item.chofer}
                  style={[styles.sendBtn, { backgroundColor: item.chofer ? '#6366f1' : colors.bgInput, opacity: item.chofer ? 1 : 0.5 }]}
                >
                  <Ionicons name="paper-plane-outline" size={17} color={item.chofer ? '#fff' : colors.textMuted} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
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
              keyboardShouldPersistTaps="handled"
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
  enviarTodos: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: 12, marginTop: 10, paddingVertical: 12, borderRadius: 12 },
  countRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  tilde: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  choferBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9, paddingHorizontal: 11, borderRadius: 10, borderWidth: 1.5 },
  sendBtn: { width: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  modalOverlay: { flex: 1, justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 34 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  choferRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 13, borderBottomWidth: 1 },
});
