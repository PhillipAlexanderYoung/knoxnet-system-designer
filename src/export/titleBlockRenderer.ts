import {
  PDFDocument,
  PDFPage,
  PDFFont,
  PDFImage,
  rgb,
  StandardFonts,
} from "pdf-lib";
import type { Project, Sheet, Markup } from "../store/projectStore";
import { devicesById } from "../data/devices";
import {
  categoryColor as catColor,
  categoryLabel as catLabel,
} from "../brand/tokens";
import { resolveBranding, type BrandingConfig } from "../lib/branding";

const KN_AMBER = hex("#F4B740");
const KN_AMBER_DEEP = hex("#C99227");
const KN_MIDNIGHT = hex("#0B1220");
const KN_INK_50 = hex("#F5F7FA");
const KN_INK_300 = hex("#94A0B8");
const KN_INK_400 = hex("#5E6B85");
const KN_INK_500 = hex("#3A4458");

export function hex(h: string) {
  const v = (h ?? "#94A0B8").replace("#", "");
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return rgb(0.58, 0.62, 0.72);
  return rgb(r, g, b);
}

/**
 * Standard pdf-lib fonts (Helvetica/Courier) are WinAnsi-encoded and only
 * cover ~256 codepoints. Any character outside WinAnsi (emoji, Asian scripts,
 * box-drawing, math symbols, etc.) makes `drawText` throw mid-export and the
 * user just sees a generic "Export failed" toast. Sanitize once at the edge:
 * map common look-alikes to ASCII, then strip anything still un-encodable so
 * the export always completes.
 */
const WINANSI_LOOKALIKES: Record<string, string> = {
  "\u2018": "'", // ‘
  "\u2019": "'", // ’
  "\u201A": "'", // ‚
  "\u201B": "'", // ‛
  "\u201C": '"', // “
  "\u201D": '"', // ”
  "\u201E": '"', // „
  "\u2032": "'", // ′
  "\u2033": '"', // ″
  "\u00A0": " ", // nbsp
  "\u2009": " ", // thin space
  "\u200A": " ", // hair space
  "\u200B": "",  // zero-width space
  "\u200C": "",  // ZWNJ
  "\u200D": "",  // ZWJ
  "\uFEFF": "",  // BOM
  "\u2010": "-", // ‐
  "\u2011": "-", // non-breaking hyphen
  "\u2012": "-", // figure dash
  "\u2043": "-", // hyphen bullet
  "\u00D7": "x", // ×
  "\u00F7": "/", // ÷
  "\u2044": "/", // ⁄
  "\u2026": "...", // …  (mapped explicitly even though WinAnsi has it, to keep it deterministic across hosts)
};

// WinAnsi (CP1252) covers 0x20–0x7E plus the high-byte set documented in pdf-lib.
// Codepoints in this set are safe to draw with the standard fonts.
const WINANSI_SET = new Set<number>([
  ...Array.from({ length: 0x7F - 0x20 }, (_, i) => 0x20 + i),
  // C1 high-byte additions used by WinAnsi
  0x20AC, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030,
  0x0160, 0x2039, 0x0152, 0x017D, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022,
  0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x017E, 0x0178,
  ...Array.from({ length: 0xFF - 0xA0 + 1 }, (_, i) => 0xA0 + i),
]);

export function safeText(input: string | null | undefined): string {
  if (input == null) return "";
  let s = String(input);
  // First pass: substitute well-known look-alikes
  let out = "";
  for (const ch of s) {
    const sub = WINANSI_LOOKALIKES[ch];
    out += sub !== undefined ? sub : ch;
  }
  // Second pass: drop anything still outside WinAnsi
  let safe = "";
  for (const ch of out) {
    const cp = ch.codePointAt(0)!;
    if (WINANSI_SET.has(cp)) safe += ch;
    else if (cp >= 0x20 && cp < 0x7F) safe += ch; // ASCII printable
    // else: silently drop
  }
  return safe;
}

export interface BrandFonts {
  bold: PDFFont;
  regular: PDFFont;
  light: PDFFont;
  mono: PDFFont;
}

export async function loadBrandFonts(doc: PDFDocument): Promise<BrandFonts> {
  return {
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    regular: await doc.embedFont(StandardFonts.Helvetica),
    light: await doc.embedFont(StandardFonts.Helvetica),
    mono: await doc.embedFont(StandardFonts.Courier),
  };
}

/** Concrete theme. `auto` is resolved upstream into one of these so the
 *  drawing code never has to think about luminance. */
export type BrandTheme = "dark" | "light";

interface ThemeColors {
  bg: ReturnType<typeof hex>;
  bgInner: ReturnType<typeof hex>;
  border: ReturnType<typeof hex>;
  accent: ReturnType<typeof hex>;
  accentDeep: ReturnType<typeof hex>;
  ink: ReturnType<typeof hex>;
  ink2: ReturnType<typeof hex>;
  ink3: ReturnType<typeof hex>;
  divider: ReturnType<typeof hex>;
  /** Color used for the wordmark/header foreground when drawn on the
   *  amber bar (always KN_MIDNIGHT, both themes — amber stays amber). */
  onAccent: ReturnType<typeof hex>;
}

/** Build a palette for a given theme, swapping in the user's brand
 *  accent colors so the amber bar / accent strip pick up whatever the
 *  team chose in Settings. The other "ink" colors stay fixed because
 *  they're tuned for legibility on the chosen background. */
function paletteFor(
  theme: BrandTheme | undefined,
  branding: BrandingConfig,
): ThemeColors {
  const accent = hex(branding.accentColor);
  const accentDeep = hex(branding.accentDeepColor);
  if (theme === "light") {
    return {
      bg: hex("#FFFFFF"),
      bgInner: hex("#F2F4F8"),
      border: hex("#0B1220"),
      accent,
      accentDeep,
      ink: hex("#0B1220"),
      ink2: hex("#3A4458"),
      ink3: hex("#5E6B85"),
      divider: hex("#C2CADA"),
      onAccent: KN_MIDNIGHT,
    };
  }
  return {
    bg: KN_MIDNIGHT,
    bgInner: hex("#141C2B"),
    border: accent,
    accent,
    accentDeep,
    ink: KN_INK_50,
    ink2: KN_INK_300,
    ink3: KN_INK_400,
    divider: KN_INK_500,
    onAccent: KN_MIDNIGHT,
  };
}

interface TitleBlockOpts {
  page: PDFPage;
  fonts: BrandFonts;
  project: Project;
  sheet: Sheet;
  sheetIndex: number;
  totalSheets: number;
  /** Explicit position + size (in PDF points, page-up coords). Falls back
   *  to the default bottom-right placement when omitted. */
  bounds?: { x: number; y: number; width: number; height: number };
  theme?: BrandTheme;
  /** Branding config for this draw call. Pass `resolveBranding(project.branding)`
   *  upstream so any unset fields use the bundled defaults. */
  branding?: BrandingConfig;
  /** Logo image embedded into the same PDFDocument the page belongs to.
   *  When provided, replaces the built-in K-shield monogram. */
  logoImage?: PDFImage;
}

/**
 * Draws the branded title block in the lower-right corner of the page.
 * Width-aware: scales relative to page width but caps at 360 pt.
 */
export function drawTitleBlock(opts: TitleBlockOpts) {
  const { page, fonts, project, sheet, sheetIndex, totalSheets, bounds, theme, logoImage } = opts;
  const { width: pw } = page.getSize();
  const branding = resolveBranding(opts.branding ?? project.branding);
  const palette = paletteFor(theme, branding);

  const w = bounds ? bounds.width : Math.min(380, Math.max(280, pw * 0.18));
  const h = bounds ? bounds.height : 138;
  const x = bounds ? bounds.x : pw - w - 16;
  const y = bounds ? bounds.y : 16;

  // Layout constants scale gracefully for stretched/squished bounds.
  const headerH = Math.max(20, Math.min(30, h * 0.19));
  const footerH = Math.max(14, h * 0.12);
  const accentH = Math.max(2, h * 0.022);

  // Outer panel
  page.drawRectangle({
    x, y, width: w, height: h,
    color: palette.bg,
    borderColor: palette.border,
    borderWidth: 0.75,
    opacity: 0.97,
  });
  // Header bar (always uses the brand accent color in both themes)
  page.drawRectangle({
    x, y: y + h - headerH, width: w, height: headerH, color: palette.accent,
  });
  // Bottom accent strip
  page.drawRectangle({
    x, y, width: w, height: accentH, color: palette.accentDeep,
  });

  // Header content: optional uploaded logo + wordmark. When no logo is
  // set we shrink the left padding so the wordmark doesn't sit
  // awkwardly far from the edge of the header bar.
  const logoSize = headerH - 8;
  const logoY = y + h - headerH + (headerH - logoSize) / 2;
  drawHeaderMark(page, x + 8, logoY, logoSize, palette, logoImage);
  const wordSize = Math.max(11, Math.min(16, headerH * 0.55));
  const wordY = y + h - headerH + (headerH - wordSize) / 2 + 1;
  const wordX = logoImage ? x + headerH + 8 : x + 10;
  // Either piece may be empty — print only the non-empty one and shift
  // the second over by the first's measured width.
  const wmA = safeText(branding.wordmarkPrimary);
  const wmB = safeText(branding.wordmarkSecondary);
  let cursor = wordX;
  if (wmA) {
    page.drawText(wmA, {
      x: cursor, y: wordY, size: wordSize, font: fonts.bold,
      color: palette.onAccent,
    });
    cursor += fonts.bold.widthOfTextAtSize(wmA, wordSize);
  }
  if (wmB) {
    page.drawText(wmB, {
      x: cursor, y: wordY, size: wordSize, font: fonts.regular,
      color: palette.onAccent,
    });
  }
  // Tagline ("SECURITY SYSTEMS" by default) — only renders if non-empty
  // AND there's clear room beyond the wordmark so it doesn't crowd it.
  const tagline = safeText(branding.tagline);
  if (tagline && w > 220) {
    const taglineW = fonts.bold.widthOfTextAtSize(tagline, 7);
    page.drawText(tagline, {
      x: x + w - 10 - taglineW,
      y: y + h - headerH + (headerH - 7) / 2,
      size: 7,
      font: fonts.bold,
      color: palette.onAccent,
    });
  }

  // Body grid
  const bx = x + 10;
  const by = y + h - headerH - 12;
  // Vertical real estate available for the body block (between header
  // and footer) — if the host mask is short we silently shrink the rows.
  const bodyH = h - headerH - footerH;
  const projTitleSize = Math.max(8, Math.min(12, bodyH * 0.16));
  const subSize = Math.max(7, Math.min(9, bodyH * 0.11));

  drawTextClipped(page, safeText(project.meta.projectName).toUpperCase(), {
    x: bx, y: by, size: projTitleSize,
    font: fonts.bold, color: palette.ink,
    maxWidth: w - 20,
  });
  drawTextClipped(page, safeText(project.meta.location), {
    x: bx, y: by - (projTitleSize + 2),
    size: subSize, font: fonts.regular, color: palette.ink2,
    maxWidth: w - 20,
  });

  page.drawLine({
    start: { x: bx, y: by - (projTitleSize + 8) },
    end: { x: x + w - 10, y: by - (projTitleSize + 8) },
    thickness: 0.4, color: palette.divider,
  });

  // 4-column metadata
  const metaY = by - (projTitleSize + 20);
  const colW = (w - 20) / 4;
  const cells = [
    { label: "PROJECT", value: safeText(project.meta.projectNumber) || "-" },
    {
      label: "SHEET",
      value:
        safeText(sheet.sheetNumber) ||
        `S-${String(sheetIndex + 1).padStart(2, "0")}`,
    },
    {
      label: "REV",
      value: safeText(sheet.revision || project.meta.revision) || "0",
    },
    {
      label: "DATE",
      value: safeText(new Date(project.meta.date).toLocaleDateString()),
    },
  ];
  cells.forEach((c, i) => {
    const cx = bx + colW * i;
    page.drawText(c.label, {
      x: cx, y: metaY + 11, size: 6,
      font: fonts.bold, color: palette.ink3,
    });
    drawTextClipped(page, c.value, {
      x: cx, y: metaY, size: 9,
      font: fonts.bold, color: palette.ink,
      maxWidth: colW - 4,
    });
  });

  // Sheet title (if there's room)
  if (metaY - 16 > y + footerH) {
    page.drawText("SHEET TITLE", {
      x: bx, y: metaY - 16, size: 6,
      font: fonts.bold, color: palette.ink3,
    });
    drawTextClipped(page, safeText(sheet.sheetTitle || sheet.name).toUpperCase(), {
      x: bx, y: metaY - 26, size: 9,
      font: fonts.bold, color: palette.ink,
      maxWidth: w - 20,
    });
  }

  // Footer row
  const footY = y + 8;
  page.drawText(
    safeText(
      sheet.scaleNote ||
        (sheet.calibration
          ? `1" = ${(12 / sheet.calibration.pixelsPerFoot).toFixed(2)}'`
          : "NOT TO SCALE"),
    ),
    { x: bx, y: footY, size: 7, font: fonts.bold, color: palette.accent },
  );
  const drawnBy = safeText(
    `BY  ${(project.meta.drawnBy || branding.fullName).toUpperCase()}`,
  );
  const drawnByW = fonts.regular.widthOfTextAtSize(drawnBy, 7);
  if (w > 220) {
    page.drawText(drawnBy, {
      x: x + w / 2 - drawnByW / 2, y: footY,
      size: 7, font: fonts.regular, color: palette.ink2,
    });
  }
  const idxStr = `${sheetIndex + 1} / ${totalSheets}`;
  const idxW = fonts.bold.widthOfTextAtSize(idxStr, 7);
  page.drawText(idxStr, {
    x: x + w - 10 - idxW, y: footY,
    size: 7, font: fonts.bold, color: palette.ink,
  });
}

/**
 * Draws the device legend on the right edge — icons + counts for every device
 * type used on this sheet.
 */
export function drawLegend({
  page,
  fonts,
  sheet,
  theme,
  bounds,
  branding,
}: {
  page: PDFPage;
  fonts: BrandFonts;
  sheet: Sheet;
  theme?: BrandTheme;
  /** User-placed rectangle (in pdf-lib page-up coords). When omitted we
   *  fall back to the historical default top-right slot. */
  bounds?: { x: number; y: number; width: number; height: number };
  branding?: BrandingConfig;
}) {
  const counts = new Map<string, number>();
  for (const m of sheet.markups) {
    if (m.kind === "device") {
      counts.set(m.deviceId, (counts.get(m.deviceId) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return;
  const entries = Array.from(counts.entries()).map(([id, qty]) => ({
    dev: devicesById[id],
    qty,
  })).filter((e) => e.dev);
  if (entries.length === 0) return;

  const palette = paletteFor(theme, resolveBranding(branding));
  const lineH = 14;
  const padding = 10;
  const headerH = 18;

  // Resolve bounds — explicit user choice, otherwise default top-right
  // sized to fit the entries we have.
  let x: number;
  let y: number;
  let w: number;
  let h: number;
  if (bounds) {
    x = bounds.x;
    y = bounds.y;
    w = bounds.width;
    h = bounds.height;
  } else {
    const { width: pw, height: ph } = page.getSize();
    w = 180;
    h = entries.length * lineH + padding * 2 + headerH + 2;
    x = pw - w - 16;
    y = ph - h - 16;
  }

  // How many rows fit in the user's box? If they shrunk it, we clip and
  // append a "+ N more" footer rather than overflow the rectangle.
  const maxLines = Math.max(0, Math.floor((h - headerH - padding * 2) / lineH));
  const visible = entries.slice(0, maxLines);
  const overflow = entries.length - visible.length;

  page.drawRectangle({
    x, y, width: w, height: h,
    color: palette.bg,
    borderColor: palette.accent,
    borderWidth: 0.5,
    opacity: 0.95,
  });
  page.drawRectangle({
    x, y: y + h - headerH, width: w, height: headerH,
    color: palette.accent,
  });
  page.drawText("LEGEND", {
    x: x + padding, y: y + h - 14, size: 9,
    font: fonts.bold, color: palette.onAccent,
  });
  const typesLabel = `${entries.length} ${entries.length === 1 ? "TYPE" : "TYPES"}`;
  const typesW = fonts.bold.widthOfTextAtSize(typesLabel, 7);
  page.drawText(typesLabel, {
    x: x + w - padding - typesW, y: y + h - 14, size: 7,
    font: fonts.bold, color: palette.onAccent,
  });

  visible.forEach((e, i) => {
    // pdf-lib y-up: row 0 sits just below the header, row N sits closer
    // to the bottom of the rect.
    const ly = y + h - headerH - padding - lineH * (i + 1) + 2;
    const color = hex(catColor[e.dev.category] ?? "#94A0B8");
    page.drawCircle({
      x: x + padding + 6, y: ly + 4, size: 5,
      color: palette.bgInner,
      borderColor: color, borderWidth: 0.6,
    });
    drawTextClipped(page, safeText(e.dev.shortCode), {
      x: x + padding + 16, y: ly + 1, size: 7,
      font: fonts.bold, color,
      maxWidth: 30,
    });
    drawTextClipped(page, safeText(e.dev.label), {
      x: x + padding + 50, y: ly + 1, size: 8,
      font: fonts.regular, color: palette.ink,
      maxWidth: w - padding * 2 - 50 - 24,
    });
    const qty = String(e.qty);
    const qw = fonts.bold.widthOfTextAtSize(qty, 9);
    page.drawText(qty, {
      x: x + w - padding - qw, y: ly, size: 9,
      font: fonts.bold, color: palette.accent,
    });
  });

  if (overflow > 0) {
    page.drawText(safeText(`+ ${overflow} more`), {
      x: x + padding,
      y: y + padding,
      size: 8,
      font: fonts.regular,
      color: palette.ink2,
    });
  }
}

// ───────── Helpers ─────────

function drawTextClipped(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; font: PDFFont; color: any; maxWidth: number },
) {
  let t = safeText(text);
  while (opts.font.widthOfTextAtSize(t, opts.size) > opts.maxWidth && t.length > 1) {
    t = t.slice(0, -1);
  }
  if (t !== safeText(text) && t.length > 3) t = t.slice(0, -1) + "...";
  page.drawText(t, {
    x: opts.x,
    y: opts.y,
    size: opts.size,
    font: opts.font,
    color: opts.color,
  });
}

/** Mini hex-shield monogram drawn with pdf-lib path ops. The body uses
 *  the palette's `bg` (so it sits cleanly inside whatever background
 *  the chrome is using) and the K stroke uses `accent` (so swapping
 *  the user's brand color cascades down to the mark). */
export function drawMonogram(
  page: PDFPage,
  x: number,
  y: number,
  size: number,
  accent: ReturnType<typeof hex> = KN_AMBER,
  body: ReturnType<typeof hex> = KN_MIDNIGHT,
) {
  const s = size;
  const half = s / 2;
  page.drawSvgPath(
    `M ${half} 0 L ${s} ${s * 0.22} L ${s} ${s * 0.78} L ${half} ${s} L 0 ${s * 0.78} L 0 ${s * 0.22} Z`,
    {
      x,
      y: y + s,
      color: body,
      borderColor: accent,
      borderWidth: 0.6,
    },
  );
  const k = s * 0.35;
  const kx = x + s * 0.32;
  const ky = y + s * 0.25;
  page.drawSvgPath(
    `M ${kx} ${ky} L ${kx} ${ky + k} M ${kx} ${ky + k / 2} L ${kx + k * 0.7} ${ky} M ${kx} ${ky + k / 2} L ${kx + k * 0.7} ${ky + k}`,
    {
      x: 0,
      y: 0,
      borderColor: accent,
      borderWidth: 1.2,
    },
  );
}

/** Header mark — only renders when the user has uploaded a logo. The
 *  tool intentionally ships with no default mark so any brand can use
 *  the export without inheriting an unrelated company's identity. */
function drawHeaderMark(
  page: PDFPage,
  x: number,
  y: number,
  size: number,
  _palette: ThemeColors,
  logoImage: PDFImage | undefined,
) {
  if (!logoImage) return;
  // Fit the image in a square box of `size`, preserving aspect ratio.
  // Center horizontally + vertically inside that box so wordmarks
  // longer than they are tall don't get squeezed.
  const dims = logoImage.scaleToFit(size, size);
  page.drawImage(logoImage, {
    x: x + (size - dims.width) / 2,
    y: y + (size - dims.height) / 2,
    width: dims.width,
    height: dims.height,
  });
}

export { catColor, catLabel };
