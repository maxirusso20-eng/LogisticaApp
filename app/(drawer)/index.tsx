/**
 * APP DE GESTIÓN DE RECORRIDOS (VERSIÓN SUPABASE REAL)
 */

import { useRouter } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { supabase } from '../../lib/supabase'; // Ruta confirmada por tu captura

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
  despachos: string[];
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

type PantallaActual = 'recorridos' | 'choferes' | 'mapa';
type ZonaKey = 'ZONA OESTE' | 'ZONA SUR' | 'ZONA NORTE' | 'CABA';

// ─────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────

const ZONAS: ZonaKey[] = ['ZONA OESTE', 'ZONA SUR', 'ZONA NORTE', 'CABA'];
const VEHICULOS = ['SUV', 'UTILITARIO', 'AUTO'];
const CONDICIONES = ['TITULAR', 'SUPLENTE', 'COLECTADOR'];

const ZONA_COLORES: Record<ZonaKey, string> = {
  'ZONA OESTE': '#3b82f6',
  'ZONA SUR':   '#10b981',
  'ZONA NORTE': '#f59e0b',
  'CABA':       '#8b5cf6',
};

const ZONA_ICONOS: Record<ZonaKey, string> = {
  'ZONA OESTE': '⬅️',
  'ZONA SUR':   '⬇️',
  'ZONA NORTE': '⬆️',
  'CABA':       '🏙️',
};

const NUEVO_CHOFER_DEFAULT: Chofer = {
  id: 0, nombre: '', dni: '', celular: '',
  direccion: '', fechaIngreso: '', zona: [],
  vehiculo: [], condicion: 'SUPLENTE', despachos: [],
};

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const calcularPorcentaje = (r: Recorrido): string => {
  const suma = (r.pqteDia || 0) + (r.porFuera || 0);
  if (suma === 0) return '0%';
  return (((r.entregados || 0) / suma) * 100).toFixed(1) + '%';
};

const formatearFecha = (texto: string): string => {
  const nums = texto.replace(/\D/g, '');
  if (nums.length <= 2) return nums;
  if (nums.length <= 4) return `${nums.slice(0, 2)}/${nums.slice(2)}`;
  return `${nums.slice(0, 2)}/${nums.slice(2, 4)}/${nums.slice(4, 8)}`;
};

/** Nombre mostrado junto al ID: prioriza la lista de choferes (evita race al cargar). */
const nombreChoferVisible = (rec: Recorrido, choferes: Chofer[]): string => {
  const id = rec.idChofer;
  if (id == null || id === 0) return 'Sin Asignar';
  const encontrado = choferes.find(c => c.id === id);
  if (encontrado?.nombre) return encontrado.nombre;
  const fallback = (rec.chofer ?? '').trim();
  return fallback || 'Sin Asignar';
};

const ordenNumerico = (o: number | null | undefined) =>
  o == null || Number.isNaN(Number(o)) ? Number.MAX_SAFE_INTEGER : Number(o);

/** Mismo criterio que Supabase: `order('orden', { ascending: true })`; desempate por `id`. */
const compararRecorridoPorOrden = (a: Recorrido, b: Recorrido): number => {
  const d = ordenNumerico(a.orden) - ordenNumerico(b.orden);
  if (d !== 0) return d;
  const ai = a.id ?? Number.MAX_SAFE_INTEGER;
  const bi = b.id ?? Number.MAX_SAFE_INTEGER;
  return ai - bi;
};

const ordenarChoferesPorOrden = (lista: Chofer[]): Chofer[] =>
  [...lista].sort((a, b) => {
    const d = ordenNumerico(a.orden) - ordenNumerico(b.orden);
    return d !== 0 ? d : a.id - b.id;
  });

// ─────────────────────────────────────────────
// COMPONENTES REUTILIZABLES
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
    multi
      ? (seleccionados as string[]).includes(op)
      : seleccionados === op;

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
// COMPONENTE: TABLA DE RECORRIDOS POR ZONA
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
        <Text style={[S.zonaFlecha, { color }]}>{visible ? '▼' : '▶'}</Text>
        <Text style={[S.zonaHeader, { color }]}>{zona}</Text>
        <View style={[S.zonaBadge, { backgroundColor: color + '22', borderColor: color + '44' }]}>
          <Text style={[S.zonaBadgeTexto, { color }]}>{datos.length} rutas</Text>
        </View>
      </TouchableOpacity>

      {visible && (
        <ScrollView horizontal style={S.scrollHorizontal} showsHorizontalScrollIndicator={false}>
          <View>
            <View style={[S.filaTabla, S.filaHeader]}>
              {['LOCALIDAD', 'ID', 'CHOFER', 'PQTE DÍA', 'POR FUERA', 'ENTREGADOS', '% DEL DÍA'].map(h => (
                <View key={h} style={S.celdaHeader}>
                  <Text style={S.textoHeader}>{h}</Text>
                </View>
              ))}
            </View>

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
                <View style={S.celda}>
                  <TextInput
                    style={S.inputTabla}
                    keyboardType="numeric"
                    value={rec.entregados?.toString() || '0'}
                    onChangeText={v => onActualizar(zona, i, 'entregados', v)}
                    selectTextOnFocus
                  />
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
// COMPONENTE: PANTALLA RECORRIDOS
// ─────────────────────────────────────────────

interface RecorridosScreenProps {
  recorridos: Record<ZonaKey, Recorrido[]>;
  choferes: Chofer[];
  onActualizar: (zona: ZonaKey, index: number, campo: string, valor: string) => void;
}

const RecorridosScreen: React.FC<RecorridosScreenProps> = ({ recorridos, choferes, onActualizar }) => {
  const [zonasVisibles, setZonasVisibles] = useState<Record<ZonaKey, boolean>>({
    'ZONA OESTE': true, 'ZONA SUR': true, 'ZONA NORTE': true, 'CABA': true,
  });

  const toggleZona = (zona: ZonaKey) => {
    setZonasVisibles(prev => ({ ...prev, [zona]: !prev[zona] }));
  };

  return (
    <ScrollView style={S.container} showsVerticalScrollIndicator={false}>
      {(Object.keys(recorridos) as ZonaKey[]).map(zona => (
        <TablaZona
          key={zona}
          zona={zona}
          datos={recorridos[zona] || []}
          choferes={choferes}
          visible={zonasVisibles[zona]}
          onToggle={toggleZona}
          onActualizar={onActualizar}
        />
      ))}
      <View style={{ height: 80 }} />
    </ScrollView>
  );
};

// ─────────────────────────────────────────────
// COMPONENTE: FICHA TÉCNICA DEL CHOFER
// ─────────────────────────────────────────────

interface FichaTecnicaProps {
  chofer: Chofer;
  onActualizar: (id: number, campo: keyof Chofer, valor: string | number | string[]) => void;
  onGuardar: () => void;
}

const FichaTecnica: React.FC<FichaTecnicaProps> = ({ chofer, onActualizar, onGuardar }) => (
  <View style={S.fichaTecnica}>
    <View style={S.divisor} />

    <View style={S.fila}>
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text style={S.label}>ID</Text>
        <TextInput
          style={S.inputFicha}
          keyboardType="numeric"
          value={chofer.id.toString()}
          onChangeText={v => onActualizar(chofer.id, 'id', v)}
          selectTextOnFocus
        />
      </View>
      <View style={{ flex: 2 }}>
        <Text style={S.label}>NOMBRE COMPLETO</Text>
        <TextInput
          style={S.inputFicha}
          value={chofer.nombre || ''}
          onChangeText={v => onActualizar(chofer.id, 'nombre', v)}
        />
      </View>
    </View>

    <View style={S.fila}>
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text style={S.label}>CELULAR</Text>
        <TextInput
          style={S.inputFicha}
          keyboardType="phone-pad"
          value={chofer.celular || ''}
          onChangeText={v => onActualizar(chofer.id, 'celular', v)}
        />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={S.label}>DNI</Text>
        <TextInput
          style={S.inputFicha}
          keyboardType="numeric"
          value={chofer.dni || ''}
          onChangeText={v => onActualizar(chofer.id, 'dni', v)}
          selectTextOnFocus
        />
      </View>
    </View>

    <Text style={S.label}>DIRECCIÓN</Text>
    <TextInput
      style={S.inputFicha}
      value={chofer.direccion || ''}
      onChangeText={v => onActualizar(chofer.id, 'direccion', v)}
    />

    <Text style={S.label}>FECHA INGRESO</Text>
    <TextInput
      style={S.inputFicha}
      value={chofer.fechaIngreso || ''}
      onChangeText={v => onActualizar(chofer.id, 'fechaIngreso', formatearFecha(v))}
      maxLength={10}
      placeholder="DD/MM/YYYY"
      placeholderTextColor="#64748b"
    />

    <Text style={S.label}>ZONA PREFERENCIAL</Text>
    <SelectorChips
      opciones={ZONAS}
      seleccionados={chofer.zona || []}
      multi
      onToggle={z => {
        const actual = chofer.zona || [];
        onActualizar(chofer.id, 'zona',
          actual.includes(z) ? actual.filter(x => x !== z) : [...actual, z]);
      }}
    />

    <Text style={S.label}>VEHÍCULO</Text>
    <SelectorChips
      opciones={VEHICULOS}
      seleccionados={chofer.vehiculo || []}
      multi
      onToggle={v => {
        const actual = chofer.vehiculo || [];
        onActualizar(chofer.id, 'vehiculo',
          actual.includes(v) ? actual.filter(x => x !== v) : [...actual, v]);
      }}
      colorActivo="#10b981"
    />

    <Text style={S.label}>CONDICIÓN</Text>
    <SelectorChips
      opciones={CONDICIONES}
      seleccionados={chofer.condicion || ''}
      onToggle={c => onActualizar(chofer.id, 'condicion', c)}
      colorActivo="#f59e0b"
    />

    <TouchableOpacity style={S.botonGuardar} onPress={onGuardar}>
      <Text style={S.botonGuardarTexto}>✓  Guardar Cambios</Text>
    </TouchableOpacity>
  </View>
);

// ─────────────────────────────────────────────
// COMPONENTE: PANTALLA CHOFERES
// ─────────────────────────────────────────────

interface ChoferesScreenProps {
  choferes: Chofer[];
  onActualizar: (id: number, campo: keyof Chofer, valor: string | number | string[]) => void;
}

const ChoferesScreen: React.FC<ChoferesScreenProps> = ({ choferes, onActualizar }) => {
  const [busquedaId, setBusquedaId] = useState('');
  const [choferExpandido, setChoferExpandido] = useState<number | null>(null);

  const filtrados = choferes.filter(c => c.id?.toString().includes(busquedaId));

  return (
    <View style={{ flex: 1 }}>
      <View style={S.buscadorContainer}>
        <TextInput
          style={S.inputBusqueda}
          placeholder="🔍 Buscar por ID..."
          placeholderTextColor="#64748b"
          keyboardType="numeric"
          value={busquedaId}
          onChangeText={setBusquedaId}
        />
      </View>

      <ScrollView style={S.container} showsVerticalScrollIndicator={false}>
        {filtrados.map(chofer => (
          <View key={chofer.id} style={S.card}>
            <TouchableOpacity
              onPress={() => setChoferExpandido(choferExpandido === chofer.id ? null : chofer.id)}
              style={S.cardHeader}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={S.nombreChofer}>{chofer.nombre}</Text>
                <Text style={S.idSubtitulo}>ID {chofer.id}  •  {chofer.condicion}  •  {(chofer.zona || []).join(', ')}</Text>
              </View>
              <Text style={S.icono}>{choferExpandido === chofer.id ? '🔼' : '🔽'}</Text>
            </TouchableOpacity>

            {choferExpandido === chofer.id && (
              <FichaTecnica
                chofer={chofer}
                onActualizar={onActualizar}
                onGuardar={() => setChoferExpandido(null)}
              />
            )}
          </View>
        ))}
        <View style={{ height: 80 }} />
      </ScrollView>
    </View>
  );
};

// ─────────────────────────────────────────────
// COMPONENTE: PANTALLA MAPA
// ─────────────────────────────────────────────

const MapaScreen: React.FC = () => {
  const [busqueda, setBusqueda] = useState('');
  const [url, setUrl] = useState('https://www.google.com/maps');

  return (
    <View style={{ flex: 1, padding: 15 }}>
      <View style={{ flexDirection: 'row', marginBottom: 15 }}>
        <TextInput
          style={S.inputMapa}
          placeholder="🔍 Ej: Ruta 3 km 35..."
          placeholderTextColor="#64748b"
          value={busqueda}
          onChangeText={setBusqueda}
        />
        <TouchableOpacity
          style={S.botonBuscarMapa}
          onPress={() => setUrl('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(busqueda))}
        >
          <Text style={S.botonBuscarMapaTexto}>Buscar</Text>
        </TouchableOpacity>
      </View>
      <View style={S.mapaContainer}>
        <WebView source={{ uri: url }} style={{ flex: 1 }} />
      </View>
    </View>
  );
};

// ─────────────────────────────────────────────
// COMPONENTE: MODALES Y NAVEGACIÓN
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

  const resetear = () => {
    setPaso(1);
    setZonaSeleccionada(null);
    setLocalidad('');
  };

  const cerrar = () => {
    resetear();
    onCerrar();
  };

  const confirmar = () => {
    if (!zonaSeleccionada || !localidad.trim()) {
      alert('Ingresá una localidad');
      return;
    }
    onGuardar(zonaSeleccionada, localidad.trim());
    resetear();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
      <View style={S.modalOverlay}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={cerrar} />

        <View style={S.bottomSheet}>
          <View style={S.modalHeader}>
            <View>
              <Text style={S.modalTitulo}>
                {paso === 1 ? 'Nueva fila de recorrido' : `Zona ${zonaSeleccionada}`}
              </Text>
              <Text style={S.modalSubtitulo}>
                {paso === 1 ? 'Seleccioná la tabla de destino' : 'Completá los datos de la ruta'}
              </Text>
            </View>
            <TouchableOpacity onPress={cerrar} style={S.botonCerrar}>
              <Text style={S.botonCerrarTexto}>✕</Text>
            </TouchableOpacity>
          </View>

          {paso === 1 && (
            <View style={S.pasoContainer}>
              <View style={S.gridZonas}>
                {ZONAS.map(zona => {
                  const color = ZONA_COLORES[zona];
                  return (
                    <TouchableOpacity
                      key={zona}
                      style={[S.botonZona, { borderColor: color + '55' }]}
                      onPress={() => {
                        setZonaSeleccionada(zona);
                        setPaso(2);
                      }}
                      activeOpacity={0.75}
                    >
                      <Text style={S.botonZonaIcono}>{ZONA_ICONOS[zona]}</Text>
                      <Text style={[S.botonZonaTexto, { color }]}>ZONA {zona}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {paso === 2 && zonaSeleccionada && (
            <View style={S.pasoContainer}>
              <TouchableOpacity onPress={() => setPaso(1)} style={S.botonVolver}>
                <Text style={S.botonVolverTexto}>← Cambiar zona</Text>
              </TouchableOpacity>

              <View style={[S.zonaBadgeGrande, { backgroundColor: ZONA_COLORES[zonaSeleccionada] + '22', borderColor: ZONA_COLORES[zonaSeleccionada] + '66' }]}>
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
                style={[S.botonGuardar, { backgroundColor: ZONA_COLORES[zonaSeleccionada] }]}
                onPress={confirmar}
              >
                <Text style={S.botonGuardarTexto}>Agregar fila  →</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

interface ModalChoferProps {
  visible: boolean;
  onCerrar: () => void;
  onGuardar: (chofer: Chofer) => void;
}

const ModalAgregarChofer: React.FC<ModalChoferProps> = ({ visible, onCerrar, onGuardar }) => {
  const [form, setForm] = useState<Chofer>(NUEVO_CHOFER_DEFAULT);

  const actualizar = (campo: keyof Chofer, valor: string | number | string[]) => {
    setForm(prev => ({
      ...prev,
      [campo]: campo === 'id' ? parseInt(valor as string) || 0 : valor,
    }));
  };

  const guardar = () => {
    if (!form.id || !form.nombre) {
      alert('ID y Nombre son requeridos');
      return;
    }
    onGuardar({ ...form, despachos: [] });
    setForm(NUEVO_CHOFER_DEFAULT);
  };

  return (
    <Modal visible={visible} animationType="slide">
      <SafeAreaView style={S.safeArea}>
        <StatusBar barStyle="light-content" />
        <View style={[S.header, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
          <Text style={S.headerTitle}>Cargar Nuevo Chofer</Text>
          <TouchableOpacity onPress={onCerrar} style={S.botonCerrar}>
            <Text style={S.botonCerrarTexto}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={S.container}>
          <View style={S.fichaTecnica}>
            <View style={S.fila}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={S.label}>ID</Text>
                <TextInput style={S.inputFicha} keyboardType="numeric" value={form.id ? form.id.toString() : ''} onChangeText={v => actualizar('id', v)} selectTextOnFocus />
              </View>
              <View style={{ flex: 2 }}>
                <Text style={S.label}>NOMBRE COMPLETO</Text>
                <TextInput style={S.inputFicha} value={form.nombre} onChangeText={v => actualizar('nombre', v)} />
              </View>
            </View>

            <View style={S.fila}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={S.label}>CELULAR</Text>
                <TextInput style={S.inputFicha} keyboardType="phone-pad" value={form.celular} onChangeText={v => actualizar('celular', v)} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={S.label}>DNI</Text>
                <TextInput style={S.inputFicha} keyboardType="numeric" value={form.dni} onChangeText={v => actualizar('dni', v)} selectTextOnFocus />
              </View>
            </View>

            <Text style={S.label}>DIRECCIÓN</Text>
            <TextInput style={S.inputFicha} value={form.direccion} onChangeText={v => actualizar('direccion', v)} />

            <Text style={S.label}>FECHA INGRESO</Text>
            <TextInput
              style={S.inputFicha}
              value={form.fechaIngreso}
              onChangeText={v => actualizar('fechaIngreso', formatearFecha(v))}
              maxLength={10}
              placeholder="DD/MM/YYYY"
              placeholderTextColor="#64748b"
            />

            <Text style={S.label}>ZONA PREFERENCIAL</Text>
            <SelectorChips
              opciones={ZONAS}
              seleccionados={form.zona}
              multi
              onToggle={z => {
                const actual = form.zona;
                actualizar('zona', actual.includes(z) ? actual.filter(x => x !== z) : [...actual, z]);
              }}
            />

            <Text style={S.label}>VEHÍCULO</Text>
            <SelectorChips
              opciones={VEHICULOS}
              seleccionados={form.vehiculo}
              multi
              onToggle={v => {
                const actual = form.vehiculo;
                actualizar('vehiculo', actual.includes(v) ? actual.filter(x => x !== v) : [...actual, v]);
              }}
              colorActivo="#10b981"
            />

            <Text style={S.label}>CONDICIÓN</Text>
            <SelectorChips
              opciones={CONDICIONES}
              seleccionados={form.condicion}
              onToggle={c => actualizar('condicion', c)}
              colorActivo="#f59e0b"
            />

            <TouchableOpacity style={S.botonGuardar} onPress={guardar}>
              <Text style={S.botonGuardarTexto}>✓  Agregar Chofer</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
};



// ─────────────────────────────────────────────
// COMPONENTE RAÍZ: APP (LÓGICA SUPABASE)
// ─────────────────────────────────────────────

export default function App() {
  const router = useRouter();
  const [pantalla, setPantalla] = useState<PantallaActual>('recorridos');
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [recorridos, setRecorridos] = useState<Record<ZonaKey, Recorrido[]>>({
    'ZONA OESTE': [], 'ZONA SUR': [], 'ZONA NORTE': [], 'CABA': []
  });

  // ── Widget de colectas pendientes
  const [colectasPendientes, setColectasPendientes] = useState<number | null>(null);

  useEffect(() => {
    const fetchPendientes = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user?.email) return;
        const { count, error } = await supabase
          .from('Clientes')
          .select('id', { count: 'exact', head: true })
          .eq('email_chofer', user.email)
          .eq('completado', false);
        if (!error) setColectasPendientes(count ?? 0);
      } catch (err) {
        console.error('Error fetching colectas pendientes:', err);
      }
    };
    fetchPendientes();
  }, []);

  const [modalRecorrido, setModalRecorrido] = useState(false);
  const [modalChofer, setModalChofer]       = useState(false);


  const refreshChoferes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('Choferes')
        .select('*')
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

      const recorridosPorZona: Record<ZonaKey, Recorrido[]> = {
        'ZONA OESTE': [], 'ZONA SUR': [], 'ZONA NORTE': [], 'CABA': [],
      };

      (data || []).forEach(rec => {
        const zona = rec.zona as ZonaKey;
        if (zona in recorridosPorZona) {
          recorridosPorZona[zona].push(rec);
        }
      });

      (Object.keys(recorridosPorZona) as ZonaKey[]).forEach(z => {
        recorridosPorZona[z].sort(compararRecorridoPorOrden);
      });

      setRecorridos(recorridosPorZona);
    } catch (err) {
      console.error('Error cargando recorridos:', err);
    }
  }, []);

  useEffect(() => {
    refreshChoferes();
  }, [refreshChoferes]);

  useEffect(() => {
    refreshRecorridos();
  }, [refreshRecorridos]);

  /**
   * Realtime: Recorridos + Choferes (INSERT / UPDATE / DELETE desde web u otros clientes).
   * Re-fetch con .order('orden') mantiene el mismo orden personalizado que la UI.
   */
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const schedule = (fn: () => void) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(fn, 320);
    };

    const channel = supabase
      .channel('logistica-public-sync')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'Recorridos' },
        () => schedule(refreshRecorridos),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'Recorridos' },
        () => schedule(refreshRecorridos),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'Recorridos' },
        () => schedule(refreshRecorridos),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'Choferes' },
        () => schedule(refreshChoferes),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'Choferes' },
        () => schedule(refreshChoferes),
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'Choferes' },
        () => schedule(refreshChoferes),
      )
      .subscribe();

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [refreshRecorridos, refreshChoferes]);

  const actualizarRecorrido = async (zona: ZonaKey, index: number, campo: string, valor: string) => {
    const recorridoAnterior = recorridos[zona][index];
    const copiaRecorrido = { ...recorridoAnterior };
    let valorFinal: any = valor;

    if (campo === 'pqteDia' || campo === 'porFuera' || campo === 'entregados') {
      valorFinal = parseInt(valor) || 0;
      (copiaRecorrido as any)[campo] = valorFinal;
    } else if (campo === 'idChofer') {
      valorFinal = parseInt(valor) || 0;
      copiaRecorrido.idChofer = valorFinal;
      const choferEncontrado = choferes.find(c => c.id === valorFinal);
      copiaRecorrido.chofer = choferEncontrado ? choferEncontrado.nombre : 'Sin Asignar';
    } else {
      (copiaRecorrido as any)[campo] = valorFinal;
    }

    setRecorridos(prev => {
      const copia = { ...prev, [zona]: [...prev[zona]] };
      copia[zona][index] = copiaRecorrido;
      return copia;
    });

    try {
      const idDb = recorridoAnterior.id;
      if (idDb) {
        await supabase.from('Recorridos').update({ 
            [campo]: valorFinal,
            ...(campo === 'idChofer' ? { chofer: copiaRecorrido.chofer } : {}) 
          }).eq('id', idDb);
      } else {
         await supabase.from('Recorridos').update({ 
             [campo]: valorFinal,
             ...(campo === 'idChofer' ? { chofer: copiaRecorrido.chofer } : {}) 
           }).match({ zona: zona, localidad: copiaRecorrido.localidad });
      }
    } catch (err) {
      console.error('Error actualizando:', err);
    }
  };

  const agregarRecorrido = async (zona: ZonaKey, localidad: string) => {
    const nuevoRecorrido = { zona, localidad, idChofer: 0, chofer: 'Sin Asignar', pqteDia: 0, porFuera: 0, entregados: 0 };
    
    // Primero actualizamos lo local para que lo veas ya
    setRecorridos(prev => {
      const list = [...prev[zona], nuevoRecorrido].sort(compararRecorridoPorOrden);
      return { ...prev, [zona]: list };
    });
    setModalRecorrido(false);

    try {
      await supabase.from('Recorridos').insert([nuevoRecorrido]);
    } catch (err) {
      console.error('Error insertando:', err);
    }
  };

  const actualizarChofer = async (id: number, campo: keyof Chofer, valor: string | number | string[]) => {
    let valorFinal: any = valor;
    if (campo === 'id') valorFinal = parseInt(valor as string) || id;

    setChoferes(prev =>
      ordenarChoferesPorOrden(prev.map(c => (c.id === id ? { ...c, [campo]: valorFinal } : c))),
    );

    try {
      await supabase.from('Choferes').update({ [campo]: valorFinal }).eq('id', id);
    } catch (err) {
      console.error('Error actualizando chofer:', err);
    }
  };

  const agregarChofer = async (chofer: Chofer) => {
    const choferSanitizado: Chofer = {
      ...chofer,
      zona: Array.isArray(chofer.zona) ? chofer.zona : [],
      vehiculo: Array.isArray(chofer.vehiculo) ? chofer.vehiculo : [],
    };
    
    setChoferes(prev => ordenarChoferesPorOrden([...prev, choferSanitizado]));
    setModalChofer(false);

    try {
      await supabase.from('Choferes').insert([choferSanitizado]);
    } catch (err) {
      console.error('Error insertando chofer:', err);
    }
  };

  const TITULOS: Record<PantallaActual, string> = {
    recorridos: 'Recorridos Activos',
    choferes:   'Gestión de Personal',
    mapa:       'Mapa de Zonas',
  };
  const ICONOS_PANTALLA: Record<PantallaActual, string> = {
    recorridos: '🚚',
    choferes:   '👥',
    mapa:       '🗺️',
  };

  return (
    <SafeAreaView style={S.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={S.header}>
        <View>
          <Text style={S.headerEyebrow}>GESTIÓN DE LOGÍSTICA</Text>
          <Text style={S.headerTitle}>
            {ICONOS_PANTALLA[pantalla]}  {TITULOS[pantalla]}
          </Text>
        </View>
        {pantalla === 'recorridos' && (
          <TouchableOpacity onPress={() => setModalRecorrido(true)} style={S.botonAgregar}>
            <Text style={S.botonAgregarTexto}>+</Text>
          </TouchableOpacity>
        )}
        {pantalla === 'choferes' && (
          <TouchableOpacity onPress={() => setModalChofer(true)} style={S.botonAgregar}>
            <Text style={S.botonAgregarTexto}>+</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Widget Colectas Pendientes ── */}
      {colectasPendientes != null && colectasPendientes > 0 && (
        <View style={S.widgetColectas}>
          <View style={S.widgetLeft}>
            <Text style={S.widgetEmoji}>📦</Text>
            <View>
              <Text style={S.widgetTitle}>
                ¡Hola! Tenés {colectasPendientes} colecta{colectasPendientes !== 1 ? 's' : ''} pendiente{colectasPendientes !== 1 ? 's' : ''} para hoy
              </Text>
              <Text style={S.widgetSub}>Tu lista de colectas te espera</Text>
            </View>
          </View>
          <TouchableOpacity
            style={S.widgetBtn}
            onPress={() => router.push('/(drawer)/colectas' as any)}
            activeOpacity={0.8}
          >
            <Text style={S.widgetBtnText}>Ver{`\n`}Colectas</Text>
          </TouchableOpacity>
        </View>
      )}

      {pantalla === 'recorridos' && (
        <RecorridosScreen recorridos={recorridos} choferes={choferes} onActualizar={actualizarRecorrido} />
      )}
      {pantalla === 'choferes' && <ChoferesScreen choferes={choferes} onActualizar={actualizarChofer} />}
      {pantalla === 'mapa' && <MapaScreen />}

      <ModalAgregarRecorrido visible={modalRecorrido} onCerrar={() => setModalRecorrido(false)} onGuardar={agregarRecorrido} />
      <ModalAgregarChofer visible={modalChofer} onCerrar={() => setModalChofer(false)} onGuardar={agregarChofer} />

    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────

const S = StyleSheet.create({
  safeArea:         { flex: 1, backgroundColor: '#0a0f1e' },
  container:        { flex: 1, padding: 15 },
  header: {
    padding: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#1a2540',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0d1526',
  },
  headerEyebrow:    { color: '#3b82f6', fontSize: 10, fontWeight: 'bold', letterSpacing: 2, marginBottom: 4 },
  headerTitle:      { color: '#f1f5f9', fontSize: 20, fontWeight: 'bold' },
  botonAgregar: {
    backgroundColor: '#3b82f6',
    width: 44, height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  botonAgregarTexto: { color: '#fff', fontSize: 26, fontWeight: 'bold', lineHeight: 30 },

  // Widget colectas pendientes
  widgetColectas: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#0d2240',
    borderWidth: 1, borderColor: 'rgba(79,142,247,0.35)',
    borderRadius: 16, marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    padding: 14,
  },
  widgetLeft:    { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  widgetEmoji:   { fontSize: 28 },
  widgetTitle:   { fontSize: 13, fontWeight: '700', color: '#FFFFFF', flexShrink: 1 },
  widgetSub:     { fontSize: 11, color: '#4A6FA5', marginTop: 2 },
  widgetBtn: {
    backgroundColor: '#3b82f6',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    alignItems: 'center', marginLeft: 10,
  },
  widgetBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', textAlign: 'center', lineHeight: 16 },
  tablaContainer:   { marginBottom: 24 },
  zonaHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    paddingLeft: 12,
    borderLeftWidth: 3,
  },
  zonaFlecha:       { fontSize: 14, fontWeight: 'bold', marginRight: 10 },
  zonaHeader:       { fontSize: 16, fontWeight: 'bold', flex: 1 },
  zonaBadge: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  zonaBadgeTexto:   { fontSize: 10, fontWeight: 'bold' },
  scrollHorizontal: { backgroundColor: '#111827', borderRadius: 10, borderWidth: 1, borderColor: '#1e2d45' },
  filaTabla:        { flexDirection: 'row' },
  filaHeader:       { backgroundColor: '#0d1526' },
  filaAlternada:    { backgroundColor: '#0f1b2d' },
  celdaHeader:      { width: 100, padding: 10, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1e2d45' },
  textoHeader:      { color: '#94a3b8', fontSize: 10, fontWeight: 'bold', textAlign: 'center', letterSpacing: 0.5 },
  celda:            { width: 100, padding: 10, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#1a2540' },
  textoCelda:       { color: '#e2e8f0', fontSize: 13, textAlign: 'center' },
  inputTabla: {
    backgroundColor: 'transparent',
    color: '#fff',
    textAlign: 'center',
    fontSize: 13,
    width: '100%',
    paddingVertical: 2,
  },
  porcentaje:       { fontSize: 13, fontWeight: 'bold', textAlign: 'center' },
  buscadorContainer: { padding: 15, paddingBottom: 5 },
  inputBusqueda: {
    backgroundColor: '#111827',
    color: '#fff',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e2d45',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#111827',
    borderRadius: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#1e2d45',
    overflow: 'hidden',
  },
  cardHeader:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16 },
  nombreChofer:     { color: '#f1f5f9', fontSize: 17, fontWeight: 'bold' },
  idSubtitulo:      { color: '#64748b', fontSize: 12, marginTop: 2 },
  icono:            { fontSize: 16 },
  fichaTecnica:     { padding: 16, backgroundColor: '#0d1526' },
  divisor:          { height: 1, backgroundColor: '#1e2d45', marginBottom: 14 },
  fila:             { flexDirection: 'row', marginBottom: 4 },
  label:            { color: '#64748b', fontSize: 10, fontWeight: 'bold', marginBottom: 4, marginTop: 10, letterSpacing: 1 },
  inputFicha: {
    backgroundColor: '#0a0f1e',
    color: '#f1f5f9',
    padding: 12,
    borderRadius: 8,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#1e2d45',
  },
  selectorRow:      { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  chip: {
    backgroundColor: '#111827',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#1e2d45',
  },
  chipTexto:        { color: '#f1f5f9', fontSize: 11, fontWeight: 'bold' },
  botonGuardar: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  botonGuardarTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  inputMapa: {
    flex: 1,
    backgroundColor: '#111827',
    color: '#fff',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1e2d45',
  },
  botonBuscarMapa: {
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    paddingHorizontal: 20,
    borderRadius: 10,
    marginLeft: 10,
  },
  botonBuscarMapaTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  mapaContainer: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1e2d45',
  },
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  bottomSheet: {
    backgroundColor: '#0d1526',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 6,
    paddingBottom: 40,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderColor: '#1e2d45',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1e2d45',
    marginBottom: 16,
  },
  modalTitulo:      { color: '#f1f5f9', fontSize: 18, fontWeight: 'bold' },
  modalSubtitulo:   { color: '#64748b', fontSize: 12, marginTop: 3 },
  botonCerrar: {
    width: 32, height: 32,
    borderRadius: 16,
    backgroundColor: '#1e2d45',
    justifyContent: 'center',
    alignItems: 'center',
  },
  botonCerrarTexto: { color: '#94a3b8', fontSize: 14, fontWeight: 'bold' },
  pasoContainer:    { paddingBottom: 10 },
  gridZonas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  botonZona: {
    width: '48%',
    backgroundColor: '#111827',
    borderWidth: 1,
    borderRadius: 14,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  botonZonaIcono:   { fontSize: 28, marginBottom: 8 },
  botonZonaTexto:   { fontSize: 14, fontWeight: 'bold' },
  botonVolver: {
    alignSelf: 'flex-start',
    marginBottom: 14,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  botonVolverTexto: { color: '#60a5fa', fontSize: 13 },
  zonaBadgeGrande: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 16,
  },
  zonaBadgeGrandeIcono: { fontSize: 20, marginRight: 8 },
  zonaBadgeGrandeTexto: { fontSize: 15, fontWeight: 'bold' },
  labelInfo: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 10,
    marginBottom: 4,
    lineHeight: 16,
  },

});