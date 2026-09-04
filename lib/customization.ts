import type { ProductCustomization, ProductCustomizationConfig } from "../appState";

export const DEFAULT_PRODUCT_CUSTOMIZATION_CONFIG: ProductCustomizationConfig = {
  enabled: true,
  size: { enabled: true, defaultValue: "Regular", options: [{ name: "Small", price: -3000 }, { name: "Regular", price: 0 }, { name: "Large", price: 5000 }] },
  temperature: { enabled: true, defaultValue: "Iced", options: [{ name: "Hot", price: 0 }, { name: "Iced", price: 0 }] },
  sugar: { enabled: true, defaultValue: "50%", options: [{ name: "0%", price: 0 }, { name: "25%", price: 0 }, { name: "50%", price: 0 }, { name: "75%", price: 0 }, { name: "100%", price: 0 }] },
  ice: { enabled: true, defaultValue: "Normal ice", options: [{ name: "No ice", price: 0 }, { name: "Less ice", price: 0 }, { name: "Normal ice", price: 0 }, { name: "Extra ice", price: 0 }] },
  milk: { enabled: true, defaultValue: "Fresh milk", options: [{ name: "Fresh milk", price: 0 }, { name: "Oat milk", price: 7000 }, { name: "Soy milk", price: 5000 }, { name: "Almond milk", price: 7000 }] },
  extrasEnabled: true,
  extras: [{ name: "Extra espresso shot", price: 7000 }, { name: "Syrup", price: 5000 }, { name: "Whipped cream", price: 6000 }, { name: "Caramel", price: 5000 }, { name: "Additional topping", price: 6000 }],
};

export const DISABLED_PRODUCT_CUSTOMIZATION_CONFIG: ProductCustomizationConfig = {
  ...DEFAULT_PRODUCT_CUSTOMIZATION_CONFIG,
  enabled: false,
};

export const cloneCustomizationConfig = (config: ProductCustomizationConfig): ProductCustomizationConfig =>
  JSON.parse(JSON.stringify(config)) as ProductCustomizationConfig;

export const getDefaultCustomization = (config: ProductCustomizationConfig): ProductCustomization => ({
  size: config.size.defaultValue || config.size.options[0]?.name || "",
  temperature: config.temperature.defaultValue || config.temperature.options[0]?.name || "",
  sugar: config.sugar.defaultValue || config.sugar.options[0]?.name || "",
  ice: config.ice.defaultValue || config.ice.options[0]?.name || "",
  milk: config.milk.defaultValue || config.milk.options[0]?.name || "",
  extras: [],
  note: "",
});

export const getConfiguredProductPrice = (
  basePrice: number,
  config: ProductCustomizationConfig,
  customization: ProductCustomization,
) => {
  if (!config.enabled) return basePrice;
  const groups = [config.size, config.temperature, config.sugar, config.ice, config.milk];
  const selections = [customization.size, customization.temperature, customization.sugar, customization.ice, customization.milk];
  const optionTotal = groups.reduce((total, group, index) => group.enabled === false ? total : total + (group.options.find((option) => option.name === selections[index])?.price ?? 0), 0);
  const extrasTotal = config.extrasEnabled === false ? 0 : customization.extras.reduce((total, name) => total + (config.extras.find((option) => option.name === name)?.price ?? 0), 0);
  return Math.max(0, basePrice + optionTotal + extrasTotal);
};
