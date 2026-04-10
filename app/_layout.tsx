// app/_layout.tsx
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

const ADMIN_EMAIL = 'maxirusso20@gmail.com';

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
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060B18' },
  logoRing: {
    width: 80, height: 80, borderRadius: 24,
    borderWidth: 2, borderColor: '#4F8EF7',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  logoDot: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#4F8EF7' },
  brand: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
});

export default function RootLayout() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  // FIX FLASH: guardamos el email durante el splash, ANTES de renderizar
  // el Drawer. Así cuando el Drawer se monta ya sabe a qué pantalla ir
  // y nunca muestra Recorridos por un instante.
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const segments = useSegments();
  const router = useRouter();
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted.current) {
        setHasSession(!!session);
        // Si la sesión cambia (logout) limpiamos el email
        if (!session) setUserEmail(null);
      }
    });

    // Verificar sesión inicial — también resolvemos el email aquí
    // para que el Drawer ya sepa el rol al primer render.
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!isMounted.current) return;

      if (session) {
        // Obtener el email durante el splash, no después
        const { data } = await supabase.auth.getUser();
        if (isMounted.current) {
          setUserEmail(data.user?.email ?? null);
        }
      }

      if (isMounted.current) {
        setHasSession(!!session);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  // Redirigir según sesión y rol — ahora con email ya disponible
  useEffect(() => {
    if (isLoading || hasSession === null) return;

    const inAuthGroup = segments[0] === 'login';

    if (!hasSession && !inAuthGroup) {
      router.replace('/login' as any);
    } else if (hasSession && inAuthGroup) {
      // Admin → Recorridos, Chofer → Colectas
      if (userEmail === ADMIN_EMAIL) {
        router.replace('/(drawer)' as any);
      } else {
        router.replace('/(drawer)/colectas' as any);
      }
    }
  }, [isLoading, hasSession, segments, userEmail]);

  if (isLoading) return <SplashLoader />;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={DarkTheme}>
        {/*
          Pasamos userEmail como parámetro de contexto al Stack para que
          el DrawerLayout pueda leerlo sin hacer otro getUser().
          El Drawer usa este valor para definir su initialRouteName
          sin flash visible.
        */}
        <Stack>
          <Stack.Screen
            name="(drawer)"
            options={{ headerShown: false }}
            initialParams={{ userEmail }}
          />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
        </Stack>
        <StatusBar style="light" />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}