import { PixelRatio, useWindowDimensions } from "react-native";

const clamp = (value: number, minimum: number, maximum: number) => (
  Math.min(maximum, Math.max(minimum, value))
);

export type ResponsiveLayout = {
  contentMaxWidth: number;
  gutter: number;
  height: number;
  isCompact: boolean;
  isNarrow: boolean;
  isShort: boolean;
  isTablet: boolean;
  typographyScale: number;
  width: number;
};

export function getResponsiveLayout(
  width: number,
  height: number,
  systemFontScale = PixelRatio.getFontScale(),
): ResponsiveLayout {
  const shortestSide = Math.min(width, height);
  const longestSide = Math.max(width, height);
  const isNarrow = shortestSide < 360;
  const isShort = longestSide < 720;
  const isTablet = shortestSide >= 600;
  const isCompact = isNarrow || isShort;
  const gutter = isTablet ? clamp(shortestSide * 0.055, 28, 44) : isNarrow ? 14 : 20;
  const contentMaxWidth = isTablet ? 820 : 760;
  const targetScale = isTablet
    ? 1.18
    : isNarrow
      ? 1.12
      : isShort
        ? 1.12
        : shortestSide >= 430
          ? 1.16
          : 1.14;
  const cappedSystemFontScale = clamp(systemFontScale, 1, 1.3);

  return {
    contentMaxWidth,
    gutter,
    height,
    isCompact,
    isNarrow,
    isShort,
    isTablet,
    typographyScale: clamp(targetScale / cappedSystemFontScale, 0.92, 1.3),
    width,
  };
}

export function useResponsiveLayout() {
  const { width, height } = useWindowDimensions();
  return getResponsiveLayout(width, height);
}
