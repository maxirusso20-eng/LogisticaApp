// app/(drawer)/colectas.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import SignatureScreen from 'react-native-signature-canvas';
import { BottomSheetModal, BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Location from 'expo-location';
import { ADMIN_EMAIL, getSaludo } from '../../lib/constants';
import { startTracking, stopTracking } from '../../lib/locationTracker';
import { SkeletonColectaCard } from '../../lib/skeleton';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useToast } from '../../lib/toast';

const ignorarNotificacionesCache = new Map<string, number>();
const CACHE_TTL_MS = 5_000;
const ORS_URL = 'https://api.openrouteservice.org/geocode/search';
const ORS_API_KEY = process.env.EXPO_PUBLIC_ORS_KEY || '';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true, shouldSetBadge: false,
    shouldShowBanner: true, shouldShowList: true,
  }),
});

async function notificarCambioDesdecentral(payload: {
  clienteNombre?: string; clienteDireccion?: string; nuevoEstado?: boolean; tipo?: 'UPDATE' | 'INSERT' | 'DELETE';
}): Promise<void> {
  const nombre = payload.clienteNombre?.trim() || 'Una colecta';
  let titulo = '📋 Actualización desde la central';
  let cuerpo = `${nombre} fue modificada.`;
  if (payload.tipo === 'INSERT') { titulo = '🆕 Nueva colecta asignada'; cuerpo = `Te asignaron: ${nombre}`; if (payload.clienteDireccion) cuerpo += ` · ${payload.clienteDireccion}`; }
  else if (payload.tipo === 'DELETE') { titulo = '🗑️ Colecta removida'; cuerpo = `${nombre} fue eliminada de tu lista.`; }
  else { if (payload.nuevoEstado === false) { titulo = '🔄 Colecta designada'; cuerpo = `${nombre} fue marcada para el día de hoy.`; } else if (payload.nuevoEstado === true) { titulo = '✅ Colecta completada por central'; cuerpo = `${nombre} fue marcada como completada.`; } }
  try { await Notifications.scheduleNotificationAsync({ content: { title: titulo, body: cuerpo, sound: true, data: { tipo: payload.tipo ?? 'UPDATE' } }, trigger: null }); } catch (err) { console.warn('[Notificación]', err); }
}

async function enviarMensajeAutoChatColecta(emailChofer: string, nombreColecta: string): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('mensajes').insert([{ user_id: user.id, remitente: 'Sistema', texto: `🔔 Colecta recogida: ${nombreColecta}`, chofer_email: emailChofer }]);
    if (error) console.warn('[Chat auto]', error.message);
  } catch (err) { console.warn('[Chat auto]', err); }
}

interface Cliente {
  id: number | string; cliente: string; direccion: string; horario: string;
  chofer: string; completado: boolean; foto_url?: string | null; firma_url?: string | null; email_chofer?: string;
}
interface GrupoChofer { nombre: string; colectas: Cliente[]; hechas: number; total: number; }
type FiltroColecta = 'todas' | 'pendientes' | 'completadas';

const parsearHorario = (horario: string): number | null => {
  if (!horario) return null;
  const match = horario.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return parseInt(match[1]) * 60 + parseInt(match[2]);
};
const colectaVencida = (horario: string, completado: boolean): boolean => {
  if (completado) return false;
  const m = parsearHorario(horario);
  if (m === null) return false;
  const ahora = new Date();
  return ahora.getHours() * 60 + ahora.getMinutes() >= m + 15;
};
const notificacionesVencidasEnviadas = new Set<string>();
async function notificarColectaVencida(clienteNombre: string, emailChofer: string): Promise<void> {
  const key = `${clienteNombre}-${new Date().toDateString()}`;
  if (notificacionesVencidasEnviadas.has(key)) return;
  notificacionesVencidasEnviadas.add(key);
  try {
    const [{ data: cd }, { data: ad }] = await Promise.all([
      supabase.from('Choferes').select('push_token').eq('email', emailChofer).maybeSingle(),
      supabase.from('Admins').select('push_token').eq('email', ADMIN_EMAIL).maybeSingle(),
    ]);
    const tokens = [cd?.push_token, ad?.push_token].filter(Boolean) as string[];
    if (!tokens.length) return;
    await Promise.all(tokens.map(token => fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: token, title: '⚠️ Colecta no realizada', body: `${clienteNombre} no fue marcada como completada a tiempo.`, sound: 'default', data: { tipo: 'COLECTA_VENCIDA' } }) })));
  } catch (err) { console.warn('[Push]', err); }
}
const abrirMapa = async (direccion: string) => {
  if (!direccion) return;
  const u = encodeURIComponent(direccion);
  
  // URLs nativas y de navegador (plan B)
  const urlIos = `maps:0,0?q=${u}`;
  const urlAndroid = `geo:0,0?q=${u}`;
  const urlWeb = `https://www.google.com/maps/search/?api=1&query=${u}`;

  try {
    if (Platform.OS === 'ios') {
      // Pregunta si Apple Maps está instalado
      const supported = await Linking.canOpenURL(urlIos);
      if (supported) {
        await Linking.openURL(urlIos);
      } else {
        await Linking.openURL(urlWeb); // Abre Safari si falla
      }
    } else if (Platform.OS === 'android') {
      // Pregunta si Google Maps está instalado
      const supported = await Linking.canOpenURL(urlAndroid);
      if (supported) {
        await Linking.openURL(urlAndroid);
      } else {
        await Linking.openURL(urlWeb); // Abre Chrome si falla
      }
    } else {
      await Linking.openURL(urlWeb);
    }
  } catch (error) {
    console.error('Error abriendo el mapa:', error);
    Alert.alert('Error', 'No se pudo abrir la dirección en el mapa.');
  }
};
const agruparPorChofer = (lista: Cliente[]): GrupoChofer[] => {
  const mapa = new Map<string, Cliente[]>();
  for (const c of lista) { const n = c.chofer?.trim() || 'Sin asignar'; if (!mapa.has(n)) mapa.set(n, []); mapa.get(n)!.push(c); }
  return Array.from(mapa.entries()).map(([nombre, colectas]) => ({ nombre, colectas: colectas.sort((a, b) => (a.horario || '').localeCompare(b.horario || '')), hechas: colectas.filter(c => c.completado).length, total: colectas.length }))
    .sort((a, b) => { const ap = a.total - a.hechas; const bp = b.total - b.hechas; return bp !== ap ? bp - ap : a.nombre.localeCompare(b.nombre); });
};

// ─── FotoColecta ──────────────────────────────────────────────────────────────

function FotoColecta({ clienteId, fotoUrl, vencida, done }: {
  clienteId: number | string; fotoUrl: string | null; vencida: boolean; done: boolean; emailChofer: string; clienteNombre: string;
}) {
  const { colors } = useTheme();
  const [subiendo, setSubiendo] = React.useState(false);
  const [fotoLocal, setFotoLocal] = React.useState<string | null>(fotoUrl);
  React.useEffect(() => { setFotoLocal(fotoUrl); }, [fotoUrl]);

  const sacarFoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Sin permiso', 'Necesitás permitir el acceso a la cámara.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    setSubiendo(true);
    try {
      const blob = await (await fetch(result.assets[0].uri)).blob();
      const filePath = `colectas/${String(clienteId)}_${Date.now()}.jpg`;
      const { error: ue } = await supabase.storage.from('fotos-colectas').upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });
      if (ue) throw ue;
      const { data: ud } = supabase.storage.from('fotos-colectas').getPublicUrl(filePath);
      const { error: upd } = await supabase.from('Clientes').update({ foto_url: ud.publicUrl }).eq('id', clienteId);
      if (upd) throw upd;
      setFotoLocal(ud.publicUrl);
    } catch (err: any) { Alert.alert('Error', err?.message || 'No se pudo subir la foto.'); }
    finally { setSubiendo(false); }
  };

  return (
    <View style={ST.fotoContainer}>
      {fotoLocal ? (
        <View>
          <Text style={[ST.fotoLabel, { color: colors.textMuted }]}>{done ? '📸 Foto de entrega' : '📸 Justificación'}</Text>
          <Image
            source={{ uri: fotoLocal }}
            style={[ST.fotoPreview, { backgroundColor: colors.bgCard, borderColor: colors.border }]}
            contentFit="cover"
            transition={200}
          />
          <TouchableOpacity style={ST.fotoBtnReemplazar} onPress={sacarFoto} disabled={subiendo} activeOpacity={0.75}>
            <Ionicons name="camera-outline" size={13} color={colors.textMuted} />
            <Text style={[ST.fotoBtnReemplazarText, { color: colors.textMuted }]}>Reemplazar foto</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={[ST.fotoBtnSacar, { backgroundColor: colors.blue }, vencida && !done && { backgroundColor: '#EF4444' }]} onPress={sacarFoto} disabled={subiendo} activeOpacity={0.8}>
          {subiendo ? <ActivityIndicator size="small" color="#FFFFFF" /> : (
            <><Ionicons name="camera" size={16} color="#FFFFFF" /><Text style={ST.fotoBtnText}>{vencida && !done ? 'Justificar colecta no realizada' : 'Foto de entrega'}</Text></>
          )}
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── ColectaCard (Chofer) ─────────────────────────────────────────────────────

function ColectaCard({ item, index, onToggle, toggling }: {
  item: Cliente; index: number;
  onToggle: (id: number | string, actual: boolean, nombreCliente: string) => void; toggling: boolean;
}) {
  const { colors } = useTheme();
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => { Animated.timing(fade, { toValue: 1, duration: 350, delay: index * 55, useNativeDriver: true }).start(); }, []);
  const handlePress = () => {
    Animated.sequence([Animated.timing(scale, { toValue: 0.96, duration: 70, useNativeDriver: true }), Animated.timing(scale, { toValue: 1, duration: 70, useNativeDriver: true })]).start();
    onToggle(item.id, item.completado, item.cliente);
  };
  const done = item.completado;
  const vencida = colectaVencida(item.horario, done);

  return (
    <Animated.View style={[
      ST.card,
      { backgroundColor: colors.bgCard, borderColor: colors.border },
      done && { borderColor: 'rgba(52,211,153,0.15)', backgroundColor: colors.bgCard },
      vencida && { borderColor: 'rgba(239,68,68,0.25)', backgroundColor: colors.bgCard },
      { opacity: fade, transform: [{ scale }] },
    ]}>
      <View style={[ST.accent, { backgroundColor: done ? '#34D399' : vencida ? '#EF4444' : colors.blue }]} />
      <View style={ST.cardBody}>
        <View style={ST.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[ST.clienteNombre, { color: done ? colors.textMuted : colors.textPrimary }]} numberOfLines={1}>{item.cliente || '—'}</Text>
            <View style={ST.horarioRow}>
              <Ionicons name="time-outline" size={13} color={done ? colors.textMuted : vencida ? '#EF4444' : colors.blue} />
              <Text style={[ST.horarioText, { color: done ? colors.textMuted : vencida ? '#EF4444' : colors.blue }]}>
                {item.horario || 'Sin horario'}{vencida && !done ? ' · Vencida' : ''}
              </Text>
            </View>
          </View>
          <TouchableOpacity onPress={handlePress} disabled={toggling || vencida} activeOpacity={0.7} style={ST.checkWrap}>
            {toggling ? <ActivityIndicator size="small" color={colors.blue} />
              : vencida && !done ? <Ionicons name="alert-circle" size={30} color="#EF4444" />
                : <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={30} color={done ? '#34D399' : colors.borderSubtle} />}
          </TouchableOpacity>
        </View>
        <View>
          <TouchableOpacity style={ST.addressTouchable} activeOpacity={0.6} onPress={() => item.direccion && abrirMapa(item.direccion)}>
            <Ionicons name="location-outline" size={14} color={done ? colors.textMuted : colors.blue} />
            <Text style={[ST.detailText, { color: done ? colors.textMuted : colors.textSecondary }]} numberOfLines={2}>{item.direccion || '—'}</Text>
            {item.direccion ? (<View style={[ST.mapNavIconWrap, { backgroundColor: colors.blueSubtle }]}><Ionicons name="map-outline" size={18} color={done ? colors.textMuted : colors.blue} /></View>) : null}
          </TouchableOpacity>
          <View style={[ST.detailRow, { marginTop: 4, marginLeft: 2 }]}>
            <Ionicons name="person-outline" size={13} color={colors.textMuted} />
            <Text style={[ST.detailText, { color: done ? colors.textMuted : colors.textSecondary }]}>{item.chofer || 'Sin asignar'}</Text>
          </View>
        </View>
        {done && (
          <View style={ST.doneBadge}>
            <Ionicons name="checkmark-done" size={11} color="#34D399" />
            <Text style={ST.doneBadgeText}>Completada</Text>
          </View>
        )}
        {(vencida || done) && (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <View style={{ flex: 1 }}>
              <FotoColecta clienteId={item.id} fotoUrl={item.foto_url ?? null} vencida={vencida} done={done} emailChofer={item.email_chofer ?? ''} clienteNombre={item.cliente} />
            </View>
            {done && (
              <View style={{ flex: 1 }}>
                <FirmaColecta clienteId={item.id} firmaUrl={item.firma_url ?? null} vencida={vencida} done={done} />
              </View>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

// ─── FirmaColecta ─────────────────────────────────────────────────────────────

function FirmaColecta({ clienteId, firmaUrl, vencida, done }: {
  clienteId: number | string; firmaUrl: string | null; vencida: boolean; done: boolean;
}) {
  const { colors } = useTheme();
  const [subiendo, setSubiendo] = useState(false);
  const [firmaLocal, setFirmaLocal] = useState<string | null>(firmaUrl);
  const sheetRef = useRef<BottomSheetModal>(null);

  useEffect(() => { setFirmaLocal(firmaUrl); }, [firmaUrl]);

  const snapPoints = useMemo(() => ['65%', '90%'], []);
  const renderBackdrop = useCallback((props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.6} />, []);

  const handleSignature = async (signature: string) => {
    sheetRef.current?.dismiss();
    setSubiendo(true);
    try {
      const blob = await (await fetch(signature)).blob();
      const filePath = `firmas/${String(clienteId)}_${Date.now()}.png`;
      const { error: ue } = await supabase.storage.from('firmas-colectas').upload(filePath, blob, { contentType: 'image/png', upsert: true });
      if (ue) throw ue;
      const { data: ud } = supabase.storage.from('firmas-colectas').getPublicUrl(filePath);
      const { error: upd } = await supabase.from('Clientes').update({ firma_url: ud.publicUrl }).eq('id', clienteId);
      if (upd) throw upd;
      setFirmaLocal(ud.publicUrl);
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'No se pudo subir la firma.');
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <View style={ST.fotoContainer}>
      {firmaLocal ? (
        <View>
          <Text style={[ST.fotoLabel, { color: colors.textMuted }]}>✍️ Firma del cliente</Text>
          <Image source={{ uri: firmaLocal }} style={[ST.fotoPreview, { backgroundColor: colors.bgInput, borderColor: colors.border }]} contentFit="contain" transition={200} />
          <TouchableOpacity style={ST.fotoBtnReemplazar} onPress={() => sheetRef.current?.present()} disabled={subiendo}>
             <Ionicons name="create-outline" size={13} color={colors.textMuted} />
             <Text style={[ST.fotoBtnReemplazarText, { color: colors.textMuted }]}>Nueva firma</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity style={[ST.fotoBtnSacar, { backgroundColor: colors.bgInput, borderWidth: 1, borderColor: colors.blue }]} onPress={() => sheetRef.current?.present()} disabled={subiendo || (vencida && !done)}>
          {subiendo ? <ActivityIndicator size="small" color={colors.blue} /> : (
            <><Ionicons name="pencil" size={16} color={colors.blue} /><Text style={[ST.fotoBtnText, { color: colors.blue }]}>Pedir Firma</Text></>
          )}
        </TouchableOpacity>
      )}

      <BottomSheetModal
        ref={sheetRef}
        index={1}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.bgCard }}
        handleIndicatorStyle={{ backgroundColor: colors.borderSubtle }}
        enablePanDownToClose
      >
        <View style={{ flex: 1, padding: 10 }}>
          <Text style={{ textAlign: 'center', marginBottom: 10, fontSize: 16, fontWeight: 'bold', color: colors.textPrimary }}>Firma del Cliente</Text>
          <SignatureScreen
            onOK={handleSignature}
            onEmpty={() => Alert.alert('Aviso', 'La firma no puede estar vacía')}
            descriptionText=""
            clearText="Borrar"
            confirmText="Guardar"
            webStyle={`
              .m-signature-pad { box-shadow: none; border: 1.5px solid ${colors.border}; border-radius: 14px; }
              body { background-color: transparent; }
              .m-signature-pad--body { background-color: ${colors.bgInput}; border-radius: 12px; overflow: hidden; }
              .m-signature-pad--footer { padding: 15px 10px; margin-top: 10px; }
              .button { background-color: ${colors.blue}; color: #fff; padding: 10px 20px; border-radius: 10px; font-weight: bold; border: none; font-size: 14px;}
              .button.clear { background-color: transparent; border: 1.5px solid ${colors.border}; color: ${colors.textPrimary}; }
            `}
          />
        </View>
      </BottomSheetModal>
    </View>
  );
}

// ─── FilaColectaAdmin ─────────────────────────────────────────────────────────

const FilaColectaAdmin: React.FC<{ item: Cliente }> = ({ item }) => {
  const { colors } = useTheme();
  const done = item.completado;
  return (
    <View style={[ADM.fila, { borderBottomColor: colors.borderSubtle }, done && { opacity: 0.55 }]}>
      <View style={[ADM.filaIndicador, { backgroundColor: done ? '#34D399' : colors.blue }]} />
      <View style={{ flex: 1 }}>
        <Text style={[ADM.filaNombre, { color: done ? colors.textMuted : colors.textPrimary }]} numberOfLines={1}>{item.cliente || '—'}</Text>
        <View style={ADM.filaMeta}>
          <Ionicons name="time-outline" size={11} color={done ? colors.textMuted : colors.textMuted} />
          <Text style={[ADM.filaMetaText, { color: done ? colors.textMuted : colors.textMuted }]}>{item.horario || 'Sin horario'}</Text>
          {item.direccion ? (<><Text style={[ADM.filaMetaSep, { color: colors.textMuted }]}>·</Text><Ionicons name="location-outline" size={11} color={colors.textMuted} /><Text style={[ADM.filaMetaText, { flex: 1, color: done ? colors.textMuted : colors.textSecondary }]} numberOfLines={1}>{item.direccion}</Text></>) : null}
        </View>
      </View>
      {done
        ? <View style={ADM.badgeDone}><Ionicons name="checkmark-done" size={10} color="#34D399" /><Text style={ADM.badgeDoneText}>Hecha</Text></View>
        : <View style={ADM.badgePendiente}><Text style={ADM.badgePendienteText}>Pendiente</Text></View>
      }
    </View>
  );
};

// ─── CardChoferAdmin ──────────────────────────────────────────────────────────

const CardChoferAdmin: React.FC<{ grupo: GrupoChofer; index: number }> = ({ grupo, index }) => {
  const { colors } = useTheme();
  const [expandido, setExpandido] = useState(true);
  const fade = useRef(new Animated.Value(0)).current;
  const rotacion = useRef(new Animated.Value(1)).current;
  useEffect(() => { Animated.timing(fade, { toValue: 1, duration: 400, delay: index * 80, useNativeDriver: true }).start(); }, []);
  const toggleExpandido = () => {
    const v = !expandido; setExpandido(v);
    Animated.timing(rotacion, { toValue: v ? 1 : 0, duration: 220, useNativeDriver: true }).start();
  };
  const rotarIcono = rotacion.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const pendientes = grupo.total - grupo.hechas;
  const porcentaje = grupo.total > 0 ? grupo.hechas / grupo.total : 0;
  const todoCompleto = pendientes === 0;
  const colorProgreso = todoCompleto ? '#34D399' : porcentaje >= 0.5 ? colors.blue : '#F59E0B';
  const iniciales2 = grupo.nombre.split(' ').map(p => p[0] || '').slice(0, 2).join('').toUpperCase();

  return (
    <Animated.View style={[ADM.card, { backgroundColor: colors.bgCard, borderColor: colors.border, opacity: fade }]}>
      <TouchableOpacity style={ADM.cardHeader} onPress={toggleExpandido} activeOpacity={0.75}>
        <View style={[ADM.avatar, { backgroundColor: colors.bgInput, borderColor: colorProgreso + '55' }]}>
          <Text style={[ADM.avatarText, { color: colorProgreso }]}>{iniciales2}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[ADM.choferNombre, { color: colors.textPrimary }]} numberOfLines={1}>{grupo.nombre}</Text>
          <View style={ADM.progresoRow}>
            <Text style={[ADM.progresoTexto, { color: colorProgreso }]}>{grupo.hechas}/{grupo.total} completadas</Text>
            {!todoCompleto && (<View style={ADM.pendienteBadge}><Text style={ADM.pendienteBadgeText}>{pendientes} pend.</Text></View>)}
          </View>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={[ADM.miniBarBg, { backgroundColor: colors.bgInput }]}>
            <View style={[ADM.miniBarFill, { width: `${porcentaje * 100}%` as any, backgroundColor: colorProgreso }]} />
          </View>
          <Animated.View style={{ transform: [{ rotate: rotarIcono }] }}>
            <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
          </Animated.View>
        </View>
      </TouchableOpacity>
      {expandido && (
        <View style={ADM.filasContainer}>
          <View style={[ADM.filasDivider, { backgroundColor: colors.borderSubtle }]} />
          {grupo.colectas.map((c) => <FilaColectaAdmin key={String(c.id)} item={c} />)}
        </View>
      )}
    </Animated.View>
  );
};

// ─── VistaAdmin ───────────────────────────────────────────────────────────────

const VistaAdmin: React.FC<{ clientes: Cliente[]; refrescando: boolean; onRefresh: () => void }> = ({ clientes, refrescando, onRefresh }) => {
  const { colors } = useTheme();
  const [busqueda, setBusqueda] = useState('');
  const grupos = useMemo(() => {
    const lista = busqueda.trim() ? clientes.filter(c => (c.cliente || '').toLowerCase().includes(busqueda.toLowerCase()) || (c.chofer || '').toLowerCase().includes(busqueda.toLowerCase()) || (c.direccion || '').toLowerCase().includes(busqueda.toLowerCase())) : clientes;
    return agruparPorChofer(lista);
  }, [clientes, busqueda]);
  const totalGlobal = clientes.length;
  const hechasGlobal = clientes.filter(c => c.completado).length;
  const pendientesGlobal = totalGlobal - hechasGlobal;
  const progresoGlobal = totalGlobal > 0 ? hechasGlobal / totalGlobal : 0;

  return (
    <ScrollView style={[ST.container, { backgroundColor: colors.bg }]} contentContainerStyle={ST.content} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor={colors.blue} colors={[colors.blue]} />}>
      <View style={[ADM.headerBox, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={ADM.headerTopRow}>
          <View>
            <Text style={[ADM.headerEyebrow, { color: colors.textMuted }]}>PANEL DE SUPERVISIÓN</Text>
            <Text style={[ADM.headerTitle, { color: colors.textPrimary }]}>Vista del día</Text>
          </View>
          <View style={ADM.adminBadge}><Ionicons name="shield-checkmark-outline" size={12} color="#F59E0B" /><Text style={ADM.adminBadgeText}>Admin</Text></View>
        </View>
        <View style={[ADM.statsGlobales, { backgroundColor: colors.bg, borderColor: colors.borderSubtle }]}>
          {[{ v: totalGlobal, l: 'Total', c: colors.textPrimary }, { v: hechasGlobal, l: 'Hechas', c: '#34D399' }, { v: pendientesGlobal, l: 'Pendientes', c: pendientesGlobal > 0 ? '#F59E0B' : '#6B7280' }, { v: grupos.length, l: 'Choferes', c: colors.blue }].map((s, i) => (
            <View key={i} style={[ADM.statGlobal, i > 0 && { borderLeftWidth: 1, borderColor: colors.borderSubtle }]}>
              <Text style={[ADM.statGlobalNum, { color: s.c }]}>{s.v}</Text>
              <Text style={[ADM.statGlobalLabel, { color: colors.textMuted }]}>{s.l}</Text>
            </View>
          ))}
        </View>
        <View style={{ marginTop: 14 }}>
          <View style={[ST.progressBg, { backgroundColor: colors.bg, borderColor: colors.borderSubtle }]}>
            <View style={[ST.progressFill, { width: `${progresoGlobal * 100}%` as any }]} />
          </View>
          <Text style={[ST.progressLabel, { color: colors.textMuted, marginTop: 5 }]}>{Math.round(progresoGlobal * 100)}% del día completado</Text>
        </View>
      </View>
      <View style={[ST.searchRow, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 10 }} />
        <TextInput style={[ST.searchInput, { color: colors.textPrimary }]} placeholder="Buscar cliente, chofer o dirección..." placeholderTextColor={colors.textPlaceholder} value={busqueda} onChangeText={setBusqueda} />
        {busqueda.length > 0 && (<TouchableOpacity onPress={() => setBusqueda('')}><Ionicons name="close-circle" size={16} color={colors.textMuted} /></TouchableOpacity>)}
      </View>
      {grupos.length === 0
        ? <View style={ST.emptyState}><Ionicons name="people-outline" size={52} color={colors.borderSubtle} /><Text style={[ST.emptyTitle, { color: colors.textMuted }]}>{busqueda ? 'Sin resultados' : 'Sin colectas hoy'}</Text><Text style={[ST.emptySubtitle, { color: colors.textMuted }]}>{busqueda ? 'Probá con otro término.' : 'No hay colectas cargadas para hoy.'}</Text></View>
        : grupos.map((g, i) => <CardChoferAdmin key={g.nombre} grupo={g} index={i} />)
      }
      <View style={{ height: 32 }} />
    </ScrollView>
  );
};

// ─── ColectasScreen ───────────────────────────────────────────────────────────

export default function ColectasScreen() {
  const { colors } = useTheme();
  const toast = useToast();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [search, setSearch] = useState('');
  const [filtro, setFiltro] = useState<FiltroColecta>('todas');
  const [nombreUsuario, setNombre] = useState('');
  const [saludo] = useState(getSaludo);
  const [toggling, setToggling] = useState<Set<number | string>>(new Set());
  const [gpsStatus, setGpsStatus] = useState<'off' | 'foreground' | 'background' | 'denied'>('off');
  const [esAdmin, setEsAdmin] = useState(false);
  const emailUsuarioRef = useRef<string | null>(null);
  const userIdRef = useRef<string | null>(null);
  const esAdminRef = useRef(false);
  const [ordenandoGeo, setOrdenandoGeo] = useState(false);

  const ordenarPorCercania = async () => {
    if (clientes.length === 0) return;
    setOrdenandoGeo(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Permisos de GPS denegados.');
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const lat1 = location.coords.latitude;
      const lon1 = location.coords.longitude;

      const calculados = [];
      for (const c of clientes) {
        if (c.completado) {
          calculados.push({ ...c, distancia: 999999 });
          continue;
        }
        let lat2 = 0, lon2 = 0;
        if (c.direccion) {
          try {
            const res = await Location.geocodeAsync(c.direccion + ', Argentina');
            if (res.length > 0) { lat2 = res[0].latitude; lon2 = res[0].longitude; }
          } catch { }

          if (lat2 === 0 && ORS_API_KEY) {
            try {
               const res = await fetch(`${ORS_URL}?api_key=${ORS_API_KEY}&text=${encodeURIComponent(c.direccion)}&boundary.country=AR`);
               const payload = await res.json();
               if (payload.features?.length > 0) {
                  lon2 = payload.features[0].geometry.coordinates[0];
                  lat2 = payload.features[0].geometry.coordinates[1];
               }
            } catch {}
            await new Promise(r => setTimeout(r, 200));
          }
        }

        if (lat2 === 0) {
          calculados.push({ ...c, distancia: 999998 });
        } else {
          const R = 6371;
          const dLat = (lat2 - lat1) * (Math.PI / 180);
          const dLon = (lon2 - lon1) * (Math.PI / 180);
          const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
          const c_dist = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          calculados.push({ ...c, distancia: R * c_dist });
        }
      }

      const ordenados = calculados.sort((a, b) => a.distancia - b.distancia);
      setClientes(ordenados.map(({ distancia, ...c }) => c));
      setFiltro('pendientes');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success('Ruta optimizada por cercanía 📍');
    } catch (err: any) {
      Alert.alert('Error', err.message || 'No se pudo optimizar la ruta.');
    } finally {
      setOrdenandoGeo(false);
    }
  };

  const fetchClientes = useCallback(async (mostrarLoader = false) => {
    if (mostrarLoader) setCargando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { setCargando(false); setRefrescando(false); return; }
      emailUsuarioRef.current = user.email; userIdRef.current = user.id;
      esAdminRef.current = user.email === ADMIN_EMAIL; setEsAdmin(user.email === ADMIN_EMAIL);
      try {
        const { data: cd } = await supabase.from('Choferes').select('nombre').eq('email', user.email).maybeSingle();
        if (cd?.nombre) setNombre(cd.nombre.split(' ')[0]);
        else { const fb: string = user.user_metadata?.full_name || user.user_metadata?.name || user.email.split('@')[0]; setNombre(fb.split(' ')[0]); }
      } catch { const fb = user.user_metadata?.full_name || user.email.split('@')[0]; setNombre(fb.split(' ')[0]); }
      let query = supabase.from('Clientes').select('id, cliente, direccion, horario, chofer, completado, foto_url, firma_url, email_chofer').order('horario', { ascending: true });
      if (!esAdminRef.current) query = query.eq('email_chofer', user.email);
      const { data, error } = await query;
      if (error) throw error;
      setClientes(data || []);
    } catch (err) { console.error('Error cargando clientes:', err); }
    finally { setCargando(false); setRefrescando(false); }
  }, []);

  useEffect(() => {
    fetchClientes(true);
    const channel = supabase.channel('colectas-sync')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Clientes' }, (payload) => {
        const registro = payload.new as Cliente & { email_chofer?: string };
        const registroOld = payload.old as Cliente & { email_chofer?: string };
        setClientes(prev => prev.map(c => c.id === registro.id ? { ...c, ...registro } : c));
        if (esAdminRef.current) return;
        const idStr = String(registro.id);
        const ts = ignorarNotificacionesCache.get(idStr);
        if (ts !== undefined) { const edad = Date.now() - ts; ignorarNotificacionesCache.delete(idStr); if (edad < CACHE_TTL_MS) return; }
        const ev = registroOld.email_chofer?.trim() || '';
        const en = registro.email_chofer?.trim() || '';
        if (!en || en !== emailUsuarioRef.current) return;
        const esNueva = !ev && !!en;
        if (!esNueva && registro.completado === registroOld.completado) return;
        if (esNueva) { notificarCambioDesdecentral({ tipo: 'INSERT', clienteNombre: registro.cliente, clienteDireccion: registro.direccion }); return; }
        notificarCambioDesdecentral({ tipo: 'UPDATE', clienteNombre: registro.cliente, clienteDireccion: registro.direccion, nuevoEstado: registro.completado });
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Clientes' }, (payload) => {
        const registro = payload.new as Cliente & { email_chofer?: string };
        if (!esAdminRef.current && emailUsuarioRef.current && registro.email_chofer && registro.email_chofer !== emailUsuarioRef.current) return;
        setClientes(prev => { if (prev.some(c => c.id === registro.id)) return prev; return [...prev, registro].sort((a, b) => (a.horario || '').localeCompare(b.horario || '')); });
        if (!esAdminRef.current) notificarCambioDesdecentral({ tipo: 'INSERT', clienteNombre: registro.cliente, clienteDireccion: registro.direccion });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'Clientes' }, (payload) => {
        const eliminado = payload.old as { id: number | string; cliente?: string };
        setClientes(prev => prev.filter(c => c.id !== eliminado.id));
        if (!esAdminRef.current) notificarCambioDesdecentral({ tipo: 'DELETE', clienteNombre: eliminado.cliente });
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [fetchClientes]);

  useEffect(() => {
    let montado = true;
    const iniciarGPS = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email || !montado || user.email === ADMIN_EMAIL) return;
        const resultado = await startTracking(user.email);
        if (montado) setGpsStatus(resultado);
      } catch (err) { console.warn('[GPS]', err); if (montado) setGpsStatus('denied'); }
    };
    iniciarGPS();
    return () => { montado = false; stopTracking().catch(() => { }); };
  }, []);

  React.useEffect(() => {
    if (esAdmin) return;
    const chequear = () => { clientes.forEach(c => { if (!c.completado && c.email_chofer && colectaVencida(c.horario, c.completado)) void notificarColectaVencida(c.cliente, c.email_chofer); }); };
    chequear();
    const interval = setInterval(chequear, 60_000);
    return () => clearInterval(interval);
  }, [clientes, esAdmin]);

  const handleRefresh = () => { setRefrescando(true); fetchClientes(); };

  const handleToggle = async (id: number | string, actual: boolean, nombreCliente: string) => {
    const idStr = String(id); const nuevoEstado = !actual;
    ignorarNotificacionesCache.set(idStr, Date.now());
    setClientes(prev => prev.map(c => c.id === id ? { ...c, completado: nuevoEstado } : c));
    setToggling(prev => new Set(prev).add(id));
    try {
      const { error } = await supabase.from('Clientes').update({ completado: nuevoEstado }).eq('id', id);
      if (error) { console.error('[Colectas]', error.message); setClientes(prev => prev.map(c => c.id === id ? { ...c, completado: actual } : c)); ignorarNotificacionesCache.delete(idStr); return; }
      if (nuevoEstado) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        toast.success(`${nombreCliente} marcada como completada ✓`);
        if (userIdRef.current) void enviarMensajeAutoChatColecta(emailUsuarioRef.current!, nombreCliente || 'Sin nombre');
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        toast.info(`${nombreCliente} marcada como pendiente`);
      }
    } finally { setToggling(prev => { const next = new Set(prev); next.delete(id); return next; }); }
  };

  const totalHechas = clientes.filter(c => c.completado).length;
  const totalPendientes = clientes.length - totalHechas;
  const progreso = clientes.length > 0 ? totalHechas / clientes.length : 0;
  const filtrados = clientes.filter(c => {
    const matchSearch = (c.cliente || '').toLowerCase().includes(search.toLowerCase()) || (c.direccion || '').toLowerCase().includes(search.toLowerCase());
    const matchFiltro = filtro === 'todas' || (filtro === 'completadas' && c.completado) || (filtro === 'pendientes' && !c.completado);
    return matchSearch && matchFiltro;
  });

  if (cargando) return (
    <ScrollView style={[ST.container, { backgroundColor: colors.bg }]} contentContainerStyle={ST.content}
      scrollEnabled={false}>
      {[0, 1, 2, 3].map(i => <SkeletonColectaCard key={i} />)}
    </ScrollView>
  );

  if (esAdmin) return <VistaAdmin clientes={clientes} refrescando={refrescando} onRefresh={handleRefresh} />;

  return (
    <ScrollView style={[ST.container, { backgroundColor: colors.bg }]} contentContainerStyle={ST.content} showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refrescando} onRefresh={handleRefresh} tintColor={colors.blue} colors={[colors.blue]} />}>
      <View style={[ST.greetingBox, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <View style={ST.greetingTopRow}>
          <Text style={[ST.greetingEyebrow, { color: colors.blue }]}>COLECTAS DE HOY</Text>
          {gpsStatus !== 'off' && gpsStatus !== 'denied' && (
            <View style={[ST.gpsChip, gpsStatus === 'background' && ST.gpsChipBackground]}>
              <View style={ST.gpsDot} /><Text style={ST.gpsChipText}>GPS activo</Text>
            </View>
          )}
          {gpsStatus === 'denied' && (<View style={[ST.gpsChip, ST.gpsChipDenied]}><Ionicons name="location-outline" size={11} color="#F59E0B" /><Text style={[ST.gpsChipText, { color: '#F59E0B' }]}>GPS sin permiso</Text></View>)}
        </View>
        <Text style={[ST.greetingTitle, { color: colors.textPrimary }]}>{saludo}, {nombreUsuario || 'chofer'} 👋</Text>
        <Text style={[ST.greetingSubtitle, { color: colors.textMuted }]}>
          {clientes.length === 0 ? 'No tenés colectas asignadas hoy.' : totalPendientes === 0 ? '¡Todo completado! Excelente trabajo. ✅' : `Tenés ${totalPendientes} colecta${totalPendientes !== 1 ? 's' : ''} pendiente${totalPendientes !== 1 ? 's' : ''}.`}
        </Text>
      </View>

      <View style={[ST.statsRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        {[{ v: clientes.length, c: colors.textPrimary, l: 'Total' }, { v: totalHechas, c: '#34D399', l: 'Hechas' }, { v: totalPendientes, c: totalPendientes > 0 ? '#F59E0B' : '#6B7280', l: 'Pendientes' }].map((s, i) => (
          <View key={i} style={[ST.statBox, i > 0 && { borderLeftWidth: 1, borderRightWidth: i === 1 ? 1 : 0, borderColor: colors.border }]}>
            <Text style={[ST.statNum, { color: s.c }]}>{s.v}</Text>
            <Text style={[ST.statLabel, { color: colors.textMuted }]}>{s.l}</Text>
          </View>
        ))}
      </View>

      <View style={ST.progressWrap}>
        <View style={[ST.progressBg, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
          <Animated.View style={[ST.progressFill, { width: `${progreso * 100}%` as any }]} />
        </View>
        <Text style={[ST.progressLabel, { color: colors.textMuted }]}>{Math.round(progreso * 100)}% completado</Text>
      </View>

      <View style={[ST.searchRow, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Ionicons name="search-outline" size={16} color={colors.textMuted} style={{ marginRight: 10 }} />
        <TextInput style={[ST.searchInput, { color: colors.textPrimary }]} placeholder="Buscar cliente o dirección..." placeholderTextColor={colors.textPlaceholder} value={search} onChangeText={setSearch} />
        {search.length > 0 && (<TouchableOpacity onPress={() => setSearch('')}><Ionicons name="close-circle" size={16} color={colors.textMuted} /></TouchableOpacity>)}
      </View>

      {!esAdmin && (
        <TouchableOpacity 
          style={[ST.btnOptimization, { backgroundColor: colors.bgCard, borderColor: colors.blue }]} 
          onPress={ordenarPorCercania} 
          disabled={ordenandoGeo} 
          activeOpacity={0.7}
        >
          {ordenandoGeo ? <ActivityIndicator size="small" color={colors.blue} style={{ marginRight: 8 }} /> : <Ionicons name="location" size={16} color={colors.blue} style={{ marginRight: 8 }} />}
          <Text style={[ST.btnOptimizationText, { color: colors.blue }]}>{ordenandoGeo ? 'Calculando distancias...' : 'Optimizar ruta (Más cercano primero)'}</Text>
        </TouchableOpacity>
      )}

      <View style={ST.filtrosRow}>
        {([{ key: 'todas', label: 'Todas', count: clientes.length }, { key: 'pendientes', label: 'Pendientes', count: totalPendientes }, { key: 'completadas', label: 'Completadas', count: totalHechas }] as { key: FiltroColecta; label: string; count: number }[]).map(tab => (
          <TouchableOpacity key={tab.key} style={[ST.filtroBtn, { backgroundColor: colors.bgCard, borderColor: colors.border }, filtro === tab.key && { backgroundColor: colors.blueSubtle, borderColor: colors.blue }]} onPress={() => setFiltro(tab.key)}>
            <Text style={[ST.filtroText, { color: colors.textMuted }, filtro === tab.key && { color: colors.blue }]}>{tab.label}</Text>
            <View style={[ST.filtroCount, { backgroundColor: colors.bgInput }, filtro === tab.key && { backgroundColor: colors.blueSubtle }]}>
              <Text style={[ST.filtroCountText, { color: colors.textMuted }, filtro === tab.key && { color: colors.blue }]}>{tab.count}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {filtrados.length === 0 && clientes.length === 0
        ? <View style={ST.emptyState}><Ionicons name="bed-outline" size={52} color={colors.borderSubtle} /><Text style={[ST.emptyTitle, { color: colors.textMuted }]}>Hoy no tenés colectas asignadas.</Text><Text style={[ST.emptySubtitle, { color: colors.textMuted }]}>¡Buen descanso!</Text></View>
        : filtrados.length === 0
          ? <View style={ST.emptyState}><Ionicons name="search-outline" size={48} color={colors.borderSubtle} /><Text style={[ST.emptyTitle, { color: colors.textMuted }]}>Sin resultados</Text><Text style={[ST.emptySubtitle, { color: colors.textMuted }]}>Probá con otro filtro o búsqueda.</Text></View>
          : filtrados.map((c, i) => <ColectaCard key={c.id} item={c} index={i} onToggle={handleToggle} toggling={toggling.has(c.id)} />)
      }
      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─── Estilos estáticos ────────────────────────────────────────────────────────

const ST = StyleSheet.create({
  container: { flex: 1 }, content: { padding: 16 },
  loader: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loaderText: { fontSize: 13, fontWeight: '500' },
  statsRow: { flexDirection: 'row', borderRadius: 18, marginBottom: 14, borderWidth: 1, overflow: 'hidden' },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statNum: { fontSize: 22, fontWeight: '800' }, statLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
  progressWrap: { marginBottom: 14 },
  progressBg: { height: 6, borderRadius: 3, borderWidth: 1, marginBottom: 6, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#34D399', borderRadius: 3 },
  progressLabel: { fontSize: 11, fontWeight: '600', textAlign: 'right' },
  searchRow: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, borderWidth: 1, paddingHorizontal: 16, height: 48, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14 },
  btnOptimization: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1, marginBottom: 14 },
  btnOptimizationText: { fontSize: 13, fontWeight: '700' },
  filtrosRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filtroBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 12, borderWidth: 1 },
  filtroText: { fontSize: 12, fontWeight: '700' },
  filtroCount: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  filtroCountText: { fontSize: 11, fontWeight: '800' },
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { fontSize: 15, fontWeight: '700', textAlign: 'center' }, emptySubtitle: { fontSize: 13, fontWeight: '500' },
  greetingBox: { borderRadius: 18, padding: 20, marginBottom: 16, borderWidth: 1 },
  greetingTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  greetingEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase' },
  greetingTitle: { fontSize: 22, fontWeight: '800', marginBottom: 4, letterSpacing: -0.3 },
  greetingSubtitle: { fontSize: 13, fontWeight: '500' },
  gpsChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(52,211,153,0.10)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.25)', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4 },
  gpsChipBackground: { backgroundColor: 'rgba(52,211,153,0.15)', borderColor: 'rgba(52,211,153,0.40)' },
  gpsChipDenied: { backgroundColor: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.25)' },
  gpsDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399' },
  gpsChipText: { fontSize: 10, fontWeight: '700', color: '#34D399', letterSpacing: 0.3 },
  card: { flexDirection: 'row', borderRadius: 18, marginBottom: 10, borderWidth: 1, overflow: 'hidden' },
  accent: { width: 4 }, cardBody: { flex: 1, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  clienteNombre: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  horarioRow: { flexDirection: 'row', alignItems: 'center', gap: 5 }, horarioText: { fontSize: 13, fontWeight: '600' },
  checkWrap: { paddingLeft: 12, justifyContent: 'center', minWidth: 42 },
  addressTouchable: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6, marginTop: -2 },
  mapNavIconWrap: { borderRadius: 10, padding: 8, marginLeft: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  detailText: { flex: 1, fontSize: 12, fontWeight: '500', lineHeight: 18 },
  doneBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10, alignSelf: 'flex-start', backgroundColor: 'rgba(52,211,153,0.08)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.18)', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  doneBadgeText: { fontSize: 11, color: '#34D399', fontWeight: '700' },
  fotoContainer: { flex: 1 }, fotoLabel: { fontSize: 11, fontWeight: '600', marginBottom: 6 },
  fotoPreview: { width: '100%', height: 160, borderRadius: 12, borderWidth: 1 },
  fotoBtnSacar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, marginTop: 4 },
  fotoBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  fotoBtnReemplazar: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, alignSelf: 'flex-end' },
  fotoBtnReemplazarText: { fontSize: 11, fontWeight: '600' },
});

const ADM = StyleSheet.create({
  headerBox: { borderRadius: 20, padding: 20, marginBottom: 14, borderWidth: 1 },
  headerTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 },
  headerEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
  headerTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(245,158,11,0.1)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  adminBadgeText: { fontSize: 11, fontWeight: '700', color: '#F59E0B' },
  statsGlobales: { flexDirection: 'row', borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
  statGlobal: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statGlobalNum: { fontSize: 18, fontWeight: '800' },
  statGlobalLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },
  card: { borderRadius: 18, marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  avatarText: { fontSize: 15, fontWeight: '800' },
  choferNombre: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  progresoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progresoTexto: { fontSize: 12, fontWeight: '600' },
  pendienteBadge: { backgroundColor: 'rgba(245,158,11,0.12)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  pendienteBadgeText: { fontSize: 10, fontWeight: '700', color: '#F59E0B' },
  miniBarBg: { width: 64, height: 4, borderRadius: 2, overflow: 'hidden' },
  miniBarFill: { height: '100%', borderRadius: 2 },
  filasContainer: { paddingHorizontal: 16, paddingBottom: 12 },
  filasDivider: { height: 1, marginBottom: 10 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
  filaIndicador: { width: 3, height: 36, borderRadius: 2 },
  filaNombre: { fontSize: 13, fontWeight: '700', marginBottom: 3 },
  filaMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filaMetaText: { fontSize: 11, fontWeight: '500' }, filaMetaSep: { fontSize: 11 },
  badgeDone: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(52,211,153,0.08)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgeDoneText: { fontSize: 10, fontWeight: '700', color: '#34D399' },
  badgePendiente: { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  badgePendienteText: { fontSize: 10, fontWeight: '700', color: '#F59E0B' },
});