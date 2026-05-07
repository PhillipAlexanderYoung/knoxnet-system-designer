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
} from "lucide-react";
import { useProjectStore, type ToolId } from "../store/projectStore";
import { cables, cablesById } from "../data/cables";

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
