// app/(drawer)/panel.tsx
//
// PANEL DEL DÍA — exclusivo para choferes.
//
// El chofer ve su recorrido asignado hoy y puede cargar:
//   • pqteDia   → paquetes del día
//   • porFuera  → paquetes por fuera
//
// Al guardar, estos valores se escriben directamente en la tabla
// Recorridos en el row donde idChofer coincide con el id del chofer
// logueado. El admin ve el cambio al instante en su hoja de Recorridos
// gracias al listener Realtime que ya tiene en index.tsx.
//
// La pantalla también muestra el progreso de entregados para que el
// chofer tenga contexto de cómo va su día.

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    KeyboardAvoidingView,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

interface Recorrido {
    id: number;
    localidad: string;
    zona: string;
    pqteDia: number;
    porFuera: number;
    entregados: number;
    idChofer: number;
    chofer: string;
}

interface ChoferInfo {
    id: number;
    nombre: string;
    email: string;
    zona: string | string[];
    vehiculo: string | string[];
    condicion: string;
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const calcularPorcentaje = (r: Recorrido): number => {
    const total = (r.pqteDia || 0) + (r.porFuera || 0);
    if (total === 0) return 0;
    return Math.min(100, ((r.entregados || 0) / total) * 100);
};

const getSaludo = (): string => {
    const hora = new Date().getHours();
    if (hora < 12) return 'Buenos días';
    if (hora < 19) return 'Buenas tardes';
    return 'Buenas noches';
};

const getZonaColor = (zona: string): string => {
    if (zona?.includes('OESTE')) return '#3b82f6';
    if (zona?.includes('SUR')) return '#10b981';
    if (zona?.includes('NORTE')) return '#f59e0b';
    if (zona?.includes('CABA')) return '#8b5cf6';
    return '#4F8EF7';
};

// ─────────────────────────────────────────────
// COMPONENTE: FilaRecorrido
// Card editable para cada localidad asignada al chofer
// ─────────────────────────────────────────────

interface FilaRecorridoProps {
    recorrido: Recorrido;
    index: number;
    onGuardar: (id: number, pqteDia: number, porFuera: number) => Promise<void>;
    guardando: boolean;
}

function FilaRecorrido({ recorrido, index, onGuardar, guardando }: FilaRecorridoProps) {
    const [pqteDia, setPqteDia] = useState(String(recorrido.pqteDia || 0));
    const [porFuera, setPorFuera] = useState(String(recorrido.porFuera || 0));
    const [modificado, setModificado] = useState(false);
    const fade = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(fade, {
            toValue: 1, duration: 380,
            delay: index * 70, useNativeDriver: true,
        }).start();
    }, []);

    // Sync si el recorrido se actualizó externamente (realtime)
    useEffect(() => {
        if (!modificado) {
            setPqteDia(String(recorrido.pqteDia || 0));
            setPorFuera(String(recorrido.porFuera || 0));
        }
    }, [recorrido.pqteDia, recorrido.porFuera, modificado]);

    const handleCambio = (setter: (v: string) => void) => (valor: string) => {
        // Solo números
        const limpio = valor.replace(/[^0-9]/g, '');
        setter(limpio);
        setModificado(true);
    };

    const handleGuardar = async () => {
        const pqte = parseInt(pqteDia) || 0;
        const fuera = parseInt(porFuera) || 0;
        await onGuardar(recorrido.id, pqte, fuera);
        setModificado(false);
    };

    const porcentaje = calcularPorcentaje(recorrido);
    const colorZona = getZonaColor(recorrido.zona);
    const totalPaquetes = (parseInt(pqteDia) || 0) + (parseInt(porFuera) || 0);

    return (
        <Animated.View style={[S.filaCard, { opacity: fade }]}>
            {/* Borde de zona */}
            <View style={[S.filaAccent, { backgroundColor: colorZona }]} />

            <View style={S.filaBody}>
                {/* Header de localidad */}
                <View style={S.filaHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={S.filaLocalidad} numberOfLines={1}>{recorrido.localidad}</Text>
                        <View style={[S.zonaBadge, { backgroundColor: colorZona + '20', borderColor: colorZona + '40' }]}>
                            <Text style={[S.zonaText, { color: colorZona }]}>{recorrido.zona}</Text>
                        </View>
                    </View>

                    {/* Progreso de entregados (read-only, lo carga el admin) */}
                    <View style={S.entregadosBox}>
                        <Text style={S.entregadosNum}>{recorrido.entregados}</Text>
                        <Text style={S.entregadosLabel}>entregados</Text>
                    </View>
                </View>

                {/* Barra de progreso */}
                {totalPaquetes > 0 && (
                    <View style={S.progressWrap}>
                        <View style={S.progressBg}>
                            <View style={[S.progressFill, {
                                width: `${porcentaje}%` as any,
                                backgroundColor: porcentaje >= 100 ? '#34D399' : colorZona,
                            }]} />
                        </View>
                        <Text style={S.progressLabel}>
                            {recorrido.entregados}/{totalPaquetes} · {porcentaje.toFixed(0)}%
                        </Text>
                    </View>
                )}

                {/* Inputs de carga */}
                <View style={S.inputsRow}>
                    <View style={S.inputGroup}>
                        <Text style={S.inputLabel}>PQTES DEL DÍA</Text>
                        <View style={[S.inputWrap, modificado && S.inputWrapModificado]}>
                            <TextInput
                                style={S.input}
                                value={pqteDia}
                                onChangeText={handleCambio(setPqteDia)}
                                keyboardType="numeric"
                                selectTextOnFocus
                                maxLength={4}
                                placeholder="0"
                                placeholderTextColor="#1A3050"
                            />
                        </View>
                    </View>

                    <View style={S.inputDivisor} />

                    <View style={S.inputGroup}>
                        <Text style={S.inputLabel}>POR FUERA</Text>
                        <View style={[S.inputWrap, modificado && S.inputWrapModificado]}>
                            <TextInput
                                style={S.input}
                                value={porFuera}
                                onChangeText={handleCambio(setPorFuera)}
                                keyboardType="numeric"
                                selectTextOnFocus
                                maxLength={4}
                                placeholder="0"
                                placeholderTextColor="#1A3050"
                            />
                        </View>
                    </View>

                    {/* Botón guardar — aparece solo cuando hay cambios */}
                    {modificado && (
                        <TouchableOpacity
                            style={[S.btnGuardar, guardando && { opacity: 0.6 }]}
                            onPress={handleGuardar}
                            disabled={guardando}
                            activeOpacity={0.8}
                        >
                            {guardando
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                            }
                        </TouchableOpacity>
                    )}
                </View>

                {/* Indicador de cambio sin guardar */}
                {modificado && (
                    <View style={S.sinGuardarBanner}>
                        <Ionicons name="alert-circle-outline" size={12} color="#F59E0B" />
                        <Text style={S.sinGuardarText}>Cambios sin confirmar — tocá el ✓ para guardar</Text>
                    </View>
                )}
            </View>
        </Animated.View>
    );
}

// ─────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────

export default function PanelScreen() {
    const [recorridos, setRecorridos] = useState<Recorrido[]>([]);
    const [choferInfo, setChoferInfo] = useState<ChoferInfo | null>(null);
    const [cargando, setCargando] = useState(true);
    const [refrescando, setRefrescando] = useState(false);
    const [guardandoId, setGuardandoId] = useState<number | null>(null);
    const [saludo] = useState(getSaludo);

    // ── 1. Cargar datos del chofer y sus recorridos ────────────────────────
    //
    // Flujo:
    //   a) getUser() para obtener email del logueado
    //   b) Buscar en Choferes por email → obtener id numérico
    //   c) Buscar en Recorridos donde idChofer = ese id
    //   d) El chofer ve sus rutas y puede editar pqteDia y porFuera

    const cargarDatos = useCallback(async (mostrarLoader = false) => {
        if (mostrarLoader) setCargando(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.email) { setCargando(false); setRefrescando(false); return; }

            // Buscar el chofer por email
            const { data: choferData, error: choferError } = await supabase
                .from('Choferes')
                .select('id, nombre, email, zona, vehiculo, condicion')
                .eq('email', user.email)
                .maybeSingle();

            if (choferError) throw choferError;

            if (!choferData) {
                // El email no tiene un chofer asignado en la tabla
                setCargando(false);
                setRefrescando(false);
                return;
            }

            setChoferInfo(choferData as ChoferInfo);

            // Buscar todos los recorridos asignados a este chofer
            const { data: recData, error: recError } = await supabase
                .from('Recorridos')
                .select('id, localidad, zona, pqteDia, porFuera, entregados, idChofer, chofer')
                .eq('idChofer', choferData.id)
                .order('orden', { ascending: true, nullsFirst: false });

            if (recError) throw recError;
            setRecorridos(recData || []);

        } catch (err) {
            console.error('[Panel] Error cargando datos:', err);
        } finally {
            setCargando(false);
            setRefrescando(false);
        }
    }, []);

    useEffect(() => {
        cargarDatos(true);

        // Realtime: si el admin modifica los recorridos, el chofer lo ve al instante
        const channel = supabase
            .channel('panel-recorridos-sync')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Recorridos' }, (payload) => {
                const rec = payload.new as Recorrido;
                setRecorridos(prev =>
                    prev.map(r => r.id === rec.id ? { ...r, ...rec } : r)
                );
            })
            .subscribe();

        return () => { void supabase.removeChannel(channel); };
    }, [cargarDatos]);

    // ── 2. Guardar pqteDia y porFuera en Recorridos ───────────────────────
    //
    // Solo actualiza esos dos campos. entregados lo maneja el admin desde
    // su pantalla de Recorridos, no el chofer.

    const handleGuardar = async (id: number, pqteDia: number, porFuera: number) => {
        setGuardandoId(id);
        try {
            const { error } = await supabase
                .from('Recorridos')
                .update({ pqteDia, porFuera })
                .eq('id', id);

            if (error) throw error;

            // Actualizar estado local para que la barra de progreso se recalcule
            setRecorridos(prev =>
                prev.map(r => r.id === id ? { ...r, pqteDia, porFuera } : r)
            );

        } catch (err: any) {
            Alert.alert(
                'Error al guardar',
                err?.message || 'No se pudo actualizar. Verificá tu conexión.',
            );
        } finally {
            setGuardandoId(null);
        }
    };

    const handleRefresh = () => { setRefrescando(true); cargarDatos(); };

    // ── Stats del día ───────────────────────────────────────────────────────

    const totalPaquetes = recorridos.reduce((s, r) => s + (r.pqteDia || 0) + (r.porFuera || 0), 0);
    const totalEntregados = recorridos.reduce((s, r) => s + (r.entregados || 0), 0);
    const progresoGlobal = totalPaquetes > 0 ? totalEntregados / totalPaquetes : 0;

    // ── Render ─────────────────────────────────────────────────────────────

    if (cargando) {
        return (
            <View style={S.loader}>
                <ActivityIndicator size="large" color="#4F8EF7" />
                <Text style={S.loaderText}>Cargando tu panel...</Text>
            </View>
        );
    }

    // Si el email no está registrado como chofer
    if (!choferInfo) {
        return (
            <View style={S.sinAsignar}>
                <Ionicons name="person-remove-outline" size={56} color="#1A2540" />
                <Text style={S.sinAsignarTitulo}>Tu cuenta no está asignada</Text>
                <Text style={S.sinAsignarSub}>
                    Pedile al administrador que vincule tu email a un chofer en el sistema.
                </Text>
            </View>
        );
    }

    // Si el chofer no tiene recorridos asignados hoy
    if (recorridos.length === 0) {
        return (
            <ScrollView
                style={S.container}
                contentContainerStyle={S.content}
                refreshControl={<RefreshControl refreshing={refrescando} onRefresh={handleRefresh} tintColor="#4F8EF7" colors={['#4F8EF7']} />}
            >
                <GreetingBox saludo={saludo} choferInfo={choferInfo} totalPaquetes={0} totalEntregados={0} progreso={0} />
                <View style={S.sinRutas}>
                    <Ionicons name="map-outline" size={52} color="#1A2540" />
                    <Text style={S.sinRutasTitulo}>Sin rutas asignadas hoy</Text>
                    <Text style={S.sinRutasSub}>El administrador todavía no te asignó recorridos para hoy.</Text>
                </View>
            </ScrollView>
        );
    }

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                style={S.container}
                contentContainerStyle={S.content}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                refreshControl={<RefreshControl refreshing={refrescando} onRefresh={handleRefresh} tintColor="#4F8EF7" colors={['#4F8EF7']} />}
            >
                {/* Header de saludo + stats */}
                <GreetingBox
                    saludo={saludo}
                    choferInfo={choferInfo}
                    totalPaquetes={totalPaquetes}
                    totalEntregados={totalEntregados}
                    progreso={progresoGlobal}
                />

                {/* Instrucción */}
                <View style={S.instruccionBox}>
                    <Ionicons name="information-circle-outline" size={16} color="#4F8EF7" />
                    <Text style={S.instruccionText}>
                        Cargá tus paquetes del día y los que traés por fuera. El admin lo ve al instante en la hoja de Recorridos.
                    </Text>
                </View>

                {/* Lista de recorridos */}
                {recorridos.map((rec, i) => (
                    <FilaRecorrido
                        key={rec.id}
                        recorrido={rec}
                        index={i}
                        onGuardar={handleGuardar}
                        guardando={guardandoId === rec.id}
                    />
                ))}

                <View style={{ height: 40 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

// ─────────────────────────────────────────────
// COMPONENTE: GreetingBox (header del panel)
// ─────────────────────────────────────────────

function GreetingBox({
    saludo, choferInfo, totalPaquetes, totalEntregados, progreso,
}: {
    saludo: string;
    choferInfo: ChoferInfo;
    totalPaquetes: number;
    totalEntregados: number;
    progreso: number;
}) {
    const condicionCfg = (() => {
        const c = (choferInfo.condicion || '').toUpperCase();
        if (c === 'TITULAR') return { color: '#4F8EF7', bg: 'rgba(79,142,247,0.12)' };
        if (c === 'COLECTADOR') return { color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' };
        return { color: '#34D399', bg: 'rgba(52,211,153,0.12)' };
    })();

    return (
        <View style={S.greetingBox}>
            <View style={S.greetingTop}>
                <View style={{ flex: 1 }}>
                    <Text style={S.greetingEyebrow}>PANEL DEL DÍA</Text>
                    <Text style={S.greetingNombre}>{saludo}, {choferInfo.nombre.split(' ')[0]} 👋</Text>
                </View>
                <View style={[S.condicionBadge, { backgroundColor: condicionCfg.bg }]}>
                    <Text style={[S.condicionText, { color: condicionCfg.color }]}>
                        {choferInfo.condicion || 'Chofer'}
                    </Text>
                </View>
            </View>

            {/* Stats del día */}
            <View style={S.statsRow}>
                <View style={S.statBox}>
                    <Text style={S.statNum}>{totalPaquetes}</Text>
                    <Text style={S.statLabel}>Total</Text>
                </View>
                <View style={[S.statBox, S.statBoxMid]}>
                    <Text style={[S.statNum, { color: '#34D399' }]}>{totalEntregados}</Text>
                    <Text style={S.statLabel}>Entregados</Text>
                </View>
                <View style={S.statBox}>
                    <Text style={[S.statNum, { color: totalPaquetes - totalEntregados > 0 ? '#F59E0B' : '#6B7280' }]}>
                        {totalPaquetes - totalEntregados}
                    </Text>
                    <Text style={S.statLabel}>Restantes</Text>
                </View>
            </View>

            {/* Barra de progreso global */}
            {totalPaquetes > 0 && (
                <View style={{ marginTop: 14 }}>
                    <View style={S.progressBg}>
                        <View style={[S.progressFill, {
                            width: `${progreso * 100}%` as any,
                            backgroundColor: progreso >= 1 ? '#34D399' : '#4F8EF7',
                        }]} />
                    </View>
                    <Text style={S.progressLabel}>{Math.round(progreso * 100)}% del día completado</Text>
                </View>
            )}
        </View>
    );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────

const S = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#060B18' },
    content: { padding: 16 },
    loader: { flex: 1, backgroundColor: '#060B18', justifyContent: 'center', alignItems: 'center', gap: 14 },
    loaderText: { color: '#4A6FA5', fontSize: 13, fontWeight: '500' },

    // Sin asignar
    sinAsignar: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 40, backgroundColor: '#060B18' },
    sinAsignarTitulo: { color: '#4A6FA5', fontSize: 16, fontWeight: '700', textAlign: 'center' },
    sinAsignarSub: { color: '#2A4A70', fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 20 },

    // Sin rutas
    sinRutas: { alignItems: 'center', paddingVertical: 48, gap: 10 },
    sinRutasTitulo: { color: '#4A6FA5', fontSize: 15, fontWeight: '700', textAlign: 'center' },
    sinRutasSub: { color: '#2A4A70', fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },

    // Greeting box
    greetingBox: {
        backgroundColor: '#0D1526', borderRadius: 20,
        padding: 20, marginBottom: 14,
        borderWidth: 1, borderColor: '#1A2540',
    },
    greetingTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
    greetingEyebrow: { fontSize: 10, fontWeight: '800', color: '#4F8EF7', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
    greetingNombre: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
    condicionBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
    condicionText: { fontSize: 11, fontWeight: '700' },

    // Stats globales
    statsRow: {
        flexDirection: 'row', backgroundColor: '#060B18',
        borderRadius: 14, overflow: 'hidden',
        borderWidth: 1, borderColor: '#0D1A2E',
    },
    statBox: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    statBoxMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#0D1A2E' },
    statNum: { fontSize: 20, fontWeight: '800', color: '#FFFFFF' },
    statLabel: { fontSize: 9, color: '#2A4A70', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },

    // Barra de progreso
    progressBg: { height: 6, backgroundColor: '#060B18', borderRadius: 3, borderWidth: 1, borderColor: '#0D1A2E', overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },
    progressWrap: { marginBottom: 10 },
    progressLabel: { fontSize: 10, color: '#2A4A70', fontWeight: '600', textAlign: 'right', marginTop: 4 },

    // Instrucción
    instruccionBox: {
        flexDirection: 'row', alignItems: 'flex-start', gap: 8,
        backgroundColor: 'rgba(79,142,247,0.06)',
        borderWidth: 1, borderColor: 'rgba(79,142,247,0.18)',
        borderRadius: 14, padding: 14, marginBottom: 14,
    },
    instruccionText: { flex: 1, fontSize: 12, color: '#4A6FA5', fontWeight: '500', lineHeight: 18 },

    // Card de recorrido
    filaCard: {
        flexDirection: 'row',
        backgroundColor: '#0D1526',
        borderRadius: 18, marginBottom: 12,
        borderWidth: 1, borderColor: '#1A2540',
        overflow: 'hidden',
    },
    filaAccent: { width: 4 },
    filaBody: { flex: 1, padding: 16 },

    filaHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
    filaLocalidad: { fontSize: 16, fontWeight: '700', color: '#FFFFFF', marginBottom: 6 },
    zonaBadge: {
        alignSelf: 'flex-start',
        borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
        borderWidth: 1,
    },
    zonaText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },

    entregadosBox: { alignItems: 'center', minWidth: 56 },
    entregadosNum: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
    entregadosLabel: { fontSize: 9, color: '#2A4A70', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3 },

    // Inputs de carga
    inputsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
    inputGroup: { flex: 1 },
    inputLabel: {
        fontSize: 10, fontWeight: '700', color: '#2A4A70',
        letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6,
    },
    inputWrap: {
        backgroundColor: '#060B18', borderRadius: 12,
        borderWidth: 1.5, borderColor: '#1A2540',
        height: 52, justifyContent: 'center', alignItems: 'center',
    },
    inputWrapModificado: { borderColor: '#F59E0B', backgroundColor: 'rgba(245,158,11,0.04)' },
    input: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', textAlign: 'center', width: '100%' },
    inputDivisor: { width: 1, height: 52, backgroundColor: '#1A2540' },

    // Botón guardar
    btnGuardar: {
        width: 52, height: 52, borderRadius: 14,
        backgroundColor: '#34D399',
        justifyContent: 'center', alignItems: 'center',
        shadowColor: '#34D399', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35, shadowRadius: 8, elevation: 6,
    },

    // Banner de cambio sin guardar
    sinGuardarBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 6,
        marginTop: 10,
        backgroundColor: 'rgba(245,158,11,0.06)',
        borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
        borderRadius: 8, padding: 8,
    },
    sinGuardarText: { flex: 1, fontSize: 11, color: '#F59E0B', fontWeight: '500' },
});