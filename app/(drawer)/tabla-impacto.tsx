// app/(drawer)/tabla-impacto.tsx
// ─────────────────────────────────────────────────────────────────────────
// "Impacto de cada ítem" — referencia única de cuánto suma/resta cada cosa,
// separado por las dos notas (KPI Rendimiento y Desempeño). Réplica de
// PantallaTablaImpacto de la web. Se alimenta de los arrays de lib/desempeno
// para no desincronizarse con el motor de cálculo. Visible para todos.
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  AVISOS, NEGATIVOS, PESO_PUNTO, POSITIVOS, SLA_MINIMO,
} from '../../lib/desempeno';
import { useTheme } from '../../lib/ThemeContext';
import { useRoleGuard } from '../_hooks/useRoleGuard';

const KPI_FACTORES = [
  { label: 'En camino al destinatario', detalle: 'Demorado grave: quedó en ruta', valor: -0.5 },
  { label: 'Nadie / cancelado / reprogramado (+21hs)', detalle: 'Demorado leve (post-21)', valor: -0.2 },
  { label: 'Entrega tardía (21:00–23:05hs)', detalle: 'Entregado fuera de horario — solo informativo, no penaliza', valor: 0, valorTexto: 'no resta' },
  { label: 'Pendiente con observación', detalle: 'Documentó un pendiente en Light Data', valor: 0.1 },
];

export default function TablaImpactoScreen() {
  const { colors } = useTheme();
  const { autorizado, verificando } = useRoleGuard('admin');

  const colorValor = (v: number) => (v > 0 ? colors.green : v < 0 ? colors.red : colors.textMuted);
  const fmtSigno = (v: number) => `${v > 0 ? '+' : ''}${v}%`;

  const Fila = ({ label, detalle, valor, valorTexto }: { label: string; detalle?: string; valor: number; valorTexto?: string }) => {
    const col = colorValor(valor);
    return (
      <View style={[styles.fila, { borderColor: colors.borderSubtle }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13.5, fontWeight: '600', color: colors.textPrimary }}>{label}</Text>
          {detalle ? <Text style={{ fontSize: 11.5, color: colors.textMuted, marginTop: 2 }}>{detalle}</Text> : null}
        </View>
        <View style={[styles.badge, { backgroundColor: col + '1a', borderColor: col + '44' }]}>
          <Text style={{ fontSize: 12.5, fontWeight: '800', color: col }}>{valorTexto ?? fmtSigno(valor)}</Text>
        </View>
      </View>
    );
  };

  const Card = ({ icon, color, titulo, sub, children }: { icon: any; color: string; titulo: string; sub?: string; children: React.ReactNode }) => (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, borderTopColor: color, borderTopWidth: 3 }]}>
      <View style={styles.cardHead}>
        <View style={[styles.cardIcon, { backgroundColor: color + '1a' }]}>
          <Ionicons name={icon} size={17} color={color} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{titulo}</Text>
      </View>
      {sub ? <Text style={[styles.sub2, { color: colors.textMuted }]}>{sub}</Text> : null}
      {children}
    </View>
  );

  if (verificando || !autorizado) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingTop: 18 }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.purple + '22' }]}>
          <Ionicons name="calculator-outline" size={22} color={colors.purple} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: colors.textPrimary }]}>Impacto de cada ítem</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>Cuánto suma o resta cada cosa en tus dos notas</Text>
        </View>
      </View>

      {/* Intro */}
      <View style={[styles.intro, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
        <Text style={{ fontSize: 12.5, color: colors.textMuted, lineHeight: 19 }}>
          Tenés <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>dos notas</Text>. El <Text style={{ color: colors.blue, fontWeight: '800' }}>Rendimiento (KPI)</Text> sale de Light Data. El <Text style={{ color: colors.green, fontWeight: '800' }}>Desempeño</Text> lo carga administración. Las dos arrancan en <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>100%</Text> y la meta es <Text style={{ color: colors.green, fontWeight: '800' }}>≥ {SLA_MINIMO}%</Text>.
        </Text>
      </View>

      <Card icon="stats-chart-outline" color={colors.blue} titulo="Rendimiento (KPI)" sub="Arranca en 100%. Los demorados y entregas tardías lo bajan; las observaciones lo suben.">
        {KPI_FACTORES.map((f) => <Fila key={f.label} {...f} />)}
      </Card>

      {POSITIVOS.length > 0 && (
        <Card icon="trending-up-outline" color={colors.green} titulo="Desempeño · Suman" sub={`Cada acierto suma +${PESO_PUNTO.toFixed(1)}% (tope 100%).`}>
          {POSITIVOS.map((i) => <Fila key={i.key} label={i.label} valor={PESO_PUNTO} />)}
        </Card>
      )}

      <Card icon="trending-down-outline" color={colors.red} titulo="Desempeño · Restan" sub={`Cada error resta −${PESO_PUNTO.toFixed(1)}%.`}>
        {NEGATIVOS.map((i) => <Fila key={i.key} label={i.label} valor={-PESO_PUNTO} />)}
      </Card>

      <Card icon="time-outline" color={colors.amber} titulo="Desempeño · Avisos" sub="No colectar / no salir en recorrido. Cuanto más tarde, más resta.">
        {AVISOS.map((a) => <Fila key={a.key} label={a.label} valor={-a.peso} />)}
      </Card>

      {/* SLA */}
      <View style={[styles.sla, { backgroundColor: colors.green + '14', borderColor: colors.green + '44' }]}>
        <Ionicons name="shield-checkmark-outline" size={20} color={colors.green} />
        <Text style={{ flex: 1, fontSize: 13, color: colors.textPrimary, lineHeight: 19 }}>
          <Text style={{ fontWeight: '800' }}>Meta (SLA):</Text> las dos notas en <Text style={{ color: colors.green, fontWeight: '800' }}>≥ {SLA_MINIMO}%</Text> para estar en verde.
        </Text>
      </View>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 16 },
  headerIcon: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2 },
  intro: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 14 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  cardIcon: { width: 34, height: 34, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  sub2: { fontSize: 12.5, lineHeight: 18, marginBottom: 8 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1 },
  badge: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 99, borderWidth: 1 },
  sla: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
});
