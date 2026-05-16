import { useState } from "react";
import { Wordmark } from "../brand/Wordmark";
import { useProjectStore } from "../store/projectStore";
import {
  Settings2,
  Calculator,
  Command,
  FileDown,
  ChevronDown,
  GitFork,
  Home,
  Save,
  Files,
  Server,
  Share2,
  GitBranch,
} from "lucide-react";
import { exportMarkupPdf } from "../export/exportMarkupPdf";
import { exportBidXlsx, exportBidPdf } from "../export/exportBid";
import { exportProjectFile } from "../lib/projectFile";
import {
  saveProject,
  duplicateProject,
  loadProject as loadFromDb,
} from "../persist/db";
import { QualityToggle } from "./QualityToggle";
import { IngestProgress } from "./IngestProgress";
import { ForkProjectDialog } from "./ForkProjectDialog";
import { clearDocCache } from "../lib/pdfjs";

export function Topbar() {
  const project = useProjectStore((s) => s.project);
  const view = useProjectStore((s) => s.view);
  const setView = useProjectStore((s) => s.setView);
  const toggleBid = useProjectStore((s) => s.toggleBidPanel);
  const toggleSettings = useProjectStore((s) => s.toggleSettings);
  const toggleCmd = useProjectStore((s) => s.toggleCommandPalette);
  const updateMeta = useProjectStore((s) => s.updateProjectMeta);
  const newProject = useProjectStore((s) => s.newProject);
  const loadProject = useProjectStore((s) => s.loadProject);
  const pushToast = useProjectStore((s) => s.pushToast);
  const [exportOpen, setExportOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [forkOpen, setForkOpen] = useState(false);
  const [forking, setForking] = useState(false);
  const racksCount = project?.racks?.length ?? 0;
  const diagramsCount = project?.diagrams?.length ?? 0;

  if (!project) return null;

  const onExport = async (kind: "markup-pdf" | "bid-pdf" | "bid-xlsx" | "project-file") => {
    setExportOpen(false);
    if (kind === "project-file") {
      try {
        exportProjectFile(project);
        pushToast("success", "Project file saved — share the .knoxnet file to collaborate");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        pushToast("error", `Export failed: ${msg.slice(0, 160)}`);
      }
      return;
    }
    setExporting(true);
    try {
      if (kind === "markup-pdf") {
        await exportMarkupPdf(project);
        pushToast("success", "Branded markup PDF exported");
      } else if (kind === "bid-xlsx") {
        await exportBidXlsx(project);
        pushToast("success", "Bid spreadsheet exported");
      } else {
        await exportBidPdf(project);
        pushToast("success", "Bid PDF exported");
      }
    } catch (e) {
      // Surface the actual error so the user can troubleshoot rather than
      // staring at a generic "failed" toast. Full stack still goes to console.
      console.error("[export] failed:", e);
      const msg = e instanceof Error ? e.message : String(e);
      pushToast("error", `Export failed: ${msg.slice(0, 160)}`);
    } finally {
      setExporting(false);
    }
  };

  const onSave = async () => {
    try {
      await saveProject(project);
      pushToast("success", "Project saved");
    } catch (e) {
      console.error(e);
      pushToast("error", "Save failed");
    }
  };

  const onClose = () => {
    if (confirm("Close current project? Unsaved changes will remain in browser storage.")) {
      clearDocCache();
      useProjectStore.setState({ project: null, activeSheetId: null, selectedMarkupIds: [] });
    }
  };

  /**
   * Fork the currently-open project into a new editable copy. We save
   * the in-memory state first so the fork captures the user's latest
   * edits, then delegate to `duplicateProject` which clones the PDF
   * blobs under fresh keys. The new project is loaded immediately so
   * the user lands inside the fork, ready to edit.
   */
  const onForkSubmit = async (opts: { name: string; revision: string }) => {
    if (!project) return;
    setForking(true);
    try {
      await saveProject(project);
      const newId = await duplicateProject(project.id, opts);
      if (!newId) {
        pushToast("error", "Fork failed — could not create copy");
        return;
      }
      const cloned = await loadFromDb(newId);
      if (!cloned) {
        pushToast("error", "Fork created but could not be opened");
        return;
      }
      // Drop pdf.js doc cache so the fork's bytes load fresh — share-keys
      // mean cached entries from the source could otherwise leak through.
      clearDocCache();
      loadProject(cloned);
      setForkOpen(false);
      pushToast(
        "success",
        `Forked as "${opts.name}" · revision ${opts.revision}`,
      );
    } catch (e) {
      console.error("[fork] failed:", e);
      pushToast("error", "Fork failed — see console for details");
    } finally {
      setForking(false);
    }
  };

  return (
    <header className="h-12 px-2 flex items-center justify-between border-b border-white/5 bg-ink-800/80 backdrop-blur-md z-30 relative md:h-14 md:px-4">
      <div className="min-w-0 flex items-center gap-2 md:gap-6">
        <div className="hidden md:block">
          <Wordmark size="sm" showTagline={false} />
        </div>
        <div className="hidden h-6 w-px bg-white/10 md:block" />
        <div className="min-w-0 flex items-center gap-2">
          <Home className="hidden w-3.5 h-3.5 text-ink-400 sm:block" />
          {editingName ? (
            <input
              autoFocus
              defaultValue={project.meta.projectName}
              onBlur={(e) => {
                updateMeta({ projectName: e.target.value || "Untitled" });
                setEditingName(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setEditingName(false);
              }}
              className="input max-w-[44vw] md:max-w-xs"
            />
          ) : (
            <button
              onClick={() => setEditingName(true)}
              className="max-w-[48vw] truncate text-sm text-ink-100 font-medium hover:text-amber-knox transition-colors md:max-w-xs"
            >
              {project.meta.projectName}
            </button>
          )}
          {project.meta.projectNumber && (
            <span className="hidden chip lg:inline-flex">#{project.meta.projectNumber}</span>
          )}
        </div>
        <div className="hidden h-6 w-px bg-white/10 md:block" />
        {/* View tabs */}
        <div className="hidden md:inline-flex items-center bg-ink-700/60 border border-white/5 rounded-md p-0.5">
          <button
            onClick={() => setView("sheets")}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${view === "sheets" ? "bg-amber-knox/15 text-amber-knox" : "text-ink-300 hover:text-ink-100"}`}
          >
            <Files className="w-3.5 h-3.5" />
            Sheets
            <span className="ml-1 px-1 rounded text-[10px] font-mono bg-white/5">
              {project.sheets.length}
            </span>
          </button>
          <button
            onClick={() => setView("racks")}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${view === "racks" ? "bg-amber-knox/15 text-amber-knox" : "text-ink-300 hover:text-ink-100"}`}
          >
            <Server className="w-3.5 h-3.5" />
            Racks
            <span className="ml-1 px-1 rounded text-[10px] font-mono bg-white/5">
              {racksCount}
            </span>
          </button>
          <button
            onClick={() => setView("diagrams")}
            className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${view === "diagrams" ? "bg-amber-knox/15 text-amber-knox" : "text-ink-300 hover:text-ink-100"}`}
            title="Signal-flow / block diagrams"
          >
            <GitBranch className="w-3.5 h-3.5" />
            Diagrams
            <span className="ml-1 px-1 rounded text-[10px] font-mono bg-white/5">
              {diagramsCount}
            </span>
          </button>
        </div>
      </div>

      <div className="shrink-0 flex items-center gap-1 md:gap-2">
        <div className="hidden sm:block">
          <IngestProgress />
        </div>
        <div className="hidden md:block">
          <QualityToggle />
        </div>
        <div className="hidden md:block">
          <button
            onClick={toggleCmd}
            className="btn-ghost"
            title="Command palette (⌘K)"
          >
            <Command className="w-4 h-4" />
            <span className="font-mono text-xs">⌘K</span>
          </button>
        </div>
        <button onClick={onSave} className="btn-ghost" title="Save project">
          <Save className="w-4 h-4" />
        </button>
        <div className="hidden sm:block">
          <button
            onClick={() => setForkOpen(true)}
            className="btn-ghost"
            title="Save as new version (fork)"
            disabled={forking}
          >
            <GitFork className="w-4 h-4" />
          </button>
        </div>
        <div className="hidden sm:block">
          <button
            onClick={toggleBid}
            className="btn"
            title="Bid panel (⌘B)"
          >
            <Calculator className="w-4 h-4" />
            Bid
          </button>
        </div>
        <div className="relative">
          <button
            onClick={() => setExportOpen((v) => !v)}
            className="btn-primary"
            disabled={exporting}
          >
            <FileDown className="w-4 h-4" />
            <span className="hidden sm:inline">{exporting ? "Exporting…" : "Export"}</span>
            <ChevronDown className="hidden w-3 h-3 sm:block" />
          </button>
          {exportOpen && (
            <div className="absolute right-0 mt-2 w-64 panel rounded-lg overflow-hidden animate-scale-in z-40">
              <button
                onClick={() => onExport("markup-pdf")}
                className="w-full px-4 py-3 text-left hover:bg-white/5 flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-md bg-amber-knox/15 text-amber-knox flex items-center justify-center">
                  <FileDown className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-ink-50">
                    Branded Markup PDF
                  </div>
                  <div className="text-xs text-ink-400">
                    All sheets · title block + legend
                  </div>
                </div>
              </button>
              <div className="divider" />
              <button
                onClick={() => onExport("bid-pdf")}
                className="w-full px-4 py-3 text-left hover:bg-white/5 flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-md bg-signal-green/15 text-signal-green flex items-center justify-center">
                  <Calculator className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-ink-50">
                    Bid Document (PDF)
                  </div>
                  <div className="text-xs text-ink-400">
                    Branded estimate with rollups
                  </div>
                </div>
              </button>
              <button
                onClick={() => onExport("bid-xlsx")}
                className="w-full px-4 py-3 text-left hover:bg-white/5 flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-md bg-signal-blue/15 text-signal-blue flex items-center justify-center">
                  <Calculator className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-ink-50">
                    Bid Workbook (XLSX)
                  </div>
                  <div className="text-xs text-ink-400">
                    Devices, cables, totals — editable
                  </div>
                </div>
              </button>
              <div className="divider" />
              <button
                onClick={() => onExport("project-file")}
                className="w-full px-4 py-3 text-left hover:bg-white/5 flex items-center gap-3"
              >
                <div className="w-8 h-8 rounded-md bg-signal-green/15 text-signal-green flex items-center justify-center">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-sm font-medium text-ink-50">
                    Project File (.knoxnet)
                  </div>
                  <div className="text-xs text-ink-400">
                    All sheets + live markups — share to collaborate
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>
        <button onClick={toggleSettings} className="btn-ghost" title="Settings (⌘,)">
          <Settings2 className="w-4 h-4" />
        </button>
        <button onClick={onClose} className="hidden btn-ghost text-ink-400 sm:inline-flex" title="Close project">
          ×
        </button>
      </div>

      {forkOpen && (
        <ForkProjectDialog
          sourceName={project.meta.projectName}
          sourceRevision={project.meta.revision || "0"}
          actionLabel="Save as Version"
          onSubmit={onForkSubmit}
          onClose={() => setForkOpen(false)}
        />
      )}
    </header>
  );
}
