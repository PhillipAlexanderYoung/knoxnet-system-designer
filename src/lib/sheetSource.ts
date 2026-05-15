/**
 * Sheet source — a discriminated union describing where a sheet's
 * background drawing comes from. KnoxNet started as a PDF-only tool;
 * v2.0 introduces multi-format support (DXF, SVG, raster) without
 * changing the rest of the data model. Everything downstream of a Sheet
 * (markups, calibration, masks, exports, reports) is source-agnostic —
 * only the `Editor` background layer and the ingest pipeline branch on
 * `source.kind`.
 *
 * Units convention — every source records the dimensions in the same
 * coordinate space the editor + markups use:
 *   pdf      → PDF user units (1pt = 1/72 in)
 *   dxf      → DXF user units (driven by $INSUNITS, normalised here)
 *   svg      → SVG viewBox units
 *   raster   → image pixels
 * The calibration tool maps any of these to real-world feet so the
 * cable-length / coverage math works identically across kinds.
 *
 * IFC is intentionally deferred — the type slot exists so future
 * additions don't require another version bump, but no ingest path
 * implements it yet.
 */

export type SheetSourceKind = "pdf" | "dxf" | "svg" | "raster" | "ifc";

/** Single PDF page (multi-page PDFs are exploded one-Sheet-per-page at
 *  ingest time). `bytes` is the raw PDF byte stream and is used for
 *  pdf.js rendering and for re-embedding the original page into the
 *  branded markup PDF export. */
export interface PdfSheetSource {
  kind: "pdf";
  bytes: Uint8Array;
}

/** Parsed DXF entities, normalised to the editor's coordinate space.
 *  Keeping the parsed result inside the source means we parse once at
 *  ingest and re-render cheaply on every zoom/pan. */
export interface DxfSheetSource {
  kind: "dxf";
  bytes: Uint8Array;
  /** Drawing units sniffed from `$INSUNITS` (1=in, 4=mm, 5=cm, 6=m, ...) */
  units?: "in" | "ft" | "mm" | "cm" | "m" | "unitless";
  parsed: DxfParsedDoc;
}

/** Plain SVG markup. The browser parses + renders it natively via an
 *  `<img>` element backed by a Blob URL, so we only need the source
 *  text and the viewBox to size the canvas. */
export interface SvgSheetSource {
  kind: "svg";
  text: string;
  /** Top-left of the SVG content in viewBox units (usually 0,0). */
  viewBoxX: number;
  viewBoxY: number;
  viewBoxW: number;
  viewBoxH: number;
}

/** PNG/JPG/WebP/TIFF — anything an HTMLImageElement can decode. The
 *  natural pixel dimensions become pageWidth/pageHeight; calibration is
 *  required for any real-world measurement. */
export interface RasterSheetSource {
  kind: "raster";
  bytes: Uint8Array;
  mime: string;
  naturalW: number;
  naturalH: number;
}

/** Placeholder for IFC ingest (deferred). When implemented, this will
 *  carry a 2D snapshot of the chosen storey rendered to vector or
 *  raster. */
export interface IfcSheetSource {
  kind: "ifc";
  bytes: Uint8Array;
  storey?: string;
}

export type SheetSource =
  | PdfSheetSource
  | DxfSheetSource
  | SvgSheetSource
  | RasterSheetSource
  | IfcSheetSource;

// ───────── DXF parsed-document shape ─────────
//
// We re-export a lean subset of `dxf-parser`'s schema as a structural
// type so the rest of the codebase doesn't depend on the third-party
// library's types. Anything not represented here is intentionally
// ignored at render time.

export interface DxfPoint {
  x: number;
  y: number;
  z?: number;
}

export interface DxfBaseEntity {
  type: string;
  layer?: string;
  colorIndex?: number;
  color?: number;
}

export interface DxfLine extends DxfBaseEntity {
  type: "LINE";
  vertices: DxfPoint[];
}

export interface DxfCircle extends DxfBaseEntity {
  type: "CIRCLE";
  center: DxfPoint;
  radius: number;
}

export interface DxfArc extends DxfBaseEntity {
  type: "ARC";
  center: DxfPoint;
  radius: number;
  startAngle: number; // radians
  endAngle: number;
}

export interface DxfEllipse extends DxfBaseEntity {
  type: "ELLIPSE";
  center: DxfPoint;
  majorAxisEndPoint: DxfPoint;
  axisRatio: number;
  startAngle?: number;
  endAngle?: number;
}

export interface DxfPolyline extends DxfBaseEntity {
  type: "LWPOLYLINE" | "POLYLINE";
  vertices: DxfPoint[];
  shape?: boolean;
}

export interface DxfText extends DxfBaseEntity {
  type: "TEXT" | "MTEXT";
  startPoint?: DxfPoint;
  position?: DxfPoint;
  text: string;
  textHeight?: number;
  rotation?: number;
}

export interface DxfInsert extends DxfBaseEntity {
  type: "INSERT";
  name: string;
  position: DxfPoint;
  xScale?: number;
  yScale?: number;
  rotation?: number;
}

export type DxfEntity =
  | DxfLine
  | DxfCircle
  | DxfArc
  | DxfEllipse
  | DxfPolyline
  | DxfText
  | DxfInsert
  | DxfBaseEntity;

export interface DxfBlock {
  name: string;
  basePoint?: DxfPoint;
  entities: DxfEntity[];
}

export interface DxfParsedDoc {
  entities: DxfEntity[];
  blocks: Record<string, DxfBlock>;
  /** Inclusive bounding box across all renderable entities, in DXF
   *  units, top-left origin already applied (y flipped) so the result
   *  matches the editor's coordinate convention. */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Count of entities the renderer skipped because their type isn't
   *  supported yet (3DSOLID, SPLINE, REGION, ...). Surfaced as a toast
   *  so the user knows their drawing was partially imported. */
  skippedEntityCount: number;
  /** Sorted list of unsupported entity types (deduped) for the toast. */
  skippedEntityTypes: string[];
}

// ───────── Serialisation (for .knoxnet + IndexedDB) ─────────
//
// We persist binary sources as base64 in the .knoxnet JSON, and as raw
// Uint8Array in IndexedDB. Non-binary kinds (SVG) persist their text
// directly. Parsed DXF documents are *not* serialised — they're re-parsed
// at load time from `bytes`. This keeps the on-disk format compact and
// version-tolerant; bumping the DXF renderer won't invalidate saved
// projects.

export type SerializedSheetSource =
  | {
      kind: "pdf";
      bytesB64: string;
    }
  | {
      kind: "dxf";
      bytesB64: string;
      units?: DxfSheetSource["units"];
    }
  | {
      kind: "svg";
      text: string;
      viewBoxX: number;
      viewBoxY: number;
      viewBoxW: number;
      viewBoxH: number;
    }
  | {
      kind: "raster";
      bytesB64: string;
      mime: string;
      naturalW: number;
      naturalH: number;
    }
  | {
      kind: "ifc";
      bytesB64: string;
      storey?: string;
    };

// ───────── Helpers ─────────

const CHUNK = 8192;

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Best-effort kind detection from a filename or MIME type. Used by
 *  the ingest dispatcher and the file-picker accept lists. */
export function detectSourceKind(
  filename: string,
  mime?: string,
): SheetSourceKind | null {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const m = (mime ?? "").toLowerCase();
  if (ext === "pdf" || m === "application/pdf") return "pdf";
  if (ext === "dxf" || m === "image/vnd.dxf" || m === "application/dxf")
    return "dxf";
  if (ext === "svg" || m === "image/svg+xml") return "svg";
  if (
    ext === "png" ||
    ext === "jpg" ||
    ext === "jpeg" ||
    ext === "webp" ||
    ext === "tif" ||
    ext === "tiff" ||
    ext === "bmp" ||
    m.startsWith("image/")
  )
    return "raster";
  if (ext === "ifc" || m === "application/ifc" || m === "model/ifc")
    return "ifc";
  return null;
}

/** Bytes-or-null helper: extracts the raw byte buffer from any source
 *  that carries one (everything except SVG today). Used by IndexedDB
 *  persistence and the .knoxnet serialiser. */
export function getSourceBytes(source: SheetSource): Uint8Array | null {
  switch (source.kind) {
    case "pdf":
    case "dxf":
    case "raster":
    case "ifc":
      return source.bytes;
    case "svg":
      return null;
  }
}

/** Convenience: legacy-compat read of PDF bytes off a sheet-like object
 *  that may carry either the new `source` field or the old top-level
 *  `pdfBytes`. Anything that needs to reach into PDF-specific machinery
 *  (markup PDF export, pdf.js render) should go through this. */
export function getPdfBytes(sheet: {
  source?: SheetSource;
  pdfBytes?: Uint8Array;
}): Uint8Array | undefined {
  if (sheet.source && sheet.source.kind === "pdf") return sheet.source.bytes;
  return sheet.pdfBytes;
}

/** Human-friendly label for a source kind. Used by the file-picker
 *  copy and the empty-state hint. */
export const SOURCE_KIND_LABEL: Record<SheetSourceKind, string> = {
  pdf: "PDF",
  dxf: "DXF",
  svg: "SVG",
  raster: "Image",
  ifc: "IFC",
};

/** File-picker accept list — covers every kind we currently ingest.
 *  Kept here so StartScreen + LeftRail can't drift apart. */
export const SUPPORTED_ACCEPT =
  ".pdf,.dxf,.svg,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp,application/pdf,image/svg+xml,image/png,image/jpeg,image/webp,image/tiff,image/bmp";

/** Human-readable hint shown beneath the file pickers so the user
 *  understands what we accept and the DWG workaround. */
export const SUPPORTED_HINT =
  "PDF · DXF · SVG · PNG · JPG · WebP · TIFF. Have a DWG? Export it to DXF first with the free ODA File Converter.";
