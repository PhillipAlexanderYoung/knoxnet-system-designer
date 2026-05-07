// Per-project branding config. Lets any team drop their wordmark,
// tagline, color, and logo into the title block, cover page, BOM,
// legend, and the live editor preview without hunting through the
// codebase for hardcoded strings.

export interface BrandingConfig {
  /** Bold wordmark text. Drawn on the dark side of the dual-color
   *  lockup ("KNOX" in the bundled default brand). */
  wordmarkPrimary: string;
  /** Secondary wordmark text — drawn in the lighter weight, immediately
   *  to the right of the primary ("NET" by default). */
  wordmarkSecondary: string;
  /** Small-caps tagline that sits beneath / next to the wordmark
   *  (default "SYSTEM DESIGNER"). Empty string suppresses it. */
  tagline: string;
  /** Full company name, used in the "BY [drawnBy]" footer fallback
   *  and toasts. */
  fullName: string;
  /** Accent color (the amber bar / amber accent). Hex. */
  accentColor: string;
  /** Slightly darker accent used on the bottom edge of cards for depth. */
  accentDeepColor: string;
  /** Prefix for the auto-generated document code (default "KN" produces
   *  codes like `KN-12345-R0`). */
  docCodePrefix: string;
  /** Optional secondary tagline on the cover page (e.g. service
   *  categories). Empty string suppresses. */
  coverCategories: string;
  /** Optional uploaded logo as a data URL (PNG or JPG). When set, it
   *  replaces the built-in K-shield monogram everywhere. */
  logoDataUrl?: string;
}

/** Default brand — the bundled "Knoxnet System Designer" identity used
 *  as the starting point for a fresh project. Editing any field in
 *  Settings copies these defaults onto `Project.branding` and overlays
 *  the user's change. Pick your own wordmark, tagline, color, and logo
 *  in Settings → Branding to replace the bundled defaults across the
 *  editor preview and every export. */
export const DEFAULT_BRANDING: BrandingConfig = {
  wordmarkPrimary: "KNOX",
  wordmarkSecondary: "NET",
  tagline: "SYSTEM DESIGNER",
  fullName: "Knoxnet System Designer",
  accentColor: "#F4B740",
  accentDeepColor: "#C99227",
  docCodePrefix: "KN",
  coverCategories: "AUDIO/VIDEO  ·  SECURITY  ·  NETWORK",
};

/** Merge a partial / undefined `Project.branding` with the defaults so
 *  every consumer can reach for `branding.wordmarkPrimary` etc. without
 *  null-checking. */
export function resolveBranding(
  config: Partial<BrandingConfig> | undefined,
): BrandingConfig {
  if (!config) return { ...DEFAULT_BRANDING };
  return { ...DEFAULT_BRANDING, ...config };
}

// ───────── Cover page section resolution ─────────

/** Defaults for the cover page sections + subtitle. Any field on the
 *  project's `coverPage` overrides these. */
export const DEFAULT_COVER_SUBTITLE = "PROJECT MARKUP & BID DOCUMENTATION";

export interface ResolvedCoverPage {
  showLogo: boolean;
  showWordmark: boolean;
  showTagline: boolean;
  showSubtitle: boolean;
  showProjectName: boolean;
  showLocation: boolean;
  showClient: boolean;
  showSummary: boolean;
  showStats: boolean;
  showSheetIndex: boolean;
  showFooter: boolean;
  subtitle: string;
}

export function resolveCoverPage(
  cfg:
    | {
        showLogo?: boolean;
        showWordmark?: boolean;
        showTagline?: boolean;
        showSubtitle?: boolean;
        showProjectName?: boolean;
        showLocation?: boolean;
        showClient?: boolean;
        showSummary?: boolean;
        showStats?: boolean;
        showSheetIndex?: boolean;
        showFooter?: boolean;
        subtitle?: string;
      }
    | undefined,
): ResolvedCoverPage {
  return {
    showLogo: cfg?.showLogo ?? true,
    showWordmark: cfg?.showWordmark ?? true,
    showTagline: cfg?.showTagline ?? true,
    showSubtitle: cfg?.showSubtitle ?? true,
    showProjectName: cfg?.showProjectName ?? true,
    showLocation: cfg?.showLocation ?? true,
    showClient: cfg?.showClient ?? true,
    showSummary: cfg?.showSummary ?? true,
    showStats: cfg?.showStats ?? true,
    showSheetIndex: cfg?.showSheetIndex ?? true,
    showFooter: cfg?.showFooter ?? true,
    subtitle: cfg?.subtitle ?? DEFAULT_COVER_SUBTITLE,
  };
}

/** Lighten/darken a hex color by a fraction (-1..1) — used to derive an
 *  `accentDeep` automatically when the user only sets `accentColor`. */
export function shadeHex(hex: string, amount: number): string {
  const v = (hex || "#000000").replace("#", "");
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const adj = (c: number) =>
    Math.max(0, Math.min(255, Math.round(c + (amount > 0 ? (255 - c) : c) * amount)));
  const out = (n: number) => n.toString(16).padStart(2, "0");
  return `#${out(adj(r))}${out(adj(g))}${out(adj(b))}`.toUpperCase();
}

// ───────── Sticky (cross-project) branding ─────────
//
// Branding lives on `Project.branding`, but most users have ONE company
// identity that should follow them across every project they create. We
// persist their choice in localStorage so creating a new project, or
// loading the StartScreen with no project active, still shows their
// wordmark, color, and logo instead of snapping back to the bundled
// defaults.

const STICKY_BRAND_KEY = "knoxnet-system-designer:sticky-branding";

export function loadStickyBranding(): Partial<BrandingConfig> | undefined {
  if (typeof localStorage === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(STICKY_BRAND_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    return parsed as Partial<BrandingConfig>;
  } catch {
    return undefined;
  }
}

export function saveStickyBranding(b: Partial<BrandingConfig> | undefined) {
  if (typeof localStorage === "undefined") return;
  try {
    if (!b || Object.keys(b).length === 0) {
      localStorage.removeItem(STICKY_BRAND_KEY);
    } else {
      localStorage.setItem(STICKY_BRAND_KEY, JSON.stringify(b));
    }
  } catch {
    // Quota / privacy mode — silent no-op, the in-memory copy still
    // works for the rest of this session.
  }
}
