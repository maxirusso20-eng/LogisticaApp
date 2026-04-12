// app/(drawer)/chat.tsx
//
// DOS VISTAS COMPLETAMENTE SEPARADAS:
//
//  ADMIN  → Lista de conversaciones estilo WhatsApp
//           (último mensaje, hora, badge de no leídos, online)
//           Al tocar una → abre la conversación
//
//  CHOFER → Entra directo a su chat con el admin
//           (sin selector, sin bugs de "chat consigo mismo")
//
// La separación total elimina los bugs de esPropio/userId/timing.

import { Ionicons } from '@expo/vector-icons';
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

// ─────────────────────────────────────────────
// CONFIGURACIÓN DE NOTIFICACIONES
// ─────────────────────────────────────────────

Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

// ─────────────────────────────────────────────
// HELPERS DE PUSH NOTIFICATIONS
// ─────────────────────────────────────────────

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
    } catch (err) {
        console.warn('[Push] Error guardando token:', err);
    }
}

async function enviarPush(tokenDestinatario: string, titulo: string, cuerpo: string, data: object): Promise<void> {
    try {
        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({
                to: tokenDestinatario,
                title: titulo,
                body: cuerpo.length > 100 ? cuerpo.slice(0, 97) + '...' : cuerpo,
                sound: 'default',
                data,
                channelId: 'chat',
            }),
        });
    } catch (err) {
        console.warn('[Push] Error enviando:', err);
    }
}

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────

const TYPING_TIMEOUT_MS = 2500; // cuánto esperar sin tipear para dejar de mostrar "escribiendo"

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

interface Mensaje {
    id: number;
    created_at: string;
    user_id: string;
    remitente: string;
    texto: string;
    chofer_email: string;
    visto_admin: boolean;
}

interface Conversacion {
    email: string;
    nombre: string;
    ultimoMensaje: string;
    ultimaHora: string;
    noLeidos: number;
    online: boolean;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const formatHora = (iso: string): string => {
    try {
        const d = new Date(iso);
        const hoy = new Date();
        if (d.toDateString() === hoy.toDateString()) {
            return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        }
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

// ─────────────────────────────────────────────
// COMPONENTES REUTILIZABLES
// ─────────────────────────────────────────────

const SeparadorFecha: React.FC<{ fecha: string }> = ({ fecha }) => (
    <View style={S.separadorWrapper}>
        <View style={S.separadorLinea} />
        <Text style={S.separadorTexto}>{fecha}</Text>
        <View style={S.separadorLinea} />
    </View>
);

const IndicadorEscribiendo: React.FC<{ nombre: string }> = ({ nombre }) => {
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
        <View style={S.typingWrapper}>
            <View style={S.typingBurbuja}>
                <Text style={S.typingNombre}>{nombre} está escribiendo</Text>
                <View style={S.typingDots}>
                    {[dot1, dot2, dot3].map((dot, i) => (
                        <Animated.View key={i} style={[S.typingDot, { opacity: dot }]} />
                    ))}
                </View>
            </View>
        </View>
    );
};

// Burbuja — solo usada en la vista de conversación (chofer y admin dentro de un chat)
const Burbuja: React.FC<{
    mensaje: Mensaje;
    esPropio: boolean;    // ← calculado por el padre con ref, nunca null
    mostrarRemitente: boolean;
}> = ({ mensaje, esPropio, mostrarRemitente }) => {
    if (mensaje.texto.startsWith('🔔') || mensaje.remitente === 'Sistema') {
        return (
            <View style={S.sistemaWrapper}>
                <View style={S.sistemaBurbuja}>
                    <Text style={S.sistemaTexto}>{mensaje.texto}</Text>
                    <Text style={S.sistemaHora}>{formatHora(mensaje.created_at)}</Text>
                </View>
            </View>
        );
    }
    return (
        <View style={[S.burbujaWrapper, esPropio ? S.burbujaRight : S.burbujaLeft]}>
            {!esPropio && mostrarRemitente && (
                <Text style={S.remitente}>{mensaje.remitente}</Text>
            )}
            <View style={[S.burbuja, esPropio ? S.burbujaPropia : S.burbujaAjena]}>
                <Text style={[S.burbujaTexto, esPropio ? S.textoPropio : S.textoAjeno]}>
                    {mensaje.texto}
                </Text>
                <View style={S.burbujaFooter}>
                    <Text style={[S.hora, esPropio ? S.horaPropia : S.horaAjena]}>
                        {formatHora(mensaje.created_at)}
                    </Text>
                    {esPropio && (
                        <View style={S.ticks}>
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

// ═════════════════════════════════════════════
// VISTA ADMIN: Lista de conversaciones
// ═════════════════════════════════════════════

const ListaConversaciones: React.FC<{
    onAbrir: (conv: Conversacion) => void;
}> = ({ onAbrir }) => {
    const [conversaciones, setConversaciones] = useState<Conversacion[]>([]);
    const [cargando, setCargando] = useState(true);
    const [onlineEmails, setOnlineEmails] = useState<Set<string>>(new Set());
    const presenceRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    const cargar = useCallback(async () => {
        try {
            // 1. Traer todos los choferes con email
            const { data: chofData } = await supabase
                .from('Choferes')
                .select('email, nombre')
                .not('email', 'is', null)
                .neq('email', '')
                .order('nombre', { ascending: true });

            if (!chofData || chofData.length === 0) {
                setCargando(false);
                return;
            }

            // 2. Para cada chofer, traer el último mensaje y no leídos
            const lista: Conversacion[] = await Promise.all(
                chofData.map(async (c: any) => {
                    const email = c.email.trim();

                    const { data: ultMsg } = await supabase
                        .from('mensajes')
                        .select('texto, created_at')
                        .eq('chofer_email', email)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    const { count: noLeidos } = await supabase
                        .from('mensajes')
                        .select('id', { count: 'exact', head: true })
                        .eq('chofer_email', email)
                        .eq('visto_admin', false);

                    return {
                        email,
                        nombre: c.nombre || email,
                        ultimoMensaje: ultMsg?.texto ?? 'Sin mensajes aún',
                        ultimaHora: ultMsg?.created_at ?? '',
                        noLeidos: noLeidos ?? 0,
                        online: false,
                    };
                })
            );

            // Solo mostrar choferes que tienen al menos 1 mensaje
            const conMensajes = lista.filter(c => c.ultimaHora !== '');

            // Ordenar: con no leídos primero, luego por hora del último mensaje
            conMensajes.sort((a, b) => {
                if (b.noLeidos !== a.noLeidos) return b.noLeidos - a.noLeidos;
                return b.ultimaHora.localeCompare(a.ultimaHora);
            });

            setConversaciones(conMensajes);
        } catch (err) {
            console.error('[Chat Admin] Error cargando conversaciones:', err);
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        cargar();

        // Realtime: actualizar lista cuando llegan mensajes nuevos
        const canal = supabase
            .channel(`admin-chat-lista-${Date.now()}`)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'mensajes' },
                () => cargar() // re-cargar para actualizar último mensaje y no leídos
            )
            .subscribe();

        // Presence global para saber quién está online
        const presence = supabase.channel('chat-global-presence');
        presence
            .on('presence', { event: 'sync' }, () => {
                const emails = new Set(Object.keys(presence.presenceState()));
                setOnlineEmails(emails);
                setConversaciones(prev =>
                    prev.map(c => ({ ...c, online: emails.has(c.email) }))
                );
            })
            .subscribe();

        presenceRef.current = presence;

        return () => {
            void supabase.removeChannel(canal);
            if (presenceRef.current) void supabase.removeChannel(presenceRef.current);
        };
    }, [cargar]);

    if (cargando) {
        return (
            <View style={S.loader}>
                <ActivityIndicator size="large" color="#4F8EF7" />
                <Text style={S.loaderText}>Cargando conversaciones...</Text>
            </View>
        );
    }

    if (conversaciones.length === 0) {
        return (
            <View style={S.vacio}>
                <Ionicons name="chatbubbles-outline" size={52} color="#1A2540" />
                <Text style={S.vacioTitulo}>Sin choferes disponibles</Text>
                <Text style={S.vacioSub}>
                    {'Para chatear con un chofer:\n1. Cargá su email en tabla Choferes\n2. Creá el usuario en Authentication'}
                </Text>
            </View>
        );
    }

    return (
        <FlatList
            data={conversaciones}
            keyExtractor={c => c.email}
            style={{ backgroundColor: '#060B18' }}
            contentContainerStyle={{ paddingTop: 8 }}
            renderItem={({ item }) => (
                <Pressable
                    style={({ pressed }) => [S.convItem, pressed && { opacity: 0.75 }]}
                    onPress={() => onAbrir(item)}
                >
                    {/* Avatar con punto online */}
                    <View style={S.convAvatarWrap}>
                        <View style={[S.convAvatar, item.noLeidos > 0 && S.convAvatarUnread]}>
                            <Text style={S.convAvatarText}>{iniciales(item.nombre)}</Text>
                        </View>
                        {item.online && <View style={S.onlineDot} />}
                    </View>

                    {/* Contenido */}
                    <View style={S.convInfo}>
                        <View style={S.convTopRow}>
                            <Text style={[S.convNombreItem, item.noLeidos > 0 && { color: '#FFFFFF', fontWeight: '700' }]} numberOfLines={1}>{item.nombre}</Text>
                            <Text style={[S.convHora, item.noLeidos > 0 && { color: '#4F8EF7' }]}>
                                {item.ultimaHora ? formatHora(item.ultimaHora) : ''}
                            </Text>
                        </View>
                        <View style={S.convBottomRow}>
                            <Text style={[S.convUltimoMsg, item.noLeidos > 0 && { color: '#FFFFFF', fontWeight: '600' }]}
                                numberOfLines={1}>
                                {item.ultimoMensaje.startsWith('🔔') ? '📦 ' + item.ultimoMensaje.slice(2) : item.ultimoMensaje}
                            </Text>
                            {item.noLeidos > 0 && (
                                <View style={S.badge}>
                                    <Text style={S.badgeText}>{item.noLeidos > 99 ? '99+' : item.noLeidos}</Text>
                                </View>
                            )}
                        </View>
                    </View>
                </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={S.convSeparador} />}
        />
    );
};

// ═════════════════════════════════════════════
// VISTA CONVERSACIÓN: usada por admin (al tocar) y chofer (directa)
// ═════════════════════════════════════════════

const Conversacion: React.FC<{
    miUserId: string;
    miEmail: string;
    miNombre: string;
    esAdmin: boolean;
    choferEmail: string;      // email del chofer dueño de la conversación
    choferNombre: string;     // nombre a mostrar en el header
    onVolver?: () => void;    // solo admin tiene botón de volver
}> = ({ miUserId, miEmail, miNombre, esAdmin, choferEmail, choferNombre, onVolver }) => {
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

    // ── Fetch + Realtime mensajes ─────────────────────────────────────────

    const fetchMensajes = useCallback(async () => {
        const { data } = await supabase
            .from('mensajes')
            .select('id, created_at, user_id, remitente, texto, chofer_email, visto_admin')
            .eq('chofer_email', choferEmail)
            .order('created_at', { ascending: false })
            .limit(50);
        setMensajes(data ?? []);
    }, [choferEmail]);

    const marcarVisto = useCallback(async () => {
        if (!esAdmin) return;
        await supabase
            .from('mensajes')
            .update({ visto_admin: true })
            .eq('chofer_email', choferEmail)
            .eq('visto_admin', false);
    }, [esAdmin, choferEmail]);

    useEffect(() => {
        fetchMensajes();
        if (esAdmin) marcarVisto();

        if (msgCanalRef.current) void supabase.removeChannel(msgCanalRef.current);

        const canal = supabase
            .channel(`msgs-${choferEmail.replace(/[@.]/g, '-')}`)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `chofer_email=eq.${choferEmail}` },
                (payload) => {
                    const nuevo = payload.new as Mensaje;
                    setMensajes(prev => prev.some(m => m.id === nuevo.id) ? prev : [nuevo, ...prev]);
                    if (esAdmin) marcarVisto();
                }
            )
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'mensajes', filter: `chofer_email=eq.${choferEmail}` },
                (payload) => {
                    const upd = payload.new as Mensaje;
                    setMensajes(prev => prev.map(m => m.id === upd.id ? { ...m, visto_admin: upd.visto_admin } : m));
                }
            )
            .subscribe();

        msgCanalRef.current = canal;
        return () => {
            if (msgCanalRef.current) { void supabase.removeChannel(msgCanalRef.current); msgCanalRef.current = null; }
        };
    }, [choferEmail, fetchMensajes, esAdmin, marcarVisto]);

    // ── Presence: online + escribiendo ───────────────────────────────────

    useEffect(() => {
        if (presenceCanalRef.current) void supabase.removeChannel(presenceCanalRef.current);

        const canalId = `presence-${choferEmail.replace(/[@.]/g, '-')}`;
        const canal = supabase.channel(canalId, { config: { presence: { key: miEmail } } });

        canal
            .on('presence', { event: 'sync' }, () => {
                const state = canal.presenceState();
                const emails = Object.keys(state);
                // El interlocutor está online si su email aparece en la presencia
                const interlocutorEmail = esAdmin ? choferEmail : ADMIN_EMAIL;
                setOnline(emails.includes(interlocutorEmail));
            })
            .on('broadcast', { event: 'typing' }, (payload) => {
                const { email: emailEmisor, nombre: nomEmisor, escribiendo } = payload.payload as any;
                if (emailEmisor === miEmail) return;
                setOtroEscribiendo(escribiendo);
                setNombreEscribiendo(escribiendo ? nomEmisor : '');
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await canal.track({ email: miEmail, nombre: miNombre, at: new Date().toISOString() });
                }
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

    // ── Typing broadcast ─────────────────────────────────────────────────

    const emitirTyping = (escribiendo: boolean) => {
        presenceCanalRef.current?.send({
            type: 'broadcast', event: 'typing',
            payload: { email: miEmail, nombre: miNombre, escribiendo },
        });
    };

    const handleChangeText = (val: string) => {
        setTexto(val);
        if (!estabaTypingRef.current) { estabaTypingRef.current = true; emitirTyping(true); }
        if (typingRef.current) clearTimeout(typingRef.current);
        typingRef.current = setTimeout(() => { estabaTypingRef.current = false; emitirTyping(false); }, TYPING_TIMEOUT_MS);
    };

    // ── Enviar ────────────────────────────────────────────────────────────

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
                user_id: miUserId,
                remitente: esAdmin ? 'Admin' : miNombre,
                texto: txt,
                chofer_email: choferEmail,
            }]);
            if (error) {
                setTexto(txt);
                console.error('[Chat] Error:', error.message);
            } else {
                // Push notification al destinatario en background
                void (async () => {
                    try {
                        let tokenDest: string | null = null;
                        let nombreRemit = esAdmin ? 'Admin' : miNombre;
                        if (esAdmin) {
                            const { data } = await supabase.from('Choferes').select('push_token').eq('email', choferEmail).maybeSingle();
                            tokenDest = data?.push_token ?? null;
                        } else {
                            const { data } = await supabase.from('Admins').select('push_token').eq('email', ADMIN_EMAIL).maybeSingle();
                            tokenDest = data?.push_token ?? null;
                        }
                        if (tokenDest) {
                            await enviarPush(tokenDest, `💬 ${nombreRemit}`, txt, { tipo: 'CHAT', chofer_email: choferEmail, chofer_nombre: esAdmin ? choferNombre : miNombre });
                        }
                    } catch (err) {
                        console.warn('[Push] Error enviando notificación:', err);
                    }
                })();
            }
        } catch { setTexto(txt); }
        finally { setEnviando(false); inputRef.current?.focus(); }
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: '#060B18' }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            {/* Header */}
            <View style={S.chatHeader}>
                {onVolver && (
                    <TouchableOpacity onPress={onVolver} style={S.btnVolver} activeOpacity={0.7}>
                        <Ionicons name="arrow-back" size={22} color="#4F8EF7" />
                    </TouchableOpacity>
                )}
                <View style={S.chatAvatarWrap}>
                    <View style={S.chatAvatar}>
                        {esAdmin
                            ? <Text style={S.chatAvatarText}>{iniciales(choferNombre)}</Text>
                            : <Ionicons name="person-outline" size={16} color="#4F8EF7" />
                        }
                    </View>
                    {online && <View style={S.onlineDot} />}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={S.chatNombre}>{esAdmin ? choferNombre : 'Maxi (Admin)'}</Text>
                    <Text style={S.chatSub}>
                        {otroEscribiendo ? '✏️ escribiendo...' : online ? 'En línea' : APP_NAME}
                    </Text>
                </View>
            </View>

            {/* Mensajes */}
            {mensajes.length === 0 ? (
                <View style={S.vacio}>
                    <Ionicons name="chatbubbles-outline" size={48} color="#1A2540" />
                    <Text style={S.vacioTitulo}>Sin mensajes aún</Text>
                    <Text style={S.vacioSub}>{esAdmin ? 'Escribí para iniciar.' : 'Escribile a la central.'}</Text>
                </View>
            ) : (
                <FlatList
                    data={mensajes}
                    keyExtractor={m => String(m.id)}
                    inverted
                    contentContainerStyle={S.lista}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    removeClippedSubviews
                    maxToRenderPerBatch={15}
                    renderItem={({ item, index }) => {
                        // esPropio se calcula con el miUserId pasado por prop — nunca null
                        const esPropio = item.user_id === miUserId;
                        return (
                            <View>
                                {necesitaSeparador(mensajes, index) && (
                                    <SeparadorFecha fecha={formatFechaGrupo(item.created_at)} />
                                )}
                                <Burbuja
                                    mensaje={item}
                                    esPropio={esPropio}
                                    mostrarRemitente={!esAdmin && !esPropio}
                                />
                            </View>
                        );
                    }}
                />
            )}

            {otroEscribiendo && <IndicadorEscribiendo nombre={nombreEscribiendo} />}

            {/* Input */}
            <View style={S.inputBar}>
                <TextInput
                    ref={inputRef}
                    style={S.input}
                    value={texto}
                    onChangeText={handleChangeText}
                    placeholder={esAdmin ? `Escribirle a ${choferNombre.split(' ')[0]}...` : 'Escribile a la central...'}
                    placeholderTextColor="#2A4A70"
                    multiline
                    maxLength={500}
                    returnKeyType="send"
                    blurOnSubmit={false}
                    onSubmitEditing={handleEnviar}
                />
                <TouchableOpacity
                    style={[S.btnEnviar, (!texto.trim() || enviando) && S.btnEnviarOff]}
                    onPress={handleEnviar}
                    disabled={!texto.trim() || enviando}
                    activeOpacity={0.75}
                >
                    {enviando
                        ? <ActivityIndicator size="small" color="#FFF" />
                        : <Ionicons name="send" size={18} color="#FFF" />
                    }
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
};

// ═════════════════════════════════════════════
// PANTALLA PRINCIPAL — router entre las dos vistas
// ═════════════════════════════════════════════

export default function ChatScreen() {
    const router = useRouter();
    const [cargando, setCargando] = useState(true);
    const [authError, setAuthError] = useState(false);

    const [miUserId, setMiUserId] = useState('');
    const [miEmail, setMiEmail] = useState('');
    const [miNombre, setMiNombre] = useState('Chofer');
    const [esAdmin, setEsAdmin] = useState(false);

    const [convAbierta, setConvAbierta] = useState<Conversacion | null>(null);

    // ── Inicializar usuario + registrar push token ────────────────────────
    useEffect(() => {
        const init = async () => {
            const { data: { user }, error } = await supabase.auth.getUser();
            if (error || !user) { setAuthError(true); setCargando(false); return; }
            const email = user.email ?? '';
            const nombre = user.user_metadata?.full_name || user.user_metadata?.name || email.split('@')[0] || 'Chofer';
            const admin = email === ADMIN_EMAIL;
            setMiUserId(user.id);
            setMiEmail(email);
            setMiNombre(nombre.split(' ')[0]);
            setEsAdmin(admin);
            setCargando(false);
            // Registrar token en background — no bloquea la UI
            try {
                const token = await registrarPushToken();
                if (token) await guardarTokenEnBD(email, token, admin);
            } catch (err) {
                console.warn('[Push] Error en registro:', err);
            }
        };
        init();
    }, []);

    // ── Listener: tap en notificación → navegar al chat ──────────────────
    useEffect(() => {
        const sub = Notifications.addNotificationResponseReceivedListener(response => {
            const data = response.notification.request.content.data as any;
            if (data?.tipo === 'CHAT') {
                if (data.chofer_email && esAdmin) {
                    setConvAbierta({
                        email: data.chofer_email,
                        nombre: data.chofer_nombre || data.chofer_email,
                        ultimoMensaje: '',
                        ultimaHora: '',
                        noLeidos: 0,
                        online: false,
                    });
                }
                router.push('/(drawer)/chat' as any);
            }
        });
        return () => sub.remove();
    }, [esAdmin, router]);

    if (authError) {
        return (
            <View style={S.vacio}>
                <Ionicons name="lock-closed-outline" size={52} color="#1A2540" />
                <Text style={S.vacioTitulo}>Sesión no disponible</Text>
                <Text style={S.vacioSub}>Volvé a iniciar sesión.</Text>
            </View>
        );
    }

    if (cargando) {
        return (
            <View style={S.loader}>
                <ActivityIndicator size="large" color="#4F8EF7" />
                <Text style={S.loaderText}>{esAdmin ? 'Cargando conversaciones...' : 'Conectando...'}</Text>
            </View>
        );
    }

    // ── CHOFER: entra directo a su conversación con el admin ──────────────
    if (!esAdmin) {
        return (
            <Conversacion
                miUserId={miUserId}
                miEmail={miEmail}
                miNombre={miNombre}
                esAdmin={false}
                choferEmail={miEmail}        // la conversación se identifica por el email del chofer
                choferNombre="Maxi (Admin)"
            />
        );
    }

    // ── ADMIN: si hay conversación abierta, mostrarla; si no, la lista ────
    if (convAbierta) {
        return (
            <Conversacion
                miUserId={miUserId}
                miEmail={miEmail}
                miNombre={miNombre}
                esAdmin={true}
                choferEmail={convAbierta.email}
                choferNombre={convAbierta.nombre}
                onVolver={() => setConvAbierta(null)}
            />
        );
    }

    return <ListaConversaciones onAbrir={setConvAbierta} />;
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────

const S = StyleSheet.create({
    loader: { flex: 1, backgroundColor: '#060B18', justifyContent: 'center', alignItems: 'center', gap: 14 },
    loaderText: { color: '#4A6FA5', fontSize: 13, fontWeight: '500' },
    vacio: { flex: 1, backgroundColor: '#060B18', justifyContent: 'center', alignItems: 'center', gap: 10, padding: 32 },
    vacioTitulo: { color: '#4A6FA5', fontSize: 15, fontWeight: '700', textAlign: 'center' },
    vacioSub: { color: '#2A4A70', fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 20 },

    // Lista de conversaciones (admin)
    convItem: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        paddingHorizontal: 16, paddingVertical: 14,
        backgroundColor: '#060B18',
    },
    convSeparador: { height: 1, backgroundColor: '#0A0F1E', marginLeft: 82 },
    convAvatarWrap: { position: 'relative' },
    convAvatar: {
        width: 52, height: 52, borderRadius: 26,
        backgroundColor: '#0D1526',
        borderWidth: 1, borderColor: '#1A2540',
        justifyContent: 'center', alignItems: 'center',
    },
    convAvatarText: { fontSize: 17, fontWeight: '800', color: '#4F8EF7' },
    convInfo: { flex: 1 },
    convTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
    convNombreItem: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', flex: 1, marginRight: 8 },
    convHora: { fontSize: 11, color: '#2A4A70', fontWeight: '500' },
    convBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    convUltimoMsg: { flex: 1, fontSize: 13, color: '#4A6FA5', fontWeight: '400', marginRight: 8 },
    badge: {
        backgroundColor: '#4F8EF7', borderRadius: 10,
        minWidth: 20, height: 20,
        justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5,
    },
    badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },

    // Header de conversación
    chatHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: '#0A0F1E',
        borderBottomWidth: 1, borderBottomColor: '#0D1A2E',
    },
    btnVolver: { padding: 4, marginRight: 4 },
    chatAvatarWrap: { position: 'relative' },
    chatAvatar: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(79,142,247,0.12)',
        borderWidth: 1, borderColor: 'rgba(79,142,247,0.25)',
        justifyContent: 'center', alignItems: 'center',
    },
    chatAvatarText: { fontSize: 14, fontWeight: '800', color: '#4F8EF7' },
    chatNombre: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
    chatSub: { fontSize: 11, color: '#4A6FA5', marginTop: 1 },
    onlineDot: {
        position: 'absolute', bottom: 0, right: 0,
        width: 11, height: 11, borderRadius: 6,
        backgroundColor: '#34D399', borderWidth: 2, borderColor: '#0A0F1E',
    },

    // Lista de mensajes
    lista: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 8 },

    // Separador fecha
    separadorWrapper: { flexDirection: 'row', alignItems: 'center', marginVertical: 12, paddingHorizontal: 8 },
    separadorLinea: { flex: 1, height: 1, backgroundColor: '#0D1A2E' },
    separadorTexto: { fontSize: 11, color: '#2A4A70', fontWeight: '600', marginHorizontal: 10, textTransform: 'uppercase', letterSpacing: 0.5 },

    // Burbujas
    burbujaWrapper: { marginBottom: 3, maxWidth: '80%' },
    burbujaRight: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    burbujaLeft: { alignSelf: 'flex-start', alignItems: 'flex-start' },
    remitente: { fontSize: 11, fontWeight: '700', color: '#4F8EF7', marginBottom: 3, marginLeft: 4 },
    burbuja: { borderRadius: 18, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
    burbujaPropia: { backgroundColor: '#1E4DB7', borderBottomRightRadius: 4 },
    burbujaAjena: { backgroundColor: '#0D1526', borderWidth: 1, borderColor: '#1A2540', borderBottomLeftRadius: 4 },
    burbujaTexto: { fontSize: 15, lineHeight: 20 },
    textoPropio: { color: '#FFFFFF' },
    textoAjeno: { color: '#D1D9E6' },
    burbujaFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
    hora: { fontSize: 10, fontWeight: '600' },
    horaPropia: { color: 'rgba(255,255,255,0.45)' },
    horaAjena: { color: '#2A4A70' },
    ticks: { flexDirection: 'row', alignItems: 'center' },

    // Sistema
    sistemaWrapper: { alignItems: 'center', marginVertical: 8 },
    sistemaBurbuja: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(52,211,153,0.08)',
        borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)',
        borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, maxWidth: '85%',
    },
    sistemaTexto: { flex: 1, fontSize: 12, color: '#34D399', fontWeight: '600', textAlign: 'center' },
    sistemaHora: { fontSize: 10, color: '#1A3050', fontWeight: '600' },

    // Typing
    typingWrapper: { paddingHorizontal: 14, paddingBottom: 6 },
    typingBurbuja: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#0D1526', borderWidth: 1, borderColor: '#1A2540',
        borderRadius: 18, borderBottomLeftRadius: 4,
        paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start',
    },
    typingNombre: { fontSize: 12, color: '#4A6FA5', fontWeight: '500' },
    typingDots: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    typingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#4F8EF7' },

    // Input
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 10,
        paddingHorizontal: 14, paddingVertical: 12,
        paddingBottom: Platform.OS === 'ios' ? 28 : 12,
        backgroundColor: '#0A0F1E', borderTopWidth: 1, borderTopColor: '#0D1A2E',
    },
    input: {
        flex: 1, backgroundColor: '#0D1526',
        borderRadius: 22, borderWidth: 1.5, borderColor: '#1A2540',
        color: '#FFFFFF', fontSize: 15,
        paddingHorizontal: 18, paddingTop: 11, paddingBottom: 11, maxHeight: 120,
    },
    btnEnviar: {
        width: 44, height: 44, borderRadius: 22, backgroundColor: '#4F8EF7',
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#4F8EF7', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
    },
    btnEnviarOff: { backgroundColor: '#111D35', shadowOpacity: 0, elevation: 0 },
    convAvatarUnread: {
        borderColor: '#4F8EF7',
        borderWidth: 2,
        backgroundColor: 'rgba(79,142,247,0.1)',
    },
});