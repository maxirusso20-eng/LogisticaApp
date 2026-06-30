// app/(drawer)/ayuda.tsx
// ─────────────────────────────────────────────────────────────────────────
// "Guía de la app" (admin) — réplica de PantallaGuiaApp de la web. Explica TODO
// lo que hace la app, por secciones colapsables + buscador. Contenido en datos
// (SECCIONES) para editarlo fácil.
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { useRoleGuard } from '../_hooks/useRoleGuard';

type Item = [string, string];
type Seccion = { id: string; titulo: string; icon: any; color: string; desc: string; items: Item[] };

const SECCIONES: Seccion[] = [
  {
    id: 'clientes', titulo: 'Clientes / Colectas', icon: 'business-outline', color: '#10b981',
    desc: 'El corazón operativo: las colectas del día, su chofer y el envío.',
    items: [
      ['Pestañas Semana / Sábados', 'Separan las colectas de días de semana y las de sábado.'],
      ['Asignar chofer', 'Tocás la fila y elegís el chofer de esa colecta.'],
      ['Enviar colecta (✈️)', 'Le manda esa colecta al chat del chofer y la marca en verde.'],
      ['Enviar colectas a todos', 'Un mensaje por chofer con todas sus colectas del día.'],
      ['Tilde verde', 'Las colectas enviadas quedan en verde; se sincroniza en vivo con la web.'],
    ],
  },
  {
    id: 'recorridos', titulo: 'Recorridos', icon: 'bus-outline', color: '#8b5cf6',
    desc: 'Armado y orden de los recorridos por localidad y chofer.',
    items: [
      ['Orden por localidad', 'Organizás las localidades y sus paquetes.'],
      ['Chofer por recorrido', 'Asignás quién hace cada recorrido.'],
    ],
  },
  {
    id: 'choferes', titulo: 'Choferes', icon: 'people-outline', color: '#f59e0b',
    desc: 'Alta y gestión de choferes y su acceso a la app/web.',
    items: [
      ['Ficha del chofer', 'Nombre, DNI, celular, zona, vehículo, condición, dirección.'],
      ['Email de acceso', 'Se autocompleta del nombre (nombre.apellido@hogareno.com). Con él entra y ve su rendimiento.'],
      ['Filtros', 'Por condición: Titulares, Semititulares, Suplentes, Colectadores.'],
      ['WhatsApp / Maps', 'Tocás el celular para WhatsApp o la dirección para abrir el mapa.'],
    ],
  },
  {
    id: 'mapa', titulo: 'Mapa de Rutas', icon: 'map-outline', color: '#06b6d4',
    desc: 'Visualización geográfica de la operación.',
    items: [
      ['Zonas y clientes', 'Ubicación de las colectas y zonas.'],
      ['Ubicación en vivo', 'Si el chofer comparte ubicación, se ve su posición.'],
    ],
  },
  {
    id: 'chat', titulo: 'Chat y Notificaciones', icon: 'chatbubbles-outline', color: '#3b82f6',
    desc: 'Mensajería entre administración y choferes + avisos push.',
    items: [
      ['Chat admin ↔ chofer', 'El chofer recibe sus colectas y avisos acá.'],
      ['Push', 'Le llega la notificación al celular aunque la app esté cerrada.'],
    ],
  },
  {
    id: 'estadisticas', titulo: 'Estadísticas (Rendimiento / KPI)', icon: 'bar-chart-outline', color: '#8b5cf6',
    desc: 'La reputación de cada chofer según Light Data.',
    items: [
      ['Reputación (KPI)', 'Entregados ÷ (Entregados + Demorados) × 100. Los demorados la bajan.'],
      ['Card por chofer', 'Reputación + Desempeño + desglose de envíos (tocá para expandir).'],
      ['Meta (SLA)', 'La meta es ≥ 99% (verde).'],
    ],
  },
  {
    id: 'desempeno', titulo: 'Desempeño (conducta)', icon: 'speedometer-outline', color: '#10b981',
    desc: 'Segunda nota, de carga manual. Arranca en 100%.',
    items: [
      ['Indicadores +/−', 'Cada acción positiva o negativa mueve ±0,1%.'],
      ['Carga diaria', 'Elegís chofer + fecha y ajustás los contadores. Se acumula entre fechas.'],
      ['Tope 100%', 'Los positivos de más quedan como colchón ante errores futuros.'],
    ],
  },
  {
    id: 'ausencias', titulo: 'Faltas (Avisos)', icon: 'calendar-clear-outline', color: '#ef4444',
    desc: 'Cuando un chofer no viene a un recorrido o colecta.',
    items: [
      ['Carga (admin)', 'En Desempeño se cargan como Avisos, según el horario en que avisó (no recorrido / no colecta).'],
      ['Penalización', 'No recorrido: 8–10hs −0,1% · 10–12hs −0,5% · post 12hs −2,0%. No colecta: post 10hs −0,1% · post 12hs −0,5%.'],
      ['Mis Faltas (chofer)', 'El chofer ve sus avisos/faltas y el impacto en su nota.'],
    ],
  },
  {
    id: 'rankings', titulo: 'Rankings', icon: 'trophy-outline', color: '#f59e0b',
    desc: 'Comparativas de la flota.',
    items: [
      ['Ranking de la flota', 'Ordena a los choferes por reputación.'],
    ],
  },
  {
    id: 'accesos', titulo: 'Accesos (Roles)', icon: 'shield-checkmark-outline', color: '#ef4444',
    desc: 'Quién entra y con qué permisos.',
    items: [
      ['Roles', 'Admin y chofer ven pantallas distintas.'],
      ['Seguridad', 'Las escrituras sensibles están protegidas por rol en la base.'],
    ],
  },
  {
    id: 'automatizacion', titulo: 'Envíos automáticos de colectas', icon: 'paper-plane-outline', color: '#3b82f6',
    desc: 'El "bot" gratis que avisa las colectas solo.',
    items: [
      ['Lunes a viernes 9:30', 'Le manda a cada chofer sus colectas de Semana por chat + push.'],
      ['Viernes 21:00', 'Le manda a cada chofer sus colectas del Sábado.'],
      ['No reenvía lo ya enviado', 'Si ya mandaste una colecta a mano esa mañana (verde), el automático no la repite.'],
    ],
  },
  {
    id: 'chofer', titulo: 'Qué ve el chofer', icon: 'person-outline', color: '#a78bfa',
    desc: 'La vista del conductor.',
    items: [
      ['Panel del Día', 'Sus colectas y tareas del día.'],
      ['Mi Rendimiento', 'Sus dos notas (KPI + Desempeño) y el desglose.'],
      ['Ranking', 'Su posición en la flota.'],
      ['Mis Faltas', 'Sus avisos/faltas y el impacto en su nota.'],
      ['Cómo se mide', 'Guía que explica los KPIs e indicadores.'],
      ['Chat', 'Recibe colectas y avisos.'],
    ],
  },
];

export default function AyudaScreen() {
  const { colors } = useTheme();
  const { autorizado, verificando } = useRoleGuard('admin');
  const [abiertas, setAbiertas] = useState<Record<string, boolean>>({ clientes: true });
  const [q, setQ] = useState('');

  const buscando = q.trim().length > 0;
  const term = q.trim().toLowerCase();

  const filtradas = useMemo(() => {
    if (!term) return SECCIONES;
    return SECCIONES
      .map((s) => {
        const items = s.items.filter(([t, d]) => t.toLowerCase().includes(term) || d.toLowerCase().includes(term));
        const matchSec = s.titulo.toLowerCase().includes(term) || s.desc.toLowerCase().includes(term);
        return matchSec ? s : (items.length ? { ...s, items } : null);
      })
      .filter(Boolean) as Seccion[];
  }, [term]);

  if (verificando) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!autorizado) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const toggle = (id: string) => setAbiertas((p) => ({ ...p, [id]: !p[id] }));

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingTop: 18 }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.blueSubtle }]}>
          <Ionicons name="book-outline" size={22} color={colors.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: colors.textPrimary }]}>Guía de la app</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>Todo lo que hace la app, por área</Text>
        </View>
      </View>

      {/* Buscador */}
      <View style={[styles.search, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={{ flex: 1, color: colors.textPrimary, fontSize: 14, padding: 0 }}
          placeholder="Buscar… (ej: ausencias, push, enviar)"
          placeholderTextColor={colors.textPlaceholder}
          value={q} onChangeText={setQ}
        />
        {q ? <TouchableOpacity onPress={() => setQ('')}><Ionicons name="close-circle" size={18} color={colors.textMuted} /></TouchableOpacity> : null}
      </View>

      {/* Secciones */}
      {filtradas.length === 0 && (
        <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 30 }}>Sin resultados para “{q}”.</Text>
      )}
      {filtradas.map((s) => {
        const open = buscando || !!abiertas[s.id];
        return (
          <View key={s.id} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border }]}>
            <TouchableOpacity onPress={() => toggle(s.id)} activeOpacity={0.7} style={styles.cardHead}>
              <View style={[styles.cardIcon, { backgroundColor: s.color + '22' }]}>
                <Ionicons name={s.icon} size={18} color={s.color} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{s.titulo}</Text>
                <Text style={[styles.cardDesc, { color: colors.textMuted }]}>{s.desc}</Text>
              </View>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
            </TouchableOpacity>
            {open && (
              <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
                {s.items.map(([t, d], i) => (
                  <View key={i} style={[styles.item, { backgroundColor: colors.bgInput, borderLeftColor: s.color }]}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: colors.textPrimary, marginBottom: 2 }}>{t}</Text>
                    <Text style={{ fontSize: 12.5, color: colors.textMuted, lineHeight: 18 }}>{d}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 16 },
  headerIcon: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 14 },
  card: { borderWidth: 1, borderRadius: 14, marginBottom: 10, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  cardIcon: { width: 38, height: 38, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800' },
  cardDesc: { fontSize: 12.5, marginTop: 1 },
  item: { padding: 11, borderRadius: 9, borderLeftWidth: 3 },
});
