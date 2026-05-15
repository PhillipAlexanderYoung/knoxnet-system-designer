import type { Sheet } from "../../store/projectStore";
import type {
  DxfBlock,
  DxfEntity,
  DxfParsedDoc,
  DxfPoint,
  DxfSheetSource,
} from "../sheetSource";

const uid = () => Math.random().toString(36).slice(2, 10);

function deriveName(filename: string): string {
  const stripped = filename.replace(/\.dxf$/i, "");
  const parts = stripped.split(/[\\/]/);
  return parts[parts.length - 1];
}

// ───────── INSUNITS table (AutoCAD $INSUNITS) ─────────
// Source: AutoCAD DXF spec — values that don't map to a length unit are
// reported as "unitless" so the user can decide via calibration.
const INSUNITS_TO_KEY: Record<number, DxfSheetSource["units"]> = {
  0: "unitless",
  1: "in",
  2: "ft",
  4: "mm",
  5: "cm",
  6: "m",
};

interface RawDxfHeader {
  $INSUNITS?: number;
}

interface RawDxfBlock {
  name?: string;
  basePoint?: DxfPoint | { x: number; y: number; z?: number };
  entities?: DxfEntity[];
}

interface RawDxf {
  header?: RawDxfHeader;
  entities?: DxfEntity[];
  blocks?: Record<string, RawDxfBlock>;
}

/**
 * Walk an entity list and accumulate a bounding box. Used to compute
 * page dimensions for the editor without forcing the user to calibrate
 * before they can see the drawing.
 *
 * NOTE: This is a fast approximation — we treat each entity's "anchor"
 * points (centers, vertices, text origin) as bounding-box candidates and
 * add a small fudge factor for circles/arcs so the page sizes the way
 * a user expects. A perfect bound would require expanding ellipses,
 * arcs, and INSERT block contents recursively.
 */
function expandBounds(
  acc: { minX: number; minY: number; maxX: number; maxY: number },
  p: DxfPoint | undefined,
  pad: number = 0,
) {
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
  acc.minX = Math.min(acc.minX, p.x - pad);
  acc.minY = Math.min(acc.minY, p.y - pad);
  acc.maxX = Math.max(acc.maxX, p.x + pad);
  acc.maxY = Math.max(acc.maxY, p.y + pad);
}

function computeBounds(entities: DxfEntity[]): {
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  skipped: Map<string, number>;
} {
  const acc = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };
  const skipped = new Map<string, number>();
  for (const e of entities) {
    switch (e.type) {
      case "LINE": {
        const v = (e as { vertices?: DxfPoint[] }).vertices ?? [];
        for (const p of v) expandBounds(acc, p);
        break;
      }
      case "CIRCLE":
      case "ARC": {
        const c = (e as { center?: DxfPoint; radius?: number }).center;
        const r = (e as { radius?: number }).radius ?? 0;
        expandBounds(acc, c, r);
        break;
      }
      case "ELLIPSE": {
        const c = (e as { center?: DxfPoint }).center;
        const m = (e as { majorAxisEndPoint?: DxfPoint }).majorAxisEndPoint;
        if (c && m) {
          const r = Math.hypot(m.x, m.y);
          expandBounds(acc, c, r);
        }
        break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        const v = (e as { vertices?: DxfPoint[] }).vertices ?? [];
        for (const p of v) expandBounds(acc, p);
        break;
      }
      case "TEXT":
      case "MTEXT": {
        const p =
          (e as { startPoint?: DxfPoint; position?: DxfPoint }).startPoint ??
          (e as { position?: DxfPoint }).position;
        const h = (e as { textHeight?: number }).textHeight ?? 1;
        expandBounds(acc, p, h * 4);
        break;
      }
      case "INSERT": {
        const p = (e as { position?: DxfPoint }).position;
        expandBounds(acc, p, 1);
        break;
      }
      case "POINT": {
        const p = (e as { position?: DxfPoint }).position;
        expandBounds(acc, p);
        break;
      }
      default: {
        skipped.set(e.type, (skipped.get(e.type) ?? 0) + 1);
        break;
      }
    }
  }
  // Empty drawing — fall back to a unit square so the editor doesn't
  // crash on width-0 / height-0 sheets.
  if (
    !Number.isFinite(acc.minX) ||
    !Number.isFinite(acc.maxX) ||
    acc.maxX - acc.minX < 1e-6
  ) {
    acc.minX = 0;
    acc.maxX = 100;
  }
  if (
    !Number.isFinite(acc.minY) ||
    !Number.isFinite(acc.maxY) ||
    acc.maxY - acc.minY < 1e-6
  ) {
    acc.minY = 0;
    acc.maxY = 100;
  }
  return { bounds: acc, skipped };
}

/**
 * Parse a DXF text blob into our normalised structure. dxf-parser does
 * the heavy lifting; we just sniff units, compute bounds, and surface
 * a skipped-entity report.
 *
 * dxf-parser is loaded dynamically to avoid pulling its parser into the
 * bundle when nobody imports a DXF — keeps the initial JS payload small
 * for PDF-only users.
 */
export async function parseDxfText(text: string): Promise<{
  doc: DxfParsedDoc;
  units: DxfSheetSource["units"];
}> {
  const mod = await import("dxf-parser");
  const ParserCtor = (mod.default ??
    (mod as unknown as { Parser: new () => { parseSync: (s: string) => RawDxf } })
      .Parser) as new () => { parseSync: (s: string) => RawDxf };
  const parser = new ParserCtor();
  const raw = parser.parseSync(text);

  const entities = raw.entities ?? [];
  const blocksIn = raw.blocks ?? {};
  const blocks: Record<string, DxfBlock> = {};
  for (const name of Object.keys(blocksIn)) {
    const b = blocksIn[name];
    blocks[name] = {
      name: b.name ?? name,
      basePoint: b.basePoint as DxfPoint | undefined,
      entities: (b.entities ?? []) as DxfEntity[],
    };
  }

  const { bounds, skipped } = computeBounds(entities);
  const skippedEntityCount = Array.from(skipped.values()).reduce(
    (s, n) => s + n,
    0,
  );
  const skippedEntityTypes = Array.from(skipped.keys()).sort();

  const insunits = raw.header?.$INSUNITS;
  const units: DxfSheetSource["units"] =
    insunits !== undefined ? INSUNITS_TO_KEY[insunits] ?? "unitless" : undefined;

  const doc: DxfParsedDoc = {
    entities,
    blocks,
    bounds,
    skippedEntityCount,
    skippedEntityTypes,
  };
  return { doc, units };
}

/**
 * Build a Sheet from raw DXF bytes. The parse result is stored on the
 * Sheet's `source` so the editor's background renderer can iterate
 * entities cheaply on every paint. PageWidth / pageHeight are set from
 * the drawing bounds so the canvas fits the content at first paint.
 */
export async function ingestDxfBytes(
  bytes: Uint8Array,
  filename: string,
): Promise<Sheet> {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  const { doc, units } = await parseDxfText(text);
  const name = deriveName(filename);
  const source: DxfSheetSource = {
    kind: "dxf",
    bytes,
    units,
    parsed: doc,
  };
  const pageWidth = Math.max(1, doc.bounds.maxX - doc.bounds.minX);
  const pageHeight = Math.max(1, doc.bounds.maxY - doc.bounds.minY);
  return {
    id: uid(),
    name,
    fileName: filename,
    source,
    pageWidth,
    pageHeight,
    renderScale: 1,
    markups: [],
    sheetTitle: name,
  };
}

export async function ingestDxfFile(file: File): Promise<Sheet[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return [await ingestDxfBytes(bytes, file.name)];
}
