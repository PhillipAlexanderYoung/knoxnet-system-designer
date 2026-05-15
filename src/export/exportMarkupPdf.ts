import { PDFDocument, PDFImage, PDFPage, PDFFont, rgb, degrees } from "pdf-lib";
import type {
  Project,
  Sheet,
  Markup,
  ExportVisibility,
  DeviceMarkup,
} from "../store/projectStore";
import { devicesById } from "../data/devices";
import { cablesById } from "../data/cables";
import { categoryColor } from "../brand/tokens";
import {
  drawTitleBlock,
  drawLegend,
  loadBrandFonts,
  hex,
  safeText,
  type BrandFonts,
} from "./titleBlockRenderer";
import {
  resolveTheme,
  defaultTitleBlockBounds,
  defaultLegendBounds,
} from "../lib/sheetAnalysis";
import {
  cloudPath,
  formatFeet,
  polylineLengthPts,
  ptsToFeet,
  distancePts,
} from "../lib/geometry";
import { computeBid, usd } from "../lib/bid";
import {
  resolveBranding,
  resolveCoverPage,
  type BrandingConfig,
} from "../lib/branding";
import { resolveCoverage, rangeFtToPts } from "../lib/coverage";

/**
 * Builds and downloads a branded multi-sheet PDF:
 * - Cover page (project summary)
 * - Each marked-up sheet with title block + legend
 * - BOM & cable schedule appended
 *
 * Original sheet pages are preserved underneath; markups are drawn as
 * vector ops so they stay crisp at any zoom.
 */
export async function exportMarkupPdf(project: Project) {
  const out = await PDFDocument.create();
  const fonts = await loadBrandFonts(out);
  const branding = resolveBranding(project.branding);
  const logoImage = await maybeEmbedLogo(out, branding.logoDataUrl);
  // Standalone pages (cover + BOM) don't have a host PDF underneath, so
  // there's no sampled background to use for `auto` resolution. They
  // simply honor an explicit `light` / `dark` setting and otherwise fall
  // back to dark.
  const standaloneTheme: "dark" | "light" =
    project.brandTheme === "light" ? "light" : "dark";

  // Wrap each major step so a single bad sheet/markup can't kill the whole
  // export. Errors are logged with enough context that the user can isolate
  // the offending sheet from the dev console.
  try {
    await drawCoverPage(out, fonts, project, branding, logoImage, standaloneTheme);
  } catch (e) {
    console.error("[export] cover page failed:", e);
  }

  // v2.0: every sheet is exportable, regardless of source kind. PDF
  // sheets keep the original page as the underlay (pixel-perfect re-
  // export). Non-PDF sheets (DXF / SVG / raster) get a blank page sized
  // to the sheet's pageWidth / pageHeight; markups + title block render
  // over a blank background. A future pass can rasterize the DXF or
  // embed the SVG/raster as a PDF image — for now markups-only keeps
  // the export pipeline reliable for every kind.
  const includedSheets = project.sheets;
  let appendedSheetCount = 0;
  for (let i = 0; i < project.sheets.length; i++) {
    const sheet = project.sheets[i];
    try {
      const sourceKind = sheet.source?.kind ?? (sheet.pdfBytes ? "pdf" : null);
      if (sourceKind === "pdf") {
        const bytes = sheet.source?.kind === "pdf" ? sheet.source.bytes : sheet.pdfBytes;
        if (!bytes) {
          console.warn(`[export] skipping sheet "${sheet.name}" — no PDF bytes`);
          continue;
        }
        const src = await PDFDocument.load(bytes);
        const [copied] = await out.copyPages(src, [0]);
        out.addPage(copied);
      } else {
        // Blank page sized to the sheet — markups + title block draw
        // over white. Catches DXF / SVG / raster / IFC / missing source.
        out.addPage([sheet.pageWidth, sheet.pageHeight]);
      }
      const page = out.getPage(out.getPageCount() - 1);
      const theme = resolveTheme(project.brandTheme, sheet.bgColor);
      // 1. Cover-up masks first so original logos/stamps are hidden
      //    underneath everything we draw next.
      try {
        drawMasksOnPage(page, sheet);
      } catch (e) {
        console.error(`[export] masks failed on sheet "${sheet.name}":`, e);
      }
      // 2. Markups (devices, cables, callouts, etc.) over the masked page.
      try {
        drawMarkupsOnPage(page, sheet, project.exportVisibility, fonts);
      } catch (e) {
        console.error(`[export] markup draw failed on sheet "${sheet.name}":`, e);
      }
      // 3. Title block — at the user's chosen rect (sheet.titleBlockBounds)
      //    or the default bottom-right placement when they haven't moved
      //    it yet. Both editor and export agree on the default via
      //    `defaultTitleBlockBounds`.
      const tbApp =
        sheet.titleBlockBounds ?? defaultTitleBlockBounds(sheet);
      try {
        drawTitleBlock({
          page,
          fonts,
          project,
          sheet,
          sheetIndex: i,
          totalSheets: project.sheets.length,
          theme,
          bounds: appBoundsToPage(tbApp, sheet),
          branding,
          logoImage,
        });
      } catch (e) {
        console.error(`[export] title block failed on sheet "${sheet.name}":`, e);
      }
      // 4. Device legend — at the user's chosen rect, or default top-right.
      const lgApp = sheet.legendBounds ?? defaultLegendBounds(sheet);
      try {
        drawLegend({
          page,
          fonts,
          sheet,
          theme,
          bounds: appBoundsToPage(lgApp, sheet),
          branding,
        });
      } catch (e) {
        console.error(`[export] legend failed on sheet "${sheet.name}":`, e);
      }
      appendedSheetCount++;
    } catch (e) {
      console.error(`[export] could not append sheet "${sheet.name}":`, e);
    }
  }

  if (appendedSheetCount === 0 && includedSheets.length > 0) {
    // Every sheet failed — surface a single clear error rather than
    // producing an empty cover-only PDF.
    throw new Error(
      "All sheets failed to copy into the export. The source drawings may be corrupted or unsupported. See console for per-sheet details.",
    );
  }

  try {
    drawBomPage(out, fonts, project, branding, logoImage, standaloneTheme);
  } catch (e) {
    console.error("[export] BOM page failed:", e);
  }

  const bytes = await out.save();
  const safeName = safeText(project.meta.projectName).replace(/\s+/g, "-") || "Project";
  const brandSlug =
    safeText(branding.fullName)
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "Brand";
  triggerDownload(bytes, `${safeName}_${brandSlug}-Markup.pdf`);
}

// ───────────── Cover page ─────────────

/** Standalone-page palette. Cover and BOM are full pages we own
 *  end-to-end — they don't sit on top of a host PDF — so their theme is
 *  whatever the user explicitly picks (`dark` or `light`). When the
 *  brandTheme is `auto`, exports default the standalones to `dark`
 *  because there's no host PDF to blend with. The `light` variant gives
 *  a clean white-paper look (popular when the user wants every page of
 *  the deliverable to share the same paper-card aesthetic). */
interface StandalonePalette {
  bg: ReturnType<typeof hex>;
  bgPanel: ReturnType<typeof hex>;
  bgPanelBorder: ReturnType<typeof hex>;
  footerBg: ReturnType<typeof hex>;
  divider: ReturnType<typeof hex>;
  ink: ReturnType<typeof hex>;
  ink2: ReturnType<typeof hex>;
  ink3: ReturnType<typeof hex>;
  accent: ReturnType<typeof hex>;
  accentDeep: ReturnType<typeof hex>;
}

function standalonePalette(
  theme: "dark" | "light",
  branding: BrandingConfig,
): StandalonePalette {
  const accent = hex(branding.accentColor);
  const accentDeep = hex(branding.accentDeepColor);
  if (theme === "light") {
    return {
      bg: hex("#FFFFFF"),
      bgPanel: hex("#F4F6FA"),
      bgPanelBorder: hex("#D8DDE6"),
      footerBg: hex("#F0F2F6"),
      divider: hex("#C2CADA"),
      ink: hex("#0B1220"),
      ink2: hex("#3A4458"),
      ink3: hex("#5E6B85"),
      accent,
      accentDeep,
    };
  }
  return {
    bg: hex("#0B1220"),
    bgPanel: hex("#141C2B"),
    bgPanelBorder: hex("#1B2433"),
    footerBg: hex("#080E1A"),
    divider: hex("#1B2433"),
    ink: hex("#F5F7FA"),
    ink2: hex("#94A0B8"),
    ink3: hex("#5E6B85"),
    accent,
    accentDeep,
  };
}

async function drawCoverPage(
  out: PDFDocument,
  fonts: BrandFonts,
  project: Project,
  branding: BrandingConfig,
  logoImage: PDFImage | undefined,
  theme: "dark" | "light",
) {
  const page = out.addPage([792, 612]); // 11x8.5 landscape, decent cover
  const { width: pw, height: ph } = page.getSize();
  const p = standalonePalette(theme, branding);
  // Per-section visibility + editable subtitle. All sections default to
  // visible so existing projects render exactly as before.
  const cover = resolveCoverPage(project.coverPage);

  // Background — always rendered (the page has to have a color)
  page.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: p.bg });

  // Top accent bar
  page.drawRectangle({
    x: 0,
    y: ph - 8,
    width: pw,
    height: 8,
    color: p.accent,
  });

  // Diagonal accent stripe
  page.drawSvgPath(
    `M 0 ${ph - 8} L ${pw} ${ph - 8} L ${pw} ${ph - 12} L 0 ${ph - 12} Z`,
    { color: p.accentDeep },
  );

  // Big mark top-left — only renders when the user has uploaded a logo
  // AND hasn't disabled the logo section. No default mark, by design
  // (see Wordmark.tsx for the rationale).
  const showLogoSlot = !!logoImage && cover.showLogo;
  const markSize = 90;
  const markX = 60;
  const markY = ph - 140;
  if (showLogoSlot && logoImage) {
    const dims = logoImage.scaleToFit(markSize, markSize);
    page.drawImage(logoImage, {
      x: markX + (markSize - dims.width) / 2,
      y: markY + (markSize - dims.height) / 2,
      width: dims.width,
      height: dims.height,
    });
  }

  // Wordmark — primary bold + secondary regular accent. Either piece
  // may be empty; we just shift the cursor. Position shifts left when
  // there's no logo so the wordmark doesn't sit awkwardly far from the
  // edge of the page.
  if (cover.showWordmark) {
    const wmA = safeText(branding.wordmarkPrimary);
    const wmB = safeText(branding.wordmarkSecondary);
    const wmSize = 48;
    let wmCursor = showLogoSlot ? 168 : 60;
    if (wmA) {
      page.drawText(wmA, {
        x: wmCursor,
        y: ph - 100,
        size: wmSize,
        font: fonts.bold,
        color: p.ink,
      });
      wmCursor += fonts.bold.widthOfTextAtSize(wmA, wmSize) + 6;
    }
    if (wmB) {
      page.drawText(wmB, {
        x: wmCursor,
        y: ph - 100,
        size: wmSize,
        font: fonts.regular,
        color: p.accent,
      });
    }
  }
  // Cover-page tagline (e.g. "SECURITY · AUDIO/VIDEO · NETWORK"). Only
  // renders when the section is on AND the user has something to show —
  // empty string means "I don't want a tagline".
  if (cover.showTagline) {
    const cats = safeText(branding.coverCategories);
    if (cats) {
      page.drawText(cats, {
        x: showLogoSlot ? 170 : 60,
        y: ph - 122,
        size: 9,
        font: fonts.bold,
        color: p.ink2,
      });
    }
  }

  // Title section — y cursor walks down so each block sets its own
  // height and the next one falls naturally underneath. Used to be a
  // mix of cursor-down + absolute-y; cursor-down keeps suppressed
  // sections from leaving holes in the layout.
  const cx = 60;
  const innerW = pw - cx * 2;
  let cy = ph - 220;
  if (cover.showSubtitle) {
    const subtitle = safeText(cover.subtitle);
    if (subtitle) {
      page.drawText(subtitle, {
        x: cx,
        y: cy,
        size: 11,
        font: fonts.bold,
        color: p.accent,
      });
      cy -= 24;
    }
  }
  if (cover.showProjectName) {
    page.drawText(safeText(project.meta.projectName), {
      x: cx,
      y: cy,
      size: 32,
      font: fonts.bold,
      color: p.ink,
    });
    cy -= 22;
  }
  if (cover.showLocation && project.meta.location) {
    page.drawText(safeText(project.meta.location), {
      x: cx,
      y: cy,
      size: 13,
      font: fonts.regular,
      color: p.ink2,
    });
    cy -= 16;
  }
  if (cover.showClient && project.meta.client) {
    page.drawText(safeText(`Client: ${project.meta.client}`), {
      x: cx,
      y: cy,
      size: 11,
      font: fonts.regular,
      color: p.ink2,
    });
    cy -= 18;
  }

  // Project Summary — wrapping body paragraph that replaces the old
  // chunky stats grid. Only renders when the user has actually written
  // something in `meta.summary` AND the section is enabled.
  const summaryText = safeText(project.meta.summary ?? "");
  if (cover.showSummary && summaryText) {
    cy -= 18; // breathing room after the title block
    page.drawText("PROJECT SUMMARY", {
      x: cx,
      y: cy,
      size: 9,
      font: fonts.bold,
      color: p.accent,
    });
    cy -= 6;
    page.drawLine({
      start: { x: cx, y: cy },
      end: { x: cx + innerW, y: cy },
      color: p.divider,
      thickness: 0.4,
    });
    cy -= 14;
    const summarySize = 11;
    const summaryLines = wrapText(summaryText, fonts.regular, summarySize, innerW);
    // Cap at 8 lines so a runaway paragraph doesn't push the rest of
    // the cover off the bottom of the page.
    const visible = summaryLines.slice(0, 8);
    for (const line of visible) {
      page.drawText(line, {
        x: cx,
        y: cy,
        size: summarySize,
        font: fonts.regular,
        color: p.ink,
      });
      cy -= summarySize * 1.35;
    }
    if (summaryLines.length > visible.length) {
      page.drawText(`+ ${summaryLines.length - visible.length} more lines (see full PDF)`, {
        x: cx,
        y: cy,
        size: 8,
        font: fonts.regular,
        color: p.ink3,
      });
      cy -= 12;
    }
  }

  // Compact project stats — small inline label-value row, not the
  // dashboard-style grid we used to have. Sits as a single line under
  // whatever's above it, before the sheet index, so the overall
  // hierarchy stays project-first.
  if (cover.showStats) {
    cy -= 18;
    page.drawText("PROJECT FACTS", {
      x: cx,
      y: cy,
      size: 7,
      font: fonts.bold,
      color: p.ink3,
    });
    cy -= 6;
    page.drawLine({
      start: { x: cx, y: cy },
      end: { x: cx + innerW, y: cy },
      color: p.divider,
      thickness: 0.4,
    });
    cy -= 18;
    const bid = computeBid(project);
    const racksCount = project.racks?.length ?? 0;
    const totalDevices = bid.devices.reduce((s, d) => s + d.qty, 0);
    const totalFeet = bid.cables.reduce((s, c) => s + c.totalFeet, 0);
    // Distribute 4 facts evenly across the inner width — each cell has
    // a small uppercase label above a 14pt value.
    const facts = [
      { label: "SHEETS", value: String(project.sheets.length) },
      { label: "DEVICES", value: String(totalDevices) },
      { label: "CABLE FEET", value: totalFeet.toFixed(0) },
      racksCount > 0
        ? { label: "RACKS", value: String(racksCount) }
        : { label: "EST. TOTAL", value: usd(bid.totals.grandTotal) },
    ];
    const colW = innerW / facts.length;
    facts.forEach((f, i) => {
      const fx = cx + colW * i;
      page.drawText(f.label, {
        x: fx,
        y: cy + 12,
        size: 7,
        font: fonts.bold,
        color: p.ink3,
      });
      page.drawText(f.value, {
        x: fx,
        y: cy,
        size: 14,
        font: fonts.bold,
        color: p.ink,
      });
    });
    cy -= 14;
  }

  // Sheet index — uses the running cursor so it always lands directly
  // under whatever's above it, no awkward gaps.
  if (cover.showSheetIndex) {
    cy -= 18;
    page.drawText("SHEET INDEX", {
      x: cx,
      y: cy,
      size: 7,
      font: fonts.bold,
      color: p.ink3,
    });
    cy -= 6;
    page.drawLine({
      start: { x: cx, y: cy },
      end: { x: cx + innerW, y: cy },
      color: p.divider,
      thickness: 0.4,
    });
    cy -= 14;
    const lineH = 12;
    // How many lines fit before we'd run into the footer (24pt) plus
    // a small safety margin?
    const footerReserve = cover.showFooter ? 32 : 12;
    const maxLines = Math.max(1, Math.floor((cy - footerReserve) / lineH));
    const visible = project.sheets.slice(0, maxLines);
    visible.forEach((s, i) => {
      const ly = cy - i * lineH;
      page.drawText(safeText(s.sheetNumber || `S-${String(i + 1).padStart(2, "0")}`), {
        x: cx,
        y: ly,
        size: 8,
        font: fonts.bold,
        color: p.accent,
      });
      page.drawText(safeText(s.sheetTitle || s.name), {
        x: cx + 50,
        y: ly,
        size: 8,
        font: fonts.regular,
        color: p.ink2,
      });
    });
    if (project.sheets.length > visible.length) {
      page.drawText(`+ ${project.sheets.length - visible.length} more`, {
        x: cx,
        y: cy - visible.length * lineH,
        size: 8,
        font: fonts.regular,
        color: p.ink3,
      });
    }
  }

  // Footer (drawnBy + doc code)
  if (cover.showFooter) {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pw,
      height: 24,
      color: p.footerBg,
    });
    page.drawText(
      safeText(
        `${project.meta.drawnBy} · ${new Date(project.meta.date).toLocaleDateString()}`,
      ),
      {
        x: 60,
        y: 8,
        size: 8,
        font: fonts.regular,
        color: p.ink3,
      },
    );
    const docCode = safeText(
      `${branding.docCodePrefix}-${project.meta.projectNumber || "NEW"}-R${project.meta.revision || "0"}`,
    );
    page.drawText(docCode, {
      x: pw - 60 - fonts.bold.widthOfTextAtSize(docCode, 8),
      y: 8,
      size: 8,
      font: fonts.bold,
      color: p.accent,
    });
  }
}

// ───────────── Masks (cover-ups) ─────────────

/**
 * Convert a rectangle stored in app-space (PDF-down, top-left origin —
 * the same convention masks and markups use) into pdf-lib page-space
 * (PDF-up, bottom-left origin). Used for masks and for branding bounds
 * so the editor preview and the exported PDF agree pixel-for-pixel.
 */
function appBoundsToPage(
  b: { x: number; y: number; width: number; height: number },
  sheet: Sheet,
) {
  return {
    x: b.x,
    y: sheet.pageHeight - b.y - b.height,
    width: b.width,
    height: b.height,
  };
}

function drawMasksOnPage(page: PDFPage, sheet: Sheet) {
  const masks = sheet.maskRegions ?? [];
  for (const m of masks) {
    const fill = m.fill ?? sheet.bgColor ?? "#FFFFFF";
    const b = appBoundsToPage(m, sheet);
    try {
      page.drawRectangle({
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        color: hex(fill),
        // Fully opaque on purpose — the user wants the original content
        // *gone*, not faded.
        opacity: 1,
      });
    } catch (e) {
      console.error(`[export] mask ${m.id} failed:`, e);
    }
  }
}

// ───────────── Per-sheet markup drawing ─────────────

function drawMarkupsOnPage(
  page: PDFPage,
  sheet: Sheet,
  exportVisibility: ExportVisibility | undefined,
  fonts: BrandFonts,
) {
  // Per-markup-kind filter — `false` means the user explicitly toggled
  // the kind off in the Export Visibility panel. Missing entries default
  // to true (visible).
  const isKindVisible = (m: Markup) =>
    exportVisibility?.[m.kind] !== false;

  // Pre-resolve where each device's tag pill should sit. Devices with
  // a user-pinned offset bypass the auto-layout entirely (their pin
  // wins). Auto-laid pills still avoid covering other device icons
  // and pinned tags. See `layoutDeviceTags` for the full algorithm.
  const tagLayouts = layoutDeviceTags(sheet, exportVisibility, fonts);

  // First pass: render coverage shapes BEHIND the markups so the device
  // icons stay readable on top of them.
  if (sheet.calibration) {
    for (const m of sheet.markups) {
      if (m.hidden) continue;
      if (m.kind !== "device") continue;
      if (!isKindVisible(m)) continue;
      try {
        drawCoverageForDevice(page, sheet, m);
      } catch (e) {
        console.error(
          `[export] coverage for ${m.id} on "${sheet.name}" failed:`,
          e,
        );
      }
    }
  }
  // Second pass: device icons + cables + annotations.
  for (const m of sheet.markups) {
    if (m.hidden) continue;
    if (!isKindVisible(m)) continue;
    try {
      drawSingleMarkup(page, sheet, m, tagLayouts, fonts);
    } catch (e) {
      // One bad markup must not abort the whole sheet — log and continue so
      // the user still gets the rest of their work in the export.
      console.error(
        `[export] markup ${m.kind} (${m.id}) on "${sheet.name}" failed:`,
        e,
      );
    }
  }
}

// ───────────── Device tag auto-layout ─────────────

/**
 * Geometry for a single device's tag pill, expressed in **app-space**
 * (y-down, top-left origin — same convention as `Markup.x/y`). The
 * exporter picks one of these positions per device so tags don't fully
 * cover other device icons or other tags.
 */
interface TagLayout {
  /** Top-left corner of the pill rect in app-space. */
  x: number;
  y: number;
  /** Pill width / height in PDF user units. */
  w: number;
  h: number;
  /** Sanitized label text rendered inside the pill. */
  text: string;
  /** Font size used for the label. */
  fontSize: number;
}

/**
 * Auto-place every visible device's tag so the pills stay readable on
 * crowded sheets without moving the underlying device icons. The
 * algorithm is greedy: walk the markups in sheet order, try a ranked
 * list of candidate offsets per tag, and accept the first one that
 * doesn't intersect another device disc or another already-placed tag
 * rect. Tag rects can still touch coverage shapes — those are
 * translucent and don't block readability.
 *
 * Falls back to the editor-default offset (top-right, slightly above
 * the disc) when no clean spot exists, which preserves the previous
 * behavior on extremely dense plans.
 */
function layoutDeviceTags(
  sheet: Sheet,
  exportVisibility: ExportVisibility | undefined,
  fonts: BrandFonts,
): Map<string, TagLayout> {
  const layouts = new Map<string, TagLayout>();
  const isVisible = (m: Markup) =>
    !m.hidden && exportVisibility?.[m.kind] !== false;

  type Disc = { id: string; x: number; y: number; r: number };
  const discs: Disc[] = [];
  for (const m of sheet.markups) {
    if (m.kind !== "device" || !isVisible(m)) continue;
    const size = m.size ?? 28;
    discs.push({ id: m.id, x: m.x, y: m.y, r: size / 2 });
  }

  // Two-pass layout. Pass 1: lock in every user-pinned pill so they
  // win unconditionally — the auto-layout in pass 2 then routes
  // around them. Pass 2: greedy candidate search for the rest.
  type Pending = {
    m: DeviceMarkup;
    text: string;
    size: number;
    fontSize: number;
    w: number;
    h: number;
  };
  const pending: Pending[] = [];
  for (const m of sheet.markups) {
    if (m.kind !== "device" || !isVisible(m)) continue;
    const dev = devicesById[m.deviceId];
    if (!dev) continue;
    const labelTextRaw = m.labelOverride
      ? `${m.tag ?? ""} · ${m.labelOverride}`
      : m.tag ?? "";
    const text = safeText(labelTextRaw);
    if (!text) continue;

    const size = m.size ?? 28;
    // Honor the per-instance override; otherwise scale with icon and
    // clamp to a readable range so tiny icons don't get unreadable tags.
    const fontSize =
      m.tagFontSize ?? Math.max(7, Math.min(11, size * 0.32));
    // Precise text width from the embedded font — the legacy
    // char-count approximation could mis-size the pill by a few
    // points which showed up as edge clipping on long tags.
    const textW = fonts.mono.widthOfTextAtSize(text, fontSize);
    const w = textW + 10; // 5pt padding L/R
    const h = fontSize + 4;

    if (m.tagOffsetX !== undefined || m.tagOffsetY !== undefined) {
      // Pinned — record immediately so subsequent auto-layouts route
      // around the pinned rect.
      const r = size / 2;
      const dx = m.tagOffsetX ?? r + 4;
      const dy = m.tagOffsetY ?? -r - 4;
      layouts.set(m.id, {
        x: m.x + dx,
        y: m.y + dy,
        w,
        h,
        text,
        fontSize,
      });
      continue;
    }
    pending.push({ m, text, size, fontSize, w, h });
  }

  for (const p of pending) {
    const r = p.size / 2;
    const candidates = generateTagCandidates(r, p.w, p.h);
    let chosen: { dx: number; dy: number } | null = null;
    for (const cand of candidates) {
      const rect: Rect = {
        x: p.m.x + cand.dx,
        y: p.m.y + cand.dy,
        w: p.w,
        h: p.h,
      };
      if (!tagCollides(rect, p.m.id, discs, layouts)) {
        chosen = cand;
        break;
      }
    }
    // Crowded plan? Fall back to the editor default — at least it'll
    // still be legible 9 times out of 10, and matches what the user
    // sees in the editor.
    if (!chosen) chosen = { dx: r + 4, dy: -r - 4 };

    layouts.set(p.m.id, {
      x: p.m.x + chosen.dx,
      y: p.m.y + chosen.dy,
      w: p.w,
      h: p.h,
      text: p.text,
      fontSize: p.fontSize,
    });
  }

  return layouts;
}

/**
 * Candidate offsets from device center to the **top-left corner** of
 * the tag pill, in priority order. The first entry replicates the
 * editor's natural "top-right of disc" placement; remaining entries
 * fan out clockwise around the device at progressively larger
 * distances so a clean spot can almost always be found on busy sheets.
 */
function generateTagCandidates(
  discR: number,
  w: number,
  h: number,
): { dx: number; dy: number }[] {
  const gap = 4;
  const candidates: { dx: number; dy: number }[] = [
    // Editor default — top-right, just above the disc.
    { dx: discR + gap, dy: -discR - gap },
  ];
  // 8 directions around the device. Order favors "above" placements
  // because tags above the icon look the cleanest in plan view.
  const dirs: Array<[number, number]> = [
    [1, -1], // up-right
    [0, -1], // up
    [-1, -1], // up-left
    [-1, 0], // left
    [1, 0], // right
    [-1, 1], // down-left
    [0, 1], // down
    [1, 1], // down-right
  ];
  for (let step = 0; step <= 4; step++) {
    const extra = step * (h + 6);
    const reach = discR + gap + extra;
    for (const [ux, uy] of dirs) {
      const len = Math.hypot(ux, uy) || 1;
      const nx = ux / len;
      const ny = uy / len;
      // Push the *centroid* of the tag along the direction so the
      // closest edge sits roughly at `reach` from the device center.
      const centerDist = reach + Math.max(w, h) / 2;
      candidates.push({
        dx: nx * centerDist - w / 2,
        dy: ny * centerDist - h / 2,
      });
    }
  }
  return candidates;
}

type Rect = { x: number; y: number; w: number; h: number };

function tagCollides(
  rect: Rect,
  ownDeviceId: string,
  discs: { id: string; x: number; y: number; r: number }[],
  placed: Map<string, TagLayout>,
): boolean {
  // Reject if the candidate would visually swallow another device's
  // icon disc.
  for (const d of discs) {
    if (d.id === ownDeviceId) continue;
    if (rectIntersectsCircle(rect, d.x, d.y, d.r)) return true;
  }
  // Reject if it overlaps an already-placed tag rect — even slight
  // overlap makes both labels harder to read.
  for (const [otherId, t] of placed) {
    if (otherId === ownDeviceId) continue;
    if (rectsIntersect(rect, { x: t.x, y: t.y, w: t.w, h: t.h })) return true;
  }
  return false;
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.w <= b.x ||
    b.x + b.w <= a.x ||
    a.y + a.h <= b.y ||
    b.y + b.h <= a.y
  );
}

function rectIntersectsCircle(
  rect: Rect,
  cx: number,
  cy: number,
  r: number,
): boolean {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < r * r;
}

/**
 * Render a device's coverage area (FOV cone, AP signal rings, beam path,
 * etc.) onto the PDF as vector shapes. Mirrors `CoverageShape.tsx` so the
 * exported PDF matches what the user sees on screen.
 *
 * Coordinate conventions used inside this function:
 *
 *   • Path geometry for `drawSvgPath` is built in **app-space**
 *     (y-down, top-left origin — same as `Markup.x/y`). We then pass
 *     `y: sheet.pageHeight` so pdf-lib's `drawSvgPath` flips the path
 *     once into PDF page-space. The `polygon` and `arrow` markups use
 *     this same pattern. (Pre-flipping the path AND letting drawSvgPath
 *     flip again pushed the wedge off-page, so 360° coverage circles
 *     rendered fine but cones did not.)
 *   • Direct shape APIs like `drawCircle` and `drawLine` take PDF
 *     page-space coords directly, so we convert with `py(...)` at the
 *     call site.
 */
function drawCoverageForDevice(
  page: PDFPage,
  sheet: Sheet,
  m: Extract<Markup, { kind: "device" }>,
) {
  const cov = resolveCoverage(m);
  if (!cov || !cov.enabled) return;
  const r = rangeFtToPts(cov.rangeFt, sheet.calibration);
  if (r === null || r <= 0) return;

  // App-space center (y-down).
  const cx = m.x;
  const cy = m.y;
  const py = (yDown: number) => sheet.pageHeight - yDown;
  const color = hex(cov.color);
  const fillOp = cov.opacity;
  const strokeOp = 0.55;
  const rotation = m.rotation ?? 0;

  if (cov.shape === "circle") {
    const rings = Math.max(1, cov.rings);
    for (let i = 0; i < rings; i++) {
      const ringR = r * ((rings - i) / rings);
      const ringFillOp = fillOp * ((i + 1) / rings) * 0.7;
      page.drawCircle({
        x: cx,
        y: py(cy),
        size: ringR,
        color,
        opacity: ringFillOp,
        borderColor: color,
        borderOpacity: strokeOp * ((i + 1) / rings + 0.2),
        borderWidth: 0.5,
      });
    }
    // Crisp outer ring — matches the editor's outer stroke.
    page.drawCircle({
      x: cx,
      y: py(cy),
      size: r,
      borderColor: color,
      borderOpacity: strokeOp,
      borderWidth: 0.7,
    });
    return;
  }

  if (cov.shape === "sector" || cov.shape === "beam") {
    // Angle convention in y-down app-space:
    //   • UI rotation 0° = facing up; rotation increases clockwise.
    //   • In y-down math angles, 0° points right (+x) and angles grow
    //     clockwise (+y is down). So "facing up at rotation 0" is at
    //     -90° (or equivalently 270°).
    //   • Sweep grows clockwise, so SVG arc sweep-flag = 1 (clockwise).
    const sweep = cov.angle;
    const facingDeg = -90 + rotation;
    const startDeg = facingDeg - sweep / 2;
    const endDeg = facingDeg + sweep / 2;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const apexFt = cov.apexOffsetFt;
    const apexPts =
      cov.shape === "sector"
        ? Math.min(rangeFtToPts(apexFt, sheet.calibration) ?? 0, r * 0.4)
        : 0;

    const polar = (rad: number, deg: number) => ({
      x: cx + rad * Math.cos(toRad(deg)),
      y: cy + rad * Math.sin(toRad(deg)),
    });
    const innerStart = polar(apexPts, startDeg);
    const innerEnd = polar(apexPts, endDeg);
    const outerStart = polar(r, startDeg);
    const outerEnd = polar(r, endDeg);
    const largeArc = sweep > 180 ? 1 : 0;
    const sweepFlag = 1; // clockwise in y-down

    // 1) Filled body — main wedge or the 3 quality bands.
    if (cov.showQualityZones && cov.shape === "sector") {
      const zones = [0.35, 0.6, 1.0]; // identify, recognize, detect
      let prev = apexPts;
      zones.forEach((f, i) => {
        const r0 = prev;
        const r1 = apexPts + (r - apexPts) * f;
        const a0s = polar(r0, startDeg);
        const a0e = polar(r0, endDeg);
        const a1s = polar(r1, startDeg);
        const a1e = polar(r1, endDeg);
        const path =
          `M ${a0s.x} ${a0s.y}` +
          ` L ${a1s.x} ${a1s.y}` +
          ` A ${r1} ${r1} 0 ${largeArc} ${sweepFlag} ${a1e.x} ${a1e.y}` +
          ` L ${a0e.x} ${a0e.y}` +
          (r0 > 0
            ? ` A ${r0} ${r0} 0 ${largeArc} ${1 - sweepFlag} ${a0s.x} ${a0s.y}`
            : ` Z`);
        page.drawSvgPath(path, {
          x: 0,
          y: sheet.pageHeight,
          color,
          opacity: fillOp * (1 - i * 0.3),
          borderColor: color,
          borderOpacity: strokeOp * 0.5,
          borderWidth: 0.4,
        });
        prev = r1;
      });
    } else {
      const bodyPath =
        apexPts > 0
          ? `M ${innerStart.x} ${innerStart.y}` +
            ` L ${outerStart.x} ${outerStart.y}` +
            ` A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${outerEnd.x} ${outerEnd.y}` +
            ` L ${innerEnd.x} ${innerEnd.y}` +
            ` A ${apexPts} ${apexPts} 0 ${largeArc} ${1 - sweepFlag} ${innerStart.x} ${innerStart.y} Z`
          : `M ${cx} ${cy}` +
            ` L ${outerStart.x} ${outerStart.y}` +
            ` A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${outerEnd.x} ${outerEnd.y} Z`;
      page.drawSvgPath(bodyPath, {
        x: 0,
        y: sheet.pageHeight,
        color,
        opacity: fillOp,
      });
      // Inner depth band — replicates the editor's stronger inner Arc
      // so the cone visually fades from camera → edge instead of being
      // a flat translucent slab.
      const innerR = apexPts + (r - apexPts) * 0.55;
      const innerBandStart = polar(innerR, startDeg);
      const innerBandEnd = polar(innerR, endDeg);
      const innerBandPath =
        apexPts > 0
          ? `M ${innerStart.x} ${innerStart.y}` +
            ` L ${innerBandStart.x} ${innerBandStart.y}` +
            ` A ${innerR} ${innerR} 0 ${largeArc} ${sweepFlag} ${innerBandEnd.x} ${innerBandEnd.y}` +
            ` L ${innerEnd.x} ${innerEnd.y}` +
            ` A ${apexPts} ${apexPts} 0 ${largeArc} ${1 - sweepFlag} ${innerStart.x} ${innerStart.y} Z`
          : `M ${cx} ${cy}` +
            ` L ${innerBandStart.x} ${innerBandStart.y}` +
            ` A ${innerR} ${innerR} 0 ${largeArc} ${sweepFlag} ${innerBandEnd.x} ${innerBandEnd.y} Z`;
      page.drawSvgPath(innerBandPath, {
        x: 0,
        y: sheet.pageHeight,
        color,
        opacity: fillOp * 0.55,
      });
    }

    // 2) Crisp outer arc — drawn as a separate stroke so the cone has
    //    a clearly defined outer edge (the body's fill alone is too
    //    translucent at default 18% opacity).
    const outerArcPath =
      `M ${outerStart.x} ${outerStart.y}` +
      ` A ${r} ${r} 0 ${largeArc} ${sweepFlag} ${outerEnd.x} ${outerEnd.y}`;
    page.drawSvgPath(outerArcPath, {
      x: 0,
      y: sheet.pageHeight,
      borderColor: color,
      borderOpacity: strokeOp,
      borderWidth: 0.9,
    });

    // 3) Two radial edges — the "walls" of the cone. Use drawLine in
    //    PDF page-space so we don't pay the SvgPath flip cost twice.
    page.drawLine({
      start: { x: innerStart.x, y: py(innerStart.y) },
      end: { x: outerStart.x, y: py(outerStart.y) },
      thickness: 0.7,
      color,
      opacity: strokeOp * 0.9,
    });
    page.drawLine({
      start: { x: innerEnd.x, y: py(innerEnd.y) },
      end: { x: outerEnd.x, y: py(outerEnd.y) },
      thickness: 0.7,
      color,
      opacity: strokeOp * 0.9,
    });

    // 4) Distance markers at 25/50/75% of (range - apex). pdf-lib's
    //    `drawSvgPath` does support `borderDashArray`, so we get real
    //    dashed arcs (matching the editor's `dash={[3, 3]}`).
    if (cov.showRangeMarkers && cov.shape === "sector") {
      [0.25, 0.5, 0.75].forEach((f) => {
        const rr = apexPts + (r - apexPts) * f;
        const s = polar(rr, startDeg);
        const e = polar(rr, endDeg);
        page.drawSvgPath(
          `M ${s.x} ${s.y} A ${rr} ${rr} 0 ${largeArc} ${sweepFlag} ${e.x} ${e.y}`,
          {
            x: 0,
            y: sheet.pageHeight,
            borderColor: color,
            borderOpacity: strokeOp * 0.5,
            borderWidth: 0.4,
            borderDashArray: [3, 3],
          },
        );
      });
    }

    // 5) Optical-axis centerline.
    if (cov.showCenterline && cov.shape === "sector") {
      const centerEnd = polar(r, facingDeg);
      page.drawLine({
        start: { x: cx, y: py(cy) },
        end: { x: centerEnd.x, y: py(centerEnd.y) },
        thickness: 0.55,
        color,
        opacity: strokeOp * 0.75,
        dashArray: [5, 4],
      });
    }

    // 6) Lens tick at the apex midpoint — small dot that visually
    //    anchors the cone to the camera body.
    if (apexPts > 0) {
      const tick = polar(apexPts, facingDeg);
      page.drawCircle({
        x: tick.x,
        y: py(tick.y),
        size: 1.4,
        color,
        opacity: Math.min(1, strokeOp + 0.25),
      });
    }
    return;
  }

  if (cov.shape === "rect") {
    const w = r;
    const h = cov.angle > 0 ? r * (cov.angle / 100) : r * 0.08;
    page.drawRectangle({
      x: cx - w / 2,
      y: py(cy) - h / 2,
      width: w,
      height: h,
      rotate: degrees(-rotation + 90),
      color,
      opacity: fillOp,
      borderColor: color,
      borderOpacity: strokeOp,
      borderWidth: 0.5,
    });
    return;
  }
}

function drawSingleMarkup(
  page: PDFPage,
  sheet: Sheet,
  m: Markup,
  tagLayouts?: Map<string, TagLayout>,
  fonts?: BrandFonts,
) {
  // Convert all coords from PDF-down (our markup space) to pdf-lib up
  const py = (yDown: number) => sheet.pageHeight - yDown;

  if (m.kind === "device") {
    const dev = devicesById[m.deviceId];
    if (!dev) return;
    const colorHex = m.colorOverride ?? categoryColor[dev.category] ?? "#94A0B8";
    const color = hex(colorHex);
    const fillSoft = mix(color, hex("#0B1220"), 0.78);
    const size = m.size ?? 28;
    const r = size / 2;
    const cx = m.x;
    const cy = py(m.y);

    // Halo + disc
    page.drawCircle({
      x: cx,
      y: cy,
      size: r,
      color: fillSoft,
      borderColor: color,
      borderWidth: 1.5,
    });

    // Icon paths (24x24 viewBox centered on (12,12)).
    const scale = (r * 2) / 24;
    for (const p of dev.icon.paths) {
      const fill =
        p.fill === "currentFill"
          ? fillSoft
          : p.fill === "currentStroke"
          ? color
          : p.fill
          ? hex(p.fill)
          : undefined;
      const stroke =
        p.stroke === "currentStroke"
          ? color
          : p.stroke === "currentFill"
          ? fillSoft
          : p.stroke
          ? hex(p.stroke)
          : undefined;
      page.drawSvgPath(p.d, {
        x: cx - r,
        y: cy + r,
        scale,
        color: fill,
        borderColor: stroke,
        borderWidth: p.strokeWidth ?? 0,
      });
    }

    // Tag + optional friendly label. The position comes from the
    // pre-computed layout pass so the pill won't fully cover other
    // devices or other tags; falls back to the editor default
    // (top-right of disc) when no layout was computed.
    const layout = tagLayouts?.get(m.id);
    const labelTextRaw = m.labelOverride
      ? `${m.tag ?? ""} · ${m.labelOverride}`
      : m.tag ?? "";
    const labelText = layout?.text ?? safeText(labelTextRaw);
    if (labelText) {
      const fontSize = layout?.fontSize ?? Math.max(7, Math.min(11, size * 0.32));
      const tagW = layout?.w ?? labelText.length * fontSize * 0.55 + 10;
      const tagH = layout?.h ?? fontSize + 4;
      // App-space rect (top-left corner). Falls back to the editor
      // default — tag pinned just above-and-right of the device disc.
      const tagAppX = layout?.x ?? m.x + r + 4;
      const tagAppY = layout?.y ?? m.y - r - 4;
      // pdf-lib's drawRectangle anchors at the bottom-left in y-up
      // page coords, so the y conversion has to subtract the height.
      const tagX = tagAppX;
      const tagY = py(tagAppY) - tagH;
      page.drawRectangle({
        x: tagX,
        y: tagY,
        width: tagW,
        height: tagH,
        color: hex("#0B1220"),
        borderColor: color,
        borderWidth: 0.4,
        opacity: 0.95,
      });
      // Embedded mono font keeps the tag crisp at any zoom and gives
      // us exact glyph widths upstream so the pill is sized to the
      // text rather than approximated character-count.
      page.drawText(labelText, {
        x: tagX + 5,
        y: tagY + 3,
        size: fontSize,
        font: fonts?.mono,
        color: hex("#F5F7FA"),
      });
      // Leader line for tags that ended up far from their device — a
      // thin dashed connector keeps the association obvious. Skip
      // when the tag is touching/overlapping the disc (close case).
      if (layout) {
        const tagCx = layout.x + layout.w / 2;
        const tagCy = layout.y + layout.h / 2;
        const dist = Math.hypot(tagCx - m.x, tagCy - m.y);
        if (dist > r + tagH + 6) {
          // Pull the leader to the nearest point on the tag rect, so
          // the line ends at the pill edge instead of stabbing through
          // the text.
          const edgeX = Math.max(layout.x, Math.min(m.x, layout.x + layout.w));
          const edgeY = Math.max(layout.y, Math.min(m.y, layout.y + layout.h));
          page.drawLine({
            start: { x: m.x, y: py(m.y) },
            end: { x: edgeX, y: py(edgeY) },
            thickness: 0.5,
            color,
            opacity: 0.5,
            dashArray: [3, 2],
          });
        }
      }
    }
    return;
  }

  if (m.kind === "cable") {
    const cab = cablesById[m.cableId];
    if (!cab) return;
    const color = hex(cab.color);
    const flat = m.points;
    if (flat.length < 4) return;
    // Draw segments as separate lines (dash if present)
    for (let i = 2; i < flat.length; i += 2) {
      page.drawLine({
        start: { x: flat[i - 2], y: py(flat[i - 1]) },
        end: { x: flat[i], y: py(flat[i + 1]) },
        thickness: cab.thickness ?? 2,
        color,
        dashArray: cab.dash,
      });
    }
    // Length + connector pill — always paint a label so even uncalibrated
    // sheets show what kind of run is what; calibrated sheets get real
    // feet, otherwise we fall back to a "~Npx" estimate.
    const lenPts = polylineLengthPts(flat);
    const ft = ptsToFeet(lenPts, sheet.calibration);
    const lengthText =
      ft !== null ? formatFeet(ft, 0) : `~${lenPts.toFixed(0)}px`;
    const labelParts = [`${cab.shortCode}  ${lengthText}`];
    if (m.connector) labelParts.push(m.connector);
    const text = safeText(labelParts.join("  ·  "));
    const mid = midOfFlat(flat);
    const fontSize = 8;
    const w = text.length * fontSize * 0.6 + 12;
    page.drawRectangle({
      x: mid.x - w / 2,
      y: py(mid.y) + 3,
      width: w,
      height: 13,
      color: hex("#0B1220"),
      borderColor: color,
      borderWidth: 0.4,
      opacity: 0.95,
    });
    page.drawText(text, {
      x: mid.x - w / 2 + 6,
      y: py(mid.y) + 6,
      size: fontSize,
      color: hex("#F5F7FA"),
    });

    // Endpoint A / B chips at the polyline ends so a glance at the export
    // tells the install crew what plugs into what. We render them as
    // small filled tags in the cable's color, matching the on-canvas look.
    const drawEndpoint = (
      label: string | undefined,
      prefix: string,
      ex: number,
      ey: number,
    ) => {
      if (!label) return;
      const t = safeText(`${prefix} · ${label}`);
      const ww = t.length * 7 * 0.6 + 8;
      page.drawRectangle({
        x: ex + 4,
        y: py(ey) - 4,
        width: ww,
        height: 11,
        color,
        opacity: 0.95,
      });
      page.drawText(t, {
        x: ex + 7,
        y: py(ey) - 1,
        size: 7,
        color: hex("#0B1220"),
      });
    };
    if (flat.length >= 4) {
      drawEndpoint(m.endpointA, "A", flat[0], flat[1]);
      drawEndpoint(m.endpointB, "B", flat[flat.length - 2], flat[flat.length - 1]);
    }
    return;
  }

  if (m.kind === "text") {
    page.drawText(safeText(m.text), {
      x: m.x,
      y: py(m.y) - m.fontSize,
      size: m.fontSize,
      color: hex(m.color),
    });
    return;
  }

  if (m.kind === "callout") {
    const c = hex(m.color);
    page.drawLine({
      start: { x: m.x1, y: py(m.y1) },
      end: { x: m.x2, y: py(m.y2) },
      thickness: 1,
      color: c,
    });
    const fontSize = 9;
    const calloutText = safeText(m.text);
    const w = Math.max(60, calloutText.length * fontSize * 0.55 + 12);
    const h = 16;
    page.drawRectangle({
      x: m.x2,
      y: py(m.y2) - h / 2,
      width: w,
      height: h,
      color: hex("#0B1220"),
      borderColor: c,
      borderWidth: 0.6,
    });
    page.drawText(calloutText, {
      x: m.x2 + 6,
      y: py(m.y2) - h / 2 + 4,
      size: fontSize,
      color: c,
    });
    return;
  }

  if (m.kind === "cloud") {
    page.drawSvgPath(cloudPath(m.x, m.y, m.width, m.height), {
      x: 0,
      y: sheet.pageHeight,
      scale: 1,
      borderColor: hex(m.color),
      borderWidth: 1.6,
    });
    return;
  }

  if (m.kind === "dimension") {
    const c = hex(m.color);
    page.drawLine({
      start: { x: m.p1.x, y: py(m.p1.y) },
      end: { x: m.p2.x, y: py(m.p2.y) },
      thickness: 1,
      color: c,
    });
    const angle = Math.atan2(m.p2.y - m.p1.y, m.p2.x - m.p1.x);
    const tick = 5;
    const px = -Math.sin(angle) * tick;
    const pyOff = Math.cos(angle) * tick;
    [m.p1, m.p2].forEach((p) => {
      page.drawLine({
        start: { x: p.x - px, y: py(p.y) + pyOff },
        end: { x: p.x + px, y: py(p.y) - pyOff },
        thickness: 1,
        color: c,
      });
    });
    const len = distancePts(m.p1, m.p2);
    const ft = ptsToFeet(len, sheet.calibration);
    if (ft !== null) {
      const text = safeText(formatFeet(ft));
      const fontSize = 8;
      const tw = text.length * fontSize * 0.55 + 10;
      const mx = (m.p1.x + m.p2.x) / 2;
      const my = (m.p1.y + m.p2.y) / 2;
      page.drawRectangle({
        x: mx - tw / 2,
        y: py(my) + 3,
        width: tw,
        height: 12,
        color: hex("#0B1220"),
        borderColor: c,
        borderWidth: 0.4,
      });
      page.drawText(text, {
        x: mx - tw / 2 + 5,
        y: py(my) + 5,
        size: fontSize,
        color: c,
      });
    }
    return;
  }

  if (m.kind === "rect") {
    page.drawRectangle({
      x: m.x,
      y: py(m.y) - m.height,
      width: m.width,
      height: m.height,
      borderColor: hex(m.color),
      borderWidth: 1.2,
      color: m.fill ? hex(extractHexFromRgba(m.fill)) : undefined,
      opacity: m.fill ? 0.15 : undefined,
    });
    return;
  }

  if (m.kind === "arrow") {
    const c = hex(m.color);
    page.drawLine({
      start: { x: m.p1.x, y: py(m.p1.y) },
      end: { x: m.p2.x, y: py(m.p2.y) },
      thickness: 1.4,
      color: c,
    });
    // Arrowhead — pdf-lib's drawSvgPath flips the y-axis automatically
    // when `y` is set to `sheet.pageHeight` (treating the path as
    // SVG y-down with origin at the top-left of the page). We feed it
    // raw app-space coords (y-down, top-left origin) and let pdf-lib do
    // the flip; manually pre-flipping with py() and passing y:0 was
    // double-flipping the geometry off the bottom of the page.
    const angle = Math.atan2(m.p2.y - m.p1.y, m.p2.x - m.p1.x);
    const headLen = 8;
    const headW = 4;
    const ax = m.p2.x;
    const ay = m.p2.y;
    const bx = ax - Math.cos(angle) * headLen + Math.sin(angle) * headW;
    const by = ay - Math.sin(angle) * headLen - Math.cos(angle) * headW;
    const cx = ax - Math.cos(angle) * headLen - Math.sin(angle) * headW;
    const cy = ay - Math.sin(angle) * headLen + Math.cos(angle) * headW;
    page.drawSvgPath(`M ${ax} ${ay} L ${bx} ${by} L ${cx} ${cy} Z`, {
      x: 0,
      y: sheet.pageHeight,
      color: c,
    });
    return;
  }

  if (m.kind === "polygon") {
    if (m.points.length < 6) return;
    // Same y-axis story as `arrow` above — feed raw y-down points to
    // drawSvgPath with the origin at the page top so pdf-lib flips
    // them once. Previously the code flipped them twice and the
    // polygon ended up below the page.
    let path = `M ${m.points[0]} ${m.points[1]}`;
    for (let i = 2; i < m.points.length; i += 2) {
      path += ` L ${m.points[i]} ${m.points[i + 1]}`;
    }
    path += " Z";
    page.drawSvgPath(path, {
      x: 0,
      y: sheet.pageHeight,
      borderColor: hex(m.color),
      borderWidth: 1.2,
      color: m.fill ? hex(extractHexFromRgba(m.fill)) : undefined,
      opacity: m.fill ? 0.12 : undefined,
    });
    return;
  }

  if (m.kind === "freehand") {
    const pts = m.points;
    if (pts.length < 4) return;
    for (let i = 2; i < pts.length; i += 2) {
      page.drawLine({
        start: { x: pts[i - 2], y: py(pts[i - 1]) },
        end: { x: pts[i], y: py(pts[i + 1]) },
        thickness: m.thickness,
        color: hex(m.color),
      });
    }
    return;
  }
}

// ───────────── BOM / Cable Schedule page ─────────────

function drawBomPage(
  out: PDFDocument,
  fonts: BrandFonts,
  project: Project,
  branding: BrandingConfig,
  logoImage: PDFImage | undefined,
  theme: "dark" | "light",
) {
  const bid = computeBid(project);
  const page = out.addPage([792, 612]);
  const { width: pw, height: ph } = page.getSize();
  const p = standalonePalette(theme, branding);

  page.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: p.bg });
  page.drawRectangle({ x: 0, y: ph - 8, width: pw, height: 8, color: p.accent });

  if (logoImage) {
    const dims = logoImage.scaleToFit(40, 40);
    page.drawImage(logoImage, {
      x: 36 + (40 - dims.width) / 2,
      y: ph - 88 + (40 - dims.height) / 2,
      width: dims.width,
      height: dims.height,
    });
  }
  // Title slides left when no logo so the BOM doesn't have a gaping
  // 56pt gap between the page edge and "BILL OF MATERIALS".
  const bomTextX = logoImage ? 92 : 36;
  page.drawText("BILL OF MATERIALS", {
    x: bomTextX,
    y: ph - 60,
    size: 22,
    font: fonts.bold,
    color: p.ink,
  });
  page.drawText(safeText(project.meta.projectName), {
    x: bomTextX,
    y: ph - 80,
    size: 10,
    font: fonts.regular,
    color: p.ink2,
  });

  // Devices table
  let y = ph - 130;
  drawTableHeader(page, fonts, y, ["DEVICE", "TAG", "QTY", "UNIT $", "EXT $", "HRS"], [220, 70, 50, 70, 80, 50], 36, p.accent, p.ink);
  y -= 16;
  for (const d of bid.devices) {
    if (y < 220) {
      // overflow: simple cap; could paginate
      page.drawText(`+ ${bid.devices.length} more device lines (see XLSX)`, {
        x: 36,
        y,
        size: 8,
        font: fonts.regular,
        color: p.ink2,
      });
      break;
    }
    drawTableRow(
      page,
      fonts,
      y,
      [d.label, d.shortCode, String(d.qty), usd(d.unitCost), usd(d.extCost), d.extLabor.toFixed(1)],
      [220, 70, 50, 70, 80, 50],
      36,
      p.ink,
    );
    y -= 13;
  }

  // Cable schedule
  y -= 24;
  page.drawText("CABLE SCHEDULE", {
    x: 36,
    y,
    size: 11,
    font: fonts.bold,
    color: p.accent,
  });
  y -= 14;
  drawTableHeader(page, fonts, y, ["CABLE", "FT (POST-SLACK)", "$/FT", "EXT $", "HRS"], [240, 110, 70, 80, 50], 36, p.accent, p.ink);
  y -= 14;
  for (const c of bid.cables) {
    drawTableRow(
      page,
      fonts,
      y,
      [c.label, c.totalFeet.toFixed(0), usd(c.costPerFoot), usd(c.extCost), c.extLabor.toFixed(1)],
      [240, 110, 70, 80, 50],
      36,
      p.ink,
    );
    y -= 13;
  }

  // Totals box
  const tx = pw - 280;
  const tw = 240;
  const tBoxY = 60;
  const tBoxH = 130;
  page.drawRectangle({ x: tx, y: tBoxY, width: tw, height: tBoxH, color: p.bgPanel, borderColor: p.accent, borderWidth: 0.6 });
  page.drawRectangle({ x: tx, y: tBoxY + tBoxH - 16, width: tw, height: 16, color: p.accent });
  page.drawText("ESTIMATED TOTAL", {
    x: tx + 10,
    y: tBoxY + tBoxH - 12,
    size: 9,
    font: fonts.bold,
    // Always reads on top of the accent-color bar — KN_MIDNIGHT works on
    // any brand-color amber/red/green/blue so it stays legible.
    color: hex("#0B1220"),
  });
  const lines = [
    ["Material", usd(bid.totals.materialCost)],
    [`Labor (${bid.totals.laborHours.toFixed(1)} hr)`, usd(bid.totals.laborCost)],
    ["Overhead", usd(bid.totals.overhead)],
    ["Margin", usd(bid.totals.margin)],
    ["Tax", usd(bid.totals.tax)],
  ];
  let ly = tBoxY + tBoxH - 32;
  for (const [k, v] of lines) {
    page.drawText(k, { x: tx + 10, y: ly, size: 8, font: fonts.regular, color: p.ink2 });
    page.drawText(v, { x: tx + tw - 10 - fonts.bold.widthOfTextAtSize(v, 8), y: ly, size: 8, font: fonts.bold, color: p.ink });
    ly -= 12;
  }
  page.drawLine({ start: { x: tx + 10, y: ly + 6 }, end: { x: tx + tw - 10, y: ly + 6 }, thickness: 0.4, color: p.divider });
  page.drawText("GRAND TOTAL", { x: tx + 10, y: ly - 8, size: 10, font: fonts.bold, color: p.accent });
  const gt = usd(bid.totals.grandTotal);
  page.drawText(gt, { x: tx + tw - 10 - fonts.bold.widthOfTextAtSize(gt, 14), y: ly - 12, size: 14, font: fonts.bold, color: p.ink });

  // Footer — drawnBy falls through to the brand fullName when blank.
  page.drawText(
    safeText(
      `${branding.fullName} · ${project.meta.drawnBy || branding.fullName} · ${new Date().toLocaleDateString()}`,
    ),
    {
      x: 36,
      y: 24,
      size: 7,
      font: fonts.regular,
      color: p.ink3,
    },
  );
}

function drawTableHeader(
  page: PDFPage,
  fonts: BrandFonts,
  y: number,
  cols: string[],
  widths: number[],
  x0: number,
  accent: ReturnType<typeof hex> = hex("#F4B740"),
  // The header text uses the accent color in the dark variant. The
  // light variant passes a darker ink so labels stay legible on white
  // paper.
  _labelInk?: ReturnType<typeof hex>,
) {
  // We accept an optional `_labelInk` for symmetry with `drawTableRow`,
  // but historically the headers use the accent color which already
  // works in both themes when the accent has reasonable contrast.
  void _labelInk;
  let x = x0;
  page.drawLine({
    start: { x: x0, y: y - 2 },
    end: { x: x0 + widths.reduce((a, b) => a + b, 0), y: y - 2 },
    thickness: 0.4,
    color: accent,
  });
  cols.forEach((c, i) => {
    page.drawText(c, {
      x,
      y: y + 2,
      size: 7,
      font: fonts.bold,
      color: accent,
    });
    x += widths[i];
  });
}
function drawTableRow(
  page: PDFPage,
  fonts: BrandFonts,
  y: number,
  cells: string[],
  widths: number[],
  x0: number,
  ink: ReturnType<typeof hex> = hex("#E2E7EF"),
) {
  let x = x0;
  cells.forEach((c, i) => {
    const text = safeText(String(c));
    page.drawText(text.length > 38 ? text.slice(0, 36) + "..." : text, {
      x,
      y,
      size: 8,
      font: i === 0 ? fonts.regular : fonts.regular,
      color: ink,
    });
    x += widths[i];
  });
}

// ───────────── Helpers ─────────────

/**
 * Word-wrap a single-line string into multiple lines that each fit
 * within `maxWidth` when rendered with the given font + size. Used by
 * the cover page's Project Summary paragraph so a freeform description
 * lays out as a body block without overflowing the page. Falls back to
 * hard-breaking words longer than the column width so a giant
 * single-token (e.g. a URL) doesn't kill the layout.
 */
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  // Honor existing newlines first; each becomes its own paragraph.
  for (const para of text.split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let cur = "";
    for (const w of words) {
      const candidate = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        cur = candidate;
        continue;
      }
      // Single word too long for the column → hard-break it.
      if (!cur) {
        let chunk = "";
        for (const ch of w) {
          if (font.widthOfTextAtSize(chunk + ch, size) <= maxWidth) {
            chunk += ch;
          } else {
            if (chunk) lines.push(chunk);
            chunk = ch;
          }
        }
        cur = chunk;
      } else {
        lines.push(cur);
        cur = w;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines;
}

function midOfFlat(flat: number[]) {
  const total = polylineLengthPts(flat);
  let acc = 0;
  for (let i = 2; i < flat.length; i += 2) {
    const ax = flat[i - 2];
    const ay = flat[i - 1];
    const bx = flat[i];
    const by = flat[i + 1];
    const seg = Math.hypot(bx - ax, by - ay);
    if (acc + seg >= total / 2) {
      const t = (total / 2 - acc) / seg;
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
    }
    acc += seg;
  }
  return { x: flat[flat.length - 2], y: flat[flat.length - 1] };
}

function mix(a: any, b: any, t: number) {
  // t=0 → a, t=1 → b
  return rgb(
    a.red * (1 - t) + b.red * t,
    a.green * (1 - t) + b.green * t,
    a.blue * (1 - t) + b.blue * t,
  );
}

function extractHexFromRgba(s: string) {
  // simple translator for our common rgba(...) helper: returns close hex
  // for the most common cases. We just use white/amber-ish colors.
  if (s.startsWith("#")) return s;
  return "#F4B740";
}

function triggerDownload(bytes: Uint8Array, name: string) {
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/**
 * Decode the user's uploaded logo (a PNG or JPG data URL stored on
 * `Project.branding.logoDataUrl`) and embed it once into the export
 * document. The returned `PDFImage` can then be drawn on every page that
 * needs the brand mark — title block, cover, BOM — without re-decoding
 * for each placement. Returns `undefined` if there's no logo or if the
 * image can't be parsed; callers fall back to the built-in monogram.
 */
async function maybeEmbedLogo(
  out: PDFDocument,
  dataUrl: string | undefined,
): Promise<PDFImage | undefined> {
  if (!dataUrl) return undefined;
  try {
    const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl);
    if (!m) {
      console.warn("[export] logo must be a PNG or JPG data URL — got", dataUrl.slice(0, 32));
      return undefined;
    }
    const kind = m[1].toLowerCase();
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    if (kind === "png") return await out.embedPng(bytes);
    return await out.embedJpg(bytes);
  } catch (e) {
    console.error("[export] logo embed failed:", e);
    return undefined;
  }
}
