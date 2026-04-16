// app/(drawer)/chat.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { ADMIN_EMAIL, APP_NAME } from '../../lib/constants';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

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
            name: 'Mensajes de Chat', importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250], lightColor: '#4F8EF7', sound: 'default',
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

async function enviarPush(tokenDestinatario: string, titulo: string, cuerpo: string, data: object): Promise<void> {
    try {
        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                to: tokenDestinatario, title: titulo,
                body: cuerpo.length > 100 ? cuerpo.slice(0, 97) + '...' : cuerpo,
                sound: 'default', data, channelId: 'chat',
            }),
        });
    } catch (err) { console.warn('[Push] Error enviando:', err); }
}

const TYPING_TIMEOUT_MS = 2500;

interface Mensaje {
    id: number; created_at: string; user_id: string; remitente: string;
    texto: string; chofer_email: string; visto_admin: boolean;
}

interface Conversacion {
    email: string; nombre: string; ultimoMensaje: string;
    ultimaHora: string; noLeidos: number; online: boolean;
}

const formatHora = (iso: string): string => {
    try {
        const d = new Date(iso);
        const hoy = new Date();
        if (d.toDateString() === hoy.toDateString())
            return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
    } catch { return ''; }
};

const formatFechaGrupo = (iso: string): string => {
    try {
        const d = new Date(iso);
        const hoy = new Date();
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
    }, []);

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

    if (mensaje.texto.startsWith('🔔') || mensaje.remitente === 'Sistema') {
        return (
            <View style={SS.sistemaWrapper}>
                <View style={SS.sistemaBurbuja}>
                    <Text style={SS.sistemaTexto}>{mensaje.texto}</Text>
                    <Text style={[SS.sistemaHora, { color: colors.textMuted }]}>{formatHora(mensaje.created_at)}</Text>
                </View>
            </View>
        );
    }

    const burbujaAjenaColor = isDark ? '#0D1526' : '#FFFFFF';
    const burbujaAjenaBorder = colors.border;

    return (
        <View style={[SS.burbujaWrapper, esPropio ? SS.burbujaRight : SS.burbujaLeft]}>
            {!esPropio && mostrarRemitente && (
                <Text style={[SS.remitente, { color: colors.blue }]}>{mensaje.remitente}</Text>
            )}
            <View style={[SS.burbuja, esPropio ? SS.burbujaPropia : { backgroundColor: burbujaAjenaColor, borderColor: burbujaAjenaBorder, borderWidth: 1, borderBottomLeftRadius: 4 }]}>
                <Text style={[SS.burbujaTexto, esPropio ? SS.textoPropio : { color: colors.textPrimary }]}>
                    {mensaje.texto}
                </Text>
                <View style={SS.burbujaFooter}>
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

// ─── ListaConversaciones (Admin) ──────────────────────────────────────────────

const ListaConversaciones: React.FC<{ onAbrir: (conv: Conversacion) => void }> = ({ onAbrir }) => {
    const { colors } = useTheme();
    const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
    const [cargando, setCargando] = useState(true);
    const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    const cargar = useCallback(async () => {
        try {
            const { data: chofData } = await supabase
                .from('Choferes').select('email, nombre')
                .not('email', 'is', null).neq('email', '').order('nombre', { ascending: true });
            if (!chofData || chofData.length === 0) { setCargando(false); return; }

            const lista: Conversacion[] = await Promise.all(
                chofData.map(async (c: any) => {
                    const email = c.email.trim();
                    const { data: ultMsg } = await supabase.from('mensajes')
                        .select('texto, created_at').eq('chofer_email', email)
                        .order('created_at', { ascending: false }).limit(1).maybeSingle();
                    const { count: noLeidos } = await supabase.from('mensajes')
                        .select('id', { count: 'exact', head: true })
                        .eq('chofer_email', email).eq('visto_admin', false);
                    return { email, nombre: c.nombre || email, ultimoMensaje: ultMsg?.texto ?? 'Sin mensajes aún', ultimaHora: ultMsg?.created_at ?? '', noLeidos: noLeidos ?? 0, online: false };
                })
            );

            const conMensajes = lista.filter(c => c.ultimaHora !== '');
            conMensajes.sort((a, b) => {
                if (b.noLeidos !== a.noLeidos) return b.noLeidos - a.noLeidos;
                return b.ultimaHora.localeCompare(a.ultimaHora);
            });
            setConversaciones(conMensajes);
        } catch (err) { console.error('[Chat Admin] Error:', err); }
        finally { setCargando(false); }
    }, []);

    useEffect(() => {
        cargar();
        const canal = supabase.channel(`admin-chat-lista-${Date.now()}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes' }, () => cargar())
            .subscribe();
        const presence = supabase.channel('chat-global-presence');
        presence.on('presence', { event: 'sync' }, () => {
            const emails = new Set(Object.keys(presence.presenceState()));
            setConversaciones(prev => prev.map(c => ({ ...c, online: emails.has(c.email) })));
        }).subscribe();
        presenceRef.current = presence;
        return () => {
            void supabase.removeChannel(canal);
            if (presenceRef.current) void supabase.removeChannel(presenceRef.current);
        };
    }, [cargar]);

    if (cargando) return (
        <View style={[SS.loader, { backgroundColor: colors.bg }]}>
            <ActivityIndicator size="large" color={colors.blue} />
            <Text style={[SS.loaderText, { color: colors.textMuted }]}>Cargando conversaciones...</Text>
        </View>
    );

    if (conversaciones.length === 0) return (
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
                    style={({ pressed }) => [
                        SS.convItem,
                        { backgroundColor: colors.bg },
                        pressed && { opacity: 0.75 },
                    ]}
                    onPress={() => onAbrir(item)}
                >
                    <View style={SS.convAvatarWrap}>
                        <View style={[
                            SS.convAvatar,
                            { backgroundColor: colors.bgCard, borderColor: colors.border },
                            item.noLeidos > 0 && { borderColor: colors.blue, borderWidth: 2, backgroundColor: colors.blueSubtle },
                        ]}>
                            <Text style={[SS.convAvatarText, { color: colors.blue }]}>{iniciales(item.nombre)}</Text>
                        </View>
                        {item.online && <View style={[SS.onlineDot, { borderColor: colors.bg }]} />}
                    </View>
                    <View style={SS.convInfo}>
                        <View style={SS.convTopRow}>
                            <Text style={[SS.convNombreItem, { color: item.noLeidos > 0 ? colors.textPrimary : colors.textSecondary }, item.noLeidos > 0 && { fontWeight: '700' }]} numberOfLines={1}>
                                {item.nombre}
                            </Text>
                            <Text style={[SS.convHora, { color: item.noLeidos > 0 ? colors.blue : colors.textMuted }]}>
                                {item.ultimaHora ? formatHora(item.ultimaHora) : ''}
                            </Text>
                        </View>
                        <View style={SS.convBottomRow}>
                            <Text style={[SS.convUltimoMsg, { color: item.noLeidos > 0 ? colors.textPrimary : colors.textMuted }, item.noLeidos > 0 && { fontWeight: '600' }]} numberOfLines={1}>
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

// ─── Conversacion ─────────────────────────────────────────────────────────────

const ConversacionView: React.FC<{
    miUserId: string; miEmail: string; miNombre: string; esAdmin: boolean;
    choferEmail: string; choferNombre: string; onVolver?: () => void;
}> = ({ miUserId, miEmail, miNombre, esAdmin, choferEmail, choferNombre, onVolver }) => {
    const { colors } = useTheme();
    const [mensajes, setMensajes] = useState<Mensaje[]>([]);
    const [texto, setTexto] = useState('');
    const [enviando, setEnviando] = useState(false);
    const [online, setOnline] = useState(false);
    const [otroEscribiendo, setOtroEscribiendo] = useState(false);
    const [nombreEscribiendo, setNombreEscribiendo] = useState('');
    const inputRef = useRef<TextInput>(null);
    const msgCanalRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const presenceCanalRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const typingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const estabaTypingRef = useRef(false);

    const fetchMensajes = useCallback(async () => {
        const { data } = await supabase.from('mensajes')
            .select('id, created_at, user_id, remitente, texto, chofer_email, visto_admin')
            .eq('chofer_email', choferEmail).order('created_at', { ascending: false }).limit(50);
        setMensajes(data ?? []);
    }, [choferEmail]);

    const marcarVisto = useCallback(async () => {
        if (!esAdmin) return;
        await supabase.from('mensajes').update({ visto_admin: true })
            .eq('chofer_email', choferEmail).eq('visto_admin', false);
    }, [esAdmin, choferEmail]);

    useEffect(() => {
        fetchMensajes();
        if (esAdmin) marcarVisto();
        if (msgCanalRef.current) void supabase.removeChannel(msgCanalRef.current);
        const canal = supabase.channel(`msgs-${choferEmail.replace(/[@.]/g, '-')}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `chofer_email=eq.${choferEmail}` },
                (payload) => {
                    const nuevo = payload.new as Mensaje;
                    setMensajes(prev => prev.some(m => m.id === nuevo.id) ? prev : [nuevo, ...prev]);
                    if (esAdmin) marcarVisto();
                })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'mensajes', filter: `chofer_email=eq.${choferEmail}` },
                (payload) => {
                    const upd = payload.new as Mensaje;
                    setMensajes(prev => prev.map(m => m.id === upd.id ? { ...m, visto_admin: upd.visto_admin } : m));
                })
            .subscribe();
        msgCanalRef.current = canal;
        return () => { if (msgCanalRef.current) { void supabase.removeChannel(msgCanalRef.current); msgCanalRef.current = null; } };
    }, [choferEmail, fetchMensajes, esAdmin, marcarVisto]);

    useEffect(() => {
        if (presenceCanalRef.current) void supabase.removeChannel(presenceCanalRef.current);
        const canalId = `presence-${choferEmail.replace(/[@.]/g, '-')}`;
        const canal = supabase.channel(canalId, { config: { presence: { key: miEmail } } });
        canal
            .on('presence', { event: 'sync' }, () => {
                const emails = Object.keys(canal.presenceState());
                setOnline(emails.includes(esAdmin ? choferEmail : ADMIN_EMAIL));
            })
            .on('broadcast', { event: 'typing' }, (payload) => {
                const { email: emailEmisor, nombre: nomEmisor, escribiendo } = payload.payload as any;
                if (emailEmisor === miEmail) return;
                setOtroEscribiendo(escribiendo);
                setNombreEscribiendo(escribiendo ? nomEmisor : '');
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') await canal.track({ email: miEmail, nombre: miNombre, at: new Date().toISOString() });
            });
        presenceCanalRef.current = canal;
        return () => {
            if (presenceCanalRef.current) {
                void presenceCanalRef.current.untrack();
                void supabase.removeChannel(presenceCanalRef.current);
                presenceCanalRef.current = null;
            }
        };
    }, [choferEmail, miEmail, miNombre, esAdmin]);

    const emitirTyping = (escribiendo: boolean) => {
        presenceCanalRef.current?.send({ type: 'broadcast', event: 'typing', payload: { email: miEmail, nombre: miNombre, escribiendo } });
    };

    const handleChangeText = (val: string) => {
        setTexto(val);
        if (!estabaTypingRef.current) { estabaTypingRef.current = true; emitirTyping(true); }
        if (typingRef.current) clearTimeout(typingRef.current);
        typingRef.current = setTimeout(() => { estabaTypingRef.current = false; emitirTyping(false); }, TYPING_TIMEOUT_MS);
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
                user_id: miUserId, remitente: esAdmin ? 'Admin' : miNombre, texto: txt, chofer_email: choferEmail,
            }]);
            if (error) { setTexto(txt); console.error('[Chat] Error:', error.message); }
            else {
                void (async () => {
                    try {
                        let tokenDest: string | null = null;
                        if (esAdmin) {
                            const { data } = await supabase.from('Choferes').select('push_token').eq('email', choferEmail).maybeSingle();
                            tokenDest = data?.push_token ?? null;
                        } else {
                            const { data } = await supabase.from('Admins').select('push_token').eq('email', ADMIN_EMAIL).maybeSingle();
                            tokenDest = data?.push_token ?? null;
                        }
                        if (tokenDest) await enviarPush(tokenDest, `💬 ${esAdmin ? 'Admin' : miNombre}`, txt, { tipo: 'CHAT', chofer_email: choferEmail, chofer_nombre: esAdmin ? choferNombre : miNombre });
                    } catch (err) { console.warn('[Push] Error:', err); }
                })();
            }
        } catch { setTexto(txt); }
        finally { setEnviando(false); inputRef.current?.focus(); }
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: colors.bg }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
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
                        {esAdmin ? choferNombre : 'Maxi (Admin)'}
                    </Text>
                    <Text style={[SS.chatSub, { color: colors.textMuted }]}>
                        {otroEscribiendo ? '✏️ escribiendo...' : online ? 'En línea' : APP_NAME}
                    </Text>
                </View>
            </View>

            {mensajes.length === 0 ? (
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
                    renderItem={({ item, index }) => {
                        const esPropio = item.user_id === miUserId;
                        return (
                            <View>
                                {necesitaSeparador(mensajes, index) && (
                                    <SeparadorFecha fecha={formatFechaGrupo(item.created_at)} />
                                )}
                                <Burbuja mensaje={item} esPropio={esPropio} mostrarRemitente={!esAdmin && !esPropio} />
                            </View>
                        );
                    }}
                />
            )}

            {otroEscribiendo && <IndicadorEscribiendo nombre={nombreEscribiendo} />}

            <View style={[SS.inputBar, {
                backgroundColor: colors.bgCard,
                borderTopColor: colors.borderSubtle,
                paddingBottom: Platform.OS === 'ios' ? 28 : 12,
            }]}>
                <TextInput
                    ref={inputRef}
                    style={[SS.input, { backgroundColor: colors.bgInput, borderColor: colors.border, color: colors.textPrimary }]}
                    value={texto}
                    onChangeText={handleChangeText}
                    placeholder={esAdmin ? `Escribirle a ${choferNombre.split(' ')[0]}...` : 'Escribile a la central...'}
                    placeholderTextColor={colors.textMuted}
                    multiline maxLength={500} returnKeyType="send"
                    blurOnSubmit={false} onSubmitEditing={handleEnviar}
                />
                <TouchableOpacity
                    style={[SS.btnEnviar, { backgroundColor: colors.blue }, (!texto.trim() || enviando) && { backgroundColor: colors.bgInput, shadowOpacity: 0, elevation: 0 }]}
                    onPress={handleEnviar} disabled={!texto.trim() || enviando} activeOpacity={0.75}
                >
                    {enviando ? <ActivityIndicator size="small" color="#FFF" /> : <Ionicons name="send" size={18} color="#FFF" />}
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
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

    useEffect(() => {
        const init = async () => {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error || !user) { setAuthError(true); setCargando(false); return; }
            const email = user.email ?? '';
            const nombre = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0] || 'Chofer';
            const admin = email === ADMIN_EMAIL;
            setMiUserId(user.id); setMiEmail(email);
            setMiNombre(nombre.split(' ')[0]); setEsAdmin(admin); setCargando(false);
            try {
                const token = await registrarPushToken();
                if (token) await guardarTokenEnBD(email, token, admin);
            } catch (err) { console.warn('[Push] Error:', err); }
        };
        init();
    }, []);

    useEffect(() => {
        if (!miEmail) return;
        AsyncStorage.setItem(`chat_last_seen_${miEmail}`, new Date().toISOString()).catch(console.warn);
    }, [miEmail]);

    useEffect(() => {
        const sub = Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data as any;
            if (data?.tipo === 'CHAT') {
                if (data.chofer_email && esAdmin) setConvAbierta({ email: data.chofer_email, nombre: data.chofer_nombre || data.chofer_email, ultimoMensaje: '', ultimaHora: '', noLeidos: 0, online: false });
                router.push('/(drawer)/chat' as any);
            }
        });
        return () => sub.remove();
    }, [esAdmin, router]);

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

    if (!esAdmin) return (
        <ConversacionView miUserId={miUserId} miEmail={miEmail} miNombre={miNombre}
            esAdmin={false} choferEmail={miEmail} choferNombre="Maxi (Admin)" />
    );

    if (convAbierta) return (
        <ConversacionView miUserId={miUserId} miEmail={miEmail} miNombre={miNombre}
            esAdmin={true} choferEmail={convAbierta.email} choferNombre={convAbierta.nombre}
            onVolver={() => setConvAbierta(null)} />
    );

    return <ListaConversaciones onAbrir={setConvAbierta} />;
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
});