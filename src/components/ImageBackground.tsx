import { useEffect, useState } from "react";
import { Image as KImage, Rect } from "react-konva";
import type { Sheet } from "../store/projectStore";

/**
 * Generic background for any source kind that boils down to "give the
 * browser an image element and let it render". Used for SVG and raster
 * sheets — the browser handles SVG's full DOM + style cascade, raster
 * decoding, color management, etc. so we don't need any per-format
 * rendering code on the canvas side.
 *
 * Uses sheet.objectUrl (created at ingest time) for the image source.
 * Reactive to sheet.id so swapping sheets reloads the image; the
 * resulting HTMLImageElement is handed straight to Konva, which is
 * happy to draw any element with a complete `naturalWidth`.
 */
export function ImageBackground({ sheet }: { sheet: Sheet }) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setImage(null);
    setError(null);
    const url = sheet.objectUrl;
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    // Tell the browser this is decoded for display rather than CORS
    // upload, so it can use the cheapest decode path.
    img.decoding = "async";
    img.onload = () => {
      if (cancelled) return;
      setImage(img);
    };
    img.onerror = () => {
      if (cancelled) return;
      setError("Could not decode background image");
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [sheet.id, sheet.objectUrl]);

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
      {error && (
        <Rect
          x={0}
          y={0}
          width={sheet.pageWidth}
          height={sheet.pageHeight}
          fill="#fff5f5"
          listening={false}
        />
      )}
    </>
  );
}
