// app/(drawer)/guia.tsx
// ─────────────────────────────────────────────────────────────────────────
// "Cómo se mide" (chofer) — guía educativa, réplica de PantallaComoFunciona de
// la web. Explica las dos notas (Rendimiento/KPI y Desempeño), los indicadores
// (+/−), las ausencias y el SLA. Usa POSITIVOS/NEGATIVOS de lib/desempeno para
// quedar siempre en sync con el motor.
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  HORA_CORTE_AUSENCIA, NEGATIVOS, POSITIVOS, SLA_MINIMO,
} from '../../lib/desempeno';
import { useTheme } from '../../lib/ThemeContext';
import { useRoleGuard } from '../_hooks/useRoleGuard';

export default function GuiaScreen() {
  const { colors } = useTheme();
  const { autorizado, verificando } = useRoleGuard('chofer');

  if (verificando) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!autorizado) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const Card = ({ children, color }: { children: React.ReactNode; color: string }) => (
    <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, borderTopColor: color, borderTopWidth: 3 }]}>
      {children}
    </View>
  );
  const Title = ({ icon, text, color }: { icon: any; text: string; color: string }) => (
    <View style={styles.cardHead}>
      <Ionicons name={icon} size={18} color={color} />
      <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{text}</Text>
    </View>
  );
  const P = ({ children }: { children: React.ReactNode }) => (
    <Text style={[styles.p, { color: colors.textMuted }]}>{children}</Text>
  );

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingTop: 18 }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.blueSubtle }]}>
          <Ionicons name="help-buoy-outline" size={22} color={colors.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: colors.textPrimary }]}>Cómo se mide</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>Tu nota se arma con dos cosas independientes</Text>
        </View>
      </View>

      {/* Rendimiento (KPI) */}
      <Card color={colors.blue}>
        <Title icon="stats-chart-outline" text="1) Rendimiento (KPI)" color={colors.blue} />
        <P>Sale de Light Data. Mide cuántos paquetes entregaste bien:</P>
        <View style={[styles.formula, { backgroundColor: colors.bgInput, borderColor: colors.border }]}>
          <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 13.5, textAlign: 'center' }}>
            Entregados ÷ (Entregados + Demorados) × 100
          </Text>
        </View>
        <P>Lo bajan los <Text style={{ color: colors.red, fontWeight: '800' }}>demorados</Text>: fallos, en camino, “nadie” pasadas las 21hs, reprogramados/cancelados tarde y no entregados.</P>
      </Card>

      {/* Desempeño */}
      <Card color={colors.green}>
        <Title icon="speedometer-outline" text="2) Desempeño (conducta)" color={colors.green} />
        <P>Arranca en <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>100%</Text>. Cada acción suma o resta <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>0,1%</Text>. El tope es 100% (los positivos de más quedan como colchón ante errores futuros) y el piso 0%.</P>
        <P>Los demorados <Text style={{ fontWeight: '800' }}>no</Text> afectan esta nota (esos van al KPI). Las ausencias sí restan (ver abajo).</P>
      </Card>

      {/* Positivos */}
      <Card color={colors.green}>
        <Title icon="trending-up-outline" text="Suman (+0,1% c/u)" color={colors.green} />
        {POSITIVOS.map((i) => (
          <View key={i.key} style={styles.liRow}>
            <Ionicons name="add-circle" size={15} color={colors.green} />
            <Text style={[styles.li, { color: colors.textSecondary }]}>{i.label}</Text>
          </View>
        ))}
      </Card>

      {/* Negativos */}
      <Card color={colors.red}>
        <Title icon="trending-down-outline" text="Restan (−0,1% c/u)" color={colors.red} />
        {NEGATIVOS.map((i) => (
          <View key={i.key} style={styles.liRow}>
            <Ionicons name="remove-circle" size={15} color={colors.red} />
            <Text style={[styles.li, { color: colors.textSecondary }]}>{i.label}</Text>
          </View>
        ))}
      </Card>

      {/* Ausencias */}
      <Card color={colors.amber}>
        <Title icon="calendar-clear-outline" text="Ausencias" color={colors.amber} />
        <P>Si te bajás de una colecta o recorrido:</P>
        <View style={styles.liRow}>
          <Ionicons name="time-outline" size={15} color={colors.amber} />
          <Text style={[styles.li, { color: colors.textSecondary }]}>Antes de las {HORA_CORTE_AUSENCIA}:00 → <Text style={{ color: colors.amber, fontWeight: '800' }}>−0,1%</Text></Text>
        </View>
        <View style={styles.liRow}>
          <Ionicons name="time-outline" size={15} color={colors.red} />
          <Text style={[styles.li, { color: colors.textSecondary }]}>Desde las {HORA_CORTE_AUSENCIA}:00 → <Text style={{ color: colors.red, fontWeight: '800' }}>−0,5%</Text> (avisar tarde desorganiza más)</Text>
        </View>
      </Card>

      {/* SLA */}
      <Card color={colors.purple}>
        <Title icon="shield-checkmark-outline" text="Meta (SLA)" color={colors.purple} />
        <P>Las dos notas tienen que estar en <Text style={{ color: colors.green, fontWeight: '800' }}>≥ {SLA_MINIMO}%</Text> para estar “en verde”. Mantené el rendimiento alto y cuidá la conducta. 💪</P>
      </Card>

      <View style={{ height: 30 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 18 },
  headerIcon: { width: 44, height: 44, borderRadius: 13, justifyContent: 'center', alignItems: 'center' },
  h1: { fontSize: 22, fontWeight: '800' },
  sub: { fontSize: 13, marginTop: 2 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { fontSize: 16, fontWeight: '800' },
  p: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
  formula: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 10 },
  liRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 7 },
  li: { flex: 1, fontSize: 13, lineHeight: 18 },
});
