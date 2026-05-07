import { useMemo } from "react";
import {
  useProjectStore,
  selectActiveRack,
  type RackPlacement,
} from "../store/projectStore";
import { rackDevicesById } from "../data/rackDevices";
import { Trash2, Server } from "lucide-react";

interface Props {
  selectedPlacementId: string | null;
  onSelectPlacement: (id: string | null) => void;
}

export function RackProperties({ selectedPlacementId, onSelectPlacement }: Props) {
  const rack = useProjectStore(selectActiveRack);
  const project = useProjectStore((s) => s.project);
  const updateRack = useProjectStore((s) => s.updateRack);
  const updatePlacement = useProjectStore((s) => s.updatePlacement);
  const removePlacement = useProjectStore((s) => s.removePlacement);
  const removeRack = useProjectStore((s) => s.removeRack);

  const totals = useMemo(() => {
    if (!rack) return null;
    let usedU = 0;
    let watts = 0;
    let weight = 0;
    let cost = 0;
    for (const p of rack.placements) {
      const d = rackDevicesById[p.deviceId];
      if (!d) continue;
      usedU += d.uHeight;
      watts += d.powerWatts;
      weight += d.weightLbs;
      cost += p.costOverride ?? d.defaultCost;
    }
    return { usedU, watts, weight, cost, freeU: rack.uHeight - usedU };
  }, [rack]);

  const placement = useMemo<RackPlacement | null>(() => {
    if (!rack || !selectedPlacementId) return null;
    return rack.placements.find((p) => p.id === selectedPlacementId) ?? null;
  }, [rack, selectedPlacementId]);

  if (!rack) {
    return (
      <aside className="w-72 shrink-0 border-l border-white/5 bg-ink-800/60 backdrop-blur-md flex items-center justify-center text-xs text-ink-400 px-4 text-center">
        No rack selected. Create one from the toolbar.
      </aside>
    );
  }

  return (
    <aside className="w-72 shrink-0 border-l border-white/5 bg-ink-800/60 backdrop-blur-md flex flex-col">
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between">
        <div className="label">Rack Properties</div>
        <Server className="w-3.5 h-3.5 text-amber-knox" />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {placement ? (
          <PlacementEditor
            key={placement.id}
            placement={placement}
            onChange={(p) => updatePlacement(rack.id, placement.id, p)}
            onDelete={() => {
              removePlacement(rack.id, placement.id);
              onSelectPlacement(null);
            }}
            onClose={() => onSelectPlacement(null)}
          />
        ) : (
          <>
            <Field label="Rack Name">
              <input
                className="input"
                value={rack.name}
                onChange={(e) => updateRack(rack.id, { name: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="U Height">
                <select
                  className="input"
                  value={rack.uHeight}
                  onChange={(e) =>
                    updateRack(rack.id, { uHeight: parseInt(e.target.value, 10) })
                  }
                >
                  {[12, 18, 22, 24, 27, 32, 36, 42, 45, 48].map((u) => (
                    <option key={u} value={u}>
                      {u}U
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Sheet Link">
                <select
                  className="input"
                  value={rack.associatedSheetId ?? ""}
                  onChange={(e) =>
                    updateRack(rack.id, {
                      associatedSheetId: e.target.value || undefined,
                    })
                  }
                >
                  <option value="">— none —</option>
                  {project?.sheets.map((sh) => (
                    <option key={sh.id} value={sh.id}>
                      {sh.sheetNumber || ""} {sh.sheetTitle || sh.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Location">
              <input
                className="input"
                placeholder="e.g. Equipment Room 102"
                value={rack.location ?? ""}
                onChange={(e) =>
                  updateRack(rack.id, { location: e.target.value })
                }
              />
            </Field>

            {totals && (
              <div className="panel rounded-lg p-3 space-y-2">
                <div className="label">Totals</div>
                <Stat label="Used" value={`${totals.usedU} / ${rack.uHeight} U`} accent={totals.usedU > rack.uHeight} />
                <Stat label="Free" value={`${totals.freeU} U`} />
                <Stat label="Power" value={`${totals.watts} W`} />
                <Stat label="Weight" value={`${totals.weight} lb`} />
                <Stat label="Material" value={usd(totals.cost)} />
              </div>
            )}

            <div className="panel rounded-lg p-3 space-y-1">
              <div className="label mb-1">Placements ({rack.placements.length})</div>
              {rack.placements.length === 0 && (
                <div className="text-[11px] text-ink-400 italic">
                  Drag devices from the left palette into the rack.
                </div>
              )}
              {rack.placements
                .slice()
                .sort((a, b) => b.uSlot - a.uSlot)
                .map((p) => {
                  const d = rackDevicesById[p.deviceId];
                  if (!d) return null;
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-2 px-1 py-1 rounded hover:bg-white/5 cursor-pointer"
                      onClick={() => onSelectPlacement(p.id)}
                    >
                      <span className="text-[10px] font-mono text-amber-knox tabular-nums w-12">
                        U{p.uSlot}
                        {d.uHeight > 1 ? `–${p.uSlot + d.uHeight - 1}` : ""}
                      </span>
                      <span className="text-xs text-ink-100 truncate flex-1">
                        {d.label}
                      </span>
                      <span className="text-[10px] font-mono text-ink-400">
                        {d.uHeight}U
                      </span>
                    </div>
                  );
                })}
            </div>

            <button
              onClick={() => {
                if (confirm(`Delete rack "${rack.name}"?`)) {
                  removeRack(rack.id);
                }
              }}
              className="btn w-full justify-center text-signal-red hover:bg-signal-red/10"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Delete this rack
            </button>
          </>
        )}
      </div>
    </aside>
  );
}

function PlacementEditor({
  placement,
  onChange,
  onDelete,
  onClose,
}: {
  placement: RackPlacement;
  onChange: (p: Partial<RackPlacement>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const dev = rackDevicesById[placement.deviceId];
  if (!dev) return null;
  return (
    <>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-amber-knox font-mono">
            U{placement.uSlot}
            {dev.uHeight > 1 ? `–${placement.uSlot + dev.uHeight - 1}` : ""}
          </div>
          <div className="text-sm font-semibold text-ink-100 leading-tight">
            {dev.label}
          </div>
          <div className="text-[10px] font-mono text-ink-400">
            {dev.manufacturer} · {dev.model} · {dev.uHeight}U
          </div>
        </div>
        <button onClick={onClose} className="btn-ghost text-ink-400">×</button>
      </div>

      <Field label="U Slot (bottom of device)">
        <input
          className="input font-mono"
          inputMode="numeric"
          value={placement.uSlot}
          onChange={(e) => {
            const v = parseInt(e.target.value, 10);
            if (isFinite(v)) onChange({ uSlot: v });
          }}
        />
      </Field>
      <Field label="Asset Tag / Label">
        <input
          className="input"
          placeholder="e.g. SW-CORE-01"
          value={placement.label ?? ""}
          onChange={(e) => onChange({ label: e.target.value || undefined })}
        />
      </Field>
      <Field label={`Cost Override (default $${dev.defaultCost.toLocaleString()})`}>
        <input
          className="input"
          inputMode="decimal"
          value={placement.costOverride ?? ""}
          placeholder={dev.defaultCost.toString()}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange({ costOverride: isFinite(v) ? v : undefined });
          }}
        />
      </Field>
      <Field label="Notes">
        <textarea
          className="input min-h-[60px]"
          placeholder="Internal notes (not exported)"
          value={placement.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value })}
        />
      </Field>

      <div className="panel rounded-lg p-3 space-y-1.5 text-xs">
        <Stat label="Power" value={`${dev.powerWatts} W`} />
        <Stat label="Weight" value={`${dev.weightLbs} lb`} />
        <Stat label="Front Ports" value={`${dev.frontPorts ?? 0}`} />
        <Stat label="Labor" value={`${dev.laborHours} hr`} />
      </div>

      <button
        onClick={onDelete}
        className="btn w-full justify-center text-signal-red hover:bg-signal-red/10"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Remove from rack
      </button>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-ink-300">{label}</span>
      <span className={`font-mono tabular-nums ${accent ? "text-signal-red" : "text-ink-100"}`}>
        {value}
      </span>
    </div>
  );
}

function usd(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
