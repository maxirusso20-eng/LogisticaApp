// app/(drawer)/chat.tsx
//
// Chat 1-a-1 estilo WhatsApp con:
//   ✅ Ticks de visto (✓ enviado, ✓✓ visto)
//   ✅ "Escribiendo..." en tiempo real (Supabase Presence)
//   ✅ Indicador online/offline
//   ✅ Mensajes agrupados por fecha
//   ✅ Admin ve selector de conversaciones
//   ✅ Chofer ve solo su chat con el admin

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { ADMIN_EMAIL } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

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

interface ChoferChat {
    email: string;
    nombre: string;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const formatHora = (iso: string): string => {
    try {
        return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
    } catch { return ''; }
};

const formatFecha = (iso: string): string => {
    try {
        const d = new Date(iso);
        const hoy = new Date();
        const ayer = new Date(hoy); ayer.setDate(hoy.getDate() - 1);
        if (d.toDateString() === hoy.toDateString()) return 'Hoy';
        if (d.toDateString() === ayer.toDateString()) return 'Ayer';
        return d.toLocaleDateString('es-AR', { day: '2-digit', month: 'long' });
    } catch { return ''; }
};

// Agrupa mensajes por fecha para mostrar separadores "Hoy", "Ayer", etc.
// El FlatList está invertido, así que el array viene descendente.
const necesitaSeparadorFecha = (mensajes: Mensaje[], index: number): boolean => {
    if (index === mensajes.length - 1) return true;
    const fechaActual = new Date(mensajes[index].created_at).toDateString();
    const fechaSiguiente = new Date(mensajes[index + 1].created_at).toDateString();
    return fechaActual !== fechaSiguiente;
};

const iniciales = (nombre: string): string =>
    nombre.split(' ').map(p => p[0] || '').slice(0, 2).join('').toUpperCase();

// ─────────────────────────────────────────────
// COMPONENTE: IndicadorEscribiendo (animado)
// ─────────────────────────────────────────────

const IndicadorEscribiendo: React.FC<{ nombre: string }> = ({ nombre }) => {
    const dot1 = useRef(new Animated.Value(0.3)).current;
    const dot2 = useRef(new Animated.Value(0.3)).current;
    const dot3 = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        const animar = (dot: Animated.Value, delay: number) =>
            Animated.loop(
                Animated.sequence([
                    Animated.delay(delay),
                    Animated.timing(dot, { toValue: 1, duration: 300, useNativeDriver: true }),
                    Animated.timing(dot, { toValue: 0.3, duration: 300, useNativeDriver: true }),
                    Animated.delay(600),
                ])
            ).start();

        animar(dot1, 0);
        animar(dot2, 200);
        animar(dot3, 400);
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

// ─────────────────────────────────────────────
// COMPONENTE: Burbuja de mensaje
// ─────────────────────────────────────────────

interface BurbujaProps {
    mensaje: Mensaje;
    esPropio: boolean;
    mostrarRemitente: boolean;
    esAdmin: boolean;
}

const Burbuja: React.FC<BurbujaProps> = ({ mensaje, esPropio, mostrarRemitente, esAdmin }) => {
    const esSistema = mensaje.texto.startsWith('🔔') || mensaje.remitente === 'Sistema';

    if (esSistema) {
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
        <View style={[S.burbujaWrapper, esPropio ? S.burbujaWrapperDerecha : S.burbujaWrapperIzquierda]}>
            {!esPropio && mostrarRemitente && (
                <Text style={S.remitente}>{mensaje.remitente}</Text>
            )}
            <View style={[S.burbuja, esPropio ? S.burbujaPropia : S.burbujaAjena]}>
                <Text style={[S.burbujaTexto, esPropio ? S.burbujaTextoPropio : S.burbujaTextoAjeno]}>
                    {mensaje.texto}
                </Text>

                {/* Hora + ticks de visto */}
                <View style={S.burbujaFooter}>
                    <Text style={[S.burbujaHora, esPropio ? S.burbujaHoraPropia : S.burbujaHoraAjena]}>
                        {formatHora(mensaje.created_at)}
                    </Text>
                    {/* Ticks solo en mensajes propios */}
                    {esPropio && (
                        <View style={S.ticksWrapper}>
                            {mensaje.visto_admin ? (
                                // ✓✓ azul = visto
                                <>
                                    <Ionicons name="checkmark" size={12} color="#60AEFF" style={{ marginRight: -5 }} />
                                    <Ionicons name="checkmark" size={12} color="#60AEFF" />
                                </>
                            ) : (
                                // ✓ gris = enviado, no visto
                                <Ionicons name="checkmark" size={12} color="rgba(255,255,255,0.4)" />
                            )}
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
};

// ─────────────────────────────────────────────
// COMPONENTE: Separador de fecha
// ─────────────────────────────────────────────

const SeparadorFecha: React.FC<{ fecha: string }> = ({ fecha }) => (
    <View style={S.separadorFechaWrapper}>
        <View style={S.separadorFechaLinea} />
        <Text style={S.separadorFechaTexto}>{fecha}</Text>
        <View style={S.separadorFechaLinea} />
    </View>
);

// ─────────────────────────────────────────────
// COMPONENTE: Selector de conversaciones (admin)
// ─────────────────────────────────────────────

interface SelectorProps {
    choferes: ChoferChat[];
    seleccionado: ChoferChat | null;
    onSeleccionar: (c: ChoferChat) => void;
    onlineEmails: Set<string>;
}

const SelectorConversaciones: React.FC<SelectorProps> = ({ choferes, seleccionado, onSeleccionar, onlineEmails }) => (
    <View style={S.selectorContainer}>
        <Text style={S.selectorLabel}>CONVERSACIONES · {choferes.length} choferes</Text>
        <FlatList
            data={choferes}
            keyExtractor={c => c.email}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={S.selectorList}
            renderItem={({ item }) => {
                const activo = seleccionado?.email === item.email;
                const online = onlineEmails.has(item.email);
                return (
                    <TouchableOpacity
                        style={[S.selectorChip, activo && S.selectorChipActivo]}
                        onPress={() => onSeleccionar(item)}
                        activeOpacity={0.75}
                    >
                        <View style={S.selectorAvatarWrap}>
                            <View style={[S.selectorAvatar, activo && S.selectorAvatarActivo]}>
                                <Text style={[S.selectorAvatarText, activo && { color: '#4F8EF7' }]}>
                                    {iniciales(item.nombre)}
                                </Text>
                            </View>
                            {/* Punto verde de online */}
                            {online && <View style={S.onlineDotSelector} />}
                        </View>
                        <Text style={[S.selectorNombre, activo && S.selectorNombreActivo]} numberOfLines={1}>
                            {item.nombre.split(' ')[0]}
                        </Text>
                    </TouchableOpacity>
                );
            }}
        />
    </View>
);

// ─────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────

export default function ChatScreen() {
    const [mensajes, setMensajes] = useState<Mensaje[]>([]);
    const [texto, setTexto] = useState('');
    const [cargando, setCargando] = useState(true);
    const [enviando, setEnviando] = useState(false);
    const [authError, setAuthError] = useState(false);

    const [userId, setUserId] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [nombreRemitente, setNombreRemitente] = useState('Chofer');
    const [esAdmin, setEsAdmin] = useState(false);

    const [choferes, setChoferes] = useState<ChoferChat[]>([]);
    const [choferSeleccionado, setChoferSeleccionado] = useState<ChoferChat | null>(null);

    // Presencia: quién está online y quién está escribiendo
    const [onlineEmails, setOnlineEmails] = useState<Set<string>>(new Set());
    const [otroEscribiendo, setOtroEscribiendo] = useState(false);
    const [nombreEscribiendo, setNombreEscribiendo] = useState('');

    const inputRef = useRef<TextInput>(null);
    const mensajesChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const presenceChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
    const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const estabaEscribiendoRef = useRef(false);

    // Email de la conversación activa
    const conversacionEmail = esAdmin ? choferSeleccionado?.email ?? null : userEmail;

    // ── 1. Cargar choferes (admin) ────────────────────────────────────────

    const cargarChoferes = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('Choferes')
                .select('email, nombre')
                .not('email', 'is', null)
                .neq('email', '')
                .order('nombre', { ascending: true });

            if (error) { console.error('[Chat] Error cargando choferes:', error.message); return; }

            const lista: ChoferChat[] = (data || [])
                .filter((c: any) => c.email?.trim())
                .map((c: any) => ({ email: c.email.trim(), nombre: c.nombre || c.email }));

            setChoferes(lista);
            if (lista.length > 0) setChoferSeleccionado(lista[0]);
        } catch (err) {
            console.error('[Chat] Error inesperado cargando choferes:', err);
        }
    }, []);

    // ── 2. Inicializar usuario y rol ──────────────────────────────────────

    useEffect(() => {
        const inicializar = async () => {
            try {
                const { data: { user }, error } = await supabase.auth.getUser();
                if (error || !user) { setAuthError(true); return; }

                setUserId(user.id);
                setUserEmail(user.email ?? null);

                const nombre =
                    user.user_metadata?.full_name ||
                    user.user_metadata?.name ||
                    user.email?.split('@')[0] || 'Chofer';
                setNombreRemitente(nombre.split(' ')[0]);

                const admin = user.email === ADMIN_EMAIL;
                setEsAdmin(admin);
                if (admin) await cargarChoferes();

            } catch (err) {
                console.error('[Chat] Error en inicializar:', err);
                setAuthError(true);
            } finally {
                setCargando(false);
            }
        };
        inicializar();
    }, [cargarChoferes]);

    // ── 3. Fetch de mensajes + Realtime de nuevos mensajes ────────────────

    const fetchMensajes = useCallback(async (emailConversacion: string) => {
        try {
            const { data, error } = await supabase
                .from('mensajes')
                .select('id, created_at, user_id, remitente, texto, chofer_email, visto_admin')
                .eq('chofer_email', emailConversacion)
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) { console.error('[Chat] Error cargando mensajes:', error.message); setMensajes([]); return; }
            setMensajes(data ?? []);
        } catch (err) {
            console.error('[Chat] Error inesperado:', err);
            setMensajes([]);
        } finally {
            setCargando(false);
        }
    }, []);

    // ── 4. Marcar mensajes como vistos ────────────────────────────────────
    //
    // Cuando el admin abre una conversación, marca como vistos todos los
    // mensajes del chofer que todavía no tienen visto_admin = true.
    // El chofer ve el cambio al instante via Realtime UPDATE.

    const marcarComoVisto = useCallback(async (emailConversacion: string, esAdminLocal: boolean) => {
        if (!esAdminLocal) return; // solo el admin marca como visto
        try {
            const { error } = await supabase
                .from('mensajes')
                .update({ visto_admin: true })
                .eq('chofer_email', emailConversacion)
                .eq('visto_admin', false);
            if (error) {
                // Silencioso — los ticks son una feature opcional, no bloquean el chat
                console.warn('[Chat] visto_admin update:', error.message);
            }
        } catch (err) {
            console.warn('[Chat] Error marcando como visto:', err);
        }
    }, []);

    // ── 5. Canal de mensajes (INSERT + UPDATE para ticks de visto) ─────────

    useEffect(() => {
        if (!conversacionEmail) return;

        fetchMensajes(conversacionEmail);

        // Marcar como visto cuando el admin abre la conversación
        if (esAdmin) marcarComoVisto(conversacionEmail, true);

        if (mensajesChannelRef.current) void supabase.removeChannel(mensajesChannelRef.current);

        const canal = supabase
            .channel(`chat-msgs-${conversacionEmail.replace(/[@.]/g, '-')}`)
            .on('postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'mensajes', filter: `chofer_email=eq.${conversacionEmail}` },
                (payload) => {
                    const nuevo = payload.new as Mensaje;
                    setMensajes(prev => {
                        if (prev.some(m => m.id === nuevo.id)) return prev;
                        return [nuevo, ...prev];
                    });
                    // Si soy admin y acabo de recibir un mensaje del chofer → marcarlo visto inmediatamente
                    if (esAdmin) marcarComoVisto(conversacionEmail, true);
                }
            )
            .on('postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'mensajes', filter: `chofer_email=eq.${conversacionEmail}` },
                (payload) => {
                    // Actualizar el campo visto_admin para que los ticks cambien en tiempo real
                    const actualizado = payload.new as Mensaje;
                    setMensajes(prev =>
                        prev.map(m => m.id === actualizado.id ? { ...m, visto_admin: actualizado.visto_admin } : m)
                    );
                }
            )
            .subscribe();

        mensajesChannelRef.current = canal;

        return () => {
            if (mensajesChannelRef.current) {
                void supabase.removeChannel(mensajesChannelRef.current);
                mensajesChannelRef.current = null;
            }
        };
    }, [conversacionEmail, fetchMensajes, esAdmin, marcarComoVisto]);

    // ── 6. Canal de Presence (online + escribiendo) ───────────────────────
    //
    // Supabase Presence es un canal efímero: cuando el usuario cierra la app
    // o navega a otra pantalla, su presencia desaparece automáticamente.
    // Usamos el mismo canal para dos cosas:
    //   a) saber quién está online (track de presencia)
    //   b) broadcasting de "escribiendo" (broadcast efímero, sin DB)

    useEffect(() => {
        if (!conversacionEmail || !userEmail) return;

        if (presenceChannelRef.current) void supabase.removeChannel(presenceChannelRef.current);

        const canalId = `chat-presence-${conversacionEmail.replace(/[@.]/g, '-')}`;

        const canal = supabase.channel(canalId, {
            config: { presence: { key: userEmail } },
        });

        // Escuchar cambios de presencia (quién está online)
        canal.on('presence', { event: 'sync' }, () => {
            const state = canal.presenceState();
            const emails = new Set(Object.keys(state));
            setOnlineEmails(emails);
        });

        // Escuchar broadcasts de "escribiendo"
        canal.on('broadcast', { event: 'typing' }, (payload) => {
            const { email: emailEmisor, nombre: nombreEmisor, escribiendo } = payload.payload as {
                email: string;
                nombre: string;
                escribiendo: boolean;
            };

            // No mostrar "escribiendo" si soy yo el que escribe
            if (emailEmisor === userEmail) return;

            setOtroEscribiendo(escribiendo);
            setNombreEscribiendo(escribiendo ? nombreEmisor : '');
        });

        // Entrar al canal y trackear mi presencia
        canal.subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                await canal.track({ email: userEmail, nombre: nombreRemitente, online_at: new Date().toISOString() });
            }
        });

        presenceChannelRef.current = canal;

        return () => {
            // Al salir del chat, dejar de trackear presencia
            if (presenceChannelRef.current) {
                void presenceChannelRef.current.untrack();
                void supabase.removeChannel(presenceChannelRef.current);
                presenceChannelRef.current = null;
            }
        };
    }, [conversacionEmail, userEmail, nombreRemitente]);

    // ── 7. Emitir "escribiendo" mientras el usuario tipea ─────────────────

    const emitirTyping = useCallback((escribiendo: boolean) => {
        if (!presenceChannelRef.current || !userEmail) return;
        presenceChannelRef.current.send({
            type: 'broadcast',
            event: 'typing',
            payload: { email: userEmail, nombre: nombreRemitente, escribiendo },
        });
    }, [userEmail, nombreRemitente]);

    const handleChangeText = (value: string) => {
        setTexto(value);

        if (!estabaEscribiendoRef.current) {
            estabaEscribiendoRef.current = true;
            emitirTyping(true);
        }

        // Resetear el timeout cada vez que se tipea
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => {
            estabaEscribiendoRef.current = false;
            emitirTyping(false);
        }, TYPING_TIMEOUT_MS);
    };

    // ── 8. Enviar mensaje ─────────────────────────────────────────────────

    const handleEnviar = async () => {
        const textoLimpio = texto.trim();
        if (!textoLimpio || !userId || !conversacionEmail || enviando) return;

        // Dejar de emitir "escribiendo" al enviar
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        estabaEscribiendoRef.current = false;
        emitirTyping(false);

        setEnviando(true);
        setTexto('');

        try {
            const { error } = await supabase
                .from('mensajes')
                .insert([{
                    user_id: userId,
                    remitente: esAdmin ? 'Maxi (Admin)' : nombreRemitente,
                    texto: textoLimpio,
                    chofer_email: conversacionEmail,
                    // visto_admin se setea via UPDATE separado, no en el insert
                    // para evitar conflictos si la columna no está en todas las versiones de RLS
                }]);

            if (error) {
                setTexto(textoLimpio);
                console.error('[Chat] Error enviando:', error.message);
            }
        } catch (err) {
            setTexto(textoLimpio);
            console.error('[Chat] Error inesperado:', err);
        } finally {
            setEnviando(false);
            inputRef.current?.focus();
        }
    };

    // ── Estado online del interlocutor ────────────────────────────────────

    const interlocutorOnline = esAdmin
        ? onlineEmails.has(choferSeleccionado?.email ?? '')
        : onlineEmails.has(ADMIN_EMAIL);

    const interlocutorNombre = esAdmin
        ? (choferSeleccionado?.nombre.split(' ')[0] ?? 'Chofer')
        : 'Maxi (Admin)';

    // ── Render ─────────────────────────────────────────────────────────────

    if (authError) {
        return (
            <View style={S.authErrorContainer}>
                <Ionicons name="lock-closed-outline" size={52} color="#1A2540" />
                <Text style={S.authErrorTitulo}>Sesión no disponible</Text>
                <Text style={S.authErrorSub}>Volvé a iniciar sesión para usar el chat.</Text>
            </View>
        );
    }

    if (cargando) {
        return (
            <View style={S.loader}>
                <ActivityIndicator size="large" color="#4F8EF7" />
                <Text style={S.loaderText}>{esAdmin ? 'Cargando conversaciones...' : 'Conectando al chat...'}</Text>
            </View>
        );
    }

    if (esAdmin && choferes.length === 0) {
        return (
            <View style={S.vacio}>
                <Ionicons name="people-outline" size={52} color="#1A2540" />
                <Text style={S.vacioTitulo}>Sin choferes con email</Text>
                <Text style={S.vacioSub}>Asigná un email a tus choferes en la tabla Choferes.</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={S.root}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            {/* ── Selector de conversaciones (admin) ── */}
            {esAdmin && (
                <SelectorConversaciones
                    choferes={choferes}
                    seleccionado={choferSeleccionado}
                    onlineEmails={onlineEmails}
                    onSeleccionar={(c) => {
                        setChoferSeleccionado(c);
                        setMensajes([]);
                        setOtroEscribiendo(false);
                        setCargando(true);
                    }}
                />
            )}

            {/* ── Header de conversación ── */}
            <View style={S.convHeader}>
                <View style={S.convAvatarWrap}>
                    <View style={S.convAvatarBox}>
                        {esAdmin
                            ? <Text style={S.convAvatarText}>{iniciales(choferSeleccionado?.nombre ?? 'C')}</Text>
                            : <Ionicons name="person-outline" size={16} color="#4F8EF7" />
                        }
                    </View>
                    {interlocutorOnline && <View style={S.onlineDot} />}
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={S.convNombre}>{interlocutorNombre}</Text>
                    <Text style={S.convSub}>
                        {otroEscribiendo
                            ? '✏️ escribiendo...'
                            : interlocutorOnline
                                ? 'En línea'
                                : 'Logística Hogareño'
                        }
                    </Text>
                </View>
            </View>

            {/* ── Lista de mensajes ── */}
            {mensajes.length === 0 ? (
                <View style={S.vacio}>
                    <Ionicons name="chatbubbles-outline" size={52} color="#1A2540" />
                    <Text style={S.vacioTitulo}>
                        {esAdmin && choferSeleccionado ? `Sin mensajes con ${choferSeleccionado.nombre}` : 'Aún no hay mensajes'}
                    </Text>
                    <Text style={S.vacioSub}>
                        {esAdmin ? 'Escribí para iniciar la conversación.' : 'Escribile a la central.'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={mensajes}
                    keyExtractor={(item) => String(item.id)}
                    renderItem={({ item, index }) => (
                        <View>
                            {necesitaSeparadorFecha(mensajes, index) && (
                                <SeparadorFecha fecha={formatFecha(item.created_at)} />
                            )}
                            <Burbuja
                                mensaje={item}
                                esPropio={item.user_id === userId}
                                mostrarRemitente={!esAdmin && item.user_id !== userId}
                                esAdmin={esAdmin}
                            />
                        </View>
                    )}
                    inverted={true}
                    contentContainerStyle={S.lista}
                    showsVerticalScrollIndicator={false}
                    removeClippedSubviews={true}
                    maxToRenderPerBatch={15}
                    windowSize={10}
                    initialNumToRender={20}
                    keyboardShouldPersistTaps="handled"
                />
            )}

            {/* ── Indicador "escribiendo" debajo de la lista ── */}
            {otroEscribiendo && (
                <IndicadorEscribiendo nombre={nombreEscribiendo} />
            )}

            {/* ── Input bar ── */}
            <View style={S.inputBar}>
                <TextInput
                    ref={inputRef}
                    style={S.input}
                    value={texto}
                    onChangeText={handleChangeText}
                    placeholder={
                        esAdmin && choferSeleccionado
                            ? `Escribirle a ${choferSeleccionado.nombre.split(' ')[0]}...`
                            : 'Escribile a la central...'
                    }
                    placeholderTextColor="#2A4A70"
                    multiline
                    maxLength={500}
                    returnKeyType="send"
                    blurOnSubmit={false}
                    onSubmitEditing={handleEnviar}
                />
                <TouchableOpacity
                    style={[S.btnEnviar, (!texto.trim() || enviando) && S.btnEnviarDeshabilitado]}
                    onPress={handleEnviar}
                    disabled={!texto.trim() || enviando}
                    activeOpacity={0.75}
                >
                    {enviando
                        ? <ActivityIndicator size="small" color="#FFFFFF" />
                        : <Ionicons name="send" size={18} color="#FFFFFF" />
                    }
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────

const S = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#060B18' },
    loader: { flex: 1, backgroundColor: '#060B18', justifyContent: 'center', alignItems: 'center', gap: 14 },
    loaderText: { color: '#4A6FA5', fontSize: 13, fontWeight: '500' },
    authErrorContainer: { flex: 1, backgroundColor: '#060B18', justifyContent: 'center', alignItems: 'center', gap: 12, paddingHorizontal: 40 },
    authErrorTitulo: { color: '#4A6FA5', fontSize: 16, fontWeight: '700', textAlign: 'center' },
    authErrorSub: { color: '#2A4A70', fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 20 },

    // Header
    convHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: '#0A0F1E',
        borderBottomWidth: 1, borderBottomColor: '#0D1A2E',
    },
    convAvatarWrap: { position: 'relative' },
    convAvatarBox: {
        width: 40, height: 40, borderRadius: 20,
        backgroundColor: 'rgba(79,142,247,0.12)',
        borderWidth: 1, borderColor: 'rgba(79,142,247,0.25)',
        justifyContent: 'center', alignItems: 'center',
    },
    convAvatarText: { fontSize: 14, fontWeight: '800', color: '#4F8EF7' },
    convNombre: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
    convSub: { fontSize: 11, color: '#4A6FA5', marginTop: 1 },

    // Punto online en header
    onlineDot: {
        position: 'absolute', bottom: 0, right: 0,
        width: 11, height: 11, borderRadius: 6,
        backgroundColor: '#34D399',
        borderWidth: 2, borderColor: '#0A0F1E',
    },

    // Selector admin
    selectorContainer: { backgroundColor: '#0A0F1E', borderBottomWidth: 1, borderBottomColor: '#0D1A2E' },
    selectorLabel: {
        fontSize: 10, fontWeight: '800', color: '#2A4A70',
        letterSpacing: 1.5, paddingHorizontal: 16, paddingTop: 12, textTransform: 'uppercase',
    },
    selectorList: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
    selectorChip: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#0D1526', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
        borderWidth: 1, borderColor: '#1A2540',
    },
    selectorChipActivo: { backgroundColor: 'rgba(79,142,247,0.12)', borderColor: '#4F8EF7' },
    selectorAvatarWrap: { position: 'relative' },
    selectorAvatar: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: '#111D35', justifyContent: 'center', alignItems: 'center',
    },
    selectorAvatarActivo: { backgroundColor: 'rgba(79,142,247,0.2)' },
    selectorAvatarText: { fontSize: 12, fontWeight: '800', color: '#4A6FA5' },
    selectorNombre: { fontSize: 13, fontWeight: '600', color: '#4A6FA5', maxWidth: 80 },
    selectorNombreActivo: { color: '#FFFFFF' },
    onlineDotSelector: {
        position: 'absolute', bottom: -1, right: -1,
        width: 9, height: 9, borderRadius: 5,
        backgroundColor: '#34D399', borderWidth: 1.5, borderColor: '#0A0F1E',
    },

    // Lista
    lista: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 8 },

    // Vacío
    vacio: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, padding: 32 },
    vacioTitulo: { color: '#4A6FA5', fontSize: 15, fontWeight: '700', textAlign: 'center' },
    vacioSub: { color: '#2A4A70', fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 20 },

    // Separador de fecha
    separadorFechaWrapper: {
        flexDirection: 'row', alignItems: 'center',
        marginVertical: 12, paddingHorizontal: 8,
    },
    separadorFechaLinea: { flex: 1, height: 1, backgroundColor: '#0D1A2E' },
    separadorFechaTexto: {
        fontSize: 11, color: '#2A4A70', fontWeight: '600',
        marginHorizontal: 10, textTransform: 'uppercase', letterSpacing: 0.5,
    },

    // Burbujas
    burbujaWrapper: { marginBottom: 3, maxWidth: '80%' },
    burbujaWrapperDerecha: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    burbujaWrapperIzquierda: { alignSelf: 'flex-start', alignItems: 'flex-start' },
    remitente: { fontSize: 11, fontWeight: '700', color: '#4F8EF7', marginBottom: 3, marginLeft: 4 },
    burbuja: { borderRadius: 18, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 8 },
    burbujaPropia: { backgroundColor: '#1E4DB7', borderBottomRightRadius: 4 },
    burbujaAjena: { backgroundColor: '#0D1526', borderWidth: 1, borderColor: '#1A2540', borderBottomLeftRadius: 4 },
    burbujaTexto: { fontSize: 15, lineHeight: 20 },
    burbujaTextoPropio: { color: '#FFFFFF' },
    burbujaTextoAjeno: { color: '#D1D9E6' },

    // Footer de burbuja (hora + ticks)
    burbujaFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 4 },
    burbujaHora: { fontSize: 10, fontWeight: '600' },
    burbujaHoraPropia: { color: 'rgba(255,255,255,0.45)' },
    burbujaHoraAjena: { color: '#2A4A70' },
    ticksWrapper: { flexDirection: 'row', alignItems: 'center' },

    // Mensajes de sistema
    sistemaWrapper: { alignItems: 'center', marginVertical: 8 },
    sistemaBurbuja: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(52,211,153,0.08)',
        borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)',
        borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, maxWidth: '85%',
    },
    sistemaTexto: { flex: 1, fontSize: 12, color: '#34D399', fontWeight: '600', textAlign: 'center' },
    sistemaHora: { fontSize: 10, color: '#1A3050', fontWeight: '600' },

    // Typing indicator
    typingWrapper: { paddingHorizontal: 14, paddingBottom: 6 },
    typingBurbuja: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#0D1526',
        borderWidth: 1, borderColor: '#1A2540',
        borderRadius: 18, borderBottomLeftRadius: 4,
        paddingHorizontal: 14, paddingVertical: 10,
        alignSelf: 'flex-start',
    },
    typingNombre: { fontSize: 12, color: '#4A6FA5', fontWeight: '500' },
    typingDots: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    typingDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#4F8EF7' },

    // Input bar
    inputBar: {
        flexDirection: 'row', alignItems: 'flex-end', gap: 10,
        paddingHorizontal: 14, paddingVertical: 12,
        paddingBottom: Platform.OS === 'ios' ? 28 : 12,
        backgroundColor: '#0A0F1E',
        borderTopWidth: 1, borderTopColor: '#0D1A2E',
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
    btnEnviarDeshabilitado: { backgroundColor: '#111D35', shadowOpacity: 0, elevation: 0 },
});