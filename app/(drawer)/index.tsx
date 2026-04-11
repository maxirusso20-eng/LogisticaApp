/**
 * app/(drawer)/index.tsx — Pantalla principal: Recorridos
 *
 * Mejoras respecto a la versión anterior:
 *  - Eliminada la navegación interna "pantalla" (siempre era 'recorridos'; choferes y mapa
 *    son rutas propias del drawer).
 *  - Eliminados ChoferesScreen y MapaScreen internos (código muerto duplicado).
 *  - Eliminado el doble header (el drawer ya provee uno).
 *  - alert() → Alert.alert() de React Native.
 *  - Pull-to-refresh en la lista de recorridos.
 *  - Rollback optimista en actualizarRecorrido si el update falla.
 *  - Campo "despachos" eliminado del type (nunca se usa).
 *  - Ionicons donde había emojis de texto.
 */

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
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
// PUSH NOTIFICATIONS
// ─────────────────────────────────────────────

// Mostrar notificación como banner aunque la app esté en primer plano
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true, // <-- AGREGÁ ESTA LÍNEA
    shouldShowList: true,   // <-- Y AGREGÁ ESTA LÍNEA
  }),
});
async function registerForPushNotificationsAsync(): Promise<Notifications.ExpoPushToken | null | undefined> {
  if (!Device.isDevice) {
    console.warn('Push notifications solo funcionan en dispositivos físicos.');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('Permiso de notificaciones denegado.');
    return null;
  }

  // En Android se requiere un canal
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4F8EF7',
    });
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) {
      throw new Error('Project ID no existe en expoConfig. Pasando en modo desarrollo o Expo Go.');
    }

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    return token;
  } catch (err) {
    console.log('Aviso (Push Token ignorado temporalmente):', err instanceof Error ? err.message : err);
    return undefined;
  }
}

// ─────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────

interface Chofer {
  id: number;
  orden?: number | null;
  nombre: string;
  dni: string;
  celular: string;
  direccion: string;
  fechaIngreso: string;
  zona: string[];
  vehiculo: string[];
  condicion: string;
}

interface Recorrido {
  id?: number;
  orden?: number | null;
  localidad: string;
  idChofer: number;
  chofer: string;
  pqteDia: number;
  porFuera: number;
  entregados: number;
  zona: string;
}

type ZonaKey = 'ZONA OESTE' | 'ZONA SUR' | 'ZONA NORTE' | 'CABA';

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────

const ZONAS: ZonaKey[] = ['ZONA OESTE', 'ZONA SUR', 'ZONA NORTE', 'CABA'];
const VEHICULOS = ['SUV', 'UTILITARIO', 'AUTO'];
const CONDICIONES = ['TITULAR', 'SUPLENTE', 'COLECTADOR'];

const ZONA_COLORES: Record<ZonaKey, string> = {
  'ZONA OESTE': '#3b82f6',
  'ZONA SUR': '#10b981',
  'ZONA NORTE': '#f59e0b',
  'CABA': '#8b5cf6',
};

const ZONA_ICONOS: Record<ZonaKey, string> = {
  'ZONA OESTE': '⬅️',
  'ZONA SUR': '⬇️',
  'ZONA NORTE': '⬆️',
  'CABA': '🏙️',
};

const NUEVO_CHOFER_DEFAULT: Chofer = {
  id: 0, nombre: '', dni: '', celular: '',
  direccion: '', fechaIngreso: '', zona: [],
  vehiculo: [], condicion: 'SUPLENTE',
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const calcularPorcentaje = (r: Recorrido): string => {
  const suma = (r.pqteDia || 0) + (r.porFuera || 0);
  if (suma === 0) return '0%';
  return (((r.entregados || 0) / suma) * 100).toFixed(1) + '%';
};

const calcularTotal = (r: Recorrido): number => (r.pqteDia || 0) + (r.porFuera || 0);
const calcularRestante = (r: Recorrido): number => Math.max(0, calcularTotal(r) - (r.entregados || 0));

const formatearFecha = (texto: string): string => {
  const nums = texto.replace(/\D/g, '');
  if (nums.length <= 2) return nums;
  if (nums.length <= 4) return `${nums.slice(0, 2)}/${nums.slice(2)}`;
  return `${nums.slice(0, 2)}/${nums.slice(2, 4)}/${nums.slice(4, 8)}`;
};

const nombreChoferVisible = (rec: Recorrido, choferes: Chofer[]): string => {
  const id = rec.idChofer;
  if (id == null || id === 0) return 'Sin Asignar';
  const encontrado = choferes.find(c => c.id === id);
  if (encontrado?.nombre) return encontrado.nombre;
  return (rec.chofer ?? '').trim() || 'Sin Asignar';
};

const ordenNumerico = (o: number | null | undefined) =>
  o == null || Number.isNaN(Number(o)) ? Number.MAX_SAFE_INTEGER : Number(o);

const compararRecorridoPorOrden = (a: Recorrido, b: Recorrido): number => {
  const d = ordenNumerico(a.orden) - ordenNumerico(b.orden);
  if (d !== 0) return d;
  return (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);
};

const ordenarChoferesPorOrden = (lista: Chofer[]): Chofer[] =>
  [...lista].sort((a, b) => {
    const d = ordenNumerico(a.orden) - ordenNumerico(b.orden);
    return d !== 0 ? d : a.id - b.id;
  });

// ─────────────────────────────────────────────
// COMPONENTE: SelectorChips
// ─────────────────────────────────────────────

interface SelectorChipsProps {
  opciones: string[];
  seleccionados: string | string[];
  multi?: boolean;
  onToggle: (valor: string) => void;
  colorActivo?: string;
}

const SelectorChips: React.FC<SelectorChipsProps> = ({
  opciones, seleccionados, multi = false, onToggle, colorActivo = '#3b82f6',
}) => {
  const isActivo = (op: string) =>
    multi ? (seleccionados as string[]).includes(op) : seleccionados === op;

  return (
    <View style={S.selectorRow}>
      {opciones.map(op => (
        <TouchableOpacity
          key={op}
          style={[S.chip, isActivo(op) && { backgroundColor: colorActivo, borderColor: colorActivo }]}
          onPress={() => onToggle(op)}
        >
          <Text style={S.chipTexto}>{op}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

// ─────────────────────────────────────────────
// COMPONENTE: TablaZona
// ─────────────────────────────────────────────

interface TablaZonaProps {
  zona: ZonaKey;
  datos: Recorrido[];
  choferes: Chofer[];
  visible: boolean;
  onToggle: (zona: ZonaKey) => void;
  onActualizar: (zona: ZonaKey, index: number, campo: string, valor: string) => void;
}

const TablaZona: React.FC<TablaZonaProps> = ({ zona, datos, choferes, visible, onToggle, onActualizar }) => {
  const color = ZONA_COLORES[zona];

  return (
    <View style={S.tablaContainer}>
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={() => onToggle(zona)}
        style={[S.zonaHeaderRow, { borderLeftColor: color }]}
      >
        <Ionicons
          name={visible ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color={color}
          style={{ marginRight: 8 }}
        />
        <Text style={[S.zonaHeader, { color }]}>{zona}</Text>
        <View style={[S.zonaBadge, { backgroundColor: color + '22', borderColor: color + '44' }]}>
          <Text style={[S.zonaBadgeTexto, { color }]}>{datos.length} rutas</Text>
        </View>
      </TouchableOpacity>

      {visible && (
        <ScrollView horizontal style={S.scrollHorizontal} showsHorizontalScrollIndicator={false}>
          <View>
            {/* Header */}
            <View style={[S.filaTabla, S.filaHeader]}>
              {['LOCALIDAD', 'ID', 'CHOFER', 'PQTE DÍA', 'POR FUERA', 'TOTAL', 'ENTREGADOS', 'RESTANTE', '% DEL DÍA'].map(h => (
                <View key={h} style={S.celdaHeader}>
                  <Text style={S.textoHeader}>{h}</Text>
                </View>
              ))}
            </View>

            {/* Filas */}
            {datos.map((rec, i) => (
              <View key={i} style={[S.filaTabla, i % 2 === 1 && S.filaAlternada]}>
                <View style={S.celda}>
                  <Text style={S.textoCelda}>{rec.localidad}</Text>
                </View>
                <View style={S.celda}>
                  <TextInput
                    style={[S.inputTabla, { color: '#60a5fa', fontWeight: 'bold' }]}
                    keyboardType="numeric"
                    value={rec.idChofer?.toString() || '0'}
                    onChangeText={v => onActualizar(zona, i, 'idChofer', v)}
                    selectTextOnFocus
                  />
                </View>
                <View style={S.celda}>
                  <Text style={S.textoCelda}>{nombreChoferVisible(rec, choferes)}</Text>
                </View>
                <View style={S.celda}>
                  <TextInput
                    style={S.inputTabla}
                    keyboardType="numeric"
                    value={rec.pqteDia?.toString() || '0'}
                    onChangeText={v => onActualizar(zona, i, 'pqteDia', v)}
                    selectTextOnFocus
                  />
                </View>
                <View style={S.celda}>
                  <TextInput
                    style={S.inputTabla}
                    keyboardType="numeric"
                    value={rec.porFuera?.toString() || '0'}
                    onChangeText={v => onActualizar(zona, i, 'porFuera', v)}
                    selectTextOnFocus
                  />
                </View>
                {/* TOTAL = pqteDia + porFuera — solo lectura, calculado */}
                <View style={S.celda}>
                  <Text style={[S.textoCelda, { color: '#a78bfa', fontWeight: '800' }]}>
                    {calcularTotal(rec)}
                  </Text>
                </View>
                <View style={S.celda}>
                  <TextInput
                    style={S.inputTabla}
                    keyboardType="numeric"
                    value={rec.entregados?.toString() || '0'}
                    onChangeText={v => onActualizar(zona, i, 'entregados', v)}
                    selectTextOnFocus
                  />
                </View>
                {/* RESTANTE = total - entregados — solo lectura, se actualiza en tiempo real */}
                <View style={S.celda}>
                  <Text style={[S.textoCelda, {
                    fontWeight: '800',
                    color: calcularRestante(rec) === 0 ? '#34D399' : calcularRestante(rec) <= 10 ? '#f59e0b' : '#f87171',
                  }]}>
                    {calcularRestante(rec)}
                  </Text>
                </View>
                <View style={S.celda}>
                  <Text style={[S.porcentaje, { color }]}>{calcularPorcentaje(rec)}</Text>
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
};


// ─────────────────────────────────────────────
// MODAL: Agregar Recorrido
// ─────────────────────────────────────────────

interface ModalRecorridoProps {
  visible: boolean;
  onCerrar: () => void;
  onGuardar: (zona: ZonaKey, localidad: string) => void;
}

const ModalAgregarRecorrido: React.FC<ModalRecorridoProps> = ({ visible, onCerrar, onGuardar }) => {
  const [paso, setPaso] = useState<1 | 2>(1);
  const [zonaSeleccionada, setZonaSeleccionada] = useState<ZonaKey | null>(null);
  const [localidad, setLocalidad] = useState('');

  const resetear = () => { setPaso(1); setZonaSeleccionada(null); setLocalidad(''); };
  const cerrar = () => { resetear(); onCerrar(); };

  const confirmar = () => {
    if (!zonaSeleccionada || !localidad.trim()) {
      Alert.alert('Campo vacío', 'Ingresá una localidad para continuar.');
      return;
    }
    onGuardar(zonaSeleccionada, localidad.trim());
    resetear();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={S.modalOverlay}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={cerrar} />
          <View style={S.bottomSheet}>
            {/* Header del modal */}
            <View style={S.modalHeader}>
              <View>
                <Text style={S.modalTitulo}>
                  {paso === 1 ? 'Nueva fila de recorrido' : zonaSeleccionada}
                </Text>
                <Text style={S.modalSubtitulo}>
                  {paso === 1 ? 'Seleccioná la tabla de destino' : 'Completá los datos de la ruta'}
                </Text>
              </View>
              <TouchableOpacity onPress={cerrar} style={S.botonCerrar}>
                <Ionicons name="close" size={16} color="#94a3b8" />
              </TouchableOpacity>
            </View>

            {/* Paso 1: seleccionar zona */}
            {paso === 1 && (
              <View style={S.gridZonas}>
                {ZONAS.map(zona => {
                  const color = ZONA_COLORES[zona];
                  return (
                    <TouchableOpacity
                      key={zona}
                      style={[S.botonZona, { borderColor: color + '55' }]}
                      onPress={() => { setZonaSeleccionada(zona); setPaso(2); }}
                      activeOpacity={0.75}
                    >
                      <Text style={S.botonZonaIcono}>{ZONA_ICONOS[zona]}</Text>
                      <Text style={[S.botonZonaTexto, { color }]}>{zona}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {/* Paso 2: ingresar localidad */}
            {paso === 2 && zonaSeleccionada && (
              <View>
                <TouchableOpacity onPress={() => setPaso(1)} style={S.botonVolver}>
                  <Ionicons name="arrow-back" size={14} color="#60a5fa" style={{ marginRight: 4 }} />
                  <Text style={S.botonVolverTexto}>Cambiar zona</Text>
                </TouchableOpacity>

                <View style={[S.zonaBadgeGrande, {
                  backgroundColor: ZONA_COLORES[zonaSeleccionada] + '22',
                  borderColor: ZONA_COLORES[zonaSeleccionada] + '66',
                }]}>
                  <Text style={S.zonaBadgeGrandeIcono}>{ZONA_ICONOS[zonaSeleccionada]}</Text>
                  <Text style={[S.zonaBadgeGrandeTexto, { color: ZONA_COLORES[zonaSeleccionada] }]}>
                    {zonaSeleccionada}
                  </Text>
                </View>

                <Text style={S.label}>LOCALIDAD / RUTA</Text>
                <TextInput
                  style={S.inputFicha}
                  placeholder="Ej: Morón, Quilmes, etc."
                  placeholderTextColor="#64748b"
                  value={localidad}
                  onChangeText={setLocalidad}
                  autoFocus
                />
                <Text style={S.labelInfo}>
                  Se va a agregar una fila nueva a la tabla {zonaSeleccionada}.
                </Text>

                <TouchableOpacity
                  style={[S.botonGuardar, { backgroundColor: ZONA_COLORES[zonaSeleccionada], flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }]}
                  onPress={confirmar}
                >
                  <Text style={S.botonGuardarTexto}>Agregar fila</Text>
                  <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};


// ─────────────────────────────────────────────
// PANTALLA PRINCIPAL: RECORRIDOS
// ─────────────────────────────────────────────

export default function RecorridosScreen() {
  const router = useRouter();

  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [recorridos, setRecorridos] = useState<Record<ZonaKey, Recorrido[]>>({
    'ZONA OESTE': [], 'ZONA SUR': [], 'ZONA NORTE': [], 'CABA': [],
  });
  const [zonasVisibles, setZonasVisibles] = useState<Record<ZonaKey, boolean>>({
    'ZONA OESTE': true, 'ZONA SUR': true, 'ZONA NORTE': true, 'CABA': true,
  });
  const [refrescando, setRefrescando] = useState(false);
  const [modalRecorrido, setModalRecorrido] = useState(false);
  const [colectasPendientes, setColectasPendientes] = useState<number | null>(null);

  // ── Data fetching ──────────────────────────

  const refreshChoferes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('Choferes')
        .select('id, orden, nombre, dni, celular, direccion, fechaIngreso, zona, vehiculo, condicion')
        .order('orden', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setChoferes(ordenarChoferesPorOrden(data || []));
    } catch (err) {
      console.error('Error cargando choferes:', err);
    }
  }, []);

  const refreshRecorridos = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('Recorridos')
        .select('*')
        .order('orden', { ascending: true, nullsFirst: false });
      if (error) throw error;

      const porZona: Record<ZonaKey, Recorrido[]> = {
        'ZONA OESTE': [], 'ZONA SUR': [], 'ZONA NORTE': [], 'CABA': [],
      };
      (data || []).forEach(rec => {
        const zona = rec.zona as ZonaKey;
        if (zona in porZona) porZona[zona].push(rec);
      });
      (Object.keys(porZona) as ZonaKey[]).forEach(z => porZona[z].sort(compararRecorridoPorOrden));
      setRecorridos(porZona);
    } catch (err) {
      console.error('Error cargando recorridos:', err);
    }
  }, []);

  const handleRefresh = async () => {
    setRefrescando(true);
    await Promise.all([refreshChoferes(), refreshRecorridos()]);
    setRefrescando(false);
  };

  // Colectas pendientes para el widget
  const fetchColectasPendientes = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) return;
      const { count, error } = await supabase
        .from('Clientes')
        .select('id', { count: 'exact', head: true })
        .eq('email_chofer', user.email)
        .eq('completado', false);
      if (!error) setColectasPendientes(count ?? 0);
    } catch { /* silencioso — el widget es opcional */ }
  }, []);

  // ── Al cargar la pantalla principal ────────
  useEffect(() => {
    refreshChoferes();
    refreshRecorridos();
    fetchColectasPendientes();
  }, [refreshChoferes, refreshRecorridos, fetchColectasPendientes]);

  // ── Manejo de Push Notifications ───────────
  useEffect(() => {
    // 1. Reaccionar al tap de la notificación para ir directo a la tarea
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      // 'tipo' coincide con el payload que mandamos desde la Edge Function
      if (data?.tipo === 'NUEVA_COLECTA') {
        router.push('/(drawer)/colectas' as any);
      }
    });

    // 2. Registro seguro del token
    const registrarTokenSeguro = async () => {
      try {
        // Obtenemos la info primero para no pedir permisos innecesariamente si no hay sesión
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return;

        // Una vez asegurado de que es un chofer, procedemos a solicitar el token
        const token = await registerForPushNotificationsAsync();
        if (!token) return;

        const { error } = await supabase
          .from('Choferes')
          .update({ push_token: token.data })
          .eq('email', user.email);

        if (error) {
          console.error('Error guardando push token en Supabase:', error.message);
        } else {
          console.log('✅ Push token vinculado a:', user.email);
        }
      } catch (err) {
        console.error('Error en registro de push notifications:', err);
      }
    };

    registrarTokenSeguro();

    return () => {
      responseListener.remove();
    };
  }, [router]);

  // ── Realtime con debounce ──────────────────
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const schedule = (fn: () => void) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fn, 320);
    };

    const channel = supabase
      .channel('logistica-public-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Recorridos' }, () => schedule(refreshRecorridos))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Choferes' }, () => schedule(refreshChoferes))
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [refreshRecorridos, refreshChoferes]);

  // ── Mutaciones ─────────────────────────────

  const actualizarRecorrido = async (zona: ZonaKey, index: number, campo: string, valor: string) => {
    const anterior = recorridos[zona][index];
    const copia = { ...anterior };

    if (['pqteDia', 'porFuera', 'entregados'].includes(campo)) {
      (copia as any)[campo] = parseInt(valor) || 0;
    } else if (campo === 'idChofer') {
      copia.idChofer = parseInt(valor) || 0;
      copia.chofer = choferes.find(c => c.id === copia.idChofer)?.nombre ?? 'Sin Asignar';
    } else {
      (copia as any)[campo] = valor;
    }

    // Optimistic update
    setRecorridos(prev => {
      const lista = [...prev[zona]];
      lista[index] = copia;
      return { ...prev, [zona]: lista };
    });

    try {
      const idDb = anterior.id;
      const payload: Record<string, any> = { [campo]: (copia as any)[campo] };
      if (campo === 'idChofer') payload['chofer'] = copia.chofer;

      const query = idDb
        ? supabase.from('Recorridos').update(payload).eq('id', idDb)
        : supabase.from('Recorridos').update(payload).match({ zona, localidad: copia.localidad });

      const { error } = await query;
      if (error) throw error;
    } catch (err) {
      // Rollback: restaurar el valor anterior
      console.error('Error actualizando recorrido — revirtiendo:', err);
      setRecorridos(prev => {
        const lista = [...prev[zona]];
        lista[index] = anterior;
        return { ...prev, [zona]: lista };
      });
    }
  };

  const agregarRecorrido = async (zona: ZonaKey, localidad: string) => {
    const nuevo = { zona, localidad, idChofer: 0, chofer: 'Sin Asignar', pqteDia: 0, porFuera: 0, entregados: 0 };
    setRecorridos(prev => ({
      ...prev,
      [zona]: [...prev[zona], nuevo].sort(compararRecorridoPorOrden),
    }));
    setModalRecorrido(false);
    try {
      await supabase.from('Recorridos').insert([nuevo]);
    } catch (err) {
      console.error('Error insertando recorrido:', err);
    }
  };

  const toggleZona = (zona: ZonaKey) =>
    setZonasVisibles(prev => ({ ...prev, [zona]: !prev[zona] }));

  // ── Render ─────────────────────────────────

  return (
    <View style={S.root}>

      {/* Widget: colectas pendientes */}
      {colectasPendientes != null && colectasPendientes > 0 && (
        <View style={S.widgetColectas}>
          <View style={S.widgetLeft}>
            <Ionicons name="archive-outline" size={26} color="#4F8EF7" />
            <View style={{ flex: 1 }}>
              <Text style={S.widgetTitle} numberOfLines={1}>
                {colectasPendientes} colecta{colectasPendientes !== 1 ? 's' : ''} pendiente{colectasPendientes !== 1 ? 's' : ''} hoy
              </Text>
              <Text style={S.widgetSub}>Tu lista te espera</Text>
            </View>
          </View>
          <TouchableOpacity
            style={S.widgetBtn}
            onPress={() => router.push('/(drawer)/colectas' as any)}
            activeOpacity={0.8}
          >
            <Text style={S.widgetBtnText}>Ver</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Barra de acciones */}
      <View style={S.actionBar}>
        <TouchableOpacity onPress={() => setModalRecorrido(true)} style={S.btnAccion} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={S.btnAccionTexto}>Recorrido</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => router.push('/(drawer)/personal' as any)} style={[S.btnAccion, S.btnAccionSecundario]} activeOpacity={0.8}>
          <Ionicons name="person-add-outline" size={18} color="#4F8EF7" />
          <Text style={[S.btnAccionTexto, { color: '#4F8EF7' }]}>Chofer</Text>
        </TouchableOpacity>
      </View>

      {/* Tablas de recorridos */}
      <ScrollView
        style={S.container}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={handleRefresh}
            tintColor="#4F8EF7"
            colors={['#4F8EF7']}
          />
        }
      >
        {ZONAS.map(zona => (
          <TablaZona
            key={zona}
            zona={zona}
            datos={recorridos[zona] || []}
            choferes={choferes}
            visible={zonasVisibles[zona]}
            onToggle={toggleZona}
            onActualizar={actualizarRecorrido}
          />
        ))}
        <View style={{ height: 80 }} />
      </ScrollView>

      <ModalAgregarRecorrido
        visible={modalRecorrido}
        onCerrar={() => setModalRecorrido(false)}
        onGuardar={agregarRecorrido}
      />
    </View>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────

const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0f1e' },
  container: { flex: 1, padding: 15 },

  // Widget colectas
  widgetColectas: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0d2240',
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.35)',
    borderRadius: 16, marginHorizontal: 16, marginTop: 12,
    padding: 14, gap: 12,
  },
  widgetLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  widgetTitle: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
  widgetSub: { fontSize: 11, color: '#4A6FA5', marginTop: 2 },
  widgetBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10,
  },
  widgetBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  // Barra de acciones
  actionBar: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, paddingVertical: 12,
  },
  btnAccion: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 6,
  },
  btnAccionSecundario: {
    backgroundColor: 'rgba(59,130,246,0.08)',
    borderWidth: 1, borderColor: 'rgba(59,130,246,0.3)',
    shadowOpacity: 0,
  },
  btnAccionTexto: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Tablas
  tablaContainer: { marginBottom: 24 },
  zonaHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 10, paddingLeft: 12, borderLeftWidth: 3,
  },
  zonaHeader: { fontSize: 16, fontWeight: 'bold', flex: 1 },
  zonaBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  zonaBadgeTexto: { fontSize: 10, fontWeight: 'bold' },
  scrollHorizontal: { backgroundColor: '#111827', borderRadius: 10, borderWidth: 1, borderColor: '#1e2d45' },
  filaTabla: { flexDirection: 'row' },
  filaHeader: { backgroundColor: '#0d1526' },
  filaAlternada: { backgroundColor: '#0f1b2d' },
  celdaHeader: { width: 100, padding: 10, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1e2d45' },
  textoHeader: { color: '#94a3b8', fontSize: 10, fontWeight: 'bold', textAlign: 'center', letterSpacing: 0.5 },
  celda: { width: 100, padding: 10, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1a2540' },
  textoCelda: { color: '#e2e8f0', fontSize: 13, textAlign: 'center' },
  inputTabla: {
    backgroundColor: 'transparent', color: '#fff',
    textAlign: 'center', fontSize: 13, width: '100%', paddingVertical: 2,
  },
  porcentaje: { fontSize: 13, fontWeight: 'bold', textAlign: 'center' },

  // Ficha técnica
  fichaTecnica: { padding: 16, backgroundColor: '#0d1526' },
  divisor: { height: 1, backgroundColor: '#1e2d45', marginBottom: 14 },
  fila: { flexDirection: 'row', marginBottom: 4 },
  label: { color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4, marginTop: 10, letterSpacing: 1 },
  inputFicha: {
    backgroundColor: '#0a0f1e', color: '#f1f5f9',
    padding: 12, borderRadius: 8, fontSize: 14,
    borderWidth: 1, borderColor: '#1e2d45',
  },
  selectorRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  chip: {
    backgroundColor: '#111827', paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 8, marginRight: 8, marginBottom: 8,
    borderWidth: 1, borderColor: '#1e2d45',
  },
  chipTexto: { color: '#f1f5f9', fontSize: 11, fontWeight: 'bold' },
  botonGuardar: {
    backgroundColor: '#3b82f6', padding: 16,
    borderRadius: 12, alignItems: 'center', marginTop: 20,
  },
  botonGuardarTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  headerTitle: { color: '#f1f5f9', fontSize: 18, fontWeight: 'bold' },

  // Modales
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  bottomSheet: {
    backgroundColor: '#0d1526', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 6, paddingBottom: 40, paddingHorizontal: 20,
    borderTopWidth: 1, borderColor: '#1e2d45',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1e2d45', marginBottom: 16,
  },
  modalTitulo: { color: '#f1f5f9', fontSize: 18, fontWeight: 'bold' },
  modalSubtitulo: { color: '#64748b', fontSize: 12, marginTop: 3 },
  botonCerrar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#1e2d45', justifyContent: 'center', alignItems: 'center',
  },
  gridZonas: {
    flexDirection: 'row', flexWrap: 'wrap',
    justifyContent: 'space-between', marginTop: 4,
  },
  botonZona: {
    width: '48%', backgroundColor: '#111827',
    borderWidth: 1, borderRadius: 14, padding: 20,
    alignItems: 'center', marginBottom: 12,
  },
  botonZonaIcono: { fontSize: 28, marginBottom: 8 },
  botonZonaTexto: { fontSize: 14, fontWeight: 'bold' },
  botonVolver: {
    flexDirection: 'row', alignItems: 'center',
    alignSelf: 'flex-start', marginBottom: 14,
    paddingVertical: 6, paddingHorizontal: 10,
  },
  botonVolverTexto: { color: '#60a5fa', fontSize: 13 },
  zonaBadgeGrande: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start',
    borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 16,
  },
  zonaBadgeGrandeIcono: { fontSize: 20, marginRight: 8 },
  zonaBadgeGrandeTexto: { fontSize: 15, fontWeight: 'bold' },
  labelInfo: { color: '#64748b', fontSize: 11, marginTop: 10, marginBottom: 4, lineHeight: 16 },

  // Modal full screen (agregar chofer)
  modalFullScreen: { flex: 1, backgroundColor: '#0a0f1e' },
  modalFullHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 20, paddingTop: Platform.OS === 'ios' ? 56 : 20,
    borderBottomWidth: 1, borderBottomColor: '#1a2540',
    backgroundColor: '#0d1526',
  },
});