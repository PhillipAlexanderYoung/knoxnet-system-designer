// Centralized PDF.js setup + a session-wide document cache so every sheet's
// PDF is parsed exactly once (vs. once per consumer: thumbnail, background,
// re-render on zoom). Massive perf win on big architectural sheets.

import * as pdfjsLib from "pdfjs-dist";
// @ts-expect-error - Vite ?worker query suffix returns a Worker constructor
import PdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?worker";

pdfjsLib.GlobalWorkerOptions.workerPort = new PdfWorker();

export { pdfjsLib };

// ───────── Document cache (LRU) ─────────
// Why LRU not WeakMap: a WeakMap holds onto the PDFDocumentProxy as long as
// the sheet's pdfBytes are reachable, which is forever in a session. With
// 5–20 large architectural sheets that's hundreds of MB of memory pinned.
// LRU keeps a bounded hot set (active + recently switched) and explicitly
// destroys evicted documents to free worker memory.

const docMap = new Map<Uint8Array, Promise<pdfjsLib.PDFDocumentProxy>>();
let DOC_CACHE_LIMIT = 3;

export function setDocCacheLimit(n: number) {
  DOC_CACHE_LIMIT = Math.max(1, n);
  evictIfNeeded();
}

function evictIfNeeded() {
  while (docMap.size > DOC_CACHE_LIMIT) {
    const oldest = docMap.keys().next().value as Uint8Array | undefined;
    if (!oldest) break;
    const p = docMap.get(oldest);
    docMap.delete(oldest);
    p?.then((doc) => {
      try {
        doc.cleanup();
        doc.destroy();
      } catch {
        /* ignore */
      }
    }).catch(() => {});
  }
}

export function getCachedDoc(bytes: Uint8Array): Promise<pdfjsLib.PDFDocumentProxy> {
  let p = docMap.get(bytes);
  if (p) {
    // Bump to most-recent by re-inserting
    docMap.delete(bytes);
    docMap.set(bytes, p);
    return p;
  }
  // PDF.js 4.x may transfer the underlying ArrayBuffer to the worker,
  // detaching it on the main thread. Always pass a fresh copy so the
  // caller's bytes stay usable for IndexedDB persistence and pdf-lib export.
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  p = pdfjsLib.getDocument({ data: copy }).promise;
  docMap.set(bytes, p);
  evictIfNeeded();
  return p;
}

/** Force-evict every cached document. Call when leaving a project. */
export function clearDocCache() {
  for (const [, p] of docMap) {
    p.then((doc) => {
      try {
        doc.cleanup();
        doc.destroy();
      } catch {
        /* ignore */
      }
    }).catch(() => {});
  }
  docMap.clear();
}

export async function loadPdfFromBytes(bytes: Uint8Array) {
  return getCachedDoc(bytes);
}

export async function loadPdfFromUrl(url: string) {
  const task = pdfjsLib.getDocument({ url });
  return task.promise;
}

// Browser canvas area limits vary; Safari is the strictest at ~16M pixels.
// We cap conservatively to stay within all major browsers and keep memory
// footprint reasonable on big sheets.
const MAX_CANVAS_AREA = 14_000_000;

/**
 * Render a PDF page to an offscreen canvas at the requested device-pixel
 * scale. If the requested scale would exceed the canvas-area cap, we
 * automatically reduce it and report the actual scale used.
 */
export async function renderPageToCanvas(
  page: pdfjsLib.PDFPageProxy,
  scale: number,
): Promise<{ canvas: HTMLCanvasElement; scaleUsed: number }> {
  const baseViewport = page.getViewport({ scale: 1 });
  const requestedArea = baseViewport.width * baseViewport.height * scale * scale;
  let scaleUsed = scale;
  if (requestedArea > MAX_CANVAS_AREA) {
    scaleUsed = Math.sqrt(MAX_CANVAS_AREA / (baseViewport.width * baseViewport.height));
  }
  const viewport = page.getViewport({ scale: scaleUsed });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  // Use default (alpha-enabled) context. PDF.js compositing can produce
  // unexpected results on opaque-only canvases on some PDFs.
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d not available");
  // Pre-fill white so even if the render fails for a region, the user sees
  // a "page" rather than transparent gaps.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({
    canvasContext: ctx,
    viewport,
    background: "#ffffff",
  }).promise;
  return { canvas, scaleUsed };
}

export async function getFirstPage(bytes: Uint8Array) {
  const doc = await getCachedDoc(bytes);
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  return { doc, page, viewport };
}
