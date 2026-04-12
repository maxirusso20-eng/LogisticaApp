// lib/constants.ts
//
// Constantes globales de la app.
// Importar desde acá en lugar de definirlas en cada archivo.
// Así un solo cambio aquí se propaga a toda la app.

// ─────────────────────────────────────────────
// ENTORNO — variables configurables por cliente
// En producción estas vienen de .env:
//   EXPO_PUBLIC_ADMIN_EMAIL=admin@empresa.com
//   EXPO_PUBLIC_APP_NAME=Mi Logística
//   EXPO_PUBLIC_APP_TAGLINE=Panel de Control · Área Logística
//   EXPO_PUBLIC_APP_VERSION=1.0.0
// ─────────────────────────────────────────────

export const ADMIN_EMAIL = process.env.EXPO_PUBLIC_ADMIN_EMAIL ?? 'maxirusso20@gmail.com';
export const APP_NAME = process.env.EXPO_PUBLIC_APP_NAME ?? 'Logística Hogareño';
export const APP_TAGLINE = process.env.EXPO_PUBLIC_APP_TAGLINE ?? 'Panel de Control · Área Logística';
export const APP_VERSION = process.env.EXPO_PUBLIC_APP_VERSION ?? '1.0.0';

// ─────────────────────────────────────────────
// PALETA DE COLORES
// Centralizar los colores más usados en la app.
// Usar estos valores en StyleSheet para que un
// cambio de branding sea un one-liner.
// ─────────────────────────────────────────────

export const COLORS = {
    // Fondos
    bg: '#060B18',
    bgCard: '#0D1526',
    bgCardDark: '#0A0F1E',
    bgInput: '#111D35',

    // Bordes
    border: '#1A2540',
    borderSubtle: '#0D1A2E',

    // Texto
    textPrimary: '#FFFFFF',
    textSecondary: '#4A6FA5',
    textMuted: '#2A4A70',
    textDimmed: '#1A3050',

    // Acentos
    blue: '#4F8EF7',
    green: '#34D399',
    amber: '#F59E0B',
    purple: '#A78BFA',

    // Semánticos
    success: '#34D399',
    warning: '#F59E0B',
    danger: '#FF6B6B',
    info: '#4F8EF7',
} as const;

// ─────────────────────────────────────────────
// ZONAS / VEHÍCULOS / CONDICIONES
// Mover acá evita duplicar estos arrays en
// personal.tsx y Panel.tsx
// ─────────────────────────────────────────────

export const ZONAS = ['ZONA OESTE', 'ZONA SUR', 'ZONA NORTE', 'CABA'] as const;
export const VEHICULOS = ['SUV', 'UTILITARIO', 'AUTO'] as const;
export const CONDICIONES = ['TITULAR', 'SUPLENTE', 'COLECTADOR'] as const;

// ─────────────────────────────────────────────
// ZONA COLORS
// Misma lógica de getZonaColor() que estaba
// duplicada en Panel.tsx — ahora centralizada.
// ─────────────────────────────────────────────

export const getZonaColor = (zona: string): string => {
    if (zona?.includes('OESTE')) return '#3b82f6';
    if (zona?.includes('SUR')) return '#10b981';
    if (zona?.includes('NORTE')) return '#f59e0b';
    if (zona?.includes('CABA')) return '#8b5cf6';
    return COLORS.blue;
};

// ─────────────────────────────────────────────
// CONDICIÓN CONFIG
// getCondicionCfg() estaba duplicada en
// personal.tsx y Panel.tsx
// ─────────────────────────────────────────────

export const getCondicionCfg = (condicion: string) => {
    const c = (condicion || '').toUpperCase();
    if (c === 'TITULAR') return { label: 'Titular', color: COLORS.blue, bg: 'rgba(79,142,247,0.12)' };
    if (c === 'COLECTADOR') return { label: 'Colectador', color: COLORS.amber, bg: 'rgba(245,158,11,0.12)' };
    return { label: 'Suplente', color: COLORS.green, bg: 'rgba(52,211,153,0.12)' };
};

// ─────────────────────────────────────────────
// SALUDO
// getSaludo() estaba duplicada en
// colectas.tsx y Panel.tsx
// ─────────────────────────────────────────────

export const getSaludo = (): string => {
    const hora = new Date().getHours();
    if (hora < 12) return 'Buenos días';
    if (hora < 19) return 'Buenas tardes';
    return 'Buenas noches';
};

// ─────────────────────────────────────────────
// AVATAR COLORS — para las cards de personal
// ─────────────────────────────────────────────

export const AVATAR_COLORS = [
    COLORS.blue,
    COLORS.green,
    COLORS.amber,
    COLORS.purple,
    '#F472B6',
    '#FB923C',
] as const;

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

/** Obtiene las iniciales de un nombre (máx. 2 letras) */
export const getIniciales = (nombre: string): string =>
    nombre.split(' ').map(p => p[0] || '').slice(0, 2).join('').toUpperCase();

/** Normaliza un campo que puede ser string o string[] a string[] */
export const getArr = (v: string | string[]): string[] =>
    Array.isArray(v) ? v : (v ? [v] : []);