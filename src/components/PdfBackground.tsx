import { useEffect, useRef, useState } from "react";
import { Image as KImage, Rect } from "react-konva";
import { useProjectStore, type Sheet } from "../store/projectStore";
import { getCachedDoc, renderPageToCanvas } from "../lib/pdfjs";
import { QUALITY_PROFILES, pickRenderScale } from "../lib/quality";
import { sampleBackgroundColor } from "../lib/sheetAnalysis";

/**
 * Renders the PDF page as a Konva Image.
 *
 * Render strategy:
 *  - Quality mode picks base + max DPI (Speed = 1.0/1.5, Balanced = 1.5/2.5,
 *    Quality = 2.0/4.0).
 *  - First paint at base scale: fast.
 *  - Re-render at higher DPI when user zooms past 1.0×, debounced so we don't
 *    rasterize on every wheel tick.
 *  - Cached PDFDocumentProxy means re-render is just a paint, not a parse.
 */
export function PdfBackground({
  sheet,
  viewportScale,
}: {
  sheet: Sheet;
  viewportScale: number;
}) {
  const [image, setImage] = useState<HTMLCanvasElement | null>(null);
  const renderToken = useRef(0);
  const lastRenderScale = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pushToast = useProjectStore((s) => s.pushToast);
  const qualityMode = useProjectStore((s) => s.qualityMode);
  const setSheetBgColor = useProjectStore((s) => s.setSheetBgColor);
  const profile = QUALITY_PROFILES[qualityMode];

  // Reset cached image when sheet or quality mode changes
  useEffect(() => {
    setImage(null);
    lastRenderScale.current = 0;
  }, [sheet.id, qualityMode]);

  // Schedule render — first paint immediate, re-renders debounced
  useEffect(() => {
    const targetScale = pickRenderScale(profile, viewportScale);
    // Skip if our cached image already covers this scale (small epsilon)
    if (image && lastRenderScale.current >= targetScale - 0.01) return;

    const isFirstPaint = !image;
    const delay = isFirstPaint ? 0 : profile.rerenderDebounceMs;

    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    let cancelled = false;
    const myToken = ++renderToken.current;

    debounceTimer.current = setTimeout(() => {
      (async () => {
        if (!sheet.pdfBytes) return;
        try {
          const doc = await getCachedDoc(sheet.pdfBytes);
          const page = await doc.getPage(1);
          const { canvas, scaleUsed } = await renderPageToCanvas(page, targetScale);
          if (cancelled || myToken !== renderToken.current) return;
          setImage(canvas);
          lastRenderScale.current = scaleUsed;
          // Sample the page background once so masks + title-block theming
          // can blend into the host PDF. Only worth doing on the first
          // successful render — subsequent re-renders at higher DPI won't
          // change the sampled color materially.
          if (!sheet.bgColor) {
            const bg = sampleBackgroundColor(canvas);
            if (bg) setSheetBgColor(sheet.id, bg);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[PdfBackground] render failed:", e);
          pushToast("error", `Render failed for ${sheet.name}: ${msg}`);
        }
      })();
    }, delay);

    return () => {
      cancelled = true;
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [
    sheet.id,
    sheet.pdfBytes,
    sheet.bgColor,
    viewportScale,
    image,
    profile,
    pushToast,
    setSheetBgColor,
    sheet.name,
  ]);

  return (
    <>
      <Rect
        x={0}
        y={0}
        width={sheet.pageWidth}
        height={sheet.pageHeight}
        fill="#ffffff"
        shadowColor="rgba(0,0,0,0.6)"
        shadowBlur={20}
        shadowOffset={{ x: 0, y: 8 }}
        shadowOpacity={1}
      />
      {image && (
        <KImage
          image={image}
          x={0}
          y={0}
          width={sheet.pageWidth}
          height={sheet.pageHeight}
          listening={false}
        />
      )}
    </>
  );
}
