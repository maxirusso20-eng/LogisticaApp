import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import React from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { supabase } from '../../lib/supabase';

function HeaderLeft() {
  const navigation = useNavigation();
  return (
    <TouchableOpacity
      onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
      style={styles.headerBtn}
      activeOpacity={0.6}
    >
      <Ionicons name="menu-outline" size={26} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

function HeaderRight() {
  const router = useRouter();

  const handleLogout = () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro que deseas salir?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Salir',
          style: 'destructive',
          onPress: async () => {
            try {
              await supabase.auth.signOut();
              router.replace('/login' as any);
            } catch {
              Alert.alert('Error', 'No se pudo cerrar la sesión.');
            }
          },
        },
      ]
    );
  };

  return (
    <TouchableOpacity onPress={handleLogout} style={styles.headerBtn} activeOpacity={0.6}>
      <Ionicons name="log-out-outline" size={24} color="#FF6B6B" />
    </TouchableOpacity>
  );
}

// Componente personalizado para el contenido del Drawer
function DrawerContent(props: any) {
  const router = useRouter();
  const items = [
    { name: 'index',    label: 'Recorridos',    icon: 'bus-outline',     route: '/(drawer)/' },
    { name: 'personal', label: 'Personal',       icon: 'people-outline',  route: '/(drawer)/personal' },
    { name: 'mapa',     label: 'Mapa de Rutas', icon: 'map-outline',     route: '/(drawer)/mapa' },
    { name: 'colectas', label: 'Colectas de Hoy', icon: 'archive-outline', route: '/(drawer)/colectas' },
  ];

  const currentRoute = props.state?.routes[props.state?.index]?.name;

  return (
    <View style={styles.drawerContainer}>
      {/* Header del Drawer */}
      <View style={styles.drawerHeader}>
        <View style={styles.drawerLogoBox}>
          <Ionicons name="bus" size={28} color="#4F8EF7" />
        </View>
        <Text style={styles.drawerBrand}>Logística Hogareño</Text>
        <Text style={styles.drawerSub}>Panel de Control</Text>
      </View>

      {/* Divisor */}
      <View style={styles.divider} />

      {/* Ítems de navegación */}
      <View style={styles.drawerItems}>
        {items.map((item) => {
          const isActive = currentRoute === item.name;
          return (
            <TouchableOpacity
              key={item.name}
              style={[styles.drawerItem, isActive && styles.drawerItemActive]}
              onPress={() => router.push(item.route as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.drawerIconBox, isActive && styles.drawerIconBoxActive]}>
                <Ionicons
                  name={item.icon as any}
                  size={20}
                  color={isActive ? '#4F8EF7' : '#4A6FA5'}
                />
              </View>
              <Text style={[styles.drawerLabel, isActive && styles.drawerLabelActive]}>
                {item.label}
              </Text>
              {isActive && <View style={styles.activeIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Footer del Drawer */}
      <View style={styles.drawerFooter}>
        <View style={styles.divider} />
        <Text style={styles.drawerFooterText}>v1.0.0 · © 2026</Text>
      </View>
    </View>
  );
}

export default function DrawerLayout() {
  return (
    <Drawer
      drawerContent={(props) => <DrawerContent {...props} />}
      screenOptions={{
        drawerType: 'front',
        headerShown: true,
        drawerStyle: { width: 280, backgroundColor: 'transparent' },
        headerStyle: { backgroundColor: '#060B18', borderBottomWidth: 0, elevation: 0, shadowOpacity: 0 },
        headerTintColor: '#FFFFFF',
        headerLeft: () => <HeaderLeft />,
        headerRight: () => <HeaderRight />,
        headerTitleStyle: { fontWeight: '700', fontSize: 17, color: '#FFFFFF' },
      }}
    >
      <Drawer.Screen name="index"    options={{ title: 'Recorridos' }} />
      <Drawer.Screen name="personal" options={{ title: 'Equipo Logístico' }} />
      <Drawer.Screen name="mapa"     options={{ title: 'Mapa de Rutas' }} />
      <Drawer.Screen name="colectas" options={{ title: 'Colectas de Hoy' }} />
      <Drawer.Screen name="explore"  options={{ drawerItemStyle: { display: 'none' } }} />
    </Drawer>
  );
}

const styles = StyleSheet.create({
  headerBtn: { marginHorizontal: 14, padding: 4 },
  drawerContainer: { flex: 1, backgroundColor: '#060B18', paddingTop: 56 },
  drawerHeader: { paddingHorizontal: 24, paddingBottom: 24, alignItems: 'flex-start' },
  drawerLogoBox: {
    width: 54, height: 54, borderRadius: 16,
    backgroundColor: 'rgba(79,142,247,0.12)',
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.2)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 14,
  },
  drawerBrand: { fontSize: 18, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.2 },
  drawerSub: { fontSize: 12, color: '#2A4A70', marginTop: 4, fontWeight: '500' },
  divider: { height: 1, backgroundColor: '#0D1A2E', marginHorizontal: 24, marginBottom: 16 },
  drawerItems: { paddingHorizontal: 16, gap: 4 },
  drawerItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 13, paddingHorizontal: 12,
    borderRadius: 14, position: 'relative',
  },
  drawerItemActive: { backgroundColor: 'rgba(79,142,247,0.08)' },
  drawerIconBox: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#0D1A2E',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  drawerIconBoxActive: { backgroundColor: 'rgba(79,142,247,0.15)' },
  drawerLabel: { fontSize: 15, fontWeight: '600', color: '#3A5A80', flex: 1 },
  drawerLabelActive: { color: '#FFFFFF' },
  activeIndicator: {
    width: 4, height: 18, borderRadius: 2,
    backgroundColor: '#4F8EF7', position: 'absolute', right: 12,
  },
  drawerFooter: { position: 'absolute', bottom: 40, left: 0, right: 0 },
  drawerFooterText: { textAlign: 'center', color: '#0D1A2E', fontSize: 11, fontWeight: '600', marginTop: 16 },
});