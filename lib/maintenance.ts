const enabledValues = new Set(["1", "true", "yes", "on"]);

export const getMaintenanceConfig = () => {
  const modeValue = process.env.EXPO_PUBLIC_MAINTENANCE_MODE
    ?.trim()
    .toLocaleLowerCase();

  return {
    enabled: modeValue ? enabledValues.has(modeValue) : false,
    message: process.env.EXPO_PUBLIC_MAINTENANCE_MESSAGE?.trim()
      || "We are tuning the machines and charging up something better. Please check back shortly.",
  };
};
