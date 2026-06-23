// app/(drawer)/personal.tsx
// ─────────────────────────────────────────────────────────────────────────
// Choferes (admin) — port fiel de la pantalla web "Gestión de Choferes".
//   - Buscador (nombre / DNI / celular)
//   - Filtros por condición con contadores: Todos, Titulares, Semititulares,
//     Suplentes, Colectadores
//   - Tarjeta: avatar (color por zona), celular → WhatsApp, dirección → Maps,
//     badges de zona y condición, vehículo, DNI, fecha de ingreso
//   - Alta/edición con Email de acceso autocompletado (nombre.apellido@hogareno.com)
// Lee/escribe la tabla Choferes (mismo backend que la web). zona/vehiculo son
// jsonb (mezcla de string/array en datos viejos): se leen con getArr y se
// guardan como string, igual que la web. id es identity → no se envía al alta.
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Linking, Modal,
  Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput,
  TouchableOpacity, View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useToast } from '../../lib/toast';
import { useRoleGuard } from '../_hooks/useRoleGuard';

// ─── Tipos ──────────────────────────────────────────────────────────────────
interface Chofer {
  id: number; nombre: string; dni: string | null; celular: string | null;
  condicion: string | null; vehiculo: any; zona: any;
  direccion?: string | null; fecha_ingreso?: string | null; email?: string | null;
}
interface FormChofer {
  nombre: string; dni: string; celular: string; email: string;
  direccion: string; fecha_ingreso: string; zona: string; vehiculo: string; condicion: string;
}

// ─── Constantes (mismas opciones que la web) ─────────────────────────────────
const ZONAS = ['ZONA OESTE', 'ZONA SUR', 'ZONA NORTE', 'CABA'];
const VEHICULOS = ['Moto', 'Auto', 'Camioneta', 'Furgón', 'Camión'];
const CONDICIONES = ['Titular', 'Semititular', 'Suplente', 'Colectador'];

const FILTROS = [
  { key: 'TODOS', label: 'Todos', color: '#6366f1' },
  { key: 'TITULAR', label: 'Titulares', color: '#3b82f6' },
  { key: 'SEMITITULAR', label: 'Semititulares', color: '#f59e0b' },
  { key: 'SUPLENTE', label: 'Suplentes', color: '#64748b' },
  { key: 'COLECTADOR', label: 'Colectadores', color: '#10b981' },
] as const;
type FiltroKey = (typeof FILTROS)[number]['key'];

const DOMINIO_CHOFER = '@hogareno.com';
// Deriva el email desde el nombre: "Juan Pérez" → juan.perez@hogareno.com
const emailDesdeNombre = (nombre: string) => {
  const sinTildes = (nombre || '')
    .replace(/[áàäâ]/gi, 'a').replace(/[éèëê]/gi, 'e').replace(/[íìïî]/gi, 'i')
    .replace(/[óòöô]/gi, 'o').replace(/[úùüû]/gi, 'u').replace(/ñ/gi, 'n');
  const slug = sinTildes
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .split(/\s+/).filter(Boolean).join('.');
  return slug ? `${slug}${DOMINIO_CHOFER}` : '';
};

const norm = (s: any) => (s ?? '').toString().toUpperCase().trim();
const getArr = (v: any): string[] => Array.isArray(v) ? v.map(String) : (v || v === 0 ? [String(v)] : []);
const zonaTexto = (z: any) => getArr(z).join(', ') || 'N/A';
const vehiculoTexto = (v: any) => getArr(v).join(', ') || 'N/A';

// Color del avatar/badge según la zona (tolera datos viejos: "OESTE", arrays, etc.)
function zonaColor(z: any): string {
  const t = norm(zonaTexto(z));
  if (t.includes('OESTE') && t.includes('SUR')) return '#818cf8';
  if (t.includes('OESTE')) return '#60a5fa';
  if (t.includes('SUR')) return '#a78bfa';
  if (t.includes('NORTE')) return '#f472b6';
  if (t.includes('CABA')) return '#34d399';
  return '#94a3b8';
}
function condCfg(c: any): { label: string; color: string; bg: string } {
  const t = norm(c);
  if (t === 'TITULAR') return { label: 'Titular', color: '#4F8EF7', bg: 'rgba(79,142,247,0.14)' };
  if (t === 'SEMITITULAR') return { label: 'Semititular', color: '#F59E0B', bg: 'rgba(245,158,11,0.14)' };
  if (t === 'COLECTADOR') return { label: 'Colectador', color: '#34D399', bg: 'rgba(52,211,153,0.14)' };
  if (t === 'SUPLENTE') return { label: 'Suplente', color: '#94A3B8', bg: 'rgba(148,163,184,0.14)' };
  return { label: (c || 'N/A').toString(), color: '#94A3B8', bg: 'rgba(148,163,184,0.14)' };
}
const formatearFecha = (texto: string): string => {
  const n = (texto || '').replace(/\D/g, '');
  if (n.length <= 2) return n;
  if (n.length <= 4) return `${n.slice(0, 2)}/${n.slice(2)}`;
  return `${n.slice(0, 2)}/${n.slice(2, 4)}/${n.slice(4, 8)}`;
};

// ─── Chips de selección única (zona / vehículo / condición) ──────────────────
function ChipsUnico({ opciones, valor, onSelect, colorActivo = '#4F8EF7' }: {
  opciones: string[]; valor: string; onSelect: (v: string) => void; colorActivo?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={M.chipsRow}>
      {opciones.map(op => {
        const activo = norm(valor) === norm(op);
        return (
          <TouchableOpacity key={op} activeOpacity={0.75} onPress={() => onSelect(op)}
            style={[M.chip, { backgroundColor: colors.bgInput, borderColor: colors.border },
              activo && { backgroundColor: colorActivo, borderColor: colorActivo }]}>
            <Text style={[M.chipTxt, { color: colors.textMuted }, activo && { color: '#fff' }]}>{op}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ─── Tarjeta de chofer (fiel a TarjetaChofer de la web) ──────────────────────
function ChoferCard({ item, onEditar, onEliminar }: {
  item: Chofer; onEditar: (c: Chofer) => void; onEliminar: (c: Chofer) => void;
}) {
  const { colors } = useTheme();
  const cfg = condCfg(item.condicion);
  const zColor = zonaColor(item.zona);
  const initials = (item.nombre || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const cel = (item.celular || '').replace(/\D/g, '');

  return (
    <View style={[P.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      {/* Cabecera */}
      <View style={P.cardTop}>
        <View style={[P.avatar, { backgroundColor: zColor + '22', borderColor: zColor + '55' }]}>
          <Text style={[P.avatarTxt, { color: zColor }]}>{initials}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[P.nombre, { color: colors.textPrimary }]} numberOfLines={1}>{item.nombre}</Text>
          {item.celular ? (
            <TouchableOpacity activeOpacity={0.7} onPress={() => cel && Linking.openURL(`https://wa.me/${cel}`)} style={P.cel}>
              <Ionicons name="logo-whatsapp" size={12} color="#25D366" />
              <Text style={{ fontSize: 12, color: colors.textMuted }}>{item.celular}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={{ fontSize: 12, color: colors.textPlaceholder, marginTop: 2 }}>Sin celular</Text>
          )}
        </View>
        <View style={P.cardBtns}>
          <TouchableOpacity onPress={() => onEditar(item)} style={[P.iconBtn, { backgroundColor: colors.bgInput }]} activeOpacity={0.7}>
            <Ionicons name="pencil" size={15} color={colors.blue} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onEliminar(item)} style={[P.iconBtn, { backgroundColor: colors.bgInput }]} activeOpacity={0.7}>
            <Ionicons name="trash-outline" size={15} color={colors.red} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Badges zona + condición */}
      <View style={P.badgesRow}>
        <View style={[P.badge, { backgroundColor: zColor + '1a', borderColor: zColor + '40' }]}>
          <Ionicons name="location-outline" size={11} color={zColor} />
          <Text style={[P.badgeTxt, { color: zColor }]}>{zonaTexto(item.zona)}</Text>
        </View>
        <View style={[P.badge, { backgroundColor: cfg.bg, borderColor: cfg.color + '40' }]}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: cfg.color }} />
          <Text style={[P.badgeTxt, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      <View style={[P.divider, { backgroundColor: colors.borderSubtle }]} />

      {/* Datos */}
      <View style={P.details}>
        <View style={P.detailRow}>
          <Ionicons name="car-outline" size={14} color={colors.textMuted} />
          <Text style={[P.detailTxt, { color: colors.textSecondary }]}>{vehiculoTexto(item.vehiculo)}</Text>
        </View>
        <View style={P.detailRow}>
          <Ionicons name="card-outline" size={14} color={colors.textMuted} />
          <Text style={[P.detailTxt, { color: colors.textSecondary, fontVariant: ['tabular-nums'] }]}>DNI {item.dni || '—'}</Text>
        </View>
        {!!item.direccion && (
          <TouchableOpacity activeOpacity={0.7} style={P.detailRow}
            onPress={() => Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.direccion || '')}`)}>
            <Ionicons name="map-outline" size={14} color={colors.textMuted} />
            <Text style={[P.detailTxt, { color: colors.blue }]} numberOfLines={2}>{item.direccion}</Text>
          </TouchableOpacity>
        )}
        {!!item.fecha_ingreso && (
          <View style={P.detailRow}>
            <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
            <Text style={[P.detailTxt, { color: colors.textMuted }]}>Ingreso: {item.fecha_ingreso}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ─── Modal alta/edición ──────────────────────────────────────────────────────
function ModalChofer({ visible, choferEditar, onCerrar, onGuardado }: {
  visible: boolean; choferEditar: Chofer | null; onCerrar: () => void; onGuardado: () => void;
}) {
  const { colors } = useTheme();
  const esEdicion = choferEditar !== null;
  const [guardando, setGuardando] = useState(false);
  const emailTocado = useRef(false);
  const vacio = (): FormChofer => ({ nombre: '', dni: '', celular: '', email: '', direccion: '', fecha_ingreso: '', zona: '', vehiculo: '', condicion: '' });
  const [form, setForm] = useState<FormChofer>(vacio());

  useEffect(() => {
    if (!visible) return;
    if (choferEditar) {
      setForm({
        nombre: choferEditar.nombre || '',
        dni: choferEditar.dni || '',
        celular: choferEditar.celular || '',
        email: choferEditar.email || '',
        direccion: choferEditar.direccion || '',
        fecha_ingreso: choferEditar.fecha_ingreso || '',
        zona: getArr(choferEditar.zona)[0] || '',
        vehiculo: getArr(choferEditar.vehiculo)[0] || '',
        condicion: choferEditar.condicion || '',
      });
      emailTocado.current = true; // al editar, no pisar el email existente
    } else {
      setForm(vacio());
      emailTocado.current = false;
    }
  }, [visible, choferEditar]);

  const set = (campo: keyof FormChofer, valor: string) => {
    setForm(prev => {
      const next = { ...prev, [campo]: valor };
      if (campo === 'email') emailTocado.current = true;
      if (campo === 'nombre' && !emailTocado.current) next.email = emailDesdeNombre(valor);
      return next;
    });
  };

  const guardar = async () => {
    if (!form.nombre.trim()) { Alert.alert('Falta el nombre', 'El nombre es obligatorio.'); return; }
    if (!form.dni.trim()) { Alert.alert('Falta el DNI', 'El DNI es obligatorio.'); return; }
    if (!form.zona) { Alert.alert('Falta la zona', 'Seleccioná una zona.'); return; }
    if (!form.vehiculo) { Alert.alert('Falta el vehículo', 'Seleccioná un vehículo.'); return; }
    if (!form.condicion) { Alert.alert('Falta la condición', 'Seleccioná una condición.'); return; }
    setGuardando(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        dni: form.dni.trim(),
        zona: form.zona,
        vehiculo: form.vehiculo,
        condicion: form.condicion,
        celular: form.celular.trim() || null,
        email: form.email.trim().toLowerCase() || null,
        direccion: form.direccion.trim() || null,
        fecha_ingreso: form.fecha_ingreso.trim() || null,
      };
      if (esEdicion) {
        const { error } = await supabase.from('Choferes').update(payload).eq('id', choferEditar!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('Choferes').insert([payload]); // id es identity
        if (error) throw error;
      }
      onGuardado();
      onCerrar();
    } catch (err: any) {
      Alert.alert(esEdicion ? 'Error al actualizar' : 'Error al agregar', err?.message || 'Ocurrió un error.');
    } finally {
      setGuardando(false);
    }
  };

  const wrap = [M.inputWrap, { backgroundColor: colors.bgCard, borderColor: colors.border }];
  const inp = [M.input, { color: colors.textPrimary }];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCerrar}>
      <View style={[M.root, { backgroundColor: colors.bg }]}>
        <View style={[M.header, { borderBottomColor: colors.borderSubtle, backgroundColor: colors.bgModal }]}>
          <View style={M.headerLeft}>
            <View style={[M.iconBox, { backgroundColor: esEdicion ? 'rgba(245,158,11,0.12)' : 'rgba(79,142,247,0.12)' }]}>
              <Ionicons name={esEdicion ? 'create-outline' : 'person-add-outline'} size={22} color={esEdicion ? '#F59E0B' : '#4F8EF7'} />
            </View>
            <View>
              <Text style={[M.titulo, { color: colors.textPrimary }]}>{esEdicion ? 'Editar Chofer' : 'Nuevo Chofer'}</Text>
              <Text style={[M.subtitulo, { color: colors.textMuted }]} numberOfLines={1}>
                {esEdicion ? choferEditar?.nombre : 'Completá los datos del chofer'}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={onCerrar} style={[M.btnCerrar, { backgroundColor: colors.bgInput }]} activeOpacity={0.7}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={M.content} keyboardShouldPersistTaps="handled">
            <View style={M.field}>
              <Text style={[M.label, { color: colors.textMuted }]}>NOMBRE COMPLETO *</Text>
              <View style={wrap}><TextInput style={inp} value={form.nombre} onChangeText={v => set('nombre', v)} placeholder="Juan Pérez" placeholderTextColor={colors.textPlaceholder} /></View>
            </View>

            <View style={M.field}>
              <Text style={[M.label, { color: colors.textMuted }]}>EMAIL DE ACCESO</Text>
              <View style={wrap}><TextInput style={inp} value={form.email} onChangeText={v => set('email', v)} placeholder="nombre.apellido@hogareno.com" placeholderTextColor={colors.textPlaceholder} autoCapitalize="none" keyboardType="email-address" /></View>
              <Text style={[M.hint, { color: colors.textMuted }]}>
                Se autocompleta desde el nombre; podés editarlo. Con este email el chofer entra y ve su rendimiento (contraseña inicial: Logistica123!).
              </Text>
            </View>

            <View style={M.row}>
              <View style={[M.field, { flex: 1, marginRight: 10 }]}>
                <Text style={[M.label, { color: colors.textMuted }]}>CELULAR</Text>
                <View style={wrap}><TextInput style={inp} value={form.celular} onChangeText={v => set('celular', v)} placeholder="11-1234-5678" placeholderTextColor={colors.textPlaceholder} keyboardType="phone-pad" /></View>
              </View>
              <View style={[M.field, { flex: 1 }]}>
                <Text style={[M.label, { color: colors.textMuted }]}>DNI *</Text>
                <View style={wrap}><TextInput style={inp} value={form.dni} onChangeText={v => set('dni', v)} placeholder="12345678" placeholderTextColor={colors.textPlaceholder} keyboardType="numeric" /></View>
              </View>
            </View>

            <View style={M.field}>
              <Text style={[M.label, { color: colors.textMuted }]}>DIRECCIÓN</Text>
              <View style={wrap}><TextInput style={inp} value={form.direccion} onChangeText={v => set('direccion', v)} placeholder="Av. Corrientes 1234" placeholderTextColor={colors.textPlaceholder} /></View>
            </View>

            <View style={M.field}>
              <Text style={[M.label, { color: colors.textMuted }]}>FECHA DE INGRESO</Text>
              <View style={wrap}><TextInput style={inp} value={form.fecha_ingreso} onChangeText={v => set('fecha_ingreso', formatearFecha(v))} maxLength={10} placeholder="DD/MM/YYYY" placeholderTextColor={colors.textPlaceholder} keyboardType="numeric" /></View>
            </View>

            <View style={M.field}>
              <Text style={[M.label, { color: colors.textMuted }]}>ZONA *</Text>
              <ChipsUnico opciones={ZONAS} valor={form.zona} onSelect={v => set('zona', v)} />
            </View>
            <View style={M.field}>
              <Text style={[M.label, { color: colors.textMuted }]}>VEHÍCULO *</Text>
              <ChipsUnico opciones={VEHICULOS} valor={form.vehiculo} onSelect={v => set('vehiculo', v)} colorActivo="#34D399" />
            </View>
            <View style={M.field}>
              <Text style={[M.label, { color: colors.textMuted }]}>CONDICIÓN *</Text>
              <ChipsUnico opciones={CONDICIONES} valor={form.condicion} onSelect={v => set('condicion', v)} colorActivo="#F59E0B" />
            </View>

            <TouchableOpacity style={[M.btnGuardar, guardando && { opacity: 0.6 }]} onPress={guardar} disabled={guardando} activeOpacity={0.85}>
              {guardando ? <ActivityIndicator color="#fff" size="small" /> : (
                <><Ionicons name={esEdicion ? 'checkmark-circle' : 'person-add'} size={18} color="#fff" /><Text style={M.btnGuardarTxt}>{esEdicion ? 'Guardar Cambios' : 'Agregar Chofer'}</Text></>
              )}
            </TouchableOpacity>
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─── Pantalla ────────────────────────────────────────────────────────────────
export default function PersonalScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const { autorizado, verificando } = useRoleGuard('admin');
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<FiltroKey>('TODOS');
  const [modalVisible, setModalVisible] = useState(false);
  const [choferEditar, setChoferEditar] = useState<Chofer | null>(null);

  const fetchChoferes = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('Choferes').select('*').order('orden', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setChoferes((data || []) as Chofer[]);
    } catch (err) { console.warn('[personal] error', err); }
    finally { setCargando(false); setRefrescando(false); }
  }, []);

  useEffect(() => {
    fetchChoferes();
    const ch = supabase.channel('personal-choferes-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Choferes' }, () => fetchChoferes())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [fetchChoferes]);

  // Filtrado por búsqueda (paso 1)
  const porBusqueda = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return choferes;
    return choferes.filter(c =>
      (c.nombre || '').toLowerCase().includes(q) ||
      (c.dni || '').toString().includes(q) ||
      (c.celular || '').toString().includes(q));
  }, [choferes, search]);

  // Conteos por condición (sobre el set ya buscado), como la web
  const conteos = useMemo(() => {
    const acc: Record<string, number> = { TODOS: porBusqueda.length, TITULAR: 0, SEMITITULAR: 0, SUPLENTE: 0, COLECTADOR: 0 };
    porBusqueda.forEach(c => { const k = norm(c.condicion); if (acc[k] !== undefined) acc[k]++; });
    return acc;
  }, [porBusqueda]);

  // Filtrado final por condición (paso 2)
  const filtrados = useMemo(() => {
    if (filtro === 'TODOS') return porBusqueda;
    return porBusqueda.filter(c => norm(c.condicion) === filtro);
  }, [porBusqueda, filtro]);

  const eliminar = (c: Chofer) => {
    Alert.alert('Eliminar chofer', `¿Eliminar a ${c.nombre}?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('Choferes').delete().eq('id', c.id);
          if (error) { toast.error('No se pudo eliminar'); return; }
          toast.success(`${c.nombre} eliminado`);
        },
      },
    ]);
  };

  if (verificando) return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.blue} /></View>;
  if (!autorizado) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (cargando) return <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}><ActivityIndicator color={colors.blue} /></View>;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Header: título + total + agregar */}
      <View style={P.headerBar}>
        <View style={{ flex: 1 }}>
          <Text style={[P.h1, { color: colors.textPrimary }]}>Gestión de Choferes</Text>
          <Text style={[P.h1sub, { color: colors.textMuted }]}>
            {(search || filtro !== 'TODOS') ? `Mostrando ${filtrados.length} de ${choferes.length}` : `Total: ${choferes.length} choferes`}
          </Text>
        </View>
        <TouchableOpacity onPress={() => { setChoferEditar(null); setModalVisible(true); }} style={[P.addBtn, { backgroundColor: colors.blue }]} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={P.addBtnTxt}>Agregar</Text>
        </TouchableOpacity>
      </View>

      {/* Buscador */}
      <View style={[P.search, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput style={{ flex: 1, color: colors.textPrimary, fontSize: 14, padding: 0 }}
          placeholder="Buscar por nombre, DNI o celular…" placeholderTextColor={colors.textPlaceholder}
          value={search} onChangeText={setSearch} />
        {search ? <TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity> : null}
      </View>

      {/* Filtros por condición con contadores (envuelven en varias líneas) */}
      <View style={P.filtros}>
        {FILTROS.map(f => {
          const activo = filtro === f.key;
          const n = conteos[f.key] ?? 0;
          return (
            <TouchableOpacity key={f.key} activeOpacity={0.8} onPress={() => setFiltro(f.key)}
              style={[P.filtroChip, { borderColor: activo ? f.color : colors.border, backgroundColor: activo ? f.color + '1a' : 'transparent' }]}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: f.color }} />
              <Text style={[P.filtroTxt, { color: activo ? f.color : colors.textMuted }]}>{f.label}</Text>
              <View style={[P.filtroCount, { backgroundColor: activo ? f.color : colors.border }]}>
                <Text style={{ fontSize: 10, fontWeight: '800', color: activo ? '#fff' : colors.textMuted }}>{n}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <FlatList
        data={filtrados}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ padding: 16, paddingTop: 6 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); fetchChoferes(); }} tintColor={colors.blue} />}
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingVertical: 50, gap: 10 }}>
            <Ionicons name="people-outline" size={46} color={colors.borderSubtle} />
            <Text style={{ color: colors.textMuted, fontSize: 14 }}>
              {(search || filtro !== 'TODOS') ? 'No hay choferes con esos filtros' : 'No hay choferes registrados'}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ChoferCard item={item} onEditar={(c) => { setChoferEditar(c); setModalVisible(true); }} onEliminar={eliminar} />
        )}
      />

      <ModalChofer visible={modalVisible} choferEditar={choferEditar}
        onCerrar={() => setModalVisible(false)} onGuardado={fetchChoferes} />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────
const P = StyleSheet.create({
  headerBar: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  h1: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  h1sub: { fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 11 },
  addBtnTxt: { color: '#fff', fontSize: 13.5, fontWeight: '800' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  filtros: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, marginTop: 12, marginBottom: 4 },
  filtroChip: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 999, borderWidth: 1.5 },
  filtroTxt: { fontSize: 13, fontWeight: '700' },
  filtroCount: { minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 999, alignItems: 'center' },

  card: { borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5 },
  avatarTxt: { fontSize: 15, fontWeight: '800', letterSpacing: -0.5 },
  nombre: { fontSize: 15, fontWeight: '700' },
  cel: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  cardBtns: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 32, height: 32, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
  badgeTxt: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  divider: { height: 1, marginVertical: 12 },
  details: { gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailTxt: { fontSize: 13, fontWeight: '500', flex: 1 },
});

const M = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 24, paddingBottom: 18, borderBottomWidth: 1 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  iconBox: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  titulo: { fontSize: 18, fontWeight: '800' },
  subtitulo: { fontSize: 12, marginTop: 2 },
  btnCerrar: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20 },
  field: { marginBottom: 16 },
  row: { flexDirection: 'row' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginBottom: 8 },
  hint: { fontSize: 11, marginTop: 6, lineHeight: 15 },
  inputWrap: { borderRadius: 12, borderWidth: 1.5, minHeight: 50, justifyContent: 'center', paddingHorizontal: 14 },
  input: { fontSize: 14, paddingVertical: 12 },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5 },
  chipTxt: { fontSize: 12.5, fontWeight: '700' },
  btnGuardar: { backgroundColor: '#4F8EF7', height: 54, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8 },
  btnGuardarTxt: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
