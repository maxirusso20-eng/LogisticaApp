import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Drawer } from 'expo-router/drawer';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  useWindowDimensions,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ADMIN_EMAIL } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useToast } from '../../lib/toast';

const ORS_URL = 'https://api.openrouteservice.org/geocode/search';
const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_KEY || '';

// ─── Línea de escaneo animada ─────────────────────────────────────────────────
function ScanLine({ frameSize }: { frameSize: number }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [4, frameSize - 4],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.scanLine, { width: frameSize - 8, transform: [{ translateY }] }]}
    />
  );
}

export default function EscanerPantalla() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const router = useRouter();
  const toast = useToast();
  const { colors, isDark } = useTheme();

  // ── tokens UI derivados del tema ──────────────────────────────────────────
  const footerBg = isDark ? 'rgba(6,11,24,0.96)' : 'rgba(255,255,255,0.96)';
  const headerBg = isDark ? 'rgba(6,11,24,0.0)' : 'rgba(255,255,255,0.0)'; // header transparente
  const backBtnBg = isDark ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.20)';
  const badgeBg = isDark ? 'rgba(6,11,24,0.85)' : 'rgba(255,255,255,0.90)';
  const instrBg = isDark ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.80)';
  const inputBg = isDark ? 'rgba(255,255,255,0.07)' : colors.bgInput;
  const inputBorder = isDark ? 'rgba(255,255,255,0.12)' : colors.border;
  const sendDisabledBg = isDark ? '#1E2D45' : colors.bgInput;

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const frameSize = Math.min(width * 0.62, 280);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  if (!permission) return <View style={styles.container} />;

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <View style={styles.permIconWrap}>
            <Ionicons name="camera-outline" size={44} color="#4F8EF7" />
          </View>
          <Text style={styles.permTitle}>Acceso a la cámara</Text>
          <Text style={styles.errorText}>
            Necesitamos permiso para acceder a tu cámara y escanear los códigos QR.
          </Text>
          <TouchableOpacity style={styles.btnPermiso} onPress={requestPermission}>
            <Text style={styles.btnPermisoText}>Otorgar Permiso</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const processAddress = async (data: string) => {
    if (scanned || procesando) return;
    setScanned(true);
    setProcesando(true);

    try {
      if (!data) throw new Error('Dirección vacía.');
      if (!ORS_API_KEY) throw new Error('No hay API Key configurada (EXPO_PUBLIC_ORS_KEY).');

      const response = await fetch(
        `${ORS_URL}?api_key=${ORS_API_KEY}&text=${encodeURIComponent(data)}&boundary.country=AR`
      );
      if (!response.ok) throw new Error(`ORS devolvió status ${response.status}`);

      const featureCollection = await response.json();
      const features = featureCollection.features;
      if (!features || features.length === 0)
        throw new Error('No se pudo localizar la dirección especificada.');

      const [longitud, latitud] = features[0].geometry.coordinates;

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error('Usuario no autenticado.');
      const choferId = userData.user.id;

      const { error: insertError } = await supabase.from('rutas_activas').insert([
        { chofer_id: choferId, direccion: data, lat: latitud, lng: longitud, estado: 'pendiente' },
      ]);
      if (insertError) throw new Error('Error guardando el paquete en la base de datos.');

      // Éxito ✓
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success('Paquete agregado a tu ruta ✓');
      setScanned(false);
      setProcesando(false);
      setManualAddress('');

    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.error(error.message || 'No se pudo procesar la dirección.');
      setScanned(false);
      setProcesando(false);
    }
  };

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    processAddress(data);
  };

  const esAdministrador = userEmail === ADMIN_EMAIL;

  const handleVolver = () => {
    if (esAdministrador) {
      router.navigate('/(drawer)/' as any);
    } else {
      router.navigate('/(drawer)/Panel' as any);
    }
  };

  return (
    // CAPA RAÍZ: ocupa toda la pantalla, fondo negro
    <View style={styles.container}>
      <Drawer.Screen options={{ headerShown: false }} />

      {/* ── CAPA 1: Cámara fija en el fondo ── */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ 
          barcodeTypes: ['qr', 'code128', 'pdf417', 'code39', 'ean13', 'upc_a'] 
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* ── CAPA 2: Overlay oscuro con hueco (sin toques) ── */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={styles.maskRow} />
        <View style={styles.maskCenterRow}>
          <View style={styles.maskSide} />
          <View style={{ width: frameSize, height: frameSize }}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
            <ScanLine frameSize={frameSize} />
          </View>
          <View style={styles.maskSide} />
        </View>
        <View style={styles.maskRow} />
      </View>

      {/* ── CAPA 3: UI interactiva ──────────────────────────────────────────────
          FIX CRÍTICO: el KAV usa `flex: 1` (kavContainer) en lugar de
          `absoluteFillObject`. Al ser un hijo normal de `container` con
          flex:1, ocupa toda la pantalla sin posicionamiento absoluto.
          Esto permite que el motor de layout de RN calcule correctamente
          la compresión de altura cuando el teclado aparece, empujando el
          footer hacia arriba. Con absoluteFillObject el KAV queda fuera
          del flujo flex y el comportamiento del teclado se rompe.       ── */}
      <KeyboardAvoidingView
        style={styles.kavContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          {/*
            uiContainer: flex:1 + justifyContent:'space-between'
            → header sube al tope (respeta insets.top vía paddingTop inline)
            → centerSpace (flex:1) absorbe el espacio del medio (área de cámara)
            → footer se queda pegado abajo (respeta insets.bottom vía paddingBottom inline)
            Al abrirse el teclado, el KAV comprime la altura de uiContainer
            y el footer sube naturalmente sin que se deforme la cámara.
          */}
          <View style={styles.uiContainer}>

            {/* Header — siempre arriba del todo */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8, backgroundColor: headerBg }]}>
              <TouchableOpacity onPress={handleVolver} style={[styles.backButton, { backgroundColor: backBtnBg }]}>
                <Ionicons name="arrow-back" size={20} color={isDark ? '#FFF' : colors.blue} />
              </TouchableOpacity>
              <Text style={[styles.headerText, { 
                color: isDark ? '#FFF' : colors.blue, 
                textShadowColor: isDark ? 'rgba(0,0,0,0.9)' : 'transparent' 
              }]}>
                Escanear paquete
              </Text>
              <View style={{ width: 36 }} />
            </View>

            {/* Centro — instrucción / loader flotando sobre la cámara */}
            <View style={styles.centerSpace}>
              {procesando ? (
                <View style={[styles.loaderBadge, { backgroundColor: badgeBg, borderColor: colors.blue + '4D' }]}>
                  <ActivityIndicator size="small" color={colors.blue} />
                  <Text style={[styles.loaderText, { color: isDark ? '#C7D7F5' : colors.textSecondary }]}>Procesando dirección…</Text>
                </View>
              ) : (
                <View style={[styles.instrBadge, { backgroundColor: instrBg, borderColor: isDark ? 'rgba(255,255,255,0.10)' : colors.border }]}>
                  <Ionicons name="qr-code-outline" size={14} color={isDark ? 'rgba(224,231,255,0.8)' : colors.blue} />
                  <Text style={[styles.instrText, { color: isDark ? 'rgba(224,231,255,0.85)' : colors.textSecondary }]}>Centrá el código QR en el recuadro</Text>
                </View>
              )}
            </View>

            {/* Footer — sube con el teclado porque el KAV comprime uiContainer */}
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 24), backgroundColor: footerBg }]}>
              {!esAdministrador && (
                <>
                  <Text style={[styles.footerLabel, { color: colors.textMuted }]}>O ingresá la dirección manualmente</Text>
                  <View style={styles.manualRow}>
                    <TextInput
                      style={[styles.manualInput, { backgroundColor: inputBg, color: colors.textPrimary, borderColor: inputBorder }]}
                      placeholder="Ej: Av. Rivadavia 1234, CABA"
                      placeholderTextColor={colors.textPlaceholder}
                      value={manualAddress}
                      onChangeText={setManualAddress}
                      onSubmitEditing={() => processAddress(manualAddress.trim())}
                      returnKeyType="send"
                    />
                    <TouchableOpacity
                      style={[
                        styles.btnSend,
                        (!manualAddress.trim() || procesando || scanned) && [styles.btnSendDisabled, { backgroundColor: sendDisabledBg }],
                      ]}
                      onPress={() => processAddress(manualAddress.trim())}
                      disabled={!manualAddress.trim() || procesando || scanned}
                    >
                      <Ionicons name="send" size={18} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                </>
              )}

              <TouchableOpacity style={styles.btnCancelar} onPress={handleVolver}>
                <Ionicons name="close" size={18} color="#ff0000ff" style={{ marginRight: 8 }} />
                <Text style={styles.btnCancelarText}>Cancelar</Text>
              </TouchableOpacity>
            </View>

          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

    </View>
  );
}

const MASK = 'rgba(0,0,0,0.68)';
const CORNER_SIZE = 28;
const CORNER_BORDER = 3;
const CORNER_RADIUS = 14;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },

  // FIX: flex:1 en lugar de absoluteFillObject — ver comentario en JSX
  kavContainer: { flex: 1 },

  // ── UI container ─────────────────────────────────────────────────────────────
  uiContainer: { flex: 1, justifyContent: 'space-between' },

  // ── Permiso ──────────────────────────────────────────────────────────────────
  errorContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  permIconWrap: {
    width: 88, height: 88, borderRadius: 28,
    backgroundColor: 'rgba(79,142,247,0.12)',
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.25)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 20,
  },
  permTitle: { color: '#FFF', fontSize: 20, fontWeight: '700', marginBottom: 10 },
  errorText: {
    color: 'rgba(255,255,255,0.6)', fontSize: 15, textAlign: 'center',
    lineHeight: 22, marginBottom: 28,
  },
  btnPermiso: {
    backgroundColor: '#4F8EF7', paddingHorizontal: 28, paddingVertical: 14,
    borderRadius: 14,
  },
  btnPermisoText: { color: '#FFF', fontWeight: '700', fontSize: 16 },

  // ── Máscara ───────────────────────────────────────────────────────────────────
  maskRow: { flex: 1, backgroundColor: MASK },
  maskCenterRow: { flexDirection: 'row' },
  maskSide: { flex: 1, backgroundColor: MASK },

  // ── Esquinas ─────────────────────────────────────────────────────────────────
  corner: {
    position: 'absolute',
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderColor: '#4F8EF7', borderWidth: CORNER_BORDER,
  },
  cornerTL: { top: -1, left: -1, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: CORNER_RADIUS },
  cornerTR: { top: -1, right: -1, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: CORNER_RADIUS },
  cornerBL: { bottom: -1, left: -1, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: CORNER_RADIUS },
  cornerBR: { bottom: -1, right: -1, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: CORNER_RADIUS },

  // ── Línea de escaneo ─────────────────────────────────────────────────────────
  scanLine: {
    position: 'absolute',
    left: 4,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#4F8EF7',
    opacity: 0.85,
    shadowColor: '#4F8EF7',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },

  // ── Header ───────────────────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingBottom: 16,
  },
  backButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center', alignItems: 'center',
  },
  headerText: {
    flex: 1, textAlign: 'center', color: '#FFF',
    fontSize: 16, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },

  // ── Centro ───────────────────────────────────────────────────────────────────
  centerSpace: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 20 },

  loaderBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(6,11,24,0.85)',
    paddingHorizontal: 20, paddingVertical: 12,
    borderRadius: 30,
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.3)',
  },
  loaderText: { color: '#C7D7F5', fontSize: 14, fontWeight: '600' },

  instrBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 18, paddingVertical: 10,
    borderRadius: 30,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  instrText: { color: 'rgba(224,231,255,0.85)', fontSize: 13, fontWeight: '500' },

  // ── Footer ───────────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20, paddingTop: 22,
    backgroundColor: 'rgba(6, 11, 24, 0.96)',
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    gap: 14,
  },
  footerLabel: {
    color: 'rgba(255,255,255,0.4)', fontSize: 11,
    fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6,
    textAlign: 'center',
  },
  manualRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  manualInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    color: '#FFF',
    paddingHorizontal: 16, paddingVertical: 0,
    height: 50,
    borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
    fontSize: 14,
  },
  btnSend: {
    width: 50, height: 50, borderRadius: 14,
    backgroundColor: '#4F8EF7',
    justifyContent: 'center', alignItems: 'center',
  },
  btnSendDisabled: { backgroundColor: '#1E2D45', opacity: 0.6 },

  btnCancelar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.4)',
    borderRadius: 14, height: 50,
  },
  btnCancelarText: { color: '#ff0000ff', fontWeight: '700', fontSize: 15 },
});