import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { supabase } from '../lib/supabase';

export const unstable_settings = {
  initialRouteName: '(drawer)',
};

function SplashLoader() {
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 900, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={splash.container}>
      <Animated.View style={[splash.logoRing, { opacity: pulse }]}>
        <View style={splash.logoDot} />
      </Animated.View>
      <Text style={splash.brand}>Logística Hogareño</Text>
      <ActivityIndicator size="small" color="#4F8EF7" style={{ marginTop: 32 }} />
    </View>
  );
}

const splash = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#060B18',
  },
  logoRing: {
    width: 80,
    height: 80,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#4F8EF7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  logoDot: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#4F8EF7',
  },
  brand: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
});

export default function RootLayout() {
  const [isLoading, setIsLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  // ─────────────────────────────────────────────────────────────────────
  // FIX: antes, handleRouting se llamaba con isLoading=true (bug de closure),
  // por lo que nunca redirigía en la carga inicial.
  // Ahora separamos: (1) setIsLoading al recibir la sesión inicial,
  // (2) un useEffect separado que reacciona a cambios de sesión/segmento
  //     pero solo cuando ya terminó de cargar.
  // ─────────────────────────────────────────────────────────────────────

  const sessionRef = useRef<boolean | null>(null); // null = sin datos aún

  useEffect(() => {
    // Escuchar cambios de auth en tiempo real
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      sessionRef.current = !!session;
    });

    // Verificar sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      sessionRef.current = !!session;
      setIsLoading(false); // ← primero actualizar estado, LUEGO el efecto de routing actúa
    });

    return () => subscription.unsubscribe();
  }, []);

  // Redirigir cada vez que cambia la ruta o termina de cargar
  useEffect(() => {
    if (isLoading || sessionRef.current === null) return;

    const inAuthGroup = segments[0] === 'login';
    const hasSession = sessionRef.current;

    if (!hasSession && !inAuthGroup) {
      router.replace('/login' as any);
    } else if (hasSession && inAuthGroup) {
      router.replace('/(drawer)' as any);
    }
  }, [isLoading, segments]);

  if (isLoading) return <SplashLoader />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={DarkTheme}>
        <Stack>
          <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}