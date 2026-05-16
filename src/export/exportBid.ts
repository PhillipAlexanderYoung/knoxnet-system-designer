import * as XLSX from "xlsx";
import { PDFDocument } from "pdf-lib";
import {
  defaultBidExportVisibility,
  type BidExportVisibility,
  type Project,
} from "../store/projectStore";
import { computeBid, usd } from "../lib/bid";
import { loadBrandFonts, hex, safeText } from "./titleBlockRenderer";
import { resolveBranding } from "../lib/branding";
import { categoryLabel } from "../brand/tokens";

export type BidAudience = "customer" | "internal";

export interface BidExportOptions {
  audience?: BidAudience;
}

/** Resolve visibility — internal audience always sees everything. */
function visFor(p: Project, audience: BidAudience): BidExportVisibility {
  if (audience === "internal") {
    return { material: true, labor: true, overhead: true, tax: true, margin: true };
  }
  return p.bidExportVisibility ?? defaultBidExportVisibility;
}

// ───────── XLSX ─────────

export async function exportBidXlsx(
  project: Project,
  opts: BidExportOptions = {},
) {
  const audience: BidAudience = opts.audience ?? "internal";
  const v = visFor(project, audience);
  const bid = computeBid(project);
  const branding = resolveBranding(project.branding);
  const wb = XLSX.utils.book_new();

  // Summary sheet — rollup lines respect the audience visibility flags
  const summaryHeader: any[][] = [
    [branding.fullName.toUpperCase()],
    [audience === "customer" ? "Project Estimate" : "Project Bid Summary"],
    [],
    ["Project", project.meta.projectName],
    ["Project Number", project.meta.projectNumber],
    ["Client", project.meta.client],
    ["Location", project.meta.location],
    ["Drawn By", project.meta.drawnBy],
    ["Date", new Date(project.meta.date).toLocaleDateString()],
    ["Revision", project.meta.revision],
    [],
    [audience === "customer" ? "ESTIMATE" : "TOTALS"],
  ];
  const rollup: any[][] = [];
  if (v.material)
    rollup.push([
      audience === "customer" ? "Equipment & Materials" : "Material Cost",
      bid.totals.materialCost,
    ]);
  if (v.labor) {
    rollup.push(["Labor Hours", bid.totals.laborHours]);
    rollup.push([
      audience === "customer"
        ? "Installation Labor"
        : `Labor Cost @ $${project.bidDefaults.laborRate}/hr`,
      bid.totals.laborCost,
    ]);
  }
  if (v.overhead)
    rollup.push([`Overhead (${project.bidDefaults.overheadPercent}%)`, bid.totals.overhead]);
  if (v.tax)
    rollup.push([`Tax (${project.bidDefaults.taxRate}%)`, bid.totals.tax]);
  if (v.margin)
    rollup.push([`Margin (${project.bidDefaults.marginPercent}%)`, bid.totals.margin]);
  rollup.push(["GRAND TOTAL", bid.totals.grandTotal]);
  const summary = [...summaryHeader, ...rollup];
  const wsSummary = XLSX.utils.aoa_to_sheet(summary);
  wsSummary["!cols"] = [{ wch: 36 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

  // Devices sheet — customer view hides unit/labor columns
  const isCustomer = audience === "customer";
  const devHeader = isCustomer
    ? ["Category", "Device", "Qty", "Per-Sheet Counts"]
    : [
        "Category",
        "Device",
        "Tag",
        "Qty",
        "Unit Cost",
        "Ext Cost",
        "Unit Labor (hr)",
        "Ext Labor (hr)",
        "Labor Override?",
        "Calculated Labor (hr)",
        "Per-Sheet Counts",
      ];
  const devRows = bid.devices.map((d) =>
    isCustomer
      ? [
          categoryLabel[d.category] ?? d.category,
          d.label,
          d.qty,
          d.perSheetCounts.map((p) => `${p.sheetName}: ${p.qty}`).join("; "),
        ]
      : [
          categoryLabel[d.category] ?? d.category,
          d.label,
          d.shortCode,
          d.qty,
          d.unitCost,
          d.extCost,
          d.unitLabor,
          d.extLabor,
          d.laborOverridden ? "yes" : "",
          d.calculatedLabor,
          d.perSheetCounts.map((p) => `${p.sheetName}: ${p.qty}`).join("; "),
        ],
  );
  const wsDev = XLSX.utils.aoa_to_sheet([devHeader, ...devRows]);
  wsDev["!cols"] = [
    { wch: 16 },
    { wch: 28 },
    { wch: 8 },
    { wch: 6 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 20 },
    { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(wb, wsDev, "Devices");

  // Rack devices sheet
  const rackHeader = isCustomer
    ? ["Manufacturer", "Device", "Model", "U Height", "Qty", "Per-Rack Counts"]
    : [
        "Manufacturer",
        "Device",
        "Model",
        "U Height",
        "Qty",
        "Unit Cost",
        "Ext Cost",
        "Labor (hr)",
        "Labor Override?",
        "Calculated Labor (hr)",
        "Per-Rack Counts",
      ];
  const rackRows = bid.rackDevices.map((d) =>
    isCustomer
      ? [
          d.manufacturer,
          d.label,
          d.model,
          d.uHeight,
          d.qty,
          d.perRackCounts.map((p) => `${p.rackName}: ${p.qty}`).join("; "),
        ]
      : [
          d.manufacturer,
          d.label,
          d.model,
          d.uHeight,
          d.qty,
          d.unitCost,
          d.extCost,
          d.extLabor,
          d.laborOverridden ? "yes" : "",
          d.calculatedLabor,
          d.perRackCounts.map((p) => `${p.rackName}: ${p.qty}`).join("; "),
        ],
  );
  const wsRack = XLSX.utils.aoa_to_sheet([rackHeader, ...rackRows]);
  wsRack["!cols"] = [
    { wch: 16 },
    { wch: 32 },
    { wch: 18 },
    { wch: 8 },
    { wch: 6 },
    { wch: 12 },
    { wch: 12 },
    { wch: 10 },
    { wch: 16 },
    { wch: 20 },
    { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, wsRack, "Rack Devices");

  // Cables sheet — customer view also strips $/ft and labor columns
  const cableHeader = isCustomer
    ? ["Cable Type", "Total Feet", "Per-Sheet Footage"]
    : [
        "Cable Type",
        "Code",
        "Raw Feet",
        "Total Feet (post-slack)",
        "$/ft",
        "Ext Cost",
        "hr/ft",
        "Ext Labor",
        "Labor Override?",
        "Calculated Labor",
        "Per-Sheet Footage",
      ];
  const cableRows = bid.cables.map((c) =>
    isCustomer
      ? [
          c.label,
          +c.totalFeet.toFixed(0),
          c.perSheetFeet.map((p) => `${p.sheetName}: ${p.ft.toFixed(0)}'`).join("; "),
        ]
      : [
          c.label,
          c.shortCode,
          +c.rawFeet.toFixed(1),
          +c.totalFeet.toFixed(1),
          c.costPerFoot,
          c.extCost,
          c.laborPerFoot,
          c.extLabor,
          c.laborOverridden ? "yes" : "",
          c.calculatedLabor,
          c.perSheetFeet
            .map((p) => `${p.sheetName}: ${p.ft.toFixed(0)}'`)
            .join("; "),
        ],
  );
  const wsCab = XLSX.utils.aoa_to_sheet([cableHeader, ...cableRows]);
  wsCab["!cols"] = [
    { wch: 28 },
    { wch: 8 },
    { wch: 10 },
    { wch: 16 },
    { wch: 8 },
    { wch: 12 },
    { wch: 8 },
    { wch: 12 },
    { wch: 16 },
    { wch: 18 },
    { wch: 60 },
  ];
  XLSX.utils.book_append_sheet(wb, wsCab, "Cables");

  // Sheet inventory
  const sheetHeader = ["Sheet #", "Title", "File", "Calibrated?", "Markups"];
  const sheetRows = project.sheets.map((s) => [
    s.sheetNumber ?? "",
    s.sheetTitle ?? s.name,
    s.fileName,
    s.calibration ? "yes" : "no",
    s.markups.length,
  ]);
  const wsSheets = XLSX.utils.aoa_to_sheet([sheetHeader, ...sheetRows]);
  wsSheets["!cols"] = [{ wch: 10 }, { wch: 36 }, { wch: 48 }, { wch: 12 }, { wch: 8 }];
  XLSX.utils.book_append_sheet(wb, wsSheets, "Sheets");

  // Warnings — internal only
  if (!isCustomer && bid.warnings.length > 0) {
    const wsWarn = XLSX.utils.aoa_to_sheet([
      ["Warnings"],
      ...bid.warnings.map((w) => [w]),
    ]);
    wsWarn["!cols"] = [{ wch: 100 }];
    XLSX.utils.book_append_sheet(wb, wsWarn, "Warnings");
  }

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const suffix = isCustomer ? "Customer-Estimate" : "Bid";
  const brandSlug =
    branding.fullName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "Brand";
  triggerDownload(
    out,
    `${project.meta.projectName.replace(/\s+/g, "-")}_${brandSlug}-${suffix}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
}

// ───────── Branded Bid PDF ─────────

export async function exportBidPdf(
  project: Project,
  opts: BidExportOptions = {},
) {
  const audience: BidAudience = opts.audience ?? "internal";
  const v = visFor(project, audience);
  const isCustomer = audience === "customer";
  const bid = computeBid(project);
  const out = await PDFDocument.create();
  const fonts = await loadBrandFonts(out);
  const branding = resolveBranding(project.branding);
  const page = out.addPage([612, 792]); // letter portrait
  const { width: pw, height: ph } = page.getSize();
  const KN_MID = hex("#0B1220");
  const ACCENT = hex(branding.accentColor);
  const KN_INK = hex("#F5F7FA");
  const KN_INK_300 = hex("#94A0B8");
  const KN_INK_400 = hex("#5E6B85");
  const KN_INK_700 = hex("#1A2030");

  page.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: KN_MID });
  page.drawRectangle({ x: 0, y: ph - 8, width: pw, height: 8, color: ACCENT });

  // Header — embed the user's logo if present, otherwise the built-in monogram
  let logoImage = undefined;
  if (branding.logoDataUrl) {
    try {
      const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(branding.logoDataUrl);
      if (m) {
        const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
        logoImage =
          m[1].toLowerCase() === "png"
            ? await out.embedPng(bytes)
            : await out.embedJpg(bytes);
      }
    } catch (e) {
      console.error("[bid-pdf] logo embed failed:", e);
    }
  }
  if (logoImage) {
    const dims = logoImage.scaleToFit(40, 40);
    page.drawImage(logoImage, {
      x: 36 + (40 - dims.width) / 2,
      y: ph - 84 + (40 - dims.height) / 2,
      width: dims.width,
      height: dims.height,
    });
  }
  // Wordmark — primary bold + secondary regular accent. Slides left when
  // there's no logo so it doesn't sit in dead space.
  const wmA = safeText(branding.wordmarkPrimary);
  const wmB = safeText(branding.wordmarkSecondary);
  const headerLeft = logoImage ? 86 : 36;
  let wmCursor = headerLeft;
  if (wmA) {
    page.drawText(wmA, { x: wmCursor, y: ph - 60, size: 22, font: fonts.bold, color: KN_INK });
    wmCursor += fonts.bold.widthOfTextAtSize(wmA, 22) + 2;
  }
  if (wmB) {
    page.drawText(wmB, { x: wmCursor, y: ph - 60, size: 22, font: fonts.regular, color: ACCENT });
  }
  page.drawText(isCustomer ? "PROJECT ESTIMATE" : "PROJECT BID", {
    x: headerLeft,
    y: ph - 80,
    size: 8,
    font: fonts.bold,
    color: KN_INK_300,
  });

  page.drawText(isCustomer ? "ESTIMATE" : "BID DOCUMENT", {
    x: pw - 130,
    y: ph - 50,
    size: 8,
    font: fonts.bold,
    color: KN_INK_400,
  });
  const code = safeText(
    `${branding.docCodePrefix}-${project.meta.projectNumber || "NEW"}-R${project.meta.revision || "0"}`,
  );
  page.drawText(code, {
    x: pw - 130,
    y: ph - 64,
    size: 14,
    font: fonts.bold,
    color: ACCENT,
  });
  page.drawText(safeText(new Date(project.meta.date).toLocaleDateString()), {
    x: pw - 130,
    y: ph - 78,
    size: 8,
    font: fonts.regular,
    color: KN_INK_300,
  });

  // Project block
  let y = ph - 120;
  page.drawText("PROJECT", { x: 36, y, size: 7, font: fonts.bold, color: KN_INK_400 });
  y -= 12;
  page.drawText(safeText(project.meta.projectName), { x: 36, y, size: 16, font: fonts.bold, color: KN_INK });
  y -= 16;
  if (project.meta.location) {
    page.drawText(safeText(project.meta.location), { x: 36, y, size: 9, font: fonts.regular, color: KN_INK_300 });
    y -= 12;
  }
  if (project.meta.client) {
    page.drawText(safeText(`Prepared for ${project.meta.client}`), { x: 36, y, size: 9, font: fonts.regular, color: KN_INK_300 });
    y -= 12;
  }

  y -= 20;
  page.drawLine({ start: { x: 36, y }, end: { x: pw - 36, y }, thickness: 0.4, color: hex("#1B2433") });
  y -= 18;

  // Devices summary by category
  page.drawText("DEVICES BY CATEGORY", { x: 36, y, size: 8, font: fonts.bold, color: ACCENT });
  y -= 12;
  const byCat = new Map<string, { qty: number; cost: number; labor: number }>();
  for (const d of bid.devices) {
    const cur = byCat.get(d.category) ?? { qty: 0, cost: 0, labor: 0 };
    cur.qty += d.qty;
    cur.cost += d.extCost;
    cur.labor += d.extLabor;
    byCat.set(d.category, cur);
  }
  for (const [cat, vc] of byCat) {
    page.drawRectangle({ x: 36, y: y - 4, width: pw - 72, height: 14, color: KN_INK_700 });
    page.drawText(safeText(categoryLabel[cat] ?? cat), { x: 42, y: y - 2, size: 9, font: fonts.bold, color: KN_INK });
    page.drawText(`${vc.qty} units`, { x: 240, y: y - 2, size: 9, font: fonts.regular, color: KN_INK_300 });
    if (!isCustomer) {
      page.drawText(safeText(usd(vc.cost)), { x: 360, y: y - 2, size: 9, font: fonts.regular, color: KN_INK });
      page.drawText(`${vc.labor.toFixed(1)} hr`, { x: 460, y: y - 2, size: 9, font: fonts.regular, color: KN_INK });
    }
    y -= 16;
  }

  // Cables
  y -= 12;
  page.drawText("CABLE RUNS", { x: 36, y, size: 8, font: fonts.bold, color: ACCENT });
  y -= 12;
  for (const c of bid.cables) {
    page.drawRectangle({ x: 36, y: y - 4, width: pw - 72, height: 14, color: KN_INK_700 });
    page.drawText(safeText(c.label), { x: 42, y: y - 2, size: 9, font: fonts.bold, color: KN_INK });
    page.drawText(`${c.totalFeet.toFixed(0)}'`, { x: 240, y: y - 2, size: 9, font: fonts.regular, color: KN_INK_300 });
    if (!isCustomer) {
      page.drawText(safeText(usd(c.extCost)), { x: 360, y: y - 2, size: 9, font: fonts.regular, color: KN_INK });
      page.drawText(`${c.extLabor.toFixed(1)} hr`, { x: 460, y: y - 2, size: 9, font: fonts.regular, color: KN_INK });
    }
    y -= 16;
  }

  // Totals
  const tBoxY = 90;
  const tBoxH = 170;
  const tx = 36;
  const tw = pw - 72;
  page.drawRectangle({ x: tx, y: tBoxY, width: tw, height: tBoxH, color: hex("#141C2B"), borderColor: ACCENT, borderWidth: 0.6 });
  page.drawRectangle({ x: tx, y: tBoxY + tBoxH - 20, width: tw, height: 20, color: ACCENT });
  page.drawText("ESTIMATED PROJECT TOTAL", { x: tx + 12, y: tBoxY + tBoxH - 14, size: 10, font: fonts.bold, color: KN_MID });

  const rawLines: [string, string, boolean][] = [
    [
      isCustomer ? "Equipment & Materials" : "Material Cost",
      usd(bid.totals.materialCost),
      v.material,
    ],
    [
      isCustomer
        ? "Installation Labor"
        : `Labor Cost (${bid.totals.laborHours.toFixed(1)} hr × $${project.bidDefaults.laborRate}/hr)`,
      usd(bid.totals.laborCost),
      v.labor,
    ],
    [
      `Overhead (${project.bidDefaults.overheadPercent}%)`,
      usd(bid.totals.overhead),
      v.overhead,
    ],
    [
      `Margin (${project.bidDefaults.marginPercent}%)`,
      usd(bid.totals.margin),
      v.margin,
    ],
    [
      `Tax (${project.bidDefaults.taxRate}% on materials)`,
      usd(bid.totals.tax),
      v.tax,
    ],
  ];
  const lines: [string, string][] = rawLines
    .filter(([, , show]) => show)
    .map(([k, val]) => [safeText(k), safeText(val)] as [string, string]);
  let ly = tBoxY + tBoxH - 38;
  for (const [k, v] of lines) {
    page.drawText(k, { x: tx + 16, y: ly, size: 9, font: fonts.regular, color: KN_INK_300 });
    page.drawText(v, { x: tx + tw - 16 - fonts.bold.widthOfTextAtSize(v, 9), y: ly, size: 9, font: fonts.bold, color: KN_INK });
    ly -= 14;
  }
  page.drawLine({ start: { x: tx + 16, y: ly + 6 }, end: { x: tx + tw - 16, y: ly + 6 }, thickness: 0.5, color: hex("#3A4458") });
  page.drawText("GRAND TOTAL", { x: tx + 16, y: ly - 14, size: 13, font: fonts.bold, color: ACCENT });
  const gt = safeText(usd(bid.totals.grandTotal));
  page.drawText(gt, { x: tx + tw - 16 - fonts.bold.widthOfTextAtSize(gt, 22), y: ly - 18, size: 22, font: fonts.bold, color: KN_INK });

  // Footer
  page.drawText(
    safeText(
      isCustomer
        ? `This estimate is valid for 30 days. ${branding.fullName}.`
        : "INTERNAL DOCUMENT — contains overhead, margin and unit-cost detail. Not for distribution.",
    ),
    {
      x: 36,
      y: 24,
      size: 7,
      font: fonts.regular,
      color: isCustomer ? KN_INK_400 : ACCENT,
    },
  );

  const bytes = await out.save();
  const safeName = safeText(project.meta.projectName).replace(/\s+/g, "-") || "Project";
  const suffix = isCustomer ? "Customer-Estimate" : "Internal-Bid";
  // Use a simple ASCII version of the brand name for the filename so it
  // doesn't carry weird characters into the user's downloads folder.
  const brandSlug = safeText(branding.fullName)
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "Brand";
  triggerDownload(bytes, `${safeName}_${brandSlug}-${suffix}.pdf`, "application/pdf");
}

function triggerDownload(bytes: Uint8Array | ArrayBuffer, name: string, mime: string) {
  const blob = new Blob([new Uint8Array(bytes as ArrayBuffer)], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
