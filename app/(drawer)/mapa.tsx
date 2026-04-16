// app/(drawer)/mapa.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';

interface ChoferConGPS {
  id: number; nombre: string; condicion: string;
  zona: string | string[]; latitud: number | null;
  longitud: number | null; ultima_actualizacion: string | null;
}

const SEM_MAPA = {
  success: '#00E676',
  warning: '#F59E0B',
  danger: '#EF4444',
  textSecondary: '#8B949E',
  divider: 'rgba(255, 255, 255, 0.08)',
};

const REGION_INICIAL = { latitude: -34.6037, longitude: -58.3816, latitudeDelta: 0.5, longitudeDelta: 0.5 };

const formatTiempo = (iso: string | null): string => {
  if (!iso) return 'Sin datos';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `Hace ${diff}s`;
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  return `Hace ${Math.floor(diff / 3600)} h`;
};

const getColorEstado = (latitud: number | null, ultimaActualizacion: string | null): string => {
  if (latitud == null || !ultimaActualizacion) return SEM_MAPA.danger;
  const diffMin = (Date.now() - new Date(ultimaActualizacion).getTime()) / 60000;
  if (diffMin > 10) return SEM_MAPA.danger;
  if (diffMin > 3) return SEM_MAPA.warning;
  return SEM_MAPA.success;
};

export default function MapaScreen() {
  const { colors, isDark } = useTheme();
  const [vehiculos, setVehiculos] = useState<ChoferConGPS[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorPermiso, setErrorPermiso] = useState<string | null>(null);
  const [miUbicacion, setMiUbicacion] = useState<{ latitud: number; longitud: number } | null>(null);
  const [choferSeleccionado, setChoferSeleccionado] = useState<ChoferConGPS | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  const mapRef = useRef<MapView>(null);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);
  const insets = useSafeAreaInsets();

  // Panel colors — siempre oscuros para contraste sobre el mapa
  const panelBg = 'rgba(13, 17, 23, 0.95)';
  const panelBorder = 'rgba(58, 65, 80, 0.5)';
  const accentBlue = '#007BFF';

  const handleZoom = async (isZoomIn: boolean) => {
    if (!mapRef.current) return;
    const camera = await mapRef.current.getCamera();
    if (camera && camera.zoom !== undefined) mapRef.current.animateCamera({ zoom: camera.zoom + (isZoomIn ? 1 : -1) });
  };

  const fetchVehiculos = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('Choferes').select('id, nombre, condicion, zona, latitud, longitud, ultima_actualizacion').order('orden', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setVehiculos(data || []); setUltimaActualizacion(new Date());
    } catch (err) { console.error('Error cargando vehículos:', err); }
    finally { setCargando(false); }
  }, []);

  const handleRealtimeUpdate = useCallback((payload: any) => {
    const updated = payload.new as ChoferConGPS;
    setVehiculos(prev => { const existe = prev.find(v => v.id === updated.id); if (!existe) return [...prev, updated]; return prev.map(v => v.id === updated.id ? { ...v, ...updated } : v); });
    setUltimaActualizacion(new Date());
    setChoferSeleccionado(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev);
  }, []);

  const handleRealtimeDelete = useCallback((payload: any) => {
    const deleted = payload.old as { id: number };
    setVehiculos(prev => prev.filter(v => v.id !== deleted.id));
    setChoferSeleccionado(prev => prev?.id === deleted.id ? null : prev);
  }, []);

  useEffect(() => {
    fetchVehiculos();
    const channel = supabase.channel('mapa-gps-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Choferes' }, handleRealtimeUpdate)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Choferes' }, fetchVehiculos)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'Choferes' }, handleRealtimeDelete)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fetchVehiculos, handleRealtimeUpdate, handleRealtimeDelete]);

  const [paradas, setParadas] = useState<any[]>([]);
  const [esAdmin, setEsAdmin] = useState(false);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email === 'maxirusso20@gmail.com') {
        setEsAdmin(true);
        supabase.from('rutas_activas').select('*').then(({ data: pd }) => { if (pd) setParadas(pd); });
        const pc = supabase.channel('mapa-paradas-sync')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'rutas_activas' }, (payload) => {
            if (payload.eventType === 'INSERT') setParadas(prev => [...prev, payload.new]);
            else if (payload.eventType === 'DELETE') setParadas(prev => prev.filter(p => p.id !== payload.old.id));
          }).subscribe();
        return () => { supabase.removeChannel(pc); };
      }
    });
  }, []);

  useEffect(() => {
    let active = true;
    const iniciarRastreo = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') { setErrorPermiso('Permiso de ubicación denegado. Activalo en Configuración.'); return; }
      } catch (err) { console.warn('[GPS] Error pidiendo permisos:', err); return; }
      const { data: { user } } = await supabase.auth.getUser();
      let choferId: number | null = null;
      if (user) { try { const { data: cd } = await supabase.from('Choferes').select('id').eq('user_id', user.id).maybeSingle(); choferId = cd?.id ?? null; } catch { } }
      try { const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }); if (active) setMiUbicacion({ latitud: pos.coords.latitude, longitud: pos.coords.longitude }); } catch { }
      try {
        watcherRef.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 15, timeInterval: 10000, mayShowUserSettingsDialog: false }, async (location) => {
          if (!active) return;
          const { latitude, longitude } = location.coords;
          setMiUbicacion({ latitud: latitude, longitud: longitude });
          if (choferId) { try { await supabase.from('Choferes').update({ latitud: latitude, longitud: longitude, ultima_actualizacion: new Date().toISOString() }).eq('id', choferId); } catch (err) { console.warn('[GPS]', err); } }
        });
      } catch (err) { console.warn('[GPS] watchPositionAsync no disponible:', err); setErrorPermiso('GPS no disponible en este modo. El mapa sigue activo.'); }
    };
    iniciarRastreo();
    return () => { active = false; watcherRef.current?.remove(); watcherRef.current = null; };
  }, []);

  const enMovimiento = vehiculos.filter(v => { if (!v.ultima_actualizacion || v.latitud == null) return false; return (Date.now() - new Date(v.ultima_actualizacion).getTime()) / 60000 <= 3; }).length;
  const sinSeñal = vehiculos.filter(v => v.latitud == null).length;
  const vehiculosConGPS = vehiculos.filter(v => v.latitud != null && v.longitud != null);

  const centrarEnMi = () => { if (!miUbicacion || !mapRef.current) return; mapRef.current.animateToRegion({ latitude: miUbicacion.latitud, longitude: miUbicacion.longitud, latitudeDelta: 0.05, longitudeDelta: 0.05 }, 600); };
  const centrarEnTodos = () => { if (!mapRef.current || vehiculosConGPS.length === 0) return; mapRef.current.fitToCoordinates(vehiculosConGPS.map(v => ({ latitude: Number(v.latitud), longitude: Number(v.longitud) })), { edgePadding: { top: 120, right: 40, bottom: 180, left: 40 }, animated: true }); };

  if (cargando) return (
    <View style={[styles.loader, { backgroundColor: '#060B18' }]}>
      <ActivityIndicator size="large" color={accentBlue} />
      <Text style={[styles.loaderText, { color: SEM_MAPA.textSecondary }]}>Conectando con la red logística...</Text>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: '#060B18' }]}>
      <MapView ref={mapRef} style={StyleSheet.absoluteFillObject} provider={PROVIDER_GOOGLE} initialRegion={REGION_INICIAL}
        showsUserLocation={true} showsMyLocationButton={false} zoomControlEnabled={false} mapType="standard"
        userInterfaceStyle="dark"
      >
        {vehiculosConGPS.map(v => (
          <Marker key={v.id} coordinate={{ latitude: Number(v.latitud), longitude: Number(v.longitud) }} title={v.nombre} description={`${v.condicion || ''} · ${formatTiempo(v.ultima_actualizacion)}`} pinColor={getColorEstado(v.latitud, v.ultima_actualizacion)} onPress={() => setChoferSeleccionado(v)} />
        ))}
        {esAdmin && paradas.map(p => {
          if (!p.lat || !p.lng) return null;
          return <Marker key={`parada-${p.id}`} coordinate={{ latitude: Number(p.lat), longitude: Number(p.lng) }} title={`Dirección: ${p.direccion}`} description={`Estado: ${p.estado || 'pendiente'} · Chofer: ${p.chofer_id}`} pinColor="#8B5CF6" />;
        })}
      </MapView>

      {/* Panel superior */}
      <View style={[styles.statsBarPremium, { paddingTop: Math.max(insets.top, 20), backgroundColor: panelBg, borderColor: panelBorder }]}>
        <View style={styles.statsHeaderRow}>
          <Text style={styles.statsTitle}>VEHÍCULOS EN RED</Text>
          <Ionicons name="git-network-outline" size={18} color={accentBlue} />
        </View>
        <View style={styles.statsGrid}>
          {[{ l: 'TOTAL', v: vehiculosConGPS.length, c: SEM_MAPA.warning }, { l: 'ONLINE', v: enMovimiento, c: SEM_MAPA.success }, { l: 'OFFLINE', v: sinSeñal, c: sinSeñal > 0 ? SEM_MAPA.danger : SEM_MAPA.textSecondary }].map(s => (
            <View key={s.l} style={[styles.statBlock, { backgroundColor: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }]}>
              <View style={styles.statBlockHeader}>
                <Text style={[styles.statLabelPremium, { color: SEM_MAPA.textSecondary }]}>{s.l}</Text>
                <View style={[styles.statIndicator, { backgroundColor: s.c }]} />
              </View>
              <Text style={[styles.statNumPremium, { color: s.l === 'OFFLINE' && sinSeñal > 0 ? SEM_MAPA.danger : '#FFF' }]}>{s.v}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Botones flotantes derecha */}
      <View style={[styles.actionButtons, { top: Math.max(insets.top, 20) + 120 }]}>
        {miUbicacion && (<TouchableOpacity style={[styles.actionBtn, { backgroundColor: accentBlue }]} onPress={centrarEnMi} activeOpacity={0.8}><Ionicons name="navigate" size={20} color="#FFFFFF" /></TouchableOpacity>)}
        {vehiculosConGPS.length > 0 && (<TouchableOpacity style={[styles.actionBtn, { backgroundColor: panelBg, borderWidth: 1, borderColor: panelBorder }]} onPress={centrarEnTodos} activeOpacity={0.8}><Ionicons name="contract-outline" size={20} color="#FFFFFF" /></TouchableOpacity>)}
        <TouchableOpacity style={[styles.actionBtn, { backgroundColor: panelBg, borderWidth: 1, borderColor: panelBorder }]} onPress={fetchVehiculos} activeOpacity={0.8}><Ionicons name="refresh-outline" size={20} color="#FFFFFF" /></TouchableOpacity>
      </View>

      {/* Controles zoom */}
      <View style={[styles.zoomCluster, { bottom: Math.max(insets.bottom, 20) + (choferSeleccionado ? 260 : 30) }]}>
        <View style={[styles.zoomControlsContainer, { backgroundColor: panelBg, borderColor: panelBorder }]}>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => handleZoom(true)} activeOpacity={0.8}><Ionicons name="add" size={24} color="#FFF" /></TouchableOpacity>
          <View style={[styles.zoomDivider, { backgroundColor: SEM_MAPA.divider }]} />
          <TouchableOpacity style={styles.zoomBtn} onPress={() => handleZoom(false)} activeOpacity={0.8}><Ionicons name="remove" size={24} color="#FFF" /></TouchableOpacity>
        </View>
        <View style={[styles.scaleIndicator, { backgroundColor: panelBg, borderColor: panelBorder }]}>
          <Text style={[styles.scaleText, { color: SEM_MAPA.textSecondary }]}>MAPA</Text>
        </View>
      </View>

      {/* Banner error GPS */}
      {errorPermiso && (
        <View style={[styles.errorBanner, { backgroundColor: SEM_MAPA.danger }]}>
          <Ionicons name="warning-outline" size={15} color="#FFF" />
          <Text style={styles.errorText}>{errorPermiso}</Text>
          <TouchableOpacity onPress={() => setErrorPermiso(null)}><Ionicons name="close" size={15} color="#FFF" /></TouchableOpacity>
        </View>
      )}

      {/* Timestamp */}
      {ultimaActualizacion && !choferSeleccionado && (
        <View style={[styles.timestampBadge, { bottom: Math.max(insets.bottom, 20) + 10, alignSelf: 'center', backgroundColor: 'rgba(13, 17, 23, 0.8)', borderColor: panelBorder }]}>
          <Ionicons name="pulse" size={12} color={accentBlue} />
          <Text style={[styles.timestampText, { color: SEM_MAPA.textSecondary }]}>RED SINCRONIZADA · {ultimaActualizacion.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</Text>
        </View>
      )}

      {/* Panel detalle chofer */}
      {choferSeleccionado && (
        <View style={[styles.detailPanelPremium, { bottom: Math.max(insets.bottom, 20), backgroundColor: panelBg, borderColor: panelBorder }]}>
          <View style={styles.detailPreHeader}>
            <View style={[styles.detailBadge, { backgroundColor: 'rgba(0, 123, 255, 0.3)', borderColor: 'rgba(0, 123, 255, 0.5)' }]}>
              <Text style={[styles.detailBadgeText, { color: accentBlue }]}>UNIDAD #{choferSeleccionado.id}</Text>
            </View>
            <View style={[styles.statusDotPremium, { backgroundColor: getColorEstado(choferSeleccionado.latitud, choferSeleccionado.ultima_actualizacion), borderColor: panelBg }]} />
          </View>
          <View style={[styles.detailGrid, { borderColor: SEM_MAPA.divider }]}>
            {[
              { icon: 'person', label: 'Chofer Asignado', value: choferSeleccionado.nombre },
              { icon: 'map', label: 'Zona Operativa', value: Array.isArray(choferSeleccionado.zona) ? choferSeleccionado.zona.join(', ') : choferSeleccionado.zona || 'CENTRAL' },
              { icon: 'time', label: 'Último Reporte', value: formatTiempo(choferSeleccionado.ultima_actualizacion) },
              { icon: 'locate', label: 'Estado GPS', value: choferSeleccionado.condicion || 'ACTIVO' },
            ].map((d, i) => (
              <View key={i} style={styles.detailGridItem}>
                <View style={[styles.detailGridIconBox, { backgroundColor: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.04)' }]}>
                  <Ionicons name={d.icon as any} size={16} color={SEM_MAPA.textSecondary} />
                </View>
                <View style={styles.detailGridTextContainer}>
                  <Text style={[styles.detailGridLabel, { color: SEM_MAPA.textSecondary }]}>{d.label}</Text>
                  <Text style={[styles.detailGridValue, { color: '#FFF' }]} numberOfLines={1}>{d.value}</Text>
                </View>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={() => setChoferSeleccionado(null)} style={[styles.closeButtonPremium, { backgroundColor: accentBlue }]} activeOpacity={0.8}>
            <Text style={styles.closeButtonText}>OCULTAR PANEL</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Estilos (sin dependencia de tema — el mapa siempre usa dark UI) ──────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loaderText: { marginTop: 14, fontSize: 13, letterSpacing: 1 },
  statsBarPremium: { position: 'absolute', left: 0, right: 0, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, borderBottomWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, paddingHorizontal: 24, paddingBottom: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.6, shadowRadius: 20, elevation: 15 },
  statsHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, marginTop: 4 },
  statsTitle: { flex: 1, color: '#FFF', fontSize: 13, fontWeight: '800', letterSpacing: 2.5 },
  statsGrid: { flexDirection: 'row', gap: 12 },
  statBlock: { flex: 1, borderRadius: 16, padding: 16, borderWidth: 1 },
  statBlockHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  statIndicator: { width: 6, height: 6, borderRadius: 3 },
  statLabelPremium: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  statNumPremium: { fontSize: 26, fontWeight: '800', color: '#FFF' },
  actionButtons: { position: 'absolute', right: 16, gap: 12 },
  actionBtn: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 8 },
  zoomCluster: { position: 'absolute', left: 16, alignItems: 'center' },
  zoomControlsContainer: { borderRadius: 16, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 15, elevation: 10, overflow: 'hidden', width: 48 },
  zoomBtn: { height: 48, justifyContent: 'center', alignItems: 'center' },
  zoomDivider: { height: 1, marginHorizontal: 8 },
  scaleIndicator: { marginTop: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  scaleText: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  detailPanelPremium: { position: 'absolute', left: 16, right: 16, borderRadius: 28, padding: 24, borderWidth: 1, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.5, shadowRadius: 30, elevation: 20 },
  detailPreHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  detailBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 14, borderWidth: 1 },
  detailBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  statusDotPremium: { width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  detailGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 20, marginBottom: 24, paddingBottom: 24, borderBottomWidth: 1 },
  detailGridItem: { width: '45%', flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailGridIconBox: { width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  detailGridTextContainer: { flex: 1 },
  detailGridLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailGridValue: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  closeButtonPremium: { borderRadius: 16, paddingVertical: 16, alignItems: 'center' },
  closeButtonText: { color: '#FFF', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  errorBanner: { position: 'absolute', top: 150, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, padding: 16 },
  errorText: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  timestampBadge: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1 },
  timestampText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
});