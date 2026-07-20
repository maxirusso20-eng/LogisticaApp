// app/(drawer)/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { APP_NAME } from '../../lib/constants';
import { esAdminRol, useRol, type Rol } from '../../lib/auth';
import { forceStopTracking } from '../../lib/locationTracker';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { usePushTokenSync } from '../_hooks/usePushTokenSync';

SplashScreen.preventAutoHideAsync();

const lastSeenKey = (email: string) => `chat_last_seen_${email}`;

// ─── Hooks de datos ───────────────────────────────────────────────────────────

// Trae el nombre del chofer logueado (solo cuando el rol es 'chofer').
function useNombreChofer(miEmail: string, rol: Rol | null): string {
  const [nombre, setNombre] = useState('');
  useEffect(() => {
    if (!miEmail || rol !== 'chofer') return;
    supabase.from('Choferes').select('nombre').eq('email', miEmail).maybeSingle()
      .then(({ data }) => { if (data?.nombre) setNombre(data.nombre); });
  }, [miEmail, rol]);
  return nombre;
}

function useMensajesNoLeidos(
  miEmail: string,
  rol: Rol | null,
  isChatActive: boolean
): number {
  const [noLeidos, setNoLeidos] = useState(0);
  // Del lado "admin" (admin/subadmin/coordinador) cuentan los mensajes que no son
  // del propio Admin; del lado chofer, los que le mandó el Admin.
  const ladoAdmin = rol !== 'chofer';

  const fetchCount = useCallback(async () => {
    if (!miEmail || rol === null) return;
    try {
      const lastSeen = await AsyncStorage.getItem(lastSeenKey(miEmail));
      const desde = lastSeen ?? new Date(0).toISOString();
      let query = supabase
        .from('mensajes')
        .select('id', { count: 'exact', head: true })
        .gt('created_at', desde)
        .neq('remitente', 'Sistema');
      if (ladoAdmin) {
        query = query.neq('remitente', 'Admin');
      } else {
        query = query.eq('chofer_email', miEmail).eq('remitente', 'Admin');
      }
      const { count } = await query;
      setNoLeidos(count ?? 0);
    } catch (err) { console.warn('[Badge]', err); }
  }, [miEmail, rol, ladoAdmin]);

  useEffect(() => {
    if (!isChatActive || !miEmail) return;
    AsyncStorage.setItem(lastSeenKey(miEmail), new Date().toISOString())
      .then(() => setNoLeidos(0))
      .catch(console.warn);
  }, [isChatActive, miEmail]);

  useEffect(() => {
    if (!isChatActive) fetchCount();
    const canal = supabase
      .channel('badge-mensajes-noLeidos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' },
        () => { if (!isChatActive) fetchCount(); })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [fetchCount, isChatActive]);

  return noLeidos;
}

// ─── Header Buttons ───────────────────────────────────────────────────────────

function HeaderLeft() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
      style={styles.headerBtn}
      activeOpacity={0.6}
    >
      <Ionicons name="menu-outline" size={26} color={colors.textPrimary} />
    </TouchableOpacity>
  );
}

function HeaderRight() {
  const router = useRouter();
  const { isDark, toggleTheme, colors } = useTheme();

  const handleLogout = () => {
    Alert.alert('Cerrar Sesion', '¿Estás seguro que deseás salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', style: 'destructive', onPress: async () => {
          try { await forceStopTracking(); await supabase.auth.signOut(); router.replace('/login' as any); }
          catch { Alert.alert('Error', 'No se pudo cerrar la sesion.'); }
        },
      },
    ]);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TouchableOpacity
        onPress={toggleTheme}
        style={[styles.headerBtn, styles.themeBtn]}
        activeOpacity={0.6}
        accessibilityLabel={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      >
        <Ionicons
          name={isDark ? 'sunny-outline' : 'moon-outline'}
          size={20}
          color={isDark ? '#F59E0B' : colors.blue}
        />
      </TouchableOpacity>
      <TouchableOpacity onPress={handleLogout} style={styles.headerBtn} activeOpacity={0.6}>
        <Ionicons name="log-out-outline" size={24} color={colors.red} />
      </TouchableOpacity>
    </View>
  );
}

// ─── Drawer items ─────────────────────────────────────────────────────────────

// Items agrupados por sección (estilo web). Cada ítem declara qué roles lo ven
// (espeja Sidebar.jsx de la web). El menú se arma filtrando por el rol resuelto.
type ItemMenu = { name: string; label: string; icon: string; route: string; color: string; roles: Rol[] };
type GrupoMenu = { label: string; items: ItemMenu[] };

const GRUPOS: GrupoMenu[] = [
  {
    label: 'OPERACIÓN', items: [
      { name: 'index', label: 'Recorridos', icon: 'bus-outline', route: '/(drawer)/', color: '#4F8EF7', roles: ['admin', 'subadmin', 'coordinador'] },
      { name: 'clientes', label: 'Clientes', icon: 'business-outline', route: '/(drawer)/clientes', color: '#8B5CF6', roles: ['admin', 'subadmin'] },
      { name: 'colectas', label: 'Colectas de Hoy', icon: 'archive-outline', route: '/(drawer)/colectas', color: '#F59E0B', roles: ['admin', 'subadmin'] },
      { name: 'mapa', label: 'Mapa de Rutas', icon: 'map-outline', route: '/(drawer)/mapa', color: '#10B981', roles: ['admin', 'subadmin', 'coordinador'] },
    ],
  },
  {
    label: 'EQUIPO Y KPIs', items: [
      { name: 'personal', label: 'Choferes', icon: 'people-outline', route: '/(drawer)/personal', color: '#3B82F6', roles: ['admin', 'subadmin'] },
      { name: 'estadisticas', label: 'Estadísticas', icon: 'bar-chart-outline', route: '/(drawer)/estadisticas', color: '#06B6D4', roles: ['admin', 'subadmin'] },
      { name: 'demorados-dia', label: 'Demorados por día', icon: 'calendar-outline', route: '/(drawer)/demorados-dia', color: '#EF4444', roles: ['admin', 'subadmin'] },
      { name: 'desempeno', label: 'Desempeño', icon: 'speedometer-outline', route: '/(drawer)/desempeno', color: '#A78BFA', roles: ['admin', 'subadmin'] },
      { name: 'ranking', label: 'Ranking', icon: 'trophy-outline', route: '/(drawer)/ranking', color: '#F59E0B', roles: ['admin', 'subadmin'] },
      { name: 'tabla-impacto', label: 'Impacto de cada ítem', icon: 'calculator-outline', route: '/(drawer)/tabla-impacto', color: '#EC4899', roles: ['admin', 'subadmin'] },
    ],
  },
  {
    label: 'GESTIÓN', items: [
      { name: 'accesos', label: 'Accesos', icon: 'shield-checkmark-outline', route: '/(drawer)/accesos', color: '#8B5CF6', roles: ['admin', 'subadmin'] },
    ],
  },
  {
    label: 'MI DÍA', items: [
      { name: 'Panel', label: 'Panel del Día', icon: 'clipboard-outline', route: '/(drawer)/Panel', color: '#4F8EF7', roles: ['chofer'] },
      { name: 'colectas', label: 'Mis Colectas', icon: 'archive-outline', route: '/(drawer)/colectas', color: '#F59E0B', roles: ['chofer'] },
      { name: 'mi-calendario', label: 'Mi Calendario', icon: 'calendar-outline', route: '/(drawer)/mi-calendario', color: '#8B5CF6', roles: ['chofer'] },
    ],
  },
  {
    label: 'MI DESEMPEÑO', items: [
      { name: 'rendimiento', label: 'Mi Rendimiento', icon: 'stats-chart-outline', route: '/(drawer)/rendimiento', color: '#3B82F6', roles: ['chofer'] },
      { name: 'mis-dias', label: 'Mi Día a Día', icon: 'calendar-outline', route: '/(drawer)/mis-dias', color: '#06B6D4', roles: ['chofer'] },
      { name: 'mis-envios', label: 'Mis Envíos', icon: 'cube-outline', route: '/(drawer)/mis-envios', color: '#3B82F6', roles: ['chofer'] },
      // "Ranking" oculto para el chofer por ahora (pedido). Reactivar: sumar roles ['chofer'].
      { name: 'mis-ausencias', label: 'Mis Faltas', icon: 'calendar-clear-outline', route: '/(drawer)/mis-ausencias', color: '#EF4444', roles: ['chofer'] },
    ],
  },
  {
    label: 'MÁS', items: [
      { name: 'chat', label: 'Chat', icon: 'chatbubbles-outline', route: '/(drawer)/chat', color: '#34D399', roles: ['admin', 'subadmin', 'coordinador', 'chofer'] },
      { name: 'ayuda', label: 'Guía de la app', icon: 'book-outline', route: '/(drawer)/ayuda', color: '#94A3B8', roles: ['admin', 'subadmin'] },
      { name: 'como-usar', label: 'Cómo usar la app', icon: 'compass-outline', route: '/(drawer)/como-usar', color: '#6366F1', roles: ['chofer'] },
      // "Cómo se mide" (guia) oculta por ahora (pedido).
    ],
  },
];

// Arma los grupos visibles para un rol: filtra ítems y descarta grupos vacíos.
function gruposParaRol(rol: Rol): GrupoMenu[] {
  return GRUPOS
    .map((g) => ({ ...g, items: g.items.filter((i) => i.roles.includes(rol)) }))
    .filter((g) => g.items.length > 0);
}

// Config del badge de rol en el header del drawer (etiqueta + ícono + color).
const ROL_BADGE: Record<Rol, { label: string; icon: keyof typeof Ionicons.glyphMap; color: 'amber' | 'blue' | 'cyan' }> = {
  admin: { label: 'Administrador', icon: 'shield-checkmark-outline', color: 'amber' },
  subadmin: { label: 'Subadmin', icon: 'shield-half-outline', color: 'amber' },
  coordinador: { label: 'Coordinador', icon: 'clipboard-outline', color: 'cyan' },
  chofer: { label: 'Chofer', icon: 'person-outline', color: 'blue' },
};

// ─── Collapsible Group ────────────────────────────────────────────────────────

function CollapsibleGroup({ label, items, currentRoute, noLeidosChat, colors, onNavigate }: {
  label: string;
  items: { name: string; label: string; icon: string; route: string; color: string }[];
  currentRoute: string;
  noLeidosChat: number;
  colors: any;
  onNavigate: (route: string) => void;
}) {
  const hasActive = items.some(i => i.name === currentRoute);
  const [open, setOpen] = useState(hasActive);
  const animVal = useRef(new Animated.Value(hasActive ? 1 : 0)).current;

  useEffect(() => {
    if (hasActive && !open) setOpen(true);
  }, [hasActive]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Animated.timing(animVal, {
      toValue: open ? 1 : 0,
      duration: 250,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const chevronRotate = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '90deg'],
  });
  const maxH = animVal.interpolate({
    inputRange: [0, 1],
    outputRange: [0, items.length * 64],
  });
  const opac = animVal.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0, 0.3, 1],
  });

  return (
    <View style={{ marginBottom: 6 }}>
      <TouchableOpacity
        onPress={() => setOpen(v => !v)}
        activeOpacity={0.7}
        style={drawerStyles.groupHeader}
      >
        <Text style={[drawerStyles.groupLabel, { color: colors.textMuted, marginTop: 0, marginBottom: 0, marginLeft: 0 }]}>{label}</Text>
        <Animated.View style={{ transform: [{ rotate: chevronRotate }] }}>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </Animated.View>
      </TouchableOpacity>

      <Animated.View style={{ maxHeight: maxH, opacity: opac, overflow: 'hidden' }}>
        {items.map((item) => {
          const isActive = currentRoute === item.name;
          const esChatConBadge = item.name === 'chat' && noLeidosChat > 0;
          return (
            <TouchableOpacity
              key={item.name}
              style={[drawerStyles.item, isActive && { backgroundColor: `${colors.blue}14` }]}
              onPress={() => onNavigate(item.route)}
              activeOpacity={0.7}
            >
              <View style={[drawerStyles.iconBox, { backgroundColor: `${item.color}18` }, isActive && { backgroundColor: `${item.color}30` }]}>
                <Ionicons name={item.icon as any} size={20} color={isActive ? item.color : `${item.color}BB`} />
                {esChatConBadge && !isActive && (
                  <View style={drawerStyles.iconBadge}>
                    <Text style={drawerStyles.iconBadgeText}>{noLeidosChat > 99 ? '99+' : noLeidosChat}</Text>
                  </View>
                )}
              </View>
              <Text style={[drawerStyles.label, { color: colors.textMuted }, isActive && { color: colors.textPrimary }]}>
                {item.label}
              </Text>
              {esChatConBadge && !isActive && (
                <View style={drawerStyles.labelBadge}>
                  <Text style={drawerStyles.labelBadgeText}>{noLeidosChat > 99 ? '99+' : noLeidosChat}</Text>
                </View>
              )}
              {isActive && (
                <View style={[drawerStyles.activeIndicator, { backgroundColor: item.color }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </Animated.View>
    </View>
  );
}

// ─── Drawer Content ───────────────────────────────────────────────────────────

function DrawerContent(props: any) {
  const router = useRouter();
  const { rol, miEmail } = useRol();
  const nombreChofer = useNombreChofer(miEmail, rol);
  const { colors } = useTheme();
  const currentRoute = props.state?.routes[props.state?.index]?.name;
  const isChatActive = currentRoute === 'chat';
  const noLeidosChat = useMensajesNoLeidos(miEmail, rol, isChatActive);

  if (rol === null) return <View style={[drawerStyles.container, { backgroundColor: colors.bgDrawer }]} />;
  const esAdmin = esAdminRol(rol);
  const grupos = gruposParaRol(rol);
  const rolCfg = ROL_BADGE[rol];

  return (
    <View style={[drawerStyles.container, { backgroundColor: colors.bgDrawer }]}>

      {/* ── Handle visual de deslizamiento ─────────────────────────────────
          Indica al usuario que puede deslizar para cerrar el drawer.
          Posicionado en la parte superior con un pequeño margen negativo
          para que "flote" visualmente sobre el borde redondeado. */}
      <View style={drawerStyles.handleWrap}>
        <View style={[drawerStyles.handle, { backgroundColor: colors.borderSubtle }]} />
      </View>

      {/* Header del drawer */}
      <View style={drawerStyles.header}>
        <View style={[drawerStyles.logoBox, { backgroundColor: colors.blueSubtle, borderColor: `${colors.blue}33` }]}>
          <Ionicons name="bus" size={28} color={colors.blue} />
        </View>
        <Text style={[drawerStyles.brand, { color: colors.textPrimary }]}>{APP_NAME}</Text>

        {!esAdmin && nombreChofer ? (
          <Text style={[drawerStyles.nombreChofer, { color: colors.textMuted }]}>
            {nombreChofer}
          </Text>
        ) : null}

        <View style={drawerStyles.rolBadgeRow}>
          {(() => {
            const badgeColor = rolCfg.color === 'amber' ? colors.amber : rolCfg.color === 'cyan' ? '#06B6D4' : colors.blue;
            return (
              <View style={[
                drawerStyles.rolBadge,
                { backgroundColor: `${badgeColor}1a`, borderColor: `${badgeColor}40` },
              ]}>
                <Ionicons name={rolCfg.icon} size={10} color={badgeColor} />
                <Text style={[drawerStyles.rolBadgeText, { color: badgeColor }]}>
                  {rolCfg.label}
                </Text>
              </View>
            );
          })()}
        </View>
      </View>

      <View style={[drawerStyles.divider, { backgroundColor: colors.borderSubtle }]} />

      {/* Items de navegación, agrupados por sección con despliegue */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={drawerStyles.items} showsVerticalScrollIndicator={false}>
        {grupos.map((grupo) => (
          <CollapsibleGroup
            key={grupo.label}
            label={grupo.label}
            items={grupo.items}
            currentRoute={currentRoute}
            noLeidosChat={noLeidosChat}
            colors={colors}
            onNavigate={(route: string) => router.push(route as any)}
          />
        ))}
        {/* Línea decorativa al final de los items */}
        <View style={{ height: 1, backgroundColor: colors.borderSubtle, marginTop: 16, marginHorizontal: 8 }} />
      </ScrollView>


    </View>
  );
}

// ─── Root Drawer Layout ───────────────────────────────────────────────────────

export default function DrawerLayout() {
  const { rol } = useRol();
  const { colors } = useTheme();

  // Registra/refresca el push token al entrar a la app, para CUALQUIER usuario
  // (admin o chofer), sin depender de qué pantalla abra. Sin esto, un chofer que
  // aterriza en "Mis Colectas" y no entra a Chat nunca guardaba su push_token y
  // jamás recibía las notificaciones de colectas. Detecta solo admin vs chofer.
  usePushTokenSync();

  useEffect(() => {
    if (rol !== null) SplashScreen.hideAsync();
  }, [rol]);

  // Splash de marca SIEMPRE navy (#1A2436, igual que el logo y el splash nativo)
  // → arranque premium y seamless, sin importar el tema.
  if (rol === null) {
    return (
      <View style={[splashStyles.container, { backgroundColor: '#1A2436' }]}>
        <View style={[
          splashStyles.iconBox,
          {
            backgroundColor: 'rgba(79,142,247,0.12)',
            borderColor: 'rgba(79,142,247,0.30)',
          },
        ]}>
          <Ionicons name="bus" size={44} color="#4F8EF7" />
        </View>
        <ActivityIndicator size="large" color="#4F8EF7" style={{ marginTop: 28 }} />
        <Text style={[
          splashStyles.loadingText,
          { color: 'rgba(255,255,255,0.45)' },
        ]}>
          Cargando...
        </Text>
      </View>
    );
  }

  const rutaInicial = rol === 'chofer' ? 'colectas' : 'index';

  return (
    <Drawer
      initialRouteName={rutaInicial}
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        // ── Gesture config ─────────────────────────────────────────────────
        drawerType: 'front',       // drawer se superpone a la pantalla
        swipeEnabled: true,          // deslizar desde el borde para abrir/cerrar
        swipeEdgeWidth: 100,           // zona sensible al borde (px) — más fácil de activar
        swipeMinDistance: 5,            // distancia mínima para detectar el gesto

        // ── Estética del panel ─────────────────────────────────────────────
        drawerStyle: {
          width: 280,
          backgroundColor: colors.bgDrawer,
          // Bordes redondeados solo del lado derecho (donde termina el drawer)
          borderTopRightRadius: 24,
          borderBottomRightRadius: 24,
        },

        // ── Header ─────────────────────────────────────────────────────────
        headerShown: true,
        headerStyle: {
          backgroundColor: colors.bgHeader,
          borderBottomWidth: 0,
          elevation: 0,
          shadowOpacity: 0,
        },
        headerTintColor: colors.textPrimary,
        headerLeft: () => <HeaderLeft />,
        headerRight: () => <HeaderRight />,
        headerTitleStyle: { fontWeight: '700', fontSize: 17, color: colors.textPrimary },

        // ── Overlay ────────────────────────────────────────────────────────
        // Oscurecer levemente el contenido detrás cuando el drawer está abierto
        overlayColor: 'rgba(0,0,0,0.45)',
      }}
    >
      {/* La visibilidad del menú la controla el drawer custom (gruposParaRol);
          acá solo se registran las rutas y su título de header. */}
      <Drawer.Screen name="index" options={{ title: 'Recorridos' }} />
      <Drawer.Screen name="personal" options={{ title: 'Equipo Logistico' }} />
      <Drawer.Screen name="mapa" options={{ title: 'Mapa de Rutas' }} />
      <Drawer.Screen name="colectas" options={{ title: 'Colectas de Hoy' }} />
      <Drawer.Screen name="chat" options={{ title: 'Chat' }} />
      <Drawer.Screen name="Panel" options={{ title: 'Panel del Dia' }} />
      <Drawer.Screen name="rendimiento" options={{ title: 'Mi Rendimiento' }} />
      <Drawer.Screen name="ranking" options={{ title: 'Ranking de la flota' }} />
      <Drawer.Screen name="estadisticas" options={{ title: 'Estadísticas' }} />
      <Drawer.Screen name="demorados-dia" options={{ title: 'Demorados por día' }} />
      <Drawer.Screen name="clientes" options={{ title: 'Clientes' }} />
      <Drawer.Screen name="desempeno" options={{ title: 'Desempeño' }} />
      <Drawer.Screen name="accesos" options={{ title: 'Gestión de Accesos' }} />
      <Drawer.Screen name="ausencias" options={{ title: 'Ausencias', drawerItemStyle: { display: 'none' } }} />
      <Drawer.Screen name="ayuda" options={{ title: 'Guía de la app' }} />
      <Drawer.Screen name="mis-ausencias" options={{ title: 'Mis Faltas' }} />
      <Drawer.Screen name="mis-dias" options={{ title: 'Mi Día a Día' }} />
      <Drawer.Screen name="mis-envios" options={{ title: 'Mis Envíos' }} />
      <Drawer.Screen name="mi-calendario" options={{ title: 'Mi Calendario' }} />
      <Drawer.Screen name="guia" options={{ title: 'Cómo se mide' }} />
      <Drawer.Screen name="tabla-impacto" options={{ title: 'Impacto de cada ítem' }} />
      <Drawer.Screen name="como-usar" options={{ title: 'Cómo usar la app' }} />
    </Drawer>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  headerBtn: { marginHorizontal: 14, padding: 4 },
  themeBtn: { marginRight: 2 },
});

const splashStyles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  iconBox: { width: 82, height: 82, borderRadius: 24, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  loadingText: { marginTop: 14, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
});

const drawerStyles = StyleSheet.create({
  container: { flex: 1, paddingTop: 44 },

  // ── Handle visual ──────────────────────────────────────────────────────────
  handleWrap: {
    alignItems: 'center',
    paddingBottom: 14,
    // Posicionarlo sobre el borde redondeado superior
    marginTop: -4,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
  },

  header: { paddingHorizontal: 24, paddingBottom: 20, alignItems: 'flex-start' },
  logoBox: { width: 54, height: 54, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginBottom: 14, borderWidth: 1 },
  brand: { fontSize: 18, fontWeight: '800', letterSpacing: -0.2 },
  nombreChofer: { fontSize: 14, fontWeight: '600', marginTop: 4, marginBottom: 2 },
  rolBadgeRow: { marginTop: 8 },
  rolBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, alignSelf: 'flex-start' },
  rolBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  divider: { height: 1, marginHorizontal: 24, marginBottom: 16 },
  items: { paddingHorizontal: 16, gap: 4, paddingBottom: 16 },
  groupLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 0.8, marginLeft: 12, marginTop: 10, marginBottom: 4, textTransform: 'uppercase', opacity: 0.7 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 12, borderRadius: 14, position: 'relative' },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  label: { fontSize: 15, fontWeight: '600', flex: 1 },
  activeIndicator: { width: 4, height: 18, borderRadius: 2, position: 'absolute', right: 12 },
  iconBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#060B18' },
  iconBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  labelBadge: { backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5, marginRight: 12 },
  labelBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  footer: { paddingVertical: 16 },
  version: { textAlign: 'center', fontSize: 11, fontWeight: '600', marginTop: 8 },
});