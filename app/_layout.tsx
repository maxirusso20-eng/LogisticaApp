// app/_layout.tsx
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from '@expo-google-fonts/inter';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TextInput, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';
import { ADMIN_EMAIL } from '../lib/constants';
import { supabase } from '../lib/supabase';
import { ThemeProvider, useTheme } from '../lib/ThemeContext';
import { ToastProvider } from '../lib/toast';

// ─── Parche Global de Tipografía ──────────────────────────────────────────────
interface ComponentWithDefaultProps extends React.FC<any> {
  defaultProps?: { style?: any; allowFontScaling?: boolean };
}

(Text as unknown as ComponentWithDefaultProps).defaultProps = (Text as unknown as ComponentWithDefaultProps).defaultProps || {};
(Text as unknown as ComponentWithDefaultProps).defaultProps!.style = { fontFamily: 'Inter_400Regular' };

(TextInput as unknown as ComponentWithDefaultProps).defaultProps = (TextInput as unknown as ComponentWithDefaultProps).defaultProps || {};
(TextInput as unknown as ComponentWithDefaultProps).defaultProps!.style = { fontFamily: 'Inter_400Regular' };
// ──────────────────────────────────────────────────────────────────────────────

export const unstable_settings = {
  initialRouteName: '(drawer)',
};

// ─── Paleta ───────────────────────────────────────────────────────────────────

const C = {
  bg: '#060B18',
  blue: '#4F8EF7',
  blueGlow: 'rgba(79,142,247,0.18)',
  blueBorder: 'rgba(79,142,247,0.30)',
  blueSubtle: 'rgba(79,142,247,0.08)',
  green: '#34D399',
  white: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.28)',
  tagline: 'rgba(79,142,247,0.60)',
};

// ─── Sub-componente: Anillo de radar ──────────────────────────────────────────

function RadarRing({ delay, maxSize }: { delay: number; maxSize: number }) {
  const scale = useRef(new Animated.Value(0.15)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 2400,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.5, duration: 300, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 0, duration: 2100, useNativeDriver: true }),
          ]),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 0.15, duration: 0, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <Animated.View
      style={[
        splash.ring,
        {
          width: maxSize,
          height: maxSize,
          borderRadius: maxSize / 2,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

// ─── Sub-componente: Punto de carga ──────────────────────────────────────────

function LoadingDot({ delay }: { delay: number }) {
  const op = useRef(new Animated.Value(0.2)).current;
  const scale = useRef(new Animated.Value(0.8)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(op, { toValue: 1, duration: 360, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 1.3, duration: 360, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(op, { toValue: 0.2, duration: 360, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0.8, duration: 360, useNativeDriver: true }),
        ]),
        Animated.delay(540),
      ])
    ).start();
  }, []);

  return (
    <Animated.View style={[splash.dot, { opacity: op, transform: [{ scale }] }]} />
  );
}

// ─── Sub-componente: Partícula de fondo ──────────────────────────────────────

function Particle({ x, y, size, duration, delay }: {
  x: number; y: number; size: number; duration: number; delay: number;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, { toValue: 0.45, duration: duration * 0.3, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -20, duration: duration, easing: Easing.linear, useNativeDriver: true }),
        ]),
        Animated.timing(opacity, { toValue: 0, duration: duration * 0.2, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: C.blue,
        opacity,
        transform: [{ translateY }],
      }}
    />
  );
}

// Posiciones fijas — sin Math.random para evitar diferencias entre renders
const PARTICLES = [
  { x: 22, y: 55, size: 2.5, duration: 3200, delay: 0 },
  { x: 78, y: 115, size: 1.5, duration: 4100, delay: 600 },
  { x: 265, y: 40, size: 2, duration: 3700, delay: 1200 },
  { x: 318, y: 145, size: 1.5, duration: 4600, delay: 300 },
  { x: 45, y: 255, size: 2, duration: 3400, delay: 900 },
  { x: 295, y: 275, size: 2.5, duration: 5000, delay: 1500 },
  { x: 158, y: 18, size: 1.5, duration: 4200, delay: 450 },
  { x: 172, y: 345, size: 2, duration: 3900, delay: 1800 },
  { x: 345, y: 215, size: 1.5, duration: 4400, delay: 750 },
  { x: 8, y: 308, size: 2, duration: 3600, delay: 1100 },
  { x: 130, y: 290, size: 1.5, duration: 4800, delay: 2000 },
  { x: 240, y: 320, size: 2, duration: 3300, delay: 200 },
];

// ─── SplashLoader ─────────────────────────────────────────────────────────────

function SplashLoader({ message = 'Verificando sesión...' }: { message?: string }) {

  // Vibración de motor (micro-jitter en X, JS driver porque es muy sutil)
  const vibrateX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(vibrateX, { toValue: 1.2, duration: 60, useNativeDriver: true }),
        Animated.timing(vibrateX, { toValue: -1.2, duration: 60, useNativeDriver: true }),
        Animated.timing(vibrateX, { toValue: 0.8, duration: 55, useNativeDriver: true }),
        Animated.timing(vibrateX, { toValue: -0.8, duration: 55, useNativeDriver: true }),
        Animated.timing(vibrateX, { toValue: 0, duration: 50, useNativeDriver: true }),
        Animated.delay(1300),
      ])
    ).start();
  }, []);

  // Flotación suave
  const floatY = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatY, { toValue: -5, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(floatY, { toValue: 0, duration: 1900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Halo pulsante detrás del ícono
  const glowOp = useRef(new Animated.Value(0.35)).current;
  const glowSc = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(glowOp, { toValue: 0.85, duration: 1500, useNativeDriver: true }),
          Animated.timing(glowSc, { toValue: 1.15, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(glowOp, { toValue: 0.35, duration: 1500, useNativeDriver: true }),
          Animated.timing(glowSc, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]),
      ])
    ).start();
  }, []);

  // ── Letter-spacing animado (requiere useNativeDriver: false) ──────────────
  // El texto "se abre" de comprimido a normal mientras hace fade-in
  const brandOp = useRef(new Animated.Value(0)).current;
  const brandLS = useRef(new Animated.Value(-3)).current;  // de apretado → normal
  const tagOp = useRef(new Animated.Value(0)).current;
  const statusOp = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(250),
      Animated.stagger(200, [
        Animated.parallel([
          Animated.timing(brandOp, { toValue: 1, duration: 700, useNativeDriver: false }),
          Animated.timing(brandLS, { toValue: 1.2, duration: 950, easing: Easing.out(Easing.quad), useNativeDriver: false }),
        ]),
        Animated.timing(tagOp, { toValue: 1, duration: 500, useNativeDriver: false }),
        Animated.timing(statusOp, { toValue: 1, duration: 400, useNativeDriver: false }),
      ]),
    ]).start();
  }, []);

  // Status dot blink
  const statusDotOp = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(statusDotOp, { toValue: 0.12, duration: 800, useNativeDriver: true }),
        Animated.timing(statusDotOp, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  return (
    <View style={splash.container}>

      {/* Partículas de fondo */}
      {PARTICLES.map((p, i) => <Particle key={i} {...p} />)}

      {/* Zona central */}
      <View style={splash.centerZone}>

        {/* Radar + ícono */}
        <View style={splash.radarWrap}>
          <RadarRing delay={0} maxSize={190} />
          <RadarRing delay={800} maxSize={190} />
          <RadarRing delay={1600} maxSize={190} />

          {/* Halo de brillo */}
          <Animated.View
            style={[
              splash.iconGlow,
              { opacity: glowOp, transform: [{ scale: glowSc }] },
            ]}
          />

          {/* Camión con vibración + flotación */}
          <Animated.View
            style={[
              splash.iconCircle,
              { transform: [{ translateX: vibrateX }, { translateY: floatY }] },
            ]}
          >
            <Ionicons name="bus" size={38} color={C.blue} />
          </Animated.View>
        </View>

        {/* Marca con letter-spacing animado */}
        <Animated.Text
          style={[
            splash.brand,
            { opacity: brandOp, letterSpacing: brandLS as any },
          ]}
        >
          Logística Hogareño
        </Animated.Text>

        {/* Línea separadora */}
        <Animated.View style={[splash.lineAccent, { opacity: tagOp }]} />

        {/* Tagline */}
        <Animated.Text style={[splash.taglineText, { opacity: tagOp }]}>
          PANEL DE CONTROL
        </Animated.Text>

      </View>

      {/* Zona inferior */}
      <View style={splash.bottomZone}>
        <View style={splash.dotRow}>
          <LoadingDot delay={0} />
          <LoadingDot delay={220} />
          <LoadingDot delay={440} />
        </View>

        <Animated.View style={[splash.statusRow, { opacity: statusOp }]}>
          <Animated.View style={[splash.statusDot, { opacity: statusDotOp }]} />
          <Text style={splash.statusText}>{message}</Text>
        </Animated.View>
      </View>

    </View>
  );
}

const splash = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerZone: {
    alignItems: 'center',
  },
  // Radar
  radarWrap: {
    width: 190,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 40,
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: C.blue,
  },
  // Halo
  iconGlow: {
    position: 'absolute',
    width: 108,
    height: 108,
    borderRadius: 54,
    backgroundColor: C.blueGlow,
  },
  // Ícono
  iconCircle: {
    width: 82,
    height: 82,
    borderRadius: 24,
    backgroundColor: C.blueSubtle,
    borderWidth: 1.5,
    borderColor: C.blueBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Texto
  brand: {
    fontSize: 23,
    fontWeight: '700',
    color: C.white,
  },
  lineAccent: {
    width: 38,
    height: 2,
    borderRadius: 1,
    backgroundColor: C.blueBorder,
    marginVertical: 12,
  },
  taglineText: {
    fontSize: 10,
    fontWeight: '600',
    color: C.tagline,
    letterSpacing: 3.2,
  },
  // Zona inferior
  bottomZone: {
    position: 'absolute',
    bottom: 64,
    alignItems: 'center',
    gap: 16,
  },
  dotRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.blue,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.green,
  },
  statusText: {
    fontSize: 11,
    color: C.textMuted,
    letterSpacing: 0.4,
  },
});

// ─── Inner layout ─────────────────────────────────────────────────────────────

function InnerLayout() {
  const { isDark } = useTheme();
  const [isLoading, setIsLoading] = useState(true);
  const [splashMsg, setSplashMsg] = useState('Verificando sesión...');
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        // Primera carga: tenemos la respuesta inicial de Supabase
        setHasSession(!!session);
        if (!session) {
          // Sin sesión → ir al login directamente, sin splash innecesario
          setIsLoading(false);
        }
        // Con sesión → handleRouting se encargará de enrutar y poner isLoading=false
      } else if (event === 'SIGNED_IN') {
        // El usuario acaba de hacer login → activar splash mientras enrutamos
        setHasSession(true);
        setSplashMsg('Iniciando sesión...');
        setIsLoading(true);
      } else if (event === 'SIGNED_OUT') {
        setHasSession(false);
        setSplashMsg('Verificando sesión...');
        setIsLoading(false);
      } else if (event === 'TOKEN_REFRESHED') {
        setHasSession(!!session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleRouting = useCallback(async () => {
    if (hasSession === null) return;

    const inAuthGroup = segments[0] === 'login';

    if (!hasSession && !inAuthGroup) {
      router.replace('/login' as never);
    } else if (hasSession) {
      const { data: { user } } = await supabase.auth.getUser();
      const isAdmin = user?.email === ADMIN_EMAIL;

      if (inAuthGroup) {
        // Recién hizo login → redirigir al destino correcto según rol
        router.replace(isAdmin ? '/(drawer)' : '/(drawer)/Panel' as never);
      } else if (!isAdmin) {
        // Chofer aterrizando en la raíz del drawer → mandarlo a su panel
        const isIndex = segments.length === 1 && segments[0] === '(drawer)';
        if (isIndex) {
          router.replace('/(drawer)/Panel' as never);
        }
      }
    }

    // Delay mínimo para que el splash no desaparezca en <350ms
    // (evita el flash raro si la red es muy rápida)
    await new Promise<void>(res => setTimeout(res, 350));
    setIsLoading(false);
    setSplashMsg('Verificando sesión...');
  }, [hasSession, segments]);

  useEffect(() => {
    handleRouting();
  }, [handleRouting]);

  if (isLoading) return <SplashLoader message={splashMsg} />;

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
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <ToastProvider>
          <BottomSheetModalProvider>
            <InnerLayout />
          </BottomSheetModalProvider>
        </ToastProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}