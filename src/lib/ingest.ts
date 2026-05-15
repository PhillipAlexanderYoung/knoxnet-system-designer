/**
 * Legacy ingest entry-point. Kept as a thin re-export so any internal
 * imports continue to work after the multi-format refactor; the real
 * implementation lives in `./ingest/` split by source kind.
 *
 * New code should import directly from `./ingest` — that folder also
 * exports the top-level `ingestFile` dispatcher that picks the right
 * per-format ingester based on filename / MIME.
 */
export {
  ingestPdfBytes,
  ingestPdfBytesAsSheets,
  ingestPdfFile,
  ingestPdfFromUrl,
  ingestDxfBytes,
  ingestDxfFile,
  parseDxfText,
  ingestSvgText,
  ingestSvgFile,
  ingestRasterBytes,
  ingestRasterFile,
  ingestFile,
} from "./ingest/index";
