export type OrderItemDisplayDetails = {
  primary: string;
  secondary: string;
  extras: string[];
};

export const getOrderItemDisplayDetails = (customization: unknown): OrderItemDisplayDetails => {
  if (!customization || typeof customization !== "object") {
    return { primary: "", secondary: "", extras: [] };
  }

  const values = customization as Record<string, unknown>;
  const size = typeof values.size === "string" ? values.size : null;
  const temperature = typeof values.temperature === "string" ? values.temperature : null;
  const sugar = typeof values.sugar === "string" ? `${values.sugar} sugar` : null;
  const milk = typeof values.milk === "string" ? values.milk : null;
  const ice = typeof values.ice === "string" ? values.ice : null;
  const extras = Array.isArray(values.extras)
    ? values.extras.filter((value): value is string => typeof value === "string")
    : [];

  return {
    primary: [size, temperature, sugar].filter(Boolean).join(" · "),
    secondary: [milk, ice].filter(Boolean).join(" · "),
    extras,
  };
};
