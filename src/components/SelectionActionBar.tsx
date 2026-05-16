import { useMemo } from "react";
import { useProjectStore, selectActiveSheet, type Markup } from "../store/projectStore";
import { devicesById } from "../data/devices";
import { endpointFromMarkup, isRouteInfrastructureMarkup } from "../lib/cableRuns";
import { Trash2, Copy, Lock, LockOpen, Cable } from "lucide-react";

/**
 * A small HTML floating action bar that appears next to the currently-selected
 * markup(s). Lives in screen coordinates derived from the viewport transform,
 * so it's always crisp and accessible to mouse + touch.
 */
export function SelectionActionBar() {
  const sheet = useProjectStore(selectActiveSheet);
  const selected = useProjectStore((s) => s.selectedMarkupIds);
  const viewport = useProjectStore((s) => s.viewport);
  const updateMarkup = useProjectStore((s) => s.updateMarkup);
  const deleteMarkup = useProjectStore((s) => s.deleteMarkup);
  const setSelected = useProjectStore((s) => s.setSelected);
  const addMarkup = useProjectStore((s) => s.addMarkup);
  const nextTag = useProjectStore((s) => s.nextTag);
  const cableRunDraft = useProjectStore((s) => s.cableRunDraft);
  const setActiveTool = useProjectStore((s) => s.setActiveTool);
  const placeCableRunEndpoint = useProjectStore((s) => s.placeCableRunEndpoint);
  const branchCableRunToEndpoints = useProjectStore((s) => s.branchCableRunToEndpoints);
  const lockMoveHint = useProjectStore((s) => s.lockMoveHint);

  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const items: Markup[] = useMemo(() => {
    if (!sheet) return [];
    return sheet.markups.filter((m) => selectedSet.has(m.id));
  }, [sheet, selectedSet]);

  if (items.length === 0 || !sheet) return null;

  // Bounding box in sheet coords
  const bbox = computeBBox(items);
  if (!bbox) return null;

  // Convert top-center of bbox to screen coords
  const sx = bbox.cx * viewport.scale + viewport.x;
  const sy = bbox.minY * viewport.scale + viewport.y;
  const aboveOffset = 14;

  const allLocked = items.every((m) => m.locked);
  const lockHintTargetsSelected =
    !!lockMoveHint?.targetIds?.some((id) => selectedSet.has(id));
  const showLockPulse =
    !!lockMoveHint &&
    (lockHintTargetsSelected ||
      (!lockMoveHint.targetIds?.length && items.some((m) => m.locked)));

  const onDuplicate = () => {
    const newIds: string[] = [];
    for (const m of items) {
      if (m.kind !== "device") continue;
      const dev = devicesById[m.deviceId];
      const id = Math.random().toString(36).slice(2, 10);
      const tag = nextTag(dev?.shortCode ?? "X");
      addMarkup({
        ...m,
        id,
        tag,
        x: m.x + 24,
        y: m.y + 24,
      });
      newIds.push(id);
    }
    if (newIds.length > 0) setSelected(newIds);
  };

  const onDelete = () => {
    items.forEach((m) => deleteMarkup(m.id));
    setSelected([]);
  };

  const onLockToggle = () => {
    items.forEach((m) => updateMarkup(m.id, { locked: !allLocked } as any));
  };

  const hasDevices = items.some((m) => m.kind === "device");
  const routeOrigin = items.find(
    (m) => m.kind === "device" && isRouteInfrastructureMarkup(m),
  );
  const cameraEndpoints = items
    .filter((m) => m.kind === "device" && m.category === "cameras")
    .map((m) => endpointFromMarkup(m, { markups: sheet.markups }))
    .filter((m): m is NonNullable<typeof m> => !!m);
  const canRouteDrops =
    cameraEndpoints.length > 0 && (!!routeOrigin || (cableRunDraft?.points.length ?? 0) > 0);

  const onRouteDrops = () => {
    setActiveTool("cable");
    if (routeOrigin) {
      const origin = endpointFromMarkup(routeOrigin, { markups: sheet.markups });
      if (origin) placeCableRunEndpoint(origin);
    }
    branchCableRunToEndpoints(cameraEndpoints);
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
      <div className="pointer-events-auto panel rounded-lg flex items-center divide-x divide-white/5 animate-scale-in shadow-glass">
        <span className="px-2 py-1.5 font-mono text-[10px] text-amber-knox uppercase tracking-wider">
          {items.length === 1 ? labelFor(items[0]) : `${items.length} items`}
        </span>
        {hasDevices && (
          <button
            onClick={onDuplicate}
            className="px-2 py-1.5 hover:bg-white/5 text-ink-200 hover:text-ink-50"
            title="Duplicate (⌘D)"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
        {canRouteDrops && (
          <button
            onClick={onRouteDrops}
            className="px-2 py-1.5 hover:bg-white/5 text-ink-200 hover:text-ink-50"
            title="Route selected cameras from Pull Box / current Cable Run branch origin"
          >
            <Cable className="w-3.5 h-3.5" />
          </button>
        )}
        <div className="relative">
          <button
            onClick={onLockToggle}
            className={`px-2 py-1.5 hover:bg-white/5 text-ink-200 hover:text-ink-50 ${
              showLockPulse
                ? "bg-signal-red/20 text-signal-red ring-1 ring-inset ring-signal-red/70 shadow-[0_0_12px_rgba(255,92,122,0.45)] animate-pulse"
                : ""
            }`}
            title={allLocked ? "Unlock" : "Lock"}
          >
            {allLocked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
          </button>
          {showLockPulse && (
            <div
              key={lockMoveHint!.pulseKey}
              className="absolute left-1/2 top-full mt-1 -translate-x-1/2 rounded-md border border-signal-red/40 bg-ink-900/95 px-2 py-1 text-[10px] font-mono text-signal-red shadow-glass pointer-events-none animate-fade-in whitespace-nowrap"
            >
              {lockMoveHint!.message}
            </div>
          )}
        </div>
        <button
          onClick={onDelete}
          className="px-2 py-1.5 hover:bg-signal-red/10 text-signal-red"
          title="Delete (Del)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* Connector tick */}
      <div className="w-px h-3 bg-white/15 mx-auto" />
    </div>
  );
}

function labelFor(m: Markup): string {
  switch (m.kind) {
    case "device":
      return m.tag || "Device";
    case "cable":
      return m.cableId === "conduit" ? "Conduit Run" : "Cable Run";
    case "text":
      return "Text";
    case "callout":
      return "Callout";
    case "cloud":
      return "Cloud";
    case "dimension":
      return "Dimension";
    case "rect":
      return "Rectangle";
    case "arrow":
      return "Arrow";
    case "polygon":
      return "Polygon";
    case "freehand":
      return "Freehand";
    case "schedule":
      return "Schedule";
  }
}

interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  cx: number;
  cy: number;
}

function computeBBox(items: Markup[]): BBox | null {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const expand = (x: number, y: number, pad = 0) => {
    minX = Math.min(minX, x - pad);
    minY = Math.min(minY, y - pad);
    maxX = Math.max(maxX, x + pad);
    maxY = Math.max(maxY, y + pad);
  };
  for (const m of items) {
    switch (m.kind) {
      case "device":
        expand(m.x, m.y, (m.size ?? 28) / 2);
        break;
      case "cable":
      case "polygon":
      case "freehand":
        for (let i = 0; i < m.points.length; i += 2) {
          expand(m.points[i], m.points[i + 1]);
        }
        break;
      case "text":
      case "schedule":
        expand(m.x, m.y);
        break;
      case "callout":
        expand(m.x1, m.y1);
        expand(m.x2, m.y2);
        break;
      case "rect":
        expand(m.x, m.y);
        expand(m.x + m.width, m.y + m.height);
        break;
      case "cloud":
        expand(m.x, m.y);
        expand(m.x + m.width, m.y + m.height);
        break;
      case "dimension":
      case "arrow":
        expand(m.p1.x, m.p1.y);
        expand(m.p2.x, m.p2.y);
        break;
    }
  }
  if (!isFinite(minX)) return null;
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
}
