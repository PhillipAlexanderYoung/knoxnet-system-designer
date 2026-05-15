import type { Sheet } from "../../store/projectStore";
import type { SvgSheetSource } from "../sheetSource";

const uid = () => Math.random().toString(36).slice(2, 10);

function deriveName(filename: string): string {
  const stripped = filename.replace(/\.svg$/i, "");
  const parts = stripped.split(/[\\/]/);
  return parts[parts.length - 1];
}

/**
 * Parse the viewBox / width / height attributes off the root <svg> element
 * so the editor knows the drawing's intrinsic dimensions. Falls back to a
 * sane default if neither is present so we never refuse a sloppy file.
 */
function parseSvgDims(text: string): {
  vbX: number;
  vbY: number;
  vbW: number;
  vbH: number;
} {
  // DOMParser is available in every browser; we don't want jsdom or
  // anything heavier just to read four numbers.
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(text, "image/svg+xml");
  } catch {
    return { vbX: 0, vbY: 0, vbW: 1000, vbH: 1000 };
  }
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== "svg") {
    return { vbX: 0, vbY: 0, vbW: 1000, vbH: 1000 };
  }

  const vb = root.getAttribute("viewBox");
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return { vbX: parts[0], vbY: parts[1], vbW: parts[2], vbH: parts[3] };
    }
  }

  // Fall back to width/height attributes. Strip any "px"/"pt"/etc — we
  // only care about the numeric magnitude; the calibration tool sets
  // real-world scale anyway.
  const w = parseFloat(root.getAttribute("width") ?? "");
  const h = parseFloat(root.getAttribute("height") ?? "");
  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    return { vbX: 0, vbY: 0, vbW: w, vbH: h };
  }
  return { vbX: 0, vbY: 0, vbW: 1000, vbH: 1000 };
}

/**
 * Build a Sheet from SVG text. The browser handles all rendering
 * complexity natively via an <img> element backed by a Blob URL — we
 * only need the viewBox to size the canvas and the source text for
 * re-rendering at any zoom.
 */
export async function ingestSvgText(
  text: string,
  filename: string,
): Promise<Sheet> {
  const { vbX, vbY, vbW, vbH } = parseSvgDims(text);
  const blob = new Blob([text], { type: "image/svg+xml" });
  const objectUrl = URL.createObjectURL(blob);
  const name = deriveName(filename);
  const source: SvgSheetSource = {
    kind: "svg",
    text,
    viewBoxX: vbX,
    viewBoxY: vbY,
    viewBoxW: vbW,
    viewBoxH: vbH,
  };
  return {
    id: uid(),
    name,
    fileName: filename,
    objectUrl,
    source,
    pageWidth: vbW,
    pageHeight: vbH,
    renderScale: 1,
    markups: [],
    sheetTitle: name,
  };
}

export async function ingestSvgFile(file: File): Promise<Sheet[]> {
  const text = await file.text();
  return [await ingestSvgText(text, file.name)];
}
