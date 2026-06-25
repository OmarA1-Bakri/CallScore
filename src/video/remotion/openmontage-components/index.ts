/**
 * OpenMontage component imports portal.
 *
 * Source: OpenMontage (AGPL-3.0) https://github.com/calesthio/OpenMontage
 * Vendored at: /tmp/openmontage
 *
 * Re-export key components so they can be used as Remotion compositions
 * alongside native CallScore components.
 *
 * Usage:
 *   import { HeroTitle, StatReveal, EndTag, ThemeConfig, resolveTheme } from "./vendor-theme";
 *
 * Each component is available as both a direct React component and
 * a named export for registration in the Remotion Root (Root.tsx).
 */

export {
  THEMES,
  THEME_NAMES,
  DEFAULT_THEME,
  resolveTheme,
  type ThemeConfig,
  type ThemeName,
} from "../vendor-theme";
