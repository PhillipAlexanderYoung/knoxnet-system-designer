import Dexie, { type Table } from "dexie";
import type { Project, Sheet } from "../store/projectStore";
import type { SheetSource, SheetSourceKind } from "../lib/sheetSource";
import { migrateProjectV1toV2 } from "../lib/migrate";

// Sheets store their binary backing (PDF bytes, raster bytes, parsed-DXF
// bytes, SVG text) separately from the project record so the project
// row stays small and IndexedDB updates are fast (project saves don't
// re-write the heavy blobs).
//
// v1 of this DB stored only PDF bytes in a `pdfs` table. v2 introduces
// a generic `sources` table that handles every sheet kind via a tagged
// payload. We keep `pdfs` around in read-only mode so legacy projects
// continue to open without forcing a one-shot migration script.

interface StoredProject {
  id: string;
  name: string;
  updatedAt: number;
  // serialized project minus the heavy sheet payloads
  data: Omit<Project, "sheets"> & {
    sheets: Array<
      Omit<Project["sheets"][number], "pdfBytes" | "objectUrl" | "source"> & {
        /** Tag of the persisted source for this sheet — load reads from
         *  the `sources` table by `projectId__sheetId`. Undefined for
         *  v1 records (treated as `pdf` and looked up in `pdfs`). */
        sourceKind?: SheetSourceKind;
        /** Lightweight per-source metadata that doesn't fit in bytes:
         *  SVG viewBox numbers, DXF units, raster MIME, etc. Kept here
         *  so we don't have to crack the source payload to render a
         *  thumbnail. */
        sourceMeta?: SheetSourceMeta;
      }
    >;
  };
}

interface StoredPdf {
  /** projectId__sheetId */
  key: string;
  bytes: Uint8Array;
}

interface StoredSheetSource {
  /** projectId__sheetId */
  key: string;
  kind: SheetSourceKind;
  /** Binary payload for kinds that carry bytes (pdf/dxf/raster/ifc).
   *  Empty Uint8Array for svg. */
  bytes: Uint8Array;
  /** Source text for kinds that carry text (svg). */
  text?: string;
  /** Source-specific metadata (units, viewBox, etc.) — see SheetSourceMeta */
  meta?: SheetSourceMeta;
}

export interface SheetSourceMeta {
  /** SVG viewBox numbers */
  viewBoxX?: number;
  viewBoxY?: number;
  viewBoxW?: number;
  viewBoxH?: number;
  /** DXF units */
  units?: "in" | "ft" | "mm" | "cm" | "m" | "unitless";
  /** Raster info */
  mime?: string;
  naturalW?: number;
  naturalH?: number;
  /** IFC */
  storey?: string;
}

class KnoxDB extends Dexie {
  projects!: Table<StoredProject, string>;
  pdfs!: Table<StoredPdf, string>;
  sources!: Table<StoredSheetSource, string>;

  constructor() {
    super("knoxnet-system-designer");
    // v1: legacy single-PDF table.
    this.version(1).stores({
      projects: "id, updatedAt",
      pdfs: "key",
    });
    // v2: generic sources table for multi-format sheets. We keep the
    // pdfs table around as a fallback so existing records continue to
    // open without a one-shot migration script.
    this.version(2).stores({
      projects: "id, updatedAt",
      pdfs: "key",
      sources: "key",
    });
  }
}

export const db = new KnoxDB();

const sourceKey = (projectId: string, sheetId: string) =>
  `${projectId}__${sheetId}`;

// ───────── source ↔ stored conversion ─────────

function sourceToStored(
  key: string,
  source: SheetSource,
): { stored: StoredSheetSource; meta: SheetSourceMeta | undefined } {
  switch (source.kind) {
    case "pdf":
      return { stored: { key, kind: "pdf", bytes: source.bytes }, meta: undefined };
    case "dxf":
      return {
        stored: {
          key,
          kind: "dxf",
          bytes: source.bytes,
          meta: { units: source.units },
        },
        meta: { units: source.units },
      };
    case "svg":
      return {
        stored: {
          key,
          kind: "svg",
          bytes: new Uint8Array(0),
          text: source.text,
          meta: {
            viewBoxX: source.viewBoxX,
            viewBoxY: source.viewBoxY,
            viewBoxW: source.viewBoxW,
            viewBoxH: source.viewBoxH,
          },
        },
        meta: {
          viewBoxX: source.viewBoxX,
          viewBoxY: source.viewBoxY,
          viewBoxW: source.viewBoxW,
          viewBoxH: source.viewBoxH,
        },
      };
    case "raster":
      return {
        stored: {
          key,
          kind: "raster",
          bytes: source.bytes,
          meta: {
            mime: source.mime,
            naturalW: source.naturalW,
            naturalH: source.naturalH,
          },
        },
        meta: {
          mime: source.mime,
          naturalW: source.naturalW,
          naturalH: source.naturalH,
        },
      };
    case "ifc":
      return {
        stored: {
          key,
          kind: "ifc",
          bytes: source.bytes,
          meta: { storey: source.storey },
        },
        meta: { storey: source.storey },
      };
  }
}

async function storedToSource(stored: StoredSheetSource): Promise<SheetSource> {
  switch (stored.kind) {
    case "pdf":
      return { kind: "pdf", bytes: stored.bytes };
    case "dxf": {
      // Re-parse the DXF text from bytes on load. The parser is async
      // and dynamically imported, so we keep this off the hot path.
      const { parseDxfText } = await import("../lib/ingest/dxfIngest");
      const text = new TextDecoder("utf-8", { fatal: false }).decode(stored.bytes);
      const { doc, units } = await parseDxfText(text);
      return {
        kind: "dxf",
        bytes: stored.bytes,
        units: stored.meta?.units ?? units,
        parsed: doc,
      };
    }
    case "svg":
      return {
        kind: "svg",
        text: stored.text ?? "",
        viewBoxX: stored.meta?.viewBoxX ?? 0,
        viewBoxY: stored.meta?.viewBoxY ?? 0,
        viewBoxW: stored.meta?.viewBoxW ?? 1000,
        viewBoxH: stored.meta?.viewBoxH ?? 1000,
      };
    case "raster":
      return {
        kind: "raster",
        bytes: stored.bytes,
        mime: stored.meta?.mime ?? "image/png",
        naturalW: stored.meta?.naturalW ?? 1,
        naturalH: stored.meta?.naturalH ?? 1,
      };
    case "ifc":
      return { kind: "ifc", bytes: stored.bytes, storey: stored.meta?.storey };
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

// ───────── save ─────────

export async function saveProject(p: Project) {
  const sheets = p.sheets.map((s) => ({ ...s }));
  // Persist each sheet's source separately. We dual-write to `pdfs` for
  // PDFs so legacy readers continue to function during the rollout.
  const strippedSheets = await Promise.all(
    sheets.map(async (s) => {
      const key = sourceKey(p.id, s.id);
      // Determine source: prefer the canonical .source field, fall back
      // to legacy .pdfBytes (auto-promote to a PDF source). Skip persistence
      // when nothing is set — useful for placeholder/blank sheets.
      let source: SheetSource | undefined = s.source;
      if (!source && s.pdfBytes) source = { kind: "pdf", bytes: s.pdfBytes };
      if (source) {
        const { stored, meta } = sourceToStored(key, source);
        await db.sources.put(stored);
        // Legacy dual-write: keep PDF bytes in `pdfs` so older app
        // builds reading the same browser profile still find them.
        if (source.kind === "pdf") {
          await db.pdfs.put({ key, bytes: source.bytes });
        }
        return stripSheet(s, source.kind, meta);
      }
      return stripSheet(s, undefined, undefined);
    }),
  );
  await db.projects.put({
    id: p.id,
    name: p.meta.projectName,
    updatedAt: Date.now(),
    data: { ...p, sheets: strippedSheets },
  });
}

type StrippedSheet = StoredProject["data"]["sheets"][number];

function stripSheet(
  s: Sheet,
  sourceKind: SheetSourceKind | undefined,
  meta: SheetSourceMeta | undefined,
): StrippedSheet {
  const {
    pdfBytes: _b,
    objectUrl: _u,
    source: _s,
    ...rest
  } = s;
  return { ...rest, sourceKind, sourceMeta: meta };
}

// ───────── list / load ─────────

export async function listProjects() {
  return db.projects.orderBy("updatedAt").reverse().toArray();
}

export async function loadProject(id: string): Promise<Project | null> {
  const stored = await db.projects.get(id);
  if (!stored) return null;
  // Re-hydrate each sheet's source (with object URL where appropriate).
  // PDF sheets fall back to the legacy `pdfs` table when `sources` has
  // no entry — covers v1 projects opened in v2 for the first time.
  const sheets = await Promise.all(
    stored.data.sheets.map(async (sh) => {
      const key = sourceKey(id, sh.id);
      let source: SheetSource | undefined;
      try {
        const fromSources = await db.sources.get(key);
        if (fromSources) {
          source = await storedToSource(fromSources);
        }
      } catch (e) {
        console.warn(`[db] could not load source for sheet ${sh.id}:`, e);
      }
      if (!source) {
        // Legacy fallback — pdfs table.
        const pdf = await db.pdfs.get(key);
        if (pdf?.bytes) source = { kind: "pdf", bytes: pdf.bytes };
      }
      const objectUrl = source ? rehydrateObjectUrl(source) : undefined;
      const pdfBytes = source?.kind === "pdf" ? source.bytes : undefined;
      const { sourceKind: _k, sourceMeta: _m, ...rest } = sh;
      return { ...rest, source, pdfBytes, objectUrl } as Sheet;
    }),
  );
  // Run any project-level migrators just in case the stored record is
  // older than the current schema (e.g. a sheet missing .source after
  // load fallback).
  return migrateProjectV1toV2({ ...stored.data, sheets } as Project);
}

// ───────── delete / rename / duplicate ─────────

export async function deleteProject(id: string) {
  await db.projects.delete(id);
  const allPdfs = await db.pdfs.toArray();
  await db.pdfs.bulkDelete(
    allPdfs.filter((p) => p.key.startsWith(`${id}__`)).map((p) => p.key),
  );
  const allSources = await db.sources.toArray();
  await db.sources.bulkDelete(
    allSources.filter((s) => s.key.startsWith(`${id}__`)).map((s) => s.key),
  );
}

/**
 * Rename a stored project in place — updates both the indexed `name`
 * column (used by `listProjects`) and the embedded `meta.projectName`
 * (used everywhere else). Lightweight: no source bytes are touched.
 *
 * Returns true when the project existed and was renamed, false when the
 * id wasn't found so callers can surface a sensible error.
 */
export async function renameProject(
  id: string,
  newName: string,
): Promise<boolean> {
  const stored = await db.projects.get(id);
  if (!stored) return false;
  const trimmed = newName.trim() || stored.name;
  await db.projects.put({
    ...stored,
    name: trimmed,
    updatedAt: Date.now(),
    data: {
      ...stored.data,
      meta: { ...stored.data.meta, projectName: trimmed },
      updatedAt: Date.now(),
    },
  });
  return true;
}

/**
 * Fork a stored project into a brand-new one. Used by both the
 * StartScreen "Duplicate" action and the Topbar "Save as new version"
 * flow so users can branch a deliverable without losing the original.
 *
 * Behavior:
 *   • Generates a fresh project `id` so the original is untouched.
 *   • Clones every source blob (PDF bytes, DXF bytes, SVG text, raster
 *     bytes) to the new project's keys so the copy opens immediately
 *     without re-ingest.
 *   • Optionally overrides the project name and/or `meta.revision` —
 *     the typical fork bumps the revision (e.g. R0 → R1) so doc codes
 *     reflect that this is the next iteration.
 *
 * Returns the cloned project's id so the caller can immediately open it.
 */
export async function duplicateProject(
  sourceId: string,
  opts: { name?: string; revision?: string } = {},
): Promise<string | null> {
  const source = await db.projects.get(sourceId);
  if (!source) return null;

  const newId = makeProjectId();
  const now = Date.now();
  const newName = (opts.name ?? `${source.name} (copy)`).trim() || source.name;
  const newRevision = opts.revision ?? source.data.meta.revision ?? "0";

  // Re-key every binary blob owned by the source project so the fork
  // has its own copies and deleting either later won't orphan the
  // other's bytes.
  const allPdfs = await db.pdfs.toArray();
  const sourcePdfs = allPdfs.filter((p) => p.key.startsWith(`${sourceId}__`));
  await db.pdfs.bulkPut(
    sourcePdfs.map((p) => ({
      key: p.key.replace(`${sourceId}__`, `${newId}__`),
      bytes: p.bytes,
    })),
  );
  const allSources = await db.sources.toArray();
  const sourceRows = allSources.filter((s) => s.key.startsWith(`${sourceId}__`));
  await db.sources.bulkPut(
    sourceRows.map((s) => ({
      ...s,
      key: s.key.replace(`${sourceId}__`, `${newId}__`),
    })),
  );

  await db.projects.put({
    id: newId,
    name: newName,
    updatedAt: now,
    data: {
      ...source.data,
      id: newId,
      meta: {
        ...source.data.meta,
        projectName: newName,
        revision: newRevision,
      },
      createdAt: now,
      updatedAt: now,
    },
  });

  return newId;
}

/** Project id generator. Mirrors the one in projectStore (`uid`) so
 *  ids stored by either path look the same. Kept local to this file so
 *  the persistence layer doesn't have to import the store. */
function makeProjectId() {
  return Math.random().toString(36).slice(2, 10);
}
