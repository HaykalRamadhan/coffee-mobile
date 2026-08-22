import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { CartItem } from "../appState";
import { createMidtransPickupOrder, type CheckoutOrder } from "../lib/cart";

const COLORS = {
  ink: "#153F32",
  cream: "#C9C7A7",
  orange: "#D4A62A",
  yellow: "#E2B52F",
  green: "#204C3B",
  muted: "#526659",
  white: "#EEEBCB",
};

const formatRupiah = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;

type CheckoutScreenProps = {
  accountEmail: string | null;
  cartItems: CartItem[];
  customerName: string;
  subtotal: number;
  onBack: () => void;
  onOrderCreated: (order: CheckoutOrder) => void;
};

export function CheckoutScreen({
  accountEmail,
  cartItems,
  customerName,
  subtotal,
  onBack,
  onOrderCreated,
}: CheckoutScreenProps) {
  const [name, setName] = useState(customerName);
  const [phone, setPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const itemCount = cartItems.reduce((total, item) => total + item.quantity, 0);

  const placeOrder = async () => {
    if (name.trim().length < 2) {
      setError("Enter the name we should use for pickup.");
      return;
    }
    if (phone.trim() && !/^[0-9+() -]{8,20}$/.test(phone.trim())) {
      setError("Enter a valid phone number or leave it blank.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await createMidtransPickupOrder({
        customerName: name,
        phone,
        customerNote,
      });
      if (result.error || !result.order) {
        setError(result.error ?? "The order could not be created.");
        return;
      }

      onOrderCreated(result.order);
    } catch {
      setError("The checkout request failed unexpectedly. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable style={styles.backButton} onPress={onBack} accessibilityLabel="Return to cart">
            <Ionicons name="arrow-back" size={23} color={COLORS.green} />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>SECURE CHECKOUT</Text>
            <Text style={styles.title}>Almost powered up!</Text>
          </View>
        </View>

        <View style={styles.accountPill}>
          <Ionicons name="cloud-done-outline" size={20} color={COLORS.green} />
          <View style={styles.accountCopy}>
            <Text style={styles.accountTitle}>Saved to your account</Text>
            <Text style={styles.accountEmail} numberOfLines={1}>{accountEmail ?? "Authenticated KopiPow account"}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <View style={styles.cardIcon}><Ionicons name="bag-handle-outline" size={21} color={COLORS.green} /></View>
            <View>
              <Text style={styles.cardTitle}>Pickup order</Text>
              <Text style={styles.cardSubtitle}>{itemCount} {itemCount === 1 ? "item" : "items"} · Secure online payment</Text>
            </View>
          </View>

          {cartItems.map((item) => (
            <View key={item.lineId} style={styles.orderLine}>
              <Text style={styles.orderLineQuantity}>{item.quantity}×</Text>
              <View style={styles.orderLineCopy}>
                <Text style={styles.orderLineName}>{item.name}</Text>
                {item.customization && <Text style={styles.orderLineDetail}>{item.customization.size} · {item.customization.temperature}</Text>}
              </View>
              <Text style={styles.orderLinePrice}>{formatRupiah(item.unitPrice * item.quantity)}</Text>
            </View>
          ))}

          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{formatRupiah(subtotal)}</Text>
          </View>
          <Text style={styles.totalNote}>The server recalculates catalog prices before creating the order.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <View style={styles.cardIcon}><Ionicons name="person-outline" size={21} color={COLORS.green} /></View>
            <View>
              <Text style={styles.cardTitle}>Pickup details</Text>
              <Text style={styles.cardSubtitle}>So the counter knows who to call</Text>
            </View>
          </View>

          <Text style={styles.inputLabel}>NAME</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Pickup name"
            placeholderTextColor="#7E897F"
            maxLength={80}
            autoCapitalize="words"
          />

          <Text style={styles.inputLabel}>PHONE · OPTIONAL</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="Example: +62 812 3456 7890"
            placeholderTextColor="#7E897F"
            keyboardType="phone-pad"
            maxLength={20}
          />

          <Text style={styles.inputLabel}>ORDER NOTE · OPTIONAL</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={customerNote}
            onChangeText={setCustomerNote}
            placeholder="Anything the counter should know?"
            placeholderTextColor="#7E897F"
            maxLength={240}
            multiline
          />
        </View>

        <View style={styles.paymentCard}>
          <View style={styles.paymentIcon}><Ionicons name="shield-checkmark-outline" size={25} color={COLORS.green} /></View>
          <View style={styles.paymentCopy}>
            <Text style={styles.paymentTitle}>Pay securely with Midtrans</Text>
            <Text style={styles.paymentText}>Choose QRIS, bank transfer, e-wallet, or another activated method on the Midtrans payment page.</Text>
          </View>
          <Ionicons name="checkmark-circle" size={25} color={COLORS.orange} />
        </View>

        {error && (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={21} color="#963A31" />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={[styles.primaryButton, isSubmitting && styles.buttonDisabled]}
          onPress={placeOrder}
          disabled={isSubmitting}
        >
          {isSubmitting ? <ActivityIndicator color={COLORS.white} /> : <>
            <Text style={styles.primaryButtonText}>Continue to secure payment</Text>
            <Text style={styles.primaryButtonAmount}>{formatRupiah(subtotal)}</Text>
          </>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.cream },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 42 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  backButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", marginRight: 13 },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.orange, fontSize: 11, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontSize: 29, fontWeight: "900", marginTop: 2 },
  accountPill: { flexDirection: "row", alignItems: "center", backgroundColor: "#D8D6B6", borderRadius: 17, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 13 },
  accountCopy: { flex: 1, marginLeft: 10 },
  accountTitle: { color: COLORS.ink, fontSize: 11, fontWeight: "800" },
  accountEmail: { color: COLORS.muted, fontSize: 9, marginTop: 2 },
  card: { backgroundColor: COLORS.white, borderRadius: 24, padding: 17, marginBottom: 13, borderWidth: 1, borderColor: "#DCD7B7" },
  cardHeading: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  cardIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#D9D6B5", alignItems: "center", justifyContent: "center", marginRight: 11 },
  cardTitle: { color: COLORS.ink, fontSize: 15, fontWeight: "900" },
  cardSubtitle: { color: COLORS.muted, fontSize: 9, marginTop: 3 },
  orderLine: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8 },
  orderLineQuantity: { color: COLORS.orange, fontSize: 11, fontWeight: "900", width: 28 },
  orderLineCopy: { flex: 1 },
  orderLineName: { color: COLORS.ink, fontSize: 11, fontWeight: "800" },
  orderLineDetail: { color: COLORS.muted, fontSize: 8.5, marginTop: 2 },
  orderLinePrice: { color: COLORS.ink, fontSize: 10, fontWeight: "800" },
  divider: { height: 1, backgroundColor: "#D4D0AE", marginVertical: 10 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { color: COLORS.ink, fontSize: 12, fontWeight: "900" },
  totalValue: { color: COLORS.orange, fontSize: 18, fontWeight: "900" },
  totalNote: { color: COLORS.muted, fontSize: 8, lineHeight: 12, marginTop: 8 },
  inputLabel: { color: COLORS.green, fontSize: 9, fontWeight: "900", letterSpacing: 1.1, marginBottom: 7 },
  input: { minHeight: 50, borderRadius: 15, backgroundColor: "#DCD9B8", borderWidth: 1, borderColor: "#D1CDAA", color: COLORS.ink, fontSize: 12, fontWeight: "600", paddingHorizontal: 14, marginBottom: 15 },
  noteInput: { minHeight: 84, paddingTop: 13, textAlignVertical: "top", marginBottom: 0 },
  paymentCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#BBB99A", borderRadius: 21, padding: 15, marginBottom: 13 },
  paymentIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", marginRight: 12 },
  paymentCopy: { flex: 1, marginRight: 8 },
  paymentTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "900" },
  paymentText: { color: COLORS.muted, fontSize: 8.5, lineHeight: 12, marginTop: 4 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#EBCBC4", borderRadius: 16, padding: 13, marginBottom: 13 },
  errorText: { flex: 1, color: "#963A31", fontSize: 10, lineHeight: 15, fontWeight: "700" },
  primaryButton: { minHeight: 58, borderRadius: 20, backgroundColor: COLORS.green, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 19 },
  primaryButtonText: { color: COLORS.white, fontSize: 11, fontWeight: "900", letterSpacing: 0.5 },
  primaryButtonAmount: { color: COLORS.yellow, fontSize: 12, fontWeight: "900" },
  buttonDisabled: { opacity: 0.58 },
  successScreen: { flex: 1, backgroundColor: COLORS.cream, alignItems: "center", justifyContent: "center", paddingHorizontal: 27 },
  successBurst: { width: 110, height: 110, borderRadius: 38, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", marginBottom: 24, transform: [{ rotate: "-3deg" }] },
  successTitle: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontWeight: "900", fontSize: 31, textAlign: "center", marginTop: 8 },
  successCopy: { color: COLORS.muted, fontSize: 11, lineHeight: 17, textAlign: "center", maxWidth: 310, marginTop: 11 },
  orderCodeCard: { width: "100%", maxWidth: 360, backgroundColor: COLORS.green, borderRadius: 24, alignItems: "center", padding: 20, marginVertical: 24 },
  orderCodeLabel: { color: "#B9C9BC", fontSize: 9, fontWeight: "900", letterSpacing: 1.4 },
  orderCode: { color: COLORS.yellow, fontSize: 27, fontWeight: "900", letterSpacing: 2.2, marginTop: 6 },
  orderTotal: { color: COLORS.white, fontSize: 12, fontWeight: "800", marginTop: 9 },
});
