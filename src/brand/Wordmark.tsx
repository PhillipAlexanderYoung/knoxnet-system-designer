import { useMemo } from "react";
import { brand } from "./tokens";
import { useProjectStore } from "../store/projectStore";
import {
  loadStickyBranding,
  resolveBranding,
  type BrandingConfig,
} from "../lib/branding";

interface WordmarkProps {
  size?: "sm" | "md" | "lg";
  showTagline?: boolean;
  className?: string;
  /** Override branding (e.g. for testing / preview chips). When omitted
   *  we read the active project's branding, falling back to the
   *  cross-session sticky copy in localStorage so the StartScreen still
   *  shows the user's identity even before they open a project. */
  branding?: BrandingConfig;
}

const SIZE = {
  sm: { mono: 18, knox: 14, tag: 8 },
  md: { mono: 28, knox: 20, tag: 9 },
  lg: { mono: 40, knox: 28, tag: 11 },
} as const;

/**
 * Resolve the branding for the editor shell. Pulls from `Project.branding`
 * when a project is open; otherwise falls back to the user's sticky brand
 * (saved to localStorage on every `setBranding` call) so the StartScreen
 * + login flow already reflect their company.
 */
function useShellBranding(override?: BrandingConfig): BrandingConfig {
  const projectBranding = useProjectStore((s) => s.project?.branding);
  return useMemo(() => {
    if (override) return override;
    return resolveBranding(projectBranding ?? loadStickyBranding());
  }, [override, projectBranding]);
}

/**
 * Brand monogram. Renders the user's uploaded logo when present, and
 * otherwise renders nothing — by design. The tool ships with no default
 * mark so any team can use it without picking up an unrelated brand's
 * shield. To get a mark, upload one in `Settings → Branding → Logo`.
 */
export function Monogram({
  size = 28,
  branding: brandingOverride,
}: {
  size?: number;
  branding?: BrandingConfig;
}) {
  const branding = useShellBranding(brandingOverride);
  if (!branding.logoDataUrl) return null;
  return (
    <img
      src={branding.logoDataUrl}
      alt="Brand mark"
      width={size}
      height={size}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}

/**
 * Brand wordmark — the dual-tone lockup ("KNOX·NET" by default) plus an
 * optional small-caps tagline. Both halves of the wordmark are
 * customizable via the Branding panel; either can be empty.
 *
 * The tagline auto-splits at " · " or " " into two lines for the
 * vertical lockup styling. Single-word taglines render as one line.
 */
export function Wordmark({
  size = "md",
  showTagline = true,
  className = "",
  branding: brandingOverride,
}: WordmarkProps) {
  const s = SIZE[size];
  const branding = useShellBranding(brandingOverride);
  const wmA = branding.wordmarkPrimary;
  const wmB = branding.wordmarkSecondary;
  const taglineLines = splitTagline(branding.tagline);
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <Monogram size={s.mono} branding={branding} />
      <div className="flex items-center gap-3 leading-none">
        <div
          className="font-extrabold tracking-wordmark text-ink-50"
          style={{ fontSize: s.knox }}
        >
          {wmA}
          {wmB && (
            <span
              className="font-light"
              style={{ color: branding.accentColor }}
            >
              {wmB}
            </span>
          )}
        </div>
        {showTagline && taglineLines.length > 0 && (
          <div
            className="border-l border-ink-500 pl-3 font-mono uppercase text-ink-300"
            style={{ fontSize: s.tag, lineHeight: 1.1, letterSpacing: "0.15em" }}
          >
            {taglineLines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Break a tagline into the 2-line lockup format the bundled identity
 *  uses. We split on " · " or whitespace, capping at two lines so longer
 *  taglines render as one line instead of stacking weirdly. */
function splitTagline(tagline: string): string[] {
  const t = (tagline ?? "").trim();
  if (!t) return [];
  // Prefer splitting on the bullet separator that the bundled defaults use
  if (t.includes(" · ")) {
    const parts = t.split(" · ").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 2) return parts;
  }
  // Two-word taglines look great stacked ("Security / Systems"); longer
  // strings render as a single line.
  const words = t.split(/\s+/);
  if (words.length === 2) return words;
  return [t];
}

export { brand };
