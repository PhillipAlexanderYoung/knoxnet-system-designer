import { getCachedDoc } from "../pdfjs";
import type { Sheet } from "../../store/projectStore";
import type { PdfSheetSource } from "../sheetSource";
import { PDFDocument } from "pdf-lib";

const uid = () => Math.random().toString(36).slice(2, 10);

function deriveName(filename: string): string {
  const stripped = filename.replace(/\.pdf$/i, "");
  const parts = stripped.split(/[\\/]/);
  return parts[parts.length - 1];
}

function derivePageName(filename: string, pageNumber: number, pageCount: number): string {
  const name = deriveName(filename);
  if (pageCount <= 1) return name;
  const pageLabel = String(pageNumber).padStart(String(pageCount).length, "0");
  return `${name} - Page ${pageLabel}`;
}

/**
 * Build a Sheet from raw PDF bytes. Parses page 1 to get intrinsic
 * dimensions; the parsed PDFDocumentProxy is also cached for downstream
 * consumers (thumbnail, background, re-render) — no re-parsing.
 *
 * v2.0: writes both `sheet.source` (canonical) and `sheet.pdfBytes`
 * (legacy alias) so anything still on the old code path keeps working.
 */
export async function ingestPdfBytes(
  bytes: Uint8Array,
  filename: string,
  pageNumber = 1,
  pageCount = 1,
): Promise<Sheet> {
  const doc = await getCachedDoc(bytes);
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const objectUrl = URL.createObjectURL(blob);
  const name = derivePageName(filename, pageNumber, pageCount);
  const source: PdfSheetSource = { kind: "pdf", bytes };
  return {
    id: uid(),
    name,
    fileName: filename,
    objectUrl,
    pdfBytes: bytes,
    source,
    pageWidth: viewport.width,
    pageHeight: viewport.height,
    renderScale: 2,
    markups: [],
    sheetTitle: name,
  };
}

/**
 * Build Sheets from a PDF. Multi-page PDFs are split into one-page sheet PDFs
 * so each imported page is selectable, editable, saved, and exported like the
 * rest of the app's sheet model.
 */
export async function ingestPdfBytesAsSheets(
  bytes: Uint8Array,
  filename: string,
): Promise<Sheet[]> {
  const doc = await getCachedDoc(bytes);
  const pageCount = doc.numPages;
  if (pageCount <= 1) return [await ingestPdfBytes(bytes, filename)];

  let src: PDFDocument;
  try {
    src = await PDFDocument.load(bytes);
  } catch (e) {
    console.error(`[ingest/pdf] pdf-lib failed to load "${filename}", falling back to single-sheet:`, e);
    return [await ingestPdfBytes(bytes, filename)];
  }
  const sheets: Sheet[] = [];
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
    const singlePagePdf = await PDFDocument.create();
    const [copiedPage] = await singlePagePdf.copyPages(src, [pageIndex]);
    singlePagePdf.addPage(copiedPage);
    const pageBytes = await singlePagePdf.save();
    sheets.push(
      await ingestPdfBytes(
        pageBytes,
        filename,
        pageIndex + 1,
        pageCount,
      ),
    );
  }
  return sheets;
}

export async function ingestPdfFile(file: File): Promise<Sheet[]> {
  const buf = new Uint8Array(await file.arrayBuffer());
  return ingestPdfBytesAsSheets(buf, file.name);
}

export async function ingestPdfFromUrl(url: string): Promise<Sheet[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const filename = decodeURIComponent(url.split("/").pop() ?? "sheet.pdf");
  return ingestPdfBytesAsSheets(buf, filename);
}
