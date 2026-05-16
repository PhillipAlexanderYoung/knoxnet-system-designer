import { useProjectStore } from "../store/projectStore";
import { Maximize2, ZoomIn, ZoomOut } from "lucide-react";

export function ZoomCluster({ onFit }: { onFit: () => void }) {
  const viewport = useProjectStore((s) => s.viewport);
  const setViewport = useProjectStore((s) => s.setViewport);

  const zoom = (factor: number) => {
    setViewport({ scale: Math.max(0.05, Math.min(20, viewport.scale * factor)) });
  };

  return (
    <div className="absolute right-3 bottom-20 panel rounded-lg flex items-center divide-x divide-white/5 z-20 overflow-hidden md:right-4 md:bottom-4">
      <button onClick={() => zoom(0.85)} className="min-h-11 px-3 py-2 hover:bg-white/5 md:min-h-0" title="Zoom out">
        <ZoomOut className="w-4 h-4 text-ink-200" />
      </button>
      <div className="px-3 py-2 font-mono text-xs text-ink-100 min-w-[60px] text-center">
        {(viewport.scale * 100).toFixed(0)}%
      </div>
      <button onClick={() => zoom(1.18)} className="min-h-11 px-3 py-2 hover:bg-white/5 md:min-h-0" title="Zoom in">
        <ZoomIn className="w-4 h-4 text-ink-200" />
      </button>
      <button onClick={onFit} className="min-h-11 px-3 py-2 hover:bg-white/5 md:min-h-0" title="Fit to page">
        <Maximize2 className="w-4 h-4 text-ink-200" />
      </button>
    </div>
  );
}
