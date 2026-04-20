// app/(drawer)/Panel.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Animated,
    AppState,
    AppStateStatus,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { getCondicionCfg, getSaludo, getZonaColor } from '../../lib/constants';
import { SkeletonFilaRecorrido } from '../../lib/skeleton';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';
import { useToast } from '../../lib/toast';

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

// ─── Offline Queue ──────────────────────────────────────────────────────────────────────

const OFFLINE_KEY = '@offline_queue_recorridos';

interface OfflineMutation {
    id: number;
    campo: 'entregados' | 'entregadosFuera';
    valor: number;
    timestamp: number;
}

async function leerCola(): Promise<OfflineMutation[]> {
    try {
        const raw = await AsyncStorage.getItem(OFFLINE_KEY);
        return raw ? (JSON.parse(raw) as OfflineMutation[]) : [];
    } catch {
        return [];
    }
}

async function guardarCola(cola: OfflineMutation[]): Promise<void> {
    try {
        await AsyncStorage.setItem(OFFLINE_KEY, JSON.stringify(cola));
    } catch { }
}

async function encolarMutacion(mutation: OfflineMutation): Promise<void> {
    const cola = await leerCola();
    // Consolidar: si ya existe una mutación pendiente para id+campo, la reemplaza
    const sin = cola.filter(m => !(m.id === mutation.id && m.campo === mutation.campo));
    await guardarCola([...sin, mutation]);
}

async function flushCola(): Promise<{ ok: number; fail: number }> {
    const cola = await leerCola();
    if (cola.length === 0) return { ok: 0, fail: 0 };

    let ok = 0;
    const pendientes: OfflineMutation[] = [];

    for (const m of cola) {
        try {
            const { error } = await supabase
                .from('Recorridos')
                .update({ [m.campo]: m.valor })
                .eq('id', m.id);
            if (error) throw error;
            ok++;
        } catch {
            pendientes.push(m); // Re-encolar si sigue fallando
        }
    }

    await guardarCola(pendientes);
    return { ok, fail: pendientes.length };
}

const isNetworkError = (err: any): boolean => {
    const msg: string = (err?.message || '').toLowerCase();
    return (
        err instanceof TypeError ||
        msg.includes('network') ||
        msg.includes('failed to fetch') ||
        msg.includes('network request failed')
    );
};

// ─── ContadorEntregados ───────────────────────────────────────────────────────

interface ContadorEntregadosProps {
    label: string; total: number; entregados: number; color: string;
    guardando: boolean; onIncrement: () => void; onDecrement: () => void;
}

function ContadorEntregados({ label, total, entregados, color, guardando, onIncrement, onDecrement }: ContadorEntregadosProps) {
    const { colors } = useTheme();
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const restante = Math.max(0, total - entregados);
    const completo = total > 0 && entregados >= total;
    const colorEf = completo ? colors.green : color;

    const pulse = () => {
        Animated.sequence([
            Animated.timing(scaleAnim, { toValue: 1.15, duration: 100, useNativeDriver: true }),
            Animated.timing(scaleAnim, { toValue: 1, duration: 100, useNativeDriver: true })
        ]).start();
    };

    const onPress = (isIncrement: boolean) => {
        if (isIncrement && (completo || guardando)) return;
        if (!isIncrement && (entregados <= 0 || guardando)) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (isIncrement) { pulse(); onIncrement(); }
        else { onDecrement(); }
    };

    return (
        <View style={C.box}>
            <View style={C.header}>
                <Text style={[C.label, { color: colorEf }]}>{label}</Text>
                {total > 0
                    ? <View style={[C.totalBadge, { backgroundColor: color + '18', borderColor: color + '35' }]}>
                        <Text style={[C.totalText, { color }]}>de {total}</Text>
                    </View>
                    : <View style={[C.sinBadge, { backgroundColor: colors.bgInput, borderColor: colors.borderSubtle }]}>
                        <Text style={[C.sinText, { color: colors.textMuted }]}>sin asignar</Text>
                    </View>
                }
            </View>

            <Animated.View style={[C.numWrap, { transform: [{ scale: scaleAnim }] }]}>
                {guardando
                    ? <ActivityIndicator color={colorEf} size="small" />
                    : <Text style={[C.num, { color: colorEf }]}>{entregados}</Text>
                }
                <Text style={[C.numSub, { color: colorEf + '99' }]}>entregados</Text>
            </Animated.View>

            {total > 0 && (
                <View style={[C.restBadge, {
                    backgroundColor: completo ? 'rgba(52,211,153,0.1)' : colors.bgInput,
                    borderColor: completo ? 'rgba(52,211,153,0.3)' : colors.borderSubtle,
                }]}>
                    <Ionicons
                        name={completo ? 'checkmark-circle' : 'time-outline'}
                        size={11}
                        color={completo ? colors.green : colors.textMuted}
                    />
                    <Text style={[C.restText, { color: completo ? colors.green : colors.textMuted }]}>
                        {completo ? 'Completo' : `${restante} restante${restante !== 1 ? 's' : ''}`}
                    </Text>
                </View>
            )}

            {total > 0 && (
                <View style={C.botonesRow}>
                    <TouchableOpacity
                        style={[C.btn, { backgroundColor: colors.bgInput, borderColor: colors.borderSubtle },
                        (entregados <= 0 || guardando) && C.btnDis]}
                        onPress={() => onPress(false)}
                        disabled={entregados <= 0 || guardando}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="remove" size={20}
                            color={(entregados <= 0 || guardando) ? colors.textMuted : colorEf}
                        />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[C.btn, C.btnAdd,
                        { borderColor: colorEf + '50', backgroundColor: colorEf + '15' },
                        (completo || guardando) && C.btnDis,
                        ]}
                        onPress={() => onPress(true)}
                        disabled={completo || guardando}
                        activeOpacity={0.7}
                    >
                        <Ionicons name="add" size={20}
                            color={(completo || guardando) ? colors.textMuted : colorEf}
                        />
                    </TouchableOpacity>
                </View>
            )}

            {total === 0 && (
                <Text style={[C.sinMsg, { color: colors.textMuted }]}>El admin no cargó este valor aún.</Text>
            )}
        </View>
    );
}

// ─── FilaRecorrido ────────────────────────────────────────────────────────────

interface FilaRecorridoProps {
    recorrido: Recorrido; index: number;
    onGuardar: (id: number, campo: 'entregados' | 'entregadosFuera', valor: number) => Promise<void>;
    guardandoCampo: { id: number; campo: string } | null;
}

function FilaRecorrido({ recorrido, index, onGuardar, guardandoCampo }: FilaRecorridoProps) {
    const { colors } = useTheme();
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
        <Animated.View style={[
            S.filaCard,
            { backgroundColor: colors.bgCard, borderColor: colors.border },
            todoCompleto && { borderColor: 'rgba(52,211,153,0.3)', backgroundColor: colors.bgCard },
            { opacity: fade },
        ]}>
            <View style={[S.filaAccent, { backgroundColor: todoCompleto ? colors.green : colorZona }]} />

            <View style={S.filaBody}>
                <View style={S.filaHeader}>
                    <View style={{ flex: 1 }}>
                        <Text style={[S.filaLocalidad, { color: colors.textPrimary }]} numberOfLines={1}>
                            {recorrido.localidad}
                        </Text>
                        <View style={[S.zonaBadge, { backgroundColor: colorZona + '20', borderColor: colorZona + '40' }]}>
                            <Text style={[S.zonaText, { color: colorZona }]}>{recorrido.zona}</Text>
                        </View>
                    </View>
                    {todoCompleto && (
                        <View style={S.todoCompletoBadge}>
                            <Ionicons name="checkmark-circle" size={13} color={colors.green} />
                            <Text style={S.todoCompletoBadgeText}>Todo completo</Text>
                        </View>
                    )}
                </View>

                {recorrido.pqteDia > 0 && (
                    <View style={S.progressRow}>
                        <Text style={[S.progressRowLabel, { color: colors.textMuted }]}>Día</Text>
                        <View style={[S.progressBg, { backgroundColor: colors.bg, borderColor: colors.borderSubtle }]}>
                            <View style={[S.progressFill, {
                                width: `${pctDia}%` as any,
                                backgroundColor: completoDia ? colors.green : colors.blue,
                            }]} />
                        </View>
                        <Text style={[S.progressPct, { color: colors.textMuted }]}>{pctDia.toFixed(0)}%</Text>
                    </View>
                )}
                {recorrido.porFuera > 0 && (
                    <View style={[S.progressRow, { marginTop: 5 }]}>
                        <Text style={[S.progressRowLabel, { color: colors.textMuted }]}>Fuera</Text>
                        <View style={[S.progressBg, { backgroundColor: colors.bg, borderColor: colors.borderSubtle }]}>
                            <View style={[S.progressFill, {
                                width: `${pctFuera}%` as any,
                                backgroundColor: completoFuera ? colors.green : colors.amber,
                            }]} />
                        </View>
                        <Text style={[S.progressPct, { color: colors.textMuted }]}>{pctFuera.toFixed(0)}%</Text>
                    </View>
                )}

                <View style={[S.contadoresRow, {
                    backgroundColor: colors.bg,
                    borderColor: colors.borderSubtle,
                }]}>
                    <ContadorEntregados
                        label="DEL DÍA"
                        total={recorrido.pqteDia || 0}
                        entregados={recorrido.entregados || 0}
                        color={colors.blue}
                        guardando={isGuardando('entregados')}
                        onIncrement={() => cambiar('entregados', +1)}
                        onDecrement={() => cambiar('entregados', -1)}
                    />
                    <View style={[S.contadoresDivisor, { backgroundColor: colors.borderSubtle }]} />
                    <ContadorEntregados
                        label="POR FUERA"
                        total={recorrido.porFuera || 0}
                        entregados={recorrido.entregadosFuera || 0}
                        color={colors.amber}
                        guardando={isGuardando('entregadosFuera')}
                        onIncrement={() => cambiar('entregadosFuera', +1)}
                        onDecrement={() => cambiar('entregadosFuera', -1)}
                    />
                </View>
            </View>
        </Animated.View>
    );
}

// ─── Pantalla principal ───────────────────────────────────────────────────────

export default function PanelScreen() {
    const { colors } = useTheme();
    const toast = useToast();
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
            setRecorridos((recData || []).map(r => ({ ...r, entregadosFuera: r.entregadosFuera ?? 0 })));
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

    // ─── Auto-sincronización al recuperar conectividad ───────────────────────────────
    const [pendientesOffline, setPendientesOffline] = useState(0);
    const appState = useRef<AppStateStatus>(AppState.currentState);
    const sincronizando = useRef(false);

    const intentarSync = useCallback(async () => {
        if (sincronizando.current) return;
        const cola = await leerCola();
        if (cola.length === 0) return;

        sincronizando.current = true;
        const { ok, fail } = await flushCola();
        sincronizando.current = false;

        setPendientesOffline(fail);
        if (ok > 0) {
            // Recargar datos para que la UI refleje confirmación del servidor
            cargarDatos();
        }
    }, [cargarDatos]);

    useEffect(() => {
        // Leer cola inicial al montar el componente
        leerCola().then(q => setPendientesOffline(q.length));

        const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            if (appState.current.match(/inactive|background/) && nextState === 'active') {
                // App vuelve a primer plano → intentar vaciar la cola offline
                intentarSync();
            }
            appState.current = nextState;
        });

        // También intentar sincronizar al montar (por si ya había cosas pendientes)
        intentarSync();

        return () => sub.remove();
    }, [intentarSync]);

    const handleGuardar = useCallback(async (id: number, campo: 'entregados' | 'entregadosFuera', valor: number) => {
        // 1. Actualización optimista inmediata
        setRecorridos(prev => prev.map(r => r.id === id ? { ...r, [campo]: valor } : r));
        setGuardandoCampo({ id, campo });
        try {
            const { error } = await supabase.from('Recorridos').update({ [campo]: valor }).eq('id', id);
            if (error) throw error;
            // Éxito: si había una mutación pendiente para este campo, la removemos
            const cola = await leerCola();
            const nueva = cola.filter(m => !(m.id === id && m.campo === campo));
            await guardarCola(nueva);
            setPendientesOffline(nueva.length);
        } catch (err: any) {
            if (isNetworkError(err)) {
                // 2. Error de red → encolar silenciosamente
                await encolarMutacion({ id, campo, valor, timestamp: Date.now() });
                const cola = await leerCola();
                setPendientesOffline(cola.length);
                toast.warning('Sin conexión — se guardará cuando vuelva internet');
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
            } else {
                // Error de base de datos u otro: revertir y notificar
                await cargarDatos();
                toast.error(err?.message || 'No se pudo guardar el dato.');
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            }
        } finally {
            setGuardandoCampo(null);
        }
    }, [cargarDatos, toast]);

    const handleRefresh = () => { setRefrescando(true); cargarDatos(); };

    const totalPaquetes = recorridos.reduce((s, r) => s + (r.pqteDia || 0) + (r.porFuera || 0), 0);
    const totalEntregadosTodo = recorridos.reduce((s, r) => s + (r.entregados || 0) + (r.entregadosFuera || 0), 0);
    const progresoGlobal = totalPaquetes > 0 ? totalEntregadosTodo / totalPaquetes : 0;

    if (cargando) {
        return (
            <ScrollView style={[S.container, { backgroundColor: colors.bg }]} contentContainerStyle={S.content}
                scrollEnabled={false}>
                {[0, 1, 2].map(i => <SkeletonFilaRecorrido key={i} />)}
            </ScrollView>
        );
    }

    if (!choferInfo) {
        return (
            <View style={[S.sinAsignar, { backgroundColor: colors.bg }]}>
                <Ionicons name="person-remove-outline" size={56} color={colors.borderSubtle} />
                <Text style={[S.sinAsignarTitulo, { color: colors.textSecondary }]}>Tu cuenta no está asignada</Text>
                <Text style={[S.sinAsignarSub, { color: colors.textMuted }]}>
                    Pedile al administrador que vincule tu email a un chofer en el sistema.
                </Text>
            </View>
        );
    }

    if (recorridos.length === 0) {
        return (
            <ScrollView style={[S.container, { backgroundColor: colors.bg }]} contentContainerStyle={S.content}
                refreshControl={<RefreshControl refreshing={refrescando} onRefresh={handleRefresh} tintColor={colors.blue} colors={[colors.blue]} />}>
                <GreetingBox saludo={saludo} choferInfo={choferInfo} totalPaquetes={0} totalEntregados={0} progreso={0} />
                <View style={S.sinRutas}>
                    <Ionicons name="map-outline" size={52} color={colors.borderSubtle} />
                    <Text style={[S.sinRutasTitulo, { color: colors.textSecondary }]}>Sin rutas asignadas hoy</Text>
                    <Text style={[S.sinRutasSub, { color: colors.textMuted }]}>
                        El administrador todavía no te asignó recorridos para hoy.
                    </Text>
                </View>
            </ScrollView>
        );
    }

    return (
        <ScrollView style={[S.container, { backgroundColor: colors.bg }]} contentContainerStyle={S.content}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refrescando} onRefresh={handleRefresh} tintColor={colors.blue} colors={[colors.blue]} />}>
            <GreetingBox saludo={saludo} choferInfo={choferInfo}
                totalPaquetes={totalPaquetes} totalEntregados={totalEntregadosTodo} progreso={progresoGlobal} />

            {/* Banner offline: solo visible si hay cambios pendientes de sincronizar */}
            {pendientesOffline > 0 && (
                <TouchableOpacity
                    style={S.offlineBanner}
                    onPress={intentarSync}
                    activeOpacity={0.8}
                >
                    <Ionicons name="cloud-offline-outline" size={16} color="#F59E0B" />
                    <Text style={S.offlineBannerText}>
                        {pendientesOffline} cambio{pendientesOffline !== 1 ? 's' : ''} pendiente{pendientesOffline !== 1 ? 's' : ''} — Tocá para sincronizar
                    </Text>
                    <Ionicons name="sync-outline" size={14} color="#F59E0B" />
                </TouchableOpacity>
            )}

            {recorridos.map((rec, i) => (
                <FilaRecorrido key={rec.id} recorrido={rec} index={i}
                    onGuardar={handleGuardar} guardandoCampo={guardandoCampo} />
            ))}
            <View style={{ height: 40 }} />
        </ScrollView>
    );
}

// ─── GreetingBox ──────────────────────────────────────────────────────────────

function GreetingBox({ saludo, choferInfo, totalPaquetes, totalEntregados, progreso }:
    { saludo: string; choferInfo: ChoferInfo; totalPaquetes: number; totalEntregados: number; progreso: number }) {
    const { colors } = useTheme();
    const condicionCfg = getCondicionCfg(choferInfo.condicion);
    const restante = totalPaquetes - totalEntregados;

    return (
        <View style={[S.greetingBox, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <View style={S.greetingTop}>
                <View style={{ flex: 1 }}>
                    <Text style={[S.greetingEyebrow, { color: colors.blue }]}>PANEL DEL DÍA</Text>
                    <Text style={[S.greetingNombre, { color: colors.textPrimary }]}>
                        {saludo}, {choferInfo.nombre.split(' ')[0]} 👋
                    </Text>
                </View>
                <View style={[S.condicionBadge, { backgroundColor: condicionCfg.bg }]}>
                    <Text style={[S.condicionText, { color: condicionCfg.color }]}>{condicionCfg.label}</Text>
                </View>
            </View>
            <View style={[S.statsRow, { backgroundColor: colors.bg, borderColor: colors.borderSubtle }]}>
                <View style={S.statBox}>
                    <Text style={[S.statNum, { color: colors.textPrimary }]}>{totalPaquetes}</Text>
                    <Text style={[S.statLabel, { color: colors.textMuted }]}>Total</Text>
                </View>
                <View style={[S.statBox, { borderLeftWidth: 1, borderRightWidth: 1, borderColor: colors.borderSubtle }]}>
                    <Text style={[S.statNum, { color: colors.green }]}>{totalEntregados}</Text>
                    <Text style={[S.statLabel, { color: colors.textMuted }]}>Entregados</Text>
                </View>
                <View style={S.statBox}>
                    <Text style={[S.statNum, { color: restante > 0 ? colors.amber : '#6B7280' }]}>{restante}</Text>
                    <Text style={[S.statLabel, { color: colors.textMuted }]}>Restantes</Text>
                </View>
            </View>
            {totalPaquetes > 0 && (
                <View style={{ marginTop: 14 }}>
                    <View style={[S.progressBg, { flex: undefined, backgroundColor: colors.bg, borderColor: colors.borderSubtle }]}>
                        <View style={[S.progressFill, {
                            width: `${progreso * 100}%` as any,
                            backgroundColor: progreso >= 1 ? colors.green : colors.blue,
                        }]} />
                    </View>
                    <View style={S.progressFooter}>
                        <Text style={[S.progressLabel, { color: colors.textMuted }]}>
                            {Math.round(progreso * 100)}% completado
                        </Text>
                        {progreso >= 1 && (
                            <View style={S.completadoBadge}>
                                <Ionicons name="checkmark-circle" size={11} color={colors.green} />
                                <Text style={S.completadoText}>¡Día completo!</Text>
                            </View>
                        )}
                    </View>
                </View>
            )}
        </View>
    );
}

// ─── Estilos estáticos (sin colores de tema) ──────────────────────────────────

const C = StyleSheet.create({
    box: { flex: 1, alignItems: 'center', paddingVertical: 16, paddingHorizontal: 6, gap: 8 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap', justifyContent: 'center' },
    label: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' },
    totalBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
    totalText: { fontSize: 10, fontWeight: '700' },
    sinBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1 },
    sinText: { fontSize: 10, fontWeight: '600' },
    numWrap: { alignItems: 'center', minHeight: 52, justifyContent: 'center' },
    num: { fontSize: 34, fontWeight: '800', lineHeight: 38 },
    numSub: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },
    restBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
    restText: { fontSize: 10, fontWeight: '600' },
    botonesRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    btn: {
        width: 42, height: 42, borderRadius: 12,
        borderWidth: 1.5,
        justifyContent: 'center', alignItems: 'center',
    },
    btnAdd: {},
    btnDis: { opacity: 0.25 },
    sinMsg: { fontSize: 10, textAlign: 'center', lineHeight: 14 },
});

const S = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 16 },
    loader: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
    loaderText: { fontSize: 13, fontWeight: '500' },
    sinAsignar: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14, padding: 40 },
    sinAsignarTitulo: { fontSize: 16, fontWeight: '700', textAlign: 'center' },
    sinAsignarSub: { fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 20 },
    sinRutas: { alignItems: 'center', paddingVertical: 48, gap: 10 },
    sinRutasTitulo: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
    sinRutasSub: { fontSize: 13, fontWeight: '500', textAlign: 'center', lineHeight: 20, paddingHorizontal: 20 },
    greetingBox: { borderRadius: 20, padding: 20, marginBottom: 14, borderWidth: 1 },
    greetingTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 },
    greetingEyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
    greetingNombre: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
    condicionBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
    condicionText: { fontSize: 11, fontWeight: '700' },
    statsRow: { flexDirection: 'row', borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
    statBox: { flex: 1, alignItems: 'center', paddingVertical: 12 },
    statNum: { fontSize: 20, fontWeight: '800' },
    statLabel: { fontSize: 9, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2 },
    progressBg: { height: 6, borderRadius: 3, borderWidth: 1, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 3 },
    progressFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
    progressLabel: { fontSize: 10, fontWeight: '600' },
    completadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(52,211,153,0.1)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    completadoText: { fontSize: 10, color: '#34D399', fontWeight: '700' },
    filaCard: { flexDirection: 'row', borderRadius: 18, marginBottom: 12, borderWidth: 1, overflow: 'hidden' },
    filaAccent: { width: 4 },
    filaBody: { flex: 1, padding: 16 },
    filaHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
    filaLocalidad: { fontSize: 16, fontWeight: '700', marginBottom: 6 },
    zonaBadge: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
    zonaText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.3 },
    todoCompletoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(52,211,153,0.1)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.25)', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
    todoCompletoBadgeText: { fontSize: 11, color: '#34D399', fontWeight: '700' },
    progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    progressRowLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, width: 30 },
    progressPct: { fontSize: 9, fontWeight: '700', width: 28, textAlign: 'right' },
    contadoresRow: { flexDirection: 'row', borderRadius: 14, overflow: 'hidden', borderWidth: 1, marginTop: 12 },
    contadoresDivisor: { width: 1 },
    offlineBanner: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: 'rgba(245,158,11,0.10)',
        borderWidth: 1, borderColor: 'rgba(245,158,11,0.30)',
        borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
        marginBottom: 12,
    },
    offlineBannerText: {
        flex: 1, color: '#F59E0B', fontSize: 12, fontWeight: '700',
    },
});