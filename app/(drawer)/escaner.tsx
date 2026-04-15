import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, Alert, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
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

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) setUserEmail(data.user.email);
    });
  }, []);

  if (!permission) {
    // Aún cargando los permisos
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    // Permisos denegados
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

      // 1. Geocodificar la dirección con OpenRouteService
      if (!ORS_API_KEY) {
        throw new Error("No hay API Key configurada para OpenRouteService (EXPO_PUBLIC_ORS_KEY).");
      }

      const response = await fetch(`${ORS_URL}?api_key=${ORS_API_KEY}&text=${encodeURIComponent(data)}`);
      if (!response.ok) {
        throw new Error("Error al consultar OpenRouteService.");
      }

      const featureCollection = await response.json();
      const features = featureCollection.features;

      if (!features || features.length === 0) {
        throw new Error("No se pudo localizar la dirección especificada.");
      }

      // Las coordenadas en GeoJSON son [longitud, latitud]
      const [longitud, latitud] = features[0].geometry.coordinates;

      // 2. Obtener el chofer actual
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) {
        throw new Error("Usuario no autenticado o no se pudo obtener.");
      }
      const choferId = userData.user.id;
      const creadoPorEmail = userData.user.email;

      // 3. Guardar en Supabase tabla paradas_ruta
      const { error: insertError } = await supabase.from('paradas_ruta').insert([
        {
          chofer_id: choferId,
          direccion: data,
          lat: latitud,
          lng: longitud,
          estado: 'pendiente',
          creado_por_email: creadoPorEmail
        }
      ]);

      if (insertError) {
        console.error("Error al insertar en Supabase:", insertError);
        throw new Error("Ocurrió un error guardando el paquete en la base de datos.");
      }

      // 4. Mostrar mensaje de éxito
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
    <KeyboardAvoidingView 
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{
          barcodeTypes: ["qr"],
        }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      >
        <View style={styles.overlayContainer}>
          <View style={styles.overlayHeader}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.headerText}>Escanear Paquete</Text>
            <View style={styles.spacer} />
          </View>

          <View style={styles.focusContainer}>
            <View style={styles.focusFrame}>
              {procesando && (
                <View style={styles.loaderContainer}>
                  <ActivityIndicator size="large" color="#4F8EF7" />
                  <Text style={styles.loaderText}>Procesando...</Text>
                </View>
              )}
            </View>
            <Text style={styles.instructionText}>
              Apunta la cámara hacia el código QR de la etiqueta
            </Text>
          </View>

          <View style={styles.overlayFooter}>
            {!esAdministrador && (
              <View style={styles.manualEntryContainer}>
                <TextInput
                  style={styles.manualInput}
                  placeholder="O ingresa dirección manualmente"
                  placeholderTextColor="rgba(255,255,255,0.6)"
                  value={manualAddress}
                  onChangeText={setManualAddress}
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
      </CameraView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#060B18',
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
  overlayContainer: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0,0,0,0.4)', 
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: 'rgba(6, 11, 24, 0.7)',
  },
  backButton: {
    padding: 8,
    borderRadius: 50,
    backgroundColor: 'rgba(255,255,255,0.2)',
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
  },
  focusContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  focusFrame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#4F8EF7',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loaderContainer: {
    backgroundColor: 'rgba(6, 11, 24, 0.8)',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  loaderText: {
    color: '#FFF',
    marginTop: 12,
    fontWeight: '600',
  },
  instructionText: {
    color: '#FFF',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
    paddingHorizontal: 40,
  },
  overlayFooter: {
    padding: 20,
    paddingBottom: 40,
    alignItems: 'center',
    backgroundColor: 'rgba(6, 11, 24, 0.8)',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  manualEntryContainer: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 20,
    alignItems: 'center',
  },
  manualInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    marginRight: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  btnGuardarManual: {
    backgroundColor: '#4F8EF7',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  btnGuardarManualDisabled: {
    backgroundColor: '#3A5A80',
    opacity: 0.6,
  },
  btnGuardarManualText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  btnCerrar: {
    backgroundColor: '#EF4444',
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 30,
    width: '100%',
    alignItems: 'center',
  },
  btnCerrarText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
