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
  AVISOS, NEGATIVOS, SLA_MINIMO,
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
        <P>Sale de Light Data. Arranca en <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>100%</Text> y le restan los demorados y las entregas tardías:</P>
        {[
          { label: 'Demorado', val: '−0,5%', color: colors.red },
          { label: 'Nadie / cancelado / no entregado / cancelado post 21hs', val: '−0,2%', color: colors.red },
          { label: 'Entregas post 21hs (21hs - 23:00hs)', val: '−0,05%', color: colors.amber },
          { label: 'Demorado CON observación', val: '+0,1%', color: colors.green },
          { label: 'Demorado SIN observación', val: '−0,1%', color: colors.red },
        ].map((r) => (
          <View key={r.label} style={[styles.penalRow, { backgroundColor: `${r.color}14`, borderColor: `${r.color}33` }]}>
            <Text style={[styles.penalLabel, { color: colors.textSecondary }]}>{r.label}</Text>
            <Text style={[styles.penalVal, { color: r.color }]}>{r.val}</Text>
          </View>
        ))}
      </Card>

      {/* Desempeño */}
      <Card color={colors.green}>
        <Title icon="speedometer-outline" text="2) Desempeño (conducta)" color={colors.green} />
        <P>Arranca en <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>100%</Text> y cada error resta <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>0,1%</Text>. Los avisos de ausencias también impactan en esta nota.</P>
        <P>Los demorados <Text style={{ fontWeight: '800' }}>no</Text> afectan esta nota (esos van al KPI). Es solo tu conducta operativa.</P>
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

      {/* Avisos de ausencia */}
      <Card color={colors.amber}>
        <Title icon="notifications-off-outline" text="Avisos de ausencia" color={colors.amber} />
        {AVISOS.map((a) => (
          <View key={a.key} style={styles.liRow}>
            <Text style={{ width: 56, textAlign: 'center', color: colors.amber, fontWeight: '800', fontSize: 12 }}>−{a.peso}%</Text>
            <Text style={[styles.li, { color: colors.textSecondary }]}>{a.label}</Text>
          </View>
        ))}
      </Card>



      {/* SLA */}
      <Card color={colors.purple}>
        <Title icon="shield-checkmark-outline" text="Meta (SLA)" color={colors.purple} />
        <P>Las dos notas tienen que estar en <Text style={{ color: colors.green, fontWeight: '800' }}>≥ {SLA_MINIMO}%</Text> para estar “en verde”. Mantené el rendimiento alto y cuidá la conducta. 💪</P>
      </Card>

      <View style={{ height: 1, backgroundColor: colors.borderSubtle, marginHorizontal: 8, marginTop: 10, marginBottom: 30 }} />
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
  penalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 11, marginBottom: 6 },
  penalLabel: { fontSize: 12.5, flex: 1 },
  penalVal: { fontSize: 12.5, fontWeight: '800' },
  liRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 7 },
  li: { flex: 1, fontSize: 13, lineHeight: 18 },
});
