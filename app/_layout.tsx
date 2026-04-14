import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
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
  // ✅ FIX: estado real en lugar de ref → los cambios de sesión provocan re-render
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // ✅ Un solo listener que cubre la sesión inicial (INITIAL_SESSION)
    // y todos los cambios posteriores (SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, etc.)
    // Elimina la necesidad de getSession() y evita condiciones de carrera.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setHasSession(!!session);

      if (event === 'INITIAL_SESSION') {
        // La sesión inicial ya fue evaluada → podemos mostrar la app
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // ✅ Routing reactivo: se ejecuta ante cualquier cambio de sesión o segmento
  const handleRouting = useCallback(() => {
    if (isLoading || hasSession === null) return;

    const inAuthGroup = segments[0] === 'login';

    if (!hasSession && !inAuthGroup) {
      router.replace('/login' as any);
    } else if (hasSession && inAuthGroup) {
      router.replace('/(drawer)' as any);
    }
  }, [isLoading, hasSession, segments, router]);

  useEffect(() => {
    handleRouting();
  }, [handleRouting]);

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