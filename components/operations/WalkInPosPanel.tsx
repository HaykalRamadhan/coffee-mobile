import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, TextInput, View } from "react-native";
import { createWalkInOrder, type OperationsProduct } from "../../lib/operations";
import { Text } from "../../lib/typography";

const COLORS = { card: "#FFFFFF", divider: "#DDE3DF", ink: "#153F32", muted: "#607067", yellow: "#E2B52F", yellowSoft: "#F3E8B9", danger: "#A9453B" };
const formatRupiah = (value: number) => `Rp ${value.toLocaleString("id-ID")}`;

export function WalkInPosPanel({
  products,
  compact,
  onCreated,
}: {
  products: OperationsProduct[];
  compact: boolean;
  onCreated: (orderId: string) => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const availableProducts = products.filter((product) => product.active);
  const selected = useMemo(() => availableProducts
    .filter((product) => (quantities[product.id] ?? 0) > 0)
    .map((product) => ({ ...product, quantity: quantities[product.id] ?? 0 })), [availableProducts, quantities]);
  const total = selected.reduce((sum, item) => sum + item.basePrice * item.quantity, 0);
  const itemCount = selected.reduce((sum, item) => sum + item.quantity, 0);

  const changeQuantity = (productId: number, delta: number) => {
    setQuantities((current) => ({ ...current, [productId]: Math.max(0, Math.min(20, (current[productId] ?? 0) + delta)) }));
  };

  const submit = async () => {
    if (selected.length === 0) { setError("Add at least one product."); return; }
    setSubmitting(true);
    setError(null);
    const result = await createWalkInOrder(customerName.trim(), selected.map((item) => ({ productId: item.id, quantity: item.quantity })));
    setSubmitting(false);
    if (result.error || !result.orderId) { setError(result.error ?? "The order could not be created."); return; }
    setQuantities({});
    setCustomerName("");
    Alert.alert("Walk-in order created", `Order #${result.orderId.slice(0, 8).toUpperCase()} was added to the order board.`);
    onCreated(result.orderId);
  };

  return (
    <View style={[styles.layout, compact && styles.layoutCompact]}>
      <View style={styles.catalogCard}>
        <View style={styles.heading}><View><Text style={styles.title}>New walk-in order</Text><Text style={styles.subtitle}>Select products and quantities</Text></View><View style={styles.counterPill}><Text style={styles.counterText}>{itemCount} items</Text></View></View>
        <Text style={styles.inputLabel}>Customer name (optional)</Text>
        <TextInput value={customerName} onChangeText={setCustomerName} placeholder="Walk-in customer" placeholderTextColor="#849189" maxLength={80} style={styles.input} />
        <View style={styles.productGrid}>
          {availableProducts.map((product) => {
            const quantity = quantities[product.id] ?? 0;
            return (
              <View key={product.id} style={[styles.productCard, quantity > 0 && styles.productCardSelected]}>
                <View style={styles.productIcon}><Ionicons name="cafe-outline" size={21} color={COLORS.ink} /></View>
                <View style={styles.productCopy}><Text style={styles.productName}>{product.name}</Text><Text style={styles.productMeta}>{product.category} · {formatRupiah(product.basePrice)}</Text></View>
                <View style={styles.stepper}>
                  <Pressable accessibilityLabel={`Remove ${product.name}`} disabled={quantity === 0} onPress={() => changeQuantity(product.id, -1)} style={[styles.stepButton, quantity === 0 && styles.stepButtonDisabled]}><Ionicons name="remove" size={17} color={COLORS.ink} /></Pressable>
                  <Text style={styles.quantity}>{quantity}</Text>
                  <Pressable accessibilityLabel={`Add ${product.name}`} onPress={() => changeQuantity(product.id, 1)} style={styles.stepButton}><Ionicons name="add" size={17} color={COLORS.ink} /></Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </View>
      <View style={styles.summaryCard}>
        <Text style={styles.summaryEyebrow}>ORDER SUMMARY</Text>
        <Text style={styles.summaryTitle}>{itemCount === 0 ? "No products yet" : `${itemCount} item${itemCount === 1 ? "" : "s"}`}</Text>
        <View style={styles.summaryList}>
          {selected.map((item) => <View key={item.id} style={styles.summaryRow}><Text style={styles.summaryItem}>{item.quantity}× {item.name}</Text><Text style={styles.summaryPrice}>{formatRupiah(item.basePrice * item.quantity)}</Text></View>)}
        </View>
        <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{formatRupiah(total)}</Text></View>
        <View style={styles.paymentNote}><Ionicons name="cash-outline" size={18} color={COLORS.ink} /><Text style={styles.paymentNoteText}>Pay at counter · payment will be recorded from the order board.</Text></View>
        {error && <Text style={styles.errorText}>{error}</Text>}
        <Pressable disabled={submitting || selected.length === 0} onPress={() => { void submit(); }} style={[styles.submitButton, (submitting || selected.length === 0) && styles.submitButtonDisabled]}>
          {submitting ? <ActivityIndicator color="#FFFFFF" /> : <><Ionicons name="receipt-outline" size={19} color="#FFFFFF" /><Text style={styles.submitText}>Create counter order</Text></>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { flexDirection: "row", alignItems: "flex-start", gap: 12 }, layoutCompact: { flexDirection: "column" },
  catalogCard: { flex: 2, width: "100%", backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.divider, borderRadius: 18, padding: 18 },
  summaryCard: { flex: 1, width: "100%", minWidth: 250, backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.divider, borderRadius: 18, padding: 18 },
  heading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10, marginBottom: 17 }, title: { color: COLORS.ink, fontSize: 17, fontWeight: "900" }, subtitle: { color: COLORS.muted, fontSize: 9.5, marginTop: 3 }, counterPill: { backgroundColor: COLORS.yellowSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }, counterText: { color: COLORS.ink, fontSize: 8.5, fontWeight: "900" },
  inputLabel: { color: COLORS.ink, fontSize: 9.5, fontWeight: "900", marginBottom: 6 }, input: { minHeight: 45, borderWidth: 1, borderColor: COLORS.divider, borderRadius: 12, paddingHorizontal: 13, color: COLORS.ink, backgroundColor: "#F8F9F8", fontSize: 14, marginBottom: 15 },
  productGrid: { gap: 8 }, productCard: { minHeight: 66, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: COLORS.divider, borderRadius: 13, padding: 10 }, productCardSelected: { borderColor: COLORS.yellow, backgroundColor: "#FFFDF5" }, productIcon: { width: 39, height: 39, borderRadius: 12, backgroundColor: COLORS.yellowSoft, alignItems: "center", justifyContent: "center" }, productCopy: { flex: 1, minWidth: 100 }, productName: { color: COLORS.ink, fontSize: 11, fontWeight: "900" }, productMeta: { color: COLORS.muted, fontSize: 8.5, marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 }, stepButton: { width: 33, height: 33, borderRadius: 10, backgroundColor: COLORS.yellowSoft, alignItems: "center", justifyContent: "center" }, stepButtonDisabled: { opacity: 0.35 }, quantity: { minWidth: 18, textAlign: "center", color: COLORS.ink, fontSize: 11, fontWeight: "900" },
  summaryEyebrow: { color: COLORS.yellow, fontSize: 8.5, fontWeight: "900", letterSpacing: 1.2 }, summaryTitle: { color: COLORS.ink, fontSize: 17, fontWeight: "900", marginTop: 5 }, summaryList: { marginTop: 16, gap: 9 }, summaryRow: { flexDirection: "row", justifyContent: "space-between", gap: 10 }, summaryItem: { flex: 1, color: COLORS.muted, fontSize: 9.5 }, summaryPrice: { color: COLORS.ink, fontSize: 9.5, fontWeight: "800" }, totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderTopWidth: 1, borderTopColor: COLORS.divider, marginTop: 17, paddingTop: 14 }, totalLabel: { color: COLORS.muted, fontSize: 10, fontWeight: "800" }, totalValue: { color: COLORS.yellow, fontSize: 20, fontWeight: "900" },
  paymentNote: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: COLORS.yellowSoft, borderRadius: 11, padding: 10, marginTop: 14 }, paymentNoteText: { flex: 1, color: COLORS.ink, fontSize: 8.5, lineHeight: 13, fontWeight: "700" }, errorText: { color: COLORS.danger, fontSize: 9, fontWeight: "800", marginTop: 10 }, submitButton: { minHeight: 46, borderRadius: 12, backgroundColor: COLORS.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 }, submitButtonDisabled: { opacity: 0.45 }, submitText: { color: "#FFFFFF", fontSize: 10, fontWeight: "900" },
});
