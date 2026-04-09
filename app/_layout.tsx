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
  // FIX: usar estado real en lugar de ref para que el useEffect de routing
  // se dispare correctamente cuando cambia la sesión (onAuthStateChange).
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const segments = useSegments();
  const router = useRouter();
  const isMounted = useRef(false);

  useEffect(() => {
    isMounted.current = true;

    // Escuchar cambios de auth en tiempo real (logout, token expirado, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isMounted.current) {
        setHasSession(!!session);
      }
    });

    // Verificar sesión inicial al arrancar
    supabase.auth.getSession().then(({ data: { session } }) => {
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

  // Redirigir cada vez que cambia la ruta, la sesión o termina de cargar
  useEffect(() => {
    const checkRedirect = async () => {
      if (isLoading || hasSession === null) return;

      const inAuthGroup = segments[0] === 'login';

      if (!hasSession && !inAuthGroup) {
        router.replace('/login' as any);
      } else if (hasSession && inAuthGroup) {
        // Obtenemos el usuario actual para ver el email
        const { data: { user } } = await supabase.auth.getUser();
        const userEmail = user?.email;

        if (userEmail === 'maxirusso20@gmail.com') {
          // El admin (vos) va a Recorridos
          router.replace('/(drawer)' as any);
        } else {
          // Cualquier otro usuario (chofer) va a Colectas
          router.replace('/(drawer)/colectas' as any);
        }
      }
    };

    checkRedirect();
  }, [isLoading, hasSession, segments]);

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
