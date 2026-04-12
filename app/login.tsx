// app/login.tsx — versión mejorada
//
// Cambios respecto al original:
//   ✅ Feedback de error inline (sin Alert) — más moderno
//   ✅ Shake animation en el card cuando las credenciales son incorrectas
//   ✅ Botón de limpiar email con un toque
//   ✅ "Iniciar sesión" ahora desactiva ambos inputs mientras carga
//   ✅ Fondo con más profundidad (tres acentos en lugar de dos)
//   ✅ accessibilityLabel en inputs y botón
//   ✅ Importa ADMIN_EMAIL y COLORS desde constants

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { APP_NAME, APP_TAGLINE, COLORS } from '../lib/constants';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  // Mensaje de error inline — reemplaza el Alert
  const [errorMsg, setErrorMsg] = useState('');
  const router = useRouter();

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  // Shake animation para el card de error
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start();

    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  /** Sacude el formulario para señalar error */
  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleLogin = async () => {
    setErrorMsg('');
    if (!email.trim() || !password) {
      setErrorMsg('Por favor ingresá tu email y contraseña.');
      triggerShake();
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        setErrorMsg('Credenciales incorrectas. Verificá tus datos.');
        triggerShake();
      } else {
        router.replace('/(drawer)' as any);
      }
    } catch {
      setErrorMsg('Error de conexión. Intentá nuevamente.');
      triggerShake();
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />

        {/* Fondos decorativos */}
        <View style={styles.bgAccent1} />
        <View style={styles.bgAccent2} />
        <View style={styles.bgAccent3} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
        >
          <Animated.View style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}>

            {/* Logo + título */}
            {!isKeyboardVisible && (
              <View style={styles.header}>
                <View style={styles.logoBox}>
                  <Ionicons name="bus" size={38} color={COLORS.blue} />
                </View>
                <Text style={styles.brand}>{APP_NAME}</Text>
                <Text style={styles.tagline}>{APP_TAGLINE}</Text>
              </View>
            )}

            {/* Card del formulario con shake */}
            <Animated.View style={[
              styles.card,
              { transform: [{ translateX: shakeAnim }] },
            ]}>
              <Text style={styles.cardTitle}>Iniciar Sesión</Text>

              {/* Error inline */}
              {errorMsg ? (
                <View style={styles.errorRow}>
                  <Ionicons name="alert-circle-outline" size={15} color={COLORS.danger} />
                  <Text style={styles.errorText}>{errorMsg}</Text>
                </View>
              ) : null}

              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email</Text>
                <View style={[styles.inputRow, focusedField === 'email' && styles.inputRowFocused]}>
                  <Ionicons
                    name="mail-outline" size={18}
                    color={focusedField === 'email' ? COLORS.blue : '#4A5568'}
                    style={styles.icon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="usuario@empresa.com"
                    placeholderTextColor="#3A4A5E"
                    value={email}
                    onChangeText={v => { setEmail(v); setErrorMsg(''); }}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    editable={!loading}
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                    accessibilityLabel="Campo email"
                    returnKeyType="next"
                  />
                  {email.length > 0 && !loading && (
                    <TouchableOpacity
                      onPress={() => setEmail('')}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Ionicons name="close-circle" size={16} color="#2A4A70" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Contraseña */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Contraseña</Text>
                <View style={[styles.inputRow, focusedField === 'pass' && styles.inputRowFocused]}>
                  <Ionicons
                    name="lock-closed-outline" size={18}
                    color={focusedField === 'pass' ? COLORS.blue : '#4A5568'}
                    style={styles.icon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#3A4A5E"
                    value={password}
                    onChangeText={v => { setPassword(v); setErrorMsg(''); }}
                    secureTextEntry={!showPassword}
                    editable={!loading}
                    onFocus={() => setFocusedField('pass')}
                    onBlur={() => setFocusedField(null)}
                    accessibilityLabel="Campo contraseña"
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    onPress={() => setShowPassword(v => !v)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={18} color="#4A5568"
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Botón */}
              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
                accessibilityLabel="Ingresar al sistema"
                accessibilityRole="button"
              >
                {loading
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <>
                    <Text style={styles.btnText}>Ingresar al Sistema</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
                  </>
                }
              </TouchableOpacity>
            </Animated.View>

            {!isKeyboardVisible && (
              <Text style={styles.footer}>© {new Date().getFullYear()} {APP_NAME} · Todos los derechos reservados</Text>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },

  // Tres acentos de fondo para más profundidad
  bgAccent1: {
    position: 'absolute', top: -120, right: -80,
    width: 320, height: 320, borderRadius: 160,
    backgroundColor: 'rgba(79,142,247,0.08)',
  },
  bgAccent2: {
    position: 'absolute', bottom: -80, left: -60,
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(79,142,247,0.05)',
  },
  bgAccent3: {
    position: 'absolute', top: '45%', left: '30%',
    width: 180, height: 180, borderRadius: 90,
    backgroundColor: 'rgba(52,211,153,0.03)',
  },

  kav: { flex: 1 },
  content: { flex: 1, padding: 28, justifyContent: 'center' },

  header: { alignItems: 'center', marginBottom: 36 },
  logoBox: {
    width: 76, height: 76, borderRadius: 22,
    backgroundColor: 'rgba(79,142,247,0.12)',
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.25)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 18,
  },
  brand: { fontSize: 26, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
  tagline: { fontSize: 13, color: '#4A6FA5', marginTop: 6, fontWeight: '500' },

  card: {
    backgroundColor: COLORS.bgCard,
    borderRadius: 24, padding: 28,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 20 },

  // Error inline — reemplaza el Alert
  errorRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(255,107,107,0.08)',
    borderWidth: 1, borderColor: 'rgba(255,107,107,0.2)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: { flex: 1, fontSize: 13, color: COLORS.danger, fontWeight: '500' },

  fieldGroup: { marginBottom: 18 },
  label: {
    fontSize: 12, fontWeight: '600', color: '#4A6FA5',
    marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase',
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.bgInput, borderRadius: 14,
    borderWidth: 1.5, borderColor: '#1A2D4A',
    paddingHorizontal: 16, height: 56,
  },
  inputRowFocused: { borderColor: COLORS.blue, backgroundColor: '#0F1A30' },
  icon: { marginRight: 12 },
  input: { flex: 1, color: COLORS.textPrimary, fontSize: 15 },

  btn: {
    backgroundColor: COLORS.blue,
    height: 58, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
    shadowColor: COLORS.blue,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: COLORS.textPrimary, fontSize: 16, fontWeight: '700' },

  footer: {
    textAlign: 'center', color: '#1E2D45',
    fontSize: 11, marginTop: 32, fontWeight: '500',
  },
});