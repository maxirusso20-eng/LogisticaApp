// app/_layout.tsx
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { ThemeProvider, useTheme } from '../lib/ThemeContext';
import { supabase } from '../lib/supabase';
import { ADMIN_EMAIL } from '../lib/constants';

export const unstable_settings = {
  initialRouteName: '(drawer)',
};

// ─── Splash ───────────────────────────────────────────────────────────────────

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
    flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060B18',
  },
  logoRing: {
    width: 80, height: 80, borderRadius: 24,
    borderWidth: 2, borderColor: '#4F8EF7',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  logoDot: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#4F8EF7' },
  brand: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', letterSpacing: 0.5 },
});

// ─── Inner layout (necesita acceso al tema para StatusBar) ────────────────────

function InnerLayout() {
  const { isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
      if (!session) setIsLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(!!session);
    });
    
    return () => subscription.unsubscribe();
  }, []);

  const handleRouting = useCallback(async () => {
    if (hasSession === null) return;
    
    const inAuthGroup = segments[0] === 'login';

    if (!hasSession && !inAuthGroup) {
      // If no session and not in login, redirect to login
      router.replace('/login' as never);
    } else if (hasSession) {
      // Wait to verify user role
      const { data: { user } } = await supabase.auth.getUser();
      const isAdmin = user?.email === ADMIN_EMAIL;

      if (inAuthGroup) {
        // Just logged in, route to default home for their role
        router.replace(isAdmin ? '/(drawer)' : '/(drawer)/Panel' as never);
      } else if (!isAdmin) {
        // If driver (not admin), ensure they are not on the admin default root screen
        const isIndex = segments.length === 1 && segments[0] === '(drawer)';
        if (isIndex) {
          router.replace('/(drawer)/Panel' as never);
        }
      }
    }
    
    // routing checks complete
    setIsLoading(false);
  }, [hasSession, segments]);

  useEffect(() => { 
    handleRouting(); 
  }, [handleRouting]);

  if (isLoading) return <SplashLoader />;

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(drawer)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </NavThemeProvider>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <InnerLayout />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}