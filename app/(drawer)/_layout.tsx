// app/(drawer)/_layout.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ADMIN_EMAIL, APP_NAME, APP_VERSION } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

const lastSeenKey = (email: string) => `chat_last_seen_${email}`;

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

function useMensajesNoLeidos(miEmail: string, esAdmin: boolean | null, isChatActive: boolean): number {
  const [noLeidos, setNoLeidos] = useState(0);

  const fetchCount = useCallback(async () => {
    if (!miEmail || esAdmin === null) return;
    try {
      const lastSeen = await AsyncStorage.getItem(lastSeenKey(miEmail));
      const desde = lastSeen ?? new Date(0).toISOString();
      let query = supabase.from('mensajes').select('id', { count: 'exact', head: true })
        .gt('created_at', desde).neq('remitente', 'Sistema');
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
      .then(() => setNoLeidos(0)).catch(console.warn);
  }, [isChatActive, miEmail]);

  useEffect(() => {
    if (!isChatActive) fetchCount();
    const canal = supabase.channel('badge-mensajes-noLeidos')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' },
        () => { if (!isChatActive) fetchCount(); })
      .subscribe();
    return () => { void supabase.removeChannel(canal); };
  }, [fetchCount, isChatActive]);

  return noLeidos;
}

function HeaderLeft() {
  const navigation = useNavigation();
  return (
    <TouchableOpacity onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())} style={styles.headerBtn} activeOpacity={0.6}>
      <Ionicons name="menu-outline" size={26} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

function HeaderRight() {
  const router = useRouter();
  const handleLogout = () => {
    Alert.alert('Cerrar Sesion', 'Estas seguro que deseas salir?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir', style: 'destructive', onPress: async () => {
          try { await supabase.auth.signOut(); router.replace('/login' as any); }
          catch { Alert.alert('Error', 'No se pudo cerrar la sesion.'); }
        }
      },
    ]);
  };
  return (
    <TouchableOpacity onPress={handleLogout} style={styles.headerBtn} activeOpacity={0.6}>
      <Ionicons name="log-out-outline" size={24} color="#FF6B6B" />
    </TouchableOpacity>
  );
}

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
];

function DrawerContent(props: any) {
  const router = useRouter();
  const { esAdmin, miEmail } = useEsAdmin();
  const nombreChofer = useNombreChofer(miEmail, esAdmin);
  const currentRoute = props.state?.routes[props.state?.index]?.name;
  const isChatActive = currentRoute === 'chat';
  const noLeidosChat = useMensajesNoLeidos(miEmail, esAdmin, isChatActive);

  if (esAdmin === null) return <View style={styles.drawerContainer} />;
  const items = esAdmin ? ITEMS_ADMIN : ITEMS_CHOFER;

  return (
    <View style={styles.drawerContainer}>
      <View style={styles.drawerHeader}>
        <View style={styles.drawerLogoBox}>
          <Ionicons name="bus" size={28} color="#4F8EF7" />
        </View>
        <Text style={styles.drawerBrand}>{APP_NAME}</Text>

        {/* Nombre del chofer buscado en Supabase */}
        {!esAdmin && nombreChofer ? (
          <Text style={styles.drawerNombreChofer}>{nombreChofer}</Text>
        ) : null}

        <View style={styles.rolBadgeRow}>
          <View style={[styles.rolBadge, esAdmin ? styles.rolBadgeAdmin : styles.rolBadgeChofer]}>
            <Ionicons name={esAdmin ? 'shield-checkmark-outline' : 'person-outline'} size={10} color={esAdmin ? '#F59E0B' : '#4F8EF7'} />
            <Text style={[styles.rolBadgeText, esAdmin ? { color: '#F59E0B' } : { color: '#4F8EF7' }]}>
              {esAdmin ? 'Administrador' : 'Chofer'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.drawerItems}>
        {items.map((item) => {
          const isActive = currentRoute === item.name;
          const esChatConBadge = item.name === 'chat' && noLeidosChat > 0;
          return (
            <TouchableOpacity
              key={item.name}
              style={[styles.drawerItem, isActive && styles.drawerItemActive]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.drawerIconBox, isActive && styles.drawerIconBoxActive]}>
                <Ionicons name={item.icon as any} size={20} color={isActive ? '#4F8EF7' : '#4A6FA5'} />
                {esChatConBadge && !isActive && (
                  <View style={styles.iconBadge}>
                    <Text style={styles.iconBadgeText}>{noLeidosChat > 99 ? '99+' : noLeidosChat}</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.drawerLabel, isActive && styles.drawerLabelActive]}>{item.label}</Text>
              {esChatConBadge && !isActive && (
                <View style={styles.labelBadge}>
                  <Text style={styles.labelBadgeText}>{noLeidosChat > 99 ? '99+' : noLeidosChat}</Text>
                </View>
              )}
              {isActive && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.drawerFooter}>
        <View style={styles.divider} />
        <Text style={styles.drawerFooterText}>v{APP_VERSION} - {new Date().getFullYear()}</Text>
      </View>
    </View>
  );
}

export default function DrawerLayout() {
  const { esAdmin } = useEsAdmin();
  const rutaInicial = esAdmin === true ? 'index' : 'colectas';
  return (
    <Drawer
      initialRouteName={rutaInicial}
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        drawerType: 'front', headerShown: true,
        drawerStyle: { width: 280, backgroundColor: 'transparent' },
        headerStyle: { backgroundColor: '#060B18', borderBottomWidth: 0, elevation: 0, shadowOpacity: 0 },
        headerTintColor: '#FFFFFF',
        headerLeft: () => <HeaderLeft />,
        headerRight: () => <HeaderRight />,
        headerTitleStyle: { fontWeight: '700', fontSize: 17, color: '#FFFFFF' },
      }}
    >
      <Drawer.Screen name="index" options={{ title: 'Recorridos' }} />
      <Drawer.Screen name="personal" options={{ title: 'Equipo Logistico' }} />
      <Drawer.Screen name="mapa" options={{ title: 'Mapa de Rutas' }} />
      <Drawer.Screen name="colectas" options={{ title: 'Colectas de Hoy' }} />
      <Drawer.Screen name="chat" options={{ title: 'Chat' }} />
      <Drawer.Screen name="Panel" options={{ title: 'Panel del Dia' }} />
      <Drawer.Screen name="explore" options={{ drawerItemStyle: { display: 'none' } }} />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  headerBtn: { marginHorizontal: 14, padding: 4 },
  drawerContainer: { flex: 1, backgroundColor: '#060B18', paddingTop: 56 },
  drawerHeader: { paddingHorizontal: 24, paddingBottom: 20, alignItems: 'flex-start' },
  drawerLogoBox: {
    width: 54, height: 54, borderRadius: 16,
    backgroundColor: 'rgba(79,142,247,0.12)',
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.2)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
  },
  drawerBrand: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.2 },
  drawerNombreChofer: { fontSize: 14, fontWeight: '600', color: '#4A6FA5', marginTop: 4, marginBottom: 2 },
  rolBadgeRow: { marginTop: 8 },
  rolBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, alignSelf: 'flex-start' },
  rolBadgeAdmin: { backgroundColor: 'rgba(245,158,11,0.1)', borderColor: 'rgba(245,158,11,0.25)' },
  rolBadgeChofer: { backgroundColor: 'rgba(79,142,247,0.1)', borderColor: 'rgba(79,142,247,0.25)' },
  rolBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  divider: { height: 1, backgroundColor: '#0D1A2E', marginHorizontal: 24, marginBottom: 16 },
  drawerItems: { paddingHorizontal: 16, gap: 4 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13, paddingHorizontal: 12, borderRadius: 14, position: 'relative' },
  drawerItemActive: { backgroundColor: 'rgba(79,142,247,0.08)' },
  drawerIconBox: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#0D1A2E', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  drawerIconBoxActive: { backgroundColor: 'rgba(79,142,247,0.15)' },
  drawerLabel: { fontSize: 15, fontWeight: '600', color: '#3A5A80', flex: 1 },
  drawerLabelActive: { color: '#FFFFFF' },
  activeIndicator: { width: 4, height: 18, borderRadius: 2, backgroundColor: '#4F8EF7', position: 'absolute', right: 12 },
  drawerFooter: { position: 'absolute', bottom: 40, left: 0, right: 0 },
  drawerFooterText: { textAlign: 'center', color: '#0D1A2E', fontSize: 11, fontWeight: '600', marginTop: 16 },
  iconBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#EF4444', borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 3, borderWidth: 1.5, borderColor: '#060B18' },
  iconBadgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '800' },
  labelBadge: { backgroundColor: '#EF4444', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5, marginRight: 12 },
  labelBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
});