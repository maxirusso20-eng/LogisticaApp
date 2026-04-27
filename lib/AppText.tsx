// lib/AppText.tsx
//
// Wrapper de <Text> y <TextInput> que aplica la fuente global (Inter)
// y respeta los overrides de estilo del componente hijo.
//
// Reemplaza al patch global `Text.defaultProps = ...` que es deprecated
// en React Native 0.75+ y tira warnings en cada render.
//
// USO — reemplazar en los archivos de la app:
//   import { Text } from 'react-native';    →    import { Text } from '../lib/AppText';
//
// La API es idéntica a Text de RN, solo que:
//   - Aplica { fontFamily: 'Inter_400Regular' } por default
//   - Si el componente hijo pasa un fontFamily explícito, ese gana
//   - Si se pasa `allowFontScaling={false}`, lo respeta (útil para accesibilidad)

import React from 'react';
import {
    Text as RNText,
    TextInput as RNTextInput,
    TextInputProps as RNTextInputProps,
    TextProps as RNTextProps,
    TextStyle,
} from 'react-native';

const DEFAULT_FONT_STYLE: TextStyle = { fontFamily: 'Inter_400Regular' };

export const Text: React.FC<RNTextProps> = ({ style, ...rest }) => (
    <RNText style={[DEFAULT_FONT_STYLE, style]} {...rest} />
);

export const TextInput: React.FC<RNTextInputProps> = ({ style, ...rest }) => (
    <RNTextInput style={[DEFAULT_FONT_STYLE, style]} {...rest} />
);

// Default export para silenciar warnings de Expo Router si este archivo
// llegase a ser detectado como ruta (no debería, está en lib/).
export default Text;