/**
 * Portable project file (.knoxnet) — packages the full Project record
 * (all sheets, markups, racks, bid, branding) into a single JSON file
 * that can be shared via email, Drive, Slack, etc. and re-opened on any
 * machine without a server or install.
 *
 * Format v2.0
 * -----------
 * {
 *   knoxnet: "2.0",
 *   exportedAt: "<ISO timestamp>",
 *   project: {
 *     ...Project,
 *     sheets: [{
 *       ...Sheet,
 *       sourceSerialized: SerializedSheetSource,
 *     }],
 *   }
 * }
 *
 * - `sourceSerialized` is a discriminated-union encoding of the sheet's
 *   drawing source: PDF/DXF/raster/IFC carry base64 bytes, SVG carries
 *   raw text. DXF parsed entities are re-parsed on import so the on-disk
 *   format stays compact and DXF parser upgrades don't invalidate
 *   existing saves.
 *
 * Format v1.x (legacy)
 * --------------------
 * v1 sheets carried `pdfBytesB64` directly. The importer migrates v1
 * sheets to v2 transparently by wrapping the bytes as a PDF source.
 *
 * Binary fields are base64-encoded in 8 kB chunks to avoid call-stack
 * limits on `String.fromCharCode(...bytes)`.
 */

import type { Project, Sheet } from "../store/projectStore";
import type {
  SerializedSheetSource,
  SheetSource,
} from "./sheetSource";
import { fromBase64, toBase64 } from "./sheetSource";
import { migrateProjectV1toV2 } from "./migrate";

const FILE_VERSION = "2.0";
const MIME = "application/json";
const EXT = ".knoxnet";

function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9_\- ]/g, "_").trim() || "project";
}

// ───────── source ↔ serialised ─────────

function sourceToSerialized(source: SheetSource): SerializedSheetSource {
  switch (source.kind) {
    case "pdf":
      return { kind: "pdf", bytesB64: toBase64(source.bytes) };
    case "dxf":
      return {
        kind: "dxf",
        bytesB64: toBase64(source.bytes),
        units: source.units,
      };
    case "svg":
      return {
        kind: "svg",
        text: source.text,
        viewBoxX: source.viewBoxX,
        viewBoxY: source.viewBoxY,
        viewBoxW: source.viewBoxW,
        viewBoxH: source.viewBoxH,
      };
    case "raster":
      return {
        kind: "raster",
        bytesB64: toBase64(source.bytes),
        mime: source.mime,
        naturalW: source.naturalW,
        naturalH: source.naturalH,
      };
    case "ifc":
      return {
        kind: "ifc",
        bytesB64: toBase64(source.bytes),
        storey: source.storey,
      };
  }
}

async function serializedToSource(s: SerializedSheetSource): Promise<SheetSource> {
  switch (s.kind) {
    case "pdf":
      return { kind: "pdf", bytes: fromBase64(s.bytesB64) };
    case "dxf": {
      const bytes = fromBase64(s.bytesB64);
      // Re-parse on import — bytes stay the canonical thing on disk.
      const { parseDxfText } = await import("./ingest/dxfIngest");
      const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      const { doc, units } = await parseDxfText(text);
      return {
        kind: "dxf",
        bytes,
        units: s.units ?? units,
        parsed: doc,
      };
    }
    case "svg":
      return {
        kind: "svg",
        text: s.text,
        viewBoxX: s.viewBoxX,
        viewBoxY: s.viewBoxY,
        viewBoxW: s.viewBoxW,
        viewBoxH: s.viewBoxH,
      };
    case "raster":
      return {
        kind: "raster",
        bytes: fromBase64(s.bytesB64),
        mime: s.mime,
        naturalW: s.naturalW,
        naturalH: s.naturalH,
      };
    case "ifc":
      return {
        kind: "ifc",
        bytes: fromBase64(s.bytesB64),
        storey: s.storey,
      };
  }
}

function rehydrateObjectUrl(source: SheetSource): string | undefined {
  switch (source.kind) {
    case "pdf":
      return URL.createObjectURL(
        new Blob([new Uint8Array(source.bytes)], { type: "application/pdf" }),
      );
    case "svg":
      return URL.createObjectURL(
        new Blob([source.text], { type: "image/svg+xml" }),
      );
    case "raster":
      return URL.createObjectURL(
        new Blob([new Uint8Array(source.bytes)], { type: source.mime }),
      );
    case "dxf":
    case "ifc":
      return undefined;
  }
}

// ───────── serialised sheet type ─────────

type SerializedSheet = Omit<Sheet, "pdfBytes" | "objectUrl" | "source"> & {
  /** v2.0 — full discriminated-union source. */
  sourceSerialized?: SerializedSheetSource;
  /** v1.x legacy — base64-encoded PDF bytes on sheets that pre-date
   *  the multi-format refactor. Importer auto-wraps to a PDF source. */
  pdfBytesB64?: string;
};

type ProjectFilePayload = {
  knoxnet: string;
  exportedAt: string;
  project: Omit<Project, "sheets"> & { sheets: SerializedSheet[] };
};

// ───────── export ─────────

/**
 * Serialise the current project to a .knoxnet file and trigger a download.
 * Every source kind is encoded into the JSON; the file is fully self-
 * contained and can be opened on any machine without a server.
 */
export function exportProjectFile(project: Project): void {
  const sheets: SerializedSheet[] = project.sheets.map((sh) => {
    const { pdfBytes, objectUrl: _url, source, ...rest } = sh;
    // Prefer canonical .source; fall back to legacy pdfBytes if present.
    let serial: SerializedSheetSource | undefined;
    if (source) serial = sourceToSerialized(source);
    else if (pdfBytes) serial = { kind: "pdf", bytesB64: toBase64(pdfBytes) };
    return {
      ...rest,
      ...(serial ? { sourceSerialized: serial } : {}),
    };
  });

  const payload: ProjectFilePayload = {
    knoxnet: FILE_VERSION,
    exportedAt: new Date().toISOString(),
    project: { ...project, sheets },
  };

  const blob = new Blob([JSON.stringify(payload)], { type: MIME });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safeName(project.meta.projectName)}${EXT}`;
  a.click();
  URL.revokeObjectURL(url);
}

// ───────── import ─────────

/**
 * Parse a .knoxnet file back into a live Project. Handles both v1.x
 * (pdfBytesB64 on each sheet) and v2.0 (sourceSerialized on each sheet)
 * by routing through the migrator after rehydrating bytes.
 */
export async function importProjectFile(file: File): Promise<Project> {
  const text = await file.text();

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("File is not valid JSON — is this a .knoxnet project file?");
  }

  const p = payload as Partial<ProjectFilePayload>;
  if (!p.knoxnet || !p.project) {
    throw new Error(
      "Not a KnoxNet project file (missing version header). " +
        "Use Export → Project File (.knoxnet) to create a shareable file.",
    );
  }

  const rawSheets = (p.project.sheets ?? []) as SerializedSheet[];
  const sheets: Sheet[] = await Promise.all(
    rawSheets.map(async (sh) => {
      const { pdfBytesB64, sourceSerialized, ...rest } = sh;
      let source: SheetSource | undefined;
      if (sourceSerialized) {
        try {
          source = await serializedToSource(sourceSerialized);
        } catch (e) {
          console.error("[import] could not rehydrate source:", e);
        }
      } else if (pdfBytesB64) {
        // Legacy v1.x — wrap as a PDF source.
        source = { kind: "pdf", bytes: fromBase64(pdfBytesB64) };
      }
      const objectUrl = source ? rehydrateObjectUrl(source) : undefined;
      const pdfBytes = source?.kind === "pdf" ? source.bytes : undefined;
      return { ...rest, source, pdfBytes, objectUrl } as Sheet;
    }),
  );

  const project: Project = {
    ...(p.project as Project),
    sheets,
    racks: p.project.racks ?? [],
    connections: p.project.connections ?? [],
  };

  // Run the migrator so legacy records gain a v2-shaped `source`
  // (idempotent on freshly-exported v2 files).
  return migrateProjectV1toV2(project);
}
