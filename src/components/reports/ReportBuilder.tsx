import { useMemo, useState } from "react";
import {
  useProjectStore,
  type ReportColumn,
  type ReportFilter,
  type ReportFormat,
  type ReportScope,
  type ReportTemplate,
} from "../../store/projectStore";
import { runReport } from "../../reports/engine";
import { FIELD_CATALOG, SCOPE_LABEL, fieldLabel } from "../../reports/fieldCatalog";
import { getByPath } from "../../reports/paths";
import { formatCell } from "../../reports/engine";
import {
  X,
  Plus,
  Save,
  Play,
  ArrowUp,
  ArrowDown,
  Trash2,
  Filter,
  Columns3,
  Eye,
  CheckSquare,
  Square,
} from "lucide-react";

const ALL_FORMATS: ReportFormat[] = ["pdf", "xlsx", "csv", "json", "md", "html"];
const ALL_SCOPES: ReportScope[] = [
  "devices",
  "cables",
  "connections",
  "areaSchedules",
  "racks",
  "rackPlacements",
  "sheets",
  "ports",
];
const FILTER_OPS: Array<{ value: ReportFilter["op"]; label: string }> = [
  { value: "eq", label: "equals" },
  { value: "neq", label: "not equals" },
  { value: "in", label: "in list" },
  { value: "contains", label: "contains" },
  { value: "startsWith", label: "starts with" },
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
  { value: "exists", label: "is set" },
  { value: "missing", label: "is empty" },
  { value: "regex", label: "matches regex" },
];

/**
 * Full-screen modal for editing one report template. Three-pane layout:
 *   • Left  — scope, filters, group, sort, format selection.
 *   • Mid   — column picker (drag-to-reorder via up/down buttons).
 *   • Right — live preview of the first 50 rows for the current draft.
 *
 * The user can save changes, or run the report straight from here.
 */
export function ReportBuilder({
  template,
  onSave,
  onClose,
  onRun,
}: {
  template: ReportTemplate;
  onSave: (next: ReportTemplate) => void;
  onClose: () => void;
  onRun: (next: ReportTemplate) => void;
}) {
  const project = useProjectStore((s) => s.project);
  const [draft, setDraft] = useState<ReportTemplate>(template);

  const result = useMemo(() => {
    if (!project) return null;
    try {
      return runReport(project, draft);
    } catch (e) {
      console.error("[reports] preview failed:", e);
      return null;
    }
  }, [project, draft]);

  const scopeFields = FIELD_CATALOG[draft.scope];

  const patch = (p: Partial<ReportTemplate>) => setDraft({ ...draft, ...p });

  const onAddColumn = (field: string) => {
    if (!field) return;
    if (draft.columns.some((c) => c.field === field)) return;
    patch({ columns: [...draft.columns, { field }] });
  };

  const moveColumn = (i: number, dir: -1 | 1) => {
    const next = draft.columns.slice();
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    patch({ columns: next });
  };

  const removeColumn = (i: number) => {
    const next = draft.columns.slice();
    next.splice(i, 1);
    patch({ columns: next });
  };

  const setColumnHeader = (i: number, header: string) => {
    const next = draft.columns.slice();
    next[i] = { ...next[i], header };
    patch({ columns: next });
  };

  const addFilter = () => {
    const first = scopeFields[0]?.path ?? "id";
    patch({ filters: [...draft.filters, { field: first, op: "exists" }] });
  };
  const updateFilter = (i: number, f: ReportFilter) => {
    const next = draft.filters.slice();
    next[i] = f;
    patch({ filters: next });
  };
  const removeFilter = (i: number) => {
    const next = draft.filters.slice();
    next.splice(i, 1);
    patch({ filters: next });
  };

  const toggleFormat = (fmt: ReportFormat) => {
    const has = draft.formats.includes(fmt);
    patch({
      formats: has
        ? draft.formats.filter((f) => f !== fmt)
        : [...draft.formats, fmt],
    });
  };

  const previewRows = useMemo(() => {
    if (!result) return [] as Array<{ groupLabel: string; row: Record<string, unknown> }>;
    const out: Array<{ groupLabel: string; row: Record<string, unknown> }> = [];
    for (const g of result.groups) {
      for (const row of g.rows) {
        if (out.length >= 50) break;
        out.push({ groupLabel: g.key.join(" · "), row });
      }
      if (out.length >= 50) break;
    }
    return out;
  }, [result]);

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-stretch">
      <div className="flex-1 flex flex-col bg-ink-900/95 border border-white/10 m-4 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/10 bg-ink-800/60">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <input
              className="input flex-1 text-sm font-medium"
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="Report name"
            />
            <input
              className="input flex-1 text-xs"
              value={draft.description ?? ""}
              onChange={(e) => patch({ description: e.target.value || undefined })}
              placeholder="Short description (optional)"
            />
          </div>
          <div className="flex items-center gap-2 ml-3">
            <button
              onClick={() => onRun(draft)}
              className="btn-ghost text-signal-green hover:text-signal-green"
              title="Run & download with current settings"
            >
              <Play className="w-3.5 h-3.5" />
              <span className="text-xs">Run</span>
            </button>
            <button
              onClick={() => onSave(draft)}
              className="btn-primary"
              title="Save changes"
            >
              <Save className="w-3.5 h-3.5" />
              Save
            </button>
            <button onClick={onClose} className="btn-ghost" title="Close without saving">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Three panes */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: scope + filters + group + sort + formats */}
          <div className="w-72 shrink-0 overflow-y-auto border-r border-white/10 p-3 space-y-4">
            <Section icon={<Filter className="w-3.5 h-3.5" />} title="Scope">
              <select
                className="input w-full text-xs"
                value={draft.scope}
                onChange={(e) =>
                  patch({
                    scope: e.target.value as ReportScope,
                    // Resetting columns when scope changes avoids dangling
                    // field paths the new scope doesn't have.
                    columns: [],
                    filters: [],
                    groupBy: [],
                  })
                }
              >
                {ALL_SCOPES.map((s) => (
                  <option key={s} value={s}>
                    {SCOPE_LABEL[s]}
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-ink-400 mt-1.5 leading-snug">
                Each row in this report = one {SCOPE_LABEL[draft.scope].toLowerCase().replace(/s$/, "")}.
              </p>
            </Section>

            <Section icon={<Filter className="w-3.5 h-3.5" />} title="Filters">
              <div className="space-y-1.5">
                {draft.filters.map((f, i) => (
                  <FilterEditor
                    key={i}
                    filter={f}
                    fields={scopeFields}
                    onChange={(nf) => updateFilter(i, nf)}
                    onRemove={() => removeFilter(i)}
                  />
                ))}
                <button
                  onClick={addFilter}
                  className="btn-ghost w-full justify-center text-xs"
                >
                  <Plus className="w-3 h-3" /> Add filter
                </button>
              </div>
            </Section>

            <Section icon={<Filter className="w-3.5 h-3.5" />} title="Group by">
              <FieldPicker
                fields={scopeFields}
                value={draft.groupBy?.[0] ?? ""}
                placeholder="— none —"
                onChange={(v) => patch({ groupBy: v ? [v] : [] })}
              />
              <p className="text-[10px] text-ink-400 mt-1 leading-snug">
                Bucket rows by this field (e.g. "by switch", "by VLAN").
              </p>
            </Section>

            <Section icon={<Filter className="w-3.5 h-3.5" />} title="Sort by">
              <div className="flex items-center gap-1">
                <FieldPicker
                  fields={scopeFields}
                  value={draft.sortBy?.[0]?.field ?? ""}
                  placeholder="— default —"
                  onChange={(v) =>
                    patch({
                      sortBy: v
                        ? [{ field: v, dir: draft.sortBy?.[0]?.dir ?? "asc" }]
                        : [],
                    })
                  }
                  className="flex-1"
                />
                <button
                  onClick={() => {
                    const cur = draft.sortBy?.[0];
                    if (!cur) return;
                    patch({
                      sortBy: [{ field: cur.field, dir: cur.dir === "asc" ? "desc" : "asc" }],
                    });
                  }}
                  className="btn-ghost p-1 text-amber-knox shrink-0"
                  title="Toggle direction"
                >
                  {draft.sortBy?.[0]?.dir === "desc" ? (
                    <ArrowDown className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </Section>

            <Section icon={<Save className="w-3.5 h-3.5" />} title="Output formats">
              <div className="grid grid-cols-3 gap-1.5">
                {ALL_FORMATS.map((fmt) => {
                  const on = draft.formats.includes(fmt);
                  return (
                    <button
                      key={fmt}
                      onClick={() => toggleFormat(fmt)}
                      className={`flex items-center gap-1 px-2 py-1.5 rounded border text-xs uppercase font-mono ${
                        on
                          ? "border-amber-knox/60 bg-amber-knox/10 text-amber-knox"
                          : "border-white/10 bg-ink-900/40 text-ink-300 hover:text-ink-100"
                      }`}
                    >
                      {on ? <CheckSquare className="w-3 h-3" /> : <Square className="w-3 h-3" />}
                      {fmt}
                    </button>
                  );
                })}
              </div>
            </Section>
          </div>

          {/* Mid: columns */}
          <div className="w-80 shrink-0 overflow-y-auto border-r border-white/10 p-3 space-y-3">
            <Section icon={<Columns3 className="w-3.5 h-3.5" />} title="Columns">
              <p className="text-[10px] text-ink-400 mb-2 leading-snug">
                Pick which fields show up in the output. Order = display
                order. Click a header to rename for this report only.
              </p>
              <div className="space-y-1">
                {draft.columns.map((c, i) => (
                  <div
                    key={`${c.field}-${i}`}
                    className="flex items-center gap-1 px-2 py-1.5 rounded bg-ink-900/40 border border-white/5"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] text-ink-400 font-mono truncate" title={c.field}>
                        {c.field}
                      </div>
                      <input
                        className="input text-xs w-full mt-0.5"
                        value={c.header ?? ""}
                        placeholder={fieldLabel(draft.scope, c.field)}
                        onChange={(e) => setColumnHeader(i, e.target.value)}
                      />
                    </div>
                    <button
                      onClick={() => moveColumn(i, -1)}
                      disabled={i === 0}
                      className="btn-ghost p-0.5 text-ink-400 hover:text-amber-knox disabled:opacity-30"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => moveColumn(i, 1)}
                      disabled={i === draft.columns.length - 1}
                      className="btn-ghost p-0.5 text-ink-400 hover:text-amber-knox disabled:opacity-30"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => removeColumn(i)}
                      className="btn-ghost p-0.5 text-ink-400 hover:text-signal-red"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-3">
                <div className="text-[10px] font-mono text-ink-500 uppercase tracking-wider mb-1">
                  Add a field
                </div>
                <select
                  className="input w-full text-xs"
                  value=""
                  onChange={(e) => {
                    onAddColumn(e.target.value);
                    e.target.value = "";
                  }}
                >
                  <option value="">— pick a field —</option>
                  {scopeFields
                    .filter((f) => !draft.columns.some((c) => c.field === f.path))
                    .map((f) => (
                      <option key={f.path} value={f.path}>
                        {f.label} · {f.path}
                      </option>
                    ))}
                </select>
              </div>
            </Section>
          </div>

          {/* Right: live preview */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
              <div className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-amber-knox" />
                <span className="text-xs uppercase font-mono tracking-wider text-ink-200">
                  Live preview
                </span>
              </div>
              <div className="text-[10px] font-mono text-ink-400">
                {result ? `${result.rowCount} total` : "—"}
                {result && previewRows.length < result.rowCount && (
                  <span> · showing {previewRows.length}</span>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {result && previewRows.length > 0 ? (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-ink-800/95 backdrop-blur z-10">
                    <tr>
                      {(draft.groupBy?.length ?? 0) > 0 && (
                        <th className="text-left p-2 border-b border-white/10 text-ink-300 font-mono uppercase text-[10px]">
                          Group
                        </th>
                      )}
                      {result.columns.map((c) => (
                        <th
                          key={c.field}
                          className="text-left p-2 border-b border-white/10 text-ink-200 font-medium"
                          title={c.field}
                        >
                          {c.header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((entry, i) => (
                      <tr
                        key={i}
                        className="border-b border-white/5 hover:bg-white/5"
                      >
                        {(draft.groupBy?.length ?? 0) > 0 && (
                          <td className="p-2 text-amber-knox font-mono text-[10px] align-top">
                            {entry.groupLabel}
                          </td>
                        )}
                        {result.columns.map((c) => (
                          <td
                            key={c.field}
                            className="p-2 text-ink-100 align-top max-w-xs truncate"
                            title={formatCell(getByPath(entry.row, c.field), c.format)}
                          >
                            {formatCell(getByPath(entry.row, c.field), c.format) || (
                              <span className="text-ink-500">—</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-ink-400 text-sm p-8 text-center">
                  No rows match the current filters.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-amber-knox">{icon}</span>
        <span className="label">{title}</span>
      </div>
      {children}
    </div>
  );
}

function FieldPicker({
  fields,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  fields: Array<{ path: string; label: string }>;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <select
      className={`input text-xs ${className || "w-full"}`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">{placeholder ?? "— pick —"}</option>
      {fields.map((f) => (
        <option key={f.path} value={f.path}>
          {f.label}
        </option>
      ))}
    </select>
  );
}

function FilterEditor({
  filter,
  fields,
  onChange,
  onRemove,
}: {
  filter: ReportFilter;
  fields: Array<{ path: string; label: string; type: string }>;
  onChange: (f: ReportFilter) => void;
  onRemove: () => void;
}) {
  const needsValue = !["exists", "missing"].includes(filter.op);
  return (
    <div className="rounded border border-white/5 bg-ink-900/40 p-1.5 space-y-1">
      <div className="flex items-center gap-1">
        <select
          className="input text-[11px] flex-1"
          value={filter.field}
          onChange={(e) => onChange({ ...filter, field: e.target.value })}
        >
          {fields.map((f) => (
            <option key={f.path} value={f.path}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          onClick={onRemove}
          className="btn-ghost p-0.5 text-ink-400 hover:text-signal-red"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="flex items-center gap-1">
        <select
          className="input text-[11px]"
          value={filter.op}
          onChange={(e) =>
            onChange({ ...filter, op: e.target.value as ReportFilter["op"] })
          }
        >
          {FILTER_OPS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {needsValue && (
          <input
            className="input text-[11px] flex-1"
            placeholder="value"
            value={
              filter.value == null
                ? ""
                : Array.isArray(filter.value)
                  ? filter.value.join(",")
                  : String(filter.value)
            }
            onChange={(e) => {
              const raw = e.target.value;
              const v =
                filter.op === "in"
                  ? raw
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean)
                  : raw;
              onChange({ ...filter, value: v });
            }}
          />
        )}
      </div>
    </div>
  );
}
