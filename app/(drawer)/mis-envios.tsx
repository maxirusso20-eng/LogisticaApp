// app/(drawer)/mis-envios.tsx
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    LayoutAnimation,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    UIManager,
    View,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useTheme } from '../../lib/ThemeContext';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

// "Mis Envíos" — el detalle envío por envío del chofer, POR DÍA, con dirección y
// estado de cada paquete (entregados/errores/pendientes/post-21). Lee
// envios_registro (WHERE chofer = su nombre), que puebla el import de Light Data.
// Espeja la pantalla web (PantallaMisEnvios). NO participa del cálculo de KPI.

interface Envio {
    id: string;
    fecha: string | null;
    estado: string | null;
    categoria: string | null;
    es_error: boolean;
    post21: boolean;
    direccion: string | null;
    localidad: string | null;
    cliente: string | null;
    tracking: string | null;
}

type CatKey = 'entregado' | 'error' | 'pendiente' | 'excluido';
const CAT: Record<CatKey, { icon: string; label: string; col: string }> = {
    entregado: { icon: 'checkmark-circle', label: 'Entregado', col: '#10b981' },
    error:     { icon: 'alert-circle',     label: 'Error',     col: '#ef4444' },
    pendiente: { icon: 'cube',             label: 'Pendiente', col: '#f59e0b' },
    excluido:  { icon: 'remove-circle',    label: 'Excluido',  col: '#64748b' },
};
const catInfo = (k: string | null) => CAT[(k || '') as CatKey] || { icon: 'help-circle', label: k || '—', col: '#64748b' };

const CHIPS: { k: string; l: string; col: string }[] = [
    { k: 'todos', l: 'Todos', col: '#3b82f6' },
    { k: 'error', l: '⚠️ Errores', col: CAT.error.col },
    { k: 'entregado', l: '✅ Entregados', col: CAT.entregado.col },
    { k: 'pendiente', l: '📦 Pendientes', col: CAT.pendiente.col },
    { k: 'post21', l: '🌙 Post-21', col: '#a855f7' },
];
const pasaChip = (r: Envio, chip: string) => {
    if (chip === 'todos') return true;
    if (chip === 'post21') return !!r.post21;
    if (chip === 'error') return !!r.es_error;
    return r.categoria === chip;
};

const DIAS_SEM = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (iso: string | null) => {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    if (!y || !m || !d) return iso || '—';
    return `${DIAS_SEM[new Date(y, m - 1, d).getDay()]} ${d} de ${MESES[m - 1]}`;
};

export default function MisEnviosScreen() {
    const { colors } = useTheme();
    const [registros, setRegistros] = useState<Envio[]>([]);
    const [cargando, setCargando] = useState(true);
    const [refrescando, setRefrescando] = useState(false);
    const [chip, setChip] = useState('todos');
    const [diaAbierto, setDiaAbierto] = useState<string | null>(null);
    const [miNombre, setMiNombre] = useState('');
    const [sinChofer, setSinChofer] = useState(false);

    const cargar = useCallback(async () => {
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user?.email) { setCargando(false); setRefrescando(false); return; }
            const { data: chofer } = await supabase
                .from('Choferes').select('nombre').eq('email', user.email).maybeSingle();
            if (!chofer?.nombre) { setSinChofer(true); setCargando(false); setRefrescando(false); return; }
            setMiNombre(chofer.nombre);
            const { data } = await supabase
                .from('envios_registro')
                .select('id, fecha, estado, categoria, es_error, post21, direccion, localidad, cliente, tracking')
                .eq('chofer', chofer.nombre)
                .order('fecha', { ascending: false });
            setRegistros((data as Envio[]) || []);
        } catch (err) {
            console.error('[MisEnvios]', err);
        } finally {
            setCargando(false);
            setRefrescando(false);
        }
    }, []);

    useEffect(() => {
        cargar();
        const canal = supabase
            .channel('envios-registro-app')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'envios_registro' }, () => cargar())
            .subscribe();
        return () => { void supabase.removeChannel(canal); };
    }, [cargar]);

    const filtrados = useMemo(() => registros.filter(r => pasaChip(r, chip)), [registros, chip]);

    const conteos = useMemo(() => {
        const n: Record<string, number> = { todos: registros.length, entregado: 0, error: 0, pendiente: 0, post21: 0 };
        for (const r of registros) { if (r.categoria && n[r.categoria] != null) n[r.categoria]++; if (r.post21) n.post21++; }
        return n;
    }, [registros]);

    const dias = useMemo(() => {
        const porDia: Record<string, Envio[]> = {};
        for (const r of filtrados) { if (!r.fecha) continue; (porDia[r.fecha] ||= []).push(r); }
        return Object.entries(porDia).map(([fecha, filas]) => ({ fecha, filas }))
            .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    }, [filtrados]);

    useEffect(() => { if (dias.length && diaAbierto === null) setDiaAbierto(dias[0].fecha); }, [dias, diaAbierto]);

    const toggleDia = (fecha: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setDiaAbierto(prev => prev === fecha ? null : fecha);
    };

    if (cargando) {
        return (
            <View style={[S.center, { backgroundColor: colors.bg }]}>
                <ActivityIndicator color={colors.blue} size="large" />
            </View>
        );
    }

    if (sinChofer) {
        return (
            <View style={[S.center, { backgroundColor: colors.bg, padding: 40 }]}>
                <Ionicons name="person-remove-outline" size={52} color={colors.borderSubtle} />
                <Text style={[S.vacioTitulo, { color: colors.textSecondary }]}>Tu cuenta no está vinculada</Text>
                <Text style={[S.vacioSub, { color: colors.textMuted }]}>Pedile al admin que cargue tu email en tu ficha de chofer.</Text>
            </View>
        );
    }

    return (
        <ScrollView style={[S.container, { backgroundColor: colors.bg }]} contentContainerStyle={S.content}
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); cargar(); }} tintColor={colors.blue} colors={[colors.blue]} />}>

            <View style={[S.headerCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                <Text style={[S.eyebrow, { color: colors.blue }]}>MIS ENVÍOS</Text>
                <Text style={[S.titulo, { color: colors.textPrimary }]}>Tu detalle día por día</Text>
                <Text style={[S.subtitulo, { color: colors.textMuted }]}>Cada paquete, su dirección y en qué terminó. {miNombre ? `(${miNombre})` : ''}</Text>
            </View>

            {/* Chips de categoría */}
            <View style={S.chipsRow}>
                {CHIPS.map(m => {
                    const on = chip === m.k;
                    const n = conteos[m.k] ?? 0;
                    return (
                        <TouchableOpacity key={m.k} onPress={() => setChip(m.k)} activeOpacity={0.8}
                            style={[S.chip, { backgroundColor: on ? m.col : colors.bgInput, borderColor: on ? m.col : colors.border }]}>
                            <Text style={[S.chipText, { color: on ? '#fff' : colors.textMuted }]}>{m.l} {n}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {dias.length === 0 ? (
                <View style={[S.vacioCard, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
                    <Ionicons name="cube-outline" size={44} color={colors.borderSubtle} />
                    <Text style={[S.vacioTitulo, { color: colors.textSecondary }]}>Sin envíos {chip !== 'todos' ? 'para ese filtro' : 'cargados'}</Text>
                    <Text style={[S.vacioSub, { color: colors.textMuted }]}>Aparecen cuando el admin importa Light Data.</Text>
                </View>
            ) : dias.map(d => {
                const abierto = diaAbierto === d.fecha;
                const errores = d.filas.filter(r => r.es_error).length;
                return (
                    <View key={d.fecha} style={[S.diaCard, { backgroundColor: colors.bgCard, borderColor: abierto ? `${colors.blue}55` : colors.border }]}>
                        <TouchableOpacity onPress={() => toggleDia(d.fecha)} activeOpacity={0.7} style={S.diaHeader}>
                            <View style={[S.diaAccent, { backgroundColor: colors.blue }]} />
                            <Text style={[S.diaTitulo, { color: colors.textPrimary }]}>{fechaLarga(d.fecha)}</Text>
                            <View style={[S.diaBadge, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
                                <Text style={[S.diaBadgeText, { color: colors.textMuted }]}>{d.filas.length}</Text>
                            </View>
                            {errores > 0 && (
                                <View style={[S.diaBadge, { backgroundColor: `${CAT.error.col}18`, borderColor: `${CAT.error.col}44` }]}>
                                    <Text style={[S.diaBadgeText, { color: CAT.error.col }]}>⚠️ {errores}</Text>
                                </View>
                            )}
                            <Ionicons name={abierto ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textMuted} />
                        </TouchableOpacity>

                        {abierto && (
                            <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
                                {d.filas.map((r, i) => {
                                    const ci = catInfo(r.categoria);
                                    return (
                                        <View key={r.id || i} style={[S.envio, { borderTopColor: colors.border, borderTopWidth: i === 0 ? 0 : 1 }]}>
                                            <View style={S.envioTags}>
                                                <View style={[S.estadoBadge, { backgroundColor: `${ci.col}18`, borderColor: `${ci.col}44` }]}>
                                                    <Ionicons name={ci.icon as any} size={12} color={ci.col} />
                                                    <Text style={[S.estadoText, { color: ci.col }]} numberOfLines={1}>{r.estado || ci.label}</Text>
                                                </View>
                                                {r.post21 && (
                                                    <View style={[S.estadoBadge, { backgroundColor: 'rgba(168,85,247,0.14)', borderColor: 'rgba(168,85,247,0.4)' }]}>
                                                        <Text style={[S.estadoText, { color: '#a855f7' }]}>🌙 +21h</Text>
                                                    </View>
                                                )}
                                            </View>
                                            {!!r.cliente && <Text style={[S.cliente, { color: colors.textPrimary }]}>{r.cliente}</Text>}
                                            {!!r.direccion && (
                                                <View style={S.linea}>
                                                    <Ionicons name="location-outline" size={13} color={colors.textMuted} />
                                                    <Text style={[S.lineaText, { color: colors.textMuted }]}>{r.direccion}{r.localidad ? ` · ${r.localidad}` : ''}</Text>
                                                </View>
                                            )}
                                            {!!r.tracking && (
                                                <View style={S.linea}>
                                                    <Ionicons name="cube-outline" size={12} color={colors.textMuted} />
                                                    <Text style={[S.tracking, { color: colors.textMuted }]}>{r.tracking}</Text>
                                                </View>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                    </View>
                );
            })}
            <View style={{ height: 40 }} />
        </ScrollView>
    );
}

const S = StyleSheet.create({
    container: { flex: 1 },
    content: { padding: 16 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
    headerCard: { borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1 },
    eyebrow: { fontSize: 10, fontWeight: '800', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4 },
    titulo: { fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
    subtitulo: { fontSize: 12.5, fontWeight: '500', marginTop: 4 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 14 },
    chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1 },
    chipText: { fontSize: 12, fontWeight: '800' },
    diaCard: { borderRadius: 14, marginBottom: 10, borderWidth: 1, overflow: 'hidden' },
    diaHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 13 },
    diaAccent: { width: 4, height: 22, borderRadius: 2 },
    diaTitulo: { flex: 1, fontSize: 14, fontWeight: '800' },
    diaBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, borderWidth: 1 },
    diaBadgeText: { fontSize: 11.5, fontWeight: '800' },
    envio: { paddingVertical: 11, paddingHorizontal: 15, gap: 5 },
    envioTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
    estadoBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, borderWidth: 1, maxWidth: '100%' },
    estadoText: { fontSize: 11.5, fontWeight: '700' },
    cliente: { fontSize: 14, fontWeight: '700' },
    linea: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    lineaText: { flex: 1, fontSize: 12.5, fontWeight: '500' },
    tracking: { fontSize: 11.5, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    vacioCard: { alignItems: 'center', gap: 8, paddingVertical: 44, borderRadius: 16, borderWidth: 1 },
    vacioTitulo: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
    vacioSub: { fontSize: 13, fontWeight: '500', textAlign: 'center', paddingHorizontal: 24, lineHeight: 19 },
});
