/**
 * Multi-format ingest dispatcher. Picks the right per-kind ingester
 * based on filename / MIME, falls back to a friendly error when nothing
 * matches so the user knows what's actually supported.
 */

import type { Sheet } from "../../store/projectStore";
import { detectSourceKind, SOURCE_KIND_LABEL } from "../sheetSource";
import { ingestPdfFile, ingestPdfBytesAsSheets, ingestPdfFromUrl } from "./pdfIngest";
import { ingestDxfFile } from "./dxfIngest";
import { ingestSvgFile } from "./svgIngest";
import { ingestRasterFile } from "./rasterIngest";

export { ingestPdfBytes, ingestPdfBytesAsSheets, ingestPdfFile, ingestPdfFromUrl } from "./pdfIngest";
export { ingestDxfBytes, ingestDxfFile, parseDxfText } from "./dxfIngest";
export { ingestSvgText, ingestSvgFile } from "./svgIngest";
export { ingestRasterBytes, ingestRasterFile } from "./rasterIngest";

/**
 * Top-level dispatcher used by every UI surface that ingests files. Any
 * supported format → an array of Sheets ready to be added to the
 * project. Unsupported formats throw with the supported-list in the
 * message so the toast surfaces the correct guidance.
 *
 * Note: DWG is intentionally unsupported — there is no OSS browser
 * parser. The error message points the user at the free ODA File
 * Converter so they can produce a DXF instead.
 */
export async function ingestFile(file: File): Promise<Sheet[]> {
  const kind = detectSourceKind(file.name, file.type);
  if (kind === "pdf") return ingestPdfFile(file);
  if (kind === "dxf") return ingestDxfFile(file);
  if (kind === "svg") return ingestSvgFile(file);
  if (kind === "raster") return ingestRasterFile(file);
  if (kind === "ifc") {
    throw new Error(
      "IFC import isn't wired up yet. Try DXF or SVG export from your BIM tool.",
    );
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".dwg")) {
    throw new Error(
      "DWG isn't supported directly (no open-source browser parser exists). " +
        "Convert it to DXF first with the free ODA File Converter, then drop the DXF here.",
    );
  }
  if (lower.endsWith(".rvt")) {
    throw new Error(
      "Revit (.rvt) isn't supported. Export the storey to IFC, DXF, or PDF from Revit first.",
    );
  }
  throw new Error(
    `Unsupported file type. KnoxNet imports: ${Object.values(SOURCE_KIND_LABEL).join(", ")}.`,
  );
}
