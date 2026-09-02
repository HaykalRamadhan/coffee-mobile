import { Ionicons } from "@expo/vector-icons";
import {
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useResponsiveLayout } from "../lib/responsive";
import { DISPLAY_FONT_FAMILY, Text } from "../lib/typography";

const COLORS = {
  ink: "#153F32",
  cream: "#DEE0DF",
  orange: "#D4A62A",
  yellow: "#E2B52F",
  green: "#204C3B",
  muted: "#526659",
  white: "#FFFFFF",
};

export function MaintenanceScreen({ message }: { message: string }) {
  const insets = useSafeAreaInsets();
  const responsiveLayout = useResponsiveLayout();
  const condensed = responsiveLayout.isCompact;

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.safeArea}>
      <View style={styles.backgroundBoltTop}><Text style={styles.backgroundBolt}>ϟ</Text></View>
      <View style={styles.backgroundBoltBottom}><Text style={styles.backgroundBolt}>ϟ</Text></View>

      <ScrollView
        bounces={false}
        contentContainerStyle={[
          styles.content,
          condensed && styles.contentCondensed,
          {
            alignSelf: "center",
            maxWidth: responsiveLayout.contentMaxWidth,
            width: "100%",
          },
          { paddingTop: (condensed ? 12 : 40) + insets.top },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.brandRow, condensed && styles.brandRowCondensed]}>
          <View style={[styles.logoMark, condensed && styles.logoMarkCondensed]}>
            <Text style={[styles.logoBolt, condensed && styles.logoBoltCondensed]}>ϟ</Text>
          </View>
          <View>
            <Text style={[styles.logo, condensed && styles.logoCondensed]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Kopi POW!</Text>
            <Text style={[styles.logoLine, condensed && styles.logoLineCondensed]}>99% REAAAADY TO GOW</Text>
          </View>
        </View>

        <View style={[styles.maintenanceCard, condensed && styles.maintenanceCardCompact]}>
          <View style={[styles.iconBurst, condensed && styles.iconBurstCondensed]}>
            <Ionicons name="construct-outline" size={condensed ? 43 : 58} color={COLORS.green} />
            <View style={styles.sparkOne}><Text style={styles.sparkText}>ϟ</Text></View>
            <View style={styles.sparkTwo}><Text style={styles.sparkText}>ϟ</Text></View>
          </View>

          <View style={[styles.statusPill, condensed && styles.statusPillCondensed]}>
            <View style={styles.statusDot} />
            <Text style={[styles.statusText, condensed && styles.statusTextCondensed]}>TEMPORARILY RECHARGING</Text>
          </View>

          <Text style={[styles.title, condensed && styles.titleCompact]} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.72}>
            KopiPow is getting a power-up!
          </Text>
          <Text style={[styles.message, condensed && styles.messageCondensed]}>{message}</Text>

          <View style={[styles.divider, condensed && styles.dividerCondensed]} />

          <View style={[styles.footerRow, condensed && styles.footerRowCondensed]}>
            <View style={[styles.footerIcon, condensed && styles.footerIconCondensed]}>
              <Ionicons name="cafe-outline" size={condensed ? 18 : 20} color={COLORS.green} />
            </View>
            <View style={styles.footerCopy}>
              <Text style={[styles.footerTitle, condensed && styles.footerTitleCondensed]}>Thanks for your patience.</Text>
              <Text style={[styles.footerText, condensed && styles.footerTextCondensed]}>Your next power-up will be worth the wait.</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.cream, overflow: "hidden" },
  content: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 40, paddingBottom: 28 },
  contentCondensed: { paddingHorizontal: 16, paddingBottom: 12 },
  brandRow: { flexDirection: "row", alignItems: "center", alignSelf: "center", gap: 11, zIndex: 2 },
  brandRowCondensed: { gap: 9 },
  logoMark: { width: 66, height: 66, borderRadius: 15, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  logoMarkCondensed: { width: 52, height: 52, borderRadius: 13 },
  logoBolt: { color: COLORS.green, fontSize: 66, lineHeight: 40.5, fontWeight: "900" },
  logoBoltCondensed: { fontSize: 49, lineHeight: 35 },
  logo: { color: COLORS.ink, fontSize: 56, fontWeight: "900", fontStyle: "italic", letterSpacing: -1.5 },
  logoCondensed: { fontSize: 38, letterSpacing: -1.1 },
  logoLine: { color: COLORS.muted, fontSize: 17.5, fontWeight: "900", letterSpacing: 1.8, marginTop: 1 },
  logoLineCondensed: { fontSize: 10, letterSpacing: 1.5 },
  maintenanceCard: { flex: 1, maxHeight: 570, width: "100%", maxWidth: 430, alignSelf: "center", justifyContent: "center", backgroundColor: COLORS.ink, borderRadius: 32, paddingHorizontal: 25, paddingVertical: 28, marginTop: 38, shadowColor: "#071B14", shadowOpacity: 0.36, shadowOffset: { width: 0, height: 14 }, shadowRadius: 20, elevation: 12 },
  maintenanceCardCompact: { paddingHorizontal: 18, paddingVertical: 18, marginTop: 16, borderRadius: 27 },
  iconBurst: { width: 116, height: 116, borderRadius: 39, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", alignSelf: "center", marginBottom: 24, transform: [{ rotate: "-6deg" }] },
  iconBurstCondensed: { width: 78, height: 78, borderRadius: 27, marginBottom: 13 },
  sparkOne: { position: "absolute", right: -9, top: 4, width: 27, height: 27, borderRadius: 9, backgroundColor: COLORS.orange, alignItems: "center", justifyContent: "center", transform: [{ rotate: "12deg" }] },
  sparkTwo: { position: "absolute", left: -7, bottom: 8, width: 23, height: 23, borderRadius: 8, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-10deg" }] },
  sparkText: { color: COLORS.green, fontSize: 16, lineHeight: 19, fontWeight: "900" },
  statusPill: { alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1.5, borderColor: COLORS.yellow, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 7, marginBottom: 17 },
  statusPillCondensed: { gap: 6, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 12 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.yellow },
  statusText: { color: COLORS.yellow, fontSize: 15, fontWeight: "900", letterSpacing: 1.2 },
  statusTextCondensed: { fontSize: 11, letterSpacing: 0.85 },
  title: { color: COLORS.white, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 34, lineHeight: 38, letterSpacing: -1.2, textAlign: "center" },
  titleCompact: { fontSize: 27, lineHeight: 31 },
  message: { color: "#CBD4CA", fontSize: 15.5, fontWeight: "900", lineHeight: 18, textAlign: "center", maxWidth: 330, alignSelf: "center", marginTop: 15 },
  messageCondensed: { fontSize: 13, lineHeight: 17, marginTop: 10 },
  divider: { height: 1, backgroundColor: "#45685A", marginVertical: 24 },
  dividerCondensed: { marginVertical: 14 },
  footerRow: { flexDirection: "row", alignItems: "center", alignSelf: "center", maxWidth: 310 },
  footerRowCondensed: { width: "100%", maxWidth: 285 },
  footerIcon: { width: 43, height: 43, borderRadius: 15, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", marginRight: 12 },
  footerIconCondensed: { width: 40, height: 40, borderRadius: 13, marginRight: 10 },
  footerCopy: { flex: 1 },
  footerTitle: { color: COLORS.yellow, fontSize: 20.5, fontWeight: "900" },
  footerTitleCondensed: { fontSize: 15.5, lineHeight: 18 },
  footerText: { color: "#AEBBAF", fontSize: 15.5, lineHeight: 18.5, marginTop: 3 },
  footerTextCondensed: { fontSize: 12, lineHeight: 15, marginTop: 2 },
  backgroundBoltTop: { position: "absolute", right: -34, top: 52, width: 130, height: 130, borderRadius: 44, backgroundColor: "rgba(226,181,47,0.30)", alignItems: "center", justifyContent: "center", transform: [{ rotate: "14deg" }] },
  backgroundBoltBottom: { position: "absolute", left: -38, bottom: 18, width: 120, height: 120, borderRadius: 42, backgroundColor: "rgba(32,76,59,0.13)", alignItems: "center", justifyContent: "center", transform: [{ rotate: "-12deg" }] },
  backgroundBolt: { color: "rgba(32,76,59,0.28)", fontSize: 82, lineHeight: 90, fontWeight: "900" },
});
