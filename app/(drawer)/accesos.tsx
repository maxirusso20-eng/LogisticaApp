// app/(drawer)/accesos.tsx
// ─────────────────────────────────────────────────────────────────────────
// Gestión de Accesos (admin/subadmin) — port nativo de PantallaRoles.jsx (web).
// Agrupa TODOS los emails conocidos en 3 niveles y permite asignar/quitar rol
// (subadmin / coordinador) escribiendo en la tabla `roles_usuarios` (mismo
// backend que la web; RLS: escritura solo admin autenticado). Los @hogareno.com
// son conductores automáticamente por dominio, no se asignan a mano.
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { ADMIN_EMAILS, esEmailConductor } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useToast } from '../../lib/toast';
import { useRoleGuard } from '../_hooks/useRoleGuard';

type RolUsuario = { id: number; email: string; rol: string; created_at: string };
type Chofer = { email: string | null; nombre: string | null };
type Fila = { email: string; nombre: string | null; rolId: number | null; badge?: string; fijo?: boolean };
type RolAsignable = 'coordinador' | 'subadmin';

const CYAN = '#06B6D4';

const SECCIONES = {
  admin: { label: 'Admins', icon: 'shield-checkmark' as const, color: '#F59E0B', desc: 'Acceso total + gestión de accesos.' },
  conductor: { label: 'Conductores', icon: 'car' as const, color: '#10B981', desc: 'Ven sus KPIs y chatean con admins. Son los @hogareno.com.' },
  coordinador: { label: 'Coordinadores', icon: 'clipboard' as const, color: CYAN, desc: 'Recorridos, Mapa y chat. Sin KPIs ni Clientes.' },
} as const;

export default function AccesosScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const { autorizado, verificando } = useRoleGuard('admin');

  const [usuarios, setUsuarios] = useState<RolUsuario[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [nuevoEmail, setNuevoEmail] = useState('');
  const [nuevoRol, setNuevoRol] = useState<RolAsignable>('coordinador');
  const [guardando, setGuardando] = useState(false);
  // Modal de asignación de rol.
  const [modalRol, setModalRol] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const { data } = await supabase.from('roles_usuarios').select('*').order('created_at', { ascending: false });
      setUsuarios((data as RolUsuario[]) || []);
      const { data: ch } = await supabase.from('Choferes').select('email, nombre');
      setChoferes((ch as Chofer[]) || []);
    } catch (e) {
      console.warn('[accesos] error', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    const canal = supabase
      .channel('roles_usuarios-app')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roles_usuarios' }, () => cargar())
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [cargar]);

  // email → nombre (desde Choferes) para mostrar nombres lindos.
  const nombrePorEmail = useMemo(() => {
    const m: Record<string, string> = {};
    choferes.forEach((c) => { if (c.email && c.nombre) m[c.email.toLowerCase()] = c.nombre; });
    return m;
  }, [choferes]);

  // Categorizar TODOS los emails conocidos (misma lógica que la web).
  const { admins, conductores, coordinadores } = useMemo(() => {
    const adminSet = new Set(ADMIN_EMAILS.map((e) => e.toLowerCase()));
    const rolPorEmail = new Map<string, { rol: string; id: number }>();
    usuarios.forEach((u) => { if (u.email) rolPorEmail.set(u.email.toLowerCase(), { rol: (u.rol || '').trim().toLowerCase(), id: u.id }); });

    const todos = new Set<string>();
    adminSet.forEach((e) => todos.add(e));
    usuarios.forEach((u) => { if (u.email) todos.add(u.email.toLowerCase()); });
    choferes.forEach((c) => { if (c.email) todos.add(c.email.toLowerCase()); });

    const adminsArr: Fila[] = [], conductoresArr: Fila[] = [], coordinadoresArr: Fila[] = [];
    for (const email of todos) {
      const info = rolPorEmail.get(email);
      const rolDB = info?.rol;
      const fila: Fila = { email, nombre: nombrePorEmail[email] || null, rolId: info?.id || null };
      if (adminSet.has(email)) {
        adminsArr.push({ ...fila, badge: 'OWNER', fijo: true });
      } else if (rolDB === 'admin' || rolDB === 'subadmin') {
        adminsArr.push({ ...fila, badge: rolDB === 'subadmin' ? 'SUBADMIN' : 'ADMIN' });
      } else if (esEmailConductor(email)) {
        conductoresArr.push(fila);
      } else {
        // rol coordinador explícito, o sin rol y sin dominio → coordinador por defecto.
        coordinadoresArr.push(fila);
      }
    }
    const ordenar = (arr: Fila[]) => arr.sort((a, b) => (a.nombre || a.email).localeCompare(b.nombre || b.email));
    return { admins: ordenar(adminsArr), conductores: ordenar(conductoresArr), coordinadores: ordenar(coordinadoresArr) };
  }, [usuarios, choferes, nombrePorEmail]);

  const asignar = async () => {
    const email = nuevoEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) { toast.error('Email inválido'); return; }
    if (esEmailConductor(email)) { toast.info('Los @hogareno.com ya son conductores automáticamente'); return; }
    setGuardando(true);
    try {
      const { error } = await supabase.from('roles_usuarios').upsert([{ email, rol: nuevoRol }], { onConflict: 'email' }).select();
      if (error) throw error;
      setNuevoEmail('');
      setModalRol(false);
      toast.success(`${email} → ${nuevoRol}`);
      // El realtime recarga la lista solo.
    } catch (err: any) {
      console.warn('[accesos] asignar', err);
      toast.error(err?.message || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = (fila: Fila) => {
    if (!fila.rolId) return;
    Alert.alert('Quitar rol', `¿Quitar el rol asignado a ${fila.nombre || fila.email}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar', style: 'destructive', onPress: async () => {
          try {
            const { error } = await supabase.from('roles_usuarios').delete().eq('id', fila.rolId);
            if (error) throw error;
            toast.info(`${fila.email} sin rol asignado`);
          } catch (err: any) {
            toast.error(err?.message || 'No se pudo quitar');
          }
        },
      },
    ]);
  };

  const filtrar = (arr: Fila[]) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return arr;
    return arr.filter((f) => (f.nombre || '').toLowerCase().includes(q) || f.email.toLowerCase().includes(q));
  };

  if (verificando || !autorizado) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const Seccion = ({ tipo, filas }: { tipo: keyof typeof SECCIONES; filas: Fila[] }) => {
    const s = SECCIONES[tipo];
    return (
      <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, borderTopColor: s.color }]}>
        <View style={[styles.cardHead, { borderBottomColor: colors.borderSubtle }]}>
          <Ionicons name={s.icon} size={16} color={s.color} />
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{s.label}</Text>
          <View style={[styles.pill, { backgroundColor: s.color + '22' }]}>
            <Text style={{ color: s.color, fontSize: 12, fontWeight: '800' }}>{filas.length}</Text>
          </View>
        </View>
        <Text style={[styles.cardDesc, { color: colors.textMuted }]}>{s.desc}</Text>
        {filas.length === 0 ? (
          <Text style={[styles.vacio, { color: colors.textMuted }]}>Nadie en esta sección.</Text>
        ) : filas.map((f) => (
          <View key={f.email} style={[styles.fila, { backgroundColor: colors.bgInput, borderColor: colors.borderSubtle }]}>
            <View style={[styles.avatar, { backgroundColor: s.color + '22', borderColor: s.color + '55' }]}>
              <Ionicons name={tipo === 'admin' ? 'shield-checkmark' : tipo === 'conductor' ? 'car' : 'clipboard'} size={14} color={s.color} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              {f.nombre ? <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary }}>{f.nombre}</Text> : null}
              <Text numberOfLines={1} style={{ fontSize: f.nombre ? 11 : 13, color: f.nombre ? colors.textMuted : colors.textPrimary }}>{f.email}</Text>
            </View>
            {f.badge ? (
              <View style={[styles.badge, { backgroundColor: s.color + '1a' }]}>
                <Text style={{ fontSize: 9, fontWeight: '800', color: s.color, letterSpacing: 0.5 }}>{f.badge}</Text>
              </View>
            ) : null}
            {f.rolId && !f.fijo ? (
              <TouchableOpacity onPress={() => eliminar(f)} style={styles.iconBtn} hitSlop={8}>
                <Ionicons name="trash-outline" size={17} color={colors.red} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>
    );
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingTop: 18, paddingBottom: 40 }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: '#8B5CF622' }]}>
          <Ionicons name="shield-checkmark" size={22} color="#8B5CF6" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: colors.textPrimary }]}>Gestión de Accesos</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>Usuarios agrupados por nivel de acceso</Text>
        </View>
      </View>

      {/* Buscador */}
      <View style={[styles.search, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          value={busqueda}
          onChangeText={setBusqueda}
          placeholder="Buscar por nombre o email..."
          placeholderTextColor={colors.textMuted}
          style={{ flex: 1, color: colors.textPrimary, fontSize: 14, padding: 0 }}
          autoCapitalize="none"
        />
        {busqueda ? (
          <TouchableOpacity onPress={() => setBusqueda('')} hitSlop={8}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Botón asignar rol */}
      <TouchableOpacity
        onPress={() => setModalRol(true)}
        style={[styles.asignarBtn, { backgroundColor: '#8B5CF6' }]}
        activeOpacity={0.85}
      >
        <Ionicons name="person-add-outline" size={16} color="#fff" />
        <Text style={styles.asignarBtnTxt}>Asignar rol (subadmin / coordinador)</Text>
      </TouchableOpacity>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        💡 Los @hogareno.com ya son conductores automáticamente.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.blue} style={{ marginTop: 40 }} />
      ) : (
        <View style={{ gap: 14, marginTop: 6 }}>
          <Seccion tipo="admin" filas={filtrar(admins)} />
          <Seccion tipo="conductor" filas={filtrar(conductores)} />
          <Seccion tipo="coordinador" filas={filtrar(coordinadores)} />
        </View>
      )}

      {/* Modal: asignar rol */}
      <Modal visible={modalRol} transparent animationType="fade" onRequestClose={() => setModalRol(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={[styles.modalHead, { borderBottomColor: colors.borderSubtle }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Asignar rol</Text>
              <TouchableOpacity onPress={() => setModalRol(false)} hitSlop={8}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <Text style={[styles.label, { color: colors.textMuted }]}>Email</Text>
            <TextInput
              value={nuevoEmail}
              onChangeText={setNuevoEmail}
              placeholder="correo@ejemplo.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              style={[styles.input, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
            />

            <Text style={[styles.label, { color: colors.textMuted, marginTop: 12 }]}>Rol</Text>
            <View style={styles.rolToggle}>
              {(['coordinador', 'subadmin'] as RolAsignable[]).map((r) => {
                const sel = nuevoRol === r;
                const col = r === 'subadmin' ? '#F59E0B' : CYAN;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => setNuevoRol(r)}
                    style={[styles.rolOpt, { borderColor: sel ? col : colors.border, backgroundColor: sel ? col + '1a' : 'transparent' }]}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: sel ? col : colors.textMuted, fontWeight: '700', fontSize: 13, textTransform: 'capitalize' }}>{r}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity
              onPress={asignar}
              disabled={guardando}
              style={[styles.confirmBtn, { backgroundColor: guardando ? colors.textMuted : '#8B5CF6' }]}
              activeOpacity={0.85}
            >
              <Text style={styles.confirmTxt}>{guardando ? 'Guardando…' : 'Asignar'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  headerIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  h1: { fontSize: 20, fontWeight: '800' },
  sub: { fontSize: 12.5, marginTop: 2 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12 },
  asignarBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 12 },
  asignarBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  hint: { fontSize: 11.5, marginTop: 8, marginBottom: 4 },
  card: { borderWidth: 1, borderTopWidth: 3, borderRadius: 14, padding: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10, borderBottomWidth: 1 },
  cardTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  pill: { paddingHorizontal: 10, paddingVertical: 2, borderRadius: 999 },
  cardDesc: { fontSize: 11.5, marginTop: 8, marginBottom: 4, lineHeight: 16 },
  vacio: { textAlign: 'center', fontSize: 12, fontStyle: 'italic', paddingVertical: 14 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, marginTop: 8 },
  avatar: { width: 32, height: 32, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  iconBtn: { padding: 5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(2,6,23,0.66)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 440, borderWidth: 1, borderRadius: 16, padding: 18 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, marginBottom: 14 },
  modalTitle: { fontSize: 16, fontWeight: '800' },
  label: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 },
  rolToggle: { flexDirection: 'row', gap: 10 },
  rolOpt: { flex: 1, borderWidth: 1.5, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  confirmBtn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 18 },
  confirmTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
