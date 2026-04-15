import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

// ─────────────────────────────────────────────
// TIPOS Y CONSTANTES
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

const COLORS = {
  background: '#060B18', // Very dark map background fallback
  panelBg: 'rgba(13, 17, 23, 0.95)', // Deep dark indigo
  panelBorder: 'rgba(58, 65, 80, 0.5)',
  accent: '#007BFF', // Electric blue
  accentGlow: 'rgba(0, 123, 255, 0.3)',
  success: '#00E676', // Neon green
  warning: '#F59E0B', // Amber
  danger: '#EF4444', // Red
  textSecondary: '#8B949E',
  divider: 'rgba(255, 255, 255, 0.08)',
};

const REGION_INICIAL = {
  latitude: -34.6037,
  longitude: -58.3816,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

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
  if (latitud == null || !ultimaActualizacion) return COLORS.danger;
  const diffMin = (Date.now() - new Date(ultimaActualizacion).getTime()) / 60000;
  if (diffMin > 10) return COLORS.danger;
  if (diffMin > 3) return COLORS.warning;
  return COLORS.success;
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
  const insets = useSafeAreaInsets();

  const handleZoom = async (isZoomIn: boolean) => {
    if (!mapRef.current) return;
    const camera = await mapRef.current.getCamera();
    if (camera && camera.zoom !== undefined) {
      mapRef.current.animateCamera({ zoom: camera.zoom + (isZoomIn ? 1 : -1) });
    }
  };

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

  // -- 2.5 Fetch paradas (para Admin)
  const [paradas, setParadas] = useState<any[]>([]);
  const [esAdmin, setEsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email === 'maxirusso20@gmail.com') {
        setEsAdmin(true);
        supabase.from('rutas_activas').select('*').then(({ data: paradasData }) => {
          if (paradasData) setParadas(paradasData);
        });

        const paradasChannel = supabase
          .channel('mapa-paradas-sync')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'rutas_activas' }, (payload) => {
            if (payload.eventType === 'INSERT') {
              setParadas(prev => [...prev, payload.new]);
            } else if (payload.eventType === 'DELETE') {
              setParadas(prev => prev.filter(p => p.id !== payload.old.id));
            }
          })
          .subscribe();

        return () => {
          supabase.removeChannel(paradasChannel);
        };
      }
    });
  }, []);

  // ── 3. GPS en foreground
  useEffect(() => {
    let active = true;

    const iniciarRastreo = async () => {
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
        } catch { }
      }

      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (active) setMiUbicacion({ latitud: pos.coords.latitude, longitud: pos.coords.longitude });
      } catch { }

      try {
        watcherRef.current = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            distanceInterval: 15,
            timeInterval: 10000,
            mayShowUserSettingsDialog: false,
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
      { edgePadding: { top: 120, right: 40, bottom: 180, left: 40 }, animated: true }
    );
  };

  if (cargando) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={COLORS.accent} />
        <Text style={styles.loaderText}>Conectando con la red logística...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── MAPA (Fondo Absoluto) ── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={REGION_INICIAL}
        showsUserLocation={true}
        showsMyLocationButton={false}
        zoomControlEnabled={false}
        mapType="standard"
        userInterfaceStyle="dark"
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

        {esAdmin && paradas.map(p => {
          if (!p.lat || !p.lng) return null;
          return (
            <Marker
              key={`parada-${p.id}`}
              coordinate={{ latitude: Number(p.lat), longitude: Number(p.lng) }}
              title={`Dirección: ${p.direccion}`}
              description={`Estado: ${p.estado || 'pendiente'} · Chofer: ${p.chofer_id}`}
              pinColor="#8B5CF6" // Purple marker for stops
            />
          );
        })}
      </MapView>

      {/* ── PANEL SUPERIOR: Estadísticas Unificadas ── */}
      <View style={[styles.statsBarPremium, { paddingTop: Math.max(insets.top, 20) }]}>
        <View style={styles.statsHeaderRow}>
          <Text style={styles.statsTitle}>VEHÍCULOS EN RED</Text>
          <Ionicons name="git-network-outline" size={18} color={COLORS.accent} />
        </View>
        <View style={styles.statsGrid}>
          <View style={styles.statBlock}>
             <View style={styles.statBlockHeader}>
               <Text style={styles.statLabelPremium}>TOTAL</Text>
               <View style={[styles.statIndicator, { backgroundColor: COLORS.warning }]} />
             </View>
             <Text style={styles.statNumPremium}>{vehiculosConGPS.length}</Text>
          </View>
          <View style={styles.statBlock}>
             <View style={styles.statBlockHeader}>
               <Text style={styles.statLabelPremium}>ONLINE</Text>
               <View style={[styles.statIndicator, { backgroundColor: COLORS.success }]} />
             </View>
             <Text style={styles.statNumPremium}>{enMovimiento}</Text>
          </View>
          <View style={styles.statBlock}>
             <View style={styles.statBlockHeader}>
               <Text style={styles.statLabelPremium}>OFFLINE</Text>
               <View style={[styles.statIndicator, { backgroundColor: sinSeñal > 0 ? COLORS.danger : COLORS.textSecondary }]} />
             </View>
             <Text style={[styles.statNumPremium, { color: sinSeñal > 0 ? COLORS.danger : '#FFF' }]}>{sinSeñal}</Text>
          </View>
        </View>
      </View>

      {/* ── BOTONES DE ACCIÓN FLOTANTES (Derecha) ── */}
      <View style={[styles.actionButtons, { top: Math.max(insets.top, 20) + 120 }]}>
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

      {/* ── CONTROLES DE ZOOM INTEGRADOS (Izquierda) ── */}
      <View style={[
        styles.zoomCluster,
        { bottom: Math.max(insets.bottom, 20) + (choferSeleccionado ? 260 : 30) }
      ]}>
        <View style={styles.zoomControlsContainer}>
          <TouchableOpacity style={[styles.zoomBtn, styles.zoomBtnTop]} onPress={() => handleZoom(true)} activeOpacity={0.8}>
            <Ionicons name="add" size={24} color="#FFF" />
          </TouchableOpacity>
          <View style={styles.zoomDivider} />
          <TouchableOpacity style={[styles.zoomBtn, styles.zoomBtnBottom]} onPress={() => handleZoom(false)} activeOpacity={0.8}>
            <Ionicons name="remove" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
        <View style={styles.scaleIndicator}>
          <Text style={styles.scaleText}>MAPA</Text>
        </View>
      </View>

      {/* ── BANNER ERROR GPS ── */}
      {errorPermiso && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={15} color="#FFF" />
          <Text style={styles.errorText}>{errorPermiso}</Text>
          <TouchableOpacity onPress={() => setErrorPermiso(null)}>
            <Ionicons name="close" size={15} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── TIMESTAMP DE ÚLTIMA ACTUALIZACIÓN ── */}
      {ultimaActualizacion && !choferSeleccionado && (
        <View style={[styles.timestampBadge, { bottom: Math.max(insets.bottom, 20) + 10, alignSelf: 'center' }]}>
          <Ionicons name="pulse" size={12} color={COLORS.accent} />
          <Text style={styles.timestampText}>
            RED SINCRONIZADA · {ultimaActualizacion.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      )}

      {/* ── PANEL INFERIOR: DETALLE DEL VEHÍCULO ── */}
      {choferSeleccionado && (
        <View style={[styles.detailPanelPremium, { bottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.detailPreHeader}>
            <View style={styles.detailBadge}>
              <Text style={styles.detailBadgeText}>UNIDAD #{choferSeleccionado.id}</Text>
            </View>
            <View style={[styles.statusDotPremium, { backgroundColor: getColorEstado(choferSeleccionado.latitud, choferSeleccionado.ultima_actualizacion) }]} />
          </View>

          <View style={styles.detailGrid}>
            <View style={styles.detailGridItem}>
              <View style={styles.detailGridIconBox}>
                <Ionicons name="person" size={16} color={COLORS.textSecondary} />
              </View>
              <View style={styles.detailGridTextContainer}>
                <Text style={styles.detailGridLabel}>Chofer Asignado</Text>
                <Text style={styles.detailGridValue} numberOfLines={1}>{choferSeleccionado.nombre}</Text>
              </View>
            </View>

            <View style={styles.detailGridItem}>
              <View style={styles.detailGridIconBox}>
                <Ionicons name="map" size={16} color={COLORS.textSecondary} />
              </View>
              <View style={styles.detailGridTextContainer}>
                <Text style={styles.detailGridLabel}>Zona Operativa</Text>
                <Text style={styles.detailGridValue} numberOfLines={1}>
                  {Array.isArray(choferSeleccionado.zona) ? choferSeleccionado.zona.join(', ') : choferSeleccionado.zona || 'CENTRAL'}
                </Text>
              </View>
            </View>

            <View style={styles.detailGridItem}>
              <View style={styles.detailGridIconBox}>
                <Ionicons name="time" size={16} color={COLORS.textSecondary} />
              </View>
              <View style={styles.detailGridTextContainer}>
                <Text style={styles.detailGridLabel}>Último Reporte</Text>
                <Text style={styles.detailGridValue}>{formatTiempo(choferSeleccionado.ultima_actualizacion)}</Text>
              </View>
            </View>

            <View style={styles.detailGridItem}>
              <View style={styles.detailGridIconBox}>
                <Ionicons name="locate" size={16} color={COLORS.textSecondary} />
              </View>
              <View style={styles.detailGridTextContainer}>
                <Text style={styles.detailGridLabel}>Estado GPS</Text>
                <Text style={styles.detailGridValue} numberOfLines={1}>{choferSeleccionado.condicion || 'ACTIVO'}</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity onPress={() => setChoferSeleccionado(null)} style={styles.closeButtonPremium} activeOpacity={0.8}>
            <Text style={styles.closeButtonText}>OCULTAR PANEL</Text>
          </TouchableOpacity>
        </View>
      )}

    </View>
  );
}

// ─────────────────────────────────────────────
// ESTILOS PREMIUM
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loader: { flex: 1, backgroundColor: COLORS.background, justifyContent: 'center', alignItems: 'center' },
  loaderText: { color: COLORS.textSecondary, marginTop: 14, fontSize: 13, letterSpacing: 1 },

  // --- Header Stats Premium ---
  statsBarPremium: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    backgroundColor: COLORS.panelBg,
    borderBottomWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.panelBorder,
    paddingHorizontal: 24,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 15,
  },
  statsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    marginTop: 4,
  },
  statsTitle: {
    flex: 1,
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2.5,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statBlock: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  statBlockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  statLabelPremium: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  statNumPremium: {
    fontSize: 26,
    fontWeight: '800',
    color: '#FFF',
  },

  // --- Action Buttons Flotantes ---
  actionButtons: {
    position: 'absolute',
    right: 16,
    gap: 12,
  },
  actionBtn: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: COLORS.accent,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: COLORS.accentGlow,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8, shadowRadius: 12, elevation: 8,
  },
  actionBtnSecondary: {
    backgroundColor: COLORS.panelBg,
    borderWidth: 1, borderColor: COLORS.panelBorder,
    shadowColor: '#000',
  },

  // --- Controles de Zoom Integrados ---
  zoomCluster: {
    position: 'absolute',
    left: 16,
    alignItems: 'center',
  },
  zoomControlsContainer: {
    borderRadius: 16,
    backgroundColor: COLORS.panelBg,
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
    elevation: 10,
    overflow: 'hidden',
    width: 48,
  },
  zoomBtn: {
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  zoomBtnTop: {
    borderBottomWidth: 0,
  },
  zoomBtnBottom: {
    borderTopWidth: 0,
  },
  zoomDivider: {
    height: 1,
    backgroundColor: COLORS.divider,
    marginHorizontal: 8,
  },
  scaleIndicator: {
    marginTop: 10,
    backgroundColor: COLORS.panelBg,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
  },
  scaleText: {
    fontSize: 9,
    color: COLORS.textSecondary,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // --- Detail Panel Premium ---
  detailPanelPremium: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: COLORS.panelBg,
    borderRadius: 28,
    padding: 24,
    borderWidth: 1,
    borderColor: COLORS.panelBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  detailPreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  detailBadge: {
    backgroundColor: COLORS.accentGlow,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0, 123, 255, 0.5)',
  },
  detailBadgeText: {
    color: COLORS.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  statusDotPremium: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: COLORS.panelBg,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    marginBottom: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderColor: COLORS.divider,
  },
  detailGridItem: {
    width: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailGridIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
  },
  detailGridTextContainer: {
    flex: 1,
  },
  detailGridLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  detailGridValue: {
    fontSize: 13,
    color: '#FFF',
    fontWeight: '700',
    marginTop: 4,
  },
  closeButtonPremium: {
    backgroundColor: COLORS.accent,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 8,
  },
  closeButtonText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
  },

  // --- Auxiliares ---
  errorBanner: {
    position: 'absolute',
    top: 150,
    left: 16,
    right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: COLORS.danger, borderRadius: 16,
    padding: 16,
    shadowColor: COLORS.danger, shadowOpacity: 0.4, shadowRadius: 10, elevation: 8,
  },
  errorText: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  timestampBadge: {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(13, 17, 23, 0.8)', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1, borderColor: COLORS.panelBorder,
  },
  timestampText: { fontSize: 10, color: COLORS.textSecondary, fontWeight: '700', letterSpacing: 1 },
});