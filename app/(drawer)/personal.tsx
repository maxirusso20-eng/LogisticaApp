// app/(drawer)/personal.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { SkeletonChoferCard } from '../../lib/skeleton';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useToast } from '../../lib/toast';
import { useRoleGuard } from '../_hooks/useRoleGuard';

interface Chofer {
  id: number; nombre: string; dni: string; celular: string; condicion: string;
  vehiculo: string | string[]; zona: string | string[]; orden?: number | null;
  direccion?: string; fechaIngreso?: string;
}

const ZONAS = ['ZONA OESTE', 'ZONA SUR', 'ZONA NORTE', 'CABA'];
const VEHICULOS = ['SUV', 'UTILITARIO', 'AUTO'];
const CONDICIONES = ['TITULAR', 'SUPLENTE', 'COLECTADOR'];
const AVATAR_COLORS = ['#4F8EF7', '#34D399', '#F59E0B', '#A78BFA', '#F472B6', '#FB923C'];

const getCondicionCfg = (condicion: string) => {
  const c = (condicion || '').toUpperCase();
  if (c === 'TITULAR') return { label: 'Titular', color: '#4F8EF7', bg: 'rgba(79,142,247,0.12)' };
  if (c === 'COLECTADOR') return { label: 'Colectador', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' };
  return { label: 'Suplente', color: '#34D399', bg: 'rgba(52,211,153,0.12)' };
};
const getArr = (v: string | string[]): string[] => Array.isArray(v) ? v : (v ? [v] : []);
const getVehiculo = (v: string | string[]): string => { const arr = getArr(v); return arr.length ? arr.join(', ') : '—'; };
const formatearFecha = (texto: string): string => {
  const nums = texto.replace(/\D/g, '');
  if (nums.length <= 2) return nums;
  if (nums.length <= 4) return `${nums.slice(0, 2)}/${nums.slice(2)}`;
  return `${nums.slice(0, 2)}/${nums.slice(2, 4)}/${nums.slice(4, 8)}`;
};

// ─── SelectorChips ────────────────────────────────────────────────────────────

interface SelectorChipsProps {
  opciones: string[]; seleccionados: string | string[]; multi?: boolean;
  onToggle: (valor: string) => void; colorActivo?: string;
}

const SelectorChips: React.FC<SelectorChipsProps> = ({ opciones, seleccionados, multi = false, onToggle, colorActivo = '#4F8EF7' }) => {
  const { colors } = useTheme();
  const isActivo = (op: string) => multi ? getArr(seleccionados as string[]).includes(op) : seleccionados === op;
  return (
    <View style={M.selectorRow}>
      {opciones.map(op => (
        <TouchableOpacity key={op}
          style={[M.chip, { backgroundColor: colors.bgInput, borderColor: colors.border }, isActivo(op) && { backgroundColor: colorActivo, borderColor: colorActivo }]}
          onPress={() => onToggle(op)} activeOpacity={0.75}>
          <Text style={[M.chipTexto, { color: colors.textMuted }, isActivo(op) && { color: '#fff' }]}>{op}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

// ─── FormularioChofer ─────────────────────────────────────────────────────────

interface FormChofer {
  id: string; nombre: string; dni: string; celular: string;
  direccion: string; fechaIngreso: string; zona: string[]; vehiculo: string[]; condicion: string;
}

interface FormularioChoferProps {
  form: FormChofer; esEdicion: boolean;
  onChange: (campo: keyof FormChofer, valor: string | string[]) => void;
  onGuardar: () => void; guardando: boolean;
}

const FormularioChofer: React.FC<FormularioChoferProps> = ({ form, esEdicion, onChange, onGuardar, guardando }) => {
  const { colors } = useTheme();
  const inputStyle = [M.input, { color: colors.textPrimary }];
  const wrapStyle = [M.inputWrap, { backgroundColor: colors.bgCard, borderColor: colors.border }];
  return (
    <View style={M.formContent}>
      <View style={M.fieldRow}>
        {!esEdicion && (
          <View style={[M.fieldGroup, { flex: 1, marginRight: 10 }]}>
            <Text style={[M.fieldLabel, { color: colors.textMuted }]}>ID</Text>
            <View style={wrapStyle}><TextInput style={inputStyle} keyboardType="numeric" value={form.id} onChangeText={v => onChange('id', v)} placeholderTextColor={colors.textPlaceholder} placeholder="00" selectTextOnFocus /></View>
          </View>
        )}
        <View style={[M.fieldGroup, { flex: esEdicion ? 1 : 2 }]}>
          <Text style={[M.fieldLabel, { color: colors.textMuted }]}>NOMBRE COMPLETO</Text>
          <View style={wrapStyle}><TextInput style={inputStyle} value={form.nombre} onChangeText={v => onChange('nombre', v)} placeholderTextColor={colors.textPlaceholder} placeholder="Juan Pérez" /></View>
        </View>
      </View>
      <View style={M.fieldRow}>
        <View style={[M.fieldGroup, { flex: 1, marginRight: 10 }]}>
          <Text style={[M.fieldLabel, { color: colors.textMuted }]}>CELULAR</Text>
          <View style={wrapStyle}><TextInput style={inputStyle} keyboardType="phone-pad" value={form.celular} onChangeText={v => onChange('celular', v)} placeholderTextColor={colors.textPlaceholder} placeholder="11-1234-5678" /></View>
        </View>
        <View style={[M.fieldGroup, { flex: 1 }]}>
          <Text style={[M.fieldLabel, { color: colors.textMuted }]}>DNI</Text>
          <View style={wrapStyle}><TextInput style={inputStyle} keyboardType="numeric" value={form.dni} onChangeText={v => onChange('dni', v)} placeholderTextColor={colors.textPlaceholder} placeholder="12345678" selectTextOnFocus /></View>
        </View>
      </View>
      <View style={M.fieldGroup}>
        <Text style={[M.fieldLabel, { color: colors.textMuted }]}>DIRECCIÓN</Text>
        <View style={wrapStyle}><TextInput style={inputStyle} value={form.direccion} onChangeText={v => onChange('direccion', v)} placeholderTextColor={colors.textPlaceholder} placeholder="Av. Corrientes 1234" /></View>
      </View>
      <View style={M.fieldGroup}>
        <Text style={[M.fieldLabel, { color: colors.textMuted }]}>FECHA INGRESO</Text>
        <View style={wrapStyle}><TextInput style={inputStyle} value={form.fechaIngreso} onChangeText={v => onChange('fechaIngreso', formatearFecha(v))} maxLength={10} placeholder="DD/MM/YYYY" placeholderTextColor={colors.textPlaceholder} /></View>
      </View>
      <View style={M.fieldGroup}>
        <Text style={[M.fieldLabel, { color: colors.textMuted }]}>ZONA PREFERENCIAL</Text>
        <SelectorChips opciones={ZONAS} seleccionados={form.zona} multi onToggle={z => { const a = form.zona; onChange('zona', a.includes(z) ? a.filter(x => x !== z) : [...a, z]); }} />
      </View>
      <View style={M.fieldGroup}>
        <Text style={[M.fieldLabel, { color: colors.textMuted }]}>VEHÍCULO</Text>
        <SelectorChips opciones={VEHICULOS} seleccionados={form.vehiculo} multi onToggle={v => { const a = form.vehiculo; onChange('vehiculo', a.includes(v) ? a.filter(x => x !== v) : [...a, v]); }} colorActivo="#34D399" />
      </View>
      <View style={M.fieldGroup}>
        <Text style={[M.fieldLabel, { color: colors.textMuted }]}>CONDICIÓN</Text>
        <SelectorChips opciones={CONDICIONES} seleccionados={form.condicion} onToggle={c => onChange('condicion', c)} colorActivo="#F59E0B" />
      </View>
      <TouchableOpacity style={[M.btnGuardar, guardando && { opacity: 0.6 }]} onPress={onGuardar} disabled={guardando} activeOpacity={0.85}>
        {guardando ? <ActivityIndicator color="#fff" size="small" /> : (<><Ionicons name={esEdicion ? 'checkmark-circle' : 'person-add'} size={18} color="#fff" /><Text style={M.btnGuardarTexto}>{esEdicion ? 'Guardar Cambios' : 'Agregar Chofer'}</Text></>)}
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </View>
  );
};

// ─── ModalChofer ──────────────────────────────────────────────────────────────

interface ModalChoferProps { visible: boolean; choferEditar: Chofer | null; onCerrar: () => void; onGuardado: () => void; }

const ModalChofer: React.FC<ModalChoferProps> = ({ visible, choferEditar, onCerrar, onGuardado }) => {
  const { colors } = useTheme();
  const esEdicion = choferEditar !== null;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [guardando, setGuardando] = useState(false);
  const formDefault = (): FormChofer => ({ id: '', nombre: '', dni: '', celular: '', direccion: '', fechaIngreso: '', zona: [], vehiculo: [], condicion: 'SUPLENTE' });

  // Aquí esquivamos el bug del React Compiler renombrando a formData
  const [formData, setFormData] = useState<FormChofer>(formDefault());

  useEffect(() => {
    if (visible) {
      if (choferEditar) {
        setFormData({ id: choferEditar.id.toString(), nombre: choferEditar.nombre || '', dni: choferEditar.dni || '', celular: choferEditar.celular || '', direccion: (choferEditar as any).direccion || '', fechaIngreso: (choferEditar as any).fechaIngreso || '', zona: getArr(choferEditar.zona), vehiculo: getArr(choferEditar.vehiculo), condicion: choferEditar.condicion || 'SUPLENTE' });
      } else { setFormData(formDefault()); }
      slideAnim.setValue(60);
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 65, friction: 11 }).start();
    }
  }, [visible, choferEditar]);

  const onChange = (campo: keyof FormChofer, valor: string | string[]) => setFormData(prev => ({ ...prev, [campo]: valor }));

  const handleGuardar = async () => {
    if (!formData.nombre.trim()) { Alert.alert('Campo requerido', 'El nombre es obligatorio.'); return; }
    if (!esEdicion && !formData.id) { Alert.alert('Campo requerido', 'El ID es obligatorio para un chofer nuevo.'); return; }
    setGuardando(true);
    try {
      const payload = { nombre: formData.nombre.trim(), dni: formData.dni.trim(), celular: formData.celular.trim(), direccion: formData.direccion.trim(), fechaIngreso: formData.fechaIngreso.trim(), zona: formData.zona, vehiculo: formData.vehiculo, condicion: formData.condicion };
      if (esEdicion) { const { error } = await supabase.from('Choferes').update(payload).eq('id', choferEditar!.id); if (error) throw error; }
      else { const { error } = await supabase.from('Choferes').insert([{ id: parseInt(formData.id), ...payload }]); if (error) throw error; }
      onGuardado(); onCerrar();
    } catch (err: any) { Alert.alert(esEdicion ? 'Error al actualizar' : 'Error al agregar', err?.message || 'Ocurrió un error inesperado.'); }
    finally { setGuardando(false); }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={[M.modalRoot, { backgroundColor: colors.bg }]}>
        <View style={[M.modalHeader, { borderBottomColor: colors.borderSubtle, backgroundColor: colors.bgModal }]}>
          <View style={M.modalHeaderLeft}>
            <View style={[M.modalIconBox, { backgroundColor: esEdicion ? 'rgba(245,158,11,0.12)' : 'rgba(79,142,247,0.12)' }]}>
              <Ionicons name={esEdicion ? 'create-outline' : 'person-add-outline'} size={22} color={esEdicion ? '#F59E0B' : '#4F8EF7'} />
            </View>
            <View>
              <Text style={[M.modalTitulo, { color: colors.textPrimary }]}>{esEdicion ? 'Editar Chofer' : 'Nuevo Chofer'}</Text>
              {esEdicion && <Text style={[M.modalSubtitulo, { color: colors.textMuted }]}>{choferEditar?.nombre}</Text>}
            </View>
          </View>
          <TouchableOpacity onPress={onCerrar} style={[M.btnCerrar, { backgroundColor: colors.bgInput }]} activeOpacity={0.7}>
            <Ionicons name="close" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Animated.View style={{ flex: 1, transform: [{ translateY: slideAnim }] }}>
            <FormularioChofer form={formData} esEdicion={esEdicion} onChange={onChange} onGuardar={handleGuardar} guardando={guardando} />
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// ─── ChoferCard ───────────────────────────────────────────────────────────────

function ChoferCard({ item, index, onEditar, onEliminar }: { item: Chofer; index: number; onEditar: (chofer: Chofer) => void; onEliminar: (chofer: Chofer) => void }) {
  const { colors } = useTheme();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const swipeableRef = useRef<Swipeable>(null);
  const cfg = getCondicionCfg(item.condicion);
  const initials = (item.nombre || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const vehiculoTexto = getVehiculo(item.vehiculo);
  const zonaTexto = getArr(item.zona).join(', ') || '—';
  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 380, delay: Math.min(index * 60, 400), useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, delay: Math.min(index * 60, 400), useNativeDriver: true, tension: 70, friction: 12 }),
    ]).start();
  }, []);

  const renderRightActions = () => (
    <View style={P.swipeActions}>
      <TouchableOpacity
        style={[P.swipeBtn, { backgroundColor: '#10B981' }]}
        onPress={() => {
          swipeableRef.current?.close();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          if (item.celular) Linking.openURL(`tel:${item.celular}`);
        }}
      >
        <Ionicons name="call" size={20} color="#fff" />
        <Text style={P.swipeBtnText}>Llamar</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[P.swipeBtn, { backgroundColor: '#4F8EF7' }]}
        onPress={() => {
          swipeableRef.current?.close();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          onEditar(item);
        }}
      >
        <Ionicons name="pencil" size={18} color="#fff" />
        <Text style={P.swipeBtnText}>Editar</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLeftActions = () => (
    <TouchableOpacity
      style={[P.swipeBtn, { backgroundColor: '#EF4444', minWidth: 80, borderRadius: 16, marginBottom: 12, marginLeft: 0, justifyContent: 'center', alignItems: 'center' }]}
      onPress={() => {
        swipeableRef.current?.close();
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        onEliminar(item);
      }}
    >
      <Ionicons name="trash" size={20} color="#fff" />
      <Text style={P.swipeBtnText}>Borrar</Text>
    </TouchableOpacity>
  );

  return (
    <Swipeable ref={swipeableRef} renderRightActions={renderRightActions} renderLeftActions={renderLeftActions} overshootRight={false} overshootLeft={false} friction={2}>
      <Animated.View style={[P.card, { backgroundColor: colors.bgCard, borderColor: colors.border, opacity: fade, transform: [{ scale }] }]}>
        <View style={P.cardTop}>
          <View style={[P.avatar, { backgroundColor: avatarColor + '20', borderColor: avatarColor + '40' }]}>
            <Text style={[P.avatarText, { color: avatarColor }]}>{initials}</Text>
          </View>
          <View style={P.info}>
            <Text style={[P.nombre, { color: colors.textPrimary }]}>{item.nombre}</Text>
            <Text style={[P.dni, { color: colors.textMuted }]}>DNI {item.dni}  ·  ID {item.id}</Text>
          </View>
          <View style={[P.badge, { backgroundColor: cfg.bg }]}>
            <Text style={[P.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        </View>
        <View style={[P.divider, { backgroundColor: colors.borderSubtle }]} />
        <View style={P.details}>
          {[{ icon: 'car-outline', val: vehiculoTexto }, { icon: 'call-outline', val: item.celular || '—' }, { icon: 'map-outline', val: zonaTexto }].map((d, i) => (
            <View key={i} style={P.detailRow}>
              <Ionicons name={d.icon as any} size={14} color={colors.textMuted} />
              <Text style={[P.detailText, { color: colors.textSecondary }]}>{d.val}</Text>
            </View>
          ))}
        </View>
        <Text style={[P.swipeHint, { color: colors.textMuted }]}>← Deslizá para acciones</Text>
      </Animated.View>
    </Swipeable>
  );
}

// ─── PersonalScreen ───────────────────────────────────────────────────────────

export default function PersonalScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const { autorizado, verificando } = useRoleGuard('admin');
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'TITULAR' | 'SUPLENTE' | 'COLECTADOR'>('todos');
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [choferEditar, setChoferEditar] = useState<Chofer | null>(null);
  const fabScale = useRef(new Animated.Value(0)).current;
  const fabRotate = useRef(new Animated.Value(0)).current;
  const headerFade = useRef(new Animated.Value(0)).current;

  const fetchChoferes = useCallback(async (mostrarLoader = false) => {
    if (mostrarLoader) setCargando(true);
    try {
      const { data, error } = await supabase.from('Choferes').select('*').order('orden', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setChoferes(data || []);
    } catch (err) { console.error('Error cargando choferes:', err); }
    finally { setCargando(false); setRefrescando(false); }
  }, []);

  useEffect(() => {
    fetchChoferes(true);
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(fabScale, { toValue: 1, delay: 400, tension: 65, friction: 10, useNativeDriver: true }),
    ]).start();
    const channel = supabase.channel('personal-choferes-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Choferes' }, () => fetchChoferes())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Choferes' }, () => fetchChoferes())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'Choferes' }, () => fetchChoferes())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fetchChoferes]);

  const abrirAgregar = () => {
    Animated.timing(fabRotate, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => Animated.timing(fabRotate, { toValue: 0, duration: 200, useNativeDriver: true }).start());
    setChoferEditar(null); setModalVisible(true);
  };

  const titulares = choferes.filter(c => (c.condicion || '').toUpperCase() === 'TITULAR').length;
  const suplentes = choferes.filter(c => (c.condicion || '').toUpperCase() === 'SUPLENTE').length;
  const colectadores = choferes.filter(c => (c.condicion || '').toUpperCase() === 'COLECTADOR').length;

  const filtrados = choferes.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = (c.nombre || '').toLowerCase().includes(q) || (c.dni || '').includes(q) || (c.celular || '').includes(q);
    const matchFiltro = filtro === 'todos' || (c.condicion || '').toUpperCase() === filtro;
    return matchSearch && matchFiltro;
  });

  const fabRotateInterp = fabRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '45deg'] });

  // Role guard: si el usuario no es admin, el hook ya redirigió a /Panel
  if (verificando) return (
    <ScrollView style={[P.container, { backgroundColor: colors.bg }]} contentContainerStyle={P.content}
      scrollEnabled={false}>
      {[0, 1, 2, 3].map(i => <SkeletonChoferCard key={i} />)}
    </ScrollView>
  );
  if (!autorizado) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  if (cargando) return (
    <ScrollView style={[P.container, { backgroundColor: colors.bg }]} contentContainerStyle={P.content}
      scrollEnabled={false}>
      {[0, 1, 2, 3].map(i => <SkeletonChoferCard key={i} />)}
    </ScrollView>
  );

  return (
    <View style={[P.root, { backgroundColor: colors.bg }]}>
      <ScrollView style={P.container} contentContainerStyle={P.content} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); fetchChoferes(); }} tintColor="#4F8EF7" colors={['#4F8EF7']} />}>
        <Animated.View style={[P.statsRow, { backgroundColor: colors.bgCard, borderColor: colors.border, opacity: headerFade }]}>
          {[{ v: choferes.length, c: colors.textPrimary, l: 'Total' }, { v: titulares, c: '#4F8EF7', l: 'Titulares' }, { v: suplentes, c: '#34D399', l: 'Suplentes' }, { v: colectadores, c: '#F59E0B', l: 'Colectad.' }].map((s, i) => (
            <View key={i} style={[P.statBox, i > 0 && { borderLeftWidth: 1, borderColor: colors.border }]}>
              <Text style={[P.statNum, { color: s.c }]}>{s.v}</Text>
              <Text style={[P.statLabel, { color: colors.textMuted }]}>{s.l}</Text>
            </View>
          ))}
        </Animated.View>
        <Animated.View style={[P.searchRow, { backgroundColor: colors.bgCard, borderColor: colors.border, opacity: headerFade }]}>
          <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 10 }} />
          <TextInput style={[P.searchInput, { color: colors.textPrimary }]} placeholder="Nombre, DNI o celular..." placeholderTextColor={colors.textPlaceholder} value={search} onChangeText={setSearch} />
          {search.length > 0 && (<TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}><Ionicons name="close-circle" size={16} color={colors.textMuted} /></TouchableOpacity>)}
        </Animated.View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={P.filtrosScroll}>
          {([{ key: 'todos', label: 'Todos' }, { key: 'TITULAR', label: 'Titulares' }, { key: 'SUPLENTE', label: 'Suplentes' }, { key: 'COLECTADOR', label: 'Colectadores' }] as { key: typeof filtro; label: string }[]).map(f => (
            <TouchableOpacity key={f.key} style={[P.filtroBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }, filtro === f.key && { backgroundColor: '#4F8EF7', borderColor: '#4F8EF7' }]} onPress={() => setFiltro(f.key)} activeOpacity={0.75}>
              <Text style={[P.filtroText, { color: colors.textMuted }, filtro === f.key && { color: '#FFFFFF' }]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={[P.count, { color: colors.textMuted }]}>{filtrados.length} chofer{filtrados.length !== 1 ? 'es' : ''}</Text>
        {filtrados.length === 0
          ? <View style={P.emptyState}><Ionicons name="people-outline" size={48} color={colors.borderSubtle} /><Text style={[P.emptyText, { color: colors.textMuted }]}>Sin resultados</Text></View>
          : filtrados.map((c, i) => <ChoferCard key={c.id} item={c} index={i}
            onEditar={(ch) => { setChoferEditar(ch); setModalVisible(true); }}
            onEliminar={(ch) => {
              Alert.alert('Eliminar chofer', `¿Eliminar a ${ch.nombre}?`, [
                { text: 'Cancelar', style: 'cancel' },
                {
                  text: 'Eliminar', style: 'destructive', onPress: async () => {
                    const { error } = await supabase.from('Choferes').delete().eq('id', ch.id);
                    if (error) { toast.error('No se pudo eliminar'); return; }
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    toast.success(`${ch.nombre} eliminado`);
                  }
                },
              ]);
            }}
          />)
        }<View style={{ height: 100 }} />
      </ScrollView>
      <Animated.View style={[P.fab, { transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity style={P.fabBtn} onPress={abrirAgregar} activeOpacity={0.85}>
          <Animated.View style={{ transform: [{ rotate: fabRotateInterp }] }}>
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
      <ModalChofer visible={modalVisible} choferEditar={choferEditar} onCerrar={() => setModalVisible(false)} onGuardado={() => fetchChoferes()} />
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const P = StyleSheet.create({
  root: { flex: 1 }, container: { flex: 1 }, content: { padding: 20 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }, loaderText: { fontSize: 13, fontWeight: '500' },
  statsRow: { flexDirection: 'row', borderRadius: 18, marginBottom: 16, borderWidth: 1, overflow: 'hidden' },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  statNum: { fontSize: 20, fontWeight: '800' }, statLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, height: 48, marginBottom: 14 },
  searchInput: { flex: 1, fontSize: 14 },
  filtrosScroll: { marginBottom: 16 },
  filtroBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginRight: 8, borderWidth: 1 },
  filtroText: { fontSize: 13, fontWeight: '600' },
  count: { fontSize: 12, fontWeight: '700', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 }, emptyText: { fontSize: 14 },
  card: { borderRadius: 18, padding: 18, marginBottom: 12, borderWidth: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  avatar: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginRight: 12, borderWidth: 1 },
  avatarText: { fontSize: 14, fontWeight: '800' }, info: { flex: 1 },
  nombre: { fontSize: 15, fontWeight: '700' }, dni: { fontSize: 12, marginTop: 2, fontWeight: '500' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 }, badgeText: { fontSize: 11, fontWeight: '700' },
  editBtn: { width: 30, height: 30, borderRadius: 9, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  divider: { height: 1, marginBottom: 14 }, details: { gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, detailText: { fontSize: 13, fontWeight: '500', flex: 1 },
  swipeActions: { flexDirection: 'row', alignItems: 'center', paddingRight: 8, gap: 8, marginBottom: 12 },
  swipeBtn: { borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
  swipeBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  swipeHint: { fontSize: 10, fontWeight: '500', textAlign: 'right', marginTop: 8, opacity: 0.6 },
  fab: { position: 'absolute', bottom: 28, right: 20 },
  fabBtn: { width: 58, height: 58, borderRadius: 18, backgroundColor: '#4F8EF7', justifyContent: 'center', alignItems: 'center', shadowColor: '#4F8EF7', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 16, elevation: 10 },
});

const M = StyleSheet.create({
  modalRoot: { flex: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 24, paddingBottom: 20, borderBottomWidth: 1 },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  modalIconBox: { width: 42, height: 42, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modalTitulo: { fontSize: 18, fontWeight: '800' }, modalSubtitulo: { fontSize: 12, marginTop: 2 },
  btnCerrar: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  formScroll: { flex: 1 }, formContent: { padding: 20 },
  fieldRow: { flexDirection: 'row', marginBottom: 0 }, fieldGroup: { marginBottom: 16 },
  fieldLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 8 },
  inputWrap: { borderRadius: 12, borderWidth: 1.5, height: 50, justifyContent: 'center', paddingHorizontal: 14 },
  input: { fontSize: 14, flex: 1 },
  selectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5 },
  chipTexto: { fontSize: 12, fontWeight: '700' },
  btnGuardar: { backgroundColor: '#4F8EF7', height: 56, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 8, shadowColor: '#4F8EF7', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 14, elevation: 8 },
  btnGuardarTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});