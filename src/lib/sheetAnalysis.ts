// Lightweight pixel-level analysis to make the export "blend in" with the
// host PDF: detect the dominant page background color so masks paint the
// right shade, and pick a theme variant for the branded title block.

/**
 * Sample a small grid of pixels along the four edges of the rendered page
 * and return the dominant color rounded to a coarse hex bucket. We avoid
 * the center because that's where drawing content tends to live; the
 * borders are almost always margin / paper background even on PDFs that
 * have heavy plotting in the middle.
 *
 * Returns null only if the canvas can't be sampled (tainted, 0×0, etc.).
 */
export function sampleBackgroundColor(
  canvas: HTMLCanvasElement,
): string | null {
  const w = canvas.width;
  const h = canvas.height;
  if (w < 16 || h < 16) return null;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  // Read 4 thin strips along each edge, then bucket pixel colors and pick
  // the most-frequent bucket. Using getImageData on the whole canvas would
  // be wasteful and may run into 16-megapixel limits on large arch sheets.
  const stripPx = Math.max(2, Math.floor(Math.min(w, h) * 0.01));
  let strips: ImageData[] = [];
  try {
    strips = [
      ctx.getImageData(0, 0, w, stripPx),                  // top
      ctx.getImageData(0, h - stripPx, w, stripPx),         // bottom
      ctx.getImageData(0, 0, stripPx, h),                   // left
      ctx.getImageData(w - stripPx, 0, stripPx, h),         // right
    ];
  } catch {
    // CORS-tainted canvas or browser hardening — bail.
    return null;
  }

  const buckets = new Map<string, number>();
  // Quantize to 16 buckets per channel so near-identical pixels collapse,
  // turning the histogram into a clear winner instead of thousands of
  // 1-count buckets caused by anti-aliased edges.
  const QUANT = 16;
  const bucket = (v: number) => Math.min(255, Math.floor(v / QUANT) * QUANT + Math.floor(QUANT / 2));

  // Sample every Nth pixel of each strip — full-resolution scans are
  // pointless when we're already quantizing.
  const sampleEvery = 4;
  for (const strip of strips) {
    const data = strip.data;
    for (let i = 0; i < data.length; i += 4 * sampleEvery) {
      const a = data[i + 3];
      if (a < 128) continue; // transparent — skip
      const key = `${bucket(data[i])},${bucket(data[i + 1])},${bucket(data[i + 2])}`;
      buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }
  }

  if (buckets.size === 0) return null;
  let bestKey = "";
  let bestCount = -1;
  for (const [k, v] of buckets) {
    if (v > bestCount) {
      bestCount = v;
      bestKey = k;
    }
  }
  const [r, g, b] = bestKey.split(",").map((n) => parseInt(n, 10));
  return rgbToHex(r, g, b);
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`.toUpperCase();
}

/** Relative luminance per WCAG. Returns 0..1. */
export function luminance(hex: string): number {
  const v = (hex || "#FFFFFF").replace("#", "").padEnd(6, "F");
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  // Simple sRGB → linear approximation; full gamma curve isn't worth it
  // for a binary light/dark decision.
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Pick a concrete theme for an effective `auto` setting given the sheet's
 *  sampled background. Light backgrounds (>50% luminance) get the light
 *  card so it blends into the page; dark/blueprint backgrounds keep the
 *  default dark amber-on-midnight card. */
export function resolveTheme(
  setting: "auto" | "dark" | "light" | undefined,
  bgColor: string | undefined,
): "dark" | "light" {
  if (setting === "dark") return "dark";
  if (setting === "light") return "light";
  if (!bgColor) return "dark"; // sensible default for unsampled sheets
  return luminance(bgColor) >= 0.5 ? "light" : "dark";
}

// ───────── default branding placement ─────────
//
// These two helpers return the rectangle the title block + legend would
// occupy on a sheet that hasn't had its branding manually placed yet.
// Both the editor preview and the PDF export reach for them so the
// default-vs-custom decision is made in exactly one place.

export function defaultTitleBlockBounds(sheet: {
  pageWidth: number;
  pageHeight: number;
}) {
  // Mirrors the export's historical default: bottom-right corner, 18% of
  // page width clamped to a sensible 280-380pt range, 138pt tall, 16pt
  // margin from the sheet edges.
  const w = Math.min(380, Math.max(280, sheet.pageWidth * 0.18));
  const h = 138;
  return {
    x: sheet.pageWidth - w - 16,
    y: sheet.pageHeight - h - 16,
    width: w,
    height: h,
  };
}

export function defaultLegendBounds(sheet: {
  pageWidth: number;
  pageHeight: number;
}) {
  return {
    x: sheet.pageWidth - 180 - 16,
    y: 16,
    width: 180,
    height: 200,
  };
}
