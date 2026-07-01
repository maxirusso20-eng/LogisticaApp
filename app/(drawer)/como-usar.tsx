// app/(drawer)/como-usar.tsx
// ─────────────────────────────────────────────────────────────────────────
// "Cómo usar la app" (chofer) — guía de USO: para qué sirve cada pantalla del
// menú. Distinta de "Cómo se mide" (que explica los KPIs). Réplica de
// PantallaComoUsar de la web/PWA.
// ─────────────────────────────────────────────────────────────────────────
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../lib/ThemeContext';
import { useRoleGuard } from '../_hooks/useRoleGuard';

const PANTALLAS: { icon: any; color: string; titulo: string; desc: string }[] = [
  { icon: 'clipboard-outline', color: '#3b82f6', titulo: 'Panel del Día',
    desc: 'Tu resumen del día: lo que tenés para hacer hoy de un vistazo. Es tu pantalla de inicio.' },
  { icon: 'cube-outline', color: '#10b981', titulo: 'Mis Colectas',
    desc: 'Las colectas que te asignaron para hoy, con dirección y horario. Cuando retirás una, tocá para marcarla como hecha (queda en verde). La central lo ve al instante — si te equivocaste, tocás de nuevo y se desmarca.' },
  { icon: 'stats-chart-outline', color: '#8b5cf6', titulo: 'Mi Rendimiento',
    desc: 'Tus dos notas: el Rendimiento (KPI) — que sale de cómo entregás los paquetes — y el Desempeño — tu conducta y operativa. Acá ves cómo venís en cada una.' },
  { icon: 'trophy-outline', color: '#f59e0b', titulo: 'Ranking',
    desc: 'Tu posición en la flota comparado con el resto de los choferes.' },
  { icon: 'calendar-clear-outline', color: '#ef4444', titulo: 'Mis Faltas',
    desc: 'Tus avisos y ausencias (cuando no venís a una colecta o recorrido) y cuánto te descuentan del Desempeño según la hora en que avisaste.' },
  { icon: 'chatbubbles-outline', color: '#06b6d4', titulo: 'Chat',
    desc: 'Tu línea directa con la central. Por acá recibís tus colectas y avisos, y podés escribir cualquier cosa que necesites.' },
];

export default function ComoUsarScreen() {
  const { colors } = useTheme();
  const { autorizado, verificando } = useRoleGuard('chofer');

  if (verificando) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!autorizado) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingTop: 18 }}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: colors.blueSubtle }]}>
          <Ionicons name="compass-outline" size={22} color={colors.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.h1, { color: colors.textPrimary }]}>Cómo usar la app</Text>
          <Text style={[styles.sub, { color: colors.textMuted }]}>Para qué sirve cada pantalla del menú</Text>
        </View>
      </View>

      {/* Cards por pantalla */}
      <View style={{ gap: 12 }}>
        {PANTALLAS.map((p) => (
          <View key={p.titulo} style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.border, borderLeftColor: p.color, borderLeftWidth: 3 }]}>
            <View style={[styles.cardIcon, { backgroundColor: p.color + '1a' }]}>
              <Ionicons name={p.icon} size={20} color={p.color} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{p.titulo}</Text>
              <Text style={[styles.cardDesc, { color: colors.textMuted }]}>{p.desc}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Ayuda / contacto */}
      <View style={[styles.ayuda, { backgroundColor: colors.purple + '14', borderColor: colors.purple + '4d' }]}>
        <Ionicons name="help-buoy-outline" size={22} color={colors.purple} />
        <Text style={{ flex: 1, fontSize: 13, color: colors.textPrimary, lineHeight: 20 }}>
          <Text style={{ fontWeight: '800' }}>¿Algún problema o duda?</Text> Escribile a <Text style={{ fontWeight: '800' }}>Maxi</Text> por el <Text style={{ fontWeight: '800' }}>Chat</Text> 💬 y te ayuda.
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
  card: { flexDirection: 'row', gap: 13, alignItems: 'flex-start', borderWidth: 1, borderRadius: 14, padding: 15 },
  cardIcon: { width: 40, height: 40, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 3 },
  cardDesc: { fontSize: 13, lineHeight: 20 },
  ayuda: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', borderWidth: 1, borderRadius: 14, padding: 16, marginTop: 16 },
});
