// app/(drawer)/mapa.tsx
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useNavigation } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';

// Habilitar LayoutAnimation en Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ChoferConGPS {
  id: number; nombre: string; condicion: string;
  zona: string | string[]; latitud: number | null;
  longitud: number | null; ultima_actualizacion: string | null;
}

// ─── Colores semánticos fijos ─────────────────────────────────────────────────

const SEM = {
  success: '#00E676',
  warning: '#F59E0B',
  danger: '#EF4444',
  accentBlue: '#4F8EF7',
};

// ─── Región inicial: Foco Operativo AMBA ───────────────────────────────────────
const REGION_INICIAL = {
  latitude: -34.61, // AMBA Centro
  longitude: -58.44,
  latitudeDelta: 0.4,
  longitudeDelta: 0.4,
};

// ─── Coordenadas Globales y Polígono Topográfico (Máscara Inversa) ────────────
const MUNDO = [
  { latitude: 90, longitude: -180 },
  { latitude: 90, longitude: 180 },
  { latitude: -90, longitude: 180 },
  { latitude: -90, longitude: -180 },
];

// Trazado de Alta Fidelidad del Área Operativa Mercado Libre Flex
const POLIGONO_FLEX = [
  // COSTA NORTE / RIO PARANÁ LAS PALMAS
  { latitude: -34.0950, longitude: -59.0240 }, // Zárate (Norte/Río)
  { latitude: -34.1400, longitude: -58.9800 }, // Intermedio Zárate-Campana
  { latitude: -34.1650, longitude: -58.9550 }, // Campana
  { latitude: -34.2500, longitude: -58.8700 }, // Intermedio Río Luján
  { latitude: -34.3350, longitude: -58.7800 }, // Belén de Escobar
  { latitude: -34.3750, longitude: -58.6800 }, // Dique Luján / Ing Maschwitz
  { latitude: -34.4000, longitude: -58.6200 }, // Benavídez / Delta
  { latitude: -34.4260, longitude: -58.5790 }, // Tigre centro
  { latitude: -34.4440, longitude: -58.5410 }, // San Fernando
  { latitude: -34.4710, longitude: -58.5040 }, // San Isidro
  
  // COSTA DEL RÍO DE LA PLATA (AMBA)
  { latitude: -34.4950, longitude: -58.4850 }, // Martínez / La Lucila
  { latitude: -34.5090, longitude: -58.4750 }, // Vicente López / Olivos
  { latitude: -34.5300, longitude: -58.4400 }, // CABA Norte
  { latitude: -34.5500, longitude: -58.4000 }, // Costanera Norte / Aeroparque
  { latitude: -34.5900, longitude: -58.3600 }, // Puerto Madero
  { latitude: -34.6150, longitude: -58.3550 }, // Reserva Ecológica
  { latitude: -34.6340, longitude: -58.3550 }, // La Boca
  { latitude: -34.6600, longitude: -58.3400 }, // Dock Sud / Avellaneda
  { latitude: -34.6850, longitude: -58.2900 }, // Bernal costa
  { latitude: -34.7080, longitude: -58.2430 }, // Quilmes costa
  { latitude: -34.7570, longitude: -58.2000 }, // Berazategui costa
  { latitude: -34.7930, longitude: -58.1400 }, // Hudson costa
  { latitude: -34.8150, longitude: -58.0000 }, // Punta Lara
  { latitude: -34.8500, longitude: -57.9300 }, // Ensenada costa
  { latitude: -34.8700, longitude: -57.8800 }, // Berisso Norte
  { latitude: -34.8900, longitude: -57.8500 }, // Berisso Costa
  
  // LÍMITE SUR ESTE (Berisso -> La Plata -> Brandsen)
  { latitude: -34.9300, longitude: -57.8400 }, // Los Talas (Berisso Sur)
  { latitude: -34.9700, longitude: -57.9000 }, // Ignacio Correas / Sureste LP
  { latitude: -35.0000, longitude: -57.9800 }, // Arana / Poblet
  { latitude: -35.0400, longitude: -58.0500 }, // Ángel Etcheverry limit
  { latitude: -35.1000, longitude: -58.1300 }, // Oliden RP 36
  { latitude: -35.1500, longitude: -58.2000 }, // Gómez / Brandsen Este
  { latitude: -35.1700, longitude: -58.2400 }, // Coronel Brandsen Centro/Sur
  { latitude: -35.1650, longitude: -58.2900 }, // Altamirano / O. Brandsen
  
  // LÍMITE SUR (San Vicente -> Cañuelas)
  { latitude: -35.1200, longitude: -58.3500 }, // Domselaar limit
  { latitude: -35.0450, longitude: -58.4000 }, // San Vicente Este / A. Korn
  { latitude: -35.0200, longitude: -58.4400 }, // San Vicente Centro
  { latitude: -35.0500, longitude: -58.5500 }, // Udaondo / RP 16 limit
  { latitude: -35.0600, longitude: -58.7000 }, // Gobernador Udaondo/Cañuelas
  { latitude: -35.0400, longitude: -58.7800 }, // Cañuelas Centro/Oeste (Ruta 3)
  { latitude: -34.9900, longitude: -58.8000 }, // Uribelarrea limit
  
  // LÍMITE OESTE (Marcos Paz -> Rodríguez -> Luján)
  { latitude: -34.8800, longitude: -58.7500 }, // Virrey del Pino / Límite MP
  { latitude: -34.7900, longitude: -58.8500 }, // Marcos Paz / Ruta 40
  { latitude: -34.7200, longitude: -58.8900 }, // Plomer / Villars limit
  { latitude: -34.6600, longitude: -58.9400 }, // General Rodríguez Sur
  { latitude: -34.6200, longitude: -58.9600 }, // General Rodríguez Oeste
  { latitude: -34.5800, longitude: -59.1200 }, // Luján Sur / Olivera
  { latitude: -34.5400, longitude: -59.1300 }, // Luján Centro/Oeste
  { latitude: -34.4800, longitude: -59.1000 }, // Carlos Keen limit
  { latitude: -34.4300, longitude: -59.0400 }, // Open Door limit
  
  // LÍMITE NOROESTE (Pilar -> Capilla del Señor -> Zárate)
  { latitude: -34.4500, longitude: -58.9800 }, // Pilar Oeste / Manzanares
  { latitude: -34.4000, longitude: -58.9200 }, // Pilar Norte / Fátima
  { latitude: -34.3300, longitude: -59.0300 }, // Los Cardales limit
  { latitude: -34.2900, longitude: -59.1000 }, // Capilla del Señor
  { latitude: -34.2000, longitude: -59.0800 }, // Escalada / Ruta 193
  { latitude: -34.1200, longitude: -59.0800 }, // Zárate Oeste
  { latitude: -34.0950, longitude: -59.0240 }, // Cierre en Zárate
];

// ─── LayoutAnimation config ───────────────────────────────────────────────────

const expandAnim = {
  duration: 260,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTiempo = (iso: string | null): string => {
  if (!iso) return 'Sin datos';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return `Hace ${diff}s`;
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
  return `Hace ${Math.floor(diff / 3600)} h`;
};

const getColorEstado = (latitud: number | null, ultimaActualizacion: string | null): string => {
  if (latitud == null || !ultimaActualizacion) return SEM.danger;
  const diffMin = (Date.now() - new Date(ultimaActualizacion).getTime()) / 60000;
  if (diffMin > 10) return SEM.danger;
  if (diffMin > 3) return SEM.warning;
  return SEM.success;
};

// ─── MapaScreen ───────────────────────────────────────────────────────────────

export default function MapaScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  // ── Estado de datos ────────────────────────────────────────────────────────
  const [vehiculos, setVehiculos] = useState<ChoferConGPS[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorPermiso, setErrorPermiso] = useState<string | null>(null);
  const [miUbicacion, setMiUbicacion] = useState<{ latitud: number; longitud: number } | null>(null);
  const [choferSeleccionado, setChoferSeleccionado] = useState<ChoferConGPS | null>(null);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);
  const [paradas, setParadas] = useState<any[]>([]);
  const [esAdmin, setEsAdmin] = useState(false);

  const mapRef = useRef<MapView>(null);
  const watcherRef = useRef<Location.LocationSubscription | null>(null);

  // ── Refs para canales Realtime ─────────────────────────────────────────────
  // Guardamos los canales en refs para que el cleanup siempre los encuentre,
  // incluso cuando se crean dentro de callbacks asíncronos (.then()).
  const canalGpsRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const canalParadasRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const navigation = useNavigation();

  // ── Tokens de color según tema ────────────────────────────────────────────
  // El header integrado usa un color SÓLIDO (no semitransparente) para que
  // el fondo cubra completamente la zona del notch sin mostrar el mapa debajo.
  const headerBg = isDark ? '#08111A' : '#FFFFFF';
  const headerBorder = isDark ? 'rgba(79,142,247,0.14)' : 'rgba(79,142,247,0.20)';
  const panelText = isDark ? '#FFFFFF' : colors.textPrimary;
  const panelMuted = isDark ? 'rgba(255,255,255,0.42)' : colors.textMuted;
  const panelIconColor = isDark ? 'rgba(255,255,255,0.55)' : colors.textMuted;
  const panelStatBg = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(79,142,247,0.06)';
  const panelStatBorder = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(79,142,247,0.12)';
  const panelDivider = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';

  // Paneles flotantes que van sobre el mapa (siguen siendo semitransparentes)
  const floatBg = isDark ? 'rgba(8, 13, 26, 0.94)' : 'rgba(255, 255, 255, 0.95)';
  const floatBorder = isDark ? 'rgba(79,142,247,0.18)' : 'rgba(79,142,247,0.28)';

  // ─────────────────────────────────────────────────────────────────────────
  // Lógica de datos (sin cambios funcionales)
  // ─────────────────────────────────────────────────────────────────────────

  const handleZoom = async (isZoomIn: boolean) => {
    if (!mapRef.current) return;
    const camera = await mapRef.current.getCamera();
    if (camera && camera.zoom !== undefined)
      mapRef.current.animateCamera({ zoom: camera.zoom + (isZoomIn ? 1 : -1) });
  };

  const fetchVehiculos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('Choferes')
        .select('id, nombre, condicion, zona, latitud, longitud, ultima_actualizacion')
        .order('orden', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setVehiculos(data || []);
      setUltimaActualizacion(new Date());
    } catch (err) { console.error('Error cargando vehículos:', err); }
    finally { setCargando(false); }
  }, []);

  const handleRealtimeUpdate = useCallback((payload: any) => {
    const updated = payload.new as ChoferConGPS;
    setVehiculos(prev => {
      const existe = prev.find(v => v.id === updated.id);
      if (!existe) return [...prev, updated];
      return prev.map(v => v.id === updated.id ? { ...v, ...updated } : v);
    });
    setUltimaActualizacion(new Date());
    setChoferSeleccionado(prev => prev?.id === updated.id ? { ...prev, ...updated } : prev);
  }, []);

  const handleRealtimeDelete = useCallback((payload: any) => {
    const deleted = payload.old as { id: number };
    setVehiculos(prev => prev.filter(v => v.id !== deleted.id));
    setChoferSeleccionado(prev => prev?.id === deleted.id ? null : prev);
  }, []);

  // Canal GPS: ref → cleanup garantizado
  useEffect(() => {
    fetchVehiculos();

    canalGpsRef.current = supabase
      .channel('mapa-gps-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Choferes' }, handleRealtimeUpdate)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Choferes' }, fetchVehiculos)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'Choferes' }, handleRealtimeDelete)
      .subscribe();

    return () => {
      if (canalGpsRef.current) {
        void supabase.removeChannel(canalGpsRef.current);
        canalGpsRef.current = null;
      }
    };
  }, [fetchVehiculos, handleRealtimeUpdate, handleRealtimeDelete]);

  // Canal paradas: el problema original era que el canal se creaba DENTRO del
  // .then() asíncrono, por lo que el return del useEffect ya había corrido
  // cuando el canal existía → el cleanup nunca lo destruía.
  // Solución: guardarlo en una ref que el return SÍ puede ver.
  useEffect(() => {
    const initAdminParadas = async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.email === 'maxirusso20@gmail.com') {
        setEsAdmin(true);

        const { data: pd } = await supabase.from('rutas_activas').select('*');
        if (pd) setParadas(pd);

        canalParadasRef.current = supabase
          .channel('mapa-paradas-sync')
          .on('postgres_changes', { event: '*', schema: 'public', table: 'rutas_activas' }, (payload) => {
            if (payload.eventType === 'INSERT')
              setParadas(prev => [...prev, payload.new]);
            else if (payload.eventType === 'DELETE')
              setParadas(prev => prev.filter(p => p.id !== payload.old.id));
          })
          .subscribe();
      }
    };

    initAdminParadas();

    return () => {
      if (canalParadasRef.current) {
        void supabase.removeChannel(canalParadasRef.current);
        canalParadasRef.current = null;
      }
    };
  }, []);

  // GPS tracking — sin cambios
  useEffect(() => {
    let active = true;
    const iniciarRastreo = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorPermiso('Permiso de ubicación denegado. Activalo en Configuración.');
          return;
        }
      } catch (err) { console.warn('[GPS] Error pidiendo permisos:', err); return; }

      const { data: { user } } = await supabase.auth.getUser();
      let choferId: number | null = null;
      if (user) {
        try {
          const { data: cd } = await supabase
            .from('Choferes').select('id').eq('user_id', user.id).maybeSingle();
          choferId = cd?.id ?? null;
        } catch { }
      }

      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (active) setMiUbicacion({ latitud: pos.coords.latitude, longitud: pos.coords.longitude });
      } catch { }

      try {
        watcherRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 15, timeInterval: 10000, mayShowUserSettingsDialog: false },
          async (location) => {
            if (!active) return;
            const { latitude, longitude } = location.coords;
            setMiUbicacion({ latitud: latitude, longitud: longitude });
            if (choferId) {
              try {
                await supabase.from('Choferes').update({
                  latitud: latitude, longitud: longitude,
                  ultima_actualizacion: new Date().toISOString(),
                }).eq('id', choferId);
              } catch (err) { console.warn('[GPS]', err); }
            }
          }
        );
      } catch (err) {
        console.warn('[GPS] watchPositionAsync no disponible:', err);
        setErrorPermiso('GPS no disponible en este modo. El mapa sigue activo.');
      }
    };

    iniciarRastreo();
    return () => { active = false; watcherRef.current?.remove(); watcherRef.current = null; };
  }, []);

  // ──────────────────────────────────────────────────────────────────────�  const actionBtnTop = insets.top + 80;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>

      {/* ── Mapa ── */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={PROVIDER_GOOGLE}
        initialRegion={REGION_INICIAL}
        showsUserLocation={true}
        showsMyLocationButton={false}
        zoomControlEnabled={false}
        mapType="standard"
        userInterfaceStyle={isDark ? 'dark' : 'light'}
      >
        {/* Máscara Inversa para Zona AMBA / Flex */}
        <Polygon
          coordinates={MUNDO}
          holes={[POLIGONO_FLEX]}
          fillColor="rgba(6, 11, 24, 0.75)"
          strokeColor="#4F8EF7"
          strokeWidth={2}
        />

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
              pinColor="#8B5CF6"
            />
          );
        })}
      </MapView>

      {/* ── Floating Header Pill ── */}
      <View
        style={[
          styles.floatingHeader,
          {
            top: Math.max(insets.top, 16) + 10,
            backgroundColor: colors.bgCard,
          },
        ]}
      >
        <TouchableOpacity 
          style={styles.headerBtn} 
          onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
        >
          <Ionicons name="menu" size={26} color={panelText} />
        </TouchableOpacity>

        <View style={styles.headerTitleWrap}>
          <Text style={[styles.headerTitle, { color: panelText }]}>MAPA DE RUTAS</Text>
          <View style={styles.headerStatsRow}>
            <View style={[styles.miniBadge, { backgroundColor: `${SEM.success}1A` }]}>
              <View style={[styles.miniDot, { backgroundColor: SEM.success }]} />
              <Text style={[styles.miniBadgeText, { color: SEM.success }]}>{enMovimiento}</Text>
            </View>
            {sinSeñal > 0 && (
              <View style={[styles.miniBadge, { backgroundColor: `${SEM.danger}1A` }]}>
                <View style={[styles.miniDot, { backgroundColor: SEM.danger }]} />
                <Text style={[styles.miniBadgeText, { color: SEM.danger }]}>{sinSeñal}</Text>
              </View>
            )}
          </View>
        </View>

        <TouchableOpacity style={styles.headerBtn} onPress={fetchVehiculos} activeOpacity={0.7}>
          <Ionicons name="refresh" size={22} color={SEM.accentBlue} />
        </TouchableOpacity>
      </View>

      {/* ── Timestamp (Arriba Izquierda) ── */}
      {ultimaActualizacion && !choferSeleccionado && (
        <View style={[
          styles.timestampBadge,
          {
            top: Math.max(insets.top, 16) + 80,
            backgroundColor: floatBg,
            borderColor: floatBorder,
          },
        ]}>
          <Ionicons name="pulse" size={13} color={SEM.accentBlue} />
          <Text style={[styles.timestampText, { color: panelMuted }]}>
            {ultimaActualizacion.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      )}

      {/* ── Botones flotantes derecha ── */}
      <View style={[styles.actionButtons, { top: actionBtnTop }]}>
        {miUbicacion && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: SEM.accentBlue }]}
            onPress={centrarEnMi}
            activeOpacity={0.8}
          >
            <Ionicons name="navigate" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        {vehiculosConGPS.length > 0 && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: floatBg, borderWidth: 1, borderColor: floatBorder }]}
            onPress={centrarEnTodos}
            activeOpacity={0.8}
          >
            <Ionicons name="expand" size={20} color={panelText} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Controles de zoom ── */}
      <View style={[
        styles.zoomCluster,
        { bottom: Math.max(insets.bottom, 20) + (choferSeleccionado ? 260 : 30) },
      ]}>
        <View style={[
          styles.zoomControlsContainer,
          { backgroundColor: floatBg, borderColor: floatBorder },
        ]}>
          <TouchableOpacity style={styles.zoomBtn} onPress={() => handleZoom(true)} activeOpacity={0.8}>
            <Ionicons name="add" size={24} color={panelText} />
          </TouchableOpacity>
          <View style={[styles.zoomDivider, { backgroundColor: panelDivider }]} />
          <TouchableOpacity style={styles.zoomBtn} onPress={() => handleZoom(false)} activeOpacity={0.8}>
            <Ionicons name="remove" size={24} color={panelText} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Banner error GPS ── */}
      {errorPermiso && (
        <View style={[
          styles.errorBanner,
          { top: actionBtnTop + 120, backgroundColor: SEM.danger },
        ]}>
          <Ionicons name="warning-outline" size={15} color="#FFF" />
          <Text style={styles.errorText}>{errorPermiso}</Text>
          <TouchableOpacity onPress={() => setErrorPermiso(null)}>
            <Ionicons name="close" size={15} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Panel detalle chofer ── */}
      {choferSeleccionado && (
        <View style={[
          styles.detailPanel,
          {
            bottom: Math.max(insets.bottom, 20),
            backgroundColor: floatBg,
            borderColor: floatBorder,
          },
        ]}>
          <View style={styles.detailPreHeader}>
            <View style={[
              styles.detailBadge,
              { backgroundColor: `${SEM.accentBlue}30`, borderColor: `${SEM.accentBlue}50` },
            ]}>
              <Text style={[styles.detailBadgeText, { color: SEM.accentBlue }]}>
                UNIDAD #{choferSeleccionado.id}
              </Text>
            </View>
            <View style={[
              styles.statusDot,
              {
                backgroundColor: getColorEstado(choferSeleccionado.latitud, choferSeleccionado.ultima_actualizacion),
                borderColor: floatBg,
              },
            ]} />
          </View>

          <View style={[styles.detailGrid, { borderColor: panelDivider }]}>
            {[
              { icon: 'person', label: 'Chofer Asignado', value: choferSeleccionado.nombre },
              { icon: 'map', label: 'Zona Operativa', value: Array.isArray(choferSeleccionado.zona) ? choferSeleccionado.zona.join(', ') : choferSeleccionado.zona || 'CENTRAL' },
              { icon: 'time', label: 'Último Reporte', value: formatTiempo(choferSeleccionado.ultima_actualizacion) },
              { icon: 'locate', label: 'Estado GPS', value: choferSeleccionado.condicion || 'ACTIVO' },
            ].map((d, i) => (
              <View key={i} style={styles.detailGridItem}>
                <View style={[
                  styles.detailGridIconBox,
                  {
                    backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(79,142,247,0.08)',
                    borderColor: isDark ? 'rgba(255,255,255,0.07)' : 'rgba(79,142,247,0.14)',
                  },
                ]}>
                  <Ionicons name={d.icon as any} size={16} color={panelIconColor} />
                </View>
                <View style={styles.detailGridTextContainer}>
                  <Text style={[styles.detailGridLabel, { color: panelMuted }]}>{d.label}</Text>
                  <Text style={[styles.detailGridValue, { color: panelText }]} numberOfLines={1}>
                    {d.value}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          <TouchableOpacity
            onPress={() => setChoferSeleccionado(null)}
            style={[styles.closeButton, { backgroundColor: SEM.accentBlue }]}
            activeOpacity={0.8}
          >
            <Text style={styles.closeButtonText}>OCULTAR PANEL</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loaderText: { marginTop: 14, fontSize: 13, letterSpacing: 1 },

  // ── Floating Header Pill ──
  floatingHeader: {
    position: 'absolute',
    left: 20,
    right: 20,
    height: 56,
    borderRadius: 28,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 10,
  },
  headerBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerStatsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  miniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniDot: { width: 4, height: 4, borderRadius: 2 },
  miniBadgeText: { fontSize: 10, fontWeight: '800' },

  // ── Timestamp (Top Left) ──
  timestampBadge: {
    position: 'absolute',
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  timestampText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  // ── Botones Flotantes (Derecha) ──
  actionButtons: {
    position: 'absolute',
    right: 20,
    gap: 14,
  },
  actionBtn: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 7,
    elevation: 8,
  },

  // ── Zoom Controls ──
  zoomCluster: {
    position: 'absolute',
    left: 20,
    alignItems: 'center',
  },
  zoomControlsContainer: {
    borderRadius: 20, borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 10,
    overflow: 'hidden',
    width: 48,
  },
  zoomBtn: { height: 48, justifyContent: 'center', alignItems: 'center' },
  zoomDivider: { height: 1, marginHorizontal: 8 },

  // ── Error GPS ──
  errorBanner: {
    position: 'absolute',
    left: 20, right: 20,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 16, padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  errorText: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // ── Panel detalle chofer ──
  detailPanel: {
    position: 'absolute',
    left: 20, right: 20,
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 20,
  },
  detailPreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  detailBadge: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 14, borderWidth: 1,
  },
  detailBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  statusDot: {
    width: 12, height: 12, borderRadius: 6, borderWidth: 2,
  },
  detailGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 18,
    marginBottom: 22, paddingBottom: 22,
    borderBottomWidth: 1,
  },
  detailGridItem: {
    width: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  detailGridIconBox: {
    width: 38, height: 38, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  detailGridTextContainer: { flex: 1 },
  detailGridLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailGridValue: { fontSize: 13, fontWeight: '700', marginTop: 3 },
  closeButton: {
    borderRadius: 16, paddingVertical: 15, alignItems: 'center',
  },
  closeButtonText: { color: '#FFF', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
});wColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 7,
    elevation: 8,
  },

  // ── Zoom ──
  zoomCluster: {
    position: 'absolute',
    left: 16,
    alignItems: 'center',
  },
  zoomControlsContainer: {
    borderRadius: 16, borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 10,
    elevation: 10,
    overflow: 'hidden',
    width: 48,
  },
  zoomBtn: { height: 48, justifyContent: 'center', alignItems: 'center' },
  zoomDivider: { height: 1, marginHorizontal: 8 },
  scaleIndicator: {
    marginTop: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1,
  },
  scaleText: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },

  // ── Panel detalle chofer ──
  detailPanel: {
    position: 'absolute',
    left: 16, right: 16,
    borderRadius: 26,
    padding: 22,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 20,
  },
  detailPreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
  },
  detailBadge: {
    paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 14, borderWidth: 1,
  },
  detailBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  statusDot: {
    width: 12, height: 12, borderRadius: 6, borderWidth: 2,
  },
  detailGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: 18,
    marginBottom: 22, paddingBottom: 22,
    borderBottomWidth: 1,
  },
  detailGridItem: {
    width: '45%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  detailGridIconBox: {
    width: 38, height: 38, borderRadius: 11,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1,
  },
  detailGridTextContainer: { flex: 1 },
  detailGridLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailGridValue: { fontSize: 13, fontWeight: '700', marginTop: 3 },
  closeButton: {
    borderRadius: 15, paddingVertical: 15, alignItems: 'center',
  },
  closeButtonText: { color: '#FFF', fontSize: 13, fontWeight: '800', letterSpacing: 2 },

  // ── Error GPS ──
  errorBanner: {
    position: 'absolute',
    left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 16, padding: 16,
  },
  errorText: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  // ── Timestamp ──
  timestampBadge: {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1,
  },
  timestampText: { fontSize: 10, fontWeight: '700', letterSpacing: 1 },
});