import { useProjectStore, selectActiveSheet } from "../store/projectStore";
import { ptsToFeet, formatFeet } from "../lib/geometry";

export function StatusBar() {
  const cursor = useProjectStore((s) => s.cursor);
  const sheet = useProjectStore(selectActiveSheet);
  const tool = useProjectStore((s) => s.activeTool);
  const ortho = useProjectStore((s) => s.orthoEnabled);
  const snap = useProjectStore((s) => s.snapEnabled);
  const viewport = useProjectStore((s) => s.viewport);

  const ftX = cursor && sheet ? ptsToFeet(cursor.x, sheet.calibration) : null;
  const ftY = cursor && sheet ? ptsToFeet(cursor.y, sheet.calibration) : null;

  return (
    <div className="hidden h-7 px-3 md:flex items-center justify-between text-[11px] font-mono text-ink-400 border-t border-white/5 bg-ink-900/80 backdrop-blur-md">
      <div className="flex items-center gap-4">
        <span>
          <span className="text-ink-500">tool · </span>
          <span className="text-amber-knox uppercase">{tool}</span>
        </span>
        <span className="text-ink-500">|</span>
        <span>
          <span className="text-ink-500">scale · </span>
          {sheet?.calibration
            ? `${sheet.calibration.pixelsPerFoot.toFixed(2)} px/ft`
            : "uncalibrated"}
        </span>
        <span className="text-ink-500">|</span>
        <span>
          <span className="text-ink-500">zoom · </span>
          {(viewport.scale * 100).toFixed(0)}%
        </span>
      </div>
      <div className="flex items-center gap-4">
        {cursor && (
          <span>
            <span className="text-ink-500">cursor · </span>
            {ftX !== null && ftY !== null
              ? `${formatFeet(ftX)} , ${formatFeet(ftY)}`
              : `${cursor.x.toFixed(0)}, ${cursor.y.toFixed(0)} pt`}
          </span>
        )}
        <span className="text-ink-500">|</span>
        <span className={ortho ? "text-amber-knox" : "text-ink-500"}>ORTHO</span>
        <span className={snap ? "text-amber-knox" : "text-ink-500"}>SNAP</span>
      </div>
    </div>
  );
}
