import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  TouchableWithoutFeedback,
  Keyboard,
  useWindowDimensions
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';

// URL y Header para la API de OpenRouteService
const ORS_URL = 'https://api.openrouteservice.org/geocode/search';
const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_KEY || ''; // Configura esto en tu .env

export default function EscanerPantalla() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [procesando, setProcesando] = useState(false);
  const [manualAddress, setManualAddress] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const router = useRouter();

  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const frameSize = width * 0.7; // 70% del ancho de pantalla manteniendo ratio 1:1

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Ionicons name="camera-outline" size={64} color="#4A6FA5" />
          <Text style={styles.errorText}>Necesitamos acceso a tu cámara para escanear los códigos QR.</Text>
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
      if (!data) throw new Error("Dirección vacía.");

      console.log("Llave ORS:", ORS_API_KEY);

      if (!ORS_API_KEY) {
        throw new Error("No hay API Key configurada para OpenRouteService (EXPO_PUBLIC_ORS_KEY).");
      }

      const response = await fetch(`${ORS_URL}?api_key=${ORS_API_KEY}&text=${encodeURIComponent(data)}&boundary.country=AR`);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error ORS: ${response.status} - ${errorText}`);
        throw new Error(`ORS devolvió status ${response.status}`);
      }

      const featureCollection = await response.json();
      const features = featureCollection.features;

      if (!features || features.length === 0) {
        throw new Error("No se pudo localizar la dirección especificada.");
      }

      const [longitud, latitud] = features[0].geometry.coordinates;

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        throw new Error("Usuario no autenticado o no se pudo obtener.");
      }
      const choferId = userData.user.id;

      const { error: insertError } = await supabase.from('rutas_activas').insert([
        {
          chofer_id: choferId,
          direccion: data,
          lat: latitud,
          lng: longitud,
          estado: 'pendiente',
        }
      ]);

      if (insertError) {
        console.error("Error al insertar en Supabase:", insertError);
        throw new Error("Ocurrió un error guardando el paquete en la base de datos.");
      }

      Alert.alert(
        "¡Paquete Asignado!",
        `Dirección: ${data}\nAgregada a tu ruta exitosamente.`,
        [
          {
            text: "Escanear otro",
            onPress: () => {
              setScanned(false);
              setProcesando(false);
              setManualAddress('');
            }
          },
          {
            text: "Ir al Panel",
            onPress: () => {
              router.push('/(drawer)/Panel');
              setProcesando(false);
            }
          }
        ]
      );

    } catch (error: any) {
      console.error(error);
      Alert.alert("Error", error.message || "No se pudo procesar la dirección.", [
        {
          text: "Reintentar",
          onPress: () => {
            setScanned(false);
            setProcesando(false);
          }
        }
      ]);
    }
  };

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    console.log(`[QR Escaneado] Tipo: ${type}, Datos: ${data}`);
    processAddress(data);
  };

  const esAdministrador = userEmail === 'maxirusso20@gmail.com';

  return (
    <View style={styles.container}>
      {/* CAPA 1: Fondo (Cámara Fija) */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* CAPA 2: Overlay Oscuro con Hueco Central Transparente (FIJO, IGNORA TOUCHES) */}
      <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
        <View style={styles.maskRow} />
        <View style={styles.maskCenterRow}>
          <View style={styles.maskSide} />
          <View style={{ width: frameSize, height: frameSize }}>
            {/* Esquinas fijas del escáner - Capa 2 */}
            <View style={[styles.cornerMark, styles.cornerTopLeft]} />
            <View style={[styles.cornerMark, styles.cornerTopRight]} />
            <View style={[styles.cornerMark, styles.cornerBottomLeft]} />
            <View style={[styles.cornerMark, styles.cornerBottomRight]} />
          </View>
          <View style={styles.maskSide} />
        </View>
        <View style={styles.maskRow} />
      </View>

      {/* CAPA 3: UI Interactiva y Teclado (SE MUEVE CON EL TECLADO) */}
      <KeyboardAvoidingView
        style={StyleSheet.absoluteFillObject}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.uiContainer}>
            {/* Header: Usa safe-area para iOS/Android Notch */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 10 }]}>
              <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                <Ionicons name="arrow-back" size={24} color="#FFF" />
              </TouchableOpacity>
              <Text style={styles.headerText}>Escanear Paquete</Text>
              <View style={styles.spacer} />
            </View>

            {/* Centro: Layout flexible, se comprime al abrir teclado */}
            <View style={styles.centerSpace}>
              {procesando ? (
                <View style={[styles.loaderContainer, { transform: [{ translateY: frameSize / 2 + 40 }] }]}>
                  <ActivityIndicator size="large" color="#4F8EF7" />
                  <Text style={styles.loaderText}>Procesando...</Text>
                </View>
              ) : (
                <Text style={[styles.instructionText, { transform: [{ translateY: frameSize / 2 + 40 }] }]}>
                  Apunta la cámara hacia el código QR de la etiqueta
                </Text>
              )}
            </View>

            {/* Footer: Inputs pegados abajo, con insets seguros */}
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 20) }]}>
              {!esAdministrador && (
                <View style={styles.manualEntryContainer}>
                  <TextInput
                    style={styles.manualInput}
                    placeholder="O ingresa dirección manualmente..."
                    placeholderTextColor="rgba(255,255,255,0.6)"
                    value={manualAddress}
                    onChangeText={setManualAddress}
                    onSubmitEditing={() => processAddress(manualAddress.trim())}
                    returnKeyType="send"
                  />
                  <TouchableOpacity
                    style={[styles.btnGuardarManual, !manualAddress.trim() && styles.btnGuardarManualDisabled]}
                    onPress={() => processAddress(manualAddress.trim())}
                    disabled={!manualAddress.trim() || procesando || scanned}
                  >
                    <Text style={styles.btnGuardarManualText}>Guardar</Text>
                  </TouchableOpacity>
                </View>
              )}

              <TouchableOpacity style={styles.btnCerrar} onPress={() => router.back()}>
                <Text style={styles.btnCerrarText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>
    </View>
  );
}

const OVERLAY_COLOR = 'rgba(0,0,0,0.65)';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorText: {
    color: '#FFF',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 24,
  },
  btnPermiso: {
    backgroundColor: '#4F8EF7',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnPermisoText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  
  /* --- ESTILOS CAPA 2 (Máscara fija) --- */
  maskRow: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
  },
  maskCenterRow: {
    flexDirection: 'row',
  },
  maskSide: {
    flex: 1,
    backgroundColor: OVERLAY_COLOR,
  },
  cornerMark: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderColor: '#4F8EF7',
    borderWidth: 4,
  },
  cornerTopLeft: {
    top: -2,
    left: -2,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 20,
  },
  cornerTopRight: {
    top: -2,
    right: -2,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 20,
  },
  cornerBottomLeft: {
    bottom: -2,
    left: -2,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 20,
  },
  cornerBottomRight: {
    bottom: -2,
    right: -2,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 20,
  },

  /* --- ESTILOS CAPA 3 (UI Flexible) --- */
  uiContainer: {
    flex: 1,
    justifyContent: 'space-between',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'transparent',
  },
  backButton: {
    padding: 8,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  spacer: {
    width: 40,
  },
  headerText: {
    flex: 1,
    textAlign: 'center',
    color: '#FFF',
    fontSize: 18,
    fontWeight: 'bold',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  centerSpace: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderContainer: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingHorizontal: 30,
    paddingVertical: 20,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  loaderText: {
    color: '#FFF',
    marginTop: 12,
    fontWeight: '600',
    fontSize: 15,
  },
  instructionText: {
    color: '#E0E7FF',
    fontSize: 15,
    textAlign: 'center',
    fontWeight: '500',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    overflow: 'hidden',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    backgroundColor: 'rgba(6, 11, 24, 0.95)',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  manualEntryContainer: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 20,
    alignItems: 'center',
  },
  manualInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    fontSize: 15,
  },
  btnGuardarManual: {
    backgroundColor: '#4F8EF7',
    paddingVertical: 14,
    paddingHorizontal: 22,
    borderRadius: 14,
  },
  btnGuardarManualDisabled: {
    backgroundColor: '#2A3C5A',
    opacity: 0.7,
  },
  btnGuardarManualText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  btnCerrar: {
    backgroundColor: '#EF4444',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
  },
  btnCerrarText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
  },
});