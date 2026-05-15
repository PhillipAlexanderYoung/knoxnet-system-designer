import { useEffect, useRef, useState } from "react";
import {
  MousePointer2,
  Hand,
  Ruler,
  Cable,
  Type as TypeIcon,
  MessageSquare,
  Cloud,
  Square,
  ArrowUpRight,
  Pen,
  Hexagon,
  Sparkles,
  ZapOff,
  Magnet,
  Eraser,
  Eye,
  EyeOff,
  Radar,
  Tags,
  RotateCcw,
} from "lucide-react";
import { useProjectStore, type ToolId } from "../store/projectStore";
import { cables, cablesById } from "../data/cables";
import { selectActiveSheet } from "../store/projectStore";

// Quick-access freehand swatches. Hand-picked to cover the common review
// colors (red strikethrough, amber highlight, green/blue review marks)
// without dumping a full color picker into the toolbar.
const FREEHAND_SWATCHES: string[] = [
  "#F4B740", // amber (default)
  "#FF5C7A", // red
  "#2BD37C", // green
  "#4FB7FF", // blue
  "#B58CFF", // violet
  "#F5F7FA", // white
  "#0B1220", // black
];

const TOOLS: {
  id: ToolId;
  label: string;
  icon: any;
  hotkey: string;
}[] = [
  { id: "select", label: "Select", icon: MousePointer2, hotkey: "V" },
  { id: "pan", label: "Pan", icon: Hand, hotkey: "H" },
  { id: "calibrate", label: "Calibrate Scale", icon: Ruler, hotkey: "K" },
  { id: "device", label: "Place Device", icon: Sparkles, hotkey: "D" },
  { id: "cable", label: "Cable Run", icon: Cable, hotkey: "C" },
  { id: "dimension", label: "Dimension", icon: Ruler, hotkey: "M" },
  { id: "text", label: "Text", icon: TypeIcon, hotkey: "T" },
  { id: "callout", label: "Callout", icon: MessageSquare, hotkey: "L" },
  { id: "cloud", label: "Revision Cloud", icon: Cloud, hotkey: "O" },
  { id: "rect", label: "Rectangle", icon: Square, hotkey: "R" },
  { id: "polygon", label: "Polygon", icon: Hexagon, hotkey: "P" },
  { id: "arrow", label: "Arrow", icon: ArrowUpRight, hotkey: "A" },
  { id: "freehand", label: "Freehand", icon: Pen, hotkey: "F" },
  { id: "mask", label: "Mask / Cover-up", icon: Eraser, hotkey: "X" },
];

export function Toolbar() {
  const activeTool = useProjectStore((s) => s.activeTool);
  const setTool = useProjectStore((s) => s.setActiveTool);
  const ortho = useProjectStore((s) => s.orthoEnabled);
  const snap = useProjectStore((s) => s.snapEnabled);
  const toggleOrtho = useProjectStore((s) => s.toggleOrtho);
  const toggleSnap = useProjectStore((s) => s.toggleSnap);
  const togglePalette = useProjectStore((s) => s.togglePalette);
  const paletteOpen = useProjectStore((s) => s.paletteOpen);
  const activeCableId = useProjectStore((s) => s.activeCableId);
  const setActiveCable = useProjectStore((s) => s.setActiveCable);
  const freehandColor = useProjectStore((s) => s.freehandColor);
  const setFreehandColor = useProjectStore((s) => s.setFreehandColor);
  const freehandThickness = useProjectStore((s) => s.freehandThickness);
  const setFreehandThickness = useProjectStore((s) => s.setFreehandThickness);
  const freehandErasing = useProjectStore((s) => s.freehandErasing);
  const toggleFreehandErasing = useProjectStore((s) => s.toggleFreehandErasing);
  const brandPreviewEnabled = useProjectStore((s) => s.brandPreviewEnabled);
  const toggleBrandPreview = useProjectStore((s) => s.toggleBrandPreview);
  const coverageVisible = useProjectStore((s) => s.coverageVisible);
  const toggleCoverageVisible = useProjectStore((s) => s.toggleCoverageVisible);

  return (
    <div className="absolute left-1/2 top-4 -translate-x-1/2 z-20 flex items-center gap-1 panel rounded-xl px-1.5 py-1.5 animate-slide-up">
      {TOOLS.map((t) => {
        const Icon = t.icon;
        const isActive = activeTool === t.id;
        const onClick = () => {
          setTool(t.id);
          if (t.id === "device" && !paletteOpen) togglePalette();
        };
        return (
          <button
            key={t.id}
            onClick={onClick}
            data-active={isActive}
            className="tool-btn group"
            title={`${t.label} (${t.hotkey})`}
          >
            <Icon className="w-4 h-4" />
            <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-mono uppercase tracking-wider text-ink-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap bg-ink-900 px-1.5 py-0.5 rounded">
              {t.label} · {t.hotkey}
            </span>
          </button>
        );
      })}
      <div className="w-px h-6 bg-white/10 mx-1" />
      <button
        onClick={toggleOrtho}
        data-active={ortho}
        className="tool-btn"
        title="Ortho mode (hold Shift while drawing cables)"
      >
        <ZapOff className="w-4 h-4" />
      </button>
      <button
        onClick={toggleSnap}
        data-active={snap}
        className="tool-btn"
        title="Snap"
      >
        <Magnet className="w-4 h-4" />
      </button>
      <button
        onClick={toggleBrandPreview}
        data-active={brandPreviewEnabled}
        className="tool-btn"
        title={
          brandPreviewEnabled
            ? "Brand preview ON — live ghost of export branding"
            : "Brand preview OFF — show ghost of export branding"
        }
      >
        {brandPreviewEnabled ? (
          <Eye className="w-4 h-4" />
        ) : (
          <EyeOff className="w-4 h-4" />
        )}
      </button>
      <button
        onClick={toggleCoverageVisible}
        data-active={coverageVisible}
        className="tool-btn group"
        title={
          coverageVisible
            ? "Coverage visuals ON — camera FOV, AP signal, beam paths"
            : "Coverage visuals OFF — show device footprints"
        }
      >
        <Radar className="w-4 h-4" />
        <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-mono uppercase tracking-wider text-ink-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap bg-ink-900 px-1.5 py-0.5 rounded">
          Coverage · FOV / signal / beams
        </span>
      </button>
      <TagDefaultsButton />

      {activeTool === "cable" && (
        <>
          <div className="w-px h-6 bg-white/10 mx-1" />
          <select
            value={activeCableId ?? ""}
            onChange={(e) => setActiveCable(e.target.value)}
            className="bg-ink-700/60 border border-white/5 rounded-md px-2 py-1 text-xs text-ink-50"
          >
            {cables.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {activeCableId && (
            <span
              className="w-3 h-3 rounded-sm"
              style={{ background: cablesById[activeCableId]?.color }}
            />
          )}
        </>
      )}
      {activeTool === "freehand" && (
        <>
          <div className="w-px h-6 bg-white/10 mx-1" />
          {/* Color swatches — the active swatch gets a ring; click an empty
              ring to pop the native color picker for off-palette colors. */}
          <div className="flex items-center gap-1">
            {FREEHAND_SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => setFreehandColor(c)}
                title={c}
                className="w-5 h-5 rounded-full border border-white/15 flex-shrink-0 transition-transform hover:scale-110"
                style={{
                  background: c,
                  boxShadow:
                    freehandColor.toUpperCase() === c.toUpperCase()
                      ? `0 0 0 2px #0B1220, 0 0 0 3px ${c}`
                      : undefined,
                }}
              />
            ))}
            <label
              title="Custom color"
              className="relative w-5 h-5 rounded-full border border-dashed border-white/30 flex items-center justify-center cursor-pointer text-[8px] text-ink-300 hover:border-amber-knox/60 overflow-hidden"
              style={{
                background:
                  FREEHAND_SWATCHES.findIndex(
                    (s) => s.toUpperCase() === freehandColor.toUpperCase(),
                  ) === -1
                    ? freehandColor
                    : undefined,
              }}
            >
              +
              <input
                type="color"
                value={freehandColor}
                onChange={(e) => setFreehandColor(e.target.value.toUpperCase())}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
            </label>
          </div>
          <div className="flex items-center gap-1.5 px-2">
            <span className="text-[10px] font-mono text-ink-400 uppercase tracking-wider">
              Thick
            </span>
            <input
              type="range"
              min={1}
              max={12}
              step={0.5}
              value={freehandThickness}
              onChange={(e) => setFreehandThickness(parseFloat(e.target.value))}
              className="w-20 accent-amber-knox"
              title={`${freehandThickness}px`}
            />
            <span className="text-[10px] font-mono text-ink-200 w-6 text-right">
              {freehandThickness}
            </span>
          </div>
          <button
            onClick={toggleFreehandErasing}
            data-active={freehandErasing}
            className="tool-btn"
            title={
              freehandErasing
                ? "Eraser ON — click a stroke to delete it"
                : "Eraser — click a stroke to delete it"
            }
          >
            <Eraser className="w-4 h-4" />
            <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-mono uppercase tracking-wider text-ink-300 opacity-0 hover:opacity-100 pointer-events-none whitespace-nowrap bg-ink-900 px-1.5 py-0.5 rounded">
              Eraser
            </span>
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Toolbar popover for project-wide tag controls. Lets the user set a
 * default tag font size (which every device without a per-instance
 * override picks up), apply that default to every device on the active
 * sheet in one shot, and reset all dragged tag positions back to auto.
 *
 * The per-device controls in the Properties panel are unaffected; this
 * is the global / bulk surface that lives next to the other "show /
 * hide" toggles on the floating toolbar.
 */
function TagDefaultsButton() {
  const project = useProjectStore((s) => s.project);
  const sheet = useProjectStore(selectActiveSheet);
  const setTagDefaults = useProjectStore((s) => s.setTagDefaults);
  const applyTagFontSizeToAll = useProjectStore(
    (s) => s.applyTagFontSizeToAll,
  );
  const resetAllTagPositions = useProjectStore(
    (s) => s.resetAllTagPositions,
  );
  const pushToast = useProjectStore((s) => s.pushToast);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Local draft so the slider stays responsive without thrashing the
  // store on every pixel; commits to project defaults on input change.
  const projectDefault = project?.tagDefaults?.fontSize;
  const [draft, setDraft] = useState<number>(projectDefault ?? 11);
  useEffect(() => {
    if (projectDefault !== undefined) setDraft(projectDefault);
  }, [projectDefault]);

  // Close on outside click — same UX pattern as the other toolbar
  // popovers (export menu, etc.).
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!project) return null;

  const onResetActiveSheet = () => {
    if (!sheet) return;
    if (
      !confirm(
        `Reset all dragged tag positions on "${sheet.name}"? Per-device font sizes and offsets typed into the Properties panel will be cleared.`,
      )
    )
      return;
    const n = resetAllTagPositions(sheet.id);
    pushToast(
      "info",
      n === 0
        ? "No pinned tag positions on this sheet"
        : `Reset ${n} tag position${n === 1 ? "" : "s"} on this sheet`,
    );
    setOpen(false);
  };

  const onResetAllSheets = () => {
    if (
      !confirm(
        "Reset every dragged tag position across every sheet in this project?",
      )
    )
      return;
    const n = resetAllTagPositions(undefined);
    pushToast(
      "info",
      n === 0
        ? "No pinned tag positions in project"
        : `Reset ${n} tag position${n === 1 ? "" : "s"}`,
    );
    setOpen(false);
  };

  const onApplyToActiveSheet = () => {
    if (!sheet) return;
    const n = applyTagFontSizeToAll(draft, sheet.id);
    pushToast(
      "success",
      `Applied ${draft}pt to ${n} device${n === 1 ? "" : "s"} on "${sheet.name}"`,
    );
    setOpen(false);
  };

  const isCustom = projectDefault !== undefined;

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        data-active={open || isCustom}
        className="tool-btn group"
        title="Project-wide tag size and bulk reset"
      >
        <Tags className="w-4 h-4" />
        <span className="absolute -bottom-7 left-1/2 -translate-x-1/2 text-[10px] font-mono uppercase tracking-wider text-ink-300 opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap bg-ink-900 px-1.5 py-0.5 rounded">
          Tag defaults
        </span>
      </button>
      {open && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-64 panel rounded-lg p-3 z-30 animate-scale-in space-y-2.5">
          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="label">Default tag font</span>
              <span className="text-[10px] font-mono text-ink-500">
                {draft.toFixed(0)} pt
                {!isCustom && (
                  <span className="text-ink-600"> · (auto)</span>
                )}
              </span>
            </div>
            <input
              type="range"
              min={6}
              max={24}
              step={0.5}
              value={draft}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setDraft(v);
                setTagDefaults({ fontSize: v });
              }}
              className="w-full accent-amber-knox"
            />
            <p className="text-[10px] text-ink-500 leading-snug mt-1">
              Applies to every device that doesn't have a per-instance
              tag font size set.
            </p>
            {isCustom && (
              <button
                onClick={() => {
                  setTagDefaults({ fontSize: undefined });
                }}
                className="text-[10px] font-mono text-ink-400 hover:text-amber-knox mt-0.5"
              >
                clear project default
              </button>
            )}
          </div>

          <div className="h-px bg-white/5" />

          <div className="space-y-1">
            <button
              onClick={onApplyToActiveSheet}
              disabled={!sheet}
              className="btn-ghost w-full justify-start text-xs disabled:opacity-50"
              title="Force every device on this sheet to use the slider value as its per-instance tag font size"
            >
              <TypeIcon className="w-3.5 h-3.5" />
              Apply {draft.toFixed(0)} pt to all on this sheet
            </button>
            <button
              onClick={onResetActiveSheet}
              disabled={!sheet}
              className="btn-ghost w-full justify-start text-xs disabled:opacity-50"
              title="Clear dragged tag positions on the active sheet"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset tag positions on this sheet
            </button>
            <button
              onClick={onResetAllSheets}
              className="btn-ghost w-full justify-start text-xs"
              title="Clear dragged tag positions on every sheet"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset tag positions on all sheets
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
