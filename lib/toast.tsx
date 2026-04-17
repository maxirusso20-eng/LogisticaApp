// lib/toast.tsx
// Toast deslizable con react-native-reanimated + react-native-gesture-handler
// API pública sin cambios: toast.success() | toast.error() | toast.warning() | toast.info()

import React, {
  createContext,
  useCallback,
  useContext,
  useState
} from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ToastContextValue {
  success: (msg: string) => void;
  error: (msg: string) => void;
  warning: (msg: string) => void;
  info: (msg: string) => void;
}

// ─── Paleta por tipo ──────────────────────────────────────────────────────────

const PALETTE: Record<ToastType, { bg: string; border: string; icon: string; emoji: string }> = {
  success: { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.35)', icon: '#10B981', emoji: '✓' },
  error: { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)', icon: '#EF4444', emoji: '✕' },
  warning: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)', icon: '#F59E0B', emoji: '!' },
  info: { bg: 'rgba(79,142,247,0.12)', border: 'rgba(79,142,247,0.35)', icon: '#4F8EF7', emoji: 'i' },
};

// ─── Toast individual ─────────────────────────────────────────────────────────

const DISMISS_THRESHOLD = -60; // px hacia arriba para descartar
const AUTO_DISMISS_MS = 3200;

const ToastCard: React.FC<{
  item: ToastItem;
  onDismiss: (id: number) => void;
}> = ({ item, onDismiss }) => {
  const insets = useSafeAreaInsets();
  const pal = PALETTE[item.type];

  // Animación de entrada: translateY de -80 → 0, opacidad 0 → 1
  const translateY = useSharedValue(-80);
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.92);

  // Valor para el swipe
  const swipeY = useSharedValue(0);

  const dismiss = useCallback(() => {
    // Salida elástica hacia arriba
    translateY.value = withTiming(-120, { duration: 280, easing: Easing.in(Easing.quad) });
    opacity.value = withTiming(0, { duration: 240 }, () => runOnJS(onDismiss)(item.id));
  }, [item.id, onDismiss]);

  // Auto-dismiss
  React.useEffect(() => {
    // Entrada
    translateY.value = withSpring(0, { damping: 15, stiffness: 180 });
    opacity.value = withTiming(1, { duration: 220 });
    scale.value = withSpring(1, { damping: 14, stiffness: 200 });

    const timer = setTimeout(dismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, []);

  // Gesto de deslizar hacia arriba
  const pan = Gesture.Pan()
    .onUpdate((e) => {
      // Solo permitir movimiento hacia arriba (valores negativos)
      swipeY.value = Math.min(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY < DISMISS_THRESHOLD) {
        // Umbral superado → descartar
        translateY.value = withTiming(-140, { duration: 220 });
        opacity.value = withTiming(0, { duration: 200 }, () => runOnJS(onDismiss)(item.id));
      } else {
        // Volver a posición original con rebote
        swipeY.value = withSpring(0, { damping: 12, stiffness: 200 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value + swipeY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.card,
          {
            backgroundColor: pal.bg,
            borderColor: pal.border,
            marginTop: insets.top + 12,
          },
          animatedStyle,
        ]}
      >
        {/* Ícono circular */}
        <View style={[styles.iconCircle, { backgroundColor: pal.icon + '22', borderColor: pal.icon + '44' }]}>
          <Text style={[styles.iconText, { color: pal.icon }]}>{pal.emoji}</Text>
        </View>

        {/* Mensaje */}
        <Text style={[styles.message, { color: '#FFFFFF' }]} numberOfLines={3}>
          {item.message}
        </Text>

        {/* Barra de progreso */}
        <SwipeHint color={pal.icon} durationMs={AUTO_DISMISS_MS} />
      </Animated.View>
    </GestureDetector>
  );
};

// ─── Barra de progreso de auto-dismiss ────────────────────────────────────────

const SwipeHint: React.FC<{ color: string; durationMs: number }> = ({ color, durationMs }) => {
  const width = useSharedValue(100);

  React.useEffect(() => {
    width.value = withTiming(0, { duration: durationMs, easing: Easing.linear });
  }, []);

  const barStyle = useAnimatedStyle(() => ({
    width: `${width.value}%` as any,
  }));

  return (
    <View style={styles.progressTrack}>
      <Animated.View style={[styles.progressBar, { backgroundColor: color }, barStyle]} />
    </View>
  );
};

// ─── Contexto ─────────────────────────────────────────────────────────────────

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback((type: ToastType, message: string) => {
    const id = nextId++;
    setToasts(prev => [...prev.slice(-2), { id, type, message }]); // máx 3 simultáneos
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const ctx: ToastContextValue = {
    success: (msg) => show('success', msg),
    error: (msg) => show('error', msg),
    warning: (msg) => show('warning', msg),
    info: (msg) => show('info', msg),
  };

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      {/* Overlay de toasts — siempre por encima */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <View style={styles.container} pointerEvents="box-none">
          {toasts.map(t => (
            <ToastCard key={t.id} item={t} onDismiss={dismiss} />
          ))}
        </View>
      </View>
    </ToastContext.Provider>
  );
};

// ─── Hook público ─────────────────────────────────────────────────────────────

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>');
  return ctx;
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    pointerEvents: 'box-none',
  } as any,
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 18,
    borderWidth: 1,
    width: '88%',
    maxWidth: 400,
    // Sombra premium
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
    overflow: 'hidden',
    // Backdrop blur visual (solo decorativo; blur real requiere expo-blur)
    backgroundColor: 'rgba(10,14,26,0.88)',
  },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  iconText: {
    fontSize: 14,
    fontWeight: '900',
  },
  message: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 1,
  },
  progressBar: {
    height: '100%',
    borderRadius: 1,
  },
});