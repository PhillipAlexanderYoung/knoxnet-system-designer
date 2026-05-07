import { useMemo, useRef, useState } from "react";
import {
  useProjectStore,
  type Rack,
  type RackPlacement,
} from "../store/projectStore";
import { rackDevicesById } from "../data/rackDevices";
import { RackDeviceFaceplate } from "./RackDeviceFaceplate";
import { Trash2, GripVertical } from "lucide-react";

interface Props {
  rack: Rack;
  /** Pixel height per U (controls overall scale) */
  uPx?: number;
  /** Selected placement id, if any */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

const RAIL_W = 28; // each side rail width in px
const SCREW_DIAMETER = 7;

/**
 * Realistic 19" rack chassis viewed from the front.
 * - Numbered U markings on both rails (top-down: top U at top)
 * - Mounting holes at each U boundary on both rails
 * - Drag-drop target area for dropping devices from the palette
 * - Click-to-select for placed devices, with delete + drag-to-move handle
 */
export function RackFrame({ rack, uPx = 28, selectedId, onSelect }: Props) {
  const addPlacement = useProjectStore((s) => s.addPlacement);
  const removePlacement = useProjectStore((s) => s.removePlacement);
  const updatePlacement = useProjectStore((s) => s.updatePlacement);
  const ref = useRef<HTMLDivElement>(null);
  const [hoverU, setHoverU] = useState<number | null>(null);
  const [draggingPlacementId, setDraggingPlacementId] = useState<string | null>(
    null,
  );

  const usableHeight = rack.uHeight * uPx;
  const innerWidth = 600; // logical width inside rails

  // Build U-occupancy map for collision detection / rendering empty slots
  const occupancy = useMemo(() => {
    const map = new Map<number, RackPlacement>();
    for (const p of rack.placements) {
      const dev = rackDevicesById[p.deviceId];
      if (!dev) continue;
      for (let u = p.uSlot; u < p.uSlot + dev.uHeight; u++) {
        map.set(u, p);
      }
    }
    return map;
  }, [rack.placements]);

  function uFromClientY(clientY: number): number | null {
    if (!ref.current) return null;
    const rect = ref.current.getBoundingClientRect();
    const yWithin = clientY - rect.top;
    if (yWithin < 0 || yWithin > usableHeight) return null;
    // U slots are 1..uHeight, U=1 is at the bottom (front-of-rack convention)
    const fromTop = Math.floor(yWithin / uPx);
    const u = rack.uHeight - fromTop;
    return Math.max(1, Math.min(rack.uHeight, u));
  }

  function canFit(uSlot: number, uHeight: number, ignorePlacementId?: string): boolean {
    if (uSlot < 1 || uSlot + uHeight - 1 > rack.uHeight) return false;
    for (let u = uSlot; u < uSlot + uHeight; u++) {
      const occ = occupancy.get(u);
      if (occ && occ.id !== ignorePlacementId) return false;
    }
    return true;
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    const u = uFromClientY(e.clientY);
    setHoverU(u);
  }

  function onDragLeave() {
    setHoverU(null);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const deviceId = e.dataTransfer.getData("application/x-rack-device");
    const moveId = e.dataTransfer.getData("application/x-rack-placement");
    const targetU = uFromClientY(e.clientY);
    setHoverU(null);
    if (targetU == null) return;

    if (moveId) {
      // moving an existing placement
      const placement = rack.placements.find((p) => p.id === moveId);
      if (!placement) return;
      const dev = rackDevicesById[placement.deviceId];
      if (!dev) return;
      // anchor at top of dragged height
      const desiredSlot = targetU - dev.uHeight + 1;
      if (canFit(desiredSlot, dev.uHeight, placement.id)) {
        updatePlacement(rack.id, placement.id, { uSlot: desiredSlot });
      }
      return;
    }

    if (deviceId) {
      const dev = rackDevicesById[deviceId];
      if (!dev) return;
      const desiredSlot = targetU - dev.uHeight + 1;
      // Find nearest fitting slot
      let slot = desiredSlot;
      if (!canFit(slot, dev.uHeight)) {
        slot = findNearestFit(slot, dev.uHeight, occupancy, rack.uHeight);
        if (slot < 0) return; // no room
      }
      addPlacement(rack.id, {
        id: Math.random().toString(36).slice(2, 10),
        deviceId,
        uSlot: slot,
      });
      return;
    }
  }

  return (
    <div className="inline-block">
      {/* Rack hood */}
      <div
        className="rounded-t-md flex items-center justify-between px-3"
        style={{
          width: innerWidth + RAIL_W * 2,
          height: 26,
          background: "linear-gradient(180deg, #1F2735 0%, #0E121B 100%)",
          borderTop: "1px solid rgba(255,255,255,0.08)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <span className="text-[10px] font-mono tracking-wider text-amber-knox">
          {rack.name.toUpperCase()}
        </span>
        <span className="text-[10px] font-mono text-ink-400">
          {rack.uHeight}U
        </span>
      </div>

      {/* Body (rails + interior) */}
      <div
        className="flex"
        style={{
          background: "linear-gradient(180deg, #0B1018 0%, #050912 100%)",
          padding: "8px 0",
          borderLeft: "1px solid rgba(255,255,255,0.06)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        {/* Left rail */}
        <RackRail uHeight={rack.uHeight} uPx={uPx} side="left" />

        {/* Drop zone interior */}
        <div
          ref={ref}
          className="relative"
          style={{
            width: innerWidth,
            height: usableHeight,
            background: "#040810",
            boxShadow:
              "inset 4px 0 6px rgba(0,0,0,0.6), inset -4px 0 6px rgba(0,0,0,0.6)",
          }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={(e) => {
            if (e.target === e.currentTarget) onSelect(null);
          }}
        >
          {/* Empty rail teeth pattern (subtle U-line guides) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent 0 " +
                (uPx - 1) +
                "px, rgba(255,255,255,0.04) " +
                (uPx - 1) +
                "px " +
                uPx +
                "px)",
            }}
          />

          {/* Hover insertion indicator */}
          {hoverU !== null && (
            <div
              className="absolute left-0 right-0 pointer-events-none border-t-2 border-amber-knox/70"
              style={{ top: (rack.uHeight - hoverU) * uPx + uPx - 1, zIndex: 5 }}
            >
              <div className="absolute -top-3 right-1 px-1.5 py-0.5 rounded bg-amber-knox text-[9px] font-mono text-midnight">
                U{hoverU}
              </div>
            </div>
          )}

          {/* Placed devices */}
          {rack.placements.map((p) => {
            const dev = rackDevicesById[p.deviceId];
            if (!dev) return null;
            const top = (rack.uHeight - (p.uSlot + dev.uHeight - 1)) * uPx;
            const sel = selectedId === p.id;
            return (
              <PlacedDevice
                key={p.id}
                placement={p}
                deviceUHeight={dev.uHeight}
                uPx={uPx}
                top={top}
                selected={sel}
                onSelect={() => onSelect(p.id)}
                onDelete={() => {
                  removePlacement(rack.id, p.id);
                  if (sel) onSelect(null);
                }}
                onDragStart={() => setDraggingPlacementId(p.id)}
                onDragEnd={() => setDraggingPlacementId(null)}
              >
                <RackDeviceFaceplate
                  device={dev}
                  uPx={uPx}
                  overlayLabel={p.label}
                  ghost={draggingPlacementId === p.id}
                />
              </PlacedDevice>
            );
          })}
        </div>

        {/* Right rail */}
        <RackRail uHeight={rack.uHeight} uPx={uPx} side="right" />
      </div>

      {/* Foot */}
      <div
        className="rounded-b-md"
        style={{
          width: innerWidth + RAIL_W * 2,
          height: 18,
          background: "linear-gradient(180deg, #0B1018 0%, #1F2735 100%)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          borderLeft: "1px solid rgba(255,255,255,0.08)",
          borderRight: "1px solid rgba(255,255,255,0.08)",
        }}
      />
    </div>
  );
}

// ───── helpers ─────

function findNearestFit(
  desired: number,
  uHeight: number,
  occ: Map<number, RackPlacement>,
  rackU: number,
): number {
  const fits = (s: number) => {
    if (s < 1 || s + uHeight - 1 > rackU) return false;
    for (let u = s; u < s + uHeight; u++) if (occ.get(u)) return false;
    return true;
  };
  for (let d = 0; d < rackU; d++) {
    if (fits(desired + d)) return desired + d;
    if (fits(desired - d)) return desired - d;
  }
  return -1;
}

function RackRail({
  uHeight,
  uPx,
  side,
}: {
  uHeight: number;
  uPx: number;
  side: "left" | "right";
}) {
  // Top-to-bottom labels: U at the top is `uHeight`, going down to 1
  const items = Array.from({ length: uHeight }, (_, i) => uHeight - i);
  return (
    <div
      style={{
        width: RAIL_W,
        background: "linear-gradient(90deg, #1A2030 0%, #0B0F18 50%, #1A2030 100%)",
        borderLeft: side === "right" ? "1px solid rgba(255,255,255,0.05)" : undefined,
        borderRight: side === "left" ? "1px solid rgba(255,255,255,0.05)" : undefined,
      }}
      className="relative"
    >
      {items.map((u) => {
        const top = (uHeight - u) * uPx;
        return (
          <div
            key={u}
            className="absolute left-0 right-0 flex items-center justify-center"
            style={{ top, height: uPx }}
          >
            {/* Mounting hole */}
            <div
              className="rounded-full"
              style={{
                width: SCREW_DIAMETER,
                height: SCREW_DIAMETER,
                background:
                  "radial-gradient(circle, #050912 30%, #1A2030 100%)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.15), 0 0 0 0.5px rgba(0,0,0,0.5)",
              }}
            />
            {/* U number every 1U on the side */}
            <div
              className="absolute font-mono text-[7px] text-ink-400/80 tabular-nums"
              style={{
                [side === "left" ? "left" : "right"]: 2,
              }}
            >
              {u}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PlacedDevice({
  placement,
  deviceUHeight,
  uPx,
  top,
  selected,
  onSelect,
  onDelete,
  onDragStart,
  onDragEnd,
  children,
}: {
  placement: RackPlacement;
  deviceUHeight: number;
  uPx: number;
  top: number;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="absolute group"
      style={{
        left: 0,
        right: 0,
        top,
        height: deviceUHeight * uPx,
        cursor: "grab",
        outline: selected ? "1.5px solid #F4B740" : undefined,
        outlineOffset: -1,
        zIndex: selected ? 4 : 2,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-rack-placement", placement.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      {children}
      {/* Hover affordances */}
      <div className="absolute -left-1.5 top-0 bottom-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
        <GripVertical className="w-3 h-3 text-amber-knox/80" />
      </div>
      {selected && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute right-1 top-1 w-5 h-5 rounded bg-signal-red/80 hover:bg-signal-red text-white flex items-center justify-center text-xs"
          title="Remove from rack (Del)"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
