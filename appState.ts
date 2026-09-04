export type AppUser = {
  id: string;
  displayName: string;
  initials: string;
  email: string | null;
};

export type UserSession = {
  status: "guest" | "authenticated";
  user: AppUser;
};

export type CartState = {
  items: CartItem[];
  currency: "IDR";
};

export type ProductCustomization = {
  size: string;
  temperature: string;
  sugar: string;
  ice: string;
  milk: string;
  extras: string[];
  note: string;
};

export type CustomizationOption = {
  name: string;
  price: number;
};

export type CustomizationOptionGroup = {
  enabled: boolean;
  defaultValue: string;
  options: CustomizationOption[];
};

export type ProductCustomizationConfig = {
  enabled: boolean;
  size: CustomizationOptionGroup;
  temperature: CustomizationOptionGroup;
  sugar: CustomizationOptionGroup;
  ice: CustomizationOptionGroup;
  milk: CustomizationOptionGroup;
  extrasEnabled: boolean;
  extras: CustomizationOption[];
};

export type CartItem = {
  lineId: string;
  productId: number;
  name: string;
  category: string;
  accent: string;
  coffee: string;
  unitPrice: number;
  quantity: number;
  note: string;
  customization: ProductCustomization | null;
};

export type PaymentState = {
  status: "not_started" | "processing" | "paid" | "failed";
  selectedMethodId: string | null;
};

// Replace this session with the authenticated user's session later.
export const PLACEHOLDER_SESSION: UserSession = {
  status: "guest",
  user: {
    id: "placeholder-user",
    displayName: "Kopi Friend",
    initials: "KF",
    email: null,
  },
};

export const EMPTY_CART: CartState = {
  items: [],
  currency: "IDR",
};

// Ready to be replaced by the selected payment method during checkout.
export const PLACEHOLDER_PAYMENT: PaymentState = {
  status: "not_started",
  selectedMethodId: null,
};
