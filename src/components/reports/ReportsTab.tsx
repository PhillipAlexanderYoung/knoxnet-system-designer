import { useState } from "react";
import { useProjectStore, type ReportTemplate } from "../../store/projectStore";
import { runAndDownload } from "../../reports/run";
import { SCOPE_LABEL } from "../../reports/fieldCatalog";
import {
  Plus,
  Copy,
  Trash2,
  Play,
  Pencil,
  FileText,
} from "lucide-react";
import { ReportBuilder } from "./ReportBuilder";
import { buildStarterTemplates } from "../../reports/starterTemplates";

/**
 * Reports tab in the LeftRail — lists every saved report template
 * with quick "Run" / "Edit" / "Duplicate" / "Delete" actions, plus a
 * "New report" button that opens the builder with a blank template.
 */
export function ReportsTab() {
  const project = useProjectStore((s) => s.project);
  const addReport = useProjectStore((s) => s.addReport);
  const updateReport = useProjectStore((s) => s.updateReport);
  const removeReport = useProjectStore((s) => s.removeReport);
  const duplicateReport = useProjectStore((s) => s.duplicateReport);
  const pushToast = useProjectStore((s) => s.pushToast);
  const [editing, setEditing] = useState<ReportTemplate | null>(null);

  if (!project) return null;
  const reports = project.reports ?? [];

  const onNew = () => {
    const id = Math.random().toString(36).slice(2, 10);
    const fresh: ReportTemplate = {
      id,
      name: "Untitled Report",
      scope: "devices",
      filters: [],
      columns: [{ field: "tag" }],
      formats: ["csv", "pdf"],
    };
    addReport(fresh);
    setEditing(fresh);
  };

  const onRun = async (tpl: ReportTemplate) => {
    if (!project) return;
    try {
      const result = await runAndDownload(project, tpl);
      pushToast(
        "success",
        `Generated "${tpl.name}" — ${result.rowCount} row${result.rowCount === 1 ? "" : "s"}, ${tpl.formats.length} file${tpl.formats.length === 1 ? "" : "s"}`,
      );
    } catch (e) {
      console.error("[reports] run failed:", e);
      pushToast(
        "error",
        e instanceof Error ? e.message : "Failed to generate report",
      );
    }
  };

  const onRestoreStarters = () => {
    if (
      !confirm(
        "Restore the bundled starter templates? They'll appear alongside your existing reports.",
      )
    )
      return;
    for (const tpl of buildStarterTemplates()) addReport(tpl);
    pushToast("success", "Starter templates added");
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="label">Custom Reports</span>
        <span className="text-[10px] font-mono text-ink-400">
          {reports.length}
        </span>
      </div>
      <p className="text-[10px] text-ink-400 leading-relaxed">
        Save filtered views of your devices, cables, racks, and ports as
        custom reports. Generate as PDF / XLSX / CSV / JSON / MD / HTML
        in one click.
      </p>
      <button onClick={onNew} className="btn w-full justify-center">
        <Plus className="w-3.5 h-3.5" />
        New Report
      </button>

      <div className="space-y-1.5">
        {reports.length === 0 && (
          <div className="text-xs text-ink-400 text-center py-6">
            No reports yet. Click "New Report" to build one.
            <button
              onClick={onRestoreStarters}
              className="btn-ghost block mx-auto mt-2 text-[11px]"
            >
              Restore starter templates
            </button>
          </div>
        )}
        {reports.map((tpl) => (
          <div
            key={tpl.id}
            className="group rounded-md border border-white/5 bg-ink-900/30 p-2 hover:border-white/20 transition-colors"
          >
            <div className="flex items-start gap-1.5">
              <FileText className="w-3.5 h-3.5 text-amber-knox shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-ink-100 font-medium truncate" title={tpl.name}>
                  {tpl.name}
                </div>
                <div className="text-[10px] text-ink-400 font-mono">
                  {SCOPE_LABEL[tpl.scope]} · {tpl.columns.length} col{tpl.columns.length === 1 ? "" : "s"} ·{" "}
                  {tpl.formats.join("/")}
                </div>
              </div>
            </div>
            {tpl.description && (
              <p className="text-[10px] text-ink-400 mt-1 leading-snug line-clamp-2">
                {tpl.description}
              </p>
            )}
            <div className="flex items-center gap-1 mt-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onRun(tpl)}
                className="btn-ghost flex-1 justify-center text-[11px] text-signal-green hover:text-signal-green"
                title="Run and download"
              >
                <Play className="w-3 h-3" /> Run
              </button>
              <button
                onClick={() => setEditing(tpl)}
                className="btn-ghost text-ink-300 hover:text-amber-knox p-1"
                title="Edit"
              >
                <Pencil className="w-3 h-3" />
              </button>
              <button
                onClick={() => duplicateReport(tpl.id)}
                className="btn-ghost text-ink-300 hover:text-amber-knox p-1"
                title="Duplicate"
              >
                <Copy className="w-3 h-3" />
              </button>
              <button
                onClick={() => {
                  if (confirm(`Delete "${tpl.name}"?`)) removeReport(tpl.id);
                }}
                className="btn-ghost text-ink-300 hover:text-signal-red p-1"
                title="Delete"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <ReportBuilder
          template={editing}
          onSave={(next) => {
            updateReport(next.id, next);
            setEditing(null);
          }}
          onClose={() => setEditing(null)}
          onRun={(next) => onRun(next)}
        />
      )}
    </div>
  );
}
