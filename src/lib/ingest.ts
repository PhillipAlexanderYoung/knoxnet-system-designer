import { getCachedDoc } from "./pdfjs";
import type { Sheet } from "../store/projectStore";

const uid = () => Math.random().toString(36).slice(2, 10);

function deriveName(filename: string): string {
  const stripped = filename.replace(/\.pdf$/i, "");
  const parts = stripped.split(/[\\/]/);
  return parts[parts.length - 1];
}

/**
 * Build a Sheet from raw PDF bytes. Parses page 1 to get intrinsic
 * dimensions; the parsed PDFDocumentProxy is also cached for downstream
 * consumers (thumbnail, background, re-render) — no re-parsing.
 */
export async function ingestPdfBytes(
  bytes: Uint8Array,
  filename: string,
): Promise<Sheet> {
  const doc = await getCachedDoc(bytes);
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);
  const name = deriveName(filename);
  return {
    id: uid(),
    name,
    fileName: filename,
    objectUrl,
    pdfBytes: bytes,
    pageWidth: viewport.width,
    pageHeight: viewport.height,
    renderScale: 2,
    markups: [],
    sheetTitle: name,
  };
}

export async function ingestPdfFile(file: File): Promise<Sheet> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return ingestPdfBytes(buf, file.name);
}

export async function ingestPdfFromUrl(url: string): Promise<Sheet> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const filename = decodeURIComponent(url.split("/").pop() ?? "sheet.pdf");
  return ingestPdfBytes(buf, filename);
}
