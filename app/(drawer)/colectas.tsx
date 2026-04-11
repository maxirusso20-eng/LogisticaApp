// app/(drawer)/colectas.tsx
import { Ionicons } from '@expo/vector-icons';
import * as Notifications from 'expo-notifications';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { ADMIN_EMAIL, getSaludo } from '../../lib/constants';
import { startTracking, stopTracking } from '../../lib/locationTracker';
import { supabase } from '../../lib/supabase';

// ─────────────────────────────────────────────
// CONSTANTE: email del administrador
// ─────────────────────────────────────────────


// ─────────────────────────────────────────────
// CACHÉ GLOBAL — fuera del componente React
//
// Sobrevive re-renders, hot-reloads del metro bundler en dev, y cualquier
// desmontaje/remontaje del componente. Nunca se limpia solo por setState.
//
// Clave : String(id)  → garantiza igualdad estricta sin importar si la
//         DB devuelve el id como number o string.
// Valor : Date.now() en el momento en que el CHOFER hizo el toggle.
// TTL   : 5 000 ms. Si el eco de Supabase Realtime llega después de 5 s
//         se trata como cambio externo y se notifica.
// ─────────────────────────────────────────────

const ignorarNotificacionesCache = new Map<string, number>();
const CACHE_TTL_MS = 5_000;

// ─────────────────────────────────────────────
// NOTIFICACIONES — configuración global
// Solo se disparan para cambios que vienen DESDE LA CENTRAL.
// El chofer nunca se notifica a sí mismo.
// ─────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function notificarCambioDesdecentral(payload: {
  clienteNombre?: string;
  clienteDireccion?: string;
  nuevoEstado?: boolean;
  tipo?: 'UPDATE' | 'INSERT' | 'DELETE';
}): Promise<void> {
  const nombre = payload.clienteNombre?.trim() || 'Una colecta';
  let titulo = '📋 Actualización desde la central';
  let cuerpo = `${nombre} fue modificada.`;

  if (payload.tipo === 'INSERT') {
    titulo = '🆕 Nueva colecta asignada';
    cuerpo = `Te asignaron: ${nombre}`;
    if (payload.clienteDireccion) cuerpo += ` · ${payload.clienteDireccion}`;
  } else if (payload.tipo === 'DELETE') {
    titulo = '🗑️ Colecta removida';
    cuerpo = `${nombre} fue eliminada de tu lista.`;
  } else {
    if (payload.nuevoEstado === false) {
      titulo = '🔄 Colecta designada';
      cuerpo = `${nombre} fue marcada para el día de hoy.`;
    } else if (payload.nuevoEstado === true) {
      titulo = '✅ Colecta completada por central';
      cuerpo = `${nombre} fue marcada como completada.`;
    } else {
      cuerpo = `Se actualizaron los datos de ${nombre}.`;
    }
  }

  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: titulo, body: cuerpo, sound: true, data: { tipo: payload.tipo ?? 'UPDATE' } },
      trigger: null,
    });
  } catch (err) {
    console.warn('[Notificación] No se pudo disparar:', err);
  }
}

// ─────────────────────────────────────────────
// HELPER: enviar mensaje automático al chat
// ─────────────────────────────────────────────

async function enviarMensajeAutoChatColecta(
  emailChofer: string,
  nombreColecta: string,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from('mensajes').insert([{
      user_id: user.id,
      remitente: 'Sistema',
      texto: `🔔 Colecta recogida: ${nombreColecta}`,
      chofer_email: emailChofer,
    }]);
    if (error) console.warn('[Chat auto] Error Supabase:', error.message);
  } catch (err) {
    console.warn('[Chat auto] Error enviando mensaje:', err);
  }
}

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

interface Cliente {
  id: number | string;
  cliente: string;
  direccion: string;
  horario: string;
  chofer: string;
  completado: boolean;
}

// Grupo de colectas por nombre de chofer — usado exclusivamente en la vista admin
interface GrupoChofer {
  nombre: string;
  colectas: Cliente[];
  hechas: number;
  total: number;
}

type FiltroColecta = 'todas' | 'pendientes' | 'completadas';

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────



const abrirMapa = (direccion: string) => {
  if (!direccion) return;
  const urlEncoded = encodeURIComponent(direccion);
  const url = Platform.select({
    ios: `maps:0,0?q=${urlEncoded}`,
    android: `geo:0,0?q=${urlEncoded}`,
    default: `https://www.google.com/maps/search/?api=1&query=${urlEncoded}`,
  });
  if (url) Linking.openURL(url).catch(err => console.error('Error abriendo mapa:', err));
};

// Agrupa un array de Cliente por el campo `chofer`, ordenando los grupos
// alfabéticamente y poniendo primero los que tienen colectas pendientes.
const agruparPorChofer = (lista: Cliente[]): GrupoChofer[] => {
  const mapa = new Map<string, Cliente[]>();

  for (const c of lista) {
    const nombre = c.chofer?.trim() || 'Sin asignar';
    if (!mapa.has(nombre)) mapa.set(nombre, []);
    mapa.get(nombre)!.push(c);
  }

  return Array.from(mapa.entries())
    .map(([nombre, colectas]) => ({
      nombre,
      colectas: colectas.sort((a, b) => (a.horario || '').localeCompare(b.horario || '')),
      hechas: colectas.filter(c => c.completado).length,
      total: colectas.length,
    }))
    // Primero los grupos con pendientes, luego por nombre
    .sort((a, b) => {
      const aPendientes = a.total - a.hechas;
      const bPendientes = b.total - b.hechas;
      if (bPendientes !== aPendientes) return bPendientes - aPendientes;
      return a.nombre.localeCompare(b.nombre);
    });
};

// ─────────────────────────────────────────────
// COMPONENTE: ColectaCard (vista CHOFER — sin cambios)
// ─────────────────────────────────────────────

function ColectaCard({
  item, index, onToggle, toggling,
}: {
  item: Cliente;
  index: number;
  onToggle: (id: number | string, actual: boolean, nombreCliente: string) => void;
  toggling: boolean;
}) {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: 350, delay: index * 55, useNativeDriver: true }).start();
  }, []);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.96, duration: 70, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 70, useNativeDriver: true }),
    ]).start();
    onToggle(item.id, item.completado, item.cliente);
  };

  const done = item.completado;

  return (
    <Animated.View style={[styles.card, done && styles.cardDone, { opacity: fade, transform: [{ scale }] }]}>
      <View style={[styles.accent, done && styles.accentDone]} />

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.clienteNombre, done && styles.textDone]} numberOfLines={1}>
              {item.cliente || '—'}
            </Text>
            <View style={styles.horarioRow}>
              <Ionicons name="time-outline" size={13} color={done ? '#1A3050' : '#4F8EF7'} />
              <Text style={[styles.horarioText, done && { color: '#1A3050' }]}>
                {item.horario || 'Sin horario'}
              </Text>
            </View>
          </View>

          <TouchableOpacity onPress={handlePress} disabled={toggling} activeOpacity={0.7} style={styles.checkWrap}>
            {toggling
              ? <ActivityIndicator size="small" color="#4F8EF7" />
              : <Ionicons name={done ? 'checkmark-circle' : 'ellipse-outline'} size={30} color={done ? '#34D399' : '#1A3050'} />
            }
          </TouchableOpacity>
        </View>

        <View style={styles.details}>
          <TouchableOpacity style={styles.addressTouchable} activeOpacity={0.6} onPress={() => item.direccion && abrirMapa(item.direccion)}>
            <Ionicons name="location-outline" size={14} color={done ? '#1A3050' : '#4F8EF7'} />
            <Text style={[styles.detailText, done && styles.textDone]} numberOfLines={2}>{item.direccion || '—'}</Text>
            {item.direccion ? (
              <View style={[styles.mapNavIconWrap, done && { backgroundColor: 'rgba(26,48,80,0.2)' }]}>
                <Ionicons name="map-outline" size={18} color={done ? '#1A3050' : '#4F8EF7'} />
              </View>
            ) : null}
          </TouchableOpacity>

          <View style={[styles.detailRow, { marginTop: 4, marginLeft: 2 }]}>
            <Ionicons name="person-outline" size={13} color="#2A4A70" />
            <Text style={[styles.detailText, done && styles.textDone]}>{item.chofer || 'Sin asignar'}</Text>
          </View>
        </View>

        {done && (
          <View style={styles.doneBadge}>
            <Ionicons name="checkmark-done" size={11} color="#34D399" />
            <Text style={styles.doneBadgeText}>Completada</Text>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────
// COMPONENTE: FilaColectaAdmin
// Fila compacta dentro de la card de chofer (vista ADMIN)
// ─────────────────────────────────────────────

const FilaColectaAdmin: React.FC<{ item: Cliente }> = ({ item }) => {
  const done = item.completado;
  return (
    <View style={[adminStyles.fila, done && adminStyles.filaDone]}>
      {/* Indicador de estado */}
      <View style={[adminStyles.filaIndicador, done && adminStyles.filaIndicadorDone]} />

      {/* Datos */}
      <View style={{ flex: 1 }}>
        <Text style={[adminStyles.filaNombre, done && adminStyles.filaTextoDone]} numberOfLines={1}>
          {item.cliente || '—'}
        </Text>
        <View style={adminStyles.filaMeta}>
          <Ionicons name="time-outline" size={11} color={done ? '#1A3050' : '#4A6FA5'} />
          <Text style={[adminStyles.filaMetaText, done && { color: '#1A3050' }]}>
            {item.horario || 'Sin horario'}
          </Text>
          {item.direccion ? (
            <>
              <Text style={adminStyles.filaMetaSep}>·</Text>
              <Ionicons name="location-outline" size={11} color={done ? '#1A3050' : '#4A6FA5'} />
              <Text style={[adminStyles.filaMetaText, { flex: 1 }, done && { color: '#1A3050' }]} numberOfLines={1}>
                {item.direccion}
              </Text>
            </>
          ) : null}
        </View>
      </View>

      {/* Badge de estado */}
      {done ? (
        <View style={adminStyles.badgeDone}>
          <Ionicons name="checkmark-done" size={10} color="#34D399" />
          <Text style={adminStyles.badgeDoneText}>Hecha</Text>
        </View>
      ) : (
        <View style={adminStyles.badgePendiente}>
          <Text style={adminStyles.badgePendienteText}>Pendiente</Text>
        </View>
      )}
    </View>
  );
};

// ─────────────────────────────────────────────
// COMPONENTE: CardChoferAdmin
// Card colapsable por chofer (vista ADMIN)
// ─────────────────────────────────────────────

const CardChoferAdmin: React.FC<{ grupo: GrupoChofer; index: number }> = ({ grupo, index }) => {
  const [expandido, setExpandido] = useState(true);
  const fade = useRef(new Animated.Value(0)).current;
  const rotacion = useRef(new Animated.Value(expandido ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(fade, {
      toValue: 1, duration: 400,
      delay: index * 80, useNativeDriver: true,
    }).start();
  }, []);

  const toggleExpandido = () => {
    const nuevoValor = !expandido;
    setExpandido(nuevoValor);
    Animated.timing(rotacion, {
      toValue: nuevoValor ? 1 : 0,
      duration: 220, useNativeDriver: true,
    }).start();
  };

  const rotarIcono = rotacion.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  const pendientes = grupo.total - grupo.hechas;
  const porcentaje = grupo.total > 0 ? grupo.hechas / grupo.total : 0;
  const todoCompleto = pendientes === 0;

  // Color del anillo de progreso según avance
  const colorProgreso = todoCompleto
    ? '#34D399'
    : porcentaje >= 0.5
      ? '#4F8EF7'
      : '#F59E0B';

  // Iniciales del chofer para el avatar
  const iniciales = grupo.nombre
    .split(' ')
    .map(p => p[0] || '')
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Animated.View style={[adminStyles.card, { opacity: fade }]}>
      {/* ── Header del grupo ── */}
      <TouchableOpacity
        style={adminStyles.cardHeader}
        onPress={toggleExpandido}
        activeOpacity={0.75}
      >
        {/* Avatar con inicial */}
        <View style={[adminStyles.avatar, { borderColor: colorProgreso + '55' }]}>
          <Text style={[adminStyles.avatarText, { color: colorProgreso }]}>{iniciales}</Text>
        </View>

        {/* Nombre y contador */}
        <View style={{ flex: 1 }}>
          <Text style={adminStyles.choferNombre} numberOfLines={1}>{grupo.nombre}</Text>
          <View style={adminStyles.progresoRow}>
            <Text style={[adminStyles.progresoTexto, { color: colorProgreso }]}>
              {grupo.hechas}/{grupo.total} completadas
            </Text>
            {!todoCompleto && (
              <View style={adminStyles.pendienteBadge}>
                <Text style={adminStyles.pendienteBadgeText}>{pendientes} pend.</Text>
              </View>
            )}
          </View>
        </View>

        {/* Barra de progreso circular simplificada → barra lineal compacta */}
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <View style={adminStyles.miniBarBg}>
            <View style={[
              adminStyles.miniBarFill,
              { width: `${porcentaje * 100}%` as any, backgroundColor: colorProgreso },
            ]} />
          </View>
          <Animated.View style={{ transform: [{ rotate: rotarIcono }] }}>
            <Ionicons name="chevron-down" size={16} color="#4A6FA5" />
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* ── Filas de colectas (colapsable) ── */}
      {expandido && (
        <View style={adminStyles.filasContainer}>
          <View style={adminStyles.filasDivider} />
          {grupo.colectas.map((c) => (
            <FilaColectaAdmin key={String(c.id)} item={c} />
          ))}
        </View>
      )}
    </Animated.View>
  );
};

// ─────────────────────────────────────────────
// COMPONENTE: VistaAdmin
// Panel completo de supervisión (solo admin)
// ─────────────────────────────────────────────

const VistaAdmin: React.FC<{
  clientes: Cliente[];
  refrescando: boolean;
  onRefresh: () => void;
}> = ({ clientes, refrescando, onRefresh }) => {
  const [busqueda, setBusqueda] = useState('');

  // Agrupa y filtra en memoria — no hace fetch adicional
  const grupos = useMemo(() => {
    const lista = busqueda.trim()
      ? clientes.filter(c =>
        (c.cliente || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (c.chofer || '').toLowerCase().includes(busqueda.toLowerCase()) ||
        (c.direccion || '').toLowerCase().includes(busqueda.toLowerCase())
      )
      : clientes;
    return agruparPorChofer(lista);
  }, [clientes, busqueda]);

  // Stats globales del día
  const totalGlobal = clientes.length;
  const hechasGlobal = clientes.filter(c => c.completado).length;
  const pendientesGlobal = totalGlobal - hechasGlobal;
  const progresoGlobal = totalGlobal > 0 ? hechasGlobal / totalGlobal : 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={onRefresh} tintColor="#4F8EF7" colors={['#4F8EF7']} />
      }
    >
      {/* ── Header admin ── */}
      <View style={adminStyles.headerBox}>
        <View style={adminStyles.headerTopRow}>
          <View>
            <Text style={adminStyles.headerEyebrow}>PANEL DE SUPERVISIÓN</Text>
            <Text style={adminStyles.headerTitle}>Vista del día</Text>
          </View>
          <View style={adminStyles.adminBadge}>
            <Ionicons name="shield-checkmark-outline" size={12} color="#F59E0B" />
            <Text style={adminStyles.adminBadgeText}>Admin</Text>
          </View>
        </View>

        {/* Stats globales */}
        <View style={adminStyles.statsGlobales}>
          <View style={adminStyles.statGlobal}>
            <Text style={adminStyles.statGlobalNum}>{totalGlobal}</Text>
            <Text style={adminStyles.statGlobalLabel}>Total</Text>
          </View>
          <View style={[adminStyles.statGlobal, adminStyles.statGlobalMid]}>
            <Text style={[adminStyles.statGlobalNum, { color: '#34D399' }]}>{hechasGlobal}</Text>
            <Text style={adminStyles.statGlobalLabel}>Hechas</Text>
          </View>
          <View style={adminStyles.statGlobal}>
            <Text style={[adminStyles.statGlobalNum, { color: pendientesGlobal > 0 ? '#F59E0B' : '#6B7280' }]}>
              {pendientesGlobal}
            </Text>
            <Text style={adminStyles.statGlobalLabel}>Pendientes</Text>
          </View>
          <View style={[adminStyles.statGlobal, adminStyles.statGlobalMid]}>
            <Text style={[adminStyles.statGlobalNum, { color: '#4F8EF7' }]}>{grupos.length}</Text>
            <Text style={adminStyles.statGlobalLabel}>Choferes</Text>
          </View>
        </View>

        {/* Barra de progreso global */}
        <View style={{ marginTop: 14 }}>
          <View style={styles.progressBg}>
            <View style={[styles.progressFill, { width: `${progresoGlobal * 100}%` as any }]} />
          </View>
          <Text style={[styles.progressLabel, { marginTop: 5 }]}>
            {Math.round(progresoGlobal * 100)}% del día completado
          </Text>
        </View>
      </View>

      {/* ── Buscador global ── */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color="#2A4A70" style={{ marginRight: 10 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar cliente, chofer o dirección..."
          placeholderTextColor="#1A3050"
          value={busqueda}
          onChangeText={setBusqueda}
        />
        {busqueda.length > 0 && (
          <TouchableOpacity onPress={() => setBusqueda('')}>
            <Ionicons name="close-circle" size={16} color="#2A4A70" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Cards por chofer ── */}
      {grupos.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="people-outline" size={52} color="#1A2540" />
          <Text style={styles.emptyTitle}>
            {busqueda ? 'Sin resultados' : 'Sin colectas hoy'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {busqueda ? 'Probá con otro término.' : 'No hay colectas cargadas para hoy.'}
          </Text>
        </View>
      ) : (
        grupos.map((g, i) => (
          <CardChoferAdmin key={g.nombre} grupo={g} index={i} />
        ))
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
};

// ─────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────

export default function ColectasScreen() {
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

  // ── 1. Fetch de colectas (inteligente según rol) ───────────────────────
  //
  // Admin  → trae TODAS las colectas de la tabla sin filtrar por email.
  // Chofer → filtra por email_chofer (comportamiento original).

  const fetchClientes = useCallback(async (mostrarLoader = false) => {
    if (mostrarLoader) setCargando(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { setCargando(false); setRefrescando(false); return; }

      emailUsuarioRef.current = user.email;
      userIdRef.current = user.id;
      esAdminRef.current = user.email === ADMIN_EMAIL;
      setEsAdmin(user.email === ADMIN_EMAIL);

      const displayName: string =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email.split('@')[0];
      setNombre(displayName.split(' ')[0]);

      // ── Consulta diferente según rol ───────────────────────────────────
      let query = supabase
        .from('Clientes')
        .select('id, cliente, direccion, horario, chofer, completado')
        .order('horario', { ascending: true });

      if (!esAdminRef.current) {
        // Chofer: solo sus colectas
        query = query.eq('email_chofer', user.email);
      }
      // Admin: sin filtro → trae todo

      const { data, error } = await query;
      if (error) throw error;
      setClientes(data || []);
    } catch (err) {
      console.error('Error cargando clientes:', err);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, []);

  // ── 2. Realtime — actualiza UI + notifica solo cambios de la central ───

  useEffect(() => {
    fetchClientes(true);

    const channel = supabase
      .channel('colectas-sync')

      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'Clientes' }, (payload) => {
        const registro = payload.new as Cliente & { email_chofer?: string };
        const registroOld = payload.old as Cliente & { email_chofer?: string };

        setClientes(prev => prev.map(c => c.id === registro.id ? { ...c, ...registro } : c));

        // Admin no recibe notificaciones locales — solo el chofer las necesita
        if (esAdminRef.current) return;

        const idStr = String(registro.id);
        const timestampPropio = ignorarNotificacionesCache.get(idStr);

        if (timestampPropio !== undefined) {
          const edad = Date.now() - timestampPropio;
          ignorarNotificacionesCache.delete(idStr);
          if (edad < CACHE_TTL_MS) return; // eco del propio chofer → silenciar
        }

        // ── LÓGICA DE ASIGNACIÓN ──────────────────────────────────────────
        // Solo notificar al chofer cuando el campo email_chofer pasa de
        // vacío/null a tener un valor → es una ASIGNACIÓN nueva.
        // Si email_chofer se borró o cambió a otro → no notificar.
        //
        // Casos:
        //   old: ''  / null  → new: 'chofer@mail.com'  → asignación  → NOTIFICAR ✅
        //   old: 'x@mail.com'→ new: ''  / null          → desasignación → NO notificar ❌
        //   old: 'x@mail.com'→ new: 'y@mail.com'        → cambio de chofer → NO notificar ❌
        //   old: 'x@mail.com'→ new: 'x@mail.com' (completado cambia) → solo si es el propio chofer
        const emailViejo = registroOld.email_chofer?.trim() || '';
        const emailNuevo = registro.email_chofer?.trim() || '';
        const esAsignacionNueva = !emailViejo && !!emailNuevo;

        // Si no hay email nuevo asignado para este chofer → salir sin notificar
        if (!emailNuevo) return;

        // Solo notificar al chofer que fue asignado, no a todos
        if (emailNuevo !== emailUsuarioRef.current) return;

        // Si fue una desasignación o no es asignación nueva → no notificar
        if (!esAsignacionNueva && registro.completado === registroOld.completado) return;

        // Es una asignación nueva → notificar
        if (esAsignacionNueva) {
          notificarCambioDesdecentral({
            tipo: 'INSERT', // usamos INSERT para el texto "Nueva colecta asignada"
            clienteNombre: registro.cliente,
            clienteDireccion: registro.direccion,
          });
          return;
        }

        // Cambio de completado que viene de la central (no del propio chofer)
        notificarCambioDesdecentral({
          tipo: 'UPDATE',
          clienteNombre: registro.cliente,
          clienteDireccion: registro.direccion,
          nuevoEstado: registro.completado,
        });
      })

      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'Clientes' }, (payload) => {
        const registro = payload.new as Cliente & { email_chofer?: string };

        // Admin recibe todo; chofer solo lo suyo
        if (!esAdminRef.current) {
          if (emailUsuarioRef.current && registro.email_chofer && registro.email_chofer !== emailUsuarioRef.current) return;
        }

        setClientes(prev => {
          if (prev.some(c => c.id === registro.id)) return prev;
          return [...prev, registro].sort((a, b) => (a.horario || '').localeCompare(b.horario || ''));
        });

        if (!esAdminRef.current) {
          notificarCambioDesdecentral({
            tipo: 'INSERT',
            clienteNombre: registro.cliente,
            clienteDireccion: registro.direccion,
          });
        }
      })

      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'Clientes' }, (payload) => {
        const eliminado = payload.old as { id: number | string; cliente?: string };
        setClientes(prev => prev.filter(c => c.id !== eliminado.id));

        if (!esAdminRef.current) {
          notificarCambioDesdecentral({ tipo: 'DELETE', clienteNombre: eliminado.cliente });
        }
      })

      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [fetchClientes]);

  // ── 3. GPS tracking — solo para choferes, no para el admin ────────────

  useEffect(() => {
    let montado = true;

    const iniciarGPS = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        // El admin no necesita trackear su posición
        if (!user?.email || !montado || user.email === ADMIN_EMAIL) return;
        const resultado = await startTracking(user.email);
        if (montado) setGpsStatus(resultado);
      } catch (err) {
        console.warn('[GPS] Error al iniciar tracking:', err);
        if (montado) setGpsStatus('denied');
      }
    };

    iniciarGPS();
    return () => { montado = false; stopTracking().catch(() => { }); };
  }, []);

  const handleRefresh = () => { setRefrescando(true); fetchClientes(); };

  // ── 4. Toggle — solo disponible para el chofer (no para admin) ─────────

  const handleToggle = async (id: number | string, actual: boolean, nombreCliente: string) => {
    const idStr = String(id);
    const nuevoEstado = !actual;

    ignorarNotificacionesCache.set(idStr, Date.now());

    setClientes(prev => prev.map(c => c.id === id ? { ...c, completado: nuevoEstado } : c));
    setToggling(prev => new Set(prev).add(id));

    try {
      const { error } = await supabase
        .from('Clientes')
        .update({ completado: nuevoEstado })
        .eq('id', id);

      if (error) {
        console.error('[Colectas] Error en update:', error.message);
        setClientes(prev => prev.map(c => c.id === id ? { ...c, completado: actual } : c));
        ignorarNotificacionesCache.delete(idStr);
        return;
      }

      if (nuevoEstado === true && userIdRef.current) {
        void enviarMensajeAutoChatColecta(emailUsuarioRef.current!, nombreCliente || 'Sin nombre');
      }

    } finally {
      setToggling(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // ── Stats (vista chofer) ───────────────────────────────────────────────

  const totalHechas = clientes.filter(c => c.completado).length;
  const totalPendientes = clientes.length - totalHechas;
  const progreso = clientes.length > 0 ? totalHechas / clientes.length : 0;

  const filtrados = clientes.filter(c => {
    const matchSearch = (c.cliente || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.direccion || '').toLowerCase().includes(search.toLowerCase());
    const matchFiltro =
      filtro === 'todas' ||
      (filtro === 'completadas' && c.completado) ||
      (filtro === 'pendientes' && !c.completado);
    return matchSearch && matchFiltro;
  });

  // ── Render ─────────────────────────────────────────────────────────────

  if (cargando) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color="#4F8EF7" />
        <Text style={styles.loaderText}>
          {esAdmin ? 'Cargando panel de supervisión...' : 'Cargando colectas...'}
        </Text>
      </View>
    );
  }

  // ── VISTA ADMIN ─────────────────────────────────────────────────────────
  if (esAdmin) {
    return (
      <VistaAdmin
        clientes={clientes}
        refrescando={refrescando}
        onRefresh={handleRefresh}
      />
    );
  }

  // ── VISTA CHOFER (sin cambios) ─────────────────────────────────────────
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refrescando} onRefresh={handleRefresh} tintColor="#4F8EF7" colors={['#4F8EF7']} />
      }
    >
      {/* ── Saludo dinámico ── */}
      <View style={styles.greetingBox}>
        <View style={styles.greetingTopRow}>
          <Text style={styles.greetingEyebrow}>COLECTAS DE HOY</Text>
          {gpsStatus !== 'off' && gpsStatus !== 'denied' && (
            <View style={[styles.gpsChip, gpsStatus === 'background' && styles.gpsChipBackground]}>
              <View style={styles.gpsDot} />
              <Text style={styles.gpsChipText}>GPS activo</Text>
            </View>
          )}
          {gpsStatus === 'denied' && (
            <View style={[styles.gpsChip, styles.gpsChipDenied]}>
              <Ionicons name="location-outline" size={11} color="#F59E0B" />
              <Text style={[styles.gpsChipText, { color: '#F59E0B' }]}>GPS sin permiso</Text>
            </View>
          )}
        </View>
        <Text style={styles.greetingTitle}>{saludo}, {nombreUsuario || 'chofer'} 👋</Text>
        <Text style={styles.greetingSubtitle}>
          {clientes.length === 0
            ? 'No tenés colectas asignadas hoy.'
            : totalPendientes === 0
              ? '¡Todo completado! Excelente trabajo. ✅'
              : `Tenés ${totalPendientes} colecta${totalPendientes !== 1 ? 's' : ''} pendiente${totalPendientes !== 1 ? 's' : ''}.`
          }
        </Text>
      </View>

      {/* ── Stats totales ── */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statNum}>{clientes.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statBox, styles.statBoxMid]}>
          <Text style={[styles.statNum, { color: '#34D399' }]}>{totalHechas}</Text>
          <Text style={styles.statLabel}>Hechas</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={[styles.statNum, { color: totalPendientes > 0 ? '#F59E0B' : '#6B7280' }]}>{totalPendientes}</Text>
          <Text style={styles.statLabel}>Pendientes</Text>
        </View>
      </View>

      {/* ── Barra de progreso ── */}
      <View style={styles.progressWrap}>
        <View style={styles.progressBg}>
          <Animated.View style={[styles.progressFill, { width: `${progreso * 100}%` as any }]} />
        </View>
        <Text style={styles.progressLabel}>{Math.round(progreso * 100)}% completado</Text>
      </View>

      {/* ── Buscador ── */}
      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={16} color="#2A4A70" style={{ marginRight: 10 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar cliente o dirección..."
          placeholderTextColor="#1A3050"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color="#2A4A70" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Filtros por tab ── */}
      <View style={styles.filtrosRow}>
        {([
          { key: 'todas', label: 'Todas', count: clientes.length },
          { key: 'pendientes', label: 'Pendientes', count: totalPendientes },
          { key: 'completadas', label: 'Completadas', count: totalHechas },
        ] as { key: FiltroColecta; label: string; count: number }[]).map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.filtroBtn, filtro === tab.key && styles.filtroBtnActive]}
            onPress={() => setFiltro(tab.key)}
          >
            <Text style={[styles.filtroText, filtro === tab.key && styles.filtroTextActive]}>{tab.label}</Text>
            <View style={[styles.filtroCount, filtro === tab.key && styles.filtroCountActive]}>
              <Text style={[styles.filtroCountText, filtro === tab.key && styles.filtroCountTextActive]}>{tab.count}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Lista ── */}
      {filtrados.length === 0 && clientes.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="bed-outline" size={52} color="#1A2540" />
          <Text style={styles.emptyTitle}>Hoy no tenés colectas asignadas.</Text>
          <Text style={styles.emptySubtitle}>¡Buen descanso!</Text>
        </View>
      ) : filtrados.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="search-outline" size={48} color="#1A2540" />
          <Text style={styles.emptyTitle}>Sin resultados</Text>
          <Text style={styles.emptySubtitle}>Probá con otro filtro o búsqueda.</Text>
        </View>
      ) : (
        filtrados.map((c, i) => (
          <ColectaCard
            key={c.id}
            item={c}
            index={i}
            onToggle={handleToggle}
            toggling={toggling.has(c.id)}
          />
        ))
      )}

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

// ─────────────────────────────────────────────
// ESTILOS COMPARTIDOS (chofer + admin)
// ─────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060B18' },
  content: { padding: 16 },
  loader: { flex: 1, backgroundColor: '#060B18', alignItems: 'center', justifyContent: 'center', gap: 14 },
  loaderText: { color: '#4A6FA5', fontSize: 13, fontWeight: '500' },

  statsRow: {
    flexDirection: 'row', backgroundColor: '#0D1526',
    borderRadius: 18, marginBottom: 14,
    borderWidth: 1, borderColor: '#1A2540', overflow: 'hidden',
  },
  statBox: { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statBoxMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#1A2540' },
  statNum: { fontSize: 22, fontWeight: '800', color: '#FFFFFF' },
  statLabel: { fontSize: 10, color: '#2A4A70', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 2 },

  progressWrap: { marginBottom: 14 },
  progressBg: { height: 6, backgroundColor: '#0D1526', borderRadius: 3, borderWidth: 1, borderColor: '#1A2540', marginBottom: 6, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#34D399', borderRadius: 3 },
  progressLabel: { fontSize: 11, color: '#2A4A70', fontWeight: '600', textAlign: 'right' },

  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#0D1526', borderRadius: 14,
    borderWidth: 1, borderColor: '#1A2540',
    paddingHorizontal: 16, height: 48, marginBottom: 12,
  },
  searchInput: { flex: 1, color: '#FFFFFF', fontSize: 14 },

  filtrosRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  filtroBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 9, borderRadius: 12,
    backgroundColor: '#0D1526', borderWidth: 1, borderColor: '#1A2540',
  },
  filtroBtnActive: { backgroundColor: 'rgba(79,142,247,0.12)', borderColor: '#4F8EF7' },
  filtroText: { fontSize: 12, fontWeight: '700', color: '#4A6FA5' },
  filtroTextActive: { color: '#4F8EF7' },
  filtroCount: { backgroundColor: '#111D35', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2 },
  filtroCountActive: { backgroundColor: 'rgba(79,142,247,0.2)' },
  filtroCountText: { fontSize: 11, fontWeight: '800', color: '#2A4A70' },
  filtroCountTextActive: { color: '#4F8EF7' },

  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 10 },
  emptyTitle: { color: '#4A6FA5', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  emptySubtitle: { color: '#2A4A70', fontSize: 13, fontWeight: '500' },

  greetingBox: { backgroundColor: '#0D1526', borderRadius: 18, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: '#1A2540' },
  greetingTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  greetingEyebrow: { fontSize: 10, fontWeight: '800', color: '#4F8EF7', letterSpacing: 2, textTransform: 'uppercase' },
  greetingTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', marginBottom: 4, letterSpacing: -0.3 },
  greetingSubtitle: { fontSize: 13, color: '#4A6FA5', fontWeight: '500' },

  gpsChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(52,211,153,0.10)',
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.25)',
    borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4,
  },
  gpsChipBackground: { backgroundColor: 'rgba(52,211,153,0.15)', borderColor: 'rgba(52,211,153,0.40)' },
  gpsChipDenied: { backgroundColor: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.25)' },
  gpsDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#34D399' },
  gpsChipText: { fontSize: 10, fontWeight: '700', color: '#34D399', letterSpacing: 0.3 },

  // Cards vista chofer
  card: { flexDirection: 'row', backgroundColor: '#0D1526', borderRadius: 18, marginBottom: 10, borderWidth: 1, borderColor: '#1A2540', overflow: 'hidden' },
  cardDone: { backgroundColor: '#060F1C', borderColor: 'rgba(52,211,153,0.15)' },
  accent: { width: 4, backgroundColor: '#4F8EF7' },
  accentDone: { backgroundColor: '#34D399' },
  cardBody: { flex: 1, padding: 16 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  clienteNombre: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  horarioRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  horarioText: { fontSize: 13, color: '#4F8EF7', fontWeight: '600' },
  textDone: { color: '#1A3050' },
  checkWrap: { paddingLeft: 12, justifyContent: 'center', minWidth: 42 },
  details: {},
  addressTouchable: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6, marginTop: -2 },
  mapNavIconWrap: { backgroundColor: 'rgba(79,142,247,0.15)', borderRadius: 10, padding: 8, marginLeft: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  detailText: { flex: 1, fontSize: 12, color: '#4A6FA5', fontWeight: '500', lineHeight: 18 },
  doneBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 10, alignSelf: 'flex-start',
    backgroundColor: 'rgba(52,211,153,0.08)',
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.18)',
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  doneBadgeText: { fontSize: 11, color: '#34D399', fontWeight: '700' },
});

// ─────────────────────────────────────────────
// ESTILOS EXCLUSIVOS DE LA VISTA ADMIN
// ─────────────────────────────────────────────

const adminStyles = StyleSheet.create({
  // Header del panel admin
  headerBox: {
    backgroundColor: '#0D1526',
    borderRadius: 20, padding: 20, marginBottom: 14,
    borderWidth: 1, borderColor: '#1A2540',
  },
  headerTopRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 16,
  },
  headerEyebrow: {
    fontSize: 10, fontWeight: '800', color: '#4A6FA5',
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4,
  },
  headerTitle: { fontSize: 22, fontWeight: '800', color: '#FFFFFF', letterSpacing: -0.3 },
  adminBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: 'rgba(245,158,11,0.1)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5,
  },
  adminBadgeText: { fontSize: 11, fontWeight: '700', color: '#F59E0B' },

  // Stats globales del día
  statsGlobales: {
    flexDirection: 'row',
    backgroundColor: '#060B18',
    borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: '#0D1A2E',
  },
  statGlobal: { flex: 1, alignItems: 'center', paddingVertical: 12 },
  statGlobalMid: { borderLeftWidth: 1, borderColor: '#0D1A2E' },
  statGlobalNum: { fontSize: 18, fontWeight: '800', color: '#FFFFFF' },
  statGlobalLabel: {
    fontSize: 9, color: '#2A4A70', fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 2,
  },

  // Card de chofer (admin)
  card: {
    backgroundColor: '#0D1526',
    borderRadius: 18, marginBottom: 12,
    borderWidth: 1, borderColor: '#1A2540',
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, padding: 16,
  },

  // Avatar con iniciales
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#111D35',
    borderWidth: 1.5,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { fontSize: 15, fontWeight: '800' },

  // Nombre y progreso del chofer
  choferNombre: { fontSize: 15, fontWeight: '700', color: '#FFFFFF', marginBottom: 4 },
  progresoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  progresoTexto: { fontSize: 12, fontWeight: '600' },
  pendienteBadge: {
    backgroundColor: 'rgba(245,158,11,0.12)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.25)',
    borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2,
  },
  pendienteBadgeText: { fontSize: 10, fontWeight: '700', color: '#F59E0B' },

  // Mini barra de progreso en el header
  miniBarBg: {
    width: 64, height: 4, backgroundColor: '#111D35',
    borderRadius: 2, overflow: 'hidden',
  },
  miniBarFill: { height: '100%', borderRadius: 2 },

  // Sección colapsable con filas
  filasContainer: { paddingHorizontal: 16, paddingBottom: 12 },
  filasDivider: { height: 1, backgroundColor: '#111D35', marginBottom: 10 },

  // Fila individual compacta
  fila: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#0D1A2E',
  },
  filaDone: { opacity: 0.55 },
  filaIndicador: {
    width: 3, height: 36, borderRadius: 2,
    backgroundColor: '#4F8EF7',
  },
  filaIndicadorDone: { backgroundColor: '#34D399' },
  filaNombre: { fontSize: 13, fontWeight: '700', color: '#FFFFFF', marginBottom: 3 },
  filaTextoDone: { color: '#2A4A70' },
  filaMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filaMetaText: { fontSize: 11, color: '#4A6FA5', fontWeight: '500' },
  filaMetaSep: { fontSize: 11, color: '#2A4A70' },

  // Badges de estado en fila
  badgeDone: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: 'rgba(52,211,153,0.08)',
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.2)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  badgeDoneText: { fontSize: 10, fontWeight: '700', color: '#34D399' },
  badgePendiente: {
    backgroundColor: 'rgba(245,158,11,0.08)',
    borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)',
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  badgePendienteText: { fontSize: 10, fontWeight: '700', color: '#F59E0B' },
});