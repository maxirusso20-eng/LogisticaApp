// app/(drawer)/Panel.tsx
//
// Panel del Día — exclusivo para choferes.
//
// LÓGICA:
//   Admin carga en index.tsx:  pqteDia + porFuera
//   Chofer ve y modifica acá:  entregados (ligado a pqteDia)
//                              entregadosFuera (ligado a porFuera)
//
//   Restante día   = pqteDia - entregados
//   Restante fuera = porFuera - entregadosFuera
//
// ⚠️  REQUIERE columna nueva en Supabase:
//     ALTER TABLE "Recorridos" ADD COLUMN "entregadosFuera" integer DEFAULT 0;

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { COLORS, getCondicionCfg, getSaludo, getZonaColor } from '../../lib/constants';
import { supabase } from '../../lib/supabase';

interface Recorrido {
    id: number;
    localidad: string;
    zona: string;
    pqteDia: number;
    porFuera: number;
    entregados: number;
    entregadosFuera: number;
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

const porcentajeDia = (r: Recorrido) => !r.pqteDia ? 0 : Math.min(100, ((r.entregados || 0) / r.pqteDia) * 100);
const porcentajeFuera = (r: Recorrido) => !r.porFuera ? 0 : Math.min(100, ((r.entregadosFuera || 0) / r.porFuera) * 100);

// ─────────────────────────────────────────────
// COMPONENTE: ContadorEntregados
// ─────────────────────────────────────────────

interface ContadorEntregadosProps {
    label: string;
    total: number;
    entregados: number;
    color: string;
    guardando: boolean;
    onIncrement: () => void;
    onDecrement: () => void;
}

function ContadorEntregados({ label, total, entregados, color, guardando, onIncrement, onDecrement }: ContadorEntregadosProps) {
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const restante = Math.max(0, total - entregados);
    const completo = total > 0 && entregados >= total;
    const colorEf = completo ? COLORS.green : color;

    const pulse = () => {
        Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 1.2, duration: 70, useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 1, duration: 70, useNativeDriver: true }),
        ]).start();
    };

    return (
        <View style={C.box}>
            {/* Label + total del admin */}
            <View style={C.header}>
                <Text style={[C.label, { color: colorEf }]}>{label}</Text>
                {total > 0
                    ? <View style={[C.totalBadge, { backgroundColor: color + '18', borderColor: color + '35' }]}>
                        <Text style={[C.totalText, { color }]}>de {total}</Text>
                    </View>
                    : <View style={C.sinBadge}>
                        <Text style={C.sinText}>sin asignar</Text>
                    </View>
                }
            </View>

            {/* Número grande */}
            <Animated.View style={[C.numWrap, { transform: [{ scale: scaleAnim }] }]}>
                {guardando
                    ? <ActivityIndicator color={colorEf} size="small" />
                    : <Text style={[C.num, { color: colorEf }]}>{entregados}</Text>
                }
                <Text style={[C.numSub, { color: colorEf + '99' }]}>entregados</Text>
            </Animated.View>

            {/* Restante badge */}
            {total > 0 && (
                <View style={[C.restBadge, {
                    backgroundColor: completo ? 'rgba(52,211,153,0.1)' : 'rgba(42,74,112,0.15)',
                    borderColor: completo ? 'rgba(52,211,153,0.3)' : COLORS.borderSubtle,
                }]}>
                    <Ionicons
                        name={completo ? 'checkmark-circle' : 'time-outline'}
                        size={11}
                        color={completo ? COLORS.green : COLORS.textMuted}
                    />
                    <Text style={[C.restText, { color: completo ? COLORS.green : COLORS.textMuted }]}>
                        {completo ? 'Completo' : `${restante} restante${restante !== 1 ? 's' : ''}`}
                    </Text>
                </View>
            )}

            {/* Botones +/- */}
            {total > 0 && (
                <View style={C.botonesRow}>
                    <TouchableOpacity
                        style={[C.btn, (entregados <= 0 || guardando) && C.btnDis]}
                        onPress={() => { if (!guardando && entregados > 0) onDecrement(); }}
                        disabled={entregados <= 0 || guardando}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="remove" size={20}
                            color={(entregados <= 0 || guardando) ? COLORS.textMuted : colorEf}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[C.btn, C.btnAdd, { borderColor: colorEf + '50', backgroundColor: colorEf + '15' },
                        (completo || guardando) && C.btnDis,
                        ]}
                        onPress={() => { if (!guardando && !completo) { pulse(); onIncrement(); } }}
                        disabled={completo || guardando}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="add" size={20}
                            color={(completo || guardando) ? COLORS.textMuted : colorEf}
                        />
                    </TouchableOpacity>
                </View>
            )}

            {total === 0 && (
                <Text style={C.sinMsg}>El admin no cargó este valor aún.</Text>
            )}
        </View>
    );
}

// ─────────────────────────────────────────────
// COMPONENTE: FilaRecorrido
// ─────────────────────────────────────────────

interface FilaRecorridoProps {
    recorrido: Recorrido;
    index: number;
    onGuardar: (id: number, campo: 'entregados' | 'entregadosFuera', valor: number) => Promise<void>;
    guardandoCampo: { id: number; campo: string } | null;
}

function FilaRecorrido({ recorrido, index, onGuardar, guardandoCampo }: FilaRecorridoProps) {
    const fade = useRef(new Animated.Value(0)).current;
    const colorZona = getZonaColor(recorrido.zona);

    useEffect(() => {
        Animated.timing(fade, { toValue: 1, duration: 380, delay: index * 80, useNativeDriver: true }).start();
    }, []);

    const pctDia = porcentajeDia(recorrido);
    const pctFuera = porcentajeFuera(recorrido);
    const completoDia = recorrido.pqteDia > 0 && (recorrido.entregados || 0) >= recorrido.pqteDia;
    const completoFuera = recorrido.porFuera > 0 && (recorrido.entregadosFuera || 0) >= recorrido.porFuera;
    const todoCompleto = completoDia && (recorrido.porFuera === 0 || completoFuera);

    const isGuardando = (campo: string) =>
        guardandoCampo?.id === recorrido.id && guardandoCampo?.campo === campo;

    const cambiar = (campo: 'entregados' | 'entregadosFuera', delta: number) => {
        const actual = recorrido[campo] || 0;
        const tope = campo === 'entregados' ? recorrido.pqteDia : recorrido.porFuera;
        const nuevo = Math.max(0, Math.min(tope, actual + delta));
        if (nuevo === actual) return;
        onGuardar(recorrido.id, campo, nuevo);
    };

    return (
        <Animated.View style={[S.filaCard, todoCompleto && S.filaCardCompleta, { opacity: fade }]}>
            <View style={[S.filaAccent, { backgroundColor: todoCompleto ? COLORS.green : colorZona }]} />

            <View style={S.filaBody}>

                {/* Header */}
                <View style={S.filaHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={S.filaLocalidad} numberOfLines={1}>{recorrido.localidad}</Text>
                        <View style={[S.zonaBadge, { backgroundColor: colorZona + '20', borderColor: colorZona + '40' }]}>
                            <Text style={[S.zonaText, { color: colorZona }]}>{recorrido.zona}</Text>
                        </View>
                    </View>
                    {todoCompleto && (
                        <View style={S.todoCompletoBadge}>
                            <Ionicons name="checkmark-circle" size={13} color={COLORS.green} />
                            <Text style={S.todoCompletoBadgeText}>Todo completo</Text>
                        </View>
                    )}
                </View>

                {/* Barras de progreso */}
                {recorrido.pqteDia > 0 && (
                    <View style={S.progressRow}>
                        <Text style={S.progressRowLabel}>Día</Text>
                        <View style={S.progressBg}>
                            <View style={[S.progressFill, {
                                width: `${pctDia}%` as any,
                                backgroundColor: completoDia ? COLORS.green : COLORS.blue,
                            }]} />
                        </View>
                        <Text style={S.progressPct}>{pctDia.toFixed(0)}%</Text>
                    </View>
                )}
                {recorrido.porFuera > 0 && (
                    <View style={[S.progressRow, { marginTop: 5 }]}>
                        <Text style={S.progressRowLabel}>Fuera</Text>
                        <View style={S.progressBg}>
                            <View style={[S.progressFill, {
                                width: `${pctFuera}%` as any,
                                backgroundColor: completoFuera ? COLORS.green : COLORS.amber,
                            }]} />
                        </View>
                        <Text style={S.progressPct}>{pctFuera.toFixed(0)}%</Text>
                    </View>
                )}

                {/* Dos contadores */}
                <View style={S.contadoresRow}>
                    <ContadorEntregados
                        label="DEL DÍA"
                        total={recorrido.pqteDia || 0}
                        entregados={recorrido.entregados || 0}
                        color={COLORS.blue}
                        guardando={isGuardando('entregados')}
                        onIncrement={() => cambiar('entregados', +1)}
                        onDecrement={() => cambiar('entregados', -1)}
                    />
                    <View style={S.contadoresDivisor} />
                    <ContadorEntregados
                        label="POR FUERA"
                        total={recorrido.porFuera || 0}
                        entregados={recorrido.entregadosFuera || 0}
                        color={COLORS.amber}
                        guardando={isGuardando('entregadosFuera')}
                        onIncrement={() => cambiar('entregadosFuera', +1)}
                        onDecrement={() => cambiar('entregadosFuera', -1)}
                    />
                </View>
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
    const [guardandoCampo, setGuardandoCampo] = useState<{ id: number; campo: string } | null>(null);
    const [saludo] = useState(getSaludo);

    const cargarDatos = useCallback(async (mostrarLoader = false) => {
        if (mostrarLoader) setCargando(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.email) { setCargando(false); setRefrescando(false); return; }

            const { data: choferData, error: choferError } = await supabase
                .from('Choferes')
                .select('id, nombre, email, zona, vehiculo, condicion')
                .eq('email', user.email)
                .maybeSingle();

            if (choferError) throw choferError;
            if (!choferData) { setCargando(false); setRefrescando(false); return; }

            setChoferInfo(choferData as ChoferInfo);

            const { data: recData, error: recError } = await supabase
                .from('Recorridos')
                .select('id, localidad, zona, pqteDia, porFuera, entregados, entregadosFuera, idChofer, chofer')
                .eq('idChofer', choferData.id)
                .order('orden', { ascending: true, nullsFirst: false });

            if (recError) throw recError;
            setRecorridos((recData || []).map(r => ({
                ...r,
                entregadosFuera: r.entregadosFuera ?? 0,
            })));

        } catch (err) {
            console.error('[Panel] Error:', err);
        } finally {
            setCargando(false);
            setRefrescando(false);
        }
    }, []);

    useEffect(() => {
        cargarDatos(true);
        const channel = supabase
            .channel('panel-recorridos-sync')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Recorridos' }, (payload) => {
                const rec = payload.new as Recorrido;
                setRecorridos(prev =>
                    prev.map(r => r.id === rec.id
                        ? { ...r, ...rec, entregadosFuera: rec.entregadosFuera ?? r.entregadosFuera ?? 0 }
                        : r
                    )
                );
            })
            .subscribe();
        return () => { void supabase.removeChannel(channel); };
    }, [cargarDatos]);

    const handleGuardar = useCallback(async (
        id: number,
        campo: 'entregados' | 'entregadosFuera',
        valor: number,
    ) => {
        setRecorridos(prev => prev.map(r => r.id === id ? { ...r, [campo]: valor } : r));
        setGuardandoCampo({ id, campo });
        try {
            const { error } = await supabase.from('Recorridos').update({ [campo]: valor }).eq('id', id);
            if (error) throw error;
        } catch (err: any) {
            await cargarDatos();
            Alert.alert('Error', err?.message || 'No se pudo guardar. Verificá tu conexión.');
        } finally {
            setGuardandoCampo(null);
        }
    }, [cargarDatos]);

    const handleRefresh = () => { setRefrescando(true); cargarDatos(); };

    const totalPaquetes = recorridos.reduce((s, r) => s + (r.pqteDia || 0) + (r.porFuera || 0), 0);
    const totalEntregadosTodo = recorridos.reduce((s, r) => s + (r.entregados || 0) + (r.entregadosFuera || 0), 0);
    const progresoGlobal = totalPaquetes > 0 ? totalEntregadosTodo / totalPaquetes : 0;

    if (cargando) {
        return (
            <View style={S.loader}>
                <ActivityIndicator size="large" color={COLORS.blue} />
                <Text style={S.loaderText}>Cargando tu panel...</Text>
            </View>
        );
    }

    if (!choferInfo) {
        return (
            <View style={S.sinAsignar}>
                <Ionicons name="person-remove-outline" size={56} color="#1A2540" />
                <Text style={S.sinAsignarTitulo}>Tu cuenta no está asignada</Text>
                <Text style={S.sinAsignarSub}>Pedile al administrador que vincule tu email a un chofer en el sistema.</Text>
            </View>
        );
    }

    if (recorridos.length === 0) {
        return (
            <ScrollView style={S.container} contentContainerStyle={S.content}
                refreshControl={<RefreshControl refreshing={refrescando} onRefresh={handleRefresh} tintColor={COLORS.blue} colors={[COLORS.blue]} />}>
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
        <ScrollView style={S.container} contentContainerStyle={S.content}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refrescando} onRefresh={handleRefresh} tintColor={COLORS.blue} colors={[COLORS.blue]} />}>
            <GreetingBox saludo={saludo} choferInfo={choferInfo}
                totalPaquetes={totalPaquetes} totalEntregados={totalEntregadosTodo} progreso={progresoGlobal} />
            {recorridos.map((rec, i) => (
                <FilaRecorrido key={rec.id} recorrido={rec} index={i}
                    onGuardar={handleGuardar} guardandoCampo={guardandoCampo} />
            ))}
            <View style={{ height: 40 }} />
        </ScrollView>
    );
}

// ─────────────────────────────────────────────
// GREETING BOX
// ─────────────────────────────────────────────

function GreetingBox({ saludo, choferInfo, totalPaquetes, totalEntregados, progreso }:
    { saludo: string; choferInfo: ChoferInfo; totalPaquetes: number; totalEntregados: number; progreso: number }) {
    const condicionCfg = getCondicionCfg(choferInfo.condicion);
    return (
        <View style={S.greetingBox}>
            <View style={S.greetingTop}>
                <View style={{ flex: 1 }}>
                    <Text style={S.greetingEyebrow}>PANEL DEL DÍA</Text>
                    <Text style={S.greetingNombre}>{saludo}, {choferInfo.nombre.split(' ')[0]} 👋</Text>
                </View>
                <View style={[S.condicionBadge, { backgroundColor: condicionCfg.bg }]}>
                    <Text style={[S.condicionText, { color: condicionCfg.color }]}>{condicionCfg.label}</Text>
                </View>
            </View>
            <View style={S.statsRow}>
                <View style={S.statBox}>
                    <Text style={S.statNum}>{totalPaquetes}</Text>
                    <Text style={S.statLabel}>Total</Text>
                </View>
                <View style={[S.statBox, S.statBoxMid]}>
                    <Text style={[S.statNum, { color: COLORS.green }]}>{totalEntregados}</Text>
                    <Text style={S.statLabel}>Entregados</Text>
                </View>
                <View style={S.statBox}>
                    <Text style={[S.statNum, { color: totalPaquetes - totalEntregados > 0 ? COLORS.amber : '#6B7280' }]}>
                        {totalPaquetes - totalEntregados}
                    </Text>
                    <Text style={S.statLabel}>Restantes</Text>
                </View>
            </View>
            {totalPaquetes > 0 && (
                <View style={{ marginTop: 14 }}>
                    <View style={[S.progressBg, { flex: undefined }]}>
                        <View style={[S.progressFill, {
                            width: `${progreso * 100}%` as any,
                            backgroundColor: progreso >= 1 ? COLORS.green : COLORS.blue,
                        }]} />
                    </View>
                    <View style={S.progressFooter}>
                        <Text style={S.progressLabel}>{Math.round(progreso * 100)}% completado</Text>
                        {progreso >= 1 && (
                            <View style={S.completadoBadge}>
                                <Ionicons name="checkmark-circle" size={11} color={COLORS.green} />
                                <Text style={S.completadoText}>¡Día completo!</Text>
                            </View>
                        )}
                    </View>
                </View>
            )}
        </View>
    );
}

// ─────────────────────────────────────────────
// ESTILOS — CONTADOR
// ─────────────────────────────────────────────

const C = StyleSheet.create({
    box: { flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 6, gap: 8 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', justifyContent: 'center' },
    label: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    totalBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
    totalText: { fontSize: 10, fontWeight: '700' },
    sinBadge: { backgroundColor: 'rgba(42,74,112,0.15)', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: COLORS.borderSubtle },
    sinText: { fontSize: 10, fontWeight: '600', color: COLORS.textMuted },
    numWrap: { alignItems: 'center', minHeight: 52, justifyContent: 'center' },
    num: { fontSize: 34, fontWeight: '800', lineHeight: 38 },
    numSub: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
    restBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
    restText: { fontSize: 10, fontWeight: '600' },
    botonesRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    btn: {
        width: 42, height: 42, borderRadius: 12,
        backgroundColor: 'rgba(42,74,112,0.15)',
        borderWidth: 1.5, borderColor: COLORS.borderSubtle,
        justifyContent: 'center', alignItems: 'center',
    },
    btnAdd: {},
    btnDis: { opacity: 0.25 },
    sinMsg: { fontSize: 10, color: COLORS.textMuted, textAlign: 'center', lineHeight: 14 },
});

// ─────────────────────────────────────────────
// ESTILOS — PANTALLA
// ─────────────────────────────────────────────

const S = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.bg },
    content: { padding: 16 },
    loader: { flex: 1, backgroundColor: COLORS.bg, justifyContent: 'center', alignItems: 'center', gap: 14 },
    loaderText: { color: COLORS.textSecondary, fontSize: 13, fontWeight: '500' },

    sinAsignar: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 40, backgroundColor: COLORS.bg },
    sinAsignarTitulo: { color: COLORS.textSecondary, fontSize: 16, fontWeight: '700', textAlign: 'center' },
    sinAsignarSub: { color: COLORS.textMuted, fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
    sinRutas: { alignItems: 'center', paddingVertical: 48, gap: 10 },
    sinRutasTitulo: { color: COLORS.textSecondary, fontSize: 15, fontWeight: '700', textAlign: 'center' },
    sinRutasSub: { color: COLORS.textMuted, fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },

    greetingBox: { backgroundColor: COLORS.bgCard, borderRadius: 20, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: COLORS.border },
    greetingTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
    greetingEyebrow: { fontSize: 10, fontWeight: '800', color: COLORS.blue, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
    greetingNombre: { fontSize: 22, fontWeight: '800', color: COLORS.textPrimary, letterSpacing: -0.3 },
    condicionBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
    condicionText: { fontSize: 11, fontWeight: '700' },

    statsRow: { flexDirection: 'row', backgroundColor: COLORS.bg, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.borderSubtle },
    statBox: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    statBoxMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: COLORS.borderSubtle },
    statNum: { fontSize: 20, fontWeight: '800', color: COLORS.textPrimary },
    statLabel: { fontSize: 9, color: COLORS.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },

    progressBg: { height: 6, flex: 1, backgroundColor: COLORS.bg, borderRadius: 3, borderWidth: 1, borderColor: COLORS.borderSubtle, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },
    progressFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    progressLabel: { fontSize: 10, color: COLORS.textMuted, fontWeight: '600' },
    completadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(52,211,153,0.1)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    completadoText: { fontSize: 10, color: COLORS.green, fontWeight: '700' },

    filaCard: { flexDirection: 'row', backgroundColor: COLORS.bgCard, borderRadius: 18, marginBottom: 12, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden' },
    filaCardCompleta: { borderColor: 'rgba(52,211,153,0.3)', backgroundColor: '#080F1C' },
    filaAccent: { width: 4 },
    filaBody: { flex: 1, padding: 16 },
    filaHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
    filaLocalidad: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary, marginBottom: 6 },
    zonaBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
    zonaText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
    todoCompletoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(52,211,153,0.1)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.25)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
    todoCompletoBadgeText: { fontSize: 11, color: COLORS.green, fontWeight: '700' },

    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    progressRowLabel: { fontSize: 9, fontWeight: '700', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, width: 30 },
    progressPct: { fontSize: 9, fontWeight: '700', color: COLORS.textMuted, width: 28, textAlign: 'right' },

    contadoresRow: { flexDirection: 'row', backgroundColor: COLORS.bg, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.borderSubtle, marginTop: 12 },
    contadoresDivisor: { width: 1, backgroundColor: COLORS.borderSubtle },
});