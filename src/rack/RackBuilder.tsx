import { useEffect, useState } from "react";
import { useProjectStore, selectActiveRack } from "../store/projectStore";
import { RackDevicePalette } from "./RackDevicePalette";
import { RackFrame } from "./RackFrame";
import { RackProperties } from "./RackProperties";
import { Plus, Server, ZoomIn, ZoomOut, FileDown } from "lucide-react";
import { exportRackElevation } from "../export/exportRackElevation";

export function RackBuilder() {
  const project = useProjectStore((s) => s.project);
  const racks = project?.racks ?? [];
  const activeRack = useProjectStore(selectActiveRack);
  const setActiveRack = useProjectStore((s) => s.setActiveRack);
  const addRack = useProjectStore((s) => s.addRack);
  const pushToast = useProjectStore((s) => s.pushToast);
  const [uPx, setUPx] = useState(28);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPlacementId(null);
  }, [activeRack?.id]);

  // Delete-key shortcut for selected rack device
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedPlacementId && activeRack) {
        e.preventDefault();
        useProjectStore.getState().removePlacement(activeRack.id, selectedPlacementId);
        setSelectedPlacementId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedPlacementId, activeRack]);

  const onExport = async () => {
    if (!project || !activeRack) return;
    try {
      await exportRackElevation(project, activeRack);
      pushToast("success", "Rack elevation exported");
    } catch (e) {
      console.error(e);
      pushToast("error", "Export failed");
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      <RackDevicePalette />

      <div className="flex-1 relative workspace-grid overflow-auto">
        {/* Floating toolbar */}
        <div className="absolute left-1/2 top-4 -translate-x-1/2 z-20 panel rounded-xl px-2 py-1.5 flex items-center gap-1 animate-slide-up">
          <Server className="w-4 h-4 text-amber-knox mx-1" />
          <select
            value={activeRack?.id ?? ""}
            onChange={(e) => setActiveRack(e.target.value || null)}
            className="bg-ink-700/60 border border-white/5 rounded-md px-2 py-1 text-xs text-ink-50"
          >
            {racks.length === 0 && <option value="">No racks</option>}
            {racks.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} · {r.uHeight}U
              </option>
            ))}
          </select>
          <button
            onClick={() => addRack({ name: `Rack ${racks.length + 1}`, uHeight: 42 })}
            className="btn"
            title="Add new rack"
          >
            <Plus className="w-3.5 h-3.5" />
            New rack
          </button>
          <div className="w-px h-5 bg-white/10 mx-1" />
          <button onClick={() => setUPx((p) => Math.max(16, p - 4))} className="tool-btn" title="Smaller">
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono text-xs text-ink-300 px-1 tabular-nums">{uPx}px/U</span>
          <button onClick={() => setUPx((p) => Math.min(48, p + 4))} className="tool-btn" title="Larger">
            <ZoomIn className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-white/10 mx-1" />
          <button onClick={onExport} className="btn-primary" disabled={!activeRack}>
            <FileDown className="w-3.5 h-3.5" />
            Export elevation
          </button>
        </div>

        {/* Stage */}
        <div className="min-h-full flex items-start justify-center p-12 pt-24">
          {activeRack ? (
            <RackFrame
              rack={activeRack}
              uPx={uPx}
              selectedId={selectedPlacementId}
              onSelect={setSelectedPlacementId}
            />
          ) : (
            <div className="panel rounded-xl p-10 text-center max-w-md">
              <Server className="w-10 h-10 text-amber-knox mx-auto mb-3" />
              <div className="text-lg font-semibold text-ink-50 mb-1">
                Build your first rack
              </div>
              <div className="text-sm text-ink-300 mb-4">
                Create a 42U cabinet (or any size) and drag devices from the
                left to populate it. Power, weight, and cost roll up live, and
                export as a branded rack elevation PDF.
              </div>
              <button
                onClick={() =>
                  addRack({ name: "Head-end Cabinet", uHeight: 42 })
                }
                className="btn-primary mx-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                Create 42U rack
              </button>
            </div>
          )}
        </div>
      </div>

      <RackProperties
        selectedPlacementId={selectedPlacementId}
        onSelectPlacement={setSelectedPlacementId}
      />
    </div>
  );
}
