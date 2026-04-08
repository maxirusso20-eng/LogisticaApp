// app/(drawer)/personal.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

interface Chofer {
  id: number;
  nombre: string;
  dni: string;
  celular: string;
  condicion: string; // 'TITULAR' | 'SUPLENTE' | 'COLECTADOR'
  vehiculo: string | string[];
  zona: string | string[];
  orden?: number | null;
}

/** Mapea la condicion de la DB a un badge visual */
const getCondicionCfg = (condicion: string) => {
  const c = (condicion || '').toUpperCase();
  if (c === 'TITULAR')    return { label: 'Titular',    color: '#4F8EF7', bg: 'rgba(79,142,247,0.12)' };
  if (c === 'COLECTADOR') return { label: 'Colectador', color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' };
  return                           { label: 'Suplente',   color: '#34D399', bg: 'rgba(52,211,153,0.12)' };
};

/** Extrae el primer vehículo si es array, o devuelve el string directamente */
const getVehiculo = (v: string | string[]): string => {
  if (Array.isArray(v)) return v[0] || '—';
  return v || '—';
};

function ChoferCard({ item, index }: { item: Chofer; index: number }) {
  const fade = useRef(new Animated.Value(0)).current;
  const cfg = getCondicionCfg(item.condicion);
  const initials = (item.nombre || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
  const vehiculoTexto = getVehiculo(item.vehiculo);
  const zonaTexto = Array.isArray(item.zona) ? item.zona.join(', ') : (item.zona || '—');

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 400, delay: index * 70, useNativeDriver: true }).start();
  }, []);

  const AVATAR_COLORS = ['#4F8EF7', '#34D399', '#F59E0B', '#A78BFA', '#F472B6', '#FB923C'];
  const avatarColor = AVATAR_COLORS[index % AVATAR_COLORS.length];

  return (
    <Animated.View style={[styles.card, { opacity: fade }]}>
      <View style={styles.cardTop}>
        <View style={[styles.avatar, { backgroundColor: avatarColor + '20', borderColor: avatarColor + '40' }]}>
          <Text style={[styles.avatarText, { color: avatarColor }]}>{initials}</Text>
        </View>
        <View style={styles.info}>
          <Text style={styles.nombre}>{item.nombre}</Text>
          <Text style={styles.dni}>DNI {item.dni}  ·  ID {item.id}</Text>
        </View>
        <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
          <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
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

      <View style={styles.cardFooter}>
        <Ionicons name="person-outline" size={13} color="#4A6FA5" />
        <Text style={styles.rutasText}>{item.condicion || 'Sin condición'}</Text>
      </View>
    </Animated.View>
  );
}

export default function PersonalScreen() {
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<'todos' | 'TITULAR' | 'SUPLENTE' | 'COLECTADOR'>('todos');
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [cargando, setCargando] = useState(true);

  const fetchChoferes = useCallback(async () => {
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
    }
  }, []);

  useEffect(() => {
    fetchChoferes();

    const channel = supabase
      .channel('personal-choferes-sync')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Choferes' }, fetchChoferes)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Choferes' }, fetchChoferes)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'Choferes' }, fetchChoferes)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [fetchChoferes]);

  const titulares   = choferes.filter(c => (c.condicion || '').toUpperCase() === 'TITULAR').length;
  const suplentes   = choferes.filter(c => (c.condicion || '').toUpperCase() === 'SUPLENTE').length;

  const filtrados = choferes.filter(c => {
    const matchSearch = (c.nombre || '').toLowerCase().includes(search.toLowerCase());
    const matchFiltro = filtro === 'todos' || (c.condicion || '').toUpperCase() === filtro;
    return matchSearch && matchFiltro;
  });

  if (cargando) {
    return (
      <View style={{ flex: 1, backgroundColor: '#060B18', justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#4F8EF7" />
        <Text style={{ color: '#4A6FA5', marginTop: 12, fontSize: 13 }}>Cargando personal...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

      {/* Stats rápidas */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{choferes.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statBox, styles.statBoxMid]}>
          <Text style={[styles.statNum, { color: '#4F8EF7' }]}>{titulares}</Text>
          <Text style={styles.statLabel}>Titulares</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: '#34D399' }]}>{suplentes}</Text>
          <Text style={styles.statLabel}>Suplentes</Text>
        </View>
      </View>

      {/* Buscador */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color="#2A4A70" style={{ marginRight: 10 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar chofer..."
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

      {/* Filtros */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filtrosScroll}>
        {(['todos', 'TITULAR', 'SUPLENTE', 'COLECTADOR'] as const).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filtroBtn, filtro === f && styles.filtroBtnActive]}
            onPress={() => setFiltro(f)}
          >
            <Text style={[styles.filtroText, filtro === f && styles.filtroTextActive]}>
              {f === 'todos' ? 'Todos' : f === 'TITULAR' ? 'Titulares' : f === 'SUPLENTE' ? 'Suplentes' : 'Colectadores'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.count}>{filtrados.length} chofer{filtrados.length !== 1 ? 'es' : ''}</Text>

      {filtrados.length === 0 && (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <Ionicons name="people-outline" size={48} color="#1A2540" />
          <Text style={{ color: '#2A4A70', marginTop: 12, fontSize: 14 }}>Sin resultados</Text>
        </View>
      )}
      {filtrados.map((c, i) => <ChoferCard key={c.id} item={c} index={i} />)}
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060B18' },
  content: { padding: 20 },
  statsRow: {
    flexDirection: 'row', backgroundColor: '#0D1526',
    borderRadius: 18, marginBottom: 16,
    borderWidth: 1, borderColor: '#1A2540', overflow: 'hidden',
  },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 18 },
  statBoxMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#1A2540' },
  statNum: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  statLabel: { fontSize: 11, color: '#2A4A70', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
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
  badge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  divider: { height: 1, backgroundColor: '#111D35', marginBottom: 14 },
  details: { gap: 8, marginBottom: 14 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  detailText: { fontSize: 13, color: '#4A6FA5', fontWeight: '500' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rutasText: { fontSize: 12, color: '#2A4A70', fontWeight: '600' },
});