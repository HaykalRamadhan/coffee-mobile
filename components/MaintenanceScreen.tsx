import { Ionicons } from "@expo/vector-icons";
import {
  StyleSheet,
  Text as NativeText,
  View,
  useWindowDimensions,
  type TextProps,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const COLORS = {
  ink: "#153F32",
  cream: "#DEE0DF",
  orange: "#D4A62A",
  yellow: "#E2B52F",
  green: "#204C3B",
  muted: "#526659",
  white: "#FFFFFF",
};

function Text({ maxFontSizeMultiplier = 1.2, ...props }: TextProps) {
  return <NativeText maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} />;
}

export function MaintenanceScreen({ message }: { message: string }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const compact = width < 350;

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.safeArea}>
      <View style={styles.backgroundBoltTop}><Text style={styles.backgroundBolt}>ϟ</Text></View>
      <View style={styles.backgroundBoltBottom}><Text style={styles.backgroundBolt}>ϟ</Text></View>

      <View style={[styles.content, { paddingTop: 40 + insets.top }]}>
        <View style={styles.brandRow}>
          <View style={styles.logoMark}><Text style={styles.logoBolt}>ϟ</Text></View>
          <View>
            <Text style={styles.logo} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>Kopi POW!</Text>
            <Text style={styles.logoLine}>99% REAAAADY TO GOW</Text>
          </View>
        </View>

        <View style={[styles.maintenanceCard, compact && styles.maintenanceCardCompact]}>
          <View style={styles.iconBurst}>
            <Ionicons name="construct-outline" size={compact ? 48 : 58} color={COLORS.green} />
            <View style={styles.sparkOne}><Text style={styles.sparkText}>ϟ</Text></View>
            <View style={styles.sparkTwo}><Text style={styles.sparkText}>ϟ</Text></View>
          </View>

          <View style={styles.statusPill}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText}>TEMPORARILY RECHARGING</Text>
          </View>

          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.72}>
            KopiPow is getting a power-up!
          </Text>
          <Text style={styles.message}>{message}</Text>

          <View style={styles.divider} />

          <View style={styles.footerRow}>
            <View style={styles.footerIcon}>
              <Ionicons name="cafe-outline" size={20} color={COLORS.green} />
            </View>
            <View style={styles.footerCopy}>
              <Text style={styles.footerTitle}>Thanks for your patience.</Text>
              <Text style={styles.footerText}>Your next power-up will be worth the wait.</Text>
            </View>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.cream, overflow: "hidden" },
  content: { flex: 1, paddingHorizontal: 22, paddingTop: 40, paddingBottom: 28 },
  brandRow: { flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 11, zIndex: 2 },
  logoMark: { width: 66, height: 66, borderRadius: 15, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  logoBolt: { color: COLORS.green, fontSize: 66, lineHeight: 40.5, fontWeight: "900" },
  logo: { color: COLORS.ink, fontSize: 56, fontWeight: "900", fontStyle: "italic", letterSpacing: -1.5 },
  logoLine: { color: COLORS.muted, fontSize: 17.5, fontWeight: "900", letterSpacing: 1.8, marginTop: 1 },
  maintenanceCard: { flex: 1, maxHeight: 570, width: "100%", maxWidth: 430, alignSelf: "center", justifyContent: "center", backgroundColor: COLORS.ink, borderRadius: 32, paddingHorizontal: 25, paddingVertical: 28, marginTop: 38, shadowColor: "#071B14", shadowOpacity: 0.36, shadowOffset: { width: 0, height: 14 }, shadowRadius: 20, elevation: 12 },
  maintenanceCardCompact: { paddingHorizontal: 20, paddingVertical: 22, marginTop: 20 },
  iconBurst: { width: 116, height: 116, borderRadius: 39, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 24, transform: [{ rotate: "-6deg" }] },
  sparkOne: { position: "absolute", right: -9, top: 4, width: 27, height: 27, borderRadius: 9, backgroundColor: COLORS.orange, alignItems: "center", justifyContent: "center", transform: [{ rotate: "12deg" }] },
  sparkTwo: { position: "absolute", left: -7, bottom: 8, width: 23, height: 23, borderRadius: 8, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-10deg" }] },
  sparkText: { color: COLORS.green, fontSize: 16, lineHeight: 19, fontWeight: "900" },
  statusPill: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1.5, borderColor: COLORS.yellow, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 17 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.yellow },
  statusText: { color: COLORS.yellow, fontSize: 15, fontWeight: "900", letterSpacing: 1.2 },
  title: { color: COLORS.white, fontFamily: "serif", fontStyle: "italic", fontSize: 34, lineHeight: 38, fontWeight: "900", letterSpacing: -1.2, textAlign: "center" },
  titleCompact: { fontSize: 29, lineHeight: 33 },
  message: { color: "#CBD4CA", fontSize: 15.5, fontWeight: "900", lineHeight: 18, textAlign: "center", maxWidth: 330, alignSelf: "center", marginTop: 15 },
  divider: { height: 1, backgroundColor: "#45685A", marginVertical: 24 },
  footerRow: { flexDirection: "row", alignItems: "center", alignSelf: "center", maxWidth: 310 },
  footerIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", marginRight: 12 },
  footerCopy: { flex: 1 },
  footerTitle: { color: COLORS.yellow, fontSize: 20.5, fontWeight: "900" },
  footerText: { color: "#AEBBAF", fontSize: 15.5, lineHeight: 12, marginTop: 3 },
  backgroundBoltTop: { position: "absolute", right: -34, top: 52, width: 130, height: 130, borderRadius: 44, backgroundColor: "rgba(226,181,47,0.30)", alignItems: "center", justifyContent: "center", transform: [{ rotate: "14deg" }] },
  backgroundBoltBottom: { position: "absolute", left: -38, bottom: 18, width: 120, height: 120, borderRadius: 42, backgroundColor: "rgba(32,76,59,0.13)", alignItems: "center", justifyContent: "center", transform: [{ rotate: "-12deg" }] },
  backgroundBolt: { color: "rgba(32,76,59,0.28)", fontSize: 82, lineHeight: 90, fontWeight: "900" },
});
