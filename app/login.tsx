import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const router = useRouter();

  // Animaciones de entrada
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;

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

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Campos vacíos', 'Por favor ingresá email y contraseña.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) {
        Alert.alert('Acceso denegado', 'Credenciales incorrectas o problema de red.');
      } else {
        router.replace('/(drawer)' as any);
      }
    } catch {
      Alert.alert('Error', 'Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.root}>
        <StatusBar barStyle="light-content" />

        {/* Fondo decorativo */}
        <View style={styles.bgAccent1} />
        <View style={styles.bgAccent2} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.kav}
        >
          <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

            {/* Header */}
            {!isKeyboardVisible && (
              <View style={styles.header}>
                <View style={styles.logoBox}>
                  <Ionicons name="bus" size={38} color="#4F8EF7" />
                </View>
                <Text style={styles.brand}>Logística Hogareño</Text>
                <Text style={styles.tagline}>Panel de Control · Área Logística</Text>
              </View>
            )}

            {/* Card del formulario */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Iniciar Sesión</Text>

              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email</Text>
                <View style={[styles.inputRow, focusedField === 'email' && styles.inputRowFocused]}>
                  <Ionicons name="mail-outline" size={18} color={focusedField === 'email' ? '#4F8EF7' : '#4A5568'} style={styles.icon} />
                  <TextInput
                    style={styles.input}
                    placeholder="usuario@empresa.com"
                    placeholderTextColor="#3A4A5E"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              {/* Contraseña */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Contraseña</Text>
                <View style={[styles.inputRow, focusedField === 'pass' && styles.inputRowFocused]}>
                  <Ionicons name="lock-closed-outline" size={18} color={focusedField === 'pass' ? '#4F8EF7' : '#4A5568'} style={styles.icon} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor="#3A4A5E"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    onFocus={() => setFocusedField('pass')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color="#4A5568" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Botón */}
              <TouchableOpacity
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={handleLogin}
                disabled={loading}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color="#FFFFFF" />
                  : <>
                    <Text style={styles.btnText}>Ingresar al Sistema</Text>
                    <Ionicons name="arrow-forward" size={18} color="#FFFFFF" style={{ marginLeft: 8 }} />
                  </>
                }
              </TouchableOpacity>
            </View>

            {/* Footer */}
            {!isKeyboardVisible && (
              <Text style={styles.footer}>© 2026 Logística Hogareño · Todos los derechos reservados</Text>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#060B18' },
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
  kav: { flex: 1 },
  content: { flex: 1, padding: 28, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 36 },
  logoBox: {
    width: 76, height: 76, borderRadius: 22,
    backgroundColor: 'rgba(79,142,247,0.12)',
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.25)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 18,
  },
  brand: { fontSize: 26, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  tagline: { fontSize: 13, color: '#4A6FA5', marginTop: 6, fontWeight: '500' },
  card: {
    backgroundColor: '#0D1526',
    borderRadius: 24,
    padding: 28,
    borderWidth: 1,
    borderColor: '#1A2540',
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: '#FFFFFF', marginBottom: 24 },
  fieldGroup: { marginBottom: 18 },
  label: { fontSize: 12, fontWeight: '600', color: '#4A6FA5', marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  inputRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#111D35', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#1A2D4A',
    paddingHorizontal: 16, height: 56,
  },
  inputRowFocused: { borderColor: '#4F8EF7', backgroundColor: '#0F1A30' },
  icon: { marginRight: 12 },
  input: { flex: 1, color: '#FFFFFF', fontSize: 15 },
  btn: {
    backgroundColor: '#4F8EF7',
    height: 58, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#4F8EF7',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4, shadowRadius: 16, elevation: 8,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  footer: { textAlign: 'center', color: '#1E2D45', fontSize: 11, marginTop: 32, fontWeight: '500' },
});