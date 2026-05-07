import { useMemo } from "react";
import {
  useProjectStore,
  selectActiveSheet,
  type MaskRegion,
} from "../store/projectStore";
import { Trash2, Eye, EyeOff, Droplet } from "lucide-react";

/**
 * Floating action bar shown when a mask region is selected. Mirrors the
 * markup SelectionActionBar so the user can quickly delete a mask, toggle
 * its visibility in the editor, flip whether it hosts the brand title
 * block, or pop a custom fill color.
 */
export function MaskActionBar() {
  const sheet = useProjectStore(selectActiveSheet);
  const selected = useProjectStore((s) => s.selectedMarkupIds);
  const viewport = useProjectStore((s) => s.viewport);
  const updateMaskRegion = useProjectStore((s) => s.updateMaskRegion);
  const removeMaskRegion = useProjectStore((s) => s.removeMaskRegion);
  const setSelected = useProjectStore((s) => s.setSelected);

  const masks: MaskRegion[] = useMemo(() => {
    if (!sheet) return [];
    return (sheet.maskRegions ?? []).filter((m) => selected.includes(m.id));
  }, [sheet, selected]);

  if (!sheet || masks.length !== 1) return null;
  const mask = masks[0];

  const sx = (mask.x + mask.width / 2) * viewport.scale + viewport.x;
  const sy = mask.y * viewport.scale + viewport.y;
  const aboveOffset = 14;

  const onDelete = () => {
    removeMaskRegion(sheet.id, mask.id);
    setSelected([]);
  };

  const onToggleVisibility = () => {
    updateMaskRegion(sheet.id, mask.id, {
      hiddenInEditor: !mask.hiddenInEditor,
    });
  };

  const onFillChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    updateMaskRegion(sheet.id, mask.id, { fill: e.target.value.toUpperCase() });
  };

  return (
    <div
      className="absolute pointer-events-none z-30"
      style={{
        left: 0,
        top: 0,
        transform: `translate(${sx}px, ${sy - aboveOffset}px) translate(-50%, -100%)`,
      }}
    >
      <div className="pointer-events-auto panel rounded-lg flex items-center divide-x divide-white/5 overflow-hidden animate-scale-in shadow-glass">
        <span className="px-2 py-1.5 font-mono text-[10px] text-amber-knox uppercase tracking-wider">
          Mask
        </span>
        <label
          className="px-2 py-1.5 hover:bg-white/5 text-ink-300 hover:text-ink-50 cursor-pointer flex items-center gap-1"
          title="Mask fill color"
        >
          <Droplet className="w-3.5 h-3.5" />
          <input
            type="color"
            value={mask.fill ?? sheet.bgColor ?? "#FFFFFF"}
            onChange={onFillChange}
            className="w-4 h-4 rounded cursor-pointer bg-transparent border-0 p-0"
          />
        </label>
        <button
          onClick={onToggleVisibility}
          className="px-2 py-1.5 hover:bg-white/5 text-ink-300 hover:text-ink-50"
          title={mask.hiddenInEditor ? "Show in editor" : "Hide in editor"}
        >
          {mask.hiddenInEditor ? (
            <EyeOff className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
        </button>
        <button
          onClick={onDelete}
          className="px-2 py-1.5 hover:bg-signal-red/10 text-signal-red"
          title="Delete (Del)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="w-px h-3 bg-white/15 mx-auto" />
    </div>
  );
}
