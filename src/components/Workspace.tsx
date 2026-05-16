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
import { DiagramBuilder } from "../diagrams/DiagramBuilder";
import {
  Calculator,
  Layers,
  Library,
  SlidersHorizontal,
  X,
} from "lucide-react";

type MobileDrawer = "project" | "properties" | null;

export function Workspace() {
  const project = useProjectStore((s) => s.project);
  const view = useProjectStore((s) => s.view);
  const sheet = useProjectStore(selectActiveSheet);
  const bidOpen = useProjectStore((s) => s.bidPanelOpen);
  const paletteOpen = useProjectStore((s) => s.paletteOpen);
  const toggleBidPanel = useProjectStore((s) => s.toggleBidPanel);
  const selectedCount = useProjectStore((s) => s.selectedMarkupIds.length);
  const [mobileDrawer, setMobileDrawer] = useState<MobileDrawer>(null);
  const [mobilePaletteOpen, setMobilePaletteOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
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

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setIsMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  if (!project) return null;

  return (
    <div className="h-full w-full flex flex-col">
      <Topbar />
      {view === "racks" ? (
        <RackBuilder />
      ) : view === "diagrams" ? (
        <DiagramBuilder />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <LeftRail className="!hidden md:!flex" />
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
            {!isMobile && paletteOpen && <DevicePalette />}
            {isMobile && mobilePaletteOpen && (
              <DevicePalette onClose={() => setMobilePaletteOpen(false)} />
            )}
            <MobileCanvasDock
              selectedCount={selectedCount}
              bidOpen={bidOpen}
              paletteOpen={mobilePaletteOpen}
              onOpenProject={() => setMobileDrawer("project")}
              onOpenProperties={() => setMobileDrawer("properties")}
              onToggleBid={toggleBidPanel}
              onTogglePalette={() => setMobilePaletteOpen((v) => !v)}
            />
          </div>
          <PropertiesPanel className="!hidden md:!flex" />
          {bidOpen && <BidPanel className="!hidden md:!flex" />}
          {mobileDrawer === "project" && (
            <MobileSheet title="Project" onClose={() => setMobileDrawer(null)}>
              <LeftRail className="!h-full !w-full border-r-0" />
            </MobileSheet>
          )}
          {mobileDrawer === "properties" && (
            <MobileSheet title="Properties" onClose={() => setMobileDrawer(null)}>
              <PropertiesPanel className="!h-full !w-full border-l-0" />
            </MobileSheet>
          )}
          {bidOpen && (
            <MobileSheet title="Live Bid" onClose={toggleBidPanel}>
              <BidPanel className="!h-full !w-full border-l-0" />
            </MobileSheet>
          )}
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

function MobileCanvasDock({
  selectedCount,
  bidOpen,
  paletteOpen,
  onOpenProject,
  onOpenProperties,
  onToggleBid,
  onTogglePalette,
}: {
  selectedCount: number;
  bidOpen: boolean;
  paletteOpen: boolean;
  onOpenProject: () => void;
  onOpenProperties: () => void;
  onToggleBid: () => void;
  onTogglePalette: () => void;
}) {
  return (
    <div className="md:hidden absolute left-3 right-3 top-3 z-30 flex items-center justify-between gap-2 pointer-events-none">
      <div className="panel rounded-full px-1.5 py-1 flex items-center gap-1 pointer-events-auto">
        <MobileDockButton onClick={onOpenProject} label="Project">
          <Layers className="w-4 h-4" />
        </MobileDockButton>
        <MobileDockButton onClick={onOpenProperties} label={selectedCount > 0 ? `${selectedCount} selected` : "Props"}>
          <SlidersHorizontal className="w-4 h-4" />
        </MobileDockButton>
      </div>
      <div className="panel rounded-full px-1.5 py-1 flex items-center gap-1 pointer-events-auto">
        <MobileDockButton onClick={onTogglePalette} label="Library" active={paletteOpen}>
          <Library className="w-4 h-4" />
        </MobileDockButton>
        <MobileDockButton onClick={onToggleBid} label="Bid" active={bidOpen}>
          <Calculator className="w-4 h-4" />
        </MobileDockButton>
      </div>
    </div>
  );
}

function MobileDockButton({
  children,
  label,
  active,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className="min-h-10 rounded-full px-3 text-xs font-medium text-ink-100 inline-flex items-center gap-1.5 data-[active=true]:bg-amber-knox/15 data-[active=true]:text-amber-knox"
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

function MobileSheet({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="md:hidden fixed inset-0 z-50 bg-ink-900/55 backdrop-blur-sm animate-fade-in">
      <button
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label={`Close ${title}`}
      />
      <div className="absolute inset-x-0 bottom-0 top-14 overflow-hidden rounded-t-2xl border border-white/10 bg-ink-800 shadow-panel animate-slide-up">
        <div className="h-12 px-4 border-b border-white/5 flex items-center justify-between">
          <div className="text-sm font-semibold text-ink-50">{title}</div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full inline-flex items-center justify-center text-ink-300 hover:text-ink-50 hover:bg-white/5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="h-[calc(100%_-_3rem)]">{children}</div>
      </div>
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
