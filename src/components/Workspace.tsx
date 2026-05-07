import { useEffect, useState } from "react";
import { useProjectStore, selectActiveSheet } from "../store/projectStore";
import { Topbar } from "./Topbar";
import { LeftRail } from "./LeftRail";
import { Toolbar } from "./Toolbar";
import { DevicePalette } from "./DevicePalette";
import { PropertiesPanel } from "./PropertiesPanel";
import { StatusBar } from "./StatusBar";
import { Editor } from "./Editor";
import { BidPanel } from "./BidPanel";
import { CalibrationDialog } from "./CalibrationDialog";
import { saveProject } from "../persist/db";
import { RackBuilder } from "../rack/RackBuilder";

export function Workspace() {
  const project = useProjectStore((s) => s.project);
  const view = useProjectStore((s) => s.view);
  const sheet = useProjectStore(selectActiveSheet);
  const bidOpen = useProjectStore((s) => s.bidPanelOpen);
  const paletteOpen = useProjectStore((s) => s.paletteOpen);
  const [calibrationOpen, setCalibrationOpen] = useState<{
    pendingPoints: { x: number; y: number }[];
  } | null>(null);

  // Background persistence: debounce saves
  useEffect(() => {
    if (!project) return;
    const t = setTimeout(() => {
      saveProject(project).catch((e) => console.error("save failed", e));
    }, 800);
    return () => clearTimeout(t);
  }, [project]);

  if (!project) return null;

  return (
    <div className="h-full w-full flex flex-col">
      <Topbar />
      {view === "racks" ? (
        <RackBuilder />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <LeftRail />
          <div className="flex-1 relative workspace-grid">
            {sheet ? (
              <Editor
                sheet={sheet}
                onCalibrateConfirm={(pts) => setCalibrationOpen({ pendingPoints: pts })}
              />
            ) : (
              <EmptyEditor />
            )}
            <Toolbar />
            {paletteOpen && <DevicePalette />}
          </div>
          <PropertiesPanel />
          {bidOpen && <BidPanel />}
        </div>
      )}
      <StatusBar />
      {calibrationOpen && (
        <CalibrationDialog
          points={calibrationOpen.pendingPoints}
          onClose={() => setCalibrationOpen(null)}
        />
      )}
    </div>
  );
}

function EmptyEditor() {
  return (
    <div className="absolute inset-0 flex items-center justify-center text-ink-400 font-mono text-sm">
      No sheet selected. Add a PDF from the left rail.
    </div>
  );
}
