// app/(drawer)/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { ADMIN_EMAIL, APP_NAME, APP_VERSION } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

SplashScreen.preventAutoHideAsync();

const lastSeenKey = (email: string) => `chat_last_seen_${email}`;

// ─── Hooks de datos ───────────────────────────────────────────────────────────

function useEsAdmin(): { esAdmin: boolean | null; miEmail: string } {
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null);
  const [miEmail, setMiEmail] = useState('');
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const email = session?.user?.email ?? '';
      if (email) { setMiEmail(email); setEsAdmin(email === ADMIN_EMAIL); }
      else {
        supabase.auth.getUser().then(({ data }) => {
          const e = data.user?.email ?? '';
          setMiEmail(e); setEsAdmin(e === ADMIN_EMAIL);
        });
      }
    });
  }, []);
  return { esAdmin, miEmail };
}

function useNombreChofer(miEmail: string, esAdmin: boolean | null): string {
  const [nombre, setNombre] = useState('');
  useEffect(() => {
    if (!miEmail || esAdmin !== false) return;
    supabase.from('Choferes').select('nombre').eq('email', miEmail).maybeSingle()
      .then(({ data }) => { if (data?.nombre) setNombre(data.nombre); });
  }, [miEmail, esAdmin]);
  return nombre;
}

function useMensajesNoLeidos(
  miEmail: string,
  esAdmin: boolean | null,
  isChatActive: boolean
): number {
  const [noLeidos, setNoLeidos] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!miEmail || esAdmin === null) return;
    try {
      const lastSeen = await AsyncStorage.getItem(lastSeenKey(miEmail));
      const desde = lastSeen ?? new Date(0).toISOString();
      let query = supabase
        .from('mensajes')
        .select('id', { count: 'exact', head: true })
        .gt('created_at', desde)
        .neq('remitente', 'Sistema');
      if (esAdmin) {
        query = query.neq('remitente', 'Admin');
      } else {
        query = query.eq('chofer_email', miEmail).eq('remitente', 'Admin');
      }
      const { count } = await query;
      setNoLeidos(count ?? 0);
    } catch (err) { console.warn('[Badge]', err); }
  }, [miEmail, esAdmin]);

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
          try { await supabase.auth.signOut(); router.replace('/login' as any); }
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

const ITEMS_ADMIN = [
  { name: 'index', label: 'Recorridos', icon: 'bus-outline', route: '/(drawer)/' },
  { name: 'personal', label: 'Personal', icon: 'people-outline', route: '/(drawer)/personal' },
  { name: 'mapa', label: 'Mapa de Rutas', icon: 'map-outline', route: '/(drawer)/mapa' },
  { name: 'colectas', label: 'Colectas de Hoy', icon: 'archive-outline', route: '/(drawer)/colectas' },
  { name: 'chat', label: 'Chat', icon: 'chatbubbles-outline', route: '/(drawer)/chat' },
];
const ITEMS_CHOFER = [
  { name: 'Panel', label: 'Panel del Dia', icon: 'clipboard-outline', route: '/(drawer)/Panel' },
  { name: 'colectas', label: 'Mis Colectas', icon: 'archive-outline', route: '/(drawer)/colectas' },
  { name: 'chat', label: 'Chat', icon: 'chatbubbles-outline', route: '/(drawer)/chat' },
  { name: 'escaner', label: 'Escanear QR', icon: 'qr-code-outline', route: '/(drawer)/escaner' },
];

// ─── Drawer Content ───────────────────────────────────────────────────────────

function DrawerContent(props: any) {
  const router = useRouter();
  const { esAdmin, miEmail } = useEsAdmin();
  const nombreChofer = useNombreChofer(miEmail, esAdmin);
  const { colors } = useTheme();
  const currentRoute = props.state?.routes[props.state?.index]?.name;
  const isChatActive = currentRoute === 'chat';
  const noLeidosChat = useMensajesNoLeidos(miEmail, esAdmin, isChatActive);

  if (esAdmin === null) return <View style={[drawerStyles.container, { backgroundColor: colors.bgDrawer }]} />;
  const items = esAdmin ? ITEMS_ADMIN : ITEMS_CHOFER;

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
          <View style={[
            drawerStyles.rolBadge,
            esAdmin
              ? { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.25)' }
              : { backgroundColor: colors.blueSubtle, borderColor: `${colors.blue}40` },
          ]}>
            <Ionicons
              name={esAdmin ? 'shield-checkmark-outline' : 'person-outline'}
              size={10}
              color={esAdmin ? colors.amber : colors.blue}
            />
            <Text style={[drawerStyles.rolBadgeText, { color: esAdmin ? colors.amber : colors.blue }]}>
              {esAdmin ? 'Administrador' : 'Chofer'}
            </Text>
          </View>
        </View>
      </View>

      <View style={[drawerStyles.divider, { backgroundColor: colors.borderSubtle }]} />

      {/* Items de navegación */}
      <View style={drawerStyles.items}>
        {items.map((item) => {
          const isActive = currentRoute === item.name;
          const esChatConBadge = item.name === 'chat' && noLeidosChat > 0;
          return (
            <TouchableOpacity
              key={item.name}
              style={[
                drawerStyles.item,
                isActive && { backgroundColor: `${colors.blue}14` },
              ]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.7}
            >
              <View style={[
                drawerStyles.iconBox,
                { backgroundColor: colors.borderSubtle },
                isActive && { backgroundColor: `${colors.blue}26` },
              ]}>
                <Ionicons
                  name={item.icon as any}
                  size={20}
                  color={isActive ? colors.blue : colors.textMuted}
                />
                {esChatConBadge && !isActive && (
                  <View style={drawerStyles.iconBadge}>
                    <Text style={drawerStyles.iconBadgeText}>
                      {noLeidosChat > 99 ? '99+' : noLeidosChat}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={[
                drawerStyles.label,
                { color: colors.textMuted },
                isActive && { color: colors.textPrimary },
              ]}>
                {item.label}
              </Text>
              {esChatConBadge && !isActive && (
                <View style={drawerStyles.labelBadge}>
                  <Text style={drawerStyles.labelBadgeText}>
                    {noLeidosChat > 99 ? '99+' : noLeidosChat}
                  </Text>
                </View>
              )}
              {isActive && (
                <View style={[drawerStyles.activeIndicator, { backgroundColor: colors.blue }]} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Footer — solo versión */}
      <View style={drawerStyles.footer}>
        <View style={[drawerStyles.divider, { backgroundColor: colors.borderSubtle }]} />
        <Text style={[drawerStyles.version, { color: colors.borderSubtle }]}>
          v{APP_VERSION} · {new Date().getFullYear()}
        </Text>
      </View>
    </View>
  );
}

// ─── Root Drawer Layout ───────────────────────────────────────────────────────

export default function DrawerLayout() {
  const { esAdmin } = useEsAdmin();
  const { colors, isDark } = useTheme();

  useEffect(() => {
    if (esAdmin !== null) SplashScreen.hideAsync();
  }, [esAdmin]);

  // Splash inteligente — respeta el tema actual, evita flash blanco en modo oscuro
  if (esAdmin === null) {
    return (
      <View style={[splashStyles.container, { backgroundColor: colors.bg }]}>
        <View style={[
          splashStyles.iconBox,
          {
            backgroundColor: isDark ? 'rgba(79,142,247,0.10)' : 'rgba(79,142,247,0.08)',
            borderColor: isDark ? 'rgba(79,142,247,0.25)' : 'rgba(79,142,247,0.18)',
          },
        ]}>
          <Ionicons name="bus" size={44} color="#4F8EF7" />
        </View>
        <ActivityIndicator size="large" color="#4F8EF7" style={{ marginTop: 28 }} />
        <Text style={[
          splashStyles.loadingText,
          { color: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.28)' },
        ]}>
          Cargando...
        </Text>
      </View>
    );
  }

  const rutaInicial = esAdmin ? 'index' : 'colectas';

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
          backgroundColor: 'transparent', // el color lo pone DrawerContent
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
      <Drawer.Screen name="index" options={{ title: 'Recorridos' }} />
      <Drawer.Screen name="personal" options={{ title: 'Equipo Logistico' }} />
      <Drawer.Screen name="mapa" options={{ title: 'Mapa de Rutas' }} />
      <Drawer.Screen name="colectas" options={{ title: 'Colectas de Hoy' }} />
      <Drawer.Screen name="chat" options={{ title: 'Chat' }} />
      <Drawer.Screen name="Panel" options={{ title: 'Panel del Dia' }} />
      <Drawer.Screen
        name="escaner"
        options={{
          title: 'Escanear QR',
          headerShown: false,
          drawerItemStyle: esAdmin ? { display: 'none' } : undefined,
        }}
      />
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
  items: { paddingHorizontal: 16, gap: 4 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 12, borderRadius: 14, position: 'relative' },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  label: { fontSize: 15, fontWeight: '600', flex: 1 },
  activeIndicator: { width: 4, height: 18, borderRadius: 2, position: 'absolute', right: 12 },
  iconBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#060B18' },
  iconBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  labelBadge: { backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5, marginRight: 12 },
  labelBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  footer: { position: 'absolute', bottom: 40, left: 0, right: 0 },
  version: { textAlign: 'center', fontSize: 11, fontWeight: '600', marginTop: 8 },
});