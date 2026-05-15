/**
 * Project-version migrators.
 *
 * KnoxNet projects carry a version stamp on the .knoxnet wrapper and an
 * implicit shape inside IndexedDB. As the schema evolves, every change
 * lands here as a forward-only migrator so old saves continue to open.
 *
 * Conventions:
 *   - Migrators are pure: take a project, return a project (or a sheet,
 *     etc.). They never throw on missing fields — older records get
 *     filled with sensible defaults.
 *   - Each migrator covers a single version bump. `migrateProject`
 *     chains them in order; we never skip versions.
 *   - Sheet sources are the only thing that materially changed shape
 *     in v2.0, so the migrator focuses there.
 */

import type { Project, Sheet } from "../store/projectStore";
import type { SheetSource } from "./sheetSource";

/** Latest file/format version emitted by this build. Bumped any time a
 *  migrator is added; readers use this to decide if they need to run
 *  any migrators at load time. */
export const CURRENT_PROJECT_VERSION = "2.0";

/**
 * Promote a single legacy sheet (v1.x) to v2.0: every sheet that had
 * `pdfBytes` but no `source` gets wrapped as a PDF source. Idempotent
 * so it's safe to run on freshly-migrated records too.
 */
export function migrateSheetV1toV2(sheet: Sheet): Sheet {
  if (sheet.source) return sheet;
  if (sheet.pdfBytes) {
    const source: SheetSource = { kind: "pdf", bytes: sheet.pdfBytes };
    return { ...sheet, source };
  }
  // Sheet has no PDF bytes AND no source — could be a v1 record loaded
  // from IndexedDB before the pdfs lookup happened. Leave source unset;
  // the loader will populate it after fetching bytes.
  return sheet;
}

/** Migrate every sheet in a project. */
export function migrateProjectV1toV2(project: Project): Project {
  return {
    ...project,
    sheets: project.sheets.map(migrateSheetV1toV2),
  };
}

/**
 * Top-level migrator. Accepts whatever shape comes off disk (best-effort
 * typed) and returns a Project at the current schema version. Future
 * migrators chain here in order.
 */
export function migrateProject(project: Project, _fromVersion?: string): Project {
  // Right now there's exactly one migrator. Future versions will chain
  // additional migrators here based on `_fromVersion`.
  return migrateProjectV1toV2(project);
}
