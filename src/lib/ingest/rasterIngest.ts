import type { Sheet } from "../../store/projectStore";
import type { RasterSheetSource } from "../sheetSource";

const uid = () => Math.random().toString(36).slice(2, 10);

function deriveName(filename: string): string {
  const stripped = filename.replace(/\.(png|jpe?g|webp|tiff?|bmp)$/i, "");
  const parts = stripped.split(/[\\/]/);
  return parts[parts.length - 1];
}

/**
 * Load image dimensions by handing the bytes to the browser's image
 * decoder. Works for PNG / JPEG / WebP / animated GIFs (first frame) /
 * BMP. TIFF support depends on the browser — Safari decodes it natively,
 * Chromium does not. When decoding fails we surface a useful error.
 */
function loadImageDims(
  blob: Blob,
): Promise<{ url: string; naturalW: number; naturalH: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({
        url,
        naturalW: img.naturalWidth || 1,
        naturalH: img.naturalHeight || 1,
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          "Browser could not decode this image. Try converting to PNG or JPEG.",
        ),
      );
    };
    img.src = url;
  });
}

/**
 * Build a Sheet from a raster image. Page dimensions are in pixels;
 * the user MUST calibrate the sheet before any real-world distance
 * math (cable lengths, coverage radii) will be meaningful. The toast
 * shown after ingest reminds them.
 */
export async function ingestRasterBytes(
  bytes: Uint8Array,
  filename: string,
  mime: string,
): Promise<Sheet> {
  const blob = new Blob([new Uint8Array(bytes)], { type: mime });
  const { url, naturalW, naturalH } = await loadImageDims(blob);
  const name = deriveName(filename);
  const source: RasterSheetSource = {
    kind: "raster",
    bytes,
    mime,
    naturalW,
    naturalH,
  };
  return {
    id: uid(),
    name,
    fileName: filename,
    objectUrl: url,
    source,
    pageWidth: naturalW,
    pageHeight: naturalH,
    renderScale: 1,
    markups: [],
    sheetTitle: name,
  };
}

export async function ingestRasterFile(file: File): Promise<Sheet[]> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return [await ingestRasterBytes(bytes, file.name, file.type || "image/png")];
}
