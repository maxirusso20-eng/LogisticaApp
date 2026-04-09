// app/(drawer)/chat.tsx
//
// Chat 1-a-1 entre cada chofer y el admin (maxirusso20@gmail.com).
// Cada conversación está identificada por el chofer_id.
//   • Admin: ve selector de chofer, puede escribir en cualquier conversación.
//   • Chofer: ve solo su propia conversación con el admin.
//
// Columnas de la tabla `mensajes`:
//   id, created_at, user_id, remitente, texto, chofer_id

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

// ─────────────────────────────────────────────
// CONSTANTE: email del administrador
// ─────────────────────────────────────────────

const ADMIN_EMAIL = 'maxirusso20@gmail.com';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

interface Mensaje {
    id: number;
    created_at: string;
    user_id: string;
    remitente: string;
    texto: string;
    chofer_id: string;
}

interface Chofer {
    id: string;
    nombre: string;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const formatHora = (iso: string): string => {
    try {
        return new Date(iso).toLocaleTimeString('es-AR', {
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '';
    }
};

const esPrimerDelGrupo = (mensajes: Mensaje[], index: number): boolean => {
    if (index === mensajes.length - 1) return true;
    return mensajes[index].user_id !== mensajes[index + 1].user_id;
};

// ─────────────────────────────────────────────
// BURBUJA DE MENSAJE
// ─────────────────────────────────────────────

interface BurbujaProps {
    mensaje: Mensaje;
    esPropio: boolean;
    mostrarRemitente: boolean;
}

const Burbuja: React.FC<BurbujaProps> = ({ mensaje, esPropio, mostrarRemitente }) => {
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
                <Text style={[S.burbujaHora, esPropio ? S.burbujaHoraPropia : S.burbujaHoraAjena]}>
                    {formatHora(mensaje.created_at)}
                </Text>
            </View>
        </View>
    );
};

// ─────────────────────────────────────────────
// SELECTOR DE CHOFER (solo visible para el admin)
// ─────────────────────────────────────────────

interface SelectorChoferProps {
    choferes: Chofer[];
    seleccionado: Chofer | null;
    onSeleccionar: (c: Chofer) => void;
}

const SelectorChofer: React.FC<SelectorChoferProps> = ({ choferes, seleccionado, onSeleccionar }) => (
    <View style={S.selectorContainer}>
        <Text style={S.selectorLabel}>CONVERSACIONES</Text>
        <FlatList
            data={choferes}
            keyExtractor={c => c.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 10 }}
            renderItem={({ item }) => {
                const activo = seleccionado?.id === item.id;
                return (
                    <TouchableOpacity
                        style={[S.selectorChip, activo && S.selectorChipActivo]}
                        onPress={() => onSeleccionar(item)}
                        activeOpacity={0.75}
                    >
                        <View style={[S.selectorAvatar, activo && S.selectorAvatarActivo]}>
                            <Text style={[S.selectorAvatarText, activo && { color: '#4F8EF7' }]}>
                                {item.nombre.charAt(0).toUpperCase()}
                            </Text>
                        </View>
                        <Text style={[S.selectorNombre, activo && S.selectorNombreActivo]} numberOfLines={1}>
                            {item.nombre}
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
    // Estado de error de autenticación — cuando es true el componente muestra
    // un mensaje amigable en lugar de bloquear el Drawer o tirar excepción.
    const [authError, setAuthError] = useState(false);

    const [userId, setUserId] = useState<string | null>(null);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [nombreRemitente, setNombreRemitente] = useState('Chofer');
    const [esAdmin, setEsAdmin] = useState(false);

    const [choferes, setChoferes] = useState<Chofer[]>([]);
    const [choferSeleccionado, setChoferSeleccionado] = useState<Chofer | null>(null);

    const inputRef = useRef<TextInput>(null);
    const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

    // ── 1. Obtener usuario y detectar rol ────────────────────────────────
    //
    // FIX 1: usa getUser() que valida la sesión contra el servidor,
    // nunca confía solo en el token local almacenado en AsyncStorage.
    // FIX 2: si hay error de auth o user es null, activa authError para
    // mostrar UI amigable en lugar de bloquear el Drawer.
    // FIX 3: toda la lógica que toca Supabase queda dentro del bloque
    // válido — nunca se ejecuta si el usuario no está autenticado.
    // FIX 4: finally garantiza setCargando(false) en cualquier escenario.

    useEffect(() => {
        const inicializar = async () => {
            try {
                // FIX 1: getUser() verifica el token contra Supabase Auth server.
                // Detecta "auth session missing", tokens expirados y sesiones revocadas.
                const { data: { user }, error } = await supabase.auth.getUser();

                // FIX 2: error explícito de auth (incluye "auth session missing") →
                // activar estado de error para que el render muestre mensaje amigable
                // en lugar de pantalla en blanco o lockup del Drawer.
                if (error) {
                    console.error('[Chat] Error de sesión (auth session missing u otro):', error.message);
                    setAuthError(true);
                    return;
                }

                // FIX 2 (cont.): user null sin error explícito también es sesión inválida.
                if (!user) {
                    console.warn('[Chat] getUser() devolvió null — no hay sesión activa.');
                    setAuthError(true);
                    return;
                }

                // A partir de acá user está garantizado como no-null.
                setUserId(user.id);
                setUserEmail(user.email ?? null);

                const nombre =
                    user.user_metadata?.full_name ||
                    user.user_metadata?.name ||
                    user.email?.split('@')[0] ||
                    'Chofer';
                setNombreRemitente(nombre.split(' ')[0]);

                const admin = user.email === ADMIN_EMAIL;
                setEsAdmin(admin);

                // FIX 3: toda llamada a Supabase está implícitamente dentro del
                // bloque if (user) — solo llegamos acá si la sesión es válida.
                if (admin) {
                    await cargarChoferes();
                }

            } catch (err) {
                console.error('[Chat] Error inesperado en inicializar:', err);
                // Cualquier excepción no contemplada activa el error UI también,
                // evitando que el componente quede en estado indefinido.
                setAuthError(true);
            } finally {
                // FIX 4: se ejecuta SIEMPRE — éxito, error de auth, user null,
                // excepción, red caída. El loader desaparece en todos los casos.
                setCargando(false);
            }
        };

        inicializar();
    }, []);

    // ── 2. Cargar lista de choferes (solo admin) ──────────────────────────

    const cargarChoferes = async () => {
        // Nota: este finally ya existía y es correcto.
        // Lo dejamos acá porque el admin vuelve a necesitarlo si recarga.
        try {
            const { data, error } = await supabase
                .from('Choferes')
                .select('user_id, nombre')
                .not('user_id', 'is', null)
                .order('nombre', { ascending: true });

            // FIX: loguear el error de Supabase para detectar problemas de RLS
            if (error) {
                console.error('[Chat] Error Supabase Chat (cargarChoferes):', error);
                throw error;
            }

            const lista: Chofer[] = (data || [])
                .filter((c: any) => c.user_id)
                .map((c: any) => ({ id: c.user_id, nombre: c.nombre }));

            setChoferes(lista);
            if (lista.length > 0) setChoferSeleccionado(lista[0]);
        } catch (err) {
            console.error('[Chat] Error cargando choferes:', err);
        }
        // Sin finally acá: el setCargando(false) lo maneja el finally
        // del useEffect padre (inicializar), evitando duplicar la llamada.
    };

    // ── 3. Determinar el chofer_id de la conversación activa ─────────────

    const conversacionChoferId = esAdmin
        ? choferSeleccionado?.id ?? null
        : userId;

    // ── 4. Fetch de mensajes + suscripción Realtime ───────────────────────

    const fetchMensajes = useCallback(async (choferId: string) => {
        try {
            const { data, error } = await supabase
                .from('mensajes')
                .select('id, created_at, user_id, remitente, texto, chofer_id')
                .eq('chofer_id', choferId)
                .order('created_at', { ascending: false })
                .limit(50);

            // FIX: loguear el error de Supabase para detectar rechazos de RLS
            if (error) {
                console.error('[Chat] Error Supabase Chat (fetchMensajes):', error);
                throw error;
            }

            // FIX: data vacía ([]) es un resultado válido — setear el array vacío
            // y dejar que el render muestre el estado "sin mensajes" normalmente.
            setMensajes(data ?? []);

        } catch (err) {
            console.error('[Chat] Error cargando mensajes:', err);
            // En caso de error también limpiar los mensajes anteriores
            setMensajes([]);
        } finally {
            // FIX: finally garantiza que el loader desaparezca haya éxito,
            // error, o array vacío devuelto por Supabase.
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        if (!conversacionChoferId) return;

        fetchMensajes(conversacionChoferId);

        if (channelRef.current) {
            void supabase.removeChannel(channelRef.current);
        }

        const channel = supabase
            .channel(`chat-${conversacionChoferId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'mensajes',
                    filter: `chofer_id=eq.${conversacionChoferId}`,
                },
                (payload) => {
                    const nuevo = payload.new as Mensaje;
                    setMensajes(prev => {
                        if (prev.some(m => m.id === nuevo.id)) return prev;
                        return [nuevo, ...prev];
                    });
                }
            )
            .subscribe();

        channelRef.current = channel;

        return () => {
            if (channelRef.current) {
                void supabase.removeChannel(channelRef.current);
                channelRef.current = null;
            }
        };
    }, [conversacionChoferId, fetchMensajes]);

    // ── 5. Enviar mensaje ─────────────────────────────────────────────────

    const handleEnviar = async () => {
        const textoLimpio = texto.trim();
        if (!textoLimpio || !userId || !conversacionChoferId || enviando) return;

        setEnviando(true);
        setTexto('');

        try {
            const { error } = await supabase
                .from('mensajes')
                .insert([{
                    user_id: userId,
                    remitente: esAdmin ? 'Maxi (Admin)' : nombreRemitente,
                    texto: textoLimpio,
                    chofer_id: conversacionChoferId,
                }]);

            if (error) {
                setTexto(textoLimpio);
                console.error('[Chat] Error enviando:', error.message);
            }
        } catch (err) {
            setTexto(textoLimpio);
            console.error('[Chat] Error inesperado al enviar:', err);
        } finally {
            setEnviando(false);
            inputRef.current?.focus();
        }
    };

    // ── Render ─────────────────────────────────────────────────────────────

    // FIX 2 + 4: si hay error de auth el componente SIEMPRE retorna un View
    // con mensaje claro. Nunca bloquea el Drawer ni deja pantalla en blanco.
    // El usuario puede navegar a otras secciones normalmente.
    if (authError) {
        return (
            <View style={S.authErrorContainer}>
                <Ionicons name="lock-closed-outline" size={52} color="#1A2540" />
                <Text style={S.authErrorTitulo}>Sesión no disponible</Text>
                <Text style={S.authErrorSub}>
                    Por favor, volvé a iniciar sesión para usar el chat.
                </Text>
            </View>
        );
    }

    if (cargando) {
        return (
            <View style={S.loader}>
                <ActivityIndicator size="large" color="#4F8EF7" />
                <Text style={S.loaderText}>
                    {esAdmin ? 'Cargando conversaciones...' : 'Conectando al chat...'}
                </Text>
            </View>
        );
    }

    if (esAdmin && choferes.length === 0) {
        return (
            <View style={S.vacio}>
                <Ionicons name="people-outline" size={52} color="#1A2540" />
                <Text style={S.vacioTitulo}>Sin choferes registrados</Text>
                <Text style={S.vacioSub}>Asigná un user_id a cada chofer en la tabla Choferes.</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={S.root}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            {/* ── Selector de chofer (solo admin) ── */}
            {esAdmin && (
                <SelectorChofer
                    choferes={choferes}
                    seleccionado={choferSeleccionado}
                    onSeleccionar={(c) => {
                        setChoferSeleccionado(c);
                        setMensajes([]);
                        setCargando(true);
                    }}
                />
            )}

            {/* ── Header de conversación (chofer ve con quién habla) ── */}
            {!esAdmin && (
                <View style={S.convHeader}>
                    <View style={S.convAvatarBox}>
                        <Ionicons name="person-outline" size={16} color="#4F8EF7" />
                    </View>
                    <View>
                        <Text style={S.convNombre}>Maxi (Admin)</Text>
                        <Text style={S.convSub}>Logística Hogareño</Text>
                    </View>
                    <View style={S.convOnline} />
                </View>
            )}

            {/* ── Lista de mensajes ── */}
            {mensajes.length === 0 ? (
                <View style={S.vacio}>
                    <Ionicons name="chatbubbles-outline" size={52} color="#1A2540" />
                    <Text style={S.vacioTitulo}>
                        {esAdmin && choferSeleccionado
                            ? `Sin mensajes con ${choferSeleccionado.nombre}`
                            : 'Aún no hay mensajes'
                        }
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
                        <Burbuja
                            mensaje={item}
                            esPropio={item.user_id === userId}
                            mostrarRemitente={esPrimerDelGrupo(mensajes, index)}
                        />
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

            {/* ── Input bar ── */}
            <View style={S.inputBar}>
                <TextInput
                    ref={inputRef}
                    style={S.input}
                    value={texto}
                    onChangeText={setTexto}
                    placeholder={
                        esAdmin && choferSeleccionado
                            ? `Escribirle a ${choferSeleccionado.nombre}...`
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
                    {enviando ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                        <Ionicons name="send" size={18} color="#FFFFFF" />
                    )}
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
    loader: {
        flex: 1, backgroundColor: '#060B18',
        justifyContent: 'center', alignItems: 'center', gap: 14,
    },
    loaderText: { color: '#4A6FA5', fontSize: 13, fontWeight: '500' },

    convHeader: {
        flexDirection: 'row', alignItems: 'center',
        gap: 12, paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: '#0A0F1E',
        borderBottomWidth: 1, borderBottomColor: '#0D1A2E',
    },
    convAvatarBox: {
        width: 38, height: 38, borderRadius: 19,
        backgroundColor: 'rgba(79,142,247,0.12)',
        borderWidth: 1, borderColor: 'rgba(79,142,247,0.25)',
        justifyContent: 'center', alignItems: 'center',
    },
    convNombre: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
    convSub: { fontSize: 11, color: '#4A6FA5', marginTop: 1 },
    convOnline: {
        width: 8, height: 8, borderRadius: 4,
        backgroundColor: '#34D399', marginLeft: 'auto',
    },

    selectorContainer: {
        backgroundColor: '#0A0F1E',
        borderBottomWidth: 1, borderBottomColor: '#0D1A2E',
    },
    selectorLabel: {
        fontSize: 10, fontWeight: '800', color: '#2A4A70',
        letterSpacing: 1.5, paddingHorizontal: 16, paddingTop: 12,
        textTransform: 'uppercase',
    },
    selectorChip: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#0D1526',
        borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8,
        borderWidth: 1, borderColor: '#1A2540',
    },
    selectorChipActivo: {
        backgroundColor: 'rgba(79,142,247,0.12)',
        borderColor: '#4F8EF7',
    },
    selectorAvatar: {
        width: 28, height: 28, borderRadius: 14,
        backgroundColor: '#111D35',
        justifyContent: 'center', alignItems: 'center',
    },
    selectorAvatarActivo: { backgroundColor: 'rgba(79,142,247,0.2)' },
    selectorAvatarText: { fontSize: 12, fontWeight: '800', color: '#4A6FA5' },
    selectorNombre: {
        fontSize: 13, fontWeight: '600', color: '#4A6FA5',
        maxWidth: 90,
    },
    selectorNombreActivo: { color: '#FFFFFF' },

    lista: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 8 },

    vacio: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
    vacioTitulo: { color: '#4A6FA5', fontSize: 15, fontWeight: '700', textAlign: 'center' },
    vacioSub: { color: '#2A4A70', fontSize: 13, fontWeight: '500', textAlign: 'center', paddingHorizontal: 32 },

    // FIX 2 + 4: pantalla de error de auth — siempre retorna algo visible,
    // nunca bloquea el Drawer ni deja el componente en estado indefinido.
    authErrorContainer: {
        flex: 1, backgroundColor: '#060B18',
        justifyContent: 'center', alignItems: 'center',
        gap: 12, paddingHorizontal: 40,
    },
    authErrorTitulo: { color: '#4A6FA5', fontSize: 16, fontWeight: '700', textAlign: 'center' },
    authErrorSub: {
        color: '#2A4A70', fontSize: 13, fontWeight: '500',
        textAlign: 'center', lineHeight: 20,
    },

    burbujaWrapper: { marginBottom: 4, maxWidth: '80%' },
    burbujaWrapperDerecha: { alignSelf: 'flex-end', alignItems: 'flex-end' },
    burbujaWrapperIzquierda: { alignSelf: 'flex-start', alignItems: 'flex-start' },
    remitente: {
        fontSize: 11, fontWeight: '700', color: '#4F8EF7',
        marginBottom: 3, marginLeft: 4, letterSpacing: 0.2,
    },
    burbuja: {
        borderRadius: 18, paddingHorizontal: 14,
        paddingTop: 10, paddingBottom: 8, gap: 4,
    },
    burbujaPropia: { backgroundColor: '#1E4DB7', borderBottomRightRadius: 4 },
    burbujaAjena: {
        backgroundColor: '#0D1526',
        borderWidth: 1, borderColor: '#1A2540',
        borderBottomLeftRadius: 4,
    },
    burbujaTexto: { fontSize: 15, lineHeight: 20 },
    burbujaTextoPropio: { color: '#FFFFFF' },
    burbujaTextoAjeno: { color: '#D1D9E6' },
    burbujaHora: { fontSize: 10, fontWeight: '600', alignSelf: 'flex-end' },
    burbujaHoraPropia: { color: 'rgba(255,255,255,0.45)' },
    burbujaHoraAjena: { color: '#2A4A70' },

    sistemaWrapper: { alignItems: 'center', marginVertical: 8 },
    sistemaBurbuja: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        backgroundColor: 'rgba(52,211,153,0.08)',
        borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)',
        borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
        maxWidth: '85%',
    },
    sistemaTexto: {
        flex: 1, fontSize: 12, color: '#34D399',
        fontWeight: '600', textAlign: 'center',
    },
    sistemaHora: { fontSize: 10, color: '#1A3050', fontWeight: '600' },

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
        paddingHorizontal: 18, paddingTop: 11, paddingBottom: 11,
        maxHeight: 120,
    },
    btnEnviar: {
        width: 44, height: 44, borderRadius: 22,
        backgroundColor: '#4F8EF7',
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#4F8EF7', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
    },
    btnEnviarDeshabilitado: {
        backgroundColor: '#111D35', shadowOpacity: 0, elevation: 0,
    },
});