// lib/ThemeContext.tsx
//
// Sistema de tema claro/oscuro para toda la app.
//
// USO:
//   1. Envolver la app en <ThemeProvider> (dentro de RootLayout)
//   2. En cualquier componente: const { colors, isDark, toggleTheme } = useTheme();
//   3. Usar colors.bg, colors.textPrimary, etc. en lugar de strings hardcodeados.
//
// El tema persiste en AsyncStorage entre sesiones.

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';

// ─── Paleta ───────────────────────────────────────────────────────────────────

export interface AppColors {
  // Fondos
  bg: string;
  bgCard: string;
  bgInput: string;
  bgHeader: string;
  bgDrawer: string;
  bgModal: string;

  // Bordes
  border: string;
  borderSubtle: string;

  // Textos
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textPlaceholder: string;

  // Acento principal
  blue: string;
  blueSubtle: string;

  // Semánticos
  green: string;
  amber: string;
  red: string;
  purple: string;

  // Overlay (para modales, máscaras)
  overlay: string;
}

const DARK: AppColors = {
  bg: '#060B18',
  bgCard: '#0D1526',
  bgInput: '#111D35',
  bgHeader: '#060B18',
  bgDrawer: '#060B18',
  bgModal: '#0A1120',

  border: '#1A2540',
  borderSubtle: '#0D1A2E',

  textPrimary: '#FFFFFF',
  textSecondary: '#C7D5E8',
  textMuted: '#4A6FA5',
  textPlaceholder: '#1A3050',

  blue: '#4F8EF7',
  blueSubtle: 'rgba(79,142,247,0.12)',

  green: '#34D399',
  amber: '#F59E0B',
  red: '#EF4444',
  purple: '#A78BFA',

  overlay: 'rgba(0,0,0,0.7)',
};

const LIGHT: AppColors = {
  bg: '#F0F4FB',
  bgCard: '#FFFFFF',
  bgInput: '#EAF0FA',
  bgHeader: '#FFFFFF',
  bgDrawer: '#FFFFFF',
  bgModal: '#F8FAFF',

  border: '#D4DFF0',
  borderSubtle: '#E2EBF8',

  textPrimary: '#0D1526',
  textSecondary: '#1E3A5F',
  textMuted: '#5A7FA8',
  textPlaceholder: '#9BB3CE',

  blue: '#2563EB',
  blueSubtle: 'rgba(37,99,235,0.10)',

  green: '#10B981',
  amber: '#D97706',
  red: '#DC2626',
  purple: '#7C3AED',

  overlay: 'rgba(0,0,0,0.45)',
};

// ─── Context ──────────────────────────────────────────────────────────────────

interface ThemeContextValue {
  isDark: boolean;
  colors: AppColors;
  toggleTheme: () => void;
  setTheme: (dark: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  isDark: true,
  colors: DARK,
  toggleTheme: () => {},
  setTheme: () => {},
});

const STORAGE_KEY = 'app_theme_isDark';

// ─── Provider ─────────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme(); // 'dark' | 'light' | null
  const [isDark, setIsDark] = useState<boolean>(systemScheme !== 'light');
  const [hydrated, setHydrated] = useState(false);

  // Leer preferencia guardada al iniciar
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val !== null) {
        setIsDark(val === 'true');
      } else {
        // Sin preferencia guardada → seguir el sistema
        setIsDark(systemScheme !== 'light');
      }
      setHydrated(true);
    }).catch(() => setHydrated(true));
  }, []);

  const setTheme = useCallback((dark: boolean) => {
    setIsDark(dark);
    AsyncStorage.setItem(STORAGE_KEY, dark ? 'true' : 'false').catch(() => {});
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(!isDark);
  }, [isDark, setTheme]);

  // No renderizar hasta hidratar para evitar flash
  if (!hydrated) return null;

  return (
    <ThemeContext.Provider value={{ isDark, colors: isDark ? DARK : LIGHT, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

// Re-export paletas para uso en StyleSheet estático (si fuera necesario)
export { DARK as DARK_COLORS, LIGHT as LIGHT_COLORS };