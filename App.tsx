import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import * as NavigationBar from "expo-navigation-bar";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Easing,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  EMPTY_CART,
  PLACEHOLDER_SESSION,
  type CartItem,
  type CartState,
  type ProductCustomization,
} from "./appState";

const COLORS = {
  ink: "#153F32",
  cream: "#C9C7A7",
  orange: "#D4A62A",
  yellow: "#E2B52F",
  green: "#204C3B",
  muted: "#526659",
  white: "#EEEBCB",
};

const categories = ["For you", "Coffee", "Non-coffee", "Snacks"];
const sizeOptions: ProductCustomization["size"][] = ["Small", "Regular", "Large"];
const temperatureOptions: ProductCustomization["temperature"][] = ["Hot", "Iced"];
const sugarOptions: ProductCustomization["sugar"][] = ["0%", "25%", "50%", "75%", "100%"];
const iceOptions: ProductCustomization["ice"][] = ["No ice", "Less ice", "Normal ice", "Extra ice"];
const milkOptions: ProductCustomization["milk"][] = ["Fresh milk", "Oat milk", "Soy milk", "Almond milk"];
const extraOptions = [
  { name: "Extra espresso shot", price: 7000 },
  { name: "Syrup", price: 5000 },
  { name: "Whipped cream", price: 6000 },
  { name: "Caramel", price: 5000 },
  { name: "Additional topping", price: 6000 },
];

const defaultCustomization: ProductCustomization = {
  size: "Regular",
  temperature: "Iced",
  sugar: "50%",
  ice: "Normal ice",
  milk: "Fresh milk",
  extras: [],
  note: "",
};

const formatRupiah = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;

const getConfiguredPrice = (drink: Drink, options: ProductCustomization) => {
  if (drink.category === "Snacks") return drink.basePrice;
  const sizeAdjustment = options.size === "Large" ? 5000 : options.size === "Small" ? -3000 : 0;
  const milkAdjustment = options.milk === "Oat milk" || options.milk === "Almond milk"
    ? 7000
    : options.milk === "Soy milk" ? 5000 : 0;
  const extrasAdjustment = options.extras.reduce(
    (total, extraName) => total + (extraOptions.find((extra) => extra.name === extraName)?.price ?? 0),
    0,
  );
  return drink.basePrice + sizeAdjustment + milkAdjustment + extrasAdjustment;
};

type Drink = {
  id: number;
  name: string;
  detail: string;
  price: string;
  basePrice: number;
  accent: string;
  coffee: string;
  tag: string;
  category: "Coffee" | "Non-coffee" | "Snacks";
};

const drinks: Drink[] = [
  {
    id: 1,
    name: "Power Latte",
    detail: "Double espresso · oat milk",
    price: "Rp 42k",
    basePrice: 42000,
    accent: "#D9B38A",
    coffee: "#704129",
    tag: "BESTSELLER",
    category: "Coffee",
  },
  {
    id: 2,
    name: "Orange Bolt",
    detail: "Espresso · orange tonic",
    price: "Rp 39k",
    basePrice: 39000,
    accent: "#EE9851",
    coffee: "#7A3825",
    tag: "NEW",
    category: "Coffee",
  },
  {
    id: 3,
    name: "Sesame Charge",
    detail: "Black sesame · fresh milk",
    price: "Rp 44k",
    basePrice: 44000,
    accent: "#A9A79C",
    coffee: "#413A35",
    tag: "SIGNATURE",
    category: "Non-coffee",
  },
  {
    id: 4,
    name: "Matcha Pow",
    detail: "Ceremonial matcha · oat milk",
    price: "Rp 45k",
    basePrice: 45000,
    accent: "#9BAC75",
    coffee: "#66804C",
    tag: "FRESH",
    category: "Non-coffee",
  },
  {
    id: 5,
    name: "Cocoa Kick",
    detail: "Dark cocoa · fresh milk",
    price: "Rp 38k",
    basePrice: 38000,
    accent: "#B68A6D",
    coffee: "#56382C",
    tag: "CLASSIC",
    category: "Non-coffee",
  },
  {
    id: 6,
    name: "Long Black",
    detail: "Double espresso · water",
    price: "Rp 32k",
    basePrice: 32000,
    accent: "#948274",
    coffee: "#33231D",
    tag: "STRONG",
    category: "Coffee",
  },
  {
    id: 7,
    name: "Butter Croffle",
    detail: "Caramelized · sea salt",
    price: "Rp 35k",
    basePrice: 35000,
    accent: "#D3A45F",
    coffee: "#8B5D35",
    tag: "CRISPY",
    category: "Snacks",
  },
  {
    id: 8,
    name: "Power Banana",
    detail: "Banana loaf · brown butter",
    price: "Rp 34k",
    basePrice: 34000,
    accent: "#D9B75D",
    coffee: "#7A5330",
    tag: "BAKED",
    category: "Snacks",
  },
];

function Bolt({ small = false }: { small?: boolean }) {
  return <Text style={[styles.bolt, small && styles.boltSmall]}>ϟ</Text>;
}

function DrinkCup({ color, coffee }: { color: string; coffee: string }) {
  return (
    <View style={[styles.cupShadow, { backgroundColor: color }]}>
      <View style={styles.cupLid} />
      <View style={[styles.coffeeFill, { backgroundColor: coffee }]} />
      <View style={styles.cupLogo}>
        <Bolt small />
        <Text style={styles.cupLogoText}>KP</Text>
      </View>
    </View>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState<"Home" | "Menu" | "Cart" | "Rewards">("Home");
  const [activeCategory, setActiveCategory] = useState("For you");
  const [cart, setCart] = useState<CartState>(EMPTY_CART);
  const [selectedDrink, setSelectedDrink] = useState<Drink | null>(null);
  const [customization, setCustomization] = useState<ProductCustomization>(defaultCustomization);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const splashOpacity = useRef(new Animated.Value(0)).current;
  const splashScale = useRef(new Animated.Value(0.72)).current;
  const chargingProgress = useRef(new Animated.Value(0)).current;
  const navigationHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentUser = PLACEHOLDER_SESSION.user;
  const cartItemCount = cart.items.reduce((total, item) => total + item.quantity, 0);
  const cartSubtotal = cart.items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  const filteredDrinks = activeCategory === "For you"
    ? drinks
    : drinks.filter((drink) => drink.category === activeCategory);

  const openCustomizer = (drink: Drink) => {
    setCustomization({ ...defaultCustomization, extras: [] });
    setSelectedDrink(drink);
  };

  const closeCustomizer = () => setSelectedDrink(null);

  const toggleExtra = (extraName: string) => {
    setCustomization((current) => ({
      ...current,
      extras: current.extras.includes(extraName)
        ? current.extras.filter((name) => name !== extraName)
        : [...current.extras, extraName],
    }));
  };

  const addConfiguredItemToCart = () => {
    if (!selectedDrink) return;

    const isSnack = selectedDrink.category === "Snacks";
    const itemCustomization = isSnack ? null : { ...customization, extras: [...customization.extras] };
    const item: CartItem = {
      lineId: `${selectedDrink.id}-${Date.now()}`,
      productId: selectedDrink.id,
      name: selectedDrink.name,
      category: selectedDrink.category,
      accent: selectedDrink.accent,
      coffee: selectedDrink.coffee,
      unitPrice: getConfiguredPrice(selectedDrink, customization),
      quantity: 1,
      note: customization.note.trim(),
      customization: itemCustomization,
    };

    setCart((currentCart) => ({ ...currentCart, items: [...currentCart.items, item] }));
    closeCustomizer();
  };

  const updateCartQuantity = (lineId: string, change: number) => {
    setCart((currentCart) => ({
      ...currentCart,
      items: currentCart.items
        .map((item) => item.lineId === lineId ? { ...item, quantity: item.quantity + change } : item)
        .filter((item) => item.quantity > 0),
    }));
  };

  const removeCartItem = (lineId: string) => {
    setCart((currentCart) => ({
      ...currentCart,
      items: currentCart.items.filter((item) => item.lineId !== lineId),
    }));
  };

  const refreshContent = () => {
    setIsRefreshing(true);

    // Replace this short delay with menu, profile, and order API requests later.
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => setIsRefreshing(false), 800);
  };

  const pullToRefresh = (
    <RefreshControl
      refreshing={isRefreshing}
      onRefresh={refreshContent}
      colors={[COLORS.green]}
      progressBackgroundColor={COLORS.white}
      tintColor={COLORS.green}
    />
  );

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const hideNavigationBar = () => {
      void NavigationBar.setVisibilityAsync("hidden");
    };

    const scheduleNavigationBarHide = (delay = 250) => {
      if (navigationHideTimer.current) clearTimeout(navigationHideTimer.current);
      navigationHideTimer.current = setTimeout(hideNavigationBar, delay);
    };

    hideNavigationBar();

    const visibilitySubscription = NavigationBar.addVisibilityListener(({ visibility }) => {
      if (visibility === "visible") scheduleNavigationBarHide();
    });

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") scheduleNavigationBarHide(100);
    });

    return () => {
      visibilitySubscription.remove();
      appStateSubscription.remove();
      if (navigationHideTimer.current) clearTimeout(navigationHideTimer.current);
    };
  }, []);

  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.parallel([
        Animated.timing(splashOpacity, {
          toValue: 1,
          duration: 360,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(splashScale, {
          toValue: 1,
          damping: 8,
          stiffness: 145,
          mass: 0.75,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(650),
      Animated.timing(splashOpacity, {
        toValue: 0,
        duration: 280,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start(({ finished }) => {
      if (finished) setShowSplash(false);
    });

    return () => animation.stop();
  }, [splashOpacity, splashScale]);

  useEffect(() => {
    if (activeTab !== "Rewards") {
      chargingProgress.stopAnimation();
      chargingProgress.setValue(0);
      return;
    }

    const chargingAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(chargingProgress, {
          toValue: 1,
          duration: 800,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(chargingProgress, {
          toValue: 0,
          duration: 800,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );

    chargingAnimation.start();
    return () => chargingAnimation.stop();
  }, [activeTab, chargingProgress]);

  if (showSplash) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.splashSafeArea}>
          <StatusBar hidden />
          <Animated.View style={[styles.splashLogo, { opacity: splashOpacity, transform: [{ scale: splashScale }] }]}>
            <View style={styles.splashLogoMark}><Text style={styles.splashBolt}>ϟ</Text></View>
            <Text style={styles.splashName}>Kopi POW!</Text>
            <Text style={styles.splashTagline}>99% REAAAADY TO GOW</Text>
          </Animated.View>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar hidden />
        {activeTab === "Home" ? <ScrollView key="home-screen" style={styles.screen} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} removeClippedSubviews={false} refreshControl={pullToRefresh}>
        <View style={styles.topBar}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark}><Bolt /></View>
            <View>
              <Text style={styles.logo}>Kopi POW!</Text>
              <Text style={styles.logoLine}>99% REAAAADY TO GOW</Text>
            </View>
          </View>
          <Pressable style={styles.avatar} accessibilityLabel="Open profile">
            <Text style={styles.avatarText}>{currentUser.initials}</Text>
            <View style={styles.onlineDot} />
          </Pressable>
        </View>

        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>Good morning, {currentUser.displayName}.</Text>
          <Text style={styles.headline}>Ready to power{`\n`}your way?</Text>
          <View style={styles.headlineBolt}><Bolt /></View>
        </View>

        <View style={styles.powerCardShadow}>
          <View style={styles.powerCard} collapsable={false}>
            <View style={styles.powerCardCopy}>
              <Text style={styles.powerKicker}>TODAY&apos;S POWER-UP</Text>
              <Text style={styles.powerTitle}>Iced Power Latte!</Text>
              <Text style={styles.powerDetail}>Oat milk · less sweet · double shot</Text>
              <Pressable style={styles.quickOrder} onPress={() => openCustomizer(drinks[0])}>
                <Text style={styles.quickOrderText}>Order today&apos;s pick</Text>
                <Text style={styles.quickOrderArrow}>→</Text>
              </Pressable>
            </View>
            <View style={styles.heroCupWrap}>
              <View style={styles.heroSun} />
              <DrinkCup color="#DAB586" coffee="#6C3D27" />
            </View>
          </View>
        </View>

        <View style={styles.sectionTitleRow}>
          <View>
            <Text style={styles.sectionEyebrow}>TAKE A SMALL SIP</Text>
            <Text style={styles.sectionTitle}>Popular right now</Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.drinkRow}
        >
          {drinks.slice(0, 3).map((drink) => (
            <View key={drink.id} style={styles.drinkCard}>
              <View style={[styles.drinkVisual, { backgroundColor: drink.accent }]}>
                <Text style={styles.drinkTag}>{drink.tag}</Text>
                <DrinkCup color="#DDBF98" coffee={drink.coffee} />
              </View>
              <Text style={styles.drinkName}>{drink.name}</Text>
              <Text style={styles.drinkDetail}>{drink.detail}</Text>
              <View style={styles.drinkBottom}>
                <Text style={styles.drinkPrice}>{drink.price}</Text>
                <Pressable
                  style={styles.addButton}
                  accessibilityLabel={`Add ${drink.name}`}
                  onPress={() => openCustomizer(drink)}
                >
                  <Text style={styles.addButtonText}>＋</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </ScrollView>

        <View style={styles.rewardCard}>
          <View style={styles.rewardIcon}><Text style={styles.powText}>POW!</Text></View>
          <View style={styles.rewardCopy}>
            <Text style={styles.rewardTitle}>4 more sips to a free drink</Text>
            <Text style={styles.rewardDetail}>You&apos;re 60% powered</Text>
            <View style={styles.progressTrack}><View style={styles.progressFill} /></View>
          </View>
          <Text style={styles.rewardArrow}>›</Text>
        </View>
      </ScrollView> : activeTab === "Menu" ? <ScrollView key="menu-screen" style={styles.screen} contentContainerStyle={styles.menuContent} showsVerticalScrollIndicator={false} removeClippedSubviews={false} refreshControl={pullToRefresh}>
        <View style={styles.topBar}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark}><Bolt /></View>
            <View>
              <Text style={styles.logo}>Kopi POW!</Text>
              <Text style={styles.logoLine}>99% REAAAADY TO GOW</Text>
            </View>
          </View>
          <Pressable style={styles.avatar} accessibilityLabel="Open profile">
            <Text style={styles.avatarText}>{currentUser.initials}</Text>
            <View style={styles.onlineDot} />
          </Pressable>
        </View>

        <View style={styles.menuHeadingRow}>
          <View>
            <Text style={styles.menuEyebrow}>CHOOSE YOUR POWER</Text>
            <Text style={styles.menuTitle}>The Menu!</Text>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>⌕</Text>
          <Text style={styles.searchPlaceholder}>Search your next power-up</Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {categories.map((category) => {
            const selected = category === activeCategory;
            return (
              <Pressable key={category} onPress={() => setActiveCategory(category)} style={[styles.categoryChip, selected && styles.categoryChipActive]}>
                <Text style={[styles.categoryText, selected && styles.categoryTextActive]}>{category}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.menuSectionRow}>
          <View>
            <Text style={styles.sectionEyebrow}>{activeCategory === "For you" ? "ALL-DAY POWER" : activeCategory.toUpperCase()}</Text>
            <Text style={styles.menuSectionTitle}>{activeCategory === "For you" ? "Made for every mood" : `${activeCategory} picks`}</Text>
          </View>
          <Text style={styles.swipeHint}>SCROLL ↓</Text>
        </View>

        <View style={styles.menuGrid}>
          {filteredDrinks.map((drink) => (
            <View key={drink.id} style={styles.menuCard}>
              <View style={[styles.menuDrinkVisual, { backgroundColor: drink.accent }]}> 
                <Text style={styles.menuDrinkTag}>{drink.tag}</Text>
                <View style={styles.menuCupScale}><DrinkCup color="#DDBF98" coffee={drink.coffee} /></View>
              </View>
              <Text style={styles.menuDrinkName}>{drink.name}</Text>
              <Text style={styles.menuDrinkDetail}>{drink.detail}</Text>
              <View style={styles.drinkBottom}>
                <Text style={styles.menuDrinkPrice}>{drink.price}</Text>
                <Pressable style={styles.addButton} accessibilityLabel={`Customize ${drink.name}`} onPress={() => openCustomizer(drink)}>
                  <Text style={styles.addButtonText}>＋</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>
      </ScrollView> : activeTab === "Rewards" ? <ScrollView key="rewards-screen" style={styles.screen} contentContainerStyle={styles.rewardsPage} showsVerticalScrollIndicator={false} removeClippedSubviews={false} refreshControl={pullToRefresh}>
        <View style={styles.topBar}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark}><Bolt /></View>
            <View>
              <Text style={styles.logo}>Kopi POW!</Text>
              <Text style={styles.logoLine}>99% REAAAADY TO GOW</Text>
            </View>
          </View>
          <Pressable style={styles.avatar} accessibilityLabel="Open profile">
            <Text style={styles.avatarText}>{currentUser.initials}</Text>
            <View style={styles.onlineDot} />
          </Pressable>
        </View>

        <View style={styles.comingSoonContent}>
          <View style={styles.comingSoonBurst}>
            <Text style={styles.comingSoonIcon}>ϟ</Text>
          </View>
          <Animated.View
            style={[
              styles.comingSoonEyebrowOutline,
              {
                transform: [{
                  scale: chargingProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [1, 1.045],
                  }),
                }],
              },
            ]}
          >
            <Animated.View style={[styles.chargingGlow, { opacity: chargingProgress }]} />
            <Text style={styles.comingSoonEyebrow}>REWARDS ARE CHARGING</Text>
          </Animated.View>
          <Text style={styles.comingSoonTitle}>Something powerful{`\n`}is coming!</Text>
          <Text style={styles.comingSoonCopy}>We&apos;re brewing a rewards experience worth waiting for. Check back soon.</Text>
        </View>
      </ScrollView> : <ScrollView key="cart-screen" style={styles.screen} contentContainerStyle={styles.cartContent} showsVerticalScrollIndicator={false} removeClippedSubviews={false} refreshControl={pullToRefresh}>
        <View style={styles.topBar}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark}><Bolt /></View>
            <View>
              <Text style={styles.logo}>Kopi POW!</Text>
              <Text style={styles.logoLine}>99% REAAAADY TO GOW</Text>
            </View>
          </View>
          <Pressable style={styles.avatar} accessibilityLabel="Open profile">
            <Text style={styles.avatarText}>{currentUser.initials}</Text>
            <View style={styles.onlineDot} />
          </Pressable>
        </View>

        <View style={styles.cartHeading}>
          <Text style={styles.menuEyebrow}>YOUR POWER-UPS</Text>
          <Text style={styles.menuTitle}>Your Cart!</Text>
          <Text style={styles.cartHeadingCopy}>{cartItemCount} {cartItemCount === 1 ? "item" : "items"} ready to go</Text>
        </View>

        {cart.items.length === 0 ? <View style={styles.emptyCart}>
          <View style={styles.emptyCartIcon}><Ionicons name="cart-outline" size={48} color={COLORS.green} /></View>
          <Text style={styles.emptyCartTitle}>Your cart needs power.</Text>
          <Text style={styles.emptyCartCopy}>Choose a drink or snack from the menu to get started.</Text>
          <Pressable style={styles.browseMenuButton} onPress={() => setActiveTab("Menu")}>
            <Text style={styles.browseMenuButtonText}>Browse the menu</Text>
          </Pressable>
        </View> : <>
          <View style={styles.cartList}>
            {cart.items.map((item) => (
              <View key={item.lineId} style={styles.cartItemCard}>
                <View style={[styles.cartItemVisual, { backgroundColor: item.accent }]}>
                  {item.category === "Snacks"
                    ? <Ionicons name="fast-food-outline" size={34} color={COLORS.green} />
                    : <Ionicons name="cafe-outline" size={36} color={COLORS.green} />}
                </View>
                <View style={styles.cartItemBody}>
                  <View style={styles.cartItemTitleRow}>
                    <Text style={styles.cartItemName}>{item.name}</Text>
                    <Pressable accessibilityLabel={`Remove ${item.name}`} onPress={() => removeCartItem(item.lineId)}>
                      <Ionicons name="trash-outline" size={19} color={COLORS.muted} />
                    </Pressable>
                  </View>
                  {item.customization && <>
                    <Text style={styles.cartItemOptions}>{item.customization.size} · {item.customization.temperature} · {item.customization.sugar} sugar</Text>
                    <Text style={styles.cartItemOptions}>{item.customization.milk} · {item.customization.ice}</Text>
                    {item.customization.extras.length > 0 && <Text style={styles.cartItemOptions}>+ {item.customization.extras.join(", ")}</Text>}
                  </>}
                  {item.note.length > 0 && <Text style={styles.cartItemNote}>“{item.note}”</Text>}
                  <View style={styles.cartItemBottom}>
                    <Text style={styles.cartItemPrice}>{formatRupiah(item.unitPrice * item.quantity)}</Text>
                    <View style={styles.quantityControl}>
                      <Pressable style={styles.quantityButton} onPress={() => updateCartQuantity(item.lineId, -1)}><Text style={styles.quantityButtonText}>−</Text></Pressable>
                      <Text style={styles.quantityValue}>{item.quantity}</Text>
                      <Pressable style={styles.quantityButton} onPress={() => updateCartQuantity(item.lineId, 1)}><Text style={styles.quantityButtonText}>＋</Text></Pressable>
                    </View>
                  </View>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.cartSummary}>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryValue}>{formatRupiah(cartSubtotal)}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Discount</Text><Text style={styles.summaryMuted}>—</Text></View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}><Text style={styles.summaryTotalLabel}>Estimated total</Text><Text style={styles.summaryTotal}>{formatRupiah(cartSubtotal)}</Text></View>
            <Text style={styles.summaryNote}>Tax, service fees, promotions, and the final payable amount will be validated by the backend at checkout.</Text>
          </View>

          <Pressable style={styles.checkoutLaterButton} disabled>
            <Text style={styles.checkoutLaterText}>CHECKOUT · NEXT PHASE</Text>
          </Pressable>
        </>}
      </ScrollView>}

        <View style={styles.bottomNav}>
          <Pressable style={styles.navItem} onPress={() => setActiveTab("Home")}><Text style={activeTab === "Home" ? styles.navIconActive : styles.navIcon}>⌂</Text><Text style={activeTab === "Home" ? styles.navLabelActive : styles.navLabel}>Home</Text></Pressable>
          <Pressable style={styles.navItem} onPress={() => setActiveTab("Menu")}><Text style={activeTab === "Menu" ? styles.navIconActive : styles.navIcon}>▤</Text><Text style={activeTab === "Menu" ? styles.navLabelActive : styles.navLabel}>Menu</Text></Pressable>
          <Pressable style={[styles.cartButton, activeTab === "Cart" && styles.cartButtonActive]} accessibilityLabel={`Cart with ${cartItemCount} items`} onPress={() => setActiveTab("Cart")}>
            <Ionicons name="cart-outline" size={29} color={COLORS.white} />
            {cartItemCount > 0 && <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{cartItemCount}</Text></View>}
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => setActiveTab("Rewards")}><Text style={activeTab === "Rewards" ? styles.navIconActive : styles.navIcon}>♡</Text><Text style={activeTab === "Rewards" ? styles.navLabelActive : styles.navLabel}>Rewards</Text></Pressable>
          <Pressable style={styles.navItem}><Text style={styles.navIcon}>○</Text><Text style={styles.navLabel}>Profile</Text></Pressable>
        </View>

        <Modal visible={selectedDrink !== null} transparent animationType="slide" onRequestClose={closeCustomizer}>
          <View style={styles.modalBackdrop}>
            <View style={styles.customizerSheet}>
              {selectedDrink && <>
                <View style={styles.customizerHandle} />
                <View style={styles.customizerHeader}>
                  <View>
                    <Text style={styles.customizerEyebrow}>{selectedDrink.category === "Snacks" ? "ADD A TREAT" : "BUILD YOUR POWER-UP"}</Text>
                    <Text style={styles.customizerTitle}>{selectedDrink.name}</Text>
                    <Text style={styles.customizerBasePrice}>Starts at {formatRupiah(selectedDrink.basePrice)}</Text>
                  </View>
                  <Pressable style={styles.closeButton} accessibilityLabel="Close customization" onPress={closeCustomizer}>
                    <Ionicons name="close" size={23} color={COLORS.green} />
                  </Pressable>
                </View>

                <ScrollView style={styles.customizerScroll} contentContainerStyle={styles.customizerScrollContent} showsVerticalScrollIndicator={false}>
                  {selectedDrink.category !== "Snacks" && <>
                    <View style={styles.optionGroup}>
                      <Text style={styles.optionTitle}>Size</Text>
                      <View style={styles.optionWrap}>{sizeOptions.map((option) => <Pressable key={option} style={[styles.optionChip, customization.size === option && styles.optionChipActive]} onPress={() => setCustomization((current) => ({ ...current, size: option }))}><Text style={[styles.optionChipText, customization.size === option && styles.optionChipTextActive]}>{option}{option === "Small" ? " · −3k" : option === "Large" ? " · +5k" : ""}</Text></Pressable>)}</View>
                    </View>

                    <View style={styles.optionGroup}>
                      <Text style={styles.optionTitle}>Temperature</Text>
                      <View style={styles.optionWrap}>{temperatureOptions.map((option) => <Pressable key={option} style={[styles.optionChip, customization.temperature === option && styles.optionChipActive]} onPress={() => setCustomization((current) => ({ ...current, temperature: option }))}><Text style={[styles.optionChipText, customization.temperature === option && styles.optionChipTextActive]}>{option}</Text></Pressable>)}</View>
                    </View>

                    <View style={styles.optionGroup}>
                      <Text style={styles.optionTitle}>Sugar</Text>
                      <View style={styles.optionWrap}>{sugarOptions.map((option) => <Pressable key={option} style={[styles.optionChip, customization.sugar === option && styles.optionChipActive]} onPress={() => setCustomization((current) => ({ ...current, sugar: option }))}><Text style={[styles.optionChipText, customization.sugar === option && styles.optionChipTextActive]}>{option}</Text></Pressable>)}</View>
                    </View>

                    {customization.temperature === "Iced" && <View style={styles.optionGroup}>
                      <Text style={styles.optionTitle}>Ice</Text>
                      <View style={styles.optionWrap}>{iceOptions.map((option) => <Pressable key={option} style={[styles.optionChip, customization.ice === option && styles.optionChipActive]} onPress={() => setCustomization((current) => ({ ...current, ice: option }))}><Text style={[styles.optionChipText, customization.ice === option && styles.optionChipTextActive]}>{option}</Text></Pressable>)}</View>
                    </View>}

                    <View style={styles.optionGroup}>
                      <Text style={styles.optionTitle}>Milk</Text>
                      <View style={styles.optionWrap}>{milkOptions.map((option) => <Pressable key={option} style={[styles.optionChip, customization.milk === option && styles.optionChipActive]} onPress={() => setCustomization((current) => ({ ...current, milk: option }))}><Text style={[styles.optionChipText, customization.milk === option && styles.optionChipTextActive]}>{option}{option === "Soy milk" ? " · +5k" : option !== "Fresh milk" ? " · +7k" : ""}</Text></Pressable>)}</View>
                    </View>

                    <View style={styles.optionGroup}>
                      <Text style={styles.optionTitle}>Extras · choose multiple</Text>
                      <View style={styles.optionWrap}>{extraOptions.map((extra) => {
                        const selected = customization.extras.includes(extra.name);
                        return <Pressable key={extra.name} style={[styles.optionChip, selected && styles.optionChipActive]} onPress={() => toggleExtra(extra.name)}><Text style={[styles.optionChipText, selected && styles.optionChipTextActive]}>{extra.name} · +{extra.price / 1000}k</Text></Pressable>;
                      })}</View>
                    </View>
                  </>}

                  <View style={styles.optionGroup}>
                    <Text style={styles.optionTitle}>Notes · optional</Text>
                    <TextInput
                      style={styles.noteInput}
                      value={customization.note}
                      onChangeText={(note) => setCustomization((current) => ({ ...current, note }))}
                      placeholder={selectedDrink.category === "Snacks" ? "Example: warm it up, please" : "Example: extra hot, no straw"}
                      placeholderTextColor="#8A9188"
                      maxLength={120}
                      multiline
                    />
                  </View>
                </ScrollView>

                <View style={styles.customizerFooter}>
                  <Pressable style={styles.addConfiguredButton} onPress={addConfiguredItemToCart}>
                    <Text style={styles.addConfiguredText}>Add to cart</Text>
                    <Text style={styles.addConfiguredPrice}>{formatRupiah(getConfiguredPrice(selectedDrink, customization))}</Text>
                  </Pressable>
                </View>
              </>}
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splashSafeArea: { flex: 1, backgroundColor: COLORS.cream, alignItems: "center", justifyContent: "center" },
  splashLogo: { alignItems: "center", justifyContent: "center" },
  splashLogoMark: { width: 92, height: 92, borderRadius: 30, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-5deg" }], marginBottom: 22 },
  splashBolt: { color: COLORS.green, fontSize: 67, fontWeight: "900", lineHeight: 73 },
  splashName: { color: COLORS.ink, fontSize: 39, fontWeight: "900", fontStyle: "italic", letterSpacing: -2.2 },
  splashTagline: { color: COLORS.muted, fontSize: 9, fontWeight: "900", letterSpacing: 2.3, marginTop: 7 },
  safeArea: { flex: 1, backgroundColor: COLORS.cream },
  screen: { flex: 1, backgroundColor: COLORS.cream },
  rewardsPage: { flexGrow: 1, backgroundColor: COLORS.cream, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 108 },
  comingSoonContent: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingBottom: 20 },
  comingSoonBurst: { width: 142, height: 142, borderRadius: 48, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", marginBottom: 32 },
  comingSoonIcon: { color: COLORS.green, fontSize: 88, fontWeight: "900", lineHeight: 96, textAlign: "center" },
  comingSoonEyebrowOutline: { borderWidth: 1.5, borderColor: COLORS.green, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 14, overflow: "hidden" },
  chargingGlow: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(32, 76, 59, 0.14)" },
  comingSoonEyebrow: { color: COLORS.green, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.7, zIndex: 1 },
  comingSoonTitle: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontSize: 36, lineHeight: 39, fontWeight: "900", letterSpacing: -1.3, textAlign: "center" },
  comingSoonCopy: { color: COLORS.muted, fontSize: 13, lineHeight: 20, textAlign: "center", maxWidth: 300, marginTop: 16 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 118 },
  menuContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 118 },
  cartContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 128 },
  cartHeading: { paddingTop: 22, marginBottom: 24 },
  cartHeadingCopy: { color: COLORS.muted, fontSize: 12, fontWeight: "600", marginTop: 8 },
  emptyCart: { alignItems: "center", justifyContent: "center", paddingTop: 72, paddingHorizontal: 30 },
  emptyCartIcon: { width: 104, height: 104, borderRadius: 34, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", marginBottom: 25 },
  emptyCartTitle: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontWeight: "900", fontSize: 27, textAlign: "center" },
  emptyCartCopy: { color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: "center", maxWidth: 260, marginTop: 10 },
  browseMenuButton: { backgroundColor: COLORS.green, borderRadius: 22, paddingHorizontal: 22, paddingVertical: 13, marginTop: 23 },
  browseMenuButtonText: { color: COLORS.white, fontSize: 11, fontWeight: "900" },
  cartList: { gap: 12 },
  cartItemCard: { flexDirection: "row", backgroundColor: COLORS.white, borderRadius: 20, padding: 11 },
  cartItemVisual: { width: 72, minHeight: 94, borderRadius: 15, alignItems: "center", justifyContent: "center", marginRight: 12 },
  cartItemBody: { flex: 1 },
  cartItemTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cartItemName: { flex: 1, color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontSize: 17, fontWeight: "900" },
  cartItemOptions: { color: COLORS.muted, fontSize: 8.5, lineHeight: 13, marginTop: 3 },
  cartItemNote: { color: COLORS.orange, fontSize: 8.5, fontStyle: "italic", lineHeight: 13, marginTop: 4 },
  cartItemBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  cartItemPrice: { color: COLORS.ink, fontSize: 11, fontWeight: "900" },
  quantityControl: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.cream, borderRadius: 16, padding: 3 },
  quantityButton: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  quantityButtonText: { color: COLORS.green, fontSize: 16, fontWeight: "900", lineHeight: 19 },
  quantityValue: { color: COLORS.ink, fontSize: 11, fontWeight: "900", minWidth: 28, textAlign: "center" },
  cartSummary: { backgroundColor: COLORS.green, borderRadius: 22, padding: 18, marginTop: 18 },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 9 },
  summaryLabel: { color: "#D5DBD1", fontSize: 11, fontWeight: "600" },
  summaryValue: { color: COLORS.white, fontSize: 11, fontWeight: "800" },
  summaryMuted: { color: "#AAB5AC", fontSize: 11, fontWeight: "800" },
  summaryDivider: { height: 1, backgroundColor: "#4B6B5D", marginVertical: 7 },
  summaryTotalLabel: { color: COLORS.yellow, fontFamily: "serif", fontStyle: "italic", fontSize: 17, fontWeight: "900" },
  summaryTotal: { color: COLORS.yellow, fontSize: 17, fontWeight: "900" },
  summaryNote: { color: "#AEBBB1", fontSize: 8, lineHeight: 12, marginTop: 6 },
  checkoutLaterButton: { backgroundColor: "#9C9B86", borderRadius: 22, alignItems: "center", paddingVertical: 15, marginTop: 14 },
  checkoutLaterText: { color: COLORS.white, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#BBB99A", borderRadius: 19, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 22 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoMark: { width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  bolt: { color: COLORS.green, fontSize: 29, fontWeight: "900", lineHeight: 32 },
  boltSmall: { fontSize: 17, lineHeight: 18 },
  logo: { color: COLORS.ink, fontSize: 23, fontWeight: "900", fontStyle: "italic", letterSpacing: -1.4 },
  logoLine: { color: COLORS.muted, fontSize: 7, fontWeight: "800", letterSpacing: 1.7, marginTop: 1 },
  avatar: { width: 40, height: 40, borderRadius: 15, backgroundColor: COLORS.ink, alignItems: "center", justifyContent: "center", transform: [{ rotate: "3deg" }] },
  avatarText: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
  onlineDot: { position: "absolute", right: -1, bottom: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.yellow, borderWidth: 2, borderColor: COLORS.cream },
  greetingBlock: { paddingTop: 34, paddingBottom: 24, position: "relative" },
  greeting: { color: COLORS.muted, fontSize: 13, marginBottom: 8 },
  headline: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontWeight: "900", fontSize: 42, lineHeight: 44, letterSpacing: -1.7 },
  headlineBolt: { position: "absolute", right: 8, bottom: 24, width: 48, height: 48, borderRadius: 16, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", transform: [{ rotate: "8deg" }] },
  categoryRow: { gap: 9, paddingBottom: 24 },
  categoryChip: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 24, borderWidth: 1, borderColor: "#DFDAB8", backgroundColor: COLORS.white },
  categoryChipActive: { backgroundColor: COLORS.ink, borderColor: COLORS.ink },
  categoryText: { color: COLORS.muted, fontSize: 14.5, fontWeight: "700" },
  categoryTextActive: { color: COLORS.white },
  menuHeadingRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingTop: 26, marginBottom: 22 },
  menuEyebrow: { color: COLORS.orange, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.4, marginBottom: 6 },
  menuTitle: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontWeight: "900", fontSize: 43, lineHeight: 47, letterSpacing: -1.5 },
  searchBar: { height: 50, borderRadius: 17, backgroundColor: COLORS.white, borderWidth: 1, borderColor: "#DFDAB8", flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 17 },
  searchIcon: { color: COLORS.green, fontSize: 24, marginRight: 10, marginTop: -3 },
  searchPlaceholder: { color: COLORS.muted, fontSize: 12, fontWeight: "600" },
  menuSectionRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 5, marginBottom: 15 },
  menuSectionTitle: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontSize: 24, fontWeight: "900" },
  swipeHint: { color: COLORS.muted, fontSize: 7, fontWeight: "900", letterSpacing: 1.1, paddingBottom: 3 },
  menuGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 13 },
  menuCard: { width: "48.3%", backgroundColor: COLORS.white, borderRadius: 20, padding: 9 },
  menuDrinkVisual: { height: 145, borderRadius: 14, alignItems: "center", justifyContent: "flex-end", overflow: "hidden" },
  menuCupScale: { transform: [{ scale: 0.85 }], marginBottom: -10 },
  menuDrinkTag: { position: "absolute", left: 8, top: 8, color: COLORS.green, backgroundColor: COLORS.white, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.green, paddingHorizontal: 8, paddingVertical: 5, fontSize: 7.5, fontWeight: "900", letterSpacing: 0.5, zIndex: 5, elevation: 4 },
  menuDrinkName: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontSize: 16, fontWeight: "900", marginTop: 10 },
  menuDrinkDetail: { color: COLORS.muted, fontSize: 7.5, lineHeight: 11, minHeight: 22, marginTop: 4 },
  menuDrinkPrice: { color: COLORS.ink, fontSize: 11, fontWeight: "900" },
  powerCardShadow: { borderRadius: 26, marginBottom: 34, shadowColor: "#071B14", shadowOpacity: 0.42, shadowOffset: { width: 0, height: 12 }, shadowRadius: 16, elevation: 12 },
  powerCard: { minHeight: 208, borderRadius: 26, backgroundColor: COLORS.ink, overflow: "hidden", flexDirection: "row" },
  powerCardCopy: { width: "60%", padding: 21, zIndex: 2 },
  powerKicker: { color: "#D9E0D4", fontSize: 7, fontWeight: "800", letterSpacing: 1.35, marginBottom: 11 },
  powerTitle: { color: COLORS.yellow, fontFamily: "serif", fontStyle: "italic", fontSize: 25, fontWeight: "900" },
  powerDetail: { color: "#CDD5C8", fontSize: 9, lineHeight: 14, marginTop: 7 },
  quickOrder: { marginTop: 20, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", backgroundColor: COLORS.orange, paddingLeft: 14, paddingRight: 10, paddingVertical: 10, borderRadius: 18 },
  quickOrderText: { color: COLORS.white, fontSize: 9, fontWeight: "800" },
  quickOrderArrow: { color: COLORS.white, marginLeft: 11, fontWeight: "900" },
  heroCupWrap: { flex: 1, alignItems: "center", justifyContent: "flex-end", position: "relative" },
  heroSun: { position: "absolute", top: 28, width: 130, height: 130, borderRadius: 65, backgroundColor: COLORS.yellow },
  cupShadow: { width: 85, height: 137, borderRadius: 10, borderBottomLeftRadius: 27, borderBottomRightRadius: 27, overflow: "hidden", justifyContent: "flex-end", alignItems: "center", marginBottom: -7, shadowColor: "#000", shadowOpacity: 0.2, shadowOffset: { width: 9, height: 10 }, shadowRadius: 10, elevation: 7 },
  cupLid: { position: "absolute", zIndex: 3, top: 0, width: 92, height: 18, borderRadius: 7, backgroundColor: "#EAE4D8", borderBottomWidth: 4, borderColor: "#CBC3B6" },
  coffeeFill: { position: "absolute", top: 17, left: 0, right: 0, height: 72 },
  cupLogo: { zIndex: 4, width: 45, height: 45, borderRadius: 23, borderWidth: 1.5, borderColor: COLORS.white, alignItems: "center", justifyContent: "center", marginBottom: 30 },
  cupLogoText: { color: COLORS.white, fontSize: 8, fontWeight: "900", marginTop: -4 },
  sectionTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 },
  sectionEyebrow: { color: COLORS.orange, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.4, marginBottom: 5 },
  sectionTitle: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontSize: 25, fontWeight: "900" },
  drinkRow: { gap: 13, paddingBottom: 28 },
  drinkCard: { width: 174, backgroundColor: COLORS.white, borderRadius: 20, padding: 10 },
  drinkVisual: { height: 153, borderRadius: 14, alignItems: "center", justifyContent: "flex-end", overflow: "hidden" },
  drinkTag: { position: "absolute", left: 10, top: 10, color: COLORS.green, backgroundColor: COLORS.white, borderRadius: 12, borderWidth: 2, borderColor: COLORS.green, paddingHorizontal: 11, paddingVertical: 7, fontSize: 9.5, fontWeight: "900", letterSpacing: 0.8, zIndex: 5, shadowColor: "#000", shadowOpacity: 0.2, shadowOffset: { width: 0, height: 3 }, shadowRadius: 4, elevation: 5 },
  drinkName: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontSize: 17, fontWeight: "900", marginTop: 12 },
  drinkDetail: { color: COLORS.muted, fontSize: 8, marginTop: 5 },
  drinkBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  drinkPrice: { color: COLORS.ink, fontSize: 11, fontWeight: "900" },
  addButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.orange, alignItems: "center", justifyContent: "center" },
  addButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "800", marginTop: -2 },
  rewardCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.ink, borderRadius: 20, padding: 15 },
  rewardIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: COLORS.orange, alignItems: "center", justifyContent: "center", marginRight: 13 },
  powText: { color: COLORS.green, fontSize: 11, fontWeight: "900", fontStyle: "italic", transform: [{ rotate: "-8deg" }] },
  rewardCopy: { flex: 1 },
  rewardTitle: { color: COLORS.white, fontSize: 12, fontWeight: "800" },
  rewardDetail: { color: "#AEB0A9", fontSize: 8, marginTop: 4 },
  progressTrack: { height: 4, backgroundColor: "#4C4F48", borderRadius: 2, marginTop: 9, overflow: "hidden" },
  progressFill: { width: "60%", height: "100%", backgroundColor: COLORS.yellow },
  rewardArrow: { color: COLORS.white, fontSize: 26, marginLeft: 14 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 34, 27, 0.48)" },
  customizerSheet: { height: "88%", backgroundColor: COLORS.cream, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 10, overflow: "hidden" },
  customizerHandle: { width: 46, height: 5, borderRadius: 3, backgroundColor: "#8E907D", alignSelf: "center", marginBottom: 13 },
  customizerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 20, paddingBottom: 15 },
  customizerEyebrow: { color: COLORS.orange, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginBottom: 5 },
  customizerTitle: { color: COLORS.ink, fontFamily: "serif", fontStyle: "italic", fontSize: 29, fontWeight: "900", letterSpacing: -0.8 },
  customizerBasePrice: { color: COLORS.muted, fontSize: 10, fontWeight: "600", marginTop: 4 },
  closeButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  customizerScroll: { flex: 1 },
  customizerScrollContent: { paddingHorizontal: 20, paddingBottom: 18 },
  optionGroup: { marginBottom: 19 },
  optionTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "900", marginBottom: 9 },
  optionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: { backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: "#DDD8B8", borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9 },
  optionChipActive: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  optionChipText: { color: COLORS.muted, fontSize: 10, fontWeight: "700" },
  optionChipTextActive: { color: COLORS.white, fontWeight: "900" },
  noteInput: { minHeight: 78, borderRadius: 16, backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: "#DDD8B8", color: COLORS.ink, fontSize: 11, lineHeight: 16, paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: "top" },
  customizerFooter: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: "#DDD8B8" },
  addConfiguredButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.green, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 15 },
  addConfiguredText: { color: COLORS.white, fontSize: 12, fontWeight: "900" },
  addConfiguredPrice: { color: COLORS.yellow, fontSize: 12, fontWeight: "900" },
  bottomNav: { position: "absolute", left: 0, right: 0, bottom: 0, height: 94, backgroundColor: COLORS.white, borderTopWidth: 1, borderColor: "#E5E0D6", flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingBottom: 10 },
  navItem: { width: 60, alignItems: "center", justifyContent: "center", gap: 4 },
  navIcon: { color: "#9B9C95", fontSize: 25, lineHeight: 28 },
  navIconActive: { color: COLORS.orange, fontSize: 26, lineHeight: 29 },
  navLabel: { color: "#9B9C95", fontSize: 10.5, fontWeight: "700" },
  navLabelActive: { color: COLORS.orange, fontSize: 10.5, fontWeight: "900" },
  cartButton: { width: 58, height: 58, marginTop: -30, borderRadius: 20, backgroundColor: COLORS.ink, borderWidth: 5, borderColor: COLORS.cream, alignItems: "center", justifyContent: "center" },
  cartButtonActive: { backgroundColor: COLORS.orange },
  cartBadge: { position: "absolute", top: -7, right: -7, minWidth: 21, height: 21, borderRadius: 11, backgroundColor: COLORS.orange, borderWidth: 2, borderColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  cartBadgeText: { color: COLORS.white, fontSize: 8, fontWeight: "900" },
});
