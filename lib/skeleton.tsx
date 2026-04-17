// lib/skeleton.tsx
// Componentes Skeleton Loader reutilizables con efecto shimmer.
// Sin dependencias externas — solo Animated de React Native.

import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from './ThemeContext';

// ─── Bloque shimmer base ──────────────────────────────────────────────────────

interface SkeletonBoxProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export function SkeletonBox({ width = '100%', height = 14, borderRadius = 8, style }: SkeletonBoxProps) {
  const { isDark } = useTheme();
  const opacity = useRef(new Animated.Value(0.35)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.35, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const baseColor = isDark ? '#1A2540' : '#D4DFF0';

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: baseColor, opacity },
        style,
      ]}
    />
  );
}

// ─── Skeleton para Panel (FilaRecorrido) ──────────────────────────────────────

export function SkeletonFilaRecorrido() {
  const { colors } = useTheme();
  return (
    <View style={[SK.filaCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={SK.accent} />
      <View style={SK.filaBody}>
        {/* Header */}
        <View style={SK.row}>
          <SkeletonBox width="55%" height={16} borderRadius={8} />
          <SkeletonBox width={60} height={22} borderRadius={11} />
        </View>
        <SkeletonBox width="35%" height={11} borderRadius={6} style={{ marginTop: 8 }} />
        {/* Progress bars */}
        <SkeletonBox width="100%" height={6} borderRadius={3} style={{ marginTop: 16 }} />
        <SkeletonBox width="100%" height={6} borderRadius={3} style={{ marginTop: 8 }} />
        {/* Contadores */}
        <View style={[SK.contadoresWrap, { borderColor: colors.borderSubtle }]}>
          <View style={SK.contador}>
            <SkeletonBox width={40} height={11} borderRadius={6} />
            <SkeletonBox width={32} height={32} borderRadius={10} style={{ marginTop: 8 }} />
            <View style={SK.botonesRow}>
              <SkeletonBox width={42} height={42} borderRadius={12} />
              <SkeletonBox width={42} height={42} borderRadius={12} />
            </View>
          </View>
          <View style={SK.divisor} />
          <View style={SK.contador}>
            <SkeletonBox width={40} height={11} borderRadius={6} />
            <SkeletonBox width={32} height={32} borderRadius={10} style={{ marginTop: 8 }} />
            <View style={SK.botonesRow}>
              <SkeletonBox width={42} height={42} borderRadius={12} />
              <SkeletonBox width={42} height={42} borderRadius={12} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

// ─── Skeleton para Colectas (ColectaCard) ─────────────────────────────────────

export function SkeletonColectaCard() {
  const { colors } = useTheme();
  return (
    <View style={[SK.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={[SK.accent, { backgroundColor: colors.borderSubtle }]} />
      <View style={SK.filaBody}>
        <View style={SK.row}>
          <View style={{ flex: 1, gap: 8 }}>
            <SkeletonBox width="60%" height={15} borderRadius={8} />
            <SkeletonBox width="30%" height={11} borderRadius={6} />
          </View>
          <SkeletonBox width={30} height={30} borderRadius={15} />
        </View>
        <SkeletonBox width="80%" height={12} borderRadius={6} style={{ marginTop: 12 }} />
        <SkeletonBox width="45%" height={11} borderRadius={6} style={{ marginTop: 7 }} />
      </View>
    </View>
  );
}

// ─── Skeleton para Personal (ChoferCard) ──────────────────────────────────────

export function SkeletonChoferCard() {
  const { colors } = useTheme();
  return (
    <View style={[SK.choferCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
      <View style={SK.choferHead}>
        <SkeletonBox width={48} height={48} borderRadius={24} />
        <View style={{ flex: 1, gap: 8 }}>
          <SkeletonBox width="55%" height={15} borderRadius={8} />
          <SkeletonBox width="35%" height={11} borderRadius={6} />
        </View>
        <SkeletonBox width={60} height={22} borderRadius={11} />
      </View>
      <View style={{ gap: 8, marginTop: 12 }}>
        <SkeletonBox width="75%" height={11} borderRadius={6} />
        <SkeletonBox width="50%" height={11} borderRadius={6} />
      </View>
    </View>
  );
}

// ─── Estilos ─────────────────────────────────────────────────────────────────

const SK = StyleSheet.create({
  filaCard: {
    flexDirection: 'row',
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row',
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  choferCard: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
  },
  choferHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  accent: {
    width: 4,
    backgroundColor: '#1A2540',
  },
  filaBody: {
    flex: 1,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  contadoresWrap: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    marginTop: 12,
  },
  contador: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 6,
    gap: 4,
  },
  divisor: {
    width: 1,
    backgroundColor: '#1A2540',
  },
  botonesRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
});
