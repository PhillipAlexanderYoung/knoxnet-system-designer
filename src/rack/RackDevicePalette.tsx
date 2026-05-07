import { useMemo, useState } from "react";
import {
  rackDevices,
  rackCategoryLabel,
  type RackCategory,
  type RackDeviceType,
} from "../data/rackDevices";
import { RackDeviceFaceplate } from "./RackDeviceFaceplate";
import { Search } from "lucide-react";

const CATEGORIES: RackCategory[] = [
  "switch",
  "router",
  "patch",
  "nvr",
  "server",
  "ups",
  "pdu",
  "kvm",
  "audio",
  "video",
  "lighting",
  "broadcast",
  "wireless",
  "demarc",
  "passive",
];

export function RackDevicePalette() {
  const [filter, setFilter] = useState<RackCategory | "all">("all");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    return rackDevices.filter((d) => {
      if (filter !== "all" && d.category !== filter) return false;
      if (q) {
        const lower = q.toLowerCase();
        if (
          !d.label.toLowerCase().includes(lower) &&
          !d.manufacturer.toLowerCase().includes(lower) &&
          !d.model.toLowerCase().includes(lower)
        )
          return false;
      }
      return true;
    });
  }, [filter, q]);

  return (
    <aside className="w-80 shrink-0 border-r border-white/5 bg-ink-800/60 backdrop-blur-md flex flex-col">
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between">
        <div className="label">Rack Device Library</div>
        <span className="text-[10px] font-mono text-ink-400">
          {list.length} of {rackDevices.length}
        </span>
      </div>
      <div className="px-3 py-2 border-b border-white/5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search switches, NVRs, UPS…"
            className="input pl-8"
          />
        </div>
      </div>
      <div className="px-3 py-2 border-b border-white/5 flex flex-wrap gap-1">
        <Pill active={filter === "all"} onClick={() => setFilter("all")}>
          All
        </Pill>
        {CATEGORIES.map((c) => (
          <Pill key={c} active={filter === c} onClick={() => setFilter(c)}>
            {rackCategoryLabel[c]}
          </Pill>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {list.map((d) => (
          <PaletteItem key={d.id} device={d} />
        ))}
        {list.length === 0 && (
          <div className="text-center text-xs text-ink-400 py-8">
            No matches.
          </div>
        )}
      </div>
      <div className="px-3 py-2 border-t border-white/5 text-[11px] text-ink-400 leading-relaxed">
        Drag a device from here onto the rack to place it.
      </div>
    </aside>
  );
}

function Pill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${active ? "bg-amber-knox/15 border-amber-knox text-amber-knox" : "text-ink-300 hover:text-ink-50 border-white/5 hover:border-white/15"}`}
    >
      {children}
    </button>
  );
}

function PaletteItem({ device }: { device: RackDeviceType }) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("application/x-rack-device", device.id);
        e.dataTransfer.effectAllowed = "copy";
      }}
      className="rounded-md border border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/15 transition-colors cursor-grab active:cursor-grabbing overflow-hidden"
      title={`Drag to place · ${device.manufacturer} ${device.model}`}
    >
      <div className="px-2 pt-2 pb-1 flex items-center justify-between">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-ink-100 truncate">
            {device.label}
          </div>
          <div className="text-[10px] font-mono text-ink-400 truncate">
            {device.manufacturer} · {device.model}
          </div>
        </div>
        <div className="flex flex-col items-end ml-2 shrink-0">
          <span className="text-[10px] font-mono text-amber-knox">
            {device.uHeight}U
          </span>
          <span className="text-[10px] font-mono text-ink-400">
            ${device.defaultCost.toLocaleString()}
          </span>
        </div>
      </div>
      {/* Mini faceplate preview */}
      <div className="px-2 pb-2">
        <div
          className="rounded-sm overflow-hidden"
          style={{ transform: "scale(1)", transformOrigin: "left top" }}
        >
          <RackDeviceFaceplate device={device} uPx={22} widthPx={280} />
        </div>
      </div>
      <div className="px-2 pb-2 flex items-center gap-1.5 flex-wrap">
        {device.powerWatts > 0 && (
          <Spec>{device.powerWatts}W</Spec>
        )}
        <Spec>{device.weightLbs}lb</Spec>
        {device.frontPorts ? <Spec>{device.frontPorts} ports</Spec> : null}
      </div>
    </div>
  );
}

function Spec({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-ink-700/60 text-ink-300">
      {children}
    </span>
  );
}
