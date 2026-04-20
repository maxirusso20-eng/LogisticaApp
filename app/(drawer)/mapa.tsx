// app/(drawer)/mapa.tsx
import { Ionicons } from '@expo/vector-icons';
import { DrawerActions } from '@react-navigation/native';
import * as Location from 'expo-location';
import { useNavigation } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import React, { useEffect, useRef, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  useWindowDimensions,
  View
} from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../lib/ThemeContext';
import { startTracking, stopTracking } from '../../lib/locationTracker';
import { supabase } from '../../lib/supabase';
import { useMapaData } from '../_hooks/useMapaData';

// Habilitar LayoutAnimation en Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ─── Tipos ────────────────────────────────────────────────────────────────────



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

const POLIGONO_FLEX = [
  // COSTA NORTE / ZÁRATE / CAMPANA
  { latitude: -34.0950, longitude: -59.0240 }, // Zárate (Río)
  { latitude: -34.1200, longitude: -58.9950 }, // Zárate Costa Sur
  { latitude: -34.1480, longitude: -58.9650 }, // Campana RN9
  { latitude: -34.1650, longitude: -58.9550 }, // Campana Centro
  { latitude: -34.2000, longitude: -58.9200 }, // Cardales (Norte)
  { latitude: -34.2500, longitude: -58.8700 }, // Río Luján

  // ESCOBAR / DELTA
  { latitude: -34.3000, longitude: -58.8200 }, // Otamendi
  { latitude: -34.3350, longitude: -58.7800 }, // Escobar
  { latitude: -34.3500, longitude: -58.7300 }, // Matheu
  { latitude: -34.3750, longitude: -58.6800 }, // Ing Maschwitz
  { latitude: -34.4000, longitude: -58.6200 }, // Benavídez Centro

  // COSTANERA NORTE AMBA (ALTA FIDELIDAD)
  { latitude: -34.4100, longitude: -58.5900 }, // Delta Tigre
  { latitude: -34.4260, longitude: -58.5790 }, // Tigre 
  { latitude: -34.4440, longitude: -58.5410 }, // San Fernando
  { latitude: -34.4600, longitude: -58.5200 }, // Beccar / San Isidro
  { latitude: -34.4710, longitude: -58.5040 }, // San Isidro Catedral
  { latitude: -34.4850, longitude: -58.4900 }, // Acassuso
  { latitude: -34.4950, longitude: -58.4850 }, // Martínez / La Lucila
  { latitude: -34.5090, longitude: -58.4750 }, // Olivos
  { latitude: -34.5200, longitude: -58.4600 }, // Vicente López
  { latitude: -34.5300, longitude: -58.4400 }, // CABA Norte (Ciudad Univ)
  { latitude: -34.5500, longitude: -58.4000 }, // Aeroparque
  { latitude: -34.5700, longitude: -58.3800 }, // Recoleta Costa
  { latitude: -34.5900, longitude: -58.3600 }, // Puerto Madero Norte
  { latitude: -34.6150, longitude: -58.3550 }, // Reserva Ecológica
  { latitude: -34.6340, longitude: -58.3550 }, // La Boca

  // COSTANERA SUR (Avellaneda - La Plata)
  { latitude: -34.6500, longitude: -58.3500 }, // Dock Sud / Riachuelo
  { latitude: -34.6700, longitude: -58.3200 }, // Avellaneda Costa
  { latitude: -34.6850, longitude: -58.2900 }, // Bernal costa
  { latitude: -34.7080, longitude: -58.2430 }, // Quilmes costa
  { latitude: -34.7300, longitude: -58.2200 }, // Ezpeleta Costa
  { latitude: -34.7570, longitude: -58.2000 }, // Berazategui costa
  { latitude: -34.7800, longitude: -58.1700 }, // Plátanos
  { latitude: -34.7930, longitude: -58.1400 }, // Hudson costa
  { latitude: -34.8150, longitude: -58.0000 }, // Punta Lara
  { latitude: -34.8500, longitude: -57.9300 }, // Ensenada costa
  { latitude: -34.8700, longitude: -57.8800 }, // Berisso Norte
  { latitude: -34.8900, longitude: -57.8500 }, // Berisso Sur 
  { latitude: -34.9300, longitude: -57.8400 }, // Los Talas

  // LÍMITE SUR ESTE (La Plata Sur -> Brandsen)
  { latitude: -34.9700, longitude: -57.9000 }, // Ignacio Correas
  { latitude: -35.0000, longitude: -57.9800 }, // Arana
  { latitude: -35.0400, longitude: -58.0500 }, // Ángel Etcheverry
  { latitude: -35.1000, longitude: -58.1300 }, // Oliden RP 36
  { latitude: -35.1500, longitude: -58.2000 }, // Gómez
  { latitude: -35.1700, longitude: -58.2400 }, // Coronel Brandsen
  { latitude: -35.1650, longitude: -58.2900 }, // Altamirano

  // LÍMITE SUR (San Vicente -> Cañuelas)
  { latitude: -35.1200, longitude: -58.3500 }, // Domselaar 
  { latitude: -35.0800, longitude: -58.3800 }, // Limite Korn
  { latitude: -35.0450, longitude: -58.4000 }, // San Vicente / A. Korn
  { latitude: -35.0200, longitude: -58.4400 }, // San Vicente Centro
  { latitude: -35.0500, longitude: -58.5500 }, // RP 16 limit
  { latitude: -35.0600, longitude: -58.7000 }, // Udaondo
  { latitude: -35.0400, longitude: -58.7800 }, // Cañuelas Centro
  { latitude: -34.9900, longitude: -58.8000 }, // Uribelarrea

  // LÍMITE OESTE (Marcos Paz -> Rodríguez -> Luján)
  { latitude: -34.9400, longitude: -58.7800 }, // Ezeiza límite oeste
  { latitude: -34.8800, longitude: -58.7500 }, // Virrey del Pino
  { latitude: -34.7900, longitude: -58.8500 }, // Marcos Paz
  { latitude: -34.7200, longitude: -58.8900 }, // Villars limit
  { latitude: -34.6600, longitude: -58.9400 }, // General Rodríguez Sur
  { latitude: -34.6200, longitude: -58.9600 }, // General Rodríguez Oeste
  { latitude: -34.5800, longitude: -59.1200 }, // Luján Sur / Olivera
  { latitude: -34.5400, longitude: -59.1300 }, // Luján Centro
  { latitude: -34.4800, longitude: -59.1000 }, // Carlos Keen
  { latitude: -34.4300, longitude: -59.0400 }, // Open Door

  // LÍMITE NOROESTE (Pilar -> Capilla del Señor -> Zárate)
  { latitude: -34.4500, longitude: -58.9800 }, // Manzanares
  { latitude: -34.4000, longitude: -58.9200 }, // Pilar Norte / Fátima
  { latitude: -34.3300, longitude: -59.0300 }, // Los Cardales
  { latitude: -34.2900, longitude: -59.1000 }, // Capilla del Señor
  { latitude: -34.2000, longitude: -59.0800 }, // Escalada (Ruta 193)
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
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const {
    vehiculos,
    paradas,
    cargando,
    ultimaActualizacion,
    esAdmin,
    choferSeleccionado,
    setChoferSeleccionado,
    fetchVehiculos,
  } = useMapaData();

  const [errorPermiso, setErrorPermiso] = useState<string | null>(null);
  const [miUbicacion, setMiUbicacion] = useState<{ latitud: number; longitud: number } | null>(null);

  const mapRef = useRef<MapView>(null);
  // ── Tokens de color según tema ────────────────────────────────────────────
  const panelText = isDark ? '#FFFFFF' : colors.textPrimary;
  const panelMuted = isDark ? 'rgba(255,255,255,0.42)' : colors.textMuted;
  const panelIconColor = isDark ? 'rgba(255,255,255,0.55)' : colors.textMuted;
  const panelDivider = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)';

  const floatBg = isDark ? 'rgba(8, 13, 26, 0.94)' : 'rgba(255, 255, 255, 0.95)';
  const floatBorder = isDark ? 'rgba(79,142,247,0.18)' : 'rgba(79,142,247,0.28)';

  const navigation = useNavigation();

  // ─── Lógica de UI ─────────────────────────────────────────────────────────

  const handleZoom = async (isZoomIn: boolean) => {
    if (!mapRef.current) return;
    const camera = await mapRef.current.getCamera();
    if (camera && camera.zoom !== undefined)
      mapRef.current.animateCamera({ zoom: camera.zoom + (isZoomIn ? 1 : -1) });
  };

  // ── GPS: singleton via locationTracker (ref-counted) ─────────────────────
  // startTracking incrementa el ref count, stopTracking lo decrementa.
  // El watcher real solo se detiene cuando ref count llega a 0, así que
  // si colectas también lo usa, mapa puede desmontarse sin romperlo.
  useEffect(() => {
    let montado = true;
    const iniciar = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return;

        // Obtener posición actual para centrar el mapa inmediatamente
        try {
          const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (montado) setMiUbicacion({ latitud: pos.coords.latitude, longitud: pos.coords.longitude });
        } catch { }

        // Delegar al tracker singleton (ref-counted)
        const ok = await startTracking(user.email);
        if (!ok && montado) setErrorPermiso('GPS no disponible en este modo. El mapa sigue activo.');
      } catch (err) {
        console.warn('[Mapa GPS]', err);
        if (montado) setErrorPermiso('GPS no disponible en este modo. El mapa sigue activo.');
      }
    };
    iniciar();
    return () => {
      montado = false;
      // Balance del startTracking: decrementa el ref count.
      // Si colectas.tsx también incrementó, el watcher sigue vivo.
      stopTracking().catch(() => { });
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Variables derivadas
  // ─────────────────────────────────────────────────────────────────────────

  const vehiculosConGPS = vehiculos.filter(v => v.latitud != null && v.longitud != null && String(v.latitud) !== '0' && String(v.latitud) !== '0.0');
  const enMovimiento = vehiculos.filter(v => v.condicion === 'MOVIMIENTO').length;
  const sinSeñal = vehiculos.filter(v => {
    if (!v.ultima_actualizacion) return true;
    const diffMin = (Date.now() - new Date(v.ultima_actualizacion).getTime()) / 60000;
    return diffMin > 10 || !v.latitud;
  }).length;

  const centrarEnMi = () => {
    if (miUbicacion && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: miUbicacion.latitud,
        longitude: miUbicacion.longitud,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
    }
  };

  const centrarEnTodos = () => {
    if (vehiculosConGPS.length > 0 && mapRef.current) {
      const coords = vehiculosConGPS.map(v => ({ latitude: Number(v.latitud), longitude: Number(v.longitud) }));
      mapRef.current.fitToCoordinates(coords, {
        edgePadding: { top: 150, right: 50, bottom: 50, left: 50 },
        animated: true,
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Drawer.Screen options={{ headerShown: false }} />
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
        minZoomLevel={9}
        onMapReady={() => {
          if (mapRef.current) {
            mapRef.current.setMapBoundaries(
              { latitude: -34.00, longitude: -57.70 },
              { latitude: -35.25, longitude: -59.25 }
            );
          }
        }}
      >
        {/* Máscara Inversa Totalmente Opaca (Efecto "Cut-out") */}
        <Polygon
          coordinates={MUNDO}
          holes={[POLIGONO_FLEX]}
          fillColor="rgba(6, 11, 24, 0.99)"
          strokeColor="#4F8EF7"
          strokeWidth={3}
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

      {/* ── Floating Header Pill (Premium 2026) ── */}
      <View
        style={[
          styles.headerPill,
          {
            top: Math.max(insets.top, 16),
            left: Math.max(insets.left, 16),
            right: Math.max(insets.right, 16),
            backgroundColor: colors.bgCard,
            borderColor: floatBorder,
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
            <View style={[styles.badge, { backgroundColor: `${SEM.success}20` }]}>
              <View style={[styles.dot, { backgroundColor: SEM.success }]} />
              <Text style={[styles.badgeText, { color: SEM.success }]}>{enMovimiento}</Text>
            </View>
            <View style={[styles.badge, { backgroundColor: `${SEM.danger}20` }]}>
              <View style={[styles.dot, { backgroundColor: SEM.danger }]} />
              <Text style={[styles.badgeText, { color: SEM.danger }]}>{sinSeñal}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.headerBtn} onPress={fetchVehiculos}>
          <Ionicons name="refresh" size={24} color={SEM.accentBlue} />
        </TouchableOpacity>
      </View>

      {/* ── Timestamp (Red Sincronizada Top-Left) ── */}
      {ultimaActualizacion && !choferSeleccionado && (
        <View style={[
          styles.timestampPill,
          {
            top: Math.max(insets.top, 16) + 70,
            left: Math.max(insets.left, 16),
            backgroundColor: floatBg,
            borderColor: floatBorder,
          },
        ]}>
          <Ionicons name="pulse" size={14} color={SEM.accentBlue} />
          <Text style={[styles.timestampText, { color: panelMuted }]}>
            Sinc. {ultimaActualizacion.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      )}

      {/* ── Action Buttons (Derecha Verticales) ── */}
      <View style={[styles.actionButtons, { top: Math.max(insets.top, 16) + 70, right: Math.max(insets.right, 16) + (isLandscape && choferSeleccionado ? 350 : 0) }]}>
        {miUbicacion && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: SEM.accentBlue }]}
            onPress={centrarEnMi}
            activeOpacity={0.8}
          >
            <Ionicons name="navigate" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        )}
        {vehiculosConGPS.length > 0 && (
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: floatBg, borderWidth: 1, borderColor: floatBorder }]}
            onPress={centrarEnTodos}
            activeOpacity={0.8}
          >
            <Ionicons name="expand" size={22} color={panelText} />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Controles de Zoom ── */}
      <View style={[
        styles.zoomCluster,
        {
          left: Math.max(insets.left, 16),
          bottom: Math.max(insets.bottom, 20) + (choferSeleccionado && !isLandscape ? 280 : 30)
        },
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
          { top: Math.max(insets.top, 16) + 140, backgroundColor: SEM.danger },
        ]}>
          <Ionicons name="warning-outline" size={18} color="#FFF" />
          <Text style={styles.errorText}>{errorPermiso}</Text>
          <TouchableOpacity onPress={() => setErrorPermiso(null)}>
            <Ionicons name="close" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── Panel Detalle Chofer ── */}
      {choferSeleccionado && (
        <View style={[
          styles.detailPanel,
          isLandscape ? {
            top: Math.max(insets.top, 16) + 80,
            right: Math.max(insets.right, 16),
            width: 340,
          } : {
            bottom: Math.max(insets.bottom, 20),
            left: Math.max(insets.left, 16),
            right: Math.max(insets.right, 16),
          },
          {
            backgroundColor: floatBg,
            borderColor: floatBorder,
          },
        ]}>
          <View style={styles.detailPreHeader}>
            <View style={[
              styles.detailBadge,
              { backgroundColor: `${SEM.accentBlue}15`, borderColor: `${SEM.accentBlue}30` },
            ]}>
              <Text style={[styles.detailBadgeText, { color: SEM.accentBlue }]}>
                UNIDAD #{choferSeleccionado.id}
              </Text>
            </View>
            <View style={[
              styles.statusDot,
              {
                backgroundColor: getColorEstado(choferSeleccionado.latitud, choferSeleccionado.ultima_actualizacion),
                borderColor: colors.bgCard,
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
                    backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(79,142,247,0.08)',
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(79,142,247,0.15)',
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

// ─── Estilos Premium 2026 ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loaderText: { marginTop: 14, fontSize: 13, letterSpacing: 1 },

  headerPill: {
    position: 'absolute',
    height: 60,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
    borderWidth: 1,
    zIndex: 20,
  },
  headerBtn: {
    width: 48, height: 48, borderRadius: 24,
    justifyContent: 'center', alignItems: 'center',
  },
  headerTitleWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 14, fontWeight: '800', letterSpacing: 1,
  },
  headerStatsRow: {
    flexDirection: 'row', gap: 8, marginTop: 4,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
  },
  dot: { width: 4, height: 4, borderRadius: 2 },
  badgeText: { fontSize: 11, fontWeight: '800' },

  timestampPill: {
    position: 'absolute',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 16, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1, shadowRadius: 8, elevation: 5,
  },
  timestampText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },

  actionButtons: {
    position: 'absolute', gap: 14, zIndex: 15,
  },
  actionBtn: {
    width: 52, height: 52, borderRadius: 26,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2, shadowRadius: 10, elevation: 8,
  },

  zoomCluster: {
    position: 'absolute', alignItems: 'center',
  },
  zoomControlsContainer: {
    borderRadius: 22, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 10, elevation: 6,
    overflow: 'hidden', width: 48,
  },
  zoomBtn: { height: 48, justifyContent: 'center', alignItems: 'center' },
  zoomDivider: { height: 1, marginHorizontal: 8 },

  errorBanner: {
    position: 'absolute', left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 16, padding: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25, shadowRadius: 12, elevation: 8,
  },
  errorText: { flex: 1, color: '#FFFFFF', fontSize: 13, fontWeight: '700' },

  detailPanel: {
    position: 'absolute',
    borderRadius: 28, padding: 24, borderWidth: 1,
    shadowColor: '#000', shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.2, shadowRadius: 20, elevation: 24,
  },
  detailPreHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: 20,
  },
  detailBadge: {
    paddingHorizontal: 16, paddingVertical: 6, borderRadius: 12, borderWidth: 1,
  },
  detailBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  statusDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  detailGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 16,
    marginBottom: 24, paddingBottom: 24, borderBottomWidth: 1,
  },
  detailGridItem: {
    width: '46%', flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  detailGridIconBox: {
    width: 40, height: 40, borderRadius: 12,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1,
  },
  detailGridTextContainer: { flex: 1 },
  detailGridLabel: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  detailGridValue: { fontSize: 14, fontWeight: '800', marginTop: 4 },
  closeButton: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  closeButtonText: { color: '#FFF', fontSize: 13, fontWeight: '800', letterSpacing: 2 },
});
