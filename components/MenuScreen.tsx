import { Ionicons } from "@expo/vector-icons";
import { Image, type ImageSource } from "expo-image";
import { createContext, useContext, useEffect, useState, type ReactElement } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  TextInput,
  View,
  type RefreshControlProps,
  type TextProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PRODUCT_IMAGE_PATHS } from "../assets/products/productImages";
import type { ProductCustomizationConfig } from "../appState";
import { DEFAULT_PRODUCT_CUSTOMIZATION_CONFIG, DISABLED_PRODUCT_CUSTOMIZATION_CONFIG } from "../lib/customization";
import { useResponsiveLayout } from "../lib/responsive";
import { DISPLAY_FONT_FAMILY, getResponsiveTextStyle } from "../lib/typography";

const COLORS = {
  ink: "#153F32",
  cream: "#DEE0DF",
  orange: "#D4A62A",
  yellow: "#E2B52F",
  green: "#204C3B",
  muted: "#526659",
  white: "#FFFFFF",
};

export const menuCategories = ["For you", "Coffee", "Non-coffee", "Snacks"] as const;
export type MenuCategory = typeof menuCategories[number];

export type MenuDrink = {
  id: number;
  name: string;
  detail: string;
  price: string;
  basePrice: number;
  accent: string;
  coffee: string;
  imagePath: string;
  imageSource: ImageSource | null;
  tag: string;
  category: Exclude<MenuCategory, "For you">;
  customizationConfig: ProductCustomizationConfig;
};

export const menuDrinks: MenuDrink[] = [
  { id: 1, name: "Power Latte", detail: "Double espresso · oat milk", price: "Rp 42k", basePrice: 42000, accent: "#D9B38A", coffee: "#704129", imagePath: PRODUCT_IMAGE_PATHS.powerLatte, imageSource: null, tag: "BESTSELLER", category: "Coffee", customizationConfig: DEFAULT_PRODUCT_CUSTOMIZATION_CONFIG },
  { id: 2, name: "Orange Bolt", detail: "Espresso · orange tonic", price: "Rp 39k", basePrice: 39000, accent: "#EE9851", coffee: "#7A3825", imagePath: PRODUCT_IMAGE_PATHS.orangeBolt, imageSource: null, tag: "NEW", category: "Coffee", customizationConfig: DEFAULT_PRODUCT_CUSTOMIZATION_CONFIG },
  { id: 3, name: "Sesame Charge", detail: "Black sesame · fresh milk", price: "Rp 44k", basePrice: 44000, accent: "#A9A79C", coffee: "#413A35", imagePath: PRODUCT_IMAGE_PATHS.sesameCharge, imageSource: null, tag: "SIGNATURE", category: "Non-coffee", customizationConfig: DEFAULT_PRODUCT_CUSTOMIZATION_CONFIG },
  { id: 4, name: "Matcha Pow", detail: "Ceremonial matcha · oat milk", price: "Rp 45k", basePrice: 45000, accent: "#9BAC75", coffee: "#66804C", imagePath: PRODUCT_IMAGE_PATHS.matchaPow, imageSource: null, tag: "FRESH", category: "Non-coffee", customizationConfig: DEFAULT_PRODUCT_CUSTOMIZATION_CONFIG },
  { id: 5, name: "Cocoa Kick", detail: "Dark cocoa · fresh milk", price: "Rp 38k", basePrice: 38000, accent: "#B68A6D", coffee: "#56382C", imagePath: PRODUCT_IMAGE_PATHS.cocoaKick, imageSource: null, tag: "CLASSIC", category: "Non-coffee", customizationConfig: DEFAULT_PRODUCT_CUSTOMIZATION_CONFIG },
  { id: 6, name: "Long Black", detail: "Double espresso · water", price: "Rp 32k", basePrice: 32000, accent: "#948274", coffee: "#33231D", imagePath: PRODUCT_IMAGE_PATHS.longBlack, imageSource: null, tag: "STRONG", category: "Coffee", customizationConfig: DEFAULT_PRODUCT_CUSTOMIZATION_CONFIG },
  { id: 7, name: "Butter Croffle", detail: "Caramelized · sea salt", price: "Rp 35k", basePrice: 35000, accent: "#D3A45F", coffee: "#8B5D35", imagePath: PRODUCT_IMAGE_PATHS.butterCroffle, imageSource: null, tag: "CRISPY", category: "Snacks", customizationConfig: DISABLED_PRODUCT_CUSTOMIZATION_CONFIG },
  { id: 8, name: "Power Banana", detail: "Banana loaf · brown butter", price: "Rp 34k", basePrice: 34000, accent: "#D9B75D", coffee: "#7A5330", imagePath: PRODUCT_IMAGE_PATHS.powerBanana, imageSource: null, tag: "BAKED", category: "Snacks", customizationConfig: DISABLED_PRODUCT_CUSTOMIZATION_CONFIG },
];

type MenuScreenProps = {
  activeCategory: MenuCategory;
  currentUserInitials: string;
  drinks: MenuDrink[];
  onActiveCategoryChange: (category: MenuCategory) => void;
  onCustomizeDrink: (drink: MenuDrink) => void;
  onOpenProfile: () => void;
  onSearchQueryChange: (query: string) => void;
  refreshControl: ReactElement<RefreshControlProps>;
  searchQuery: string;
  typographyScale: number;
};

const MenuTypographyContext = createContext(1);

function Text({ maxFontSizeMultiplier = 1.2, ...props }: TextProps) {
  const typographyScale = useContext(MenuTypographyContext);
  const responsiveStyle = getResponsiveTextStyle(props.style, typographyScale);

  return <NativeText maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} style={[props.style, responsiveStyle]} />;
}

function ProductPhoto({ imageSource, name }: { imageSource: ImageSource | null; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageSource]);

  if (imageSource && !failed) {
    return (
      <Image
        source={imageSource}
        style={styles.productPhoto}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={180}
        onError={() => setFailed(true)}
        accessibilityLabel={`${name} product photo`}
      />
    );
  }

  return (
    <View style={[styles.productPhotoPlaceholderBase, styles.productPhotoPlaceholder]}>
      <View style={styles.productPhotoIcon}>
        <Ionicons name="camera-outline" size={22} color={COLORS.green} />
      </View>
      <Text style={styles.productPhotoLabel} numberOfLines={1}>PHOTO SOON</Text>
      <Text style={styles.productPhotoName} numberOfLines={2}>{name}</Text>
    </View>
  );
}

export function MenuScreen({
  activeCategory,
  currentUserInitials,
  drinks,
  onActiveCategoryChange,
  onCustomizeDrink,
  onOpenProfile,
  onSearchQueryChange,
  refreshControl,
  searchQuery,
  typographyScale,
}: MenuScreenProps) {
  const insets = useSafeAreaInsets();
  const responsiveLayout = useResponsiveLayout();
  const screenWidth = responsiveLayout.width;
  const useSingleColumn = screenWidth < 340;
  const useThreeColumns = screenWidth >= 700;
  const normalizedSearchQuery = searchQuery.trim().toLocaleLowerCase();
  const categorySearch = menuCategories.find(
    (category) => category !== "For you" && category.toLocaleLowerCase() === normalizedSearchQuery,
  );
  const searchMatches = drinks.filter((drink) => {
    if (!normalizedSearchQuery) return true;
    if (categorySearch) return drink.category === categorySearch;
    return [drink.name, drink.detail, drink.tag, drink.category]
      .some((value) => value.toLocaleLowerCase().includes(normalizedSearchQuery));
  });
  const filteredDrinks = searchMatches.filter(
    (drink) => activeCategory === "For you" || drink.category === activeCategory,
  );
  const recommendedCategories: MenuCategory[] = normalizedSearchQuery && searchMatches.length > 0
    ? [
      "For you",
      ...menuCategories.filter(
        (category) => category !== "For you" && searchMatches.some((drink) => drink.category === category),
      ),
    ]
    : [...menuCategories];

  const updateSearchQuery = (value: string) => {
    if (!searchQuery.trim() && value.trim()) onActiveCategoryChange("For you");
    onSearchQueryChange(value);
  };
  const clearSearch = () => {
    onSearchQueryChange("");
    onActiveCategoryChange("For you");
  };

  return (
    <MenuTypographyContext.Provider value={typographyScale}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.menuContent,
          {
            alignSelf: "center",
            maxWidth: responsiveLayout.contentMaxWidth,
            paddingHorizontal: responsiveLayout.gutter,
            width: "100%",
          },
          { paddingTop: 14 + insets.top, paddingBottom: 118 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        refreshControl={refreshControl}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.topBar}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark}><Text style={styles.bolt}>ϟ</Text></View>
            <View>
              <Text style={styles.logo} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>Kopi POW!</Text>
              <Text style={styles.logoLine}>99% REAAAADY TO GOW</Text>
            </View>
          </View>
          <Pressable style={styles.avatar} accessibilityLabel="Open profile" onPress={onOpenProfile}>
            <Text style={styles.avatarText}>{currentUserInitials}</Text>
            <View style={styles.onlineDot} />
          </Pressable>
        </View>

        <View style={[styles.menuHeadingRow, responsiveLayout.isCompact && styles.menuHeadingRowCompact]}>
          <View>
            <Text style={styles.menuEyebrow}>CHOOSE YOUR POWER</Text>
            <Text style={styles.menuTitle}>The Menu!</Text>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={21} color={COLORS.green} style={styles.searchIcon} />
          <TextInput
            value={searchQuery}
            onChangeText={updateSearchQuery}
            placeholder="Search drinks, snacks, or ingredients"
            placeholderTextColor={COLORS.muted}
            selectionColor={COLORS.orange}
            returnKeyType="search"
            autoCorrect={false}
            maxFontSizeMultiplier={1.2}
            style={[styles.searchInput, { fontSize: 12.5 * typographyScale }]}
            accessibilityLabel="Search the KopiPow menu"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={clearSearch} style={styles.searchClear} accessibilityLabel="Clear menu search">
              <Ionicons name="close-circle" size={22} color={COLORS.muted} />
            </Pressable>
          )}
        </View>

        <Text style={styles.categorySuggestionLabel}>
          {normalizedSearchQuery && searchMatches.length > 0 ? "MATCHING CATEGORIES" : "RECOMMENDED CATEGORIES"}
        </Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {recommendedCategories.map((category) => {
            const selected = category === activeCategory;
            return (
              <Pressable key={category} onPress={() => onActiveCategoryChange(category)} style={[styles.categoryChip, selected && styles.categoryChipActive]}>
                <Text style={[styles.categoryText, selected && styles.categoryTextActive]}>{category}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.menuSectionRow}>
          <View>
            <Text style={styles.sectionEyebrow}>{normalizedSearchQuery ? "SEARCH RESULTS" : activeCategory === "For you" ? "ALL-DAY POWER" : activeCategory.toUpperCase()}</Text>
            <Text style={styles.menuSectionTitle} numberOfLines={2}>
              {normalizedSearchQuery
                ? `${filteredDrinks.length} ${filteredDrinks.length === 1 ? "match" : "matches"} for “${searchQuery.trim()}”`
                : activeCategory === "For you" ? "Made for every mood" : `${activeCategory} picks`}
            </Text>
          </View>
        </View>

        <View style={styles.menuGrid}>
          {filteredDrinks.map((drink) => (
            <View key={drink.id} style={[styles.menuCard, useSingleColumn && styles.menuCardSingleColumn, useThreeColumns && styles.menuCardThreeColumns]}>
              <View style={[styles.menuDrinkVisual, { backgroundColor: drink.accent }]}>
                {drink.tag ? <Text style={styles.menuDrinkTag}>{drink.tag}</Text> : null}
                <ProductPhoto imageSource={drink.imageSource} name={drink.name} />
              </View>
              <Text style={styles.menuDrinkName} numberOfLines={2}>{drink.name}</Text>
              <Text style={styles.menuDrinkDetail} numberOfLines={2}>{drink.detail}</Text>
              <View style={styles.drinkBottom}>
                <Text style={styles.menuDrinkPrice}>{drink.price}</Text>
                <Pressable style={styles.addButton} accessibilityLabel={`Customize ${drink.name}`} onPress={() => onCustomizeDrink(drink)}>
                  <Text style={styles.addButtonText}>＋</Text>
                </Pressable>
              </View>
            </View>
          ))}
          {filteredDrinks.length === 0 && (
            <View style={styles.emptySearchCard}>
              <View style={styles.emptySearchIcon}><Ionicons name="search-outline" size={28} color={COLORS.green} /></View>
              <Text style={styles.emptySearchTitle}>No power-ups found</Text>
              <Text style={styles.emptySearchCopy}>Try another name, ingredient, or category.</Text>
              <Pressable onPress={clearSearch} style={styles.emptySearchButton}>
                <Text style={styles.emptySearchButtonText}>Show all menu</Text>
              </Pressable>
            </View>
          )}
        </View>
      </ScrollView>
    </MenuTypographyContext.Provider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.cream },
  menuContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 118 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#F1F4F2", borderRadius: 19, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 22 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoMark: { width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  bolt: { color: COLORS.green, fontSize: 29, fontWeight: "900", lineHeight: 32 },
  logo: { color: COLORS.ink, fontSize: 23, fontWeight: "900", fontStyle: "italic", letterSpacing: -1.4 },
  logoLine: { color: COLORS.muted, fontSize: 7, fontWeight: "800", letterSpacing: 1.7, marginTop: 1 },
  avatar: { width: 40, height: 40, borderRadius: 15, backgroundColor: COLORS.ink, alignItems: "center", justifyContent: "center", transform: [{ rotate: "3deg" }] },
  avatarText: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
  onlineDot: { position: "absolute", right: -1, bottom: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.yellow, borderWidth: 2, borderColor: COLORS.cream },
  menuHeadingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 26, marginBottom: 22 },
  menuHeadingRowCompact: { paddingTop: 16, marginBottom: 16 },
  menuEyebrow: { color: COLORS.orange, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.4, marginBottom: 6 },
  menuTitle: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 43, lineHeight: 47, letterSpacing: -1.5 },
  searchBar: { minHeight: 54, borderRadius: 17, backgroundColor: COLORS.white, borderWidth: 1, borderColor: "#DDE3DF", flexDirection: "row", alignItems: "center", paddingHorizontal: 15, marginBottom: 12 },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, minWidth: 0, color: COLORS.ink, fontWeight: "600", paddingVertical: 12 },
  searchClear: { width: 36, height: 36, alignItems: "center", justifyContent: "center", marginRight: -8 },
  categorySuggestionLabel: { color: COLORS.muted, fontSize: 8, fontWeight: "900", letterSpacing: 1.2, marginBottom: 8, marginLeft: 2 },
  categoryRow: { gap: 9, paddingBottom: 24 },
  categoryChip: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, borderWidth: 1, borderColor: "#DDE3DF", backgroundColor: COLORS.white },
  categoryChipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  categoryText: { color: COLORS.muted, fontSize: 14.5, fontWeight: "700" },
  categoryTextActive: { color: COLORS.white },
  menuSectionRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 5, marginBottom: 15 },
  sectionEyebrow: { color: COLORS.orange, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.4, marginBottom: 5 },
  menuSectionTitle: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 24 },
  menuGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 13 },
  menuCard: { width: "48.3%", backgroundColor: COLORS.white, borderRadius: 20, padding: 9 },
  menuCardSingleColumn: { width: "100%" },
  menuCardThreeColumns: { width: "31.7%" },
  menuDrinkVisual: { height: 145, borderRadius: 14, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  menuDrinkTag: { position: "absolute", left: 6, top: 6, color: COLORS.green, backgroundColor: COLORS.white, borderRadius: 8, borderWidth: 1.25, borderColor: COLORS.green, paddingHorizontal: 6, paddingVertical: 4, fontSize: 5.5, fontWeight: "900", letterSpacing: 0.4, zIndex: 5, elevation: 3 },
  menuDrinkName: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 16, lineHeight: 19, minHeight: 40, marginTop: 10 },
  menuDrinkDetail: { color: COLORS.muted, fontSize: 7.5, lineHeight: 11, minHeight: 28, marginTop: 4 },
  menuDrinkPrice: { color: COLORS.ink, fontSize: 11, fontWeight: "900" },
  productPhoto: { width: "100%", height: "100%", borderRadius: 14 },
  productPhotoPlaceholderBase: { borderRadius: 15, borderWidth: 1.5, borderStyle: "dashed", borderColor: COLORS.green, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, zIndex: 2 },
  productPhotoPlaceholder: { width: "78%", height: "68%", backgroundColor: "rgba(255, 255, 255, 0.94)" },
  productPhotoIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#E5EAE7", alignItems: "center", justifyContent: "center", marginBottom: 7 },
  productPhotoLabel: { color: COLORS.orange, fontSize: 7, fontWeight: "900", letterSpacing: 1.1, textAlign: "center" },
  productPhotoName: { color: COLORS.ink, fontSize: 8.5, lineHeight: 11, fontWeight: "800", textAlign: "center", marginTop: 3 },
  drinkBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  addButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.orange, alignItems: "center", justifyContent: "center" },
  addButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "800", marginTop: -2 },
  emptySearchCard: { width: "100%", backgroundColor: COLORS.white, borderRadius: 22, paddingHorizontal: 24, paddingVertical: 30, alignItems: "center", borderWidth: 1, borderColor: "#DDE3DF" },
  emptySearchIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: "#F3F5F4", alignItems: "center", justifyContent: "center", marginBottom: 13 },
  emptySearchTitle: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 21, textAlign: "center" },
  emptySearchCopy: { color: COLORS.muted, fontSize: 9, lineHeight: 14, textAlign: "center", marginTop: 6 },
  emptySearchButton: { backgroundColor: COLORS.orange, borderRadius: 18, paddingHorizontal: 18, paddingVertical: 11, marginTop: 17 },
  emptySearchButtonText: { color: COLORS.white, fontSize: 9, fontWeight: "900" },
});
