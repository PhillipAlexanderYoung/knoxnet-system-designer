import { useEffect, useRef, useState } from "react";
import { useProjectStore, type MarkupKind } from "../store/projectStore";
import { ingestPdfFile } from "../lib/ingest";
import { enqueueIngest } from "../lib/ingestQueue";
import { renderPageToCanvas, getCachedDoc } from "../lib/pdfjs";
import { QUALITY_PROFILES } from "../lib/quality";
import {
  FilePlus,
  Layers,
  Lock,
  LockOpen,
  Eye,
  EyeOff,
  Trash2,
  Files,
  Eraser,
  Wand2,
  RefreshCcw,
  FileText,
  ListChecks,
} from "lucide-react";
import { categoryColor } from "../brand/tokens";

type Tab = "sheets" | "layers";

export function LeftRail() {
  const project = useProjectStore((s) => s.project);
  const activeSheetId = useProjectStore((s) => s.activeSheetId);
  const setActiveSheet = useProjectStore((s) => s.setActiveSheet);
  const addSheet = useProjectStore((s) => s.addSheet);
  const removeSheet = useProjectStore((s) => s.removeSheet);
  const layers = useProjectStore((s) => s.layers);
  const toggleLayer = useProjectStore((s) => s.toggleLayer);
  const setLayerLocked = useProjectStore((s) => s.setLayerLocked);
  const pushToast = useProjectStore((s) => s.pushToast);
  const [tab, setTab] = useState<Tab>("sheets");

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    let added = 0;
    await Promise.all(
      arr.map((f) =>
        enqueueIngest(async () => {
          try {
            const sheet = await ingestPdfFile(f);
            addSheet(sheet);
            added++;
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            console.error("[ingest]", f.name, e);
            pushToast("error", `${f.name}: ${msg}`);
          }
        }),
      ),
    );
    if (added > 0) pushToast("success", `Added ${added} sheet${added === 1 ? "" : "s"}`);
  };

  return (
    <aside className="w-60 shrink-0 border-r border-white/5 bg-ink-800/60 backdrop-blur-md flex flex-col">
      <div className="flex border-b border-white/5">
        <button
          onClick={() => setTab("sheets")}
          className={`flex-1 px-3 py-2.5 text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 ${tab === "sheets" ? "text-amber-knox border-b-2 border-amber-knox" : "text-ink-300 hover:text-ink-100"}`}
        >
          <Files className="w-3.5 h-3.5" />
          Sheets
        </button>
        <button
          onClick={() => setTab("layers")}
          className={`flex-1 px-3 py-2.5 text-xs font-mono uppercase tracking-wider flex items-center justify-center gap-2 ${tab === "layers" ? "text-amber-knox border-b-2 border-amber-knox" : "text-ink-300 hover:text-ink-100"}`}
        >
          <Layers className="w-3.5 h-3.5" />
          Layers
        </button>
      </div>

      {tab === "sheets" && (
        <div className="flex-1 overflow-y-auto">
          <div className="p-3">
            <label className="btn w-full justify-center cursor-pointer">
              <FilePlus className="w-4 h-4" />
              Add PDF
              <input
                type="file"
                accept="application/pdf"
                multiple
                className="hidden"
                onChange={(e) => onPickFiles(e.target.files)}
              />
            </label>
          </div>
          <div className="space-y-2 px-3 pb-3">
            {project?.sheets.map((sheet, i) => (
              <SheetThumb
                key={sheet.id}
                index={i + 1}
                sheet={sheet}
                active={sheet.id === activeSheetId}
                onClick={() => setActiveSheet(sheet.id)}
                onDelete={() => {
                  if (confirm(`Remove sheet "${sheet.name}"?`)) removeSheet(sheet.id);
                }}
              />
            ))}
            {project?.sheets.length === 0 && (
              <div className="text-xs text-ink-400 text-center py-8">
                No sheets yet.
                <br />
                Click "Add PDF" to get started.
              </div>
            )}
          </div>
          {project && project.sheets.length > 0 && <BrandingPanel />}
        </div>
      )}

      {tab === "layers" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="px-2 pb-1 label">Editor Layers</div>
          <p className="px-2 pb-1.5 text-[10px] text-ink-400 leading-relaxed">
            Hide a layer to declutter the canvas. Layer visibility only
            affects the editor — toggle export visibility per markup type
            in the panel below.
          </p>
          {layers.map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5"
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: categoryColor[l.id] ?? "#94A0B8" }}
              />
              <span
                className={`flex-1 text-sm ${l.visible ? "text-ink-100" : "text-ink-500 line-through"}`}
              >
                {l.label}
              </span>
              <button
                onClick={() => toggleLayer(l.id)}
                className="text-ink-400 hover:text-ink-100"
                title={l.visible ? "Hide" : "Show"}
              >
                {l.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setLayerLocked(l.id, !l.locked)}
                className="text-ink-400 hover:text-ink-100"
                title={l.locked ? "Unlock" : "Lock"}
              >
                {l.locked ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  <LockOpen className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ))}
          <ExportVisibilityPanel />
        </div>
      )}
    </aside>
  );
}

function SheetThumb({
  index,
  sheet,
  active,
  onClick,
  onDelete,
}: {
  index: number;
  sheet: ReturnType<typeof useProjectStore.getState>["project"] extends infer P
    ? P extends { sheets: infer S }
      ? S extends Array<infer T>
        ? T
        : never
      : never
    : never;
  active: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [visible, setVisible] = useState(false);
  const qualityMode = useProjectStore((s) => s.qualityMode);

  // Only render when scrolled into view (lazy thumbnail)
  useEffect(() => {
    if (!wrapperRef.current) return;
    const el = wrapperRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Render thumb when visible (or when sheet becomes active)
  useEffect(() => {
    if (rendered) return;
    if (!visible && !active) return;
    let cancelled = false;
    (async () => {
      try {
        if (!sheet.pdfBytes) return;
        const profile = QUALITY_PROFILES[qualityMode];
        // Queue thumbnail render so it doesn't fight ingest for CPU
        await enqueueIngest(async () => {
          if (!sheet.pdfBytes) return;
          const doc = await getCachedDoc(sheet.pdfBytes);
          const page = await doc.getPage(1);
          const viewport = page.getViewport({ scale: 1 });
          const targetW = 200;
          const scale = targetW / viewport.width;
          const { canvas } = await renderPageToCanvas(
            page,
            scale * profile.thumbScaleMultiplier,
          );
          if (cancelled || !ref.current) return;
          const ctx = ref.current.getContext("2d");
          if (!ctx) return;
          ref.current.width = canvas.width;
          ref.current.height = canvas.height;
          ctx.drawImage(canvas, 0, 0);
          setRendered(true);
        });
      } catch (e) {
        console.error("thumb render", e);
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sheet.pdfBytes, visible, active, rendered, qualityMode]);

  return (
    <div
      ref={wrapperRef}
      className={`group relative rounded-md overflow-hidden border transition-all cursor-pointer ${active ? "border-amber-knox shadow-glow" : "border-white/5 hover:border-white/20"}`}
      onClick={onClick}
    >
      <div className="aspect-[3/2] bg-ink-900 relative">
        <canvas ref={ref} className="absolute inset-0 w-full h-full object-contain" />
        {!rendered && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-3 h-3 rounded-full bg-ink-500 animate-pulse-glow" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-500">
            preview failed
          </div>
        )}
      </div>
      <div className="px-2 py-1.5 bg-ink-800/90">
        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] text-amber-knox">
            {sheet.sheetNumber || `S-${String(index).padStart(2, "0")}`}
          </span>
          <span className="text-[11px] text-ink-200 truncate flex-1" title={sheet.name}>
            {sheet.name}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[10px] text-ink-500 font-mono">
            {sheet.markups.length} markup{sheet.markups.length === 1 ? "" : "s"}
          </span>
          {sheet.calibration && (
            <span className="text-[10px] text-signal-green font-mono">●  cal</span>
          )}
        </div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        className="absolute top-1 right-1 w-6 h-6 rounded bg-ink-900/80 text-ink-400 hover:text-signal-red opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

/**
 * Per-sheet branding controls. The user's title block + device legend
 * each live as draggable overlays on the canvas (see `BrandPreview`); this
 * panel just surfaces the current state and provides reset-to-default
 * shortcuts for when the user wants to start over. The "Draw custom
 * mask…" button stays here because masks are the cover-up for the
 * original author's stamp/logo and are conceptually the same family of
 * tool — but they're independent of where the brand elements sit.
 */
function BrandingPanel() {
  const project = useProjectStore((s) => s.project);
  const activeSheetId = useProjectStore((s) => s.activeSheetId);
  const setActiveTool = useProjectStore((s) => s.setActiveTool);
  const setTitleBlockBounds = useProjectStore((s) => s.setTitleBlockBounds);
  const setLegendBounds = useProjectStore((s) => s.setLegendBounds);
  const setSelectedBrand = useProjectStore((s) => s.setSelectedBrand);
  const openPagePreview = useProjectStore((s) => s.openPagePreview);
  const pushToast = useProjectStore((s) => s.pushToast);

  if (!project) return null;
  const sheet = project.sheets.find((s) => s.id === activeSheetId);
  const masks = sheet?.maskRegions ?? [];
  const tbPlaced = !!sheet?.titleBlockBounds;
  const lgPlaced = !!sheet?.legendBounds;

  const onResetTitleBlock = () => {
    if (!sheet) return;
    setTitleBlockBounds(sheet.id, undefined);
    pushToast("info", "Title block reset to default position");
  };

  const onResetLegend = () => {
    if (!sheet) return;
    setLegendBounds(sheet.id, undefined);
    pushToast("info", "Legend reset to default position");
  };

  const onResetAll = () => {
    let n = 0;
    for (const sh of project.sheets) {
      setTitleBlockBounds(sh.id, undefined);
      setLegendBounds(sh.id, undefined);
      n++;
    }
    pushToast("success", `Reset branding on ${n} sheet${n === 1 ? "" : "s"}`);
  };

  return (
    <div className="border-t border-white/5 p-3 space-y-2">
      {/* Standalone export pages — clickable thumbnails open a live ghost
          preview modal so the user can see what each page will look like
          before exporting. */}
      <div className="flex items-center gap-1.5">
        <FileText className="w-3.5 h-3.5 text-amber-knox" />
        <div className="label">Export Pages</div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <PagePreviewThumb
          title="Cover"
          icon={<FileText className="w-3 h-3" />}
          orientation="landscape"
          onClick={() => openPagePreview("cover")}
        />
        <PagePreviewThumb
          title="BOM"
          icon={<ListChecks className="w-3 h-3" />}
          orientation="landscape"
          onClick={() => openPagePreview("bom")}
        />
      </div>
      <p className="text-[10px] text-ink-400 leading-relaxed">
        Click a page to preview it as it'll print, including the active
        theme, wordmark, logo, and accent. Toggle dark/light right inside
        the preview.
      </p>

      <div className="h-px bg-white/5 my-2" />

      <div className="flex items-center gap-1.5">
        <Wand2 className="w-3.5 h-3.5 text-amber-knox" />
        <div className="label">Sheet Branding</div>
      </div>
      <p className="text-[10px] text-ink-400 leading-relaxed">
        Click the title block or legend on the canvas, then drag to reposition
        or use the handles to resize. Use the eye toggle on the toolbar to
        hide the live preview.
      </p>
      <button
        onClick={() => {
          setActiveTool("select");
          setSelectedBrand("titleblock");
        }}
        disabled={!sheet}
        className="btn-ghost w-full justify-start text-xs disabled:opacity-50"
        title="Select the brand title block on the canvas"
      >
        <Wand2 className="w-3.5 h-3.5" />
        Select title block
      </button>
      <button
        onClick={() => {
          setActiveTool("select");
          setSelectedBrand("legend");
        }}
        disabled={!sheet}
        className="btn-ghost w-full justify-start text-xs disabled:opacity-50"
        title="Select the device legend on the canvas"
      >
        <Wand2 className="w-3.5 h-3.5" />
        Select legend
      </button>
      <button
        onClick={onResetTitleBlock}
        disabled={!sheet || !tbPlaced}
        className="btn-ghost w-full justify-start text-xs disabled:opacity-50"
        title="Revert title block to the default bottom-right position"
      >
        <RefreshCcw className="w-3.5 h-3.5" />
        Reset title block position
      </button>
      <button
        onClick={onResetLegend}
        disabled={!sheet || !lgPlaced}
        className="btn-ghost w-full justify-start text-xs disabled:opacity-50"
        title="Revert legend to the default top-right position"
      >
        <RefreshCcw className="w-3.5 h-3.5" />
        Reset legend position
      </button>
      <button
        onClick={onResetAll}
        className="btn-ghost w-full justify-start text-xs"
        title="Clear title block + legend positions on every sheet"
      >
        <RefreshCcw className="w-3.5 h-3.5" />
        Reset on all sheets
      </button>
      <div className="h-px bg-white/5 my-1" />
      <button
        onClick={() => setActiveTool("mask")}
        className="btn-ghost w-full justify-start text-xs"
        title="Drag a cover-up rectangle to hide original logos / stamps (X)"
      >
        <Eraser className="w-3.5 h-3.5" />
        Draw cover-up mask…
      </button>
      {sheet && (
        <div className="text-[10px] font-mono text-ink-400 leading-relaxed pt-1">
          <div>
            Title block:{" "}
            <span className={tbPlaced ? "text-amber-knox" : "text-ink-200"}>
              {tbPlaced ? "custom position" : "default"}
            </span>
            {" · "}
            Legend:{" "}
            <span className={lgPlaced ? "text-amber-knox" : "text-ink-200"}>
              {lgPlaced ? "custom" : "default"}
            </span>
          </div>
          <div className="mt-0.5">
            Masks on this sheet:{" "}
            <span className="text-ink-200">{masks.length}</span>
          </div>
          {sheet.bgColor && (
            <div className="flex items-center gap-1.5 mt-1">
              <span>Page bg:</span>
              <span
                className="inline-block w-3 h-3 rounded border border-white/15"
                style={{ background: sheet.bgColor }}
              />
              <span className="text-ink-200">{sheet.bgColor}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Small thumbnail card for an export page (Cover, BOM). Click opens
 *  the full ghost preview modal. The thumbnail uses the live brand
 *  accent so the user sees their branding even before opening the
 *  preview. */
function PagePreviewThumb({
  title,
  icon,
  orientation,
  onClick,
}: {
  title: string;
  icon: React.ReactNode;
  orientation: "landscape" | "portrait";
  onClick: () => void;
}) {
  // Cheap visual hint of a "page" — landscape rect with the brand accent
  // strip on top so the thumbnail reads as an export page at a glance.
  const aspect = orientation === "landscape" ? "4 / 3" : "3 / 4";
  return (
    <button
      onClick={onClick}
      className="group relative rounded-md border border-white/10 bg-ink-900/60 hover:border-amber-knox/60 hover:bg-white/5 transition-all overflow-hidden flex flex-col"
      style={{ aspectRatio: aspect }}
      title={`Preview ${title} page`}
    >
      <div className="h-1 w-full bg-amber-knox" />
      <div className="flex-1 flex flex-col items-center justify-center gap-1 px-2">
        <span className="text-ink-300 group-hover:text-amber-knox transition-colors">
          {icon}
        </span>
        <span className="text-[10px] font-medium text-ink-200 group-hover:text-ink-50">
          {title}
        </span>
      </div>
    </button>
  );
}

/** Per-markup-kind export visibility control. Lists every kind of
 *  markup the user might have drawn, with a live count and a
 *  show/hide toggle. Toggling here doesn't touch the editor — it only
 *  controls what gets drawn into the exported PDF. Kinds with zero
 *  instances on any sheet still show so the user can pre-toggle them
 *  before drawing. */
function ExportVisibilityPanel() {
  const project = useProjectStore((s) => s.project);
  const setExportKindVisible = useProjectStore((s) => s.setExportKindVisible);
  if (!project) return null;

  // All possible kinds, in a sensible UI order. We always show every
  // kind so the user can toggle ahead of drawing — the count next to
  // each label tells them whether they have any of that kind yet.
  const KIND_META: { kind: MarkupKind; label: string }[] = [
    { kind: "device", label: "Devices" },
    { kind: "cable", label: "Cable Runs" },
    { kind: "text", label: "Text Notes" },
    { kind: "callout", label: "Callouts" },
    { kind: "cloud", label: "Revision Clouds" },
    { kind: "dimension", label: "Dimensions" },
    { kind: "rect", label: "Rectangles" },
    { kind: "polygon", label: "Polygons" },
    { kind: "arrow", label: "Arrows" },
    { kind: "freehand", label: "Freehand" },
  ];

  // Tally how many of each kind across all sheets.
  const counts: Record<string, number> = {};
  for (const sh of project.sheets) {
    for (const m of sh.markups) {
      counts[m.kind] = (counts[m.kind] ?? 0) + 1;
    }
  }

  return (
    <div className="mt-4 pt-3 border-t border-white/5">
      <div className="px-2 pb-1 flex items-center justify-between">
        <span className="label">Export Visibility</span>
        <span
          className="text-[10px] font-mono text-ink-400 normal-case tracking-normal"
          title="Toggles only affect the exported PDF, not the editor"
        >
          PDF only
        </span>
      </div>
      <p className="px-2 pb-2 text-[10px] text-ink-400 leading-relaxed">
        Uncheck a markup type to keep it on the canvas but skip it in the
        export — useful for hiding internal annotations from a customer
        deliverable.
      </p>
      <div className="space-y-0.5">
        {KIND_META.map((k) => {
          const visible = project.exportVisibility?.[k.kind] !== false;
          const count = counts[k.kind] ?? 0;
          return (
            <button
              key={k.kind}
              onClick={() => setExportKindVisible(k.kind, !visible)}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-white/5 text-left"
            >
              {visible ? (
                <Eye className="w-3.5 h-3.5 text-amber-knox shrink-0" />
              ) : (
                <EyeOff className="w-3.5 h-3.5 text-ink-500 shrink-0" />
              )}
              <span
                className={`flex-1 text-sm ${visible ? "text-ink-100" : "text-ink-500 line-through"}`}
              >
                {k.label}
              </span>
              <span
                className={`text-[10px] font-mono ${count > 0 ? "text-ink-300" : "text-ink-600"}`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
