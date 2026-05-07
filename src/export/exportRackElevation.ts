// Rack Elevation PDF — branded, vector, shareable.
// Renders the same faceplate schema that the on-screen RackDeviceFaceplate
// uses, but with pdf-lib draw calls so it stays crisp at any zoom.

import { PDFDocument, PDFImage, PDFPage, rgb } from "pdf-lib";
import type { Project, Rack } from "../store/projectStore";
import {
  rackDevicesById,
  type Faceplate,
  type RackDeviceType,
  type LedKind,
} from "../data/rackDevices";
import { loadBrandFonts, hex, safeText, type BrandFonts } from "./titleBlockRenderer";
import { resolveBranding, type BrandingConfig } from "../lib/branding";

const KN_MID = hex("#0B1220");
const KN_INK = hex("#F5F7FA");
const KN_INK_300 = hex("#94A0B8");
const KN_INK_400 = hex("#5E6B85");
const KN_INK_500 = hex("#3A4458");
const KN_STEEL = hex("#1B2433");

const LED_RGB: Record<LedKind, ReturnType<typeof hex>> = {
  power: hex("#2BD37C"),
  status: hex("#4FB7FF"),
  // `link` LEDs follow the brand accent at draw time — see `drawFaceplate`.
  link: hex("#F4B740"),
  alert: hex("#FF5C7A"),
};

const BASE_RGB: Record<Faceplate["base"], ReturnType<typeof hex>> = {
  black: hex("#1A1F29"),
  graphite: hex("#2A3140"),
  white: hex("#E2E7EF"),
  silver: hex("#B8C0CF"),
  // `amber` faceplates also follow the brand accent — they look correct
  // for any team's brand color, not just the bundled amber.
  amber: hex("#F4B740"),
};

export async function exportRackElevation(project: Project, rack: Rack) {
  const out = await PDFDocument.create();
  const fonts = await loadBrandFonts(out);
  const branding = resolveBranding(project.branding);
  const logoImage = await maybeEmbedLogo(out, branding.logoDataUrl);
  // Letter portrait — fits a 42U rack comfortably with title + schedule.
  const page = out.addPage([612, 792]);
  drawElevation(page, fonts, project, rack, branding, logoImage);

  const bytes = await out.save();
  // Brand the filename so multi-company users can tell exports apart at
  // a glance in their downloads folder.
  const brandSlug =
    safeText(branding.fullName)
      .replace(/[^A-Za-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "Brand";
  triggerDownload(
    bytes,
    `${project.meta.projectName.replace(/\s+/g, "-")}_${brandSlug}_${rack.name.replace(/\s+/g, "-")}_Elevation.pdf`,
  );
}

/** Same logo embedder used by the markup PDF — kept independent so this
 *  module can ship without depending on the markup file's internals. */
async function maybeEmbedLogo(
  out: PDFDocument,
  dataUrl: string | undefined,
): Promise<PDFImage | undefined> {
  if (!dataUrl) return undefined;
  try {
    const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(dataUrl);
    if (!m) return undefined;
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    return m[1].toLowerCase() === "png"
      ? await out.embedPng(bytes)
      : await out.embedJpg(bytes);
  } catch (e) {
    console.error("[rack-elev] logo embed failed:", e);
    return undefined;
  }
}

function drawElevation(
  page: PDFPage,
  fonts: BrandFonts,
  project: Project,
  rack: Rack,
  branding: BrandingConfig,
  logoImage: PDFImage | undefined,
) {
  const { width: pw, height: ph } = page.getSize();
  const ACCENT = hex(branding.accentColor);

  // Background
  page.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: KN_MID });
  page.drawRectangle({ x: 0, y: ph - 6, width: pw, height: 6, color: ACCENT });

  // ─── Header — uploaded logo (no default mark) + wordmark ───
  if (logoImage) {
    const dims = logoImage.scaleToFit(38, 38);
    page.drawImage(logoImage, {
      x: 30 + (38 - dims.width) / 2,
      y: ph - 80 + (38 - dims.height) / 2,
      width: dims.width,
      height: dims.height,
    });
  }
  // Wordmark — primary in bold, secondary in accent. Either piece may be
  // empty; we just shift the cursor. Slides left when no logo so the
  // wordmark doesn't sit awkwardly far from the page edge.
  const wmA = safeText(branding.wordmarkPrimary);
  const wmB = safeText(branding.wordmarkSecondary);
  const headerLeft = logoImage ? 78 : 30;
  let wmCursor = headerLeft;
  if (wmA) {
    page.drawText(wmA, { x: wmCursor, y: ph - 56, size: 22, font: fonts.bold, color: KN_INK });
    wmCursor += fonts.bold.widthOfTextAtSize(wmA, 22) + 2;
  }
  if (wmB) {
    page.drawText(wmB, { x: wmCursor, y: ph - 56, size: 22, font: fonts.regular, color: ACCENT });
  }
  page.drawText("RACK ELEVATION", { x: headerLeft, y: ph - 76, size: 8, font: fonts.bold, color: KN_INK_300 });

  page.drawText("DOCUMENT", { x: pw - 130, y: ph - 50, size: 7, font: fonts.bold, color: KN_INK_400 });
  // Doc code uses the brand's prefix so codes match what the markup PDF
  // and bid PDF print (e.g. AC-12345-RACK-Equipment).
  const code = safeText(
    `${branding.docCodePrefix}-${project.meta.projectNumber || "NEW"}-RACK-${rack.name.replace(/\s+/g, "")}`,
  );
  page.drawText(code, { x: pw - 130, y: ph - 64, size: 11, font: fonts.bold, color: ACCENT });
  page.drawText(new Date().toLocaleDateString(), {
    x: pw - 130,
    y: ph - 78,
    size: 7,
    font: fonts.regular,
    color: KN_INK_300,
  });

  // ─── Project + rack title block ───
  let y = ph - 110;
  page.drawText("PROJECT", { x: 30, y, size: 7, font: fonts.bold, color: KN_INK_400 });
  y -= 12;
  page.drawText(safeText(project.meta.projectName), { x: 30, y, size: 14, font: fonts.bold, color: KN_INK });
  y -= 14;
  if (project.meta.location) {
    page.drawText(safeText(project.meta.location), { x: 30, y, size: 8, font: fonts.regular, color: KN_INK_300 });
    y -= 10;
  }

  page.drawText("RACK", { x: pw / 2, y: ph - 110, size: 7, font: fonts.bold, color: KN_INK_400 });
  page.drawText(safeText(rack.name.toUpperCase()), {
    x: pw / 2,
    y: ph - 122,
    size: 14,
    font: fonts.bold,
    color: ACCENT,
  });
  page.drawText(safeText(`${rack.uHeight}U  ${rack.location ?? ""}`), {
    x: pw / 2,
    y: ph - 136,
    size: 8,
    font: fonts.regular,
    color: KN_INK_300,
  });

  // ─── Rack chassis ───
  const rackTop = ph - 170;
  const rackBottom = 200; // leave room for schedule
  const rackHeight = rackTop - rackBottom;
  const uPx = rackHeight / rack.uHeight;
  const railW = 14;
  const interiorW = 200; // logical width
  const rackLeft = 60;
  const interiorLeft = rackLeft + railW;
  const rackTotalW = interiorW + railW * 2;

  // Chassis backplate
  page.drawRectangle({
    x: rackLeft,
    y: rackBottom,
    width: rackTotalW,
    height: rackHeight,
    color: hex("#04080F"),
    borderColor: KN_STEEL,
    borderWidth: 0.5,
  });

  // Rails
  drawRail(page, fonts, rackLeft, rackBottom, railW, rackHeight, rack.uHeight, "left");
  drawRail(page, fonts, rackLeft + railW + interiorW, rackBottom, railW, rackHeight, rack.uHeight, "right");

  // Subtle U guides
  for (let u = 1; u < rack.uHeight; u++) {
    const ly = rackBottom + u * uPx;
    page.drawLine({
      start: { x: interiorLeft, y: ly },
      end: { x: interiorLeft + interiorW, y: ly },
      color: hex("#0E1422"),
      thickness: 0.3,
    });
  }

  // Devices
  for (const p of rack.placements) {
    const dev = rackDevicesById[p.deviceId];
    if (!dev) continue;
    const deviceTop = rackBottom + (p.uSlot + dev.uHeight - 1) * uPx;
    const deviceBottom = rackBottom + (p.uSlot - 1) * uPx;
    drawFaceplate(page, fonts, dev, p.label, interiorLeft, deviceBottom, interiorW, deviceTop - deviceBottom, ACCENT);
  }

  // ─── Schedule + totals ───
  drawSchedule(page, fonts, rack, 290, rackBottom, pw - 320, rackHeight, ACCENT);

  // Footer — drawnBy falls through to the brand's full name when the
  // user hasn't put their own name in the project metadata.
  page.drawText(
    safeText(
      `Drawn by ${project.meta.drawnBy || branding.fullName} · ${branding.fullName} · This rack elevation may be shared.`,
    ),
    {
      x: 30,
      y: 24,
      size: 7,
      font: fonts.regular,
      color: KN_INK_400,
    },
  );
}

// ───── Rail with hole pattern + U numbers ─────

function drawRail(
  page: PDFPage,
  fonts: BrandFonts,
  x: number,
  yBottom: number,
  w: number,
  h: number,
  uHeight: number,
  side: "left" | "right",
) {
  page.drawRectangle({
    x,
    y: yBottom,
    width: w,
    height: h,
    color: hex("#1A2030"),
    borderColor: KN_STEEL,
    borderWidth: 0.4,
  });
  const uPx = h / uHeight;
  for (let u = 1; u <= uHeight; u++) {
    const cy = yBottom + (u - 0.5) * uPx;
    // mounting hole
    page.drawCircle({
      x: x + w / 2,
      y: cy,
      size: 1.4,
      color: hex("#04080F"),
    });
    // U number every 4U for readability
    if (u % 4 === 0 || u === 1 || u === uHeight) {
      const txt = String(u);
      const tw = fonts.regular.widthOfTextAtSize(txt, 5);
      page.drawText(txt, {
        x: side === "left" ? x + 1 : x + w - tw - 1,
        y: cy - 1.6,
        size: 5,
        font: fonts.regular,
        color: KN_INK_400,
      });
    }
  }
}

// ───── Faceplate (mirror of RackDeviceFaceplate) ─────

function drawFaceplate(
  page: PDFPage,
  fonts: BrandFonts,
  dev: RackDeviceType,
  overlayLabel: string | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: ReturnType<typeof hex>,
) {
  const f = dev.faceplate;
  // The `amber` faceplate base color tracks the user's brand accent so
  // a non-amber brand still gets a coherent-looking equipment chassis.
  // The other base colors (black/graphite/white/silver) are physical
  // materials — they don't change with branding.
  const baseColor = f.base === "amber" ? accent : BASE_RGB[f.base];
  // Base
  page.drawRectangle({ x, y, width: w, height: h, color: baseColor });
  // top highlight band
  page.drawRectangle({ x, y: y + h - 0.6, width: w, height: 0.6, color: hex("#FFFFFF"), opacity: 0.12 });
  // bottom shadow band
  page.drawRectangle({ x, y, width: w, height: 0.6, color: hex("#000000"), opacity: 0.4 });

  // Vents
  if (f.vents) {
    for (let vx = x + 8; vx < x + w - 8; vx += 2) {
      page.drawLine({
        start: { x: vx, y: y + 1 },
        end: { x: vx, y: y + h - 1 },
        thickness: 0.6,
        color: hex("#000000"),
        opacity: 0.55,
      });
    }
  }

  // Mounting screws
  if (f.screws) {
    page.drawCircle({ x: x + 3.5, y: y + h / 2, size: 1.6, color: hex("#5E6B85") });
    page.drawCircle({ x: x + w - 3.5, y: y + h / 2, size: 1.6, color: hex("#5E6B85") });
  }

  // Brand stripe (per-equipment color — e.g. Cisco blue, APC green).
  // When the equipment doesn't specify a color we fall back to the
  // user's brand accent so the document feels coherent.
  if (f.brand) {
    const bx = x + (f.brand.x / 100) * w;
    const stripeColor = f.brand.accent ? hex(f.brand.accent) : accent;
    page.drawRectangle({
      x: bx,
      y: y + h * 0.18,
      width: 1.6,
      height: h * 0.64,
      color: stripeColor,
    });
    const fontSize = Math.max(5, h * 0.22);
    page.drawText(f.brand.text, {
      x: bx + 3,
      y: y + h * 0.32,
      size: fontSize,
      font: fonts.bold,
      color: stripeColor,
    });
  }

  // Texts
  for (const t of f.texts ?? []) {
    const tx = x + (t.x / 100) * w;
    const yPct = (t.y ?? 30) / 100;
    const ty = y + h - h * yPct - 4;
    const sizeMap = { xs: 4.5, sm: 5.5, md: 6.5, lg: 7.5 } as const;
    const sz = sizeMap[t.size ?? "sm"];
    const font = t.weight === "bold" ? fonts.bold : fonts.regular;
    // Faceplate text colors — `amber` refers to the brand accent (so the
    // text follows the user's color), the other tokens are neutral.
    const color =
      t.color === "amber"
        ? accent
        : t.color === "muted"
        ? KN_INK_400
        : KN_INK;
    page.drawText(t.text, { x: tx, y: ty, size: sz, font, color });
  }

  // Bays
  for (const b of f.bays ?? []) {
    const bx = x + (b.x / 100) * w;
    const bw = (b.w / 100) * w;
    const bh = (b.h / 100) * h;
    const yPct = (b.y ?? 12) / 100;
    const by = y + h - bh - h * yPct;
    let bg = hex("#0B0F18");
    if (b.style === "battery") bg = hex("#14202E");
    else if (b.style === "outlet") bg = hex("#08101A");
    else if (b.style === "vent") bg = hex("#1A2030");
    else if (b.style === "hdd") bg = hex("#0B0F18");

    page.drawRectangle({
      x: bx,
      y: by,
      width: bw,
      height: bh,
      color: bg,
      borderColor: hex("#3A4458"),
      borderWidth: 0.3,
    });
    if (b.style === "vent") {
      for (let vx = bx + 1; vx < bx + bw - 1; vx += 1.5) {
        page.drawLine({
          start: { x: vx, y: by + 1 },
          end: { x: vx, y: by + bh - 1 },
          thickness: 0.3,
          color: hex("#000000"),
          opacity: 0.5,
        });
      }
    }
    if (b.style === "hdd") {
      // Activity LED dot
      page.drawCircle({
        x: bx + bw - 1.6,
        y: by + bh - 1.6,
        size: 0.6,
        color: hex("#2BD37C"),
      });
    }
    if (b.style === "outlet") {
      // Two slot prongs + ground hole
      page.drawRectangle({
        x: bx + bw / 2 - 1.5,
        y: by + bh * 0.55,
        width: 0.6,
        height: 1.6,
        color: hex("#000000"),
      });
      page.drawRectangle({
        x: bx + bw / 2 + 0.9,
        y: by + bh * 0.55,
        width: 0.6,
        height: 1.6,
        color: hex("#000000"),
      });
      page.drawCircle({ x: bx + bw / 2, y: by + bh * 0.25, size: 0.6, color: hex("#000000") });
    }
    if (b.label) {
      const lblSize = Math.max(3.5, bh * 0.18);
      const tw = fonts.regular.widthOfTextAtSize(b.label, lblSize);
      page.drawText(b.label, {
        x: bx + (bw - tw) / 2,
        y: by + 1,
        size: lblSize,
        font: fonts.regular,
        color: KN_INK_300,
      });
    }
  }

  // Port groups — `amber` is the abstract brand-accent token, the rest
  // are literal port colors that match the physical equipment.
  for (const g of f.ports ?? []) {
    const colorMap = {
      amber: accent,
      navy: hex("#1F3A5F"),
      green: hex("#2BD37C"),
      white: hex("#E2E7EF"),
      black: hex("#1A2030"),
    } as const;
    const portColor = colorMap[g.color ?? "amber"];
    const rows = g.rows ?? 1;
    const portsPerRow = Math.ceil(g.count / rows);
    const portW = Math.max(1.4, Math.min(3.2, 16 / portsPerRow));
    const portH = Math.max(1.6, Math.min(2.4, h * 0.32 / rows));
    const startX = x + (g.x / 100) * w;
    const yPct = (g.y ?? 18) / 100;
    const startY = y + h - portH - h * yPct;
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < portsPerRow; c++) {
        if (i >= g.count) break;
        page.drawRectangle({
          x: startX + c * (portW + 0.3),
          y: startY - r * (portH + 0.3),
          width: portW,
          height: portH,
          color: portColor,
          borderColor: hex("#000000"),
          borderWidth: 0.15,
        });
        i++;
      }
    }
  }

  // LEDs — `link` (yellow/amber LED) follows the brand accent so it
  // reads as part of the same family as the rest of the document chrome.
  // Power/status/alert LEDs are physical signal colors that don't change.
  for (const l of f.leds ?? []) {
    const lx = x + (l.x / 100) * w;
    const yPct = (l.y ?? 28) / 100;
    const ly = y + h - h * yPct - 2;
    const size = Math.max(0.7, h * 0.08);
    const color = l.kind === "link" ? accent : LED_RGB[l.kind];
    page.drawCircle({
      x: lx,
      y: ly,
      size,
      color,
      opacity: l.on ? 1 : 0.25,
    });
  }

  // Overlay label
  if (overlayLabel) {
    const txt = overlayLabel.toUpperCase();
    const sz = Math.max(4, h * 0.18);
    const tw = fonts.bold.widthOfTextAtSize(txt, sz);
    page.drawRectangle({
      x: x + w - tw - 6,
      y: y + 1,
      width: tw + 4,
      height: sz + 1.5,
      color: hex("#000000"),
      opacity: 0.7,
      borderColor: accent,
      borderWidth: 0.3,
    });
    page.drawText(txt, {
      x: x + w - tw - 4,
      y: y + 1.8,
      size: sz,
      font: fonts.bold,
      color: accent,
    });
  }
}

// ───── Schedule on the right ─────

function drawSchedule(
  page: PDFPage,
  fonts: BrandFonts,
  rack: Rack,
  x: number,
  y: number,
  w: number,
  h: number,
  accent: ReturnType<typeof hex>,
) {
  // Background panel
  page.drawRectangle({
    x,
    y,
    width: w,
    height: h,
    color: hex("#0E141F"),
    borderColor: KN_STEEL,
    borderWidth: 0.4,
  });
  // Header
  page.drawRectangle({
    x,
    y: y + h - 18,
    width: w,
    height: 18,
    color: accent,
  });
  page.drawText("RACK SCHEDULE", {
    x: x + 8,
    y: y + h - 13,
    size: 9,
    font: fonts.bold,
    color: KN_MID,
  });
  page.drawText(`${rack.placements.length} ITEMS`, {
    x: x + w - 70,
    y: y + h - 13,
    size: 8,
    font: fonts.bold,
    color: KN_MID,
  });

  let cursorY = y + h - 32;
  // Column header
  drawCols(page, fonts, x + 8, cursorY, ["U", "DEVICE", "MFG·MODEL", "TAG"], [22, 130, 80, w - 250]);
  cursorY -= 9;
  page.drawLine({
    start: { x: x + 6, y: cursorY + 6 },
    end: { x: x + w - 6, y: cursorY + 6 },
    thickness: 0.3,
    color: KN_INK_500,
  });

  let totalW = 0;
  let totalLb = 0;
  let totalUsed = 0;
  let totalCost = 0;

  // Sort top-down
  const sorted = [...rack.placements].sort((a, b) => b.uSlot - a.uSlot);
  for (const p of sorted) {
    const d = rackDevicesById[p.deviceId];
    if (!d) continue;
    if (cursorY < y + 100) {
      page.drawText("…", { x: x + 8, y: cursorY, size: 8, font: fonts.bold, color: KN_INK_400 });
      break;
    }
    drawCols(page, fonts, x + 8, cursorY, [
      `U${p.uSlot}${d.uHeight > 1 ? `–${p.uSlot + d.uHeight - 1}` : ""}`,
      truncate(d.label, 22),
      truncate(`${d.manufacturer} ${d.model}`, 18),
      truncate(p.label ?? "", 14),
    ], [22, 130, 80, w - 250]);
    cursorY -= 11;
    totalW += d.powerWatts;
    totalLb += d.weightLbs;
    totalUsed += d.uHeight;
    totalCost += p.costOverride ?? d.defaultCost;
  }

  // Totals box pinned to the bottom of the panel
  const tbY = y + 8;
  const tbH = 88;
  page.drawRectangle({
    x: x + 6,
    y: tbY,
    width: w - 12,
    height: tbH,
    color: hex("#141C2B"),
    borderColor: accent,
    borderWidth: 0.4,
  });
  page.drawRectangle({
    x: x + 6,
    y: tbY + tbH - 14,
    width: w - 12,
    height: 14,
    color: accent,
  });
  page.drawText("TOTALS", {
    x: x + 12,
    y: tbY + tbH - 11,
    size: 8,
    font: fonts.bold,
    color: KN_MID,
  });

  const lines: [string, string][] = [
    ["U Used", `${totalUsed} / ${rack.uHeight} U  (${rack.uHeight - totalUsed} free)`],
    ["Power", `${totalW} W`],
    ["Weight", `${totalLb} lb`],
    ["Material", usd(totalCost)],
  ];
  let ly = tbY + tbH - 28;
  for (const [k, v] of lines) {
    page.drawText(k, { x: x + 12, y: ly, size: 8, font: fonts.regular, color: KN_INK_300 });
    const vw = fonts.bold.widthOfTextAtSize(v, 8);
    page.drawText(v, { x: x + w - 12 - vw, y: ly, size: 8, font: fonts.bold, color: KN_INK });
    ly -= 14;
  }
}

function drawCols(
  page: PDFPage,
  fonts: BrandFonts,
  x0: number,
  y: number,
  cols: string[],
  widths: number[],
) {
  let cx = x0;
  cols.forEach((c, i) => {
    page.drawText(c, {
      x: cx,
      y,
      size: 7,
      font: fonts.regular,
      color: KN_INK,
    });
    cx += widths[i];
  });
}

function truncate(s: string, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function usd(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
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
