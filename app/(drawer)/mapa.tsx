// app/(drawer)/mapa.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { supabase } from '../../lib/supabase';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

interface ChoferConGPS {
  id: number;
  nombre: string;
  condicion: string;
  zona: string | string[];
  latitud: number | null;
  longitud: number | null;
  ultima_actualizacion: string | null;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const formatTiempo = (iso: string | null): string => {
  if (!iso) return 'Sin datos';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `Hace ${diff}s`;
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  return `Hace ${Math.floor(diff / 3600)} h`;
};

const getColorEstado = (latitud: number | null, ultimaActualizacion: string | null): string => {
  if (latitud == null || !ultimaActualizacion) return '#EF4444';
  const diffMin = (Date.now() - new Date(ultimaActualizacion).getTime()) / 60000;
  if (diffMin > 10) return '#EF4444';
  if (diffMin > 3) return '#F59E0B';
  return '#34D399';
};

const REGION_INICIAL = {
  latitude: -34.6037,
  longitude: -58.3816,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

// ─────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────

export default function MapaScreen() {
  const [vehiculos, setVehiculos] = useState<ChoferConGPS[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorPermiso, setErrorPermiso] = useState<string | null>(null);
  const [miUbicacion, setMiUbicacion] = useState<{ latitud: number; longitud: number } | null>(null);
  const [choferSeleccionado, setChoferSeleccionado] = useState<ChoferConGPS | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  const mapRef = useRef<MapView>(null);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  // ── 1. Fetch inicial de choferes con GPS
  const fetchVehiculos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('Choferes')
        .select('id, nombre, condicion, zona, latitud, longitud, ultima_actualizacion')
        .order('orden', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setVehiculos(data || []);
      setUltimaActualizacion(new Date());
    } catch (err) {
      console.error('Error cargando vehículos:', err);
    } finally {
      setCargando(false);
    }
  }, []);

  // ── 2. Realtime: actualización incremental
  const handleRealtimeUpdate = useCallback((payload: any) => {
    const updated = payload.new as ChoferConGPS;
    setVehiculos(prev => {
      const existe = prev.find(v => v.id === updated.id);
      if (!existe) return [...prev, updated];
      return prev.map(v => v.id === updated.id ? { ...v, ...updated } : v);
    });
    setUltimaActualizacion(new Date());
    setChoferSeleccionado(prev =>
      prev?.id === updated.id ? { ...prev, ...updated } : prev
    );
  }, []);

  const handleRealtimeDelete = useCallback((payload: any) => {
    const deleted = payload.old as { id: number };
    setVehiculos(prev => prev.filter(v => v.id !== deleted.id));
    setChoferSeleccionado(prev => prev?.id === deleted.id ? null : prev);
  }, []);

  useEffect(() => {
    fetchVehiculos();

    const channel = supabase
      .channel('mapa-gps-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Choferes' }, handleRealtimeUpdate)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Choferes' }, fetchVehiculos)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'Choferes' }, handleRealtimeDelete)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [fetchVehiculos, handleRealtimeUpdate, handleRealtimeDelete]);

  // ── 3. GPS en foreground — sin background tasks
  useEffect(() => {
    let active = true;

    const iniciarRastreo = async () => {
      // Pedir solo permiso de foreground (whenInUse)
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorPermiso('Permiso de ubicación denegado. Activalo en Configuración.');
          return;
        }
      } catch (err) {
        console.warn('[GPS] Error pidiendo permisos:', err);
        return;
      }

      // Obtener el ID del chofer logueado (puede ser null si el usuario es admin)
      const { data: { user } } = await supabase.auth.getUser();
      let choferId: number | null = null;
      if (user) {
        try {
          const { data: choferData } = await supabase
            .from('Choferes')
            .select('id')
            .eq('user_id', user.id)
            .maybeSingle();
          choferId = choferData?.id ?? null;
        } catch {
          // No crítico — el mapa sigue mostrando otros vehículos
        }
      }

      // Posición inicial rápida
      try {
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (active) {
          setMiUbicacion({ latitud: pos.coords.latitude, longitud: pos.coords.longitude });
        }
      } catch {
        // No bloquea el flujo si falla
      }

      // Watcher en foreground — wrapped en try/catch para el error de background
      try {
        watcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 15,
            timeInterval: 10000,
            mayShowUserSettingsDialog: false, // evita el diálogo de "siempre permitir"
          },
          async (location) => {
            if (!active) return;
            const { latitude, longitude } = location.coords;
            setMiUbicacion({ latitud: latitude, longitud: longitude });

            if (choferId) {
              try {
                await supabase.from('Choferes').update({
                  latitud: latitude,
                  longitud: longitude,
                  ultima_actualizacion: new Date().toISOString(),
                }).eq('id', choferId);
              } catch (err) {
                console.warn('[GPS] Error actualizando posición:', err);
              }
            }
          }
        );
      } catch (err) {
        // FIX PRINCIPAL: captura el error de background no configurado.
        // La pantalla sigue siendo 100% funcional — solo no actualiza la posición propia.
        console.warn('[GPS] watchPositionAsync no disponible:', err);
        setErrorPermiso('GPS no disponible en este modo. El mapa sigue activo.');
      }
    };

    iniciarRastreo();

    return () => {
      active = false;
      watcherRef.current?.remove();
      watcherRef.current = null;
    };
  }, []);

  // ── Estadísticas
  const enMovimiento = vehiculos.filter(v => {
    if (!v.ultima_actualizacion || v.latitud == null) return false;
    return (Date.now() - new Date(v.ultima_actualizacion).getTime()) / 60000 <= 3;
  }).length;
  const sinSeñal = vehiculos.filter(v => v.latitud == null).length;
  const vehiculosConGPS = vehiculos.filter(v => v.latitud != null && v.longitud != null);

  const centrarEnMi = () => {
    if (!miUbicacion || !mapRef.current) return;
    mapRef.current.animateToRegion({
      latitude: miUbicacion.latitud,
      longitude: miUbicacion.longitud,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    }, 600);
  };

  const centrarEnTodos = () => {
    if (!mapRef.current || vehiculosConGPS.length === 0) return;
    mapRef.current.fitToCoordinates(
      vehiculosConGPS.map(v => ({ latitude: Number(v.latitud), longitude: Number(v.longitud) })),
      { edgePadding: { top: 80, right: 40, bottom: 120, left: 40 }, animated: true }
    );
  };

  if (cargando) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#4F8EF7" />
        <Text style={styles.loaderText}>Conectando GPS...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>

      {/* ── MAPA ── */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={REGION_INICIAL}
        showsUserLocation={true}
        showsMyLocationButton={false}
        mapType="standard"
      >
        {vehiculosConGPS.map(v => (
          <Marker
            key={v.id}
            coordinate={{ latitude: Number(v.latitud), longitude: Number(v.longitud) }}
            title={v.nombre}
            description={`${v.condicion || ''} · ${formatTiempo(v.ultima_actualizacion)}`}
            pinColor={getColorEstado(v.latitud, v.ultima_actualizacion)}
            onPress={() => setChoferSeleccionado(v)}
          />
        ))}
      </MapView>

      {/* ── BARRA SUPERIOR: estadísticas ── */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: '#34D399' }]}>{enMovimiento}</Text>
          <Text style={styles.statLabel}>En ruta</Text>
        </View>
        <View style={[styles.statItem, styles.statItemMid]}>
          <Text style={styles.statNum}>{vehiculosConGPS.length}</Text>
          <Text style={styles.statLabel}>Con GPS</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={[styles.statNum, { color: sinSeñal > 0 ? '#EF4444' : '#6B7280' }]}>{sinSeñal}</Text>
          <Text style={styles.statLabel}>Sin señal</Text>
        </View>
      </View>

      {/* ── BOTONES de acción (columna derecha) ── */}
      <View style={styles.actionButtons}>
        {miUbicacion && (
          <TouchableOpacity style={styles.actionBtn} onPress={centrarEnMi} activeOpacity={0.8}>
            <Ionicons name="navigate" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        {vehiculosConGPS.length > 0 && (
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={centrarEnTodos} activeOpacity={0.8}>
            <Ionicons name="contract-outline" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={fetchVehiculos} activeOpacity={0.8}>
          <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {/* ── BANNER: error de permisos ── */}
      {errorPermiso && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={15} color="#F59E0B" />
          <Text style={styles.errorText}>{errorPermiso}</Text>
          <TouchableOpacity onPress={() => setErrorPermiso(null)}>
            <Ionicons name="close" size={15} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Timestamp última actualización ── */}
      {ultimaActualizacion && !choferSeleccionado && (
        <View style={styles.timestampBar}>
          <Ionicons name="sync-outline" size={11} color="#2A4A70" />
          <Text style={styles.timestampText}>
            Act. {ultimaActualizacion.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </Text>
        </View>
      )}

      {/* ── PANEL INFERIOR: detalle del chofer seleccionado ── */}
      {choferSeleccionado && (
        <View style={styles.detailPanel}>
          <View style={styles.detailHeader}>
            <View style={[styles.statusDot, { backgroundColor: getColorEstado(choferSeleccionado.latitud, choferSeleccionado.ultima_actualizacion) }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.detailNombre}>{choferSeleccionado.nombre}</Text>
              <Text style={styles.detailSub}>
                {choferSeleccionado.condicion} · {Array.isArray(choferSeleccionado.zona) ? choferSeleccionado.zona.join(', ') : choferSeleccionado.zona || '—'}
              </Text>
            </View>
            <TouchableOpacity onPress={() => setChoferSeleccionado(null)} style={styles.btnCerrarDetail}>
              <Ionicons name="close" size={18} color="#4A6FA5" />
            </TouchableOpacity>
          </View>
          <View style={styles.detailCoords}>
            <Ionicons name="location-outline" size={13} color="#2A4A70" />
            <Text style={styles.detailCoordsText}>
              {Number(choferSeleccionado.latitud).toFixed(5)}°S · {Number(choferSeleccionado.longitud).toFixed(5)}°O
            </Text>
            <Text style={styles.detailTiempo}>{formatTiempo(choferSeleccionado.ultima_actualizacion)}</Text>
          </View>
        </View>
      )}

    </View>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060B18' },
  loader: { flex: 1, backgroundColor: '#060B18', justifyContent: 'center', alignItems: 'center' },
  loaderText: { color: '#4A6FA5', marginTop: 12, fontSize: 13 },
  map: { flex: 1 },

  statsBar: {
    position: 'absolute', top: 12, left: 16, right: 16,
    flexDirection: 'row',
    backgroundColor: 'rgba(13,21,38,0.92)',
    borderRadius: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.18)',
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statItemMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: 'rgba(79,142,247,0.15)' },
  statNum: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
  statLabel: { fontSize: 10, color: '#2A4A70', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },

  actionButtons: {
    position: 'absolute',
    top: 90,
    right: 16,
    gap: 10,
  },
  actionBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#4F8EF7',
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#4F8EF7', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
  },
  actionBtnSecondary: {
    backgroundColor: 'rgba(13,21,38,0.92)',
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.3)',
    shadowColor: '#000',
  },

  errorBanner: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(245,158,11,0.92)', borderRadius: 12,
    padding: 12,
  },
  errorText: { flex: 1, color: '#FFFFFF', fontSize: 12, fontWeight: '600' },

  timestampBar: {
    position: 'absolute', bottom: 16, left: 16,
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(13,21,38,0.85)', borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.1)',
  },
  timestampText: { fontSize: 11, color: '#2A4A70', fontWeight: '600' },

  detailPanel: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    backgroundColor: 'rgba(13,21,38,0.96)',
    borderRadius: 20, padding: 16,
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.2)',
  },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  detailNombre: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  detailSub: { fontSize: 12, color: '#2A4A70', marginTop: 2, fontWeight: '500' },
  btnCerrarDetail: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#0D1526', justifyContent: 'center', alignItems: 'center',
  },
  detailCoords: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailCoordsText: { flex: 1, fontSize: 12, color: '#3A5A80', fontFamily: 'monospace', fontWeight: '500' },
  detailTiempo: { fontSize: 11, color: '#1A3050', fontWeight: '600' },
});