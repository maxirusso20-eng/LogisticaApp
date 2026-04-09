// app/(drawer)/colectas.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { startTracking, stopTracking } from '../../lib/locationTracker';
import { supabase } from '../../lib/supabase';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

interface Cliente {
  id: number | string;
  cliente: string;
  direccion: string;
  horario: string;
  chofer: string;
  completado: boolean;
}

type FiltroColecta = 'todas' | 'pendientes' | 'completadas';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/** Devuelve el saludo según la hora local */
const getSaludo = (): string => {
  const hora = new Date().getHours();
  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
};

/** Abre la dirección en la app de mapas por defecto */
const abrirMapa = (direccion: string) => {
  if (!direccion) return;
  const urlEncoded = encodeURIComponent(direccion);
  const url = Platform.select({
    ios: `maps:0,0?q=${urlEncoded}`,
    android: `geo:0,0?q=${urlEncoded}`,
    default: `https://www.google.com/maps/search/?api=1&query=${urlEncoded}`,
  });
  
  if (url) {
    Linking.openURL(url).catch(err => console.error('Error abriendo mapa:', err));
  }
};

// ─────────────────────────────────────────────
// TARJETA DE COLECTA
// ─────────────────────────────────────────────

function ColectaCard({
  item,
  index,
  onToggle,
  toggling,
}: {
  item: Cliente;
  index: number;
  onToggle: (id: number | string, actual: boolean) => void;
  toggling: boolean;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1,
      duration: 350,
      delay: index * 55,
      useNativeDriver: true,
    }).start();
  }, []);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 70, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 70, useNativeDriver: true }),
    ]).start();
    onToggle(item.id, item.completado);
  };

  const done = item.completado;

  return (
    <Animated.View
      style={[
        styles.card,
        done && styles.cardDone,
        { opacity: fade, transform: [{ scale }] },
      ]}
    >
      {/* Barra lateral de acento */}
      <View style={[styles.accent, done && styles.accentDone]} />

      <View style={styles.cardBody}>
        {/* Fila superior */}
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.clienteNombre, done && styles.textDone]} numberOfLines={1}>
              {item.cliente || '—'}
            </Text>
            <View style={styles.horarioRow}>
              <Ionicons name="time-outline" size={13} color={done ? '#1A3050' : '#4F8EF7'} />
              <Text style={[styles.horarioText, done && { color: '#1A3050' }]}>
                {item.horario || 'Sin horario'}
              </Text>
            </View>
          </View>

          {/* Botón de completado */}
          <TouchableOpacity
            onPress={handlePress}
            disabled={toggling}
            activeOpacity={0.7}
            style={styles.checkWrap}
          >
            {toggling ? (
              <ActivityIndicator size="small" color="#4F8EF7" />
            ) : (
              <Ionicons
                name={done ? 'checkmark-circle' : 'ellipse-outline'}
                size={30}
                color={done ? '#34D399' : '#1A3050'}
              />
            )}
          </TouchableOpacity>
        </View>

        {/* Detalles */}
        <View style={styles.details}>
          <TouchableOpacity 
            style={styles.addressTouchable}
            activeOpacity={0.6}
            onPress={() => item.direccion && abrirMapa(item.direccion)}
          >
            <Ionicons name="location-outline" size={14} color={done ? '#1A3050' : '#4F8EF7'} />
            <Text style={[styles.detailText, done && styles.textDone]} numberOfLines={2}>
              {item.direccion || '—'}
            </Text>
            {item.direccion ? (
              <View style={[styles.mapNavIconWrap, done && { backgroundColor: 'rgba(26,48,80,0.2)' }]}>
                <Ionicons name="map-outline" size={18} color={done ? '#1A3050' : '#4F8EF7'} />
              </View>
            ) : null}
          </TouchableOpacity>

          <View style={[styles.detailRow, { marginTop: 4, marginLeft: 2 }]}>
            <Ionicons name="person-outline" size={13} color="#2A4A70" />
            <Text style={[styles.detailText, done && styles.textDone]}>
              {item.chofer || 'Sin asignar'}
            </Text>
          </View>
        </View>

        {/* Badge completada */}
        {done && (
          <View style={styles.doneBadge}>
            <Ionicons name="checkmark-done" size={11} color="#34D399" />
            <Text style={styles.doneBadgeText}>Completada</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────

export default function ColectasScreen() {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<FiltroColecta>('todas');
  const [nombreUsuario, setNombre] = useState('');
  const [saludo] = useState(getSaludo); // calculado una vez al montar
  const [toggling, setToggling] = useState<Set<number | string>>(new Set());
  const [gpsStatus, setGpsStatus] = useState<'off' | 'foreground' | 'background' | 'denied'>('off');

  // ── 1. Fetch personalizado por chofer logueado
  const fetchClientes = useCallback(async (mostrarLoader = false) => {
    if (mostrarLoader) setCargando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setCargando(false);
        setRefrescando(false);
        return;
      }

      // Nombre para el saludo
      const displayName: string =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email.split('@')[0];
      setNombre(displayName.split(' ')[0]);

      const { data, error } = await supabase
        .from('Clientes')
        .select('id, cliente, direccion, horario, chofer, completado')
        .eq('email_chofer', user.email)
        .order('horario', { ascending: true });

      if (error) throw error;
      setClientes(data || []);
    } catch (err) {
      console.error('Error cargando clientes:', err);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  useEffect(() => {
    fetchClientes(true);

    const channel = supabase
      .channel('colectas-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Clientes' }, () => fetchClientes())
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [fetchClientes]);

  // ── GPS tracking en segundo plano ─────────────────────────────────────────
  useEffect(() => {
    let montado = true;

    const iniciarGPS = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email || !montado) return;

        const resultado = await startTracking(user.email);
        if (montado) setGpsStatus(resultado);
      } catch (err) {
        console.error('[GPS] Error al iniciar tracking:', err);
      }
    };

    iniciarGPS();

    return () => {
      montado = false;
      void stopTracking().then(() => setGpsStatus('off'));
    };
  }, []);

  const handleRefresh = () => {
    setRefrescando(true);
    fetchClientes();
  };

  // ── 2. Toggle en Supabase con actualización optimista
  const handleToggle = async (id: number | string, actual: boolean) => {
    setClientes(prev =>
      prev.map(c => c.id === id ? { ...c, completado: !actual } : c)
    );
    setToggling(prev => new Set(prev).add(id));

    try {
      const { error } = await supabase
        .from('Clientes')
        .update({ completado: !actual })
        .eq('id', id);

      if (error) {
        // Revertir si falla
        setClientes(prev =>
          prev.map(c => c.id === id ? { ...c, completado: actual } : c)
        );
      }
    } finally {
      setToggling(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // ── Stats totales (no dependen del filtro de búsqueda)
  const totalHechas = clientes.filter(c => c.completado).length;
  const totalPendientes = clientes.length - totalHechas;
  const progreso = clientes.length > 0 ? totalHechas / clientes.length : 0;

  // ── Lista filtrada (búsqueda + tab)
  const filtrados = clientes.filter(c => {
    const matchSearch = (c.cliente || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.direccion || '').toLowerCase().includes(search.toLowerCase());
    const matchFiltro =
      filtro === 'todas' ||
      (filtro === 'completadas' && c.completado) ||
      (filtro === 'pendientes' && !c.completado);
    return matchSearch && matchFiltro;
  });

  if (cargando) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#4F8EF7" />
        <Text style={styles.loaderText}>Cargando colectas...</Text>
      </View>
    );
  }

  return (
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
      {/* ── Saludo dinámico ── */}
      <View style={styles.greetingBox}>
        <View style={styles.greetingTopRow}>
          <Text style={styles.greetingEyebrow}>COLECTAS DE HOY</Text>
          {/* Chip GPS */}
          {gpsStatus !== 'off' && gpsStatus !== 'denied' && (
            <View style={[
              styles.gpsChip,
              gpsStatus === 'background' && styles.gpsChipBackground,
            ]}>
              <View style={styles.gpsDot} />
              <Text style={styles.gpsChipText}>
                {gpsStatus === 'background' ? 'GPS activo' : 'GPS (primer plano)'}
              </Text>
            </View>
          )}
          {gpsStatus === 'denied' && (
            <View style={[styles.gpsChip, styles.gpsChipDenied]}>
              <Ionicons name="location-outline" size={11} color="#F59E0B" />
              <Text style={[styles.gpsChipText, { color: '#F59E0B' }]}>GPS sin permiso</Text>
            </View>
          )}
        </View>
        <Text style={styles.greetingTitle}>
          {saludo}, {nombreUsuario || 'chofer'} 👋
        </Text>
        <Text style={styles.greetingSubtitle}>
          {clientes.length === 0
            ? 'No tenés colectas asignadas hoy.'
            : totalPendientes === 0
              ? '¡Todo completado! Excelente trabajo. ✅'
              : `Tenés ${totalPendientes} colecta${totalPendientes !== 1 ? 's' : ''} pendiente${totalPendientes !== 1 ? 's' : ''}.`
          }
        </Text>
      </View>

      {/* ── Stats totales ── */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{clientes.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statBox, styles.statBoxMid]}>
          <Text style={[styles.statNum, { color: '#34D399' }]}>{totalHechas}</Text>
          <Text style={styles.statLabel}>Hechas</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: totalPendientes > 0 ? '#F59E0B' : '#6B7280' }]}>
            {totalPendientes}
          </Text>
          <Text style={styles.statLabel}>Pendientes</Text>
        </View>
      </View>

      {/* ── Barra de progreso ── */}
      <View style={styles.progressWrap}>
        <View style={styles.progressBg}>
          <Animated.View style={[styles.progressFill, { width: `${progreso * 100}%` as any }]} />
        </View>
        <Text style={styles.progressLabel}>{Math.round(progreso * 100)}% completado</Text>
      </View>

      {/* ── Buscador ── */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color="#2A4A70" style={{ marginRight: 10 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar cliente o dirección..."
          placeholderTextColor="#1A3050"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="#2A4A70" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Filtros por tab ── */}
      <View style={styles.filtrosRow}>
        {([
          { key: 'todas', label: 'Todas', count: clientes.length },
          { key: 'pendientes', label: 'Pendientes', count: totalPendientes },
          { key: 'completadas', label: 'Completadas', count: totalHechas },
        ] as { key: FiltroColecta; label: string; count: number }[]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filtroBtn, filtro === tab.key && styles.filtroBtnActive]}
            onPress={() => setFiltro(tab.key)}
          >
            <Text style={[styles.filtroText, filtro === tab.key && styles.filtroTextActive]}>
              {tab.label}
            </Text>
            <View style={[styles.filtroCount, filtro === tab.key && styles.filtroCountActive]}>
              <Text style={[styles.filtroCountText, filtro === tab.key && styles.filtroCountTextActive]}>
                {tab.count}
              </Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Lista ── */}
      {filtrados.length === 0 && clientes.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bed-outline" size={52} color="#1A2540" />
          <Text style={styles.emptyTitle}>Hoy no tenés colectas asignadas.</Text>
          <Text style={styles.emptySubtitle}>¡Buen descanso!</Text>
        </View>
      ) : filtrados.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={48} color="#1A2540" />
          <Text style={styles.emptyTitle}>Sin resultados</Text>
          <Text style={styles.emptySubtitle}>Probá con otro filtro o búsqueda.</Text>
        </View>
      ) : (
        filtrados.map((c, i) => (
          <ColectaCard
            key={c.id}
            item={c}
            index={i}
            onToggle={handleToggle}
            toggling={toggling.has(c.id)}
          />
        ))
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060B18' },
  content: { padding: 20 },
  loader: { flex: 1, backgroundColor: '#060B18', alignItems: 'center', justifyContent: 'center', gap: 14 },
  loaderText: { color: '#4A6FA5', fontSize: 13, fontWeight: '500' },

  // Stats
  statsRow: {
    flexDirection: 'row', backgroundColor: '#0D1526',
    borderRadius: 18, marginBottom: 14,
    borderWidth: 1, borderColor: '#1A2540', overflow: 'hidden',
  },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statBoxMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#1A2540' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  statLabel: { fontSize: 10, color: '#2A4A70', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },

  // Progreso
  progressWrap: { marginBottom: 14 },
  progressBg: { height: 6, backgroundColor: '#0D1526', borderRadius: 3, borderWidth: 1, borderColor: '#1A2540', marginBottom: 6, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#34D399', borderRadius: 3 },
  progressLabel: { fontSize: 11, color: '#2A4A70', fontWeight: '600', textAlign: 'right' },

  // Buscador
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0D1526', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A2540',
    paddingHorizontal: 16, height: 48, marginBottom: 12,
  },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 14 },

  // Filtros
  filtrosRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filtroBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9, borderRadius: 12,
    backgroundColor: '#0D1526', borderWidth: 1, borderColor: '#1A2540',
  },
  filtroBtnActive: { backgroundColor: 'rgba(79,142,247,0.12)', borderColor: '#4F8EF7' },
  filtroText: { fontSize: 12, fontWeight: '700', color: '#4A6FA5' },
  filtroTextActive: { color: '#4F8EF7' },
  filtroCount: { backgroundColor: '#111D35', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  filtroCountActive: { backgroundColor: 'rgba(79,142,247,0.2)' },
  filtroCountText: { fontSize: 11, fontWeight: '800', color: '#2A4A70' },
  filtroCountTextActive: { color: '#4F8EF7' },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { color: '#4A6FA5', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { color: '#2A4A70', fontSize: 13, fontWeight: '500' },

  // Saludo
  greetingBox: {
    backgroundColor: '#0D1526',
    borderRadius: 18, padding: 20, marginBottom: 16,
    borderWidth: 1, borderColor: '#1A2540',
  },
  greetingTopRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 6,
  },
  greetingEyebrow: { fontSize: 10, fontWeight: '800', color: '#4F8EF7', letterSpacing: 2, textTransform: 'uppercase' },
  greetingTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 4, letterSpacing: -0.3 },
  greetingSubtitle: { fontSize: 13, color: '#4A6FA5', fontWeight: '500' },

  // Chip GPS
  gpsChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(52,211,153,0.10)',
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.25)',
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
  },
  gpsChipBackground: {
    backgroundColor: 'rgba(52,211,153,0.15)',
    borderColor: 'rgba(52,211,153,0.40)',
  },
  gpsChipDenied: {
    backgroundColor: 'rgba(245,158,11,0.10)',
    borderColor: 'rgba(245,158,11,0.25)',
  },
  gpsDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: '#34D399',
  },
  gpsChipText: { fontSize: 10, fontWeight: '700', color: '#34D399', letterSpacing: 0.3 },

  // Tarjeta
  card: {
    flexDirection: 'row',
    backgroundColor: '#0D1526',
    borderRadius: 18, marginBottom: 10,
    borderWidth: 1, borderColor: '#1A2540',
    overflow: 'hidden',
  },
  cardDone: {
    backgroundColor: '#060F1C',
    borderColor: 'rgba(52,211,153,0.15)',
  },
  accent: { width: 4, backgroundColor: '#4F8EF7' },
  accentDone: { backgroundColor: '#34D399' },
  cardBody: { flex: 1, padding: 16 },

  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  clienteNombre: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  horarioRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  horarioText: { fontSize: 13, color: '#4F8EF7', fontWeight: '600' },
  textDone: { color: '#1A3050' },

  checkWrap: { paddingLeft: 12, justifyContent: 'center', minWidth: 42 },

  details: {},
  addressTouchable: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6, marginTop: -2 },
  mapNavIconWrap: { backgroundColor: 'rgba(79,142,247,0.15)', borderRadius: 10, padding: 8, marginLeft: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  detailText: { flex: 1, fontSize: 12, color: '#4A6FA5', fontWeight: '500', lineHeight: 18 },

  doneBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 10, alignSelf: 'flex-start',
    backgroundColor: 'rgba(52,211,153,0.08)',
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.18)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  doneBadgeText: { fontSize: 11, color: '#34D399', fontWeight: '700' },
});