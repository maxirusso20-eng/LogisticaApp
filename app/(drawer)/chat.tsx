// app/(drawer)/chat.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import { Audio } from 'expo-av';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActionSheetIOS,
    ActivityIndicator,
    Alert,
    Animated,
    FlatList,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_NAME } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

// ─── Coordinadores ────────────────────────────────────────────────────────────
// Deben coincidir con los de la web (src/components/PantallaChat.jsx)
const COORDINADORES = [
    { id: 'maxi', nombre: 'Maxi', apellido: 'Russo', email: 'maxirusso20@gmail.com', rol: 'Coordinador General', color: '#3B82F6' },
    { id: 'fede', nombre: 'Fede', apellido: 'Avila', email: 'fedeavila@gmail.com', rol: 'Coordinador de Flota', color: '#8B5CF6' },
];

// Lista de emails de admins para detectar si el usuario actual es admin
const ADMIN_EMAILS = COORDINADORES.map(c => c.email);

// Valores exactos que espera la web para el campo `remitente`
const REMITENTE_ADMIN = 'Administración';

// ─── Compresión de imágenes ───────────────────────────────────────────────────
// Antes: quality:0.7 en el picker → cámara moderna = 2–6 MB por foto
// Ahora: resize a 1024px + JPEG 75% → ~150–300 KB (ahorro ~85% de storage)
async function comprimirImagen(uri: string): Promise<string> {
    try {
        const result = await ImageManipulator.manipulateAsync(
            uri,
            [{ resize: { width: 1024 } }],         // aspect ratio preservado
            { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
        );
        return result.uri;
    } catch {
        return uri; // fallback sin comprimir
    }
}

const uploadMediaToSupabase = async (uri: string, pathPrefix: string, type: string) => {
    try {
        // Comprimir antes de subir si es imagen
        const finalUri = type === 'image' ? await comprimirImagen(uri) : uri;
        const ext = type === 'image' ? 'jpg' : (finalUri.split('.').pop() || 'tmp');
        const fp = `${pathPrefix}_${Date.now()}.${ext}`;

        let contentType = 'application/octet-stream';
        if (type === 'image') contentType = 'image/jpeg';
        else if (type === 'audio') {
            // m4a es el formato típico de grabaciones de Expo
            if (ext === 'm4a' || ext === 'mp4') contentType = 'audio/m4a';
            else if (ext === 'mp3') contentType = 'audio/mpeg';
            else if (ext === 'wav') contentType = 'audio/wav';
            else contentType = `audio/${ext}`;
        } else if (type === 'document') contentType = `application/${ext}`;

        // ── FIX clave para React Native / Expo ─────────────────────────────
        // El patrón `await fetch(uri).blob()` devuelve un blob de 0 bytes en
        // RN/Expo. Hay que leer el archivo como base64 con FileSystem y
        // convertirlo a ArrayBuffer antes de subirlo.
        const base64 = await FileSystem.readAsStringAsync(finalUri, {
            encoding: 'base64',
        });
        const arrayBuffer = decode(base64);

        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            throw new Error('Archivo vacío después de leerlo');
        }

        const { error: ue } = await supabase.storage
            .from('chat-media')
            .upload(fp, arrayBuffer, { contentType, upsert: true });
        if (ue) throw ue;
        const { data: ud } = supabase.storage.from('chat-media').getPublicUrl(fp);
        return ud.publicUrl;
    } catch (e: any) {
        Alert.alert('Error de subida', e.message);
        return null;
    }
};

// ─── Push Notifications ───────────────────────────────────────────────────────

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true,
        shouldShowBanner: true, shouldShowList: true,
    }),
});

async function registrarPushToken(): Promise<string | null> {
    if (!Device.isDevice) return null;
    const { status: existente } = await Notifications.getPermissionsAsync();
    let finalStatus = existente;
    if (existente !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('chat', {
            name: 'Mensajes de Chat',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#4F8EF7',
            sound: 'default',
        });
    }
    try {
        const projectId = Constants.expoConfig?.extra?.eas?.projectId;
        if (!projectId) return null;
        const token = await Notifications.getExpoPushTokenAsync({ projectId });
        return token.data;
    } catch (err) {
        console.warn('[Push] Error obteniendo token:', err);
        return null;
    }
}

async function guardarTokenEnBD(email: string, token: string, esAdmin: boolean): Promise<void> {
    try {
        if (esAdmin) {
            await supabase.from('Admins').upsert({ email, push_token: token }, { onConflict: 'email' });
        } else {
            await supabase.from('Choferes').update({ push_token: token }).eq('email', email);
        }
    } catch (err) { console.warn('[Push] Error guardando token:', err); }
}

async function enviarPush(token: string, titulo: string, cuerpo: string, data: object): Promise<void> {
    try {
        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                to: token, title: titulo,
                body: cuerpo.length > 100 ? cuerpo.slice(0, 97) + '...' : cuerpo,
                sound: 'default', data, channelId: 'chat',
            }),
        });
    } catch (err) { console.warn('[Push] Error enviando:', err); }
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

const TYPING_TIMEOUT_MS = 2500;

interface Mensaje {
    id: number; created_at: string; user_id: string; remitente: string;
    texto: string; chofer_email: string; admin_id?: string; visto_admin: boolean;
    visto_chofer?: boolean; estado?: string;
    media_url?: string; media_type?: 'audio' | 'image' | 'document' | null;
}

interface Conversacion {
    email: string; nombre: string; ultimoMensaje: string;
    ultimaHora: string; noLeidos: number; online: boolean;
}

interface Coordinador {
    id: string; nombre: string; apellido: string; email: string; rol: string; color: string;
}

// Nombre "lindo" desde el email (para admins/subadmins sin ficha de chofer).
const prettyNombre = (email: string): string => {
    const base = (email.split('@')[0] || '').replace(/[._-]+/g, ' ').replace(/\d+/g, '').trim();
    const pretty = base.split(' ').filter(Boolean).map(w => (w[0]?.toUpperCase() || '') + w.slice(1)).join(' ');
    return pretty || email;
};
const COLORES_EQUIPO = ['#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#06B6D4', '#EF4444'];
const colorFromEmail = (email: string): string => {
    let h = 0; for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
    return COLORES_EQUIPO[h % COLORES_EQUIPO.length];
};

// Equipo con el que el chofer puede chatear: admins (hardcodeados) + subadmins
// de roles_usuarios (dinámico, igual que la web). Nombres desde Choferes si tienen ficha.
async function cargarEquipo(): Promise<Coordinador[]> {
    const { data: roles } = await supabase.from('roles_usuarios').select('email, rol');
    const rolPorEmail = new Map<string, string>();
    for (const e of ADMIN_EMAILS) rolPorEmail.set(e.toLowerCase(), 'Admin');
    for (const r of roles || []) {
        const rol = (r.rol || '').toLowerCase();
        if ((rol === 'admin' || rol === 'subadmin') && r.email) rolPorEmail.set(r.email.toLowerCase(), rol === 'admin' ? 'Admin' : 'Equipo');
    }
    const lista = [...rolPorEmail.keys()];
    const { data: chs } = await supabase.from('Choferes').select('nombre, email').in('email', lista);
    const nombreMap = new Map<string, string>();
    for (const c of chs || []) if (c.email) nombreMap.set(c.email.toLowerCase(), c.nombre || '');
    return lista.map(email => {
        const nombreFull = nombreMap.get(email) || prettyNombre(email);
        const partes = nombreFull.split(' ');
        return {
            id: email, email, nombre: partes[0] || nombreFull, apellido: partes.slice(1).join(' '),
            rol: rolPorEmail.get(email) || 'Equipo', color: colorFromEmail(email),
        } as Coordinador;
    }).sort((a, b) => a.nombre.localeCompare(b.nombre));
}

// ─── Helpers de formato ───────────────────────────────────────────────────────

const formatHora = (iso: string): string => {
    try {
        const d = new Date(iso), hoy = new Date();
        if (d.toDateString() === hoy.toDateString())
            return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    } catch { return ''; }
};

const formatFechaGrupo = (iso: string): string => {
    try {
        const d = new Date(iso), hoy = new Date();
        const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
        if (d.toDateString() === hoy.toDateString()) return 'Hoy';
        if (d.toDateString() === ayer.toDateString()) return 'Ayer';
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long' });
    } catch { return ''; }
};

const necesitaSeparador = (msgs: Mensaje[], index: number): boolean => {
    if (index === msgs.length - 1) return true;
    return new Date(msgs[index].created_at).toDateString() !==
        new Date(msgs[index + 1].created_at).toDateString();
};

const iniciales = (nombre: string): string =>
    nombre.split(' ').map(p => p[0] || '').slice(0, 2).join('').toUpperCase();

// ─── SeparadorFecha ───────────────────────────────────────────────────────────

const SeparadorFecha: React.FC<{ fecha: string }> = ({ fecha }) => {
    const { colors } = useTheme();
    return (
        <View style={SS.separadorWrapper}>
            <View style={[SS.separadorLinea, { backgroundColor: colors.borderSubtle }]} />
            <Text style={[SS.separadorTexto, { color: colors.textMuted }]}>{fecha}</Text>
            <View style={[SS.separadorLinea, { backgroundColor: colors.borderSubtle }]} />
        </View>
    );
};

// ─── IndicadorEscribiendo ─────────────────────────────────────────────────────

const IndicadorEscribiendo: React.FC<{ nombre: string }> = ({ nombre }) => {
    const { colors } = useTheme();
    const dot1 = useRef(new Animated.Value(0.3)).current;
    const dot2 = useRef(new Animated.Value(0.3)).current;
    const dot3 = useRef(new Animated.Value(0.3)).current;
    useEffect(() => {
        const animar = (dot: Animated.Value, delay: number) =>
            Animated.loop(Animated.sequence([
                Animated.delay(delay),
                Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
                Animated.delay(600),
            ])).start();
        animar(dot1, 0); animar(dot2, 200); animar(dot3, 400);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <View style={SS.typingWrapper}>
            <View style={[SS.typingBurbuja, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Text style={[SS.typingNombre, { color: colors.textMuted }]}>{nombre} está escribiendo</Text>
                <View style={SS.typingDots}>
                    {[dot1, dot2, dot3].map((dot, i) => (
                        <Animated.View key={i} style={[SS.typingDot, { backgroundColor: colors.blue, opacity: dot }]} />
                    ))}
                </View>
            </View>
        </View>
    );
};

// ─── Burbuja ──────────────────────────────────────────────────────────────────

const Burbuja: React.FC<{
    mensaje: Mensaje; esPropio: boolean; mostrarRemitente: boolean;
}> = ({ mensaje, esPropio, mostrarRemitente }) => {
    const { colors, isDark } = useTheme();
    const [sound, setSound] = useState<Audio.Sound | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [audioStatus, setAudioStatus] = useState<any>(null);

    useEffect(() => { return () => { sound?.unloadAsync(); }; }, [sound]);

    const handlePlayAudio = async () => {
        if (sound) {
            if (isPlaying) { await sound.pauseAsync(); setIsPlaying(false); }
            else { await sound.playAsync(); setIsPlaying(true); }
        } else {
            if (!mensaje.media_url) return;
            const { sound: ns } = await Audio.Sound.createAsync(
                { uri: mensaje.media_url }, { shouldPlay: true },
                (s) => { setAudioStatus(s); if (s.isLoaded) { setIsPlaying(s.isPlaying); if (s.didJustFinish) setIsPlaying(false); } }
            );
            setSound(ns);
        }
    };

    const fmtAudio = (ms?: number) => {
        if (!ms) return '0:00';
        const s = Math.floor(ms / 1000), m = Math.floor(s / 60);
        return `${m}:${(s % 60) < 10 ? '0' : ''}${s % 60}`;
    };

    if (mensaje.texto.startsWith('🔔') || mensaje.texto.startsWith('⚠️') || mensaje.remitente === 'Sistema' || mensaje.remitente === '🤖 Sistema') {
        return (
            <View style={SS.sistemaWrapper}>
                <View style={SS.sistemaBurbuja}>
                    <Text style={SS.sistemaTexto}>{mensaje.texto}</Text>
                    <Text style={[SS.sistemaHora, { color: colors.textMuted }]}>{formatHora(mensaje.created_at)}</Text>
                </View>
            </View>
        );
    }

    return (
        <View style={[SS.burbujaWrapper, esPropio ? SS.burbujaRight : SS.burbujaLeft]}>
            {!esPropio && mostrarRemitente && (
                <Text style={[SS.remitente, { color: colors.blue }]}>{(mensaje.remitente || '').includes('@') ? prettyNombre(mensaje.remitente) : mensaje.remitente}</Text>
            )}
            <View style={[SS.burbuja,
            esPropio
                ? SS.burbujaPropia
                : { backgroundColor: isDark ? '#0D1526' : '#FFFFFF', borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 4 }
            ]}>
                {mensaje.media_type === 'image' && !!mensaje.media_url && (
                    <Image source={{ uri: mensaje.media_url }}
                        style={{ width: 220, height: 220, borderRadius: 12, marginBottom: 8, backgroundColor: 'rgba(0,0,0,0.1)' }}
                        contentFit="cover" />
                )}
                {mensaje.media_type === 'document' && !!mensaje.media_url && (
                    <TouchableOpacity onPress={() => Linking.openURL(mensaje.media_url!)}
                        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: esPropio ? 'rgba(255,255,255,0.15)' : colors.bgInput, padding: 12, borderRadius: 12, marginBottom: 6, gap: 10 }}>
                        <Ionicons name="document-text" size={26} color={esPropio ? '#fff' : colors.blue} />
                        <Text style={{ flex: 1, fontSize: 13, color: esPropio ? '#fff' : colors.textPrimary, fontWeight: '500' }} numberOfLines={1}>{mensaje.texto}</Text>
                    </TouchableOpacity>
                )}
                {mensaje.media_type === 'audio' && !!mensaje.media_url && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minWidth: 160, paddingBottom: 6 }}>
                        <TouchableOpacity onPress={handlePlayAudio}
                            style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: esPropio ? 'rgba(255,255,255,0.2)' : colors.blueSubtle, justifyContent: 'center', alignItems: 'center' }}>
                            <Ionicons name={isPlaying ? 'pause' : 'play'} size={20} color={esPropio ? '#fff' : colors.blue} style={isPlaying ? {} : { marginLeft: 3 }} />
                        </TouchableOpacity>
                        <View style={{ flex: 1 }}>
                            <View style={{ height: 4, backgroundColor: esPropio ? 'rgba(255,255,255,0.3)' : colors.border, borderRadius: 2, overflow: 'hidden' }}>
                                <View style={{ height: '100%', width: audioStatus?.isLoaded && audioStatus.durationMillis ? `${(audioStatus.positionMillis / audioStatus.durationMillis) * 100}%` : '0%', backgroundColor: esPropio ? '#fff' : colors.blue, borderRadius: 2 }} />
                            </View>
                            <Text style={{ fontSize: 10, color: esPropio ? 'rgba(255,255,255,0.7)' : colors.textMuted, marginTop: 4, fontWeight: '600' }}>
                                {audioStatus?.isLoaded ? fmtAudio(audioStatus.positionMillis) : fmtAudio(audioStatus?.durationMillis)}
                            </Text>
                        </View>
                    </View>
                )}
                {(!mensaje.media_type || mensaje.media_type === 'image') && (
                    <Text style={[SS.burbujaTexto, esPropio ? SS.textoPropio : { color: colors.textPrimary }]}>
                        {mensaje.texto}
                    </Text>
                )}
                <View style={[SS.burbujaFooter, (mensaje.media_type === 'audio' || mensaje.media_type === 'document') && { marginTop: 0 }]}>
                    <Text style={[SS.hora, esPropio ? SS.horaPropia : { color: colors.textMuted }]}>
                        {formatHora(mensaje.created_at)}
                    </Text>
                    {esPropio && (
                        <View style={SS.ticks}>
                            {mensaje.visto_admin ? (
                                <>
                                    <Ionicons name="checkmark" size={12} color="#60AEFF" style={{ marginRight: -5 }} />
                                    <Ionicons name="checkmark" size={12} color="#60AEFF" />
                                </>
                            ) : (
                                <Ionicons name="checkmark" size={12} color="rgba(255,255,255,0.4)" />
                            )}
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
};

// ─── ListaConversaciones ──────────────────────────────────────────────────────
// MEJORA CLAVE: de 201 queries a 2 queries planas
// Se usa la función Postgres get_conversaciones_admin() que hace todo en 1 query.
// Ver mejoras.sql para crear la función.

const ListaConversaciones: React.FC<{ miEmail: string; onAbrir: (conv: Conversacion) => void }> = ({ miEmail, onAbrir }) => {
    const { colors } = useTheme();
    const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
    const [cargando, setCargando] = useState(true);
    const canalRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    const cargar = useCallback(async () => {
        try {
            // Query 1: lista de choferes
            const { data: chofData } = await supabase
                .from('Choferes')
                .select('email, nombre')
                .not('email', 'is', null)
                .neq('email', '')
                .order('nombre', { ascending: true });
            if (!chofData?.length) { setCargando(false); return; }

            // Query 2: último mensaje + no leídos SOLO de conversaciones con este admin
            // Intenta usar la función Postgres nueva con filtro por admin_email.
            // Si todavía no fue creada, cae al fallback con query manual.
            let convData: any[] | null = null;
            const rpcRes = await supabase.rpc('get_conversaciones_admin_v2', { admin_email: miEmail });
            if (!rpcRes.error) convData = rpcRes.data;
            else {
                // Fallback: query manual filtrando por admin_id
                const { data } = await supabase
                    .from('mensajes')
                    .select('chofer_email, texto, created_at, media_type, visto_admin, remitente')
                    .eq('admin_id', miEmail)
                    .order('created_at', { ascending: false })
                    .limit(500);
                // Reducir a último mensaje por chofer + contar no leídos
                const map = new Map<string, any>();
                (data || []).forEach((m: any) => {
                    if (!map.has(m.chofer_email)) {
                        map.set(m.chofer_email, {
                            chofer_email: m.chofer_email,
                            ultimo_texto: m.texto,
                            ultimo_created_at: m.created_at,
                            ultimo_media_type: m.media_type,
                            no_leidos: 0,
                        });
                    }
                    if (!m.visto_admin && m.remitente !== REMITENTE_ADMIN) {
                        map.get(m.chofer_email).no_leidos++;
                    }
                });
                convData = Array.from(map.values());
            }

            // Combinar en memoria con Map → O(n), no O(n²)
            const convMap = new Map<string, any>();
            (convData || []).forEach((r: any) => convMap.set(r.chofer_email, r));

            const lista: Conversacion[] = chofData.map((c: any) => {
                const email = (c.email || '').trim() || `SIN_MAIL_${c.nombre}`;
                const conv = convMap.get(email);
                let ultimoMensaje = conv?.ultimo_texto ?? 'Sin mensajes aún';
                if (conv?.ultimo_media_type === 'audio') ultimoMensaje = '🎙️ Nota de voz';
                else if (conv?.ultimo_media_type === 'image') ultimoMensaje = '📷 Foto';
                else if (conv?.ultimo_media_type === 'document') ultimoMensaje = '📄 Adjunto';
                return {
                    email, nombre: c.nombre || email,
                    ultimoMensaje,
                    ultimaHora: conv?.ultimo_created_at ?? '',
                    noLeidos: Number(conv?.no_leidos ?? 0),
                    online: false,
                };
            });

            const conMensajes = lista
                .filter(c => c.ultimaHora !== '')
                .sort((a, b) => b.noLeidos !== a.noLeidos
                    ? b.noLeidos - a.noLeidos
                    : b.ultimaHora.localeCompare(a.ultimaHora));
            setConversaciones(conMensajes);
        } catch (err) { console.error('[Chat Admin] Error:', err); }
        finally { setCargando(false); }
    }, [miEmail]);

    useEffect(() => {
        cargar();

        // Canal con nombre único distinto al badge del drawer (evita duplicado)
        if (canalRef.current) void supabase.removeChannel(canalRef.current);
        canalRef.current = supabase
            .channel('admin-chat-lista-v2')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, () => cargar())
            .subscribe();

        if (presenceRef.current) void supabase.removeChannel(presenceRef.current);
        const presence = supabase.channel('chat-global-presence');
        presence.on('presence', { event: 'sync' }, () => {
            const emails = new Set(Object.keys(presence.presenceState()));
            setConversaciones(prev => prev.map(c => ({ ...c, online: emails.has(c.email) })));
        }).subscribe();
        presenceRef.current = presence;

        return () => {
            if (canalRef.current) { void supabase.removeChannel(canalRef.current); canalRef.current = null; }
            if (presenceRef.current) { void supabase.removeChannel(presenceRef.current); presenceRef.current = null; }
        };
    }, [cargar]);

    if (cargando) return (
        <View style={[SS.loader, { backgroundColor: colors.bg }]}>
            <ActivityIndicator size="large" color={colors.blue} />
            <Text style={[SS.loaderText, { color: colors.textMuted }]}>Cargando conversaciones...</Text>
        </View>
    );

    if (!conversaciones.length) return (
        <View style={[SS.vacio, { backgroundColor: colors.bg }]}>
            <Ionicons name="chatbubbles-outline" size={52} color={colors.borderSubtle} />
            <Text style={[SS.vacioTitulo, { color: colors.textMuted }]}>Sin choferes disponibles</Text>
            <Text style={[SS.vacioSub, { color: colors.textMuted }]}>
                {'Para chatear con un chofer:\n1. Cargá su email en tabla Choferes\n2. Creá el usuario en Authentication'}
            </Text>
        </View>
    );

    return (
        <FlatList
            data={conversaciones}
            keyExtractor={c => c.email}
            style={{ backgroundColor: colors.bg }}
            contentContainerStyle={{ paddingTop: 8 }}
            renderItem={({ item }) => (
                <Pressable
                    style={({ pressed }) => [SS.convItem, { backgroundColor: colors.bg }, pressed && { opacity: 0.75 }]}
                    onPress={() => onAbrir(item)}
                >
                    <View style={SS.convAvatarWrap}>
                        <View style={[SS.convAvatar, { backgroundColor: colors.bgCard, borderColor: colors.border },
                        item.noLeidos > 0 && { borderColor: colors.blue, borderWidth: 2, backgroundColor: colors.blueSubtle }]}>
                            <Text style={[SS.convAvatarText, { color: colors.blue }]}>{iniciales(item.nombre)}</Text>
                        </View>
                        {item.online && <View style={[SS.onlineDot, { borderColor: colors.bg }]} />}
                    </View>
                    <View style={SS.convInfo}>
                        <View style={SS.convTopRow}>
                            <Text style={[SS.convNombreItem, { color: item.noLeidos > 0 ? colors.textPrimary : colors.textSecondary },
                            item.noLeidos > 0 && { fontWeight: '700' }]} numberOfLines={1}>
                                {item.nombre}
                            </Text>
                            <Text style={[SS.convHora, { color: item.noLeidos > 0 ? colors.blue : colors.textMuted }]}>
                                {item.ultimaHora ? formatHora(item.ultimaHora) : ''}
                            </Text>
                        </View>
                        <View style={SS.convBottomRow}>
                            <Text style={[SS.convUltimoMsg, { color: item.noLeidos > 0 ? colors.textPrimary : colors.textMuted },
                            item.noLeidos > 0 && { fontWeight: '600' }]} numberOfLines={1}>
                                {item.ultimoMensaje.startsWith('🔔') ? '📦 ' + item.ultimoMensaje.slice(2) : item.ultimoMensaje}
                            </Text>
                            {item.noLeidos > 0 && (
                                <View style={[SS.badge, { backgroundColor: colors.blue }]}>
                                    <Text style={SS.badgeText}>{item.noLeidos > 99 ? '99+' : item.noLeidos}</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={[SS.convSeparador, { backgroundColor: colors.borderSubtle }]} />}
        />
    );
};

// ─── ConversacionView ─────────────────────────────────────────────────────────

const ConversacionView: React.FC<{
    miUserId: string; miEmail: string; miNombre: string; esAdmin: boolean;
    choferEmail: string; choferNombre: string; adminEmail: string; onVolver?: () => void;
}> = ({ miUserId, miEmail, miNombre, esAdmin, choferEmail, choferNombre, adminEmail, onVolver }) => {
    const { colors } = useTheme();
    const insets = useSafeAreaInsets();
    const [mensajes, setMensajes] = useState<Mensaje[]>([]);
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [online, setOnline] = useState(false);
    const [otroEscribiendo, setOtroEscribiendo] = useState(false);
    const [nombreEscribiendo, setNombreEscribiendo] = useState('');
    const [recording, setRecording] = useState<Audio.Recording | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [subiendoMedia, setSubiendoMedia] = useState(false);
    const [keyboardPad, setKeyboardPad] = useState(0);
    const inputRef = useRef<TextInput>(null);
    const msgCanalRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const presenceCanalRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const estabaTypingRef = useRef(false);

    const fetchMensajes = useCallback(async () => {
        const { data } = await supabase
            .from('mensajes')
            .select('id, created_at, user_id, remitente, texto, chofer_email, admin_id, visto_admin, visto_chofer, estado, media_url, media_type')
            .eq('chofer_email', choferEmail)
            .eq('admin_id', adminEmail)
            .order('created_at', { ascending: false })
            .limit(50);
        setMensajes(data ?? []);
    }, [choferEmail, adminEmail]);

    const marcarVisto = useCallback(async () => {
        if (esAdmin) {
            await supabase.from('mensajes')
                .update({ visto_admin: true })
                .eq('chofer_email', choferEmail)
                .eq('admin_id', adminEmail)
                .eq('visto_admin', false)
                .neq('remitente', REMITENTE_ADMIN);
        } else {
            await supabase.from('mensajes')
                .update({ visto_chofer: true })
                .eq('chofer_email', choferEmail)
                .eq('admin_id', adminEmail)
                .eq('visto_chofer', false)
                .eq('remitente', REMITENTE_ADMIN);
        }
    }, [esAdmin, choferEmail, adminEmail]);

    useEffect(() => {
        fetchMensajes();
        marcarVisto();
        if (msgCanalRef.current) void supabase.removeChannel(msgCanalRef.current);
        const canal = supabase
            .channel(`msgs-${choferEmail.replace(/[@.]/g, '-')}-${adminEmail.replace(/[@.]/g, '-')}`)
            .on('postgres_changes', {
                event: 'INSERT', schema: 'public', table: 'mensajes',
                filter: `chofer_email=eq.${choferEmail}`,
            }, (payload) => {
                const nuevo = payload.new as Mensaje;
                // Filtro extra en cliente: solo mensajes de esta conversación con este admin
                if (nuevo.admin_id !== adminEmail) return;
                setMensajes(prev => prev.some(m => m.id === nuevo.id) ? prev : [nuevo, ...prev]);
                if (esAdmin) marcarVisto();
            })
            .on('postgres_changes', {
                event: 'UPDATE', schema: 'public', table: 'mensajes',
                filter: `chofer_email=eq.${choferEmail}`,
            }, (payload) => {
                const upd = payload.new as Mensaje;
                if (upd.admin_id !== adminEmail) return;
                setMensajes(prev => prev.map(m => m.id === upd.id ? { ...m, visto_admin: upd.visto_admin } : m));
            })
            .subscribe();
        msgCanalRef.current = canal;
        return () => { if (msgCanalRef.current) { void supabase.removeChannel(msgCanalRef.current); msgCanalRef.current = null; } };
    }, [choferEmail, adminEmail, fetchMensajes, esAdmin, marcarVisto]);

    useEffect(() => {
        if (presenceCanalRef.current) void supabase.removeChannel(presenceCanalRef.current);
        const canalId = `presence-${choferEmail.replace(/[@.]/g, '-')}-${adminEmail.replace(/[@.]/g, '-')}`;
        const canal = supabase.channel(canalId, { config: { presence: { key: miEmail } } });
        canal
            .on('presence', { event: 'sync' }, () => {
                const emails = Object.keys(canal.presenceState());
                setOnline(emails.includes(esAdmin ? choferEmail : adminEmail));
            })
            .on('broadcast', { event: 'typing' }, (payload) => {
                const { email: em, nombre: nom, escribiendo } = payload.payload as any;
                if (em === miEmail) return;
                setOtroEscribiendo(escribiendo);
                setNombreEscribiendo(escribiendo ? nom : '');
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED')
                    await canal.track({ email: miEmail, nombre: miNombre, at: new Date().toISOString() });
            });
        presenceCanalRef.current = canal;
        return () => {
            if (presenceCanalRef.current) {
                void presenceCanalRef.current.untrack();
                void supabase.removeChannel(presenceCanalRef.current);
                presenceCanalRef.current = null;
            }
        };
    }, [choferEmail, adminEmail, miEmail, miNombre, esAdmin]);

    const emitirTyping = (escribiendo: boolean) => {
        presenceCanalRef.current?.send({ type: 'broadcast', event: 'typing', payload: { email: miEmail, nombre: miNombre, escribiendo } });
    };

    const handleChangeText = (val: string) => {
        setTexto(val);
        if (!estabaTypingRef.current) { estabaTypingRef.current = true; emitirTyping(true); }
        if (typingRef.current) clearTimeout(typingRef.current);
        typingRef.current = setTimeout(() => { estabaTypingRef.current = false; emitirTyping(false); }, TYPING_TIMEOUT_MS);
    };

    const empezarGrabacion = async () => {
        // Guard: si ya hay una grabación activa, no arrancar otra
        if (recording || isRecording) {
            console.warn('[Audio] Ya hay una grabación en curso, ignoro');
            return;
        }
        try {
            const { status } = await Audio.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permiso denegado', 'Necesitamos acceso al micrófono para grabar.');
                return;
            }
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

            // Limpiar cualquier recording huérfano por las dudas (no debería haber por el guard,
            // pero si el componente se re-montó, el SDK puede estar con un objeto colgado)
            try {
                const r = new Audio.Recording();
                await r.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
                await r.startAsync();
                setRecording(r);
                setIsRecording(true);
            } catch (innerErr: any) {
                // Si falla por "Only one Recording object can be prepared", intentar limpiar y reintentar una vez
                if (String(innerErr?.message || '').toLowerCase().includes('only one recording')) {
                    console.warn('[Audio] Recording colgado, limpio y reintento');
                    // No hay una API oficial para limpiar el huérfano; lo mejor es forzar el modo y esperar
                    await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
                    await new Promise(res => setTimeout(res, 300));
                    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
                    const r2 = new Audio.Recording();
                    await r2.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
                    await r2.startAsync();
                    setRecording(r2);
                    setIsRecording(true);
                } else {
                    throw innerErr;
                }
            }
        } catch (err: any) {
            console.error('[Audio] Error al iniciar grabación:', err);
            setRecording(null);
            setIsRecording(false);
            Alert.alert('Error', 'No se pudo iniciar la grabación. Probá de nuevo.');
        }
    };

    const detenerGrabacion = async (cancelar = false) => {
        if (!recording) { setIsRecording(false); return; }
        setIsRecording(false);
        const rec = recording;
        setRecording(null);  // liberar el state antes de operaciones async
        try {
            await rec.stopAndUnloadAsync();
            const uri = rec.getURI();
            if (!cancelar && uri) await handleEnviarMedia(uri, 'audio', '🎙️ Nota de voz');
        } catch (err) {
            console.error('[Audio] Error al detener grabación:', err);
        } finally {
            try { await Audio.setAudioModeAsync({ allowsRecordingIOS: false }); } catch { }
        }
    };

    // Liberar grabación si el componente se desmonta o cambia de chat
    useEffect(() => {
        return () => {
            if (recording) {
                recording.stopAndUnloadAsync().catch(() => { });
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleAdjuntar = () => {
        const accion = async (i: number) => {
            if (i === 0) {
                const { status } = await ImagePicker.requestCameraPermissionsAsync();
                if (status !== 'granted') { Alert.alert('Permiso denegado', 'Cámara necesaria.'); return; }
                // quality:1 → comprimirImagen() se encarga del resize
                const r = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
                if (!r.canceled && r.assets[0]) await handleEnviarMedia(r.assets[0].uri, 'image', '📷 Foto adjunta');
            } else if (i === 1) {
                const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1 });
                if (!r.canceled && r.assets[0]) await handleEnviarMedia(r.assets[0].uri, 'image', '📷 Foto adjunta');
            } else if (i === 2) {
                const r = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
                if (!r.canceled && r.assets[0]) await handleEnviarMedia(r.assets[0].uri, 'document', r.assets[0].name || '📄 Documento');
            }
        };
        const opts = ['Cámara', 'Galería de fotos', 'Documento', 'Cancelar'];
        if (Platform.OS === 'ios') ActionSheetIOS.showActionSheetWithOptions({ options: opts, cancelButtonIndex: 3 }, accion);
        else Alert.alert('Adjuntar', 'Seleccioná el origen', [
            { text: 'Cámara', onPress: () => accion(0) },
            { text: 'Galería de fotos', onPress: () => accion(1) },
            { text: 'Documento', onPress: () => accion(2) },
            { text: 'Cancelar', style: 'cancel' },
        ]);
    };

    const handleEnviarMedia = async (uri: string, mType: 'audio' | 'image' | 'document', pseudoTexto: string) => {
        setSubiendoMedia(true);
        try {
            const url = await uploadMediaToSupabase(uri, miUserId, mType);
            if (!url) return;
            const { error } = await supabase.from('mensajes').insert([{
                user_id: miUserId, remitente: esAdmin ? REMITENTE_ADMIN : miNombre,
                texto: pseudoTexto, chofer_email: choferEmail, admin_id: adminEmail,
                media_url: url, media_type: mType,
                visto_admin: esAdmin, visto_chofer: !esAdmin, estado: 'enviado',
            }]);
            if (error) throw error;
            void pushDestino(esAdmin, choferEmail, miNombre, choferNombre, pseudoTexto);
        } catch (e: any) { Alert.alert('Error', e.message); }
        finally { setSubiendoMedia(false); }
    };

    // Helper: obtener token destino y enviar push sin bloquear la UI
    const pushDestino = async (admin: boolean, cEmail: string, mNom: string, cNom: string, txt: string) => {
        try {
            const tokenDest = admin
                ? (await supabase.from('Choferes').select('push_token').eq('email', cEmail).maybeSingle()).data?.push_token
                : (await supabase.from('Admins').select('push_token').eq('email', adminEmail).maybeSingle()).data?.push_token;
            if (tokenDest) await enviarPush(tokenDest, `💬 ${admin ? 'Admin' : mNom}`, txt, { tipo: 'CHAT', chofer_email: cEmail, chofer_nombre: admin ? cNom : mNom, admin_email: adminEmail });
        } catch (err) { console.warn('[Push]', err); }
    };

    const handleEnviar = async () => {
        const txt = texto.trim();
        if (!txt || enviando) return;
        if (typingRef.current) clearTimeout(typingRef.current);
        estabaTypingRef.current = false;
        emitirTyping(false);
        setEnviando(true);
        setTexto('');
        try {
            const { error } = await supabase.from('mensajes').insert([{
                user_id: miUserId, remitente: esAdmin ? REMITENTE_ADMIN : miNombre,
                texto: txt, chofer_email: choferEmail, admin_id: adminEmail,
                visto_admin: esAdmin, visto_chofer: !esAdmin, estado: 'enviado',
            }]);
            if (error) { setTexto(txt); console.error('[Chat] Error:', error.message); return; }
            void pushDestino(esAdmin, choferEmail, miNombre, choferNombre, txt);
        } catch { setTexto(txt); }
        finally { setEnviando(false); inputRef.current?.focus(); }
    };
    // ── Keyboard listener para Android (KAV no funciona bien dentro del Drawer) ──
    useEffect(() => {
        if (Platform.OS !== 'android') return;
        const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardPad(e.endCoordinates.height));
        const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardPad(0));
        return () => { show.remove(); hide.remove(); };
    }, []);

    const chatWrapper = Platform.OS === 'ios'
        ? { Component: KeyboardAvoidingView, props: { behavior: 'padding' as const, keyboardVerticalOffset: 90 } }
        : { Component: View, props: {} };

    return (
        <chatWrapper.Component
            style={{ flex: 1, backgroundColor: colors.bg }}
            {...chatWrapper.props}
        >
            <View style={[SS.chatHeader, { backgroundColor: colors.bgCard, borderBottomColor: colors.borderSubtle }]}>
                {onVolver && (
                    <TouchableOpacity onPress={onVolver} style={SS.btnVolver} activeOpacity={0.7}>
                        <Ionicons name="arrow-back" size={22} color={colors.blue} />
                    </TouchableOpacity>
                )}
                <View style={SS.chatAvatarWrap}>
                    <View style={[SS.chatAvatar, { backgroundColor: colors.blueSubtle, borderColor: `${colors.blue}40` }]}>
                        {esAdmin
                            ? <Text style={[SS.chatAvatarText, { color: colors.blue }]}>{iniciales(choferNombre)}</Text>
                            : <Ionicons name="person-outline" size={16} color={colors.blue} />
                        }
                    </View>
                    {online && <View style={[SS.onlineDot, { borderColor: colors.bgCard }]} />}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[SS.chatNombre, { color: colors.textPrimary }]}>
                        {choferNombre}
                    </Text>
                    <Text style={[SS.chatSub, { color: colors.textMuted }]}>
                        {otroEscribiendo ? '✏️ escribiendo...' : online ? 'En línea' : APP_NAME}
                    </Text>
                </View>
            </View>

            {!mensajes.length ? (
                <View style={[SS.vacio, { backgroundColor: colors.bg }]}>
                    <Ionicons name="chatbubbles-outline" size={48} color={colors.borderSubtle} />
                    <Text style={[SS.vacioTitulo, { color: colors.textMuted }]}>Sin mensajes aún</Text>
                    <Text style={[SS.vacioSub, { color: colors.textMuted }]}>
                        {esAdmin ? 'Escribí para iniciar.' : 'Escribile a la central.'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={mensajes}
                    keyExtractor={m => String(m.id)}
                    inverted
                    contentContainerStyle={SS.lista}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    removeClippedSubviews
                    maxToRenderPerBatch={15}
                    renderItem={({ item, index }) => (
                        <View>
                            {necesitaSeparador(mensajes, index) && (
                                <SeparadorFecha fecha={formatFechaGrupo(item.created_at)} />
                            )}
                            <Burbuja mensaje={item} esPropio={String(item.user_id) === String(miUserId)} mostrarRemitente={!esAdmin && String(item.user_id) !== String(miUserId)} />
                        </View>
                    )}
                />
            )}

            {otroEscribiendo && <IndicadorEscribiendo nombre={nombreEscribiendo} />}

            <View style={[SS.inputBar, { backgroundColor: colors.bgCard, borderTopColor: colors.borderSubtle, paddingBottom: Platform.OS === 'ios' ? 28 : Math.max(12, insets.bottom + 8), marginBottom: Platform.OS === 'android' ? keyboardPad : 0 }]}>
                {!isRecording && !subiendoMedia && (
                    <TouchableOpacity onPress={handleAdjuntar} style={{ padding: 10, justifyContent: 'center' }}>
                        <Ionicons name="attach" size={24} color={colors.textMuted} />
                    </TouchableOpacity>
                )}
                {isRecording ? (
                    <View style={[SS.input, { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: '#EF4444', flexDirection: 'row', alignItems: 'center' }]}>
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444', marginRight: 8 }} />
                        <Text style={{ color: '#EF4444', flex: 1, fontSize: 14, fontWeight: '500' }}>Grabando audio... (soltar)</Text>
                    </View>
                ) : subiendoMedia ? (
                    <View style={[SS.input, { backgroundColor: colors.bgInput, borderColor: colors.border, flexDirection: 'row', alignItems: 'center' }]}>
                        <ActivityIndicator size="small" color={colors.blue} style={{ marginRight: 8 }} />
                        <Text style={{ color: colors.textMuted, flex: 1, fontSize: 14 }}>Subiendo archivo...</Text>
                    </View>
                ) : (
                    <TextInput
                        ref={inputRef}
                        style={[SS.input, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
                        value={texto} onChangeText={handleChangeText}
                        placeholder={esAdmin ? `Escribirle a ${choferNombre.split(' ')[0]}...` : 'Escribile a la central...'}
                        placeholderTextColor={colors.textMuted}
                        multiline maxLength={500} returnKeyType="send"
                        blurOnSubmit={false} onSubmitEditing={handleEnviar}
                    />
                )}
                {texto.trim().length > 0 ? (
                    <TouchableOpacity
                        style={[SS.btnEnviar, { backgroundColor: colors.blue }, enviando && { backgroundColor: colors.bgInput }]}
                        onPress={handleEnviar} disabled={enviando} activeOpacity={0.75}
                    >
                        {enviando ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={18} color="#FFF" />}
                    </TouchableOpacity>
                ) : !subiendoMedia ? (
                    <TouchableOpacity
                        style={[SS.btnMic, { backgroundColor: isRecording ? '#EF4444' : colors.blue }]}
                        onPressIn={empezarGrabacion} onPressOut={() => detenerGrabacion(false)} activeOpacity={0.75}
                    >
                        <Ionicons name="mic" size={20} color="#FFF" />
                    </TouchableOpacity>
                ) : (
                    <View style={[SS.btnEnviar, { backgroundColor: colors.bgInput }]}>
                        <ActivityIndicator size="small" color={colors.blue} />
                    </View>
                )}
            </View>
        </chatWrapper.Component>
    );
};

// ─── Selector de Coordinador (para choferes) ──────────────────────────────────

const SelectorCoordinador: React.FC<{
    coordinadores: Coordinador[];
    onSeleccionar: (coord: Coordinador) => void;
    noLeidosPorCoord: Record<string, number>;
}> = ({ coordinadores, onSeleccionar, noLeidosPorCoord }) => {
    const { colors } = useTheme();
    return (
        <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 20 }}>
            <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
                <Text style={{ fontSize: 22, fontWeight: '800', color: colors.textPrimary, marginBottom: 4 }}>
                    Contactar a Logística
                </Text>
                <Text style={{ fontSize: 13, color: colors.textMuted }}>
                    Elegí con quién querés chatear
                </Text>
            </View>
            {coordinadores.map(coord => {
                const noLeidos = noLeidosPorCoord[coord.email] || 0;
                return (
                    <Pressable
                        key={coord.id}
                        onPress={() => onSeleccionar(coord)}
                        style={({ pressed }) => [
                            SS.convItem,
                            { backgroundColor: colors.bg },
                            pressed && { opacity: 0.7 }
                        ]}
                    >
                        <View style={SS.convAvatarWrap}>
                            <View style={[SS.convAvatar, { backgroundColor: coord.color + '22', borderColor: coord.color, borderWidth: 2 }]}>
                                <Text style={[SS.convAvatarText, { color: coord.color }]}>
                                    {coord.nombre[0]}{coord.apellido[0]}
                                </Text>
                            </View>
                        </View>
                        <View style={SS.convInfo}>
                            <View style={SS.convTopRow}>
                                <Text style={[SS.convNombreItem, { color: colors.textPrimary, fontWeight: '700' }]}>
                                    {coord.nombre} {coord.apellido}
                                </Text>
                                {noLeidos > 0 && (
                                    <View style={[SS.badge, { backgroundColor: coord.color }]}>
                                        <Text style={SS.badgeText}>{noLeidos > 99 ? '99+' : noLeidos}</Text>
                                    </View>
                                )}
                            </View>
                            <View style={SS.convBottomRow}>
                                <Text style={[SS.convUltimoMsg, { color: colors.textMuted }]}>
                                    {coord.rol}
                                </Text>
                            </View>
                        </View>
                        <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
                    </Pressable>
                );
            })}
        </View>
    );
};

// ─── ChatScreen ───────────────────────────────────────────────────────────────

export default function ChatScreen() {
    const { colors } = useTheme();
    const router = useRouter();
    const [cargando, setCargando] = useState(true);
    const [authError, setAuthError] = useState(false);
    const [miUserId, setMiUserId] = useState('');
    const [miEmail, setMiEmail] = useState('');
    const [miNombre, setMiNombre] = useState('Chofer');
    const [esAdmin, setEsAdmin] = useState(false);
    const [convAbierta, setConvAbierta] = useState<Conversacion | null>(null);
    const [coordElegido, setCoordElegido] = useState<Coordinador | null>(null);
    const [noLeidosPorCoord, setNoLeidosPorCoord] = useState<Record<string, number>>({});
    const [equipo, setEquipo] = useState<Coordinador[]>([]);

    useEffect(() => {
        const init = async () => {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error || !user) { setAuthError(true); setCargando(false); return; }
            const email = user.email ?? '';
            // esAdmin = admin hardcodeado O rol admin/subadmin en roles_usuarios
            // (así los subadmins entran al flujo admin, no como choferes).
            let admin = ADMIN_EMAILS.includes(email);
            if (!admin) {
                const { data: rolRow } = await supabase.from('roles_usuarios').select('rol').eq('email', email).maybeSingle();
                const r = (rolRow?.rol || '').toLowerCase();
                admin = r === 'admin' || r === 'subadmin';
            }
            setMiUserId(user.id); setMiEmail(email); setEsAdmin(admin);
            // Cargar el equipo (admins + subadmins) para el selector del chofer.
            cargarEquipo().then(setEquipo).catch(() => {});
            // Nombre real desde tabla Choferes (más fiable que user_metadata)
            try {
                if (!admin) {
                    const { data: cd } = await supabase.from('Choferes').select('nombre').eq('email', email).maybeSingle();
                    setMiNombre(cd?.nombre?.split(' ')[0] ?? (user.user_metadata?.full_name || email.split('@')[0] || 'Chofer'));
                } else {
                    // Para admins, el nombre que aparece es "Administración" en los mensajes,
                    // pero localmente mostramos su nombre real
                    setMiNombre(prettyNombre(email).split(' ')[0] || 'Admin');
                }
            } catch {
                setMiNombre(user.user_metadata?.full_name?.split(' ')[0] || email.split('@')[0] || 'Chofer');
            }
            setCargando(false);
            try {
                const token = await registrarPushToken();
                if (token) await guardarTokenEnBD(email, token, admin);
            } catch (err) { console.warn('[Push]', err); }
        };
        init();
    }, []);

    useEffect(() => {
        if (!miEmail) return;
        AsyncStorage.setItem(`chat_last_seen_${miEmail}`, new Date().toISOString()).catch(console.warn);
    }, [miEmail]);

    // Contar no leídos por coordinador (solo para choferes)
    useEffect(() => {
        if (esAdmin || !miEmail) return;
        const cargarNoLeidos = async () => {
            const counts: Record<string, number> = {};
            for (const coord of equipo) {
                const { count } = await supabase
                    .from('mensajes')
                    .select('id', { count: 'exact', head: true })
                    .eq('chofer_email', miEmail)
                    .eq('admin_id', coord.email)
                    .eq('remitente', REMITENTE_ADMIN)
                    .eq('visto_chofer', false);
                counts[coord.email] = count || 0;
            }
            setNoLeidosPorCoord(counts);
        };
        cargarNoLeidos();
        // Refrescar cuando haya mensajes nuevos
        const canal = supabase
            .channel(`no-leidos-${miEmail.replace(/[@.]/g, '-')}`)
            .on('postgres_changes', {
                event: '*', schema: 'public', table: 'mensajes',
                filter: `chofer_email=eq.${miEmail}`,
            }, cargarNoLeidos)
            .subscribe();
        return () => { void supabase.removeChannel(canal); };
    }, [esAdmin, miEmail, coordElegido, equipo]);

    useEffect(() => {
        const sub = Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data as any;
            if (data?.tipo === 'CHAT') {
                if (data.chofer_email && esAdmin)
                    setConvAbierta({ email: data.chofer_email, nombre: data.chofer_nombre || data.chofer_email, ultimoMensaje: '', ultimaHora: '', noLeidos: 0, online: false });
                // Si el push viene de un admin específico y el usuario es chofer, abrir ese chat
                if (data.admin_email && !esAdmin) {
                    const coord = equipo.find(c => c.email === data.admin_email);
                    if (coord) setCoordElegido(coord);
                }
                router.push('/(drawer)/chat' as any);
            }
        });
        return () => sub.remove();
    }, [esAdmin, router, equipo]);

    if (authError) return (
        <View style={[SS.vacio, { backgroundColor: colors.bg }]}>
            <Ionicons name="lock-closed-outline" size={52} color={colors.borderSubtle} />
            <Text style={[SS.vacioTitulo, { color: colors.textMuted }]}>Sesión no disponible</Text>
            <Text style={[SS.vacioSub, { color: colors.textMuted }]}>Volvé a iniciar sesión.</Text>
        </View>
    );

    if (cargando) return (
        <View style={[SS.loader, { backgroundColor: colors.bg }]}>
            <ActivityIndicator size="large" color={colors.blue} />
            <Text style={[SS.loaderText, { color: colors.textMuted }]}>
                {esAdmin ? 'Cargando conversaciones...' : 'Conectando...'}
            </Text>
        </View>
    );

    // FLUJO CHOFER: primero elige coordinador, después entra al chat
    if (!esAdmin) {
        if (!coordElegido) {
            return <SelectorCoordinador coordinadores={equipo} onSeleccionar={setCoordElegido} noLeidosPorCoord={noLeidosPorCoord} />;
        }
        return (
            <ConversacionView
                miUserId={miUserId} miEmail={miEmail} miNombre={miNombre}
                esAdmin={false}
                choferEmail={miEmail}
                choferNombre={`${coordElegido.nombre} ${coordElegido.apellido}`}
                adminEmail={coordElegido.email}
                onVolver={() => setCoordElegido(null)}
            />
        );
    }

    // FLUJO ADMIN: lista de conversaciones → conversación específica
    if (convAbierta) return (
        <ConversacionView
            miUserId={miUserId} miEmail={miEmail} miNombre={miNombre}
            esAdmin={true}
            choferEmail={convAbierta.email}
            choferNombre={convAbierta.nombre}
            adminEmail={miEmail}
            onVolver={() => setConvAbierta(null)}
        />
    );
    return <ListaConversaciones miEmail={miEmail} onAbrir={setConvAbierta} />;
}

// ─── Estilos estáticos ────────────────────────────────────────────────────────

const SS = StyleSheet.create({
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
    loaderText: { fontSize: 13, fontWeight: '500' },
    vacio: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 32 },
    vacioTitulo: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
    vacioSub: { fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
    convItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
    convSeparador: { height: 1, marginLeft: 82 },
    convAvatarWrap: { position: 'relative' },
    convAvatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
    convAvatarText: { fontSize: 17, fontWeight: '800' },
    convInfo: { flex: 1 },
    convTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    convNombreItem: { fontSize: 15, fontWeight: '600', flex: 1, marginRight: 8 },
    convHora: { fontSize: 11, fontWeight: '500' },
    convBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    convUltimoMsg: { flex: 1, fontSize: 13, fontWeight: '400', marginRight: 8 },
    badge: { borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
    badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
    chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
    btnVolver: { padding: 4, marginRight: 4 },
    chatAvatarWrap: { position: 'relative' },
    chatAvatar: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
    chatAvatarText: { fontSize: 14, fontWeight: '800' },
    chatNombre: { fontSize: 14, fontWeight: '700' },
    chatSub: { fontSize: 11, marginTop: 1 },
    onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 11, height: 11, borderRadius: 6, backgroundColor: '#34D399', borderWidth: 2 },
    lista: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 8 },
    separadorWrapper: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, paddingHorizontal: 8 },
    separadorLinea: { flex: 1, height: 1 },
    separadorTexto: { fontSize: 11, fontWeight: '600', marginHorizontal: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
    burbujaWrapper: { marginBottom: 3, maxWidth: '80%' },
    burbujaRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    burbujaLeft: { alignSelf: 'flex-start', alignItems: 'flex-start' },
    remitente: { fontSize: 11, fontWeight: '700', marginBottom: 3, marginLeft: 4 },
    burbuja: { borderRadius: 18, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
    burbujaPropia: { backgroundColor: '#1E4DB7', borderBottomRightRadius: 4 },
    burbujaTexto: { fontSize: 15, lineHeight: 20 },
    textoPropio: { color: '#FFFFFF' },
    burbujaFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
    hora: { fontSize: 10, fontWeight: '600' },
    horaPropia: { color: 'rgba(255,255,255,0.45)' },
    ticks: { flexDirection: 'row', alignItems: 'center' },
    sistemaWrapper: { alignItems: 'center', marginVertical: 8 },
    sistemaBurbuja: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(52,211,153,0.08)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, maxWidth: '85%' },
    sistemaTexto: { flex: 1, fontSize: 12, color: '#34D399', fontWeight: '600', textAlign: 'center' },
    sistemaHora: { fontSize: 10, fontWeight: '600' },
    typingWrapper: { paddingHorizontal: 14, paddingBottom: 6 },
    typingBurbuja: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 18, borderBottomLeftRadius: 4, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
    typingNombre: { fontSize: 12, fontWeight: '500' },
    typingDots: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    typingDot: { width: 5, height: 5, borderRadius: 3 },
    inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1 },
    input: { flex: 1, borderRadius: 22, borderWidth: 1.5, fontSize: 15, paddingHorizontal: 18, paddingTop: 11, paddingBottom: 11, maxHeight: 120 },
    btnEnviar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
    btnMic: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 4 },
});