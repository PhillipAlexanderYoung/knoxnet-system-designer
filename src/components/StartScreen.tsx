import { useEffect, useMemo, useState } from "react";
import { Wordmark, Monogram } from "../brand/Wordmark";
import { useProjectStore } from "../store/projectStore";
import { ingestFile } from "../lib/ingest";
import { SUPPORTED_ACCEPT, SUPPORTED_HINT } from "../lib/sheetSource";
import { importProjectFile } from "../lib/projectFile";
import { enqueueIngest } from "../lib/ingestQueue";
import {
  listProjects,
  loadProject as loadFromDb,
  deleteProject,
  renameProject,
  duplicateProject,
} from "../persist/db";
import {
  Check,
  Copy,
  FilePlus2,
  FolderOpen,
  Pencil,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { loadStickyBranding, resolveBranding } from "../lib/branding";
import { ForkProjectDialog } from "./ForkProjectDialog";

export function StartScreen() {
  const newProject = useProjectStore((s) => s.newProject);
  const addSheet = useProjectStore((s) => s.addSheet);
  const loadProject = useProjectStore((s) => s.loadProject);
  const pushToast = useProjectStore((s) => s.pushToast);
  const [recents, setRecents] = useState<{ id: string; name: string; updatedAt: number }[]>([]);
  const [busy, setBusy] = useState(false);
  // The recents row supports an inline rename ("pencil" affordance) and
  // a fork dialog ("copy" affordance). Both keep the user on the
  // StartScreen so they can branch a project before opening it.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [forkSource, setForkSource] = useState<
    | { id: string; name: string; revision: string }
    | null
  >(null);
  // Read the user's saved branding so the StartScreen reflects their
  // company even before any project is open. Falls through to the bundled
  // bundled defaults when the user hasn't customized anything yet.
  const stickyBranding = useMemo(() => resolveBranding(loadStickyBranding()), []);

  const refreshRecents = () =>
    listProjects().then((rs) =>
      setRecents(
        rs.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt })),
      ),
    );

  useEffect(() => {
    refreshRecents();
  }, []);

  const onCreateBlank = () => {
    newProject({ projectName: "Untitled Project" });
  };

  const onOpenProjectFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const project = await importProjectFile(files[0]);
      loadProject(project);
      pushToast("success", `Opened "${project.meta.projectName}" — all markups restored`);
    } catch (e) {
      pushToast("error", e instanceof Error ? e.message : "Could not open project file");
    }
    setBusy(false);
  };

  const setProgress = useProjectStore((s) => s.setIngestProgress);
  const resetProgress = useProjectStore((s) => s.resetIngestProgress);

  const onPickFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    newProject({ projectName: "New Project" });
    const arr = Array.from(files);
    resetProgress();
    setProgress({ total: arr.length });
    let done = 0;
    let failed = 0;
    let importedSheets = 0;
    // Track non-PDF imports so we can nudge the user to calibrate —
    // raster + DXF arrive without real-world scale and any cable / FOV
    // math will be off until they run the calibration tool.
    let needsCalibration = 0;
    await Promise.all(
      arr.map((file) =>
        enqueueIngest(async () => {
          try {
            const sheets = await ingestFile(file);
            for (const sheet of sheets) {
              addSheet(sheet);
              if (
                sheet.source &&
                (sheet.source.kind === "dxf" || sheet.source.kind === "raster")
              ) {
                needsCalibration++;
              }
            }
            importedSheets += sheets.length;
            done++;
            setProgress({ done });
          } catch (e) {
            failed++;
            setProgress({ failed });
            console.error("[ingest]", file.name, e);
            pushToast("error", `${file.name}: ${describeError(e)}`);
          }
        }),
      ),
    );
    if (importedSheets > 0) {
      pushToast(
        "success",
        `Imported ${importedSheets} sheet${importedSheets === 1 ? "" : "s"} from ${done} file${done === 1 ? "" : "s"}`,
      );
    }
    if (needsCalibration > 0) {
      pushToast(
        "info",
        `${needsCalibration} sheet${needsCalibration === 1 ? "" : "s"} need${needsCalibration === 1 ? "s" : ""} scale calibration — use the Calibrate tool (C) on each one.`,
      );
    }
    setBusy(false);
    resetProgress();
  };

  const onOpen = async (id: string) => {
    const p = await loadFromDb(id);
    if (p) {
      loadProject(p);
      pushToast("info", `Opened "${p.meta.projectName}"`);
    }
  };

  const onDelete = async (id: string) => {
    await deleteProject(id);
    setRecents((rs) => rs.filter((r) => r.id !== id));
  };

  const beginRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameDraft(currentName);
  };

  const commitRename = async () => {
    const id = renamingId;
    if (!id) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      setRenamingId(null);
      return;
    }
    const ok = await renameProject(id, trimmed);
    setRenamingId(null);
    if (ok) {
      setRecents((rs) =>
        rs.map((r) => (r.id === id ? { ...r, name: trimmed } : r)),
      );
      pushToast("success", `Renamed to "${trimmed}"`);
    } else {
      pushToast("error", "Rename failed — project not found");
    }
  };

  const beginFork = async (id: string) => {
    // Pull the source project so we can seed the dialog with its
    // current revision; fall back to the listed name when it's absent.
    const src = await loadFromDb(id);
    if (!src) {
      pushToast("error", "Could not open project to fork");
      return;
    }
    setForkSource({
      id,
      name: src.meta.projectName,
      revision: src.meta.revision || "0",
    });
  };

  const onForkSubmit = async (opts: { name: string; revision: string }) => {
    if (!forkSource) return;
    const newId = await duplicateProject(forkSource.id, opts);
    setForkSource(null);
    if (!newId) {
      pushToast("error", "Fork failed — source project missing");
      return;
    }
    await refreshRecents();
    pushToast("success", `Forked to "${opts.name}"`);
  };

  function describeError(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (typeof e === "string") return e;
    return "Unknown error";
  }

  return (
    <div className="h-full w-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-16">
        <header className="flex items-center justify-between mb-16">
          <Wordmark size="lg" />
          <div className="text-right">
            <div className="label">Universal Markup &amp; Bid Tool</div>
            <div className="font-mono text-xs text-ink-300 mt-1">v0.1 · local</div>
          </div>
        </header>

        <section className="mb-12 animate-slide-up">
          <h1 className="text-4xl font-light text-ink-50 leading-tight mb-3">
            Professional drawings,
            <span className="text-amber-knox font-extrabold"> rebranded.</span>
          </h1>
          <p className="text-ink-300 max-w-2xl">
            Open any architectural, civil, or MEP drawing — PDF, DXF, SVG, or
            raster. Calibrate scale, drop cameras, APs, controllers, run fiber
            and copper, generate any custom report you need — and export a
            {" "}
            {stickyBranding.fullName === "Knoxnet System Designer"
              ? "branded"
              : `${stickyBranding.fullName}-branded`}{" "}
            deliverable that actually looks like one.
          </p>
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          <label className={`group panel rounded-xl p-6 text-left cursor-pointer transition-all hover:-translate-y-0.5 hover:border-white/20 ${busy ? "opacity-50 pointer-events-none" : ""}`}>
            <FilePlus2 className="w-6 h-6 text-signal-blue mb-3" />
            <div className="font-semibold text-ink-50 mb-1">Import Drawings</div>
            <div className="text-sm text-ink-300">
              Pick one or more drawings to start a new project. Sheets become
              a navigable set.
            </div>
            <div className="mt-2 text-[11px] text-ink-400 font-mono leading-snug">
              {SUPPORTED_HINT}
            </div>
            <input
              type="file"
              accept={SUPPORTED_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => onPickFiles(e.target.files)}
            />
          </label>

          <button
            onClick={onCreateBlank}
            disabled={busy}
            className="group panel rounded-xl p-6 text-left hover:border-white/20 transition-all disabled:opacity-50 hover:-translate-y-0.5"
          >
            <Monogram size={24} />
            <div className="font-semibold text-ink-50 mt-3 mb-1">
              New blank project
            </div>
            <div className="text-sm text-ink-300">
              Set up project metadata first, then add sheets as they come in.
            </div>
          </button>

          <label className={`group panel rounded-xl p-6 text-left cursor-pointer transition-all hover:-translate-y-0.5 hover:border-signal-green/40 col-span-full md:col-span-1 ${busy ? "opacity-50 pointer-events-none" : ""}`}>
            <Share2 className="w-6 h-6 text-signal-green mb-3" />
            <div className="font-semibold text-ink-50 mb-1">Open Project File</div>
            <div className="text-sm text-ink-300">
              Open a <span className="font-mono text-ink-200">.knoxnet</span> file shared by
              a collaborator — all sheets and live markups are restored.
            </div>
            <input
              type="file"
              accept=".knoxnet,application/json"
              className="hidden"
              onChange={(e) => onOpenProjectFile(e.target.files)}
            />
          </label>
        </section>

        {recents.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen className="w-4 h-4 text-ink-300" />
              <div className="label">Recent Projects</div>
            </div>
            <div className="space-y-2">
              {recents.map((r) => {
                const isRenaming = renamingId === r.id;
                return (
                  <div
                    key={r.id}
                    className="panel rounded-lg px-4 py-3 flex items-center justify-between gap-3 hover:border-white/20 transition-colors"
                  >
                    {isRenaming ? (
                      // Inline rename — Enter commits, Escape cancels.
                      // We keep the timestamp visible so the user knows
                      // which row they're editing in a long list.
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitRename();
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          className="input"
                        />
                        <button
                          onClick={commitRename}
                          className="btn-ghost text-signal-green"
                          title="Save name (Enter)"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setRenamingId(null)}
                          className="btn-ghost text-ink-400"
                          title="Cancel (Esc)"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <button
                          onClick={() => onOpen(r.id)}
                          className="flex-1 text-left"
                        >
                          <div className="font-medium text-ink-50">
                            {r.name}
                          </div>
                          <div className="text-xs text-ink-400 font-mono">
                            Updated {new Date(r.updatedAt).toLocaleString()}
                          </div>
                        </button>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => beginRename(r.id, r.name)}
                            className="btn-ghost text-ink-400 hover:text-amber-knox"
                            title="Rename"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => beginFork(r.id)}
                            className="btn-ghost text-ink-400 hover:text-amber-knox"
                            title="Fork as new version"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDelete(r.id)}
                            className="btn-ghost text-ink-400 hover:text-signal-red"
                            title="Delete project"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {forkSource && (
          <ForkProjectDialog
            sourceName={forkSource.name}
            sourceRevision={forkSource.revision}
            onSubmit={onForkSubmit}
            onClose={() => setForkSource(null)}
          />
        )}

        <footer className="mt-24 pt-6 border-t border-white/5 flex items-center justify-between text-xs text-ink-400 font-mono">
          <span>Knoxnet System Designer · Apache-2.0</span>
          <span>Press ⌘K for commands · ? for shortcuts</span>
        </footer>
      </div>
    </div>
  );
}
