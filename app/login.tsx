// app/login.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Easing,
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
import { useTheme } from '../lib/ThemeContext';
import { supabase } from '../lib/supabase';

const { width: SW, height: SH } = Dimensions.get('window');

// ─── Camión ───────────────────────────────────────────────────────────────────

function TruckShape({ size = 40, color = '#4F8EF7' }: { size?: number; color?: string }) {
  const s = size;
  return (
    <View style={{ width: s * 2.4, height: s }}>
      <View style={{ position: 'absolute', left: 0, top: s * 0.1, width: s * 1.5, height: s * 0.65, backgroundColor: color, borderRadius: s * 0.08 }} />
      <View style={{ position: 'absolute', left: s * 1.5, top: s * 0.25, width: s * 0.7, height: s * 0.5, backgroundColor: color, borderRadius: s * 0.1 }} />
      <View style={{ position: 'absolute', left: s * 1.78, top: s * 0.28, width: s * 0.26, height: s * 0.28, backgroundColor: 'rgba(6,11,24,0.55)', borderRadius: s * 0.05 }} />
      <View style={{ position: 'absolute', left: s * 0.3, top: s * 0.7, width: s * 0.32, height: s * 0.32, borderRadius: s * 0.16, backgroundColor: '#060B18', borderWidth: s * 0.06, borderColor: color }} />
      <View style={{ position: 'absolute', left: s * 1.65, top: s * 0.7, width: s * 0.28, height: s * 0.28, borderRadius: s * 0.14, backgroundColor: '#060B18', borderWidth: s * 0.05, borderColor: color }} />
    </View>
  );
}

// ─── Animaciones de fondo ─────────────────────────────────────────────────────

const LANES = [
  { y: SH * 0.07, size: 18, opacity: 0.06, duration: 18000, delay: 0, rtl: false },
  { y: SH * 0.17, size: 12, opacity: 0.04, duration: 26000, delay: 3200, rtl: true },
  { y: SH * 0.30, size: 24, opacity: 0.08, duration: 14000, delay: 7000, rtl: false },
  { y: SH * 0.44, size: 14, opacity: 0.04, duration: 31000, delay: 1500, rtl: true },
  { y: SH * 0.56, size: 28, opacity: 0.10, duration: 12000, delay: 5500, rtl: false },
  { y: SH * 0.67, size: 16, opacity: 0.05, duration: 23000, delay: 9200, rtl: true },
  { y: SH * 0.78, size: 20, opacity: 0.06, duration: 16500, delay: 2000, rtl: false },
  { y: SH * 0.88, size: 13, opacity: 0.04, duration: 29000, delay: 6000, rtl: true },
];

function AnimatedTruck({ lane, color }: { lane: typeof LANES[0]; color: string }) {
  const truckW = lane.size * 2.4;
  const startX = lane.rtl ? SW + truckW : -truckW;
  const endX = lane.rtl ? -truckW * 2 : SW + truckW;
  const posX = useRef(new Animated.Value(startX)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(lane.delay),
        Animated.timing(posX, { toValue: endX, duration: lane.duration, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(posX, { toValue: startX, duration: 0, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View style={{ position: 'absolute', top: lane.y, opacity: lane.opacity, transform: [{ translateX: posX }, { scaleX: lane.rtl ? -1 : 1 }] }}>
      <TruckShape size={lane.size} color={color} />
    </Animated.View>
  );
}

function RoadLines({ color }: { color: string }) {
  return (
    <>
      {LANES.map((lane, i) => (
        <View key={i} style={{ position: 'absolute', top: lane.y + lane.size * 1.08, left: 0, right: 0, height: 1, backgroundColor: color + '0A' }} />
      ))}
    </>
  );
}

// ─── Pantalla ─────────────────────────────────────────────────────────────────

export default function LoginScreen() {
  const { colors, isDark } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);

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
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        const isNetworkError = error.message.toLowerCase().includes('network');
        Alert.alert('Acceso denegado', isNetworkError ? 'Sin conexión. Revisá tu red e intentá de nuevo.' : 'Email o contraseña incorrectos.');
      }
    } catch {
      Alert.alert('Error', 'Ocurrió un error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={[styles.root, { backgroundColor: colors.bg }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

        {/* Fondo animado */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <RoadLines color={colors.blue} />
          {LANES.map((lane, i) => <AnimatedTruck key={i} lane={lane} color={colors.blue} />)}
        </View>

        {/* Acentos */}
        <View style={[styles.bgAccent1, { backgroundColor: `${colors.blue}14` }]} pointerEvents="none" />
        <View style={[styles.bgAccent2, { backgroundColor: `${colors.blue}0D` }]} pointerEvents="none" />

        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.kav}>
          <Animated.View style={[styles.content, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>

            {!isKeyboardVisible && (
              <View style={styles.header}>
                <View style={[styles.logoBox, { backgroundColor: `${colors.blue}1F`, borderColor: `${colors.blue}40` }]}>
                  <Ionicons name="bus" size={38} color={colors.blue} />
                </View>
                <Text style={[styles.brand, { color: colors.textPrimary }]}>Logística Hogareño</Text>
                <Text style={[styles.tagline, { color: colors.textMuted }]}>Panel de Control · Área Logística</Text>
              </View>
            )}

            <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>Iniciar Sesión</Text>

              {/* Email */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Email</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.bgInput, borderColor: focusedField === 'email' ? colors.blue : colors.border },
                focusedField === 'email' && { borderColor: colors.blue }]}>
                  <Ionicons name="mail-outline" size={18} color={focusedField === 'email' ? colors.blue : colors.textMuted} style={styles.icon} />
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary }]}
                    placeholder="usuario@empresa.com"
                    placeholderTextColor={colors.textPlaceholder}
                    value={email} onChangeText={setEmail}
                    autoCapitalize="none" keyboardType="email-address"
                    textContentType="emailAddress" autoComplete="email"
                    returnKeyType="next"
                    onFocus={() => setFocusedField('email')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              {/* Contraseña */}
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: colors.textMuted }]}>Contraseña</Text>
                <View style={[styles.inputRow, { backgroundColor: colors.bgInput, borderColor: focusedField === 'pass' ? colors.blue : colors.border }]}>
                  <Ionicons name="lock-closed-outline" size={18} color={focusedField === 'pass' ? colors.blue : colors.textMuted} style={styles.icon} />
                  <TextInput
                    style={[styles.input, { color: colors.textPrimary }]}
                    placeholder="••••••••" placeholderTextColor={colors.textPlaceholder}
                    value={password} onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    textContentType="password" autoComplete="password"
                    returnKeyType="done" onSubmitEditing={handleLogin}
                    onFocus={() => setFocusedField('pass')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: colors.blue }, loading && styles.btnDisabled]}
                onPress={handleLogin} disabled={loading} activeOpacity={0.85}
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

            {!isKeyboardVisible && (
              <Text style={[styles.footer, { color: colors.borderSubtle }]}>© 2026 Logística Hogareño · Todos los derechos reservados</Text>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bgAccent1: { position: 'absolute', top: -120, right: -80, width: 320, height: 320, borderRadius: 160 },
  bgAccent2: { position: 'absolute', bottom: -80, left: -60, width: 260, height: 260, borderRadius: 130 },
  kav: { flex: 1 },
  content: { flex: 1, padding: 28, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 36 },
  logoBox: { width: 76, height: 76, borderRadius: 22, borderWidth: 1, justifyContent: 'center', alignItems: 'center', marginBottom: 18 },
  brand: { fontSize: 26, fontWeight: '800', letterSpacing: -0.3 },
  tagline: { fontSize: 13, marginTop: 6, fontWeight: '500' },
  card: { borderRadius: 24, padding: 28, borderWidth: 1 },
  cardTitle: { fontSize: 20, fontWeight: '700', marginBottom: 24 },
  fieldGroup: { marginBottom: 18 },
  label: { fontSize: 12, fontWeight: '600', marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 16, height: 56 },
  icon: { marginRight: 12 },
  input: { flex: 1, fontSize: 15 },
  btn: { height: 58, borderRadius: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  footer: { textAlign: 'center', fontSize: 11, marginTop: 32, fontWeight: '500' },
});