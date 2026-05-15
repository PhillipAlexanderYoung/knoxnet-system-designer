import { Rect, Text } from "react-konva";
import type { Sheet } from "../store/projectStore";
import { PdfBackground } from "./PdfBackground";
import { ImageBackground } from "./ImageBackground";
import { DxfBackground } from "./DxfBackground";

/**
 * Top-level background renderer — picks the right per-kind background
 * component based on `sheet.source.kind`. Pre-v2 sheets that only have
 * `sheet.pdfBytes` are treated as PDF sources so loading a legacy
 * `.knoxnet` file or IndexedDB record continues to work while the
 * migrator runs lazily.
 */
export function SheetBackground({
  sheet,
  viewportScale,
}: {
  sheet: Sheet;
  viewportScale: number;
}) {
  const kind = sheet.source?.kind ?? (sheet.pdfBytes ? "pdf" : null);
  switch (kind) {
    case "pdf":
      return <PdfBackground sheet={sheet} viewportScale={viewportScale} />;
    case "svg":
    case "raster":
      return <ImageBackground sheet={sheet} />;
    case "dxf":
      return <DxfBackground sheet={sheet} />;
    case "ifc":
      return <NotSupported sheet={sheet} label="IFC import isn't implemented yet" />;
    default:
      return <NotSupported sheet={sheet} label="No drawing — calibration only" />;
  }
}

/** Placeholder card for sources we can't render — keeps the editor
 *  usable (calibration, markups still work) even when the source is
 *  missing or unsupported. */
function NotSupported({ sheet, label }: { sheet: Sheet; label: string }) {
  return (
    <>
      <Rect
        x={0}
        y={0}
        width={sheet.pageWidth}
        height={sheet.pageHeight}
        fill="#ffffff"
        listening={false}
      />
      <Text
        x={20}
        y={20}
        text={label}
        fontSize={18}
        fill="#94A0B8"
        listening={false}
      />
    </>
  );
}
