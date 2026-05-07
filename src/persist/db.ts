import Dexie, { type Table } from "dexie";
import type { Project } from "../store/projectStore";

// Sheets store PDF bytes separately so the project record stays small and
// IndexedDB updates are fast (project saves don't re-write the PDF blobs).

interface StoredProject {
  id: string;
  name: string;
  updatedAt: number;
  // serialized project minus the heavy PDF byte arrays
  data: Omit<Project, "sheets"> & {
    sheets: Array<Omit<Project["sheets"][number], "pdfBytes" | "objectUrl">>;
  };
}

interface StoredPdf {
  /** projectId__sheetId */
  key: string;
  bytes: Uint8Array;
}

class KnoxDB extends Dexie {
  projects!: Table<StoredProject, string>;
  pdfs!: Table<StoredPdf, string>;

  constructor() {
    super("knoxnet-system-designer");
    this.version(1).stores({
      projects: "id, updatedAt",
      pdfs: "key",
    });
  }
}

export const db = new KnoxDB();

const pdfKey = (projectId: string, sheetId: string) =>
  `${projectId}__${sheetId}`;

export async function saveProject(p: Project) {
  const sheets = p.sheets.map((s) => ({ ...s }));
  // Persist PDF bytes to the pdfs table, then strip them from the sheet record.
  for (const s of sheets) {
    if (s.pdfBytes) {
      await db.pdfs.put({ key: pdfKey(p.id, s.id), bytes: s.pdfBytes });
    }
  }
  const stripped = sheets.map(({ pdfBytes: _b, objectUrl: _u, ...rest }) => rest);
  await db.projects.put({
    id: p.id,
    name: p.meta.projectName,
    updatedAt: Date.now(),
    data: { ...p, sheets: stripped },
  });
}

export async function listProjects() {
  return db.projects.orderBy("updatedAt").reverse().toArray();
}

export async function loadProject(id: string): Promise<Project | null> {
  const stored = await db.projects.get(id);
  if (!stored) return null;
  // Re-hydrate PDF bytes for each sheet (and create object URLs for viewing)
  const sheets = await Promise.all(
    stored.data.sheets.map(async (sh) => {
      const pdf = await db.pdfs.get(pdfKey(id, sh.id));
      const bytes = pdf?.bytes;
      const objectUrl = bytes
        ? URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }))
        : undefined;
      return { ...sh, pdfBytes: bytes, objectUrl };
    }),
  );
  return { ...stored.data, sheets } as Project;
}

export async function deleteProject(id: string) {
  await db.projects.delete(id);
  const all = await db.pdfs.toArray();
  await db.pdfs.bulkDelete(
    all.filter((p) => p.key.startsWith(`${id}__`)).map((p) => p.key),
  );
}

/**
 * Rename a stored project in place — updates both the indexed `name`
 * column (used by `listProjects`) and the embedded `meta.projectName`
 * (used everywhere else). Lightweight: no PDF bytes are touched.
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
 *   • Clones every PDF blob to the new project's keys so the copy
 *     opens immediately without re-ingest.
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

  // Re-key every PDF blob owned by the source project so the fork has
  // its own PDFs and deleting either project later won't orphan the
  // other's bytes.
  const allPdfs = await db.pdfs.toArray();
  const sourcePdfs = allPdfs.filter((p) => p.key.startsWith(`${sourceId}__`));
  await db.pdfs.bulkPut(
    sourcePdfs.map((p) => ({
      key: p.key.replace(`${sourceId}__`, `${newId}__`),
      bytes: p.bytes,
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
