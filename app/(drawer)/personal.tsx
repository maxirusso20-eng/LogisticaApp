// app/(drawer)/personal.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
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
import { supabase } from '../../lib/supabase';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

interface Chofer {
  id: number;
  nombre: string;
  dni: string;
  celular: string;
  condicion: string;
  vehiculo: string | string[];
  zona: string | string[];
  orden?: number | null;
  direccion?: string;
  fechaIngreso?: string;
}

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────

const ZONAS = ['ZONA OESTE', 'ZONA SUR', 'ZONA NORTE', 'CABA'];
const VEHICULOS = ['SUV', 'UTILITARIO', 'AUTO'];
const CONDICIONES = ['TITULAR', 'SUPLENTE', 'COLECTADOR'];

const NUEVO_CHOFER_DEFAULT: Omit<Chofer, 'id'> = {
  nombre: '', dni: '', celular: '', direccion: '',
  fechaIngreso: '', zona: [], vehiculo: [], condicion: 'SUPLENTE',
};

const AVATAR_COLORS = ['#4F8EF7', '#34D399', '#F59E0B', '#A78BFA', '#F472B6', '#FB923C'];

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const getCondicionCfg = (condicion: string) => {
  const c = (condicion || '').toUpperCase();
  if (c === 'TITULAR') return { label: 'Titular', color: '#4F8EF7', bg: 'rgba(79,142,247,0.12)' };
  if (c === 'COLECTADOR') return { label: 'Colectador', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' };
  return { label: 'Suplente', color: '#34D399', bg: 'rgba(52,211,153,0.12)' };
};

const getArr = (v: string | string[]): string[] =>
  Array.isArray(v) ? v : (v ? [v] : []);

const getVehiculo = (v: string | string[]): string => {
  const arr = getArr(v);
  return arr.length ? arr.join(', ') : '—';
};

const formatearFecha = (texto: string): string => {
  const nums = texto.replace(/\D/g, '');
  if (nums.length <= 2) return nums;
  if (nums.length <= 4) return `${nums.slice(0, 2)}/${nums.slice(2)}`;
  return `${nums.slice(0, 2)}/${nums.slice(2, 4)}/${nums.slice(4, 8)}`;
};

// ─────────────────────────────────────────────
// COMPONENTE: SelectorChips
// ─────────────────────────────────────────────

interface SelectorChipsProps {
  opciones: string[];
  seleccionados: string | string[];
  multi?: boolean;
  onToggle: (valor: string) => void;
  colorActivo?: string;
}

const SelectorChips: React.FC<SelectorChipsProps> = ({
  opciones, seleccionados, multi = false, onToggle, colorActivo = '#4F8EF7',
}) => {
  const isActivo = (op: string) =>
    multi ? getArr(seleccionados as string[]).includes(op) : seleccionados === op;

  return (
    <View style={M.selectorRow}>
      {opciones.map(op => (
        <TouchableOpacity
          key={op}
          style={[M.chip, isActivo(op) && { backgroundColor: colorActivo, borderColor: colorActivo }]}
          onPress={() => onToggle(op)}
          activeOpacity={0.75}
        >
          <Text style={[M.chipTexto, isActivo(op) && { color: '#fff' }]}>{op}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

// ─────────────────────────────────────────────
// COMPONENTE: FormularioChofer (reutilizable)
// ─────────────────────────────────────────────

interface FormChofer {
  id: string;
  nombre: string;
  dni: string;
  celular: string;
  direccion: string;
  fechaIngreso: string;
  zona: string[];
  vehiculo: string[];
  condicion: string;
}

interface FormularioChoferProps {
  form: FormChofer;
  esEdicion: boolean;
  onChange: (campo: keyof FormChofer, valor: string | string[]) => void;
  onGuardar: () => void;
  guardando: boolean;
}

const FormularioChofer: React.FC<FormularioChoferProps> = ({
  form, esEdicion, onChange, onGuardar, guardando,
}) => (
  <ScrollView
    style={M.formScroll}
    contentContainerStyle={M.formContent}
    keyboardShouldPersistTaps="handled"
    showsVerticalScrollIndicator={false}
  >
    {/* ID + Nombre */}
    <View style={M.fieldRow}>
      {!esEdicion && (
        <View style={[M.fieldGroup, { flex: 1, marginRight: 10 }]}>
          <Text style={M.fieldLabel}>ID</Text>
          <View style={M.inputWrap}>
            <TextInput
              style={M.input}
              keyboardType="numeric"
              value={form.id}
              onChangeText={v => onChange('id', v)}
              placeholderTextColor="#1A3050"
              placeholder="00"
              selectTextOnFocus
            />
          </View>
        </View>
      )}
      <View style={[M.fieldGroup, { flex: esEdicion ? 1 : 2 }]}>
        <Text style={M.fieldLabel}>NOMBRE COMPLETO</Text>
        <View style={M.inputWrap}>
          <TextInput
            style={M.input}
            value={form.nombre}
            onChangeText={v => onChange('nombre', v)}
            placeholderTextColor="#1A3050"
            placeholder="Juan Pérez"
          />
        </View>
      </View>
    </View>

    {/* Celular + DNI */}
    <View style={M.fieldRow}>
      <View style={[M.fieldGroup, { flex: 1, marginRight: 10 }]}>
        <Text style={M.fieldLabel}>CELULAR</Text>
        <View style={M.inputWrap}>
          <TextInput
            style={M.input}
            keyboardType="phone-pad"
            value={form.celular}
            onChangeText={v => onChange('celular', v)}
            placeholderTextColor="#1A3050"
            placeholder="11-1234-5678"
          />
        </View>
      </View>
      <View style={[M.fieldGroup, { flex: 1 }]}>
        <Text style={M.fieldLabel}>DNI</Text>
        <View style={M.inputWrap}>
          <TextInput
            style={M.input}
            keyboardType="numeric"
            value={form.dni}
            onChangeText={v => onChange('dni', v)}
            placeholderTextColor="#1A3050"
            placeholder="12345678"
            selectTextOnFocus
          />
        </View>
      </View>
    </View>

    {/* Dirección */}
    <View style={M.fieldGroup}>
      <Text style={M.fieldLabel}>DIRECCIÓN</Text>
      <View style={M.inputWrap}>
        <TextInput
          style={M.input}
          value={form.direccion}
          onChangeText={v => onChange('direccion', v)}
          placeholderTextColor="#1A3050"
          placeholder="Av. Corrientes 1234"
        />
      </View>
    </View>

    {/* Fecha ingreso */}
    <View style={M.fieldGroup}>
      <Text style={M.fieldLabel}>FECHA INGRESO</Text>
      <View style={M.inputWrap}>
        <TextInput
          style={M.input}
          value={form.fechaIngreso}
          onChangeText={v => onChange('fechaIngreso', formatearFecha(v))}
          maxLength={10}
          placeholder="DD/MM/YYYY"
          placeholderTextColor="#1A3050"
        />
      </View>
    </View>

    {/* Zonas */}
    <View style={M.fieldGroup}>
      <Text style={M.fieldLabel}>ZONA PREFERENCIAL</Text>
      <SelectorChips
        opciones={ZONAS}
        seleccionados={form.zona}
        multi
        onToggle={z => {
          const actual = form.zona;
          onChange('zona', actual.includes(z) ? actual.filter(x => x !== z) : [...actual, z]);
        }}
      />
    </View>

    {/* Vehículo */}
    <View style={M.fieldGroup}>
      <Text style={M.fieldLabel}>VEHÍCULO</Text>
      <SelectorChips
        opciones={VEHICULOS}
        seleccionados={form.vehiculo}
        multi
        onToggle={v => {
          const actual = form.vehiculo;
          onChange('vehiculo', actual.includes(v) ? actual.filter(x => x !== v) : [...actual, v]);
        }}
        colorActivo="#34D399"
      />
    </View>

    {/* Condición */}
    <View style={M.fieldGroup}>
      <Text style={M.fieldLabel}>CONDICIÓN</Text>
      <SelectorChips
        opciones={CONDICIONES}
        seleccionados={form.condicion}
        onToggle={c => onChange('condicion', c)}
        colorActivo="#F59E0B"
      />
    </View>

    {/* Botón guardar */}
    <TouchableOpacity
      style={[M.btnGuardar, guardando && { opacity: 0.6 }]}
      onPress={onGuardar}
      disabled={guardando}
      activeOpacity={0.85}
    >
      {guardando
        ? <ActivityIndicator color="#fff" size="small" />
        : <>
          <Ionicons name={esEdicion ? 'checkmark-circle' : 'person-add'} size={18} color="#fff" />
          <Text style={M.btnGuardarTexto}>{esEdicion ? 'Guardar Cambios' : 'Agregar Chofer'}</Text>
        </>
      }
    </TouchableOpacity>

    <View style={{ height: 40 }} />
  </ScrollView>
);

// ─────────────────────────────────────────────
// MODAL: Agregar / Editar Chofer
// ─────────────────────────────────────────────

interface ModalChoferProps {
  visible: boolean;
  choferEditar: Chofer | null;
  onCerrar: () => void;
  onGuardado: () => void;
}

const ModalChofer: React.FC<ModalChoferProps> = ({ visible, choferEditar, onCerrar, onGuardado }) => {
  const esEdicion = choferEditar !== null;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [guardando, setGuardando] = useState(false);

  const formDefault = (): FormChofer => ({
    id: '', nombre: '', dni: '', celular: '',
    direccion: '', fechaIngreso: '', zona: [], vehiculo: [], condicion: 'SUPLENTE',
  });

  const [form, setForm] = useState<FormChofer>(formDefault());

  // Cargar datos al abrir en modo edición
  useEffect(() => {
    if (visible) {
      if (choferEditar) {
        setForm({
          id: choferEditar.id.toString(),
          nombre: choferEditar.nombre || '',
          dni: choferEditar.dni || '',
          celular: choferEditar.celular || '',
          direccion: (choferEditar as any).direccion || '',
          fechaIngreso: (choferEditar as any).fechaIngreso || '',
          zona: getArr(choferEditar.zona),
          vehiculo: getArr(choferEditar.vehiculo),
          condicion: choferEditar.condicion || 'SUPLENTE',
        });
      } else {
        setForm(formDefault());
      }
      // Slide-in animation
      slideAnim.setValue(60);
      Animated.spring(slideAnim, {
        toValue: 0, useNativeDriver: true,
        tension: 65, friction: 11,
      }).start();
    }
  }, [visible, choferEditar]);

  const onChange = (campo: keyof FormChofer, valor: string | string[]) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
  };

  const handleGuardar = async () => {
    if (!form.nombre.trim()) {
      Alert.alert('Campo requerido', 'El nombre es obligatorio.');
      return;
    }
    if (!esEdicion && !form.id) {
      Alert.alert('Campo requerido', 'El ID es obligatorio para un chofer nuevo.');
      return;
    }

    setGuardando(true);
    try {
      const payload = {
        nombre: form.nombre.trim(),
        dni: form.dni.trim(),
        celular: form.celular.trim(),
        direccion: form.direccion.trim(),
        fechaIngreso: form.fechaIngreso.trim(),
        zona: form.zona,
        vehiculo: form.vehiculo,
        condicion: form.condicion,
      };

      if (esEdicion) {
        const { error } = await supabase
          .from('Choferes')
          .update(payload)
          .eq('id', choferEditar!.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('Choferes')
          .insert([{ id: parseInt(form.id), ...payload }]);
        if (error) throw error;
      }

      onGuardado();
      onCerrar();
    } catch (err: any) {
      Alert.alert(
        esEdicion ? 'Error al actualizar' : 'Error al agregar',
        err?.message || 'Ocurrió un error inesperado.',
      );
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false}>
      <View style={M.modalRoot}>
        {/* Header */}
        <View style={M.modalHeader}>
          <View style={M.modalHeaderLeft}>
            <View style={[M.modalIconBox, { backgroundColor: esEdicion ? 'rgba(245,158,11,0.12)' : 'rgba(79,142,247,0.12)' }]}>
              <Ionicons
                name={esEdicion ? 'create-outline' : 'person-add-outline'}
                size={22}
                color={esEdicion ? '#F59E0B' : '#4F8EF7'}
              />
            </View>
            <View>
              <Text style={M.modalTitulo}>{esEdicion ? 'Editar Chofer' : 'Nuevo Chofer'}</Text>
              {esEdicion && (
                <Text style={M.modalSubtitulo}>{choferEditar?.nombre}</Text>
              )}
            </View>
          </View>
          <TouchableOpacity onPress={onCerrar} style={M.btnCerrar} activeOpacity={0.7}>
            <Ionicons name="close" size={18} color="#64748b" />
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Animated.View style={{ flex: 1, transform: [{ translateY: slideAnim }] }}>
            <FormularioChofer
              form={form}
              esEdicion={esEdicion}
              onChange={onChange}
              onGuardar={handleGuardar}
              guardando={guardando}
            />
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// ─────────────────────────────────────────────
// COMPONENTE: ChoferCard
// ─────────────────────────────────────────────

interface ChoferCardProps {
  item: Chofer;
  index: number;
  onEditar: (chofer: Chofer) => void;
}

function ChoferCard({ item, index, onEditar }: ChoferCardProps) {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.96)).current;
  const cfg = getCondicionCfg(item.condicion);
  const initials = (item.nombre || '?')
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const vehiculoTexto = getVehiculo(item.vehiculo);
  const zonaArr = getArr(item.zona);
  const zonaTexto = zonaArr.length ? zonaArr.join(', ') : '—';
  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1, duration: 380,
        delay: Math.min(index * 60, 400),
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        delay: Math.min(index * 60, 400),
        useNativeDriver: true,
        tension: 70, friction: 12,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[styles.card, { opacity: fade, transform: [{ scale }] }]}>
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: avatarColor + '20', borderColor: avatarColor + '40' }]}>
          <Text style={[styles.avatarText, { color: avatarColor }]}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.nombre}>{item.nombre}</Text>
          <Text style={styles.dni}>DNI {item.dni}  ·  ID {item.id}</Text>
        </View>
        <View style={styles.cardActions}>
          <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
            <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => onEditar(item)}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="pencil-outline" size={15} color="#4F8EF7" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.details}>
        <View style={styles.detailRow}>
          <Ionicons name="car-outline" size={14} color="#2A4A70" />
          <Text style={styles.detailText}>{vehiculoTexto}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="call-outline" size={14} color="#2A4A70" />
          <Text style={styles.detailText}>{item.celular || '—'}</Text>
        </View>
        <View style={styles.detailRow}>
          <Ionicons name="map-outline" size={14} color="#2A4A70" />
          <Text style={styles.detailText}>{zonaTexto}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────

export default function PersonalScreen() {
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'TITULAR' | 'SUPLENTE' | 'COLECTADOR'>('todos');
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [choferEditar, setChoferEditar] = useState<Chofer | null>(null);

  // FAB animation
  const fabScale = useRef(new Animated.Value(0)).current;
  const fabRotate = useRef(new Animated.Value(0)).current;
  const headerFade = useRef(new Animated.Value(0)).current;

  const fetchChoferes = useCallback(async (mostrarLoader = false) => {
    if (mostrarLoader) setCargando(true);
    try {
      const { data, error } = await supabase
        .from('Choferes')
        .select('*')
        .order('orden', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setChoferes(data || []);
    } catch (err) {
      console.error('Error cargando choferes:', err);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    fetchChoferes(true);

    // Animaciones de entrada
    Animated.parallel([
      Animated.timing(headerFade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.spring(fabScale, {
        toValue: 1, delay: 400,
        tension: 65, friction: 10,
        useNativeDriver: true,
      }),
    ]).start();

    const channel = supabase
      .channel('personal-choferes-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Choferes' }, () => fetchChoferes())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Choferes' }, () => fetchChoferes())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'Choferes' }, () => fetchChoferes())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [fetchChoferes]);

  const handleRefresh = () => {
    setRefrescando(true);
    fetchChoferes();
  };

  const abrirAgregar = () => {
    // Rotate FAB icon
    Animated.timing(fabRotate, { toValue: 1, duration: 200, useNativeDriver: true }).start(() => {
      Animated.timing(fabRotate, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    });
    setChoferEditar(null);
    setModalVisible(true);
  };

  const abrirEditar = (chofer: Chofer) => {
    setChoferEditar(chofer);
    setModalVisible(true);
  };

  const handleGuardado = () => {
    fetchChoferes();
  };

  // Estadísticas
  const titulares = choferes.filter(c => (c.condicion || '').toUpperCase() === 'TITULAR').length;
  const suplentes = choferes.filter(c => (c.condicion || '').toUpperCase() === 'SUPLENTE').length;
  const colectadores = choferes.filter(c => (c.condicion || '').toUpperCase() === 'COLECTADOR').length;

  // Filtrado
  const filtrados = choferes.filter(c => {
    const q = search.toLowerCase();
    const matchSearch =
      (c.nombre || '').toLowerCase().includes(q) ||
      (c.dni || '').includes(q) ||
      (c.celular || '').includes(q);
    const matchFiltro = filtro === 'todos' || (c.condicion || '').toUpperCase() === filtro;
    return matchSearch && matchFiltro;
  });

  const fabRotateInterp = fabRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  if (cargando) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#4F8EF7" />
        <Text style={styles.loaderText}>Cargando personal...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={handleRefresh}
            tintColor="#4F8EF7"
            colors={['#4F8EF7']}
          />
        }
      >
        {/* Stats */}
        <Animated.View style={[styles.statsRow, { opacity: headerFade }]}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{choferes.length}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxDivider]}>
            <Text style={[styles.statNum, { color: '#4F8EF7' }]}>{titulares}</Text>
            <Text style={styles.statLabel}>Titulares</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxDivider]}>
            <Text style={[styles.statNum, { color: '#34D399' }]}>{suplentes}</Text>
            <Text style={styles.statLabel}>Suplentes</Text>
          </View>
          <View style={[styles.statBox, styles.statBoxDivider]}>
            <Text style={[styles.statNum, { color: '#F59E0B' }]}>{colectadores}</Text>
            <Text style={styles.statLabel}>Colectad.</Text>
          </View>
        </Animated.View>

        {/* Buscador */}
        <Animated.View style={[styles.searchRow, { opacity: headerFade }]}>
          <Ionicons name="search-outline" size={16} color="#2A4A70" style={{ marginRight: 10 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Nombre, DNI o celular..."
            placeholderTextColor="#1A3050"
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={16} color="#2A4A70" />
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Filtros */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtrosScroll}>
          {([
            { key: 'todos', label: 'Todos' },
            { key: 'TITULAR', label: 'Titulares' },
            { key: 'SUPLENTE', label: 'Suplentes' },
            { key: 'COLECTADOR', label: 'Colectadores' },
          ] as { key: typeof filtro; label: string }[]).map(f => (
            <TouchableOpacity
              key={f.key}
              style={[styles.filtroBtn, filtro === f.key && styles.filtroBtnActive]}
              onPress={() => setFiltro(f.key)}
              activeOpacity={0.75}
            >
              <Text style={[styles.filtroText, filtro === f.key && styles.filtroTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={styles.count}>
          {filtrados.length} chofer{filtrados.length !== 1 ? 'es' : ''}
        </Text>

        {filtrados.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="people-outline" size={48} color="#1A2540" />
            <Text style={styles.emptyText}>Sin resultados</Text>
          </View>
        ) : (
          filtrados.map((c, i) => (
            <ChoferCard key={c.id} item={c} index={i} onEditar={abrirEditar} />
          ))
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* FAB — Agregar Chofer */}
      <Animated.View style={[styles.fab, { transform: [{ scale: fabScale }] }]}>
        <TouchableOpacity
          style={styles.fabBtn}
          onPress={abrirAgregar}
          activeOpacity={0.85}
        >
          <Animated.View style={{ transform: [{ rotate: fabRotateInterp }] }}>
            <Ionicons name="add" size={28} color="#FFFFFF" />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>

      {/* Modal agregar/editar */}
      <ModalChofer
        visible={modalVisible}
        choferEditar={choferEditar}
        onCerrar={() => setModalVisible(false)}
        onGuardado={handleGuardado}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060B18' },
  container: { flex: 1 },
  content: { padding: 20 },
  loader: { flex: 1, backgroundColor: '#060B18', justifyContent: 'center', alignItems: 'center', gap: 12 },
  loaderText: { color: '#4A6FA5', fontSize: 13, fontWeight: '500' },

  statsRow: {
    flexDirection: 'row', backgroundColor: '#0D1526',
    borderRadius: 18, marginBottom: 16,
    borderWidth: 1, borderColor: '#1A2540', overflow: 'hidden',
  },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  statBoxDivider: { borderLeftWidth: 1, borderColor: '#1A2540' },
  statNum: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  statLabel: { fontSize: 10, color: '#2A4A70', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0D1526', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A2540',
    paddingHorizontal: 16, height: 48, marginBottom: 14,
  },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 14 },

  filtrosScroll: { marginBottom: 16 },
  filtroBtn: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    marginRight: 8, backgroundColor: '#0D1526',
    borderWidth: 1, borderColor: '#1A2540',
  },
  filtroBtnActive: { backgroundColor: '#4F8EF7', borderColor: '#4F8EF7' },
  filtroText: { fontSize: 13, fontWeight: '600', color: '#4A6FA5' },
  filtroTextActive: { color: '#FFFFFF' },

  count: { fontSize: 12, fontWeight: '700', color: '#2A4A70', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 10 },
  emptyText: { color: '#2A4A70', fontSize: 14 },

  card: {
    backgroundColor: '#0D1526', borderRadius: 18,
    padding: 18, marginBottom: 12,
    borderWidth: 1, borderColor: '#1A2540',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  avatar: {
    width: 44, height: 44, borderRadius: 13,
    justifyContent: 'center', alignItems: 'center',
    marginRight: 12, borderWidth: 1,
  },
  avatarText: { fontSize: 14, fontWeight: '800' },
  info: { flex: 1 },
  nombre: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  dni: { fontSize: 12, color: '#2A4A70', marginTop: 2, fontWeight: '500' },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  editBtn: {
    width: 30, height: 30, borderRadius: 9,
    backgroundColor: 'rgba(79,142,247,0.1)',
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  divider: { height: 1, backgroundColor: '#111D35', marginBottom: 14 },
  details: { gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 13, color: '#4A6FA5', fontWeight: '500', flex: 1 },

  // FAB
  fab: {
    position: 'absolute', bottom: 28, right: 20,
  },
  fabBtn: {
    width: 58, height: 58, borderRadius: 18,
    backgroundColor: '#4F8EF7',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#4F8EF7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45, shadowRadius: 16, elevation: 10,
  },
});

// ─────────────────────────────────────────────
// ESTILOS DEL MODAL
// ─────────────────────────────────────────────

const M = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: '#060B18' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 56 : 24,
    paddingBottom: 20,
    borderBottomWidth: 1, borderBottomColor: '#0D1A2E',
    backgroundColor: '#0A1120',
  },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  modalIconBox: {
    width: 42, height: 42, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center',
  },
  modalTitulo: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  modalSubtitulo: { fontSize: 12, color: '#4A6FA5', marginTop: 2 },
  btnCerrar: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#111D35',
    justifyContent: 'center', alignItems: 'center',
  },

  formScroll: { flex: 1 },
  formContent: { padding: 20 },

  fieldRow: { flexDirection: 'row', marginBottom: 0 },
  fieldGroup: { marginBottom: 16 },
  fieldLabel: {
    fontSize: 11, fontWeight: '700', color: '#2A4A70',
    letterSpacing: 0.8, textTransform: 'uppercase',
    marginBottom: 8,
  },
  inputWrap: {
    backgroundColor: '#0D1526', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#1A2540',
    height: 50, justifyContent: 'center', paddingHorizontal: 14,
  },
  input: { color: '#FFFFFF', fontSize: 14, flex: 1 },

  selectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  chip: {
    backgroundColor: '#0D1526', paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#1A2540',
  },
  chipTexto: { color: '#4A6FA5', fontSize: 12, fontWeight: '700' },

  btnGuardar: {
    backgroundColor: '#4F8EF7',
    height: 56, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, marginTop: 8,
    shadowColor: '#4F8EF7',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35, shadowRadius: 14, elevation: 8,
  },
  btnGuardarTexto: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});