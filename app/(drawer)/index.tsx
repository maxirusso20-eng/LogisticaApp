// app/(drawer)/index.tsx — Pantalla principal: Recorridos
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { BottomSheetModal, BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { useTheme } from '../../lib/ThemeContext';
import { supabase } from '../../lib/supabase';
import { ADMIN_EMAIL } from '../../lib/constants';
import { conLock } from '../../lib/lockAsync';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true, shouldSetBadge: false,
    shouldShowBanner: true, shouldShowList: true,
  }),
});

async function registerForPushNotificationsAsync(): Promise<Notifications.ExpoPushToken | null | undefined> {
  if (!Device.isDevice) { console.warn('Push notifications solo funcionan en dispositivos físicos.'); return null; }
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') { const { status } = await Notifications.requestPermissionsAsync(); finalStatus = status; }
  if (finalStatus !== 'granted') { console.warn('Permiso de notificaciones denegado.'); return null; }
  if (Platform.OS === 'android') { await Notifications.setNotificationChannelAsync('default', { name: 'default', importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 250, 250, 250], lightColor: '#4F8EF7' }); }
  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    if (!projectId) throw new Error('Project ID no existe en expoConfig.');
    return await Notifications.getExpoPushTokenAsync({ projectId });
  } catch (err) { console.log('Aviso (Push Token):', err instanceof Error ? err.message : err); return undefined; }
}

interface Chofer { id: number; orden?: number | null; nombre: string; dni: string; celular: string; direccion: string; fecha_ingreso: string; zona: string[]; vehiculo: string[]; condicion: string; }
interface Recorrido { id?: number; orden?: number | null; localidad: string; idChofer: number; chofer: string; pqteDia: number; porFuera: number; entregados: number; zona: string; }
type ZonaKey = 'ZONA OESTE' | 'ZONA SUR' | 'ZONA NORTE' | 'CABA';
type TipoDia = 'semana' | 'sabado';

// La web separa los días hábiles por la columna `tab` de Recorridos
// (LUNES..VIERNES). En la app, la pestaña de semana muestra el DÍA DE HOY
// (domingo → LUNES, se prepara el día siguiente).
const DIAS_HABILES = ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES'];
const diaHabilHoy = () => {
  const d = new Date().getDay(); // 0=Dom .. 6=Sáb
  return (d >= 1 && d <= 5) ? DIAS_HABILES[d - 1] : 'LUNES';
};

const ZONAS: ZonaKey[] = ['ZONA OESTE', 'ZONA SUR', 'ZONA NORTE', 'CABA'];
const ZONA_COLORES: Record<ZonaKey, string> = { 'ZONA OESTE': '#3b82f6', 'ZONA SUR': '#10b981', 'ZONA NORTE': '#f59e0b', 'CABA': '#8b5cf6' };
const ZONA_ICONOS: Record<ZonaKey, string> = { 'ZONA OESTE': '⬅️', 'ZONA SUR': '⬇️', 'ZONA NORTE': '⬆️', 'CABA': '🏙️' };

const ordenNumerico = (o: number | null | undefined) => o == null || Number.isNaN(Number(o)) ? Number.MAX_SAFE_INTEGER : Number(o);
const compararRecorridoPorOrden = (a: Recorrido, b: Recorrido): number => { const d = ordenNumerico(a.orden) - ordenNumerico(b.orden); if (d !== 0) return d; return (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER); };
const ordenarChoferesPorOrden = (lista: Chofer[]): Chofer[] => [...lista].sort((a, b) => { const d = ordenNumerico(a.orden) - ordenNumerico(b.orden); return d !== 0 ? d : a.id - b.id; });

// ─── TablaZona ────────────────────────────────────────────────────────────────

// Fila memoizada: solo se re-renderiza si CAMBIA su propio `rec` (referencia).
// Al editar una celda, setRecorridos reemplaza solo ese row → las demás filas
// no se vuelven a dibujar. Clave para que el tipeo sea fluido.
interface FilaRecorridoProps { rec: Recorrido; zona: ZonaKey; index: number; impar: boolean; choferes: Chofer[]; onActualizar: (zona: ZonaKey, index: number, campo: string, valor: string) => void; }
const FilaRecorrido = React.memo<FilaRecorridoProps>(({ rec, zona, index, impar, choferes, onActualizar }) => {
  const { colors } = useTheme();
  const color = ZONA_COLORES[zona];

  // Estado LOCAL de los campos editables: tipear actualiza SOLO esta fila y no
  // toca el estado del padre → no re-renderiza la pantalla entera (ese era el
  // lag). La persistencia a la base la hace onActualizar con debounce. Si el rec
  // cambia desde afuera (refresh / otro equipo), se re-sincroniza.
  const [idChofer, setIdChofer] = useState(rec.idChofer?.toString() ?? '0');
  const [pqteDia, setPqteDia] = useState(rec.pqteDia?.toString() ?? '0');
  const [porFuera, setPorFuera] = useState(rec.porFuera?.toString() ?? '0');
  const [entregados, setEntregados] = useState(rec.entregados?.toString() ?? '0');
  useEffect(() => { setIdChofer(rec.idChofer?.toString() ?? '0'); }, [rec.idChofer]);
  useEffect(() => { setPqteDia(rec.pqteDia?.toString() ?? '0'); }, [rec.pqteDia]);
  useEffect(() => { setPorFuera(rec.porFuera?.toString() ?? '0'); }, [rec.porFuera]);
  useEffect(() => { setEntregados(rec.entregados?.toString() ?? '0'); }, [rec.entregados]);

  const nPqte = parseInt(pqteDia) || 0, nFuera = parseInt(porFuera) || 0, nEnt = parseInt(entregados) || 0;
  const total = nPqte + nFuera;
  const restante = total - nEnt;
  const pct = total > 0 ? `${Math.round((nEnt / total) * 100)}%` : '0%';
  const nombreCh = choferes.find(c => c.id === (parseInt(idChofer) || 0))?.nombre ?? 'Sin Asignar';

  const onCh = (set: (v: string) => void, campo: string) => (v: string) => { set(v); onActualizar(zona, index, campo, v); };

  return (
    <View style={[S.filaTabla, impar && { backgroundColor: colors.bgCard }]}>
      <View style={[S.celda, { borderBottomColor: colors.borderSubtle }]}><Text style={[S.textoCelda, { color: colors.textSecondary }]}>{rec.localidad}</Text></View>
      <View style={[S.celda, { borderBottomColor: colors.borderSubtle }]}><TextInput style={[S.inputTabla, { color: '#60a5fa' }]} keyboardType="numeric" value={idChofer} onChangeText={onCh(setIdChofer, 'idChofer')} selectTextOnFocus /></View>
      <View style={[S.celda, { borderBottomColor: colors.borderSubtle }]}><Text style={[S.textoCelda, { color: colors.textSecondary }]}>{nombreCh}</Text></View>
      <View style={[S.celda, { borderBottomColor: colors.borderSubtle }]}><TextInput style={[S.inputTabla, { color: colors.textSecondary }]} keyboardType="numeric" value={pqteDia} onChangeText={onCh(setPqteDia, 'pqteDia')} selectTextOnFocus /></View>
      <View style={[S.celda, { borderBottomColor: colors.borderSubtle }]}><TextInput style={[S.inputTabla, { color: colors.textSecondary }]} keyboardType="numeric" value={porFuera} onChangeText={onCh(setPorFuera, 'porFuera')} selectTextOnFocus /></View>
      <View style={[S.celda, { borderBottomColor: colors.borderSubtle }]}><Text style={[S.textoCelda, { color: '#a78bfa', fontWeight: '800' }]}>{total}</Text></View>
      <View style={[S.celda, { borderBottomColor: colors.borderSubtle }]}><TextInput style={[S.inputTabla, { color: colors.textSecondary }]} keyboardType="numeric" value={entregados} onChangeText={onCh(setEntregados, 'entregados')} selectTextOnFocus /></View>
      <View style={[S.celda, { borderBottomColor: colors.borderSubtle }]}><Text style={[S.textoCelda, { fontWeight: '800', color: restante === 0 ? '#34D399' : restante <= 10 ? '#f59e0b' : '#f87171' }]}>{restante}</Text></View>
      <View style={[S.celda, { borderBottomColor: colors.borderSubtle }]}><Text style={[S.porcentaje, { color }]}>{pct}</Text></View>
    </View>
  );
});
FilaRecorrido.displayName = 'FilaRecorrido';

interface TablaZonaProps { zona: ZonaKey; datos: Recorrido[]; choferes: Chofer[]; visible: boolean; onToggle: (zona: ZonaKey) => void; onActualizar: (zona: ZonaKey, index: number, campo: string, valor: string) => void; }
const TablaZona = React.memo<TablaZonaProps>(({ zona, datos, choferes, visible, onToggle, onActualizar }) => {
  const { colors } = useTheme();
  const color = ZONA_COLORES[zona];
  return (
    <View style={S.tablaContainer}>
      <TouchableOpacity activeOpacity={0.75} onPress={() => { Keyboard.dismiss(); onToggle(zona); }} style={[S.zonaHeaderRow, { borderLeftColor: color }]}>
        <Ionicons name={visible ? 'chevron-down' : 'chevron-forward'} size={14} color={color} style={{ marginRight: 8 }} />
        <Text style={[S.zonaHeader, { color }]}>{zona}</Text>
        <View style={[S.zonaBadge, { backgroundColor: color + '22', borderColor: color + '44' }]}>
          <Text style={[S.zonaBadgeTexto, { color }]}>{datos.length} rutas</Text>
        </View>
      </TouchableOpacity>
      {visible && (
        <ScrollView horizontal style={[S.scrollHorizontal, { backgroundColor: colors.bgCard, borderColor: colors.border }]} showsHorizontalScrollIndicator={false}>
          <View>
            <View style={[S.filaTabla, S.filaHeader, { backgroundColor: colors.bgModal }]}>
              {['LOCALIDAD', 'ID', 'CHOFER', 'PQTE DÍA', 'POR FUERA', 'TOTAL', 'ENTREGADOS', 'RESTANTE', '% DEL DÍA'].map(h => (
                <View key={h} style={[S.celdaHeader, { borderBottomColor: colors.border }]}>
                  <Text style={[S.textoHeader, { color: colors.textMuted }]}>{h}</Text>
                </View>
              ))}
            </View>
            {datos.map((rec, i) => (
              <FilaRecorrido key={i} rec={rec} zona={zona} index={i} impar={i % 2 === 1} choferes={choferes} onActualizar={onActualizar} />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
});
TablaZona.displayName = 'TablaZona';

// ─── ModalAgregarRecorrido (sin cambios) ──────────────────────────────────────

interface ModalRecorridoProps { visible: boolean; onCerrar: () => void; onGuardar: (zona: ZonaKey, localidad: string) => void; }
const ModalAgregarRecorrido: React.FC<ModalRecorridoProps> = ({ visible, onCerrar, onGuardar }) => {
  const { colors } = useTheme();
  const [paso, setPaso] = useState<1 | 2>(1);
  const [zonaSeleccionada, setZonaSeleccionada] = useState<ZonaKey | null>(null);
  const [localidad, setLocalidad] = useState('');
  const resetear = () => { setPaso(1); setZonaSeleccionada(null); setLocalidad(''); };
  const cerrar = () => { resetear(); onCerrar(); };
  const confirmar = () => { if (!zonaSeleccionada || !localidad.trim()) { Alert.alert('Campo vacío', 'Ingresá una localidad para continuar.'); return; } onGuardar(zonaSeleccionada, localidad.trim()); resetear(); };

  const bottomSheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = React.useMemo(() => ['50%', '85%'], []);
  const renderBackdrop = React.useCallback(
    (props: any) => <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} opacity={0.6} />,
    []
  );

  useEffect(() => {
    if (visible) {
      bottomSheetRef.current?.present();
    } else {
      bottomSheetRef.current?.dismiss();
    }
  }, [visible]);

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={1}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      onDismiss={cerrar}
      backgroundStyle={{ backgroundColor: colors.bgCard }}
      handleIndicatorStyle={{ backgroundColor: colors.borderSubtle }}
      enablePanDownToClose
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
    >
      <BottomSheetView style={{ flex: 1, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 6 }}>
        <View style={[S.modalHeader, { borderBottomColor: colors.border }]}>
          <View>
            <Text style={[S.modalTitulo, { color: colors.textPrimary }]}>{paso === 1 ? 'Nueva fila de recorrido' : zonaSeleccionada}</Text>
            <Text style={[S.modalSubtitulo, { color: colors.textMuted }]}>{paso === 1 ? 'Seleccioná la tabla de destino' : 'Completá los datos de la ruta'}</Text>
          </View>
          <TouchableOpacity onPress={cerrar} style={[S.botonCerrar, { backgroundColor: colors.bgInput }]}>
            <Ionicons name="close" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
        {paso === 1 && (
          <View style={S.gridZonas}>
            {ZONAS.map(zona => {
              const color = ZONA_COLORES[zona];
              return (
                <TouchableOpacity key={zona} style={[S.botonZona, { backgroundColor: colors.bgInput, borderColor: color + '55' }]} onPress={() => { setZonaSeleccionada(zona); setPaso(2); }} activeOpacity={0.75}>
                  <Text style={S.botonZonaIcono}>{ZONA_ICONOS[zona]}</Text>
                  <Text style={[S.botonZonaTexto, { color }]}>{zona}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
        {paso === 2 && zonaSeleccionada && (
          <View>
            <TouchableOpacity onPress={() => setPaso(1)} style={S.botonVolver}>
              <Ionicons name="arrow-back" size={14} color="#60a5fa" style={{ marginRight: 4 }} />
              <Text style={S.botonVolverTexto}>Cambiar zona</Text>
            </TouchableOpacity>
            <View style={[S.zonaBadgeGrande, { backgroundColor: ZONA_COLORES[zonaSeleccionada] + '22', borderColor: ZONA_COLORES[zonaSeleccionada] + '66' }]}>
              <Text style={S.zonaBadgeGrandeIcono}>{ZONA_ICONOS[zonaSeleccionada]}</Text>
              <Text style={[S.zonaBadgeGrandeTexto, { color: ZONA_COLORES[zonaSeleccionada] }]}>{zonaSeleccionada}</Text>
            </View>
            <Text style={[S.label, { color: colors.textMuted }]}>LOCALIDAD / RUTA</Text>
            <TextInput style={[S.inputFicha, { backgroundColor: colors.bg, color: colors.textPrimary, borderColor: colors.border }]} placeholder="Ej: Morón, Quilmes, etc." placeholderTextColor={colors.textPlaceholder} value={localidad} onChangeText={setLocalidad} autoFocus />
            <Text style={[S.labelInfo, { color: colors.textMuted }]}>Se va a agregar una fila nueva a la tabla {zonaSeleccionada}.</Text>
            <TouchableOpacity style={[S.botonGuardar, { backgroundColor: ZONA_COLORES[zonaSeleccionada], flexDirection: 'row', justifyContent: 'center', alignItems: 'center' }]} onPress={confirmar}>
              <Text style={S.botonGuardarTexto}>Agregar fila</Text>
              <Ionicons name="arrow-forward" size={16} color="#fff" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
          </View>
        )}
      </BottomSheetView>
    </BottomSheetModal>
  );
};

// ─── RecorridosScreen ─────────────────────────────────────────────────────────

export default function RecorridosScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();

  // ── Autorización (Role Guard) ─────────────────────────────────────────────
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.email === ADMIN_EMAIL) {
        setIsAuthorized(true);
      } else {
        setIsAuthorized(false);
        router.replace('/(drawer)/Panel' as any);
      }
    });
  }, [router]);

  // ── Estado de pestañas ────────────────────────────────────────────────────
  const [tipoDia, setTipoDia] = useState<TipoDia>('semana');

  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const emptyZonas = { 'ZONA OESTE': [] as Recorrido[], 'ZONA SUR': [] as Recorrido[], 'ZONA NORTE': [] as Recorrido[], 'CABA': [] as Recorrido[] };
  const [dataSemana, setDataSemana] = useState<Record<ZonaKey, Recorrido[]>>({ ...emptyZonas });
  const [dataSabado, setDataSabado] = useState<Record<ZonaKey, Recorrido[]>>({ ...emptyZonas });
  // Vista activa derivada del tab — cambiar de tab NO hace fetch
  const recorridos = tipoDia === 'semana' ? dataSemana : dataSabado;
  const [zonasVisibles, setZonasVisibles] = useState<Record<ZonaKey, boolean>>({ 'ZONA OESTE': true, 'ZONA SUR': true, 'ZONA NORTE': true, 'CABA': true });
  const [refrescando, setRefrescando] = useState(false);
  const [modalRecorrido, setModalRecorrido] = useState(false);
  const [colectasPendientes, setColectasPendientes] = useState<number | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Data fetching
  // ─────────────────────────────────────────────────────────────────────────

  const refreshChoferes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('Choferes')
        .select('id, orden, nombre, dni, celular, direccion, fecha_ingreso, zona, vehiculo, condicion')
        .order('orden', { ascending: true, nullsFirst: false });
      if (error) throw error;
      setChoferes(ordenarChoferesPorOrden(data || []));
    } catch (err) { console.error('Error cargando choferes:', err); }
  }, []);

  // Carga una tabla específica y guarda en el setter correspondiente.
  // La web separó los días hábiles por la columna `tab` (LUNES..VIERNES) en la
  // tabla Recorridos: acá mostramos SOLO el día de HOY (domingo → LUNES).
  const loadTabla = useCallback(async (tabla: 'Recorridos' | 'recorridos_sabados', setter: React.Dispatch<React.SetStateAction<Record<ZonaKey, Recorrido[]>>>) => {
    try {
      let q = supabase.from(tabla).select('*').order('orden', { ascending: true, nullsFirst: false });
      if (tabla === 'Recorridos') q = q.eq('tab', diaHabilHoy());
      const { data, error } = await q;
      if (error) throw error;
      const porZona: Record<ZonaKey, Recorrido[]> = { 'ZONA OESTE': [], 'ZONA SUR': [], 'ZONA NORTE': [], 'CABA': [] };
      (data || []).forEach(rec => { const zona = rec.zona as ZonaKey; if (zona in porZona) porZona[zona].push(rec); });
      (Object.keys(porZona) as ZonaKey[]).forEach(z => porZona[z].sort(compararRecorridoPorOrden));
      setter(porZona);
    } catch (err) { console.error(`Error cargando ${tabla}:`, err); }
  }, []);

  // Carga AMBAS tablas — no depende de tipoDia → identidad estable
  const refreshRecorridos = useCallback(async () => {
    await Promise.all([
      loadTabla('Recorridos', setDataSemana),
      loadTabla('recorridos_sabados', setDataSabado),
    ]);
  }, [loadTabla]);

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
    } catch { }
  }, []);

  // Carga inicial + re-carga automática cuando cambia la pestaña
  useEffect(() => {
    refreshChoferes();
    refreshRecorridos();
    fetchColectasPendientes();
  }, [refreshChoferes, refreshRecorridos, fetchColectasPendientes]);

  // ─────────────────────────────────────────────────────────────────────────
  // Push notifications
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const responseListener = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (data?.tipo === 'NUEVA_COLECTA') router.push('/(drawer)/colectas' as any);
    });
    const registrarTokenSeguro = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return;
        const token = await registerForPushNotificationsAsync();
        if (!token) return;
        const { error } = await supabase.from('Choferes').update({ push_token: token.data }).eq('email', user.email);
        if (error) console.error('Error guardando push token:', error.message);
      } catch (err) { console.error('Error push notifications:', err); }
    };
    registrarTokenSeguro();
    return () => { responseListener.remove(); };
  }, [router]);

  // ─────────────────────────────────────────────────────────────────────────
  // Realtime — escucha AMBAS tablas + Choferes
  // ─────────────────────────────────────────────────────────────────────────

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ventana para ignorar el eco del realtime de NUESTRA propia escritura: ya
  // tenemos el cambio optimista, así que re-fetchear todo justo después solo
  // generaba un flash/jank. Los cambios de OTROS equipos sí refrescan.
  const suppressEchoRef = useRef(0);
  useEffect(() => {
    const schedule = (fn: () => void) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fn, 320);
    };
    const onSemanaEco = () => { if (Date.now() < suppressEchoRef.current) return; schedule(() => loadTabla('Recorridos', setDataSemana)); };
    const onSabadoEco = () => { if (Date.now() < suppressEchoRef.current) return; schedule(() => loadTabla('recorridos_sabados', setDataSabado)); };

    const channel = supabase
      .channel('logistica-public-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Recorridos' }, onSemanaEco)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'recorridos_sabados' }, onSabadoEco)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'Choferes' }, () => schedule(refreshChoferes))
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      void supabase.removeChannel(channel);
    };
  }, [loadTabla, refreshChoferes]);

  // ─────────────────────────────────────────────────────────────────────────
  // Mutaciones — usan tablaActiva dinámicamente
  // ─────────────────────────────────────────────────────────────────────────

  // Refs para que actualizarRecorrido/toggle tengan identidad ESTABLE (no se
  // recrean en cada render) → React.memo de TablaZona funciona y solo
  // re-renderiza la zona editada, no las 4.
  // Ref siempre apunta a la data de AMBOS tabs para que actualizarRecorrido lea la correcta
  const dataSemanaRef = useRef(dataSemana);
  useEffect(() => { dataSemanaRef.current = dataSemana; }, [dataSemana]);
  const dataSabadoRef = useRef(dataSabado);
  useEffect(() => { dataSabadoRef.current = dataSabado; }, [dataSabado]);
  const tipoDiaRef = useRef(tipoDia);
  useEffect(() => { tipoDiaRef.current = tipoDia; }, [tipoDia]);
  const choferesRef = useRef(choferes);
  useEffect(() => { choferesRef.current = choferes; }, [choferes]);

  // Debounce del guardado: antes se hacía un UPDATE a Supabase en CADA tecla
  // (lag + spam de red + eco del realtime). Ahora el estado se actualiza
  // optimista al instante y la escritura va recién 600ms después de soltar.
  const writeTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useEffect(() => () => { Object.values(writeTimers.current).forEach(clearTimeout); }, []);

  const toggleZona = useCallback((z: ZonaKey) => {
    setZonasVisibles(prev => ({ ...prev, [z]: !prev[z] }));
  }, []);

  // El valor mientras se tipea lo mantiene la fila (estado local). Acá SOLO
  // persistimos a la base con debounce por celda (sin setRecorridos → el padre
  // no se re-renderiza en cada tecla).
  const actualizarRecorrido = useCallback((zona: ZonaKey, index: number, campo: string, valor: string) => {
    const esSemana = tipoDiaRef.current === 'semana';
    const tablaActiva = esSemana ? 'Recorridos' : 'recorridos_sabados';
    const anterior = (esSemana ? dataSemanaRef.current : dataSabadoRef.current)[zona]?.[index];
    if (!anterior) return;
    const idDb = anterior.id;

    let val: any = valor;
    let choferNombre: string | undefined;
    if (['pqteDia', 'porFuera', 'entregados'].includes(campo)) {
      val = parseInt(valor) || 0;
    } else if (campo === 'idChofer') {
      val = parseInt(valor) || 0;
      choferNombre = choferesRef.current.find(c => c.id === val)?.nombre ?? 'Sin Asignar';
    }

    const key = `${tablaActiva}:${idDb ?? anterior.localidad}:${campo}`;
    if (writeTimers.current[key]) clearTimeout(writeTimers.current[key]);
    writeTimers.current[key] = setTimeout(async () => {
      suppressEchoRef.current = Date.now() + 2500; // ignorar el eco de esta escritura
      try {
        const payload: Record<string, any> = { [campo]: val };
        if (campo === 'idChofer' && choferNombre !== undefined) payload.chofer = choferNombre;
        const query = idDb
          ? supabase.from(tablaActiva).update(payload).eq('id', idDb)
          : supabase.from(tablaActiva).update(payload).match({ zona, localidad: anterior.localidad });
        const { error } = await query;
        if (error) throw error;
      } catch (err) {
        console.error('Error actualizando recorrido:', err);
      }
    }, 600);
  }, []);

  const agregarRecorrido = async (zona: ZonaKey, localidad: string) => conLock('agregar-recorrido', async () => {
    const esSemana = tipoDia === 'semana';
    const tablaActiva = esSemana ? 'Recorridos' : 'recorridos_sabados';
    const setter = esSemana ? setDataSemana : setDataSabado;
    // En Recorridos la fila queda asignada al DÍA de hoy (columna tab).
    const nuevo = esSemana
      ? { zona, localidad, idChofer: 0, chofer: 'Sin Asignar', pqteDia: 0, porFuera: 0, entregados: 0, tab: diaHabilHoy() }
      : { zona, localidad, idChofer: 0, chofer: 'Sin Asignar', pqteDia: 0, porFuera: 0, entregados: 0 };
    setter(prev => ({ ...prev, [zona]: [...prev[zona], nuevo].sort(compararRecorridoPorOrden) }));
    setModalRecorrido(false);
    try { await supabase.from(tablaActiva).insert([nuevo]); } catch (err) { console.error('Error insertando recorrido:', err); }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (isAuthorized !== true) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <View style={[S.root, { backgroundColor: colors.bg }]}>

      {/* Widget colectas pendientes — sin cambios */}
      {colectasPendientes != null && colectasPendientes > 0 && (
        <View style={[S.widgetColectas, { backgroundColor: colors.bgCard, borderColor: `${colors.blue}59` }]}>
          <View style={S.widgetLeft}>
            <Ionicons name="archive-outline" size={26} color={colors.blue} />
            <View style={{ flex: 1 }}>
              <Text style={[S.widgetTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                {colectasPendientes} colecta{colectasPendientes !== 1 ? 's' : ''} pendiente{colectasPendientes !== 1 ? 's' : ''} hoy
              </Text>
              <Text style={[S.widgetSub, { color: colors.textMuted }]}>Tu lista te espera</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[S.widgetBtn, { backgroundColor: colors.blue }]}
            onPress={() => router.push('/(drawer)/colectas' as any)}
            activeOpacity={0.8}
          >
            <Text style={S.widgetBtnText}>Ver</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Action bar — sin cambios */}
      <View style={S.actionBar}>
        <TouchableOpacity
          onPress={() => { Keyboard.dismiss(); setModalRecorrido(true); }}
          style={[S.btnAccion, { backgroundColor: colors.blue }]}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={18} color="#FFFFFF" />
          <Text style={S.btnAccionTexto}>Recorrido</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { Keyboard.dismiss(); router.push('/(drawer)/personal' as any); }}
          style={[S.btnAccion, S.btnAccionSecundario, { backgroundColor: colors.blueSubtle, borderColor: `${colors.blue}4D` }]}
          activeOpacity={0.8}
        >
          <Ionicons name="person-add-outline" size={18} color={colors.blue} />
          <Text style={[S.btnAccionTexto, { color: colors.blue }]}>Chofer</Text>
        </TouchableOpacity>
      </View>

      {/* ── Segmented Control ── */}
      <View style={[S.tabsContainer, { backgroundColor: isDark ? '#0d1526' : colors.bgCard, borderColor: colors.border, borderWidth: 1 }]}>
        <TouchableOpacity
          style={[S.tabBtn, tipoDia === 'semana' && { backgroundColor: isDark ? '#3b82f6' : '#4F8EF7' }]}
          onPress={() => { Keyboard.dismiss(); setTipoDia('semana'); }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="calendar-outline"
            size={13}
            color={tipoDia === 'semana' ? '#FFFFFF' : (isDark ? 'rgba(255,255,255,0.5)' : colors.textMuted)}
            style={{ marginRight: 5 }}
          />
          <Text style={[S.tabTexto, { color: tipoDia === 'semana' ? '#FFFFFF' : (isDark ? 'rgba(255,255,255,0.5)' : colors.textMuted) }]}>{diaHabilHoy()}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[S.tabBtn, tipoDia === 'sabado' && { backgroundColor: isDark ? '#3b82f6' : '#4F8EF7' }]}
          onPress={() => { Keyboard.dismiss(); setTipoDia('sabado'); }}
          activeOpacity={0.8}
        >
          <Ionicons
            name="sunny-outline"
            size={13}
            color={tipoDia === 'sabado' ? '#FFFFFF' : (isDark ? 'rgba(255,255,255,0.5)' : colors.textMuted)}
            style={{ marginRight: 5 }}
          />
          <Text style={[S.tabTexto, { color: tipoDia === 'sabado' ? '#FFFFFF' : (isDark ? 'rgba(255,255,255,0.5)' : colors.textMuted) }]}>SÁBADOS</Text>
        </TouchableOpacity>
      </View>

      {/* Tablas de recorridos */}
      <ScrollView
        style={[S.container, { backgroundColor: colors.bg }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={async () => {
              setRefrescando(true);
              await Promise.all([refreshChoferes(), refreshRecorridos()]);
              setRefrescando(false);
            }}
            tintColor={colors.blue}
            colors={[colors.blue]}
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

// ─── Estilos estáticos ────────────────────────────────────────────────────────

const S = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1, padding: 15 },

  // Widget colectas
  widgetColectas: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 16, marginHorizontal: 16, marginTop: 12, padding: 14, gap: 12 },
  widgetLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  widgetTitle: { fontSize: 13, fontWeight: '700' },
  widgetSub: { fontSize: 11, marginTop: 2 },
  widgetBtn: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10 },
  widgetBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },

  // Action bar
  actionBar: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 12 },
  btnAccion: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  btnAccionSecundario: { borderWidth: 1 },
  btnAccionTexto: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // ── Segmented Control ──────────────────────────────────────────────────────
  tabsContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 9,
    backgroundColor: 'transparent',
  },
  tabTexto: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
  },

  // Tablas
  tablaContainer: { marginBottom: 24 },
  zonaHeaderRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingLeft: 12, borderLeftWidth: 3 },
  zonaHeader: { fontSize: 16, fontWeight: 'bold', flex: 1 },
  zonaBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
  zonaBadgeTexto: { fontSize: 10, fontWeight: 'bold' },
  scrollHorizontal: { borderRadius: 10, borderWidth: 1 },
  filaTabla: { flexDirection: 'row' },
  filaHeader: {},
  celdaHeader: { width: 100, padding: 10, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1 },
  textoHeader: { fontSize: 10, fontWeight: 'bold', textAlign: 'center', letterSpacing: 0.5 },
  celda: { width: 100, padding: 10, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1 },
  textoCelda: { fontSize: 13, textAlign: 'center' },
  inputTabla: { backgroundColor: 'transparent', textAlign: 'center', fontSize: 13, width: '100%', paddingVertical: 2 },
  porcentaje: { fontSize: 13, fontWeight: 'bold', textAlign: 'center' },
  label: { fontSize: 10, fontWeight: 'bold', marginBottom: 4, marginTop: 10, letterSpacing: 1 },
  inputFicha: { padding: 12, borderRadius: 8, fontSize: 14, borderWidth: 1 },
  selectorRow: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, marginRight: 8, marginBottom: 8, borderWidth: 1 },
  chipTexto: { fontSize: 11, fontWeight: 'bold' },
  botonGuardar: { padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 20 },
  botonGuardarTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  bottomSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 6, paddingBottom: 40, paddingHorizontal: 20, borderTopWidth: 1 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 16, borderBottomWidth: 1, marginBottom: 16 },
  modalTitulo: { fontSize: 18, fontWeight: 'bold' },
  modalSubtitulo: { fontSize: 12, marginTop: 3 },
  botonCerrar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  gridZonas: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginTop: 4 },
  botonZona: { width: '48%', borderWidth: 1, borderRadius: 14, padding: 20, alignItems: 'center', marginBottom: 12 },
  botonZonaIcono: { fontSize: 28, marginBottom: 8 },
  botonZonaTexto: { fontSize: 14, fontWeight: 'bold' },
  botonVolver: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginBottom: 14, paddingVertical: 6, paddingHorizontal: 10 },
  botonVolverTexto: { color: '#60a5fa', fontSize: 13 },
  zonaBadgeGrande: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, marginBottom: 16 },
  zonaBadgeGrandeIcono: { fontSize: 20, marginRight: 8 },
  zonaBadgeGrandeTexto: { fontSize: 15, fontWeight: 'bold' },
  labelInfo: { fontSize: 11, marginTop: 10, marginBottom: 4, lineHeight: 16 },
  fichaTecnica: { padding: 16 },
  divisor: { height: 1, marginBottom: 14 },
  fila: { flexDirection: 'row', marginBottom: 4 },
  modalFullScreen: { flex: 1 },
  modalFullHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, paddingTop: Platform.OS === 'ios' ? 56 : 20, borderBottomWidth: 1 },
});