import { createContext, createElement, useContext } from "react";
import {
  StyleSheet,
  Text as NativeText,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from "react-native";

export const DISPLAY_FONT_FAMILY = "KopiPowDisplay";

export const TypographyScaleContext = createContext(1);

const getSmallTextReadabilityBoost = (fontSize: number) => {
  if (fontSize < 8) return 1.7;
  if (fontSize < 10) return 1.6;
  if (fontSize < 12) return 1.45;
  if (fontSize < 16) return 1.3;
  // if (fontSize < 23) return 1.9;
  return 1;
};

export function getResponsiveTextStyle(
  style: StyleProp<TextStyle>,
  typographyScale: number,
) {
  const flattenedStyle = StyleSheet.flatten(style);
  if (!flattenedStyle?.fontSize) return undefined;

  const effectiveScale = typographyScale
    * getSmallTextReadabilityBoost(flattenedStyle.fontSize);

  return {
    fontSize: flattenedStyle.fontSize * effectiveScale,
    lineHeight: flattenedStyle.lineHeight
      ? flattenedStyle.lineHeight * effectiveScale
      : undefined,
  };
}

export function Text({ maxFontSizeMultiplier = 1.2, ...props }: TextProps) {
  const typographyScale = useContext(TypographyScaleContext);
  const responsiveStyle = getResponsiveTextStyle(props.style, typographyScale);

  return createElement(NativeText, {
    ...props,
    maxFontSizeMultiplier,
    style: [props.style, responsiveStyle],
  });
}
