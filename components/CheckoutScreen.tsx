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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  createCounterPickupOrder,
  createMidtransPickupOrder,
  type CheckoutOrder,
} from "../lib/cart";
import { getOrderItemDisplayDetails } from "../lib/orderDetails";

const COLORS = {
  ink: "#153F32",
  cream: "#DEE0DF",
  orange: "#D4A62A",
  yellow: "#E2B52F",
  green: "#204C3B",
  muted: "#526659",
  white: "#FFFFFF",
};

const formatRupiah = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;
type CheckoutPaymentMethod = CheckoutOrder["paymentMethod"];

type CheckoutScreenProps = {
  accountEmail: string | null;
  cartItems: CartItem[];
  customerName: string;
  subtotal: number;
  onBack: () => void;
  onOrderCreated: (order: CheckoutOrder) => void;
  onSubmissionStateChange: (isSubmitting: boolean) => void;
};

export function CheckoutScreen({
  accountEmail,
  cartItems,
  customerName,
  subtotal,
  onBack,
  onOrderCreated,
  onSubmissionStateChange,
}: CheckoutScreenProps) {
  const insets = useSafeAreaInsets();
  const [name, setName] = useState(customerName);
  const [phone, setPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<CheckoutPaymentMethod>("pay_at_counter");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFloatingBack, setShowFloatingBack] = useState(false);

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
    onSubmissionStateChange(true);
    setError(null);
    try {
      const createOrder = paymentMethod === "midtrans_snap"
        ? createMidtransPickupOrder
        : createCounterPickupOrder;
      const result = await createOrder({
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
      onSubmissionStateChange(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: 16 + insets.top, paddingBottom: 42 + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={({ nativeEvent }) => {
          const shouldShow = nativeEvent.contentOffset.y > 72;
          if (shouldShow !== showFloatingBack) setShowFloatingBack(shouldShow);
        }}
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
              <Text style={styles.cardSubtitle}>{itemCount} {itemCount === 1 ? "item" : "items"} · Choose how you want to pay</Text>
            </View>
          </View>

          {cartItems.map((item) => {
            const details = getOrderItemDisplayDetails(item.customization);
            return (
              <View key={item.lineId} style={styles.orderLine}>
                <Text style={styles.orderLineQuantity}>{item.quantity}×</Text>
                <View style={styles.orderLineCopy}>
                  <Text style={styles.orderLineName}>{item.name}</Text>
                  {details.primary && <Text style={styles.orderLineDetail}>{details.primary}</Text>}
                  {details.secondary && <Text style={styles.orderLineDetail}>{details.secondary}</Text>}
                  {details.extras.length > 0 && (
                    <>
                      <Text style={styles.orderLineExtrasLabel}>Extras:</Text>
                      {details.extras.map((extra, index) => (
                        <Text key={`${item.lineId}-extra-${index}`} style={styles.orderLineExtra}>- {extra}</Text>
                      ))}
                    </>
                  )}
                  {item.note.length > 0 && <Text style={styles.orderLineNote}>“{item.note}”</Text>}
                </View>
                <Text style={styles.orderLinePrice}>{formatRupiah(item.unitPrice * item.quantity)}</Text>
              </View>
            );
          })}

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

        <View style={styles.card}>
          <View style={styles.cardHeading}>
            <View style={styles.cardIcon}><Ionicons name="wallet-outline" size={21} color={COLORS.green} /></View>
            <View>
              <Text style={styles.cardTitle}>Payment method</Text>
              <Text style={styles.cardSubtitle}>Select one option for this pickup</Text>
            </View>
          </View>

          <Pressable
            style={[styles.paymentOption, paymentMethod === "pay_at_counter" && styles.paymentOptionSelected]}
            onPress={() => setPaymentMethod("pay_at_counter")}
            disabled={isSubmitting}
            accessibilityRole="radio"
            accessibilityState={{ checked: paymentMethod === "pay_at_counter" }}
          >
            <View style={[styles.paymentIcon, paymentMethod === "pay_at_counter" && styles.paymentIconSelected]}>
              <Ionicons name="storefront-outline" size={24} color={COLORS.green} />
            </View>
            <View style={styles.paymentCopy}>
              <Text style={styles.paymentTitle}>Pay at the counter</Text>
              <Text style={styles.paymentText}>Place the order now and pay the cashier when you collect it.</Text>
            </View>
            <Ionicons
              name={paymentMethod === "pay_at_counter" ? "radio-button-on" : "radio-button-off"}
              size={24}
              color={paymentMethod === "pay_at_counter" ? COLORS.orange : COLORS.muted}
            />
          </Pressable>

          <Pressable
            style={[styles.paymentOption, paymentMethod === "midtrans_snap" && styles.paymentOptionSelected]}
            onPress={() => setPaymentMethod("midtrans_snap")}
            disabled={isSubmitting}
            accessibilityRole="radio"
            accessibilityState={{ checked: paymentMethod === "midtrans_snap" }}
          >
            <View style={[styles.paymentIcon, paymentMethod === "midtrans_snap" && styles.paymentIconSelected]}>
              <Ionicons name="shield-checkmark-outline" size={25} color={COLORS.green} />
            </View>
            <View style={styles.paymentCopy}>
              <Text style={styles.paymentTitle}>Online payment</Text>
              <Text style={styles.paymentText}>Pay securely through Midtrans using QRIS, bank transfer, e-wallet, or another available method.</Text>
            </View>
            <Ionicons
              name={paymentMethod === "midtrans_snap" ? "radio-button-on" : "radio-button-off"}
              size={24}
              color={paymentMethod === "midtrans_snap" ? COLORS.orange : COLORS.muted}
            />
          </Pressable>
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
            <Text style={styles.primaryButtonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.74}>
              {paymentMethod === "midtrans_snap" ? "Continue to secure payment" : "Place order · Pay at counter"}
            </Text>
            <Text style={styles.primaryButtonAmount}>{formatRupiah(subtotal)}</Text>
          </>}
        </Pressable>
      </ScrollView>

      {showFloatingBack && (
        <Pressable
          style={styles.floatingBackButton}
          onPress={onBack}
          accessibilityLabel="Return to cart"
        >
          <Ionicons name="arrow-back" size={25} color={COLORS.green} />
        </Pressable>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.cream },
  content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 42 },
  header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
  backButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", marginRight: 13 },
  headerCopy: { flex: 1 },
  eyebrow: { color: COLORS.orange, fontSize: 16.5, fontWeight: "900", letterSpacing: 1.3 },
  title: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontSize: 43.5, lineHeight: 52, fontWeight: "900", marginTop: 2 },
  accountPill: { flexDirection: "row", alignItems: "center", backgroundColor: "#EEF2EF", borderRadius: 17, paddingHorizontal: 14, paddingVertical: 11, marginBottom: 13 },
  accountCopy: { flex: 1, marginLeft: 10 },
  accountTitle: { color: COLORS.ink, fontSize: 16.5, fontWeight: "800" },
  accountEmail: { color: COLORS.muted, fontSize: 13.5, marginTop: 2 },
  card: { backgroundColor: COLORS.white, borderRadius: 24, padding: 17, marginBottom: 13, borderWidth: 1, borderColor: "#DDE4DF" },
  cardHeading: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  cardIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: "#E8EDE9", alignItems: "center", justifyContent: "center", marginRight: 11 },
  cardTitle: { color: COLORS.ink, fontSize: 22.5, fontWeight: "900" },
  cardSubtitle: { color: COLORS.muted, fontSize: 13.5, lineHeight: 18, marginTop: 3 },
  orderLine: { flexDirection: "row", alignItems: "flex-start", paddingVertical: 8 },
  orderLineQuantity: { color: COLORS.orange, fontSize: 16.5, fontWeight: "900", width: 36 },
  orderLineCopy: { flex: 1 },
  orderLineName: { color: COLORS.ink, fontSize: 16.5, fontWeight: "800" },
  orderLineDetail: { color: COLORS.muted, fontSize: 12.75, lineHeight: 18, marginTop: 2 },
  orderLineExtrasLabel: { color: COLORS.orange, fontSize: 12.75, lineHeight: 18, fontWeight: "900", marginTop: 6 },
  orderLineExtra: { color: COLORS.orange, fontSize: 12.75, lineHeight: 18, fontWeight: "800", marginTop: 1 },
  orderLineNote: { color: COLORS.orange, fontSize: 12.75, lineHeight: 18, fontStyle: "italic", marginTop: 5 },
  orderLinePrice: { color: COLORS.ink, fontSize: 15, fontWeight: "800" },
  divider: { height: 1, backgroundColor: "#DDE3DF", marginVertical: 10 },
  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { color: COLORS.ink, fontSize: 18, fontWeight: "900" },
  totalValue: { color: COLORS.orange, fontSize: 27, fontWeight: "900" },
  totalNote: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 8 },
  inputLabel: { color: COLORS.green, fontSize: 13.5, fontWeight: "900", letterSpacing: 1.1, marginBottom: 7 },
  input: { minHeight: 60, borderRadius: 15, backgroundColor: "#F3F5F4", borderWidth: 1, borderColor: "#DDE3DF", color: COLORS.ink, fontSize: 18, fontWeight: "600", paddingHorizontal: 14, marginBottom: 15 },
  noteInput: { minHeight: 84, paddingTop: 13, textAlignVertical: "top", marginBottom: 0 },
  paymentOption: { flexDirection: "row", alignItems: "center", backgroundColor: "#F3F5F4", borderRadius: 18, padding: 13, borderWidth: 1.5, borderColor: "#DDE4DF", marginTop: 10 },
  paymentOptionSelected: { backgroundColor: "#F5F1D7", borderColor: COLORS.orange },
  paymentIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: "#E4E9E5", alignItems: "center", justifyContent: "center", marginRight: 12 },
  paymentIconSelected: { backgroundColor: COLORS.yellow },
  paymentCopy: { flex: 1, marginRight: 8 },
  paymentTitle: { color: COLORS.ink, fontSize: 18, fontWeight: "900" },
  paymentText: { color: COLORS.muted, fontSize: 12.75, lineHeight: 18, marginTop: 4 },
  errorBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#EBCBC4", borderRadius: 16, padding: 13, marginBottom: 13 },
  errorText: { flex: 1, color: "#963A31", fontSize: 15, lineHeight: 22.5, fontWeight: "700" },
  primaryButton: { minHeight: 58, borderRadius: 20, backgroundColor: COLORS.green, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 19 },
  primaryButtonText: { flex: 1, color: COLORS.white, fontSize: 16.5, fontWeight: "900", letterSpacing: 0.5, marginRight: 12 },
  primaryButtonAmount: { color: COLORS.yellow, fontSize: 18, fontWeight: "900" },
  buttonDisabled: { opacity: 0.58 },
  floatingBackButton: { position: "absolute", top: 18, left: 20, zIndex: 10, elevation: 8, width: 50, height: 50, borderRadius: 18, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#DDE4DF", shadowColor: "#122D24", shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  successScreen: { flex: 1, backgroundColor: COLORS.cream, alignItems: "center", justifyContent: "center", paddingHorizontal: 27 },
  successBurst: { width: 110, height: 110, borderRadius: 38, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", marginBottom: 24, transform: [{ rotate: "-3deg" }] },
  successTitle: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontWeight: "900", fontSize: 46.5, textAlign: "center", marginTop: 8 },
  successCopy: { color: COLORS.muted, fontSize: 16.5, lineHeight: 25.5, textAlign: "center", maxWidth: 310, marginTop: 11 },
  orderCodeCard: { width: "100%", maxWidth: 360, backgroundColor: COLORS.green, borderRadius: 24, alignItems: "center", padding: 20, marginVertical: 24 },
  orderCodeLabel: { color: "#B9C9BC", fontSize: 13.5, fontWeight: "900", letterSpacing: 1.4 },
  orderCode: { color: COLORS.yellow, fontSize: 40.5, fontWeight: "900", letterSpacing: 2.2, marginTop: 6 },
  orderTotal: { color: COLORS.white, fontSize: 18, fontWeight: "800", marginTop: 9 },
});
