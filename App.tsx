import { Ionicons } from "@expo/vector-icons";
import { PlayfairDisplay_800ExtraBold_Italic } from "@expo-google-fonts/playfair-display/800ExtraBold_Italic";
import { useFonts } from "expo-font";
import { Image, type ImageSource } from "expo-image";
import * as SplashScreen from "expo-splash-screen";
import * as Network from "expo-network";
import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  BackHandler,
  Easing,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  ToastAndroid,
  View,
  useWindowDimensions,
  type AppStateStatus,
} from "react-native";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { AppUpdateManager } from "./components/AppUpdateManager";
import { CheckoutScreen } from "./components/CheckoutScreen";
import { MaintenanceScreen } from "./components/MaintenanceScreen";
import {
  MenuScreen,
  menuDrinks,
  type MenuCategory,
  type MenuDrink,
} from "./components/MenuScreen";
import { MidtransPaymentScreen } from "./components/MidtransPaymentScreen";
import { OrderHistoryScreen } from "./components/OrderHistoryScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { OperationsWorkspace } from "./components/operations/OperationsWorkspace";
import {
  clearGuestCart,
  clearPendingAccountCart,
  loadAccountCart,
  loadGuestCart,
  loadPendingAccountCart,
  replaceAccountCart,
  savePendingAccountCart,
  saveGuestCart,
  type CheckoutOrder,
} from "./lib/cart";
import {
  loadMaintenanceConfig,
  subscribeToMaintenanceConfig,
  type MaintenanceConfig,
} from "./lib/maintenance";
import {
  isActiveOrder,
  loadAccountOrders,
  orderStatusLabel,
  subscribeToOrderChanges,
  type AccountOrder,
} from "./lib/orders";
import { getOrderItemDisplayDetails } from "./lib/orderDetails";
import {
  listenForNotificationResponses,
  listenForPushTokenChanges,
  registerPushNotifications,
  type KopiPowDevicePushToken,
} from "./lib/notifications";
import { paymentGateway } from "./lib/payments";
import { loadHostedProductCatalog } from "./lib/productImages";
import { getResponsiveLayout } from "./lib/responsive";
import {
  DISPLAY_FONT_FAMILY,
  Text,
  TypographyScaleContext,
} from "./lib/typography";
import {
  clearPaymentCheckpoint,
  isTerminalPaymentStatus,
  loadPaymentCheckpoints,
  savePaymentCheckpoint,
} from "./lib/paymentRecovery";
import {
  EMPTY_CART,
  type CartItem,
  type CartState,
  type ProductCustomization,
} from "./appState";
import {
  DEFAULT_PRODUCT_CUSTOMIZATION_CONFIG,
  getConfiguredProductPrice,
  getDefaultCustomization,
} from "./lib/customization";

void SplashScreen.preventAutoHideAsync();

const COLORS = {
  ink: "#153F32",
  cream: "#dee0df",
  orange: "#D4A62A",
  yellow: "#E2B52F",
  green: "#204C3B",
  muted: "#526659",
  white: "#FFFFFF",
};

const formatRupiah = (amount: number) => `Rp ${amount.toLocaleString("id-ID")}`;
const formatOptionAdjustment = (price: number) => price === 0
  ? ""
  : ` · ${price > 0 ? "+" : "−"}${Math.abs(price) / 1000}k`;
const formatCompactOrderDate = (createdAt: string) => new Date(createdAt).toLocaleDateString("id-ID", {
  day: "numeric",
  month: "short",
});

const mergeCartItems = (...itemGroups: CartItem[][]) => {
  const merged = new Map<string, CartItem>();
  itemGroups.flat().forEach((item) => merged.set(item.lineId, item));
  return [...merged.values()];
};

type CartSyncStatus = "loading" | "syncing" | "reconnecting" | "saved" | "error";

const isTemporaryCartSyncError = (error: string) => (
  /abort|network|fetch|timeout|timed out|connection/i.test(error)
);

const getCartSyncErrorMessage = (error: string) => (
  isTemporaryCartSyncError(error)
    ? "Connection was interrupted. Retrying automatically…"
    : error
);

const getConfiguredPrice = (drink: Drink, options: ProductCustomization) => {
  return getConfiguredProductPrice(drink.basePrice, drink.customizationConfig, options);
};

type Drink = MenuDrink;

function Bolt() {
  return <Text style={styles.bolt}>ϟ</Text>;
}

function ProductPhoto({
  imageSource,
  name,
  hero = false,
}: {
  imageSource: ImageSource | null;
  name: string;
  hero?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [imageSource]);

  if (imageSource && !failed) {
    return (
      <Image
        source={imageSource}
        style={hero ? styles.productPhotoHero : styles.productPhoto}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={180}
        onError={() => setFailed(true)}
        accessibilityLabel={`${name} product photo`}
      />
    );
  }

  return (
    <View style={[styles.productPhotoPlaceholderBase, hero ? styles.productPhotoPlaceholderHero : styles.productPhotoPlaceholder]}>
      <View style={styles.productPhotoIcon}>
        <Ionicons name="camera-outline" size={hero ? 27 : 22} color={COLORS.green} />
      </View>
      <Text style={styles.productPhotoLabel} numberOfLines={1}>PHOTO SOON</Text>
      <Text style={styles.productPhotoName} numberOfLines={2}>{name}</Text>
    </View>
  );
}

function KopiPowApp() {
  const {
    access,
    appUser,
    isAccessLoading,
    isAuthenticated,
    session,
    signOut,
    updateDisplayName,
    updatePassword,
  } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const responsiveLayout = getResponsiveLayout(screenWidth, screenHeight);
  const typographyScale = responsiveLayout.typographyScale;
  const responsiveContentStyle = {
    alignSelf: "center" as const,
    maxWidth: responsiveLayout.contentMaxWidth,
    paddingHorizontal: responsiveLayout.gutter,
    width: "100%" as const,
  };
  const [showSplash, setShowSplash] = useState(true);
  const [maintenanceConfig, setMaintenanceConfig] = useState<MaintenanceConfig | null>(null);
  const [activeTab, setActiveTab] = useState<"Home" | "Menu" | "Cart" | "Rewards" | "Profile">("Home");
  const [activeCategory, setActiveCategory] = useState<MenuCategory>("For you");
  const [searchQuery, setSearchQuery] = useState("");
  const [cart, setCart] = useState<CartState>(EMPTY_CART);
  const [cartOwnerKey, setCartOwnerKey] = useState<string | null>(null);
  const [cartSyncStatus, setCartSyncStatus] = useState<CartSyncStatus>("loading");
  const [cartSyncError, setCartSyncError] = useState<string | null>(null);
  const [cartHydrationVersion, setCartHydrationVersion] = useState(0);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutSubmissionInFlight, setCheckoutSubmissionInFlight] = useState(false);
  const [paymentOrder, setPaymentOrder] = useState<CheckoutOrder | null>(null);
  const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [isOrdersLoading, setIsOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [ordersRefreshVersion, setOrdersRefreshVersion] = useState(0);
  const [operationsOrdersSignal, setOperationsOrdersSignal] = useState(0);
  const [networkAvailable, setNetworkAvailable] = useState(true);
  const [selectedDrink, setSelectedDrink] = useState<Drink | null>(null);
  const [customization, setCustomization] = useState<ProductCustomization>(() => getDefaultCustomization(DEFAULT_PRODUCT_CUSTOMIZATION_CONFIG));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [catalogDrinks, setCatalogDrinks] = useState<MenuDrink[]>(menuDrinks);
  const splashOpacity = useRef(new Animated.Value(0)).current;
  const splashScale = useRef(new Animated.Value(0.72)).current;
  const chargingProgress = useRef(new Animated.Value(0)).current;
  const lastBackPressAt = useRef(0);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cartSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cartRetryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cartSyncAbortController = useRef<AbortController | null>(null);
  const cartSyncInFlight = useRef(false);
  const cartSyncQueued = useRef(false);
  const cartHasPendingChanges = useRef(false);
  const cartRevision = useRef(0);
  const cartRetryCount = useRef(0);
  const cartItemsRef = useRef<CartItem[]>([]);
  const cartOwnerKeyRef = useRef<string | null>(null);
  const accountUserIdRef = useRef<string | null>(null);
  const ordersRefreshInFlight = useRef<Promise<void> | null>(null);
  const paymentRecoveryInFlight = useRef<Promise<void> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const networkAvailableRef = useRef(true);
  const skipNextCartSync = useRef(false);
  const localCartSaveQueue = useRef<Promise<void>>(Promise.resolve());
  cartItemsRef.current = cart.items;
  cartOwnerKeyRef.current = cartOwnerKey;
  accountUserIdRef.current = session?.user.id ?? null;
  networkAvailableRef.current = networkAvailable;
  const currentUser = appUser;
  const drinks = catalogDrinks;
  const cartItemCount = cart.items.reduce((total, item) => total + item.quantity, 0);
  const cartSubtotal = cart.items.reduce((total, item) => total + item.unitPrice * item.quantity, 0);
  const latestActiveOrder = orders.find(isActiveOrder) ?? null;
  const openCustomizer = (drink: Drink) => {
    setCustomization(getDefaultCustomization(drink.customizationConfig));
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

    const itemCustomization = selectedDrink.customizationConfig.enabled
      ? { ...customization, extras: [...customization.extras] }
      : null;
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

  const clearCartSyncTimers = () => {
    if (cartSyncTimer.current) clearTimeout(cartSyncTimer.current);
    if (cartRetryTimer.current) clearTimeout(cartRetryTimer.current);
    cartSyncTimer.current = null;
    cartRetryTimer.current = null;
  };

  function scheduleCartSync(delay = 450) {
    if (cartSyncTimer.current) clearTimeout(cartSyncTimer.current);
    cartSyncTimer.current = null;

    if (appStateRef.current !== "active" || !networkAvailableRef.current) {
      cartSyncQueued.current = true;
      return;
    }

    cartSyncTimer.current = setTimeout(() => {
      cartSyncTimer.current = null;
      void runCartSync();
    }, delay);
  }

  async function runCartSync() {
    const userId = accountUserIdRef.current;
    if (
      !userId
      || cartOwnerKeyRef.current !== userId
      || !cartHasPendingChanges.current
    ) return;

    if (appStateRef.current !== "active" || !networkAvailableRef.current || cartSyncInFlight.current) {
      cartSyncQueued.current = true;
      return;
    }

    const revision = cartRevision.current;
    const items = cartItemsRef.current;
    const controller = new AbortController();
    cartSyncAbortController.current = controller;
    cartSyncInFlight.current = true;
    cartSyncQueued.current = false;
    setCartSyncStatus(cartRetryCount.current > 0 ? "reconnecting" : "syncing");

    const handleFailure = (error: string) => {
      if (accountUserIdRef.current !== userId) return;
      const temporary = isTemporaryCartSyncError(error);
      cartHasPendingChanges.current = true;
      cartSyncQueued.current = temporary;
      setCartSyncError(getCartSyncErrorMessage(error));
      setCartSyncStatus(temporary ? "reconnecting" : "error");

      if (temporary && appStateRef.current === "active") {
        cartRetryCount.current += 1;
        const retryDelay = Math.min(1_500 * (2 ** (cartRetryCount.current - 1)), 15_000);
        if (cartRetryTimer.current) clearTimeout(cartRetryTimer.current);
        cartRetryTimer.current = setTimeout(() => {
          cartRetryTimer.current = null;
          void runCartSync();
        }, retryDelay);
      }
    };

    try {
      const result = await replaceAccountCart(items, controller.signal);
      if (accountUserIdRef.current !== userId) return;

      if (result.error) {
        handleFailure(result.error);
        return;
      }

      if (revision !== cartRevision.current) {
        cartSyncQueued.current = true;
        return;
      }

      localCartSaveQueue.current = localCartSaveQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (revision === cartRevision.current && accountUserIdRef.current === userId) {
            await clearPendingAccountCart(userId);
          }
        });
      await localCartSaveQueue.current;

      if (revision !== cartRevision.current || accountUserIdRef.current !== userId) {
        cartSyncQueued.current = true;
        return;
      }

      cartHasPendingChanges.current = false;
      cartSyncQueued.current = false;
      cartRetryCount.current = 0;
      setCartSyncError(null);
      setCartSyncStatus("saved");
    } catch (error) {
      handleFailure(error instanceof Error ? error.message : "The cart could not be synced.");
    } finally {
      const ownsCurrentRequest = cartSyncAbortController.current === controller;
      if (ownsCurrentRequest) {
        cartSyncInFlight.current = false;
        cartSyncAbortController.current = null;
      }

      if (
        ownsCurrentRequest
        && cartSyncQueued.current
        && cartHasPendingChanges.current
        && appStateRef.current === "active"
        && !cartRetryTimer.current
      ) scheduleCartSync(0);
    }
  }

  useEffect(() => {
    let isActive = true;
    let hydrationRetryTimer: ReturnType<typeof setTimeout> | null = null;
    const nextOwnerKey = session?.user.id ?? "guest";

    clearCartSyncTimers();
    cartSyncAbortController.current?.abort();
    cartSyncQueued.current = false;
    cartHasPendingChanges.current = false;
    cartRetryCount.current = 0;
    cartRevision.current += 1;
    setCartOwnerKey(null);
    setCartSyncStatus("loading");
    setCartSyncError(null);

    const hydrateCart = async () => {
      const guestItems = await loadGuestCart();
      if (!session?.user) {
        if (!isActive) return;
        setCart({ items: guestItems, currency: "IDR" });
        setCartOwnerKey(nextOwnerKey);
        setCartSyncStatus("saved");
        return;
      }

      const userId = session.user.id;
      const pendingItems = await loadPendingAccountCart(userId);
      const accountCart = await loadAccountCart();
      if (!isActive) return;

      if (accountCart.error) {
        const recoverableItems = pendingItems ?? (guestItems.length > 0 ? guestItems : null);
        if (!recoverableItems) {
          setCart({ items: [], currency: "IDR" });
          setCartSyncError(getCartSyncErrorMessage(accountCart.error));
          setCartSyncStatus(isTemporaryCartSyncError(accountCart.error) ? "reconnecting" : "error");
          if (isTemporaryCartSyncError(accountCart.error) && appStateRef.current === "active" && networkAvailableRef.current) {
            hydrationRetryTimer = setTimeout(() => {
              if (isActive) setCartHydrationVersion((version) => version + 1);
            }, 2_000);
          }
          return;
        }

        const mergedItems = mergeCartItems(recoverableItems, guestItems);
        await savePendingAccountCart(userId, mergedItems);
        if (guestItems.length > 0) await clearGuestCart();
        if (!isActive) return;

        cartHasPendingChanges.current = true;
        cartSyncQueued.current = true;
        setCart({ items: mergedItems, currency: "IDR" });
        setCartOwnerKey(nextOwnerKey);
        setCartSyncError(getCartSyncErrorMessage(accountCart.error));
        setCartSyncStatus("reconnecting");
        return;
      }

      const hasPendingCart = pendingItems !== null || guestItems.length > 0;
      const mergedItems = mergeCartItems(pendingItems ?? accountCart.items, guestItems);
      if (hasPendingCart) {
        await savePendingAccountCart(userId, mergedItems);
        if (guestItems.length > 0) await clearGuestCart();
        cartHasPendingChanges.current = true;
        cartSyncQueued.current = true;
      } else {
        skipNextCartSync.current = true;
      }
      if (!isActive) return;

      setCart({ items: mergedItems, currency: "IDR" });
      setCartOwnerKey(nextOwnerKey);
      setCartSyncStatus(hasPendingCart ? "syncing" : "saved");
    };

    void hydrateCart();
    return () => {
      isActive = false;
      if (hydrationRetryTimer) clearTimeout(hydrationRetryTimer);
    };
  }, [session?.user.id, cartHydrationVersion]);

  useEffect(() => {
    const expectedOwnerKey = session?.user.id ?? "guest";
    if (cartOwnerKey !== expectedOwnerKey) return;

    if (skipNextCartSync.current) {
      skipNextCartSync.current = false;
      return;
    }

    if (cartSyncTimer.current) clearTimeout(cartSyncTimer.current);
    if (cartRetryTimer.current) clearTimeout(cartRetryTimer.current);
    cartSyncTimer.current = null;
    cartRetryTimer.current = null;

    if (!session?.user) {
      void saveGuestCart(cart.items).catch(() => undefined);
      setCartSyncStatus("saved");
      return;
    }

    const userId = session.user.id;
    const revision = cartRevision.current + 1;
    cartRevision.current = revision;
    cartHasPendingChanges.current = true;
    cartSyncQueued.current = true;
    cartRetryCount.current = 0;
    setCartSyncError(null);
    setCartSyncStatus(appStateRef.current === "active" ? "syncing" : "reconnecting");

    localCartSaveQueue.current = localCartSaveQueue.current
      .catch(() => undefined)
      .then(() => savePendingAccountCart(userId, cart.items));

    void localCartSaveQueue.current.then(() => {
      if (
        revision === cartRevision.current
        && accountUserIdRef.current === userId
        && cartOwnerKeyRef.current === userId
      ) scheduleCartSync(450);
    }).catch(() => {
      if (accountUserIdRef.current !== userId) return;
      cartSyncQueued.current = false;
      setCartSyncError("The cart could not be saved on this device.");
      setCartSyncStatus("error");
    });
  }, [cart, cartOwnerKey, session?.user.id]);

  useEffect(() => {
    let isActive = true;
    const applyNetworkState = (state: Network.NetworkState) => {
      if (!isActive) return;
      setNetworkAvailable(state.isConnected !== false && state.isInternetReachable !== false);
    };

    void Network.getNetworkStateAsync().then(applyNetworkState).catch(() => undefined);
    const subscription = Network.addNetworkStateListener(applyNetworkState);
    return () => {
      isActive = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const userId = accountUserIdRef.current;
    if (!networkAvailable) {
      clearCartSyncTimers();
      cartSyncAbortController.current?.abort();
      if (userId && cartHasPendingChanges.current) {
        cartSyncQueued.current = true;
        setCartSyncStatus("reconnecting");
        setCartSyncError("Cart saved on this device. Sync is paused while you are offline.");
        void savePendingAccountCart(userId, cartItemsRef.current).catch(() => undefined);
      }
      return;
    }

    setOrdersRefreshVersion((version) => version + 1);
    if (!userId) return;
    if (cartOwnerKeyRef.current !== userId) {
      setCartHydrationVersion((version) => version + 1);
    } else if (cartHasPendingChanges.current) {
      cartSyncQueued.current = true;
      setCartSyncStatus("reconnecting");
      setCartSyncError("Connection restored. Saving your latest cart…");
      scheduleCartSync(0);
    }
  }, [networkAvailable]);

  useEffect(() => {
    const handleCartAppStateChange = (nextState: AppStateStatus) => {
      appStateRef.current = nextState;
      const userId = accountUserIdRef.current;

      if (nextState !== "active") {
        clearCartSyncTimers();
        cartSyncAbortController.current?.abort();
        if (userId && cartHasPendingChanges.current) {
          cartSyncQueued.current = true;
          setCartSyncStatus("reconnecting");
          setCartSyncError("Cart saved on this device. It will reconnect when you return.");
          localCartSaveQueue.current = localCartSaveQueue.current
            .catch(() => undefined)
            .then(() => savePendingAccountCart(userId, cartItemsRef.current));
        }
        return;
      }

      setOrdersRefreshVersion((version) => version + 1);

      if (userId && cartOwnerKeyRef.current !== userId) {
        setCartHydrationVersion((version) => version + 1);
        return;
      }

      if (userId && cartHasPendingChanges.current && networkAvailableRef.current) {
        cartSyncQueued.current = true;
        setCartSyncError("Reconnecting and saving your latest cart…");
        setCartSyncStatus("reconnecting");
        scheduleCartSync(0);
      }
    };

    const appStateSubscription = AppState.addEventListener("change", handleCartAppStateChange);
    return () => {
      appStateSubscription.remove();
      clearCartSyncTimers();
      cartSyncAbortController.current?.abort();
    };
  }, []);

  const refreshOrders = () => {
    if (ordersRefreshInFlight.current) return ordersRefreshInFlight.current;

    const request = (async () => {
      if (!session?.user) {
        setOrders([]);
        setOrdersError(null);
        setIsOrdersLoading(false);
        return;
      }

      setIsOrdersLoading(true);
      const result = await loadAccountOrders();
      setOrders(result.orders);
      setOrdersError(result.error);
      setIsOrdersLoading(false);
    })().finally(() => {
      ordersRefreshInFlight.current = null;
    });

    ordersRefreshInFlight.current = request;
    return request;
  };

  useEffect(() => {
    void refreshOrders();
  }, [session?.user.id, ordersRefreshVersion]);

  useEffect(() => listenForNotificationResponses((data) => {
    if (data.screen === "operations-orders") {
      setOperationsOrdersSignal((value) => value + 1);
      return;
    }
    if (data.screen === "order-history") {
      setSelectedDrink(null);
      setPaymentOrder(null);
      setIsCheckoutOpen(false);
      setIsOrderHistoryOpen(true);
      setOrdersRefreshVersion((value) => value + 1);
      return;
    }
    if (data.screen === "home") setActiveTab("Home");
  }), []);

  useEffect(() => {
    if (!session?.user.id || !networkAvailable) return;

    let cancelled = false;
    let stopListeningForTokenChanges: () => void = () => undefined;
    const register = async (devicePushToken?: KopiPowDevicePushToken) => {
      const result = await registerPushNotifications(devicePushToken);
      if (!cancelled && result.status === "error") {
        console.warn(`[notifications] ${result.message ?? "Device registration failed."}`);
      }
    };

    void register().finally(() => {
      if (cancelled) return;
      stopListeningForTokenChanges = listenForPushTokenChanges((devicePushToken) => {
        void register(devicePushToken);
      });
    });
    return () => {
      cancelled = true;
      stopListeningForTokenChanges();
    };
  }, [networkAvailable, session?.user.id]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || !networkAvailable) return;

    let fullRefreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleFullRefresh = (delay = 150) => {
      if (fullRefreshTimer) clearTimeout(fullRefreshTimer);
      fullRefreshTimer = setTimeout(() => {
        fullRefreshTimer = null;
        void refreshOrders();
      }, delay);
    };

    const unsubscribe = subscribeToOrderChanges({
      channelKey: `customer-${userId}`,
      userId,
      onChange: (change) => {
        if (change.orderId && change.eventType === "DELETE") {
          setOrders((current) => current.filter((order) => order.id !== change.orderId));
        } else if (change.orderId && change.eventType === "UPDATE") {
          setOrders((current) => current.map((order) => order.id === change.orderId
            ? {
              ...order,
              status: change.status ?? order.status,
              paymentStatus: change.paymentStatus ?? order.paymentStatus,
            }
            : order));
        }

        // Re-fetch shortly afterward so non-status fields and new order items
        // stay synchronized too. The direct state update above keeps status UI instant.
        scheduleFullRefresh();
      },
      // Refresh after every successful connection/reconnection so updates made
      // while the app was backgrounded or offline cannot be missed.
      onSubscribed: () => scheduleFullRefresh(0),
    });

    return () => {
      if (fullRefreshTimer) clearTimeout(fullRefreshTimer);
      unsubscribe();
    };
  }, [session?.user.id, networkAvailable]);

  useEffect(() => {
    if (!networkAvailable) return;
    let isMounted = true;
    void loadHostedProductCatalog(menuDrinks).then((products) => {
      if (isMounted) setCatalogDrinks(products);
    });
    return () => {
      isMounted = false;
    };
  }, [networkAvailable, refreshVersion]);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId || !networkAvailable || appStateRef.current !== "active" || paymentRecoveryInFlight.current) return;

    const recovery = (async () => {
      const checkpoints = await loadPaymentCheckpoints(userId);
      let didRecover = false;
      for (const checkpoint of checkpoints) {
        if (!networkAvailableRef.current || appStateRef.current !== "active") break;
        const result = await paymentGateway.synchronizeStatus(checkpoint.orderId);
        if (!result.data || result.error) continue;

        didRecover = true;
        if (isTerminalPaymentStatus(result.data.paymentStatus)) {
          await clearPaymentCheckpoint(checkpoint.orderId);
        } else {
          await savePaymentCheckpoint({
            ...checkpoint,
            phase: "awaiting_confirmation",
            lastKnownStatus: result.data.paymentStatus,
          });
        }
      }
      if (didRecover) await refreshOrders();
    })().finally(() => {
      paymentRecoveryInFlight.current = null;
    });

    paymentRecoveryInFlight.current = recovery;
  }, [session?.user.id, networkAvailable, ordersRefreshVersion]);

  useEffect(() => {
    if (isOrderHistoryOpen) void refreshOrders();
  }, [isOrderHistoryOpen]);

  useEffect(() => {
    if (Platform.OS !== "android") return;

    const backSubscription = BackHandler.addEventListener("hardwareBackPress", () => {
      const now = Date.now();
      if (now - lastBackPressAt.current <= 2_000) {
        BackHandler.exitApp();
        return true;
      }

      lastBackPressAt.current = now;
      ToastAndroid.show("Press back again to exit KopiPow", ToastAndroid.SHORT);

      if (selectedDrink) {
        setSelectedDrink(null);
        return true;
      }
      if (paymentOrder) {
        setPaymentOrder(null);
        setIsCheckoutOpen(false);
        setIsOrderHistoryOpen(true);
        void refreshOrders();
        return true;
      }
      if (isCheckoutOpen) {
        setIsCheckoutOpen(false);
        return true;
      }
      if (isOrderHistoryOpen) {
        setIsOrderHistoryOpen(false);
        return true;
      }
      if (activeTab !== "Home") {
        setActiveTab("Home");
        return true;
      }
      return true;
    });

    return () => backSubscription.remove();
  }, [activeTab, isCheckoutOpen, isOrderHistoryOpen, paymentOrder, selectedDrink]);

  const refreshContent = () => {
    if (isRefreshing) return;

    setIsRefreshing(true);
    if (session?.user) void refreshOrders();

    // This remounts the visible page while keeping local cart and session state.
    // Replace the remaining delay with Supabase menu and rewards requests later.
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      setRefreshVersion((version) => version + 1);
      setIsRefreshing(false);
    }, 650);
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

  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  useEffect(() => {
    let mounted = true;
    let requestVersion = 0;

    const refreshMaintenanceConfig = async () => {
      const version = ++requestVersion;
      const config = await loadMaintenanceConfig();
      if (mounted && version === requestVersion) {
        setMaintenanceConfig(config);
      }
    };

    void refreshMaintenanceConfig();

    const unsubscribeFromMaintenance = subscribeToMaintenanceConfig((config) => {
      if (mounted) setMaintenanceConfig(config);
    });

    const pollTimer = setInterval(() => {
      if (appStateRef.current === "active") void refreshMaintenanceConfig();
    }, 30000);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refreshMaintenanceConfig();
    });

    return () => {
      mounted = false;
      clearInterval(pollTimer);
      unsubscribeFromMaintenance();
      subscription.remove();
    };
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

  if (showSplash || maintenanceConfig === null) {
    return (
      <TypographyScaleContext.Provider value={typographyScale}>
          <SafeAreaView edges={["left", "right", "bottom"]} style={styles.splashSafeArea}>
            <Animated.View style={[
              styles.splashLogo,
              maintenanceConfig === null
                ? { opacity: 1, transform: [{ scale: 1 }] }
                : { opacity: splashOpacity, transform: [{ scale: splashScale }] },
            ]}>
              <View style={[styles.splashLogoMark, responsiveLayout.isCompact && styles.splashLogoMarkCompact, responsiveLayout.isTablet && styles.splashLogoMarkTablet]}>
                <Text style={[styles.splashBolt, responsiveLayout.isCompact && styles.splashBoltCompact, responsiveLayout.isTablet && styles.splashBoltTablet]}>ϟ</Text>
              </View>
              <Text style={[styles.splashName, responsiveLayout.isCompact && styles.splashNameCompact, responsiveLayout.isTablet && styles.splashNameTablet]}>Kopi POW!</Text>
              <Text style={[styles.splashTagline, responsiveLayout.isCompact && styles.splashTaglineCompact]}>99% REAAAADY TO GOW</Text>
            </Animated.View>
          </SafeAreaView>
      </TypographyScaleContext.Provider>
    );
  }

  const maintenanceMustWaitForPayment = Boolean(paymentOrder) || checkoutSubmissionInFlight;

  if (maintenanceConfig.enabled && !maintenanceMustWaitForPayment) {
    return (
      <TypographyScaleContext.Provider value={typographyScale}>
        <MaintenanceScreen message={maintenanceConfig.message} />
        <AppUpdateManager blocked={false} networkAvailable={networkAvailable} />
      </TypographyScaleContext.Provider>
    );
  }

  if (isAuthenticated && isAccessLoading) {
    return (
      <TypographyScaleContext.Provider value={typographyScale}>
        <SafeAreaView style={styles.accessLoadingScreen}>
          <View style={styles.accessLoadingMark}><Bolt /></View>
          <Text style={styles.accessLoadingTitle}>Opening your workspace…</Text>
          <Text style={styles.accessLoadingCopy}>Checking your KopiPow account access.</Text>
        </SafeAreaView>
      </TypographyScaleContext.Provider>
    );
  }

  if (isAuthenticated && (access.role === "staff" || access.role === "admin")) {
    return (
      <TypographyScaleContext.Provider value={typographyScale}>
        <>
          <OperationsWorkspace
            role={access.role}
            displayName={appUser.displayName}
            email={appUser.email}
            phone={session?.user.phone ?? null}
            branchId={access.branchId}
            networkAvailable={networkAvailable}
            openOrdersSignal={operationsOrdersSignal}
            onSignOut={signOut}
            onUpdateDisplayName={updateDisplayName}
            onUpdatePassword={updatePassword}
          />
          <AppUpdateManager blocked={false} networkAvailable={networkAvailable} />
        </>
      </TypographyScaleContext.Provider>
    );
  }

  return (
    <TypographyScaleContext.Provider value={typographyScale}>
        <SafeAreaView edges={["left", "right"]} style={styles.safeArea}>
        {paymentOrder ? (
          <MidtransPaymentScreen
            key={paymentOrder.orderId}
            orderId={paymentOrder.orderId}
            userId={session?.user.id ?? ""}
            total={paymentOrder.total}
            networkAvailable={networkAvailable}
            onPaymentUpdated={() => { void refreshOrders(); }}
            onBack={() => {
              setPaymentOrder(null);
              setIsCheckoutOpen(false);
              setIsOrderHistoryOpen(true);
              void refreshOrders();
            }}
          />
        ) : isCheckoutOpen ? (
          <CheckoutScreen
            accountEmail={appUser.email}
            cartItems={cart.items}
            customerName={appUser.displayName}
            subtotal={cartSubtotal}
            onBack={() => setIsCheckoutOpen(false)}
            onSubmissionStateChange={setCheckoutSubmissionInFlight}
            onOrderCreated={(order) => {
              const userId = session?.user.id;
              clearCartSyncTimers();
              cartSyncAbortController.current?.abort();
              cartRevision.current += 1;
              cartHasPendingChanges.current = false;
              cartSyncQueued.current = false;
              cartRetryCount.current = 0;
              skipNextCartSync.current = true;
              if (userId) {
                localCartSaveQueue.current = localCartSaveQueue.current
                  .catch(() => undefined)
                  .then(() => clearPendingAccountCart(userId));
              }
              setCart(EMPTY_CART);
              setCartSyncError(null);
              setCartSyncStatus("saved");
              if (order.paymentMethod === "midtrans_snap") {
                setPaymentOrder(order);
              } else {
                setPaymentOrder(null);
                setIsCheckoutOpen(false);
                setIsOrderHistoryOpen(true);
              }
              void refreshOrders();
            }}
          />
        ) : isOrderHistoryOpen ? (
          <OrderHistoryScreen
            error={ordersError}
            isLoading={isOrdersLoading}
            orders={orders}
            onBack={() => setIsOrderHistoryOpen(false)}
            onRefresh={() => { void refreshOrders(); }}
            onContinuePayment={(order) => {
              if (order.status === "cancelled") return;
              setIsOrderHistoryOpen(false);
              setPaymentOrder({
                orderId: order.id,
                paymentMethod: "midtrans_snap",
                subtotal: order.subtotal,
                total: order.total,
              });
            }}
            onBrowseMenu={() => {
              setIsOrderHistoryOpen(false);
              setActiveTab("Menu");
            }}
          />
        ) : <>
        {activeTab === "Home" ? <ScrollView key={`home-screen-${refreshVersion}`} style={styles.screen} contentContainerStyle={[styles.scrollContent, responsiveContentStyle, { paddingTop: 14 + insets.top, paddingBottom: 118 + insets.bottom }]} showsVerticalScrollIndicator={false} removeClippedSubviews={false} refreshControl={pullToRefresh}>
        <View style={styles.topBar}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark}><Bolt /></View>
            <View>
              <Text style={styles.logo} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>Kopi POW!</Text>
              <Text style={styles.logoLine}>99% REAAAADY TO GOW</Text>
            </View>
          </View>
          <Pressable style={styles.avatar} accessibilityLabel="Open profile" onPress={() => setActiveTab("Profile")}>
            <Text style={styles.avatarText}>{currentUser.initials}</Text>
            <View style={styles.onlineDot} />
          </Pressable>
        </View>

        {isAuthenticated && latestActiveOrder && (
          <Pressable style={styles.homeOrderBar} onPress={() => setIsOrderHistoryOpen(true)}>
            <View style={styles.homeOrderIcon}>
              <Ionicons name="receipt-outline" size={23} color={COLORS.green} />
            </View>
            <View style={styles.homeOrderCopy}>
              <Text style={styles.homeOrderEyebrow}>ACTIVE ORDER</Text>
              <Text style={styles.homeOrderTitle} numberOfLines={1}>
                {`${orderStatusLabel[latestActiveOrder.status]} · #${latestActiveOrder.id.slice(0, 8).toUpperCase()}`}
              </Text>
              <Text style={styles.homeOrderDetail} numberOfLines={1}>
                {latestActiveOrder.items.reduce((total, item) => total + item.quantity, 0)} items · {formatRupiah(latestActiveOrder.total)} · {formatCompactOrderDate(latestActiveOrder.createdAt)}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={21} color={COLORS.green} />
          </Pressable>
        )}

        <View style={[styles.greetingBlock, !latestActiveOrder && styles.greetingBlockNoActiveOrder]}>
          <Text style={styles.greeting}>Good morning, {currentUser.displayName}.</Text>
          <Text style={styles.headline} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.78}>Ready to power{`\n`}your way?</Text>
          <View style={styles.headlineBolt}><Bolt /></View>
        </View>

        <View style={styles.powerCardShadow}>
          <View style={styles.powerCard} collapsable={false}>
            <View style={styles.powerCardCopy}>
              <Text style={styles.powerKicker}>TODAY&apos;S POWER UP</Text>
              <Text style={styles.powerTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>Iced Power Latte!</Text>
              {/* <Text style={styles.powerDetail}>Oat milk · less sweet · double shot</Text> */}
              <Pressable style={styles.quickOrder} onPress={() => openCustomizer(drinks[0])}>
                <Text style={styles.quickOrderText}>Order today&apos;s pick</Text>
                <Text style={styles.quickOrderArrow}>→</Text>
              </Pressable>
            </View>
            <View style={styles.heroCupWrap}>
              <View style={styles.heroSun} />
              <ProductPhoto imageSource={drinks[0].imageSource} name="Iced Power Latte" hero />
            </View>
          </View>
        </View>

        <View style={styles.sectionTitleRow}>
          <View>
            <Text style={styles.sectionEyebrow}>TAKE A SMALL SIP</Text>
            <Text style={styles.sectionTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>Popular right now</Text>
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
                <ProductPhoto imageSource={drink.imageSource} name={drink.name} />
              </View>
              <Text style={styles.drinkName} numberOfLines={2}>{drink.name}</Text>
              <Text style={styles.drinkDetail} numberOfLines={2}>{drink.detail}</Text>
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

        {isAuthenticated && (
          <View style={styles.rewardCard}>
            <View style={styles.rewardIcon}><Text style={styles.powText}>POW!</Text></View>
            <View style={styles.rewardCopy}>
              <Text style={styles.rewardTitle}>4 more sips to a free drink</Text>
              <Text style={styles.rewardDetail}>You&apos;re 60% powered</Text>
              <View style={styles.progressTrack}><View style={styles.progressFill} /></View>
            </View>
            <Text style={styles.rewardArrow}>›</Text>
          </View>
        )}
      </ScrollView> : activeTab === "Menu" ? (
        <MenuScreen
          key={`menu-screen-${refreshVersion}`}
          activeCategory={activeCategory}
          currentUserInitials={currentUser.initials}
          drinks={drinks}
          onActiveCategoryChange={setActiveCategory}
          onCustomizeDrink={openCustomizer}
          onOpenProfile={() => setActiveTab("Profile")}
          onSearchQueryChange={setSearchQuery}
          refreshControl={pullToRefresh}
          searchQuery={searchQuery}
          typographyScale={typographyScale}
        />
      ) : activeTab === "Rewards" ? <ScrollView key={`rewards-screen-${refreshVersion}`} style={styles.screen} contentContainerStyle={[styles.rewardsPage, responsiveContentStyle, { paddingTop: 14 + insets.top, paddingBottom: 108 + insets.bottom }]} showsVerticalScrollIndicator={false} removeClippedSubviews={false} refreshControl={pullToRefresh}>
        <View style={styles.topBar}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark}><Bolt /></View>
            <View>
              <Text style={styles.logo} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>Kopi POW!</Text>
              <Text style={styles.logoLine}>99% REAAAADY TO GOW</Text>
            </View>
          </View>
          <Pressable style={styles.avatar} accessibilityLabel="Open profile" onPress={() => setActiveTab("Profile")}>
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
          <Text style={styles.comingSoonTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.74}>Something powerful{`\n`}is coming!</Text>
          <Text style={styles.comingSoonCopy}>We&apos;re brewing a rewards experience worth waiting for. Check back soon.</Text>
        </View>
      </ScrollView> : activeTab === "Cart" ? <ScrollView key={`cart-screen-${refreshVersion}`} style={styles.screen} contentContainerStyle={[styles.cartContent, responsiveContentStyle, { paddingTop: 14 + insets.top, paddingBottom: 128 + insets.bottom }]} showsVerticalScrollIndicator={false} removeClippedSubviews={false} refreshControl={pullToRefresh}>
        <View style={styles.topBar}>
          <View style={styles.logoRow}>
            <View style={styles.logoMark}><Bolt /></View>
            <View>
              <Text style={styles.logo} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.86}>Kopi POW!</Text>
              <Text style={styles.logoLine}>99% REAAAADY TO GOW</Text>
            </View>
          </View>
          <Pressable style={styles.avatar} accessibilityLabel="Open profile" onPress={() => setActiveTab("Profile")}>
            <Text style={styles.avatarText}>{currentUser.initials}</Text>
            <View style={styles.onlineDot} />
          </Pressable>
        </View>

        <View style={styles.cartHeading}>
          <Text style={styles.menuEyebrow}>YOUR POWER-UPS</Text>
          <Text style={styles.menuTitle}>Your Cart!</Text>
          <Text style={styles.cartHeadingCopy}>{cartItemCount} {cartItemCount === 1 ? "item" : "items"} ready to go</Text>
        </View>

        <View style={[styles.cartSaveCard, cartSyncStatus === "error" && styles.cartSaveCardError]}>
          <Ionicons
            name={!isAuthenticated ? "person-outline" : cartSyncStatus === "saved" ? "cloud-done-outline" : cartSyncStatus === "error" ? "cloud-offline-outline" : cartSyncStatus === "reconnecting" ? "sync-outline" : "cloud-upload-outline"}
            size={22}
            color={cartSyncStatus === "error" ? "#963A31" : COLORS.green}
          />
          <View style={styles.cartSaveCopy}>
            <Text style={[styles.cartSaveTitle, cartSyncStatus === "error" && styles.cartSaveErrorText]}>
              {!isAuthenticated
                ? "Guest cart saved on this device"
                : cartSyncStatus === "loading"
                  ? "Loading your account cart…"
                  : cartSyncStatus === "syncing"
                    ? "Saving cart to your account…"
                    : cartSyncStatus === "reconnecting"
                      ? "Reconnecting your cart…"
                      : cartSyncStatus === "error"
                        ? "Cart is not synced"
                        : "Cart saved to your account"}
            </Text>
            <Text style={[styles.cartSaveDetail, cartSyncStatus === "error" && styles.cartSaveErrorText]} numberOfLines={2}>
              {!isAuthenticated
                ? "Sign in before checkout to keep it across devices."
                : cartSyncError ?? "Your cart follows this KopiPow account."}
            </Text>
          </View>
          {!isAuthenticated && (
            <Pressable style={styles.cartSignInButton} onPress={() => setActiveTab("Profile")}>
              <Text style={styles.cartSignInText}>Sign in</Text>
            </Pressable>
          )}
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
            {cart.items.map((item) => {
              const details = getOrderItemDisplayDetails(item.customization);
              return (
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
                  {details.primary && <Text style={styles.cartItemOptions}>{details.primary}</Text>}
                  {details.secondary && <Text style={styles.cartItemOptions}>{details.secondary}</Text>}
                  {details.extras.length > 0 && <>
                    <Text style={styles.cartItemExtrasLabel}>Extras:</Text>
                    {details.extras.map((extra, index) => (
                      <Text key={`${item.lineId}-extra-${index}`} style={styles.cartItemExtra}>- {extra}</Text>
                    ))}
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
              );
            })}
          </View>

          <View style={styles.cartSummary}>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Subtotal</Text><Text style={styles.summaryValue}>{formatRupiah(cartSubtotal)}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Discount</Text><Text style={styles.summaryMuted}>—</Text></View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryRow}><Text style={styles.summaryTotalLabel}>Estimated total</Text><Text style={styles.summaryTotal}>{formatRupiah(cartSubtotal)}</Text></View>
            <Text style={styles.summaryNote}>Tax, service fees, promotions, and the final payable amount will be validated by the backend at checkout.</Text>
          </View>

          <Pressable
            style={[styles.checkoutButton, isAuthenticated && cartSyncStatus !== "saved" && styles.checkoutButtonDisabled]}
            disabled={isAuthenticated && cartSyncStatus !== "saved"}
            onPress={() => {
              if (!isAuthenticated) {
                setActiveTab("Profile");
                return;
              }
              setIsCheckoutOpen(true);
            }}
          >
            <Text style={styles.checkoutButtonText}>{isAuthenticated ? "CONTINUE TO CHECKOUT" : "SIGN IN TO CHECK OUT"}</Text>
            <Ionicons name="arrow-forward" size={20} color={COLORS.white} />
          </Pressable>
        </>}
      </ScrollView> : <ProfileScreen
        key={`profile-screen-${refreshVersion}`}
        refreshControl={pullToRefresh}
        typographyScale={typographyScale}
        orders={orders}
        isOrdersLoading={isOrdersLoading}
        ordersError={ordersError}
        onOpenOrderHistory={() => setIsOrderHistoryOpen(true)}
      />}

        <View style={[
          styles.bottomNav,
          {
            bottom: 0,
            height: (responsiveLayout.isCompact ? 68 : 74) + insets.bottom,
            paddingBottom: Math.max(4, insets.bottom),
            paddingHorizontal: responsiveLayout.isTablet ? Math.max(0, (screenWidth - 720) / 2) : 0,
          },
        ]}>
          <Pressable style={styles.navItem} onPress={() => setActiveTab("Home")}>
            <Ionicons name={activeTab === "Home" ? "home" : "home-outline"} size={24} color={activeTab === "Home" ? COLORS.orange : "#9B9C95"} />
            <Text style={activeTab === "Home" ? styles.navLabelActive : styles.navLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Home</Text>
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => setActiveTab("Menu")}>
            <Ionicons name={activeTab === "Menu" ? "grid" : "grid-outline"} size={23} color={activeTab === "Menu" ? COLORS.orange : "#9B9C95"} />
            <Text style={activeTab === "Menu" ? styles.navLabelActive : styles.navLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Menu</Text>
          </Pressable>
          <Pressable style={[styles.cartButton, responsiveLayout.isCompact && styles.cartButtonCompact, activeTab === "Cart" && styles.cartButtonActive]} accessibilityLabel={`Cart with ${cartItemCount} items`} onPress={() => setActiveTab("Cart")}>
            <Ionicons name="cart-outline" size={29} color={COLORS.white} />
            {cartItemCount > 0 && <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{cartItemCount}</Text></View>}
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => setActiveTab("Rewards")}>
            <Ionicons name={activeTab === "Rewards" ? "heart" : "heart-outline"} size={25} color={activeTab === "Rewards" ? COLORS.orange : "#9B9C95"} />
            <Text style={activeTab === "Rewards" ? styles.navLabelActive : styles.navLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>Rewards</Text>
          </Pressable>
          <Pressable style={styles.navItem} onPress={() => setActiveTab("Profile")}>
            <Ionicons name={activeTab === "Profile" ? "person" : "person-outline"} size={24} color={activeTab === "Profile" ? COLORS.orange : "#9B9C95"} />
            <Text style={activeTab === "Profile" ? styles.navLabelActive : styles.navLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Profile</Text>
          </Pressable>
        </View>
        </>}

        <Modal visible={selectedDrink !== null} transparent animationType="slide" onRequestClose={closeCustomizer}>
          <View style={styles.modalBackdrop}>
            <View style={[
              styles.customizerSheet,
              {
                height: responsiveLayout.isCompact ? "94%" : "88%",
                maxWidth: responsiveLayout.isTablet ? 720 : undefined,
              },
            ]}>
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
                  {selectedDrink.customizationConfig.enabled && <>
                    {selectedDrink.customizationConfig.size.enabled !== false && <View style={styles.optionGroup}>
                      <Text style={styles.optionTitle}>Size</Text>
                      <View style={styles.optionWrap}>{selectedDrink.customizationConfig.size.options.map((option) => <Pressable key={option.name} style={[styles.optionChip, customization.size === option.name && styles.optionChipActive]} onPress={() => setCustomization((current) => ({ ...current, size: option.name }))}><Text style={[styles.optionChipText, customization.size === option.name && styles.optionChipTextActive]}>{option.name}{formatOptionAdjustment(option.price)}</Text></Pressable>)}</View>
                    </View>}

                    {selectedDrink.customizationConfig.temperature.enabled !== false && <View style={styles.optionGroup}>
                      <Text style={styles.optionTitle}>Temperature</Text>
                      <View style={styles.optionWrap}>{selectedDrink.customizationConfig.temperature.options.map((option) => <Pressable key={option.name} style={[styles.optionChip, customization.temperature === option.name && styles.optionChipActive]} onPress={() => setCustomization((current) => ({ ...current, temperature: option.name }))}><Text style={[styles.optionChipText, customization.temperature === option.name && styles.optionChipTextActive]}>{option.name}{formatOptionAdjustment(option.price)}</Text></Pressable>)}</View>
                    </View>}

                    {selectedDrink.customizationConfig.sugar.enabled !== false && <View style={styles.optionGroup}>
                      <Text style={styles.optionTitle}>Sugar</Text>
                      <View style={styles.optionWrap}>{selectedDrink.customizationConfig.sugar.options.map((option) => <Pressable key={option.name} style={[styles.optionChip, customization.sugar === option.name && styles.optionChipActive]} onPress={() => setCustomization((current) => ({ ...current, sugar: option.name }))}><Text style={[styles.optionChipText, customization.sugar === option.name && styles.optionChipTextActive]}>{option.name}{formatOptionAdjustment(option.price)}</Text></Pressable>)}</View>
                    </View>}

                    {selectedDrink.customizationConfig.ice.enabled !== false && <View style={styles.optionGroup}>
                      <Text style={styles.optionTitle}>Ice</Text>
                      <View style={styles.optionWrap}>{selectedDrink.customizationConfig.ice.options.map((option) => <Pressable key={option.name} style={[styles.optionChip, customization.ice === option.name && styles.optionChipActive]} onPress={() => setCustomization((current) => ({ ...current, ice: option.name }))}><Text style={[styles.optionChipText, customization.ice === option.name && styles.optionChipTextActive]}>{option.name}{formatOptionAdjustment(option.price)}</Text></Pressable>)}</View>
                    </View>}

                    {selectedDrink.customizationConfig.milk.enabled !== false && <View style={styles.optionGroup}>
                      <Text style={styles.optionTitle}>Milk</Text>
                      <View style={styles.optionWrap}>{selectedDrink.customizationConfig.milk.options.map((option) => <Pressable key={option.name} style={[styles.optionChip, customization.milk === option.name && styles.optionChipActive]} onPress={() => setCustomization((current) => ({ ...current, milk: option.name }))}><Text style={[styles.optionChipText, customization.milk === option.name && styles.optionChipTextActive]}>{option.name}{formatOptionAdjustment(option.price)}</Text></Pressable>)}</View>
                    </View>}

                    {selectedDrink.customizationConfig.extrasEnabled !== false && selectedDrink.customizationConfig.extras.length > 0 && <View style={styles.optionGroup}>
                      <Text style={styles.optionTitle}>Extras · choose multiple</Text>
                      <View style={styles.optionWrap}>{selectedDrink.customizationConfig.extras.map((extra) => {
                        const selected = customization.extras.includes(extra.name);
                        return <Pressable key={extra.name} style={[styles.optionChip, selected && styles.optionChipActive]} onPress={() => toggleExtra(extra.name)}><Text style={[styles.optionChipText, selected && styles.optionChipTextActive]}>{extra.name}{formatOptionAdjustment(extra.price)}</Text></Pressable>;
                      })}</View>
                    </View>}
                  </>}

                  <View style={styles.optionGroup}>
                    <Text style={styles.optionTitle}>Notes · optional</Text>
                    <TextInput
                      style={[
                        styles.noteInput,
                        {
                          fontSize: 11 * typographyScale,
                          lineHeight: 16 * typographyScale,
                        },
                      ]}
                      value={customization.note}
                      onChangeText={(note) => setCustomization((current) => ({ ...current, note }))}
                      placeholder={selectedDrink.category === "Snacks" ? "Example: warm it up, please" : "Example: extra hot, no straw"}
                      placeholderTextColor="#8A9188"
                      maxFontSizeMultiplier={1.2}
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
        <AppUpdateManager
          blocked={
            isCheckoutOpen
            || Boolean(paymentOrder)
            || Boolean(selectedDrink)
            || isRefreshing
            || cartSyncStatus === "loading"
            || cartSyncStatus === "syncing"
            || cartSyncStatus === "reconnecting"
          }
          networkAvailable={networkAvailable}
        />
        </SafeAreaView>
    </TypographyScaleContext.Provider>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    [DISPLAY_FONT_FAMILY]: PlayfairDisplay_800ExtraBold_Italic,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontError, fontsLoaded]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" hidden={false} />
      <AuthProvider>
        <KopiPowApp />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  accessLoadingScreen: { flex: 1, backgroundColor: COLORS.cream, alignItems: "center", justifyContent: "center", padding: 28 },
  accessLoadingMark: { width: 62, height: 62, borderRadius: 20, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", marginBottom: 18, overflow: "hidden" },
  accessLoadingTitle: { color: COLORS.ink, fontSize: 18, fontWeight: "900", textAlign: "center" },
  accessLoadingCopy: { color: COLORS.muted, fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 6 },
  splashSafeArea: { flex: 1, backgroundColor: COLORS.cream, alignItems: "center", justifyContent: "center" },
  splashLogo: { alignItems: "center", justifyContent: "center" },
  splashLogoMark: { width: 92, height: 92, borderRadius: 30, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-5deg" }], marginBottom: 22 },
  splashLogoMarkCompact: { width: 74, height: 74, borderRadius: 24, marginBottom: 17 },
  splashLogoMarkTablet: { width: 112, height: 112, borderRadius: 36, marginBottom: 28 },
  splashBolt: { color: COLORS.green, fontSize: 67, fontWeight: "900", lineHeight: 73 },
  splashBoltCompact: { fontSize: 54, lineHeight: 60 },
  splashBoltTablet: { fontSize: 82, lineHeight: 90 },
  splashName: { color: COLORS.ink, fontSize: 39, fontWeight: "900", fontStyle: "italic", letterSpacing: -2.2 },
  splashNameCompact: { fontSize: 33 },
  splashNameTablet: { fontSize: 48 },
  splashTagline: { color: COLORS.muted, fontSize: 9, fontWeight: "900", letterSpacing: 2.3, marginTop: 7 },
  splashTaglineCompact: { fontSize: 8, letterSpacing: 1.9, marginTop: 5 },
  safeArea: { flex: 1, backgroundColor: COLORS.cream },
  screen: { flex: 1, backgroundColor: COLORS.cream },
  rewardsPage: { flexGrow: 1, backgroundColor: COLORS.cream, paddingHorizontal: 20, paddingTop: 14, paddingBottom: 108 },
  comingSoonContent: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingBottom: 20 },
  comingSoonBurst: { width: 142, height: 142, borderRadius: 48, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", marginBottom: 32 },
  comingSoonIcon: { color: COLORS.green, fontSize: 88, fontWeight: "900", lineHeight: 96, textAlign: "center" },
  comingSoonEyebrowOutline: { borderWidth: 1.5, borderColor: COLORS.green, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 8, marginBottom: 14, overflow: "hidden" },
  chargingGlow: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(32, 76, 59, 0.14)" },
  comingSoonEyebrow: { color: COLORS.green, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.7, zIndex: 1 },
  comingSoonTitle: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 36, lineHeight: 39, letterSpacing: -1.3, textAlign: "center" },
  comingSoonCopy: { color: COLORS.muted, fontSize: 13, lineHeight: 20, textAlign: "center", maxWidth: 300, marginTop: 16 },
  scrollContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 118 },
  cartContent: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 128 },
  cartHeading: { paddingTop: 22, marginBottom: 24 },
  cartHeadingCopy: { color: COLORS.muted, fontSize: 12, fontWeight: "600", marginTop: 8 },
  cartSaveCard: { flexDirection: "row", alignItems: "center", backgroundColor: "#EEF2EF", borderRadius: 17, paddingHorizontal: 13, paddingVertical: 11, marginBottom: 14 },
  cartSaveCardError: { backgroundColor: "#EBCBC4" },
  cartSaveCopy: { flex: 1, marginLeft: 10, marginRight: 8 },
  cartSaveTitle: { color: COLORS.ink, fontSize: 10.5, fontWeight: "900" },
  cartSaveDetail: { color: COLORS.muted, fontSize: 8.5, lineHeight: 12, marginTop: 2 },
  cartSaveErrorText: { color: "#963A31" },
  cartSignInButton: { backgroundColor: COLORS.green, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 8 },
  cartSignInText: { color: COLORS.white, fontSize: 8.5, fontWeight: "900" },
  emptyCart: { alignItems: "center", justifyContent: "center", paddingTop: 72, paddingHorizontal: 30 },
  emptyCartIcon: { width: 104, height: 104, borderRadius: 34, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", marginBottom: 25 },
  emptyCartTitle: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 27, textAlign: "center" },
  emptyCartCopy: { color: COLORS.muted, fontSize: 12, lineHeight: 18, textAlign: "center", maxWidth: 260, marginTop: 10 },
  browseMenuButton: { backgroundColor: COLORS.green, borderRadius: 22, paddingHorizontal: 22, paddingVertical: 13, marginTop: 23 },
  browseMenuButtonText: { color: COLORS.white, fontSize: 11, fontWeight: "900" },
  cartList: { gap: 12 },
  cartItemCard: { flexDirection: "row", backgroundColor: COLORS.white, borderRadius: 20, padding: 11 },
  cartItemVisual: { width: 72, minHeight: 94, borderRadius: 15, alignItems: "center", justifyContent: "center", marginRight: 12 },
  cartItemBody: { flex: 1 },
  cartItemTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cartItemName: { flex: 1, color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 17 },
  cartItemOptions: { color: COLORS.muted, fontSize: 8.5, lineHeight: 13, marginTop: 3 },
  cartItemExtrasLabel: { color: COLORS.orange, fontSize: 8.5, lineHeight: 13, fontWeight: "900", marginTop: 5 },
  cartItemExtra: { color: COLORS.orange, fontSize: 8.5, lineHeight: 13, fontWeight: "800", marginTop: 1 },
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
  summaryTotalLabel: { color: COLORS.yellow, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 17 },
  summaryTotal: { color: COLORS.yellow, fontSize: 17, fontWeight: "900" },
  summaryNote: { color: "#AEBBB1", fontSize: 8, lineHeight: 12, marginTop: 6 },
  checkoutButton: { minHeight: 54, backgroundColor: COLORS.orange, borderRadius: 22, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 18, marginTop: 14 },
  checkoutButtonDisabled: { backgroundColor: "#A7B0AB", opacity: 0.72 },
  checkoutButtonText: { color: COLORS.white, fontSize: 10, fontWeight: "900", letterSpacing: 1.1 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#F1F4F2", borderRadius: 19, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 22 },
  logoRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoMark: { width: 38, height: 38, borderRadius: 13, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", transform: [{ rotate: "-4deg" }] },
  bolt: { color: COLORS.green, fontSize: 29, fontWeight: "900", lineHeight: 32 },
  logo: { color: COLORS.ink, fontSize: 23, fontWeight: "900", fontStyle: "italic", letterSpacing: -1.4 },
  logoLine: { color: COLORS.muted, fontSize: 7, fontWeight: "800", letterSpacing: 1.7, marginTop: 1 },
  avatar: { width: 40, height: 40, borderRadius: 15, backgroundColor: COLORS.ink, alignItems: "center", justifyContent: "center", transform: [{ rotate: "3deg" }] },
  avatarText: { color: COLORS.white, fontSize: 15, fontWeight: "800" },
  onlineDot: { position: "absolute", right: -1, bottom: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.yellow, borderWidth: 2, borderColor: COLORS.cream },
  homeOrderBar: { minHeight: 64, flexDirection: "row", alignItems: "center", backgroundColor: COLORS.white, borderRadius: 20, borderWidth: 1, borderColor: "#DDE3DF", paddingHorizontal: 12, paddingVertical: 10, marginTop: -8, marginBottom: -14, shadowColor: "#536055", shadowOpacity: 0.12, shadowOffset: { width: 0, height: 5 }, shadowRadius: 8, elevation: 3 },
  homeOrderIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", marginRight: 11 },
  homeOrderCopy: { flex: 1, marginRight: 8 },
  homeOrderEyebrow: { color: COLORS.orange, fontSize: 7.5, fontWeight: "900", letterSpacing: 1.05 },
  homeOrderTitle: { color: COLORS.ink, fontSize: 10.5, fontWeight: "900", marginTop: 2 },
  homeOrderDetail: { color: COLORS.muted, fontSize: 7.5, marginTop: 3 },
  greetingBlock: { paddingTop: 34, paddingBottom: 24, position: "relative" },
  greetingBlockNoActiveOrder: { paddingTop: 0, paddingBottom: 38 },
  greeting: { color: COLORS.muted, fontSize: 13, marginBottom: 8 },
  headline: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 42, lineHeight: 47, letterSpacing: -1.7, paddingBottom: 7, marginBottom: -7 },
  headlineBolt: { position: "absolute", right: 8, bottom: 24, width: 48, height: 48, borderRadius: 16, backgroundColor: COLORS.yellow, alignItems: "center", justifyContent: "center", transform: [{ rotate: "8deg" }] },
  menuEyebrow: { color: COLORS.orange, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.4, marginBottom: 6 },
  menuTitle: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 43, lineHeight: 47, letterSpacing: -1.5 },
  powerCardShadow: { borderRadius: 26, marginBottom: 34, shadowColor: "#071B14", shadowOpacity: 0.42, shadowOffset: { width: 0, height: 12 }, shadowRadius: 16, elevation: 12 },
  powerCard: { minHeight: 185, borderRadius: 26, backgroundColor: COLORS.ink, overflow: "hidden", flexDirection: "row" },
  powerCardCopy: { width: "60%", padding: 21, zIndex: 2 },
  powerKicker: { color: "#D9E0D4", fontSize: 7, fontWeight: "800", letterSpacing: 1.35, marginBottom: 11 },
  powerTitle: { color: COLORS.yellow, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 26 },
  powerDetail: { color: "#CDD5C8", fontSize: 9, lineHeight: 14, marginTop: 7 },
  quickOrder: { marginTop: 20, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", backgroundColor: COLORS.orange, paddingLeft: 14, paddingRight: 10, paddingVertical: 10, borderRadius: 18 },
  quickOrderText: { color: COLORS.white, fontSize: 8, fontWeight: "800" },
  quickOrderArrow: { color: COLORS.white, marginLeft: 11, fontWeight: "900" },
  heroCupWrap: { flex: 1, minWidth: 0, alignItems: "center", justifyContent: "flex-start", position: "relative" },
  heroSun: { position: "absolute", top: 28, width: 130, height: 130, borderRadius: 65, backgroundColor: COLORS.yellow },
  productPhoto: { width: "100%", height: "100%", borderRadius: 14 },
  productPhotoHero: { position: "absolute", top: 8, width: "100%", maxWidth: 160, height: 190, borderRadius: 18 },
  productPhotoPlaceholderBase: { borderRadius: 15, borderWidth: 1.5, borderStyle: "dashed", borderColor: COLORS.green, alignItems: "center", justifyContent: "center", paddingHorizontal: 8, zIndex: 2 },
  productPhotoPlaceholder: { width: "78%", height: "68%", backgroundColor: "rgba(255, 255, 255, 0.94)" },
  productPhotoPlaceholderHero: { width: "84%", maxWidth: 118, aspectRatio: 0.78, borderColor: "#DDE3DF", backgroundColor: "rgba(255, 255, 255, 0.96)" },
  productPhotoIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: "#E5EAE7", alignItems: "center", justifyContent: "center", marginBottom: 7 },
  productPhotoLabel: { color: COLORS.orange, fontSize: 7, fontWeight: "900", letterSpacing: 1.1, textAlign: "center" },
  productPhotoName: { color: COLORS.ink, fontSize: 8.5, lineHeight: 11, fontWeight: "800", textAlign: "center", marginTop: 3 },
  sectionTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16 },
  sectionEyebrow: { color: COLORS.orange, fontSize: 10.5, fontWeight: "900", letterSpacing: 1.4, marginBottom: 5 },
  sectionTitle: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 25, paddingBottom: 5, marginBottom: -5 },
  drinkRow: { gap: 13, paddingBottom: 28 },
  drinkCard: { width: 174, backgroundColor: COLORS.white, borderRadius: 20, padding: 10 },
  drinkVisual: { height: 153, borderRadius: 14, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  drinkTag: { position: "absolute", left: 8, top: 8, color: COLORS.green, backgroundColor: COLORS.white, borderRadius: 9, borderWidth: 1.5, borderColor: COLORS.green, paddingHorizontal: 8, paddingVertical: 5, fontSize: 6.5, fontWeight: "900", letterSpacing: 0.6, zIndex: 5, shadowColor: "#000", shadowOpacity: 0.2, shadowOffset: { width: 0, height: 2 }, shadowRadius: 3, elevation: 4 },
  drinkName: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 17, lineHeight: 20, minHeight: 40, marginTop: 12 },
  drinkDetail: { color: COLORS.muted, fontSize: 8, lineHeight: 12, minHeight: 24, marginTop: 5 },
  drinkBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  drinkPrice: { color: COLORS.ink, fontSize: 11, fontWeight: "900" },
  addButton: { width: 30, height: 30, borderRadius: 15, backgroundColor: COLORS.orange, alignItems: "center", justifyContent: "center" },
  addButtonText: { color: COLORS.white, fontSize: 16, fontWeight: "800", marginTop: -2 },
  rewardCard: { flexDirection: "row", alignItems: "center", backgroundColor: COLORS.ink, borderRadius: 20, padding: 15 },
  rewardIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: COLORS.orange, alignItems: "center", justifyContent: "center", marginRight: 13 },
  powText: { color: COLORS.green, fontSize: 9, fontWeight: "900", fontStyle: "italic", transform: [{ rotate: "-8deg" }] },
  rewardCopy: { flex: 1 },
  rewardTitle: { color: COLORS.white, fontSize: 12, fontWeight: "800" },
  rewardDetail: { color: "#AEB0A9", fontSize: 8, marginTop: 4 },
  progressTrack: { height: 4, backgroundColor: "#4C4F48", borderRadius: 2, marginTop: 9, overflow: "hidden" },
  progressFill: { width: "60%", height: "100%", backgroundColor: COLORS.yellow },
  rewardArrow: { color: COLORS.white, fontSize: 26, marginLeft: 14 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 34, 27, 0.48)" },
  customizerSheet: { width: "100%", height: "88%", alignSelf: "center", backgroundColor: COLORS.cream, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingTop: 10, overflow: "hidden" },
  customizerHandle: { width: 46, height: 5, borderRadius: 3, backgroundColor: "#8C9791", alignSelf: "center", marginBottom: 13 },
  customizerHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", paddingHorizontal: 20, paddingBottom: 15 },
  customizerEyebrow: { color: COLORS.orange, fontSize: 9, fontWeight: "900", letterSpacing: 1.4, marginBottom: 5 },
  customizerTitle: { color: COLORS.ink, fontFamily: DISPLAY_FONT_FAMILY, fontSize: 29, letterSpacing: -0.8 },
  customizerBasePrice: { color: COLORS.muted, fontSize: 10, fontWeight: "600", marginTop: 4 },
  closeButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  customizerScroll: { flex: 1 },
  customizerScrollContent: { paddingHorizontal: 20, paddingBottom: 18 },
  optionGroup: { marginBottom: 19 },
  optionTitle: { color: COLORS.ink, fontSize: 12, fontWeight: "900", marginBottom: 9 },
  optionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: { backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: "#DDE3DF", borderRadius: 18, paddingHorizontal: 13, paddingVertical: 9 },
  optionChipActive: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  optionChipText: { color: COLORS.muted, fontSize: 10, fontWeight: "700" },
  optionChipTextActive: { color: COLORS.white, fontWeight: "900" },
  noteInput: { minHeight: 78, borderRadius: 16, backgroundColor: COLORS.white, borderWidth: 1.5, borderColor: "#DDE3DF", color: COLORS.ink, fontSize: 11, lineHeight: 16, paddingHorizontal: 14, paddingVertical: 12, textAlignVertical: "top" },
  customizerFooter: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18, backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: "#DDE3DF" },
  addConfiguredButton: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: COLORS.green, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 15 },
  addConfiguredText: { color: COLORS.white, fontSize: 12, fontWeight: "900" },
  addConfiguredPrice: { color: COLORS.yellow, fontSize: 12, fontWeight: "900" },
  bottomNav: { position: "absolute", left: 0, right: 0, bottom: 0, height: 74, backgroundColor: COLORS.white, borderTopWidth: 1, borderColor: "#E1E6E3", flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingBottom: 4 },
  navItem: { width: 60, alignItems: "center", justifyContent: "center", gap: 4 },
  navLabel: { color: "#9B9C95", fontSize: 10.5, fontWeight: "700" },
  navLabelActive: { color: COLORS.orange, fontSize: 10.5, fontWeight: "900" },
  cartButton: { width: 58, height: 58, marginTop: -30, borderRadius: 20, backgroundColor: COLORS.ink, borderWidth: 5, borderColor: COLORS.cream, alignItems: "center", justifyContent: "center" },
  cartButtonCompact: { width: 52, height: 52, marginTop: -24, borderRadius: 18 },
  cartButtonActive: { backgroundColor: COLORS.orange },
  cartBadge: { position: "absolute", top: -7, right: -7, minWidth: 21, height: 21, borderRadius: 11, backgroundColor: COLORS.orange, borderWidth: 2, borderColor: COLORS.white, alignItems: "center", justifyContent: "center" },
  cartBadgeText: { color: COLORS.white, fontSize: 8, fontWeight: "900" },
});
