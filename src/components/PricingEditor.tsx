import { useMemo, useState } from "react";
import { useProjectStore } from "../store/projectStore";
import { devices as deviceCatalog } from "../data/devices";
import { cables as cableCatalog } from "../data/cables";
import { rackDevices as rackCatalog } from "../data/rackDevices";
import { categoryColor, categoryLabel } from "../brand/tokens";
import {
  resolveDeviceCost,
  resolveDeviceLabor,
  resolveCableCost,
  resolveCableLabor,
  resolveRackCost,
  resolveRackLabor,
  overrideStats,
} from "../lib/pricing";
import {
  Search,
  Percent,
  RotateCcw,
  Tag as TagIcon,
  Cable,
  Server,
} from "lucide-react";

type Tab = "devices" | "cables" | "racks";

/**
 * Live, per-project pricing editor. Edits are stored as catalog overrides on
 * the project — they don't mutate the underlying device library, and they
 * persist with the project. Bulk multiplier lets the user re-price a whole
 * category at once.
 */
export function PricingEditor() {
  const project = useProjectStore((s) => s.project);
  const setDeviceOverride = useProjectStore((s) => s.setDeviceOverride);
  const setCableOverride = useProjectStore((s) => s.setCableOverride);
  const setRackDeviceOverride = useProjectStore((s) => s.setRackDeviceOverride);
  const applyBulk = useProjectStore((s) => s.applyBulkPriceMultiplier);
  const resetAll = useProjectStore((s) => s.resetCatalogOverrides);
  const [tab, setTab] = useState<Tab>("devices");
  const [q, setQ] = useState("");
  const [bulkPct, setBulkPct] = useState("");
  const stats = overrideStats(project);

  const o = project?.catalogOverrides;

  const matches = (s: string) =>
    !q || s.toLowerCase().includes(q.toLowerCase());

  const onBulk = (target: "all" | "devices" | "cables" | "rackDevices") => {
    const pct = parseFloat(bulkPct);
    if (!isFinite(pct)) {
      alert("Enter a percentage like 10 (= +10%) or -5 (= -5%)");
      return;
    }
    const multiplier = 1 + pct / 100;
    if (multiplier <= 0) return;
    applyBulk(target, multiplier);
  };

  return (
    <div className="space-y-3">
      {/* Tabs */}
      <div className="inline-flex items-center bg-ink-700/60 border border-white/5 rounded-md p-0.5">
        <TabBtn active={tab === "devices"} onClick={() => setTab("devices")} icon={<TagIcon className="w-3.5 h-3.5" />}>
          Devices
        </TabBtn>
        <TabBtn active={tab === "cables"} onClick={() => setTab("cables")} icon={<Cable className="w-3.5 h-3.5" />}>
          Cables
        </TabBtn>
        <TabBtn active={tab === "racks"} onClick={() => setTab("racks")} icon={<Server className="w-3.5 h-3.5" />}>
          Rack Equip.
        </TabBtn>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="input pl-8"
        />
      </div>

      {/* Bulk operations */}
      <div className="panel rounded-lg p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Percent className="w-4 h-4 text-amber-knox" />
          <div className="text-xs font-medium text-ink-100">Bulk Price Adjustment</div>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={bulkPct}
            onChange={(e) => setBulkPct(e.target.value)}
            placeholder="e.g. 10 or -5"
            className="input flex-1 font-mono"
            inputMode="decimal"
          />
          <span className="text-[11px] font-mono text-ink-300">%</span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button onClick={() => onBulk("devices")} className="btn justify-center text-xs">
            Devices
          </button>
          <button onClick={() => onBulk("cables")} className="btn justify-center text-xs">
            Cables
          </button>
          <button onClick={() => onBulk("rackDevices")} className="btn justify-center text-xs">
            Rack Equip.
          </button>
          <button onClick={() => onBulk("all")} className="btn-primary justify-center text-xs">
            All Catalog
          </button>
        </div>
        <div className="text-[10px] text-ink-400 leading-relaxed">
          Multiplies current prices by (1 + %/100). Applies on top of any
          existing overrides — apply +10% twice for +21% effective.
        </div>
      </div>

      {/* Override stats + reset */}
      <div className="flex items-center justify-between text-[11px] font-mono text-ink-300 px-1">
        <span>
          {stats.total > 0 ? (
            <span className="text-amber-knox">
              {stats.total} item{stats.total === 1 ? "" : "s"} re-priced
            </span>
          ) : (
            <span>Catalog at default prices</span>
          )}
        </span>
        {stats.total > 0 && (
          <button
            onClick={() => {
              if (confirm("Reset every override back to catalog defaults?")) {
                resetAll();
              }
            }}
            className="btn-ghost text-[10px] hover:text-signal-red"
          >
            <RotateCcw className="w-3 h-3" />
            Reset all
          </button>
        )}
      </div>

      {/* Editable list */}
      <div className="panel rounded-lg overflow-hidden">
        <div className="grid grid-cols-[1fr_72px_72px_24px] gap-2 px-3 py-1.5 border-b border-white/5 label">
          <span>Item</span>
          <span className="text-right">{tab === "cables" ? "$/ft" : "Cost"}</span>
          <span className="text-right">{tab === "cables" ? "hr/ft" : "Labor"}</span>
          <span></span>
        </div>
        <div className="max-h-[400px] overflow-y-auto">
          {tab === "devices" &&
            deviceCatalog
              .filter((d) => matches(d.label) || matches(d.shortCode))
              .map((d) => {
                const ov = o?.devices?.[d.id];
                const cost = resolveDeviceCost(d, o);
                const labor = resolveDeviceLabor(d, o);
                const isOverridden = !!(ov?.cost !== undefined || ov?.labor !== undefined);
                return (
                  <PriceRow
                    key={d.id}
                    overridden={isOverridden}
                    iconColor={categoryColor[d.category] ?? "#94A0B8"}
                    label={d.label}
                    sub={`${categoryLabel[d.category]} · ${d.shortCode}`}
                    defaultCost={d.defaultCost}
                    defaultLabor={d.laborHours}
                    cost={cost}
                    labor={labor}
                    onChangeCost={(v) => setDeviceOverride(d.id, { cost: v })}
                    onChangeLabor={(v) => setDeviceOverride(d.id, { labor: v })}
                    onReset={() => setDeviceOverride(d.id, null)}
                  />
                );
              })}
          {tab === "cables" &&
            cableCatalog
              .filter((c) => matches(c.label) || matches(c.shortCode))
              .map((c) => {
                const ov = o?.cables?.[c.id];
                const cpf = resolveCableCost(c, o);
                const lpf = resolveCableLabor(c, o);
                const isOverridden = !!(
                  ov?.costPerFoot !== undefined || ov?.laborPerFoot !== undefined
                );
                return (
                  <PriceRow
                    key={c.id}
                    overridden={isOverridden}
                    iconColor={c.color}
                    label={c.label}
                    sub={c.shortCode}
                    defaultCost={c.costPerFoot}
                    defaultLabor={c.laborPerFoot}
                    cost={cpf}
                    labor={lpf}
                    laborStep={0.001}
                    onChangeCost={(v) => setCableOverride(c.id, { costPerFoot: v })}
                    onChangeLabor={(v) => setCableOverride(c.id, { laborPerFoot: v })}
                    onReset={() => setCableOverride(c.id, null)}
                  />
                );
              })}
          {tab === "racks" &&
            rackCatalog
              .filter((d) =>
                matches(d.label) ||
                matches(d.manufacturer) ||
                matches(d.model),
              )
              .map((d) => {
                const ov = o?.rackDevices?.[d.id];
                const cost = resolveRackCost(d, o);
                const labor = resolveRackLabor(d, o);
                const isOverridden = !!(ov?.cost !== undefined || ov?.labor !== undefined);
                return (
                  <PriceRow
                    key={d.id}
                    overridden={isOverridden}
                    iconColor="#F4B740"
                    label={d.label}
                    sub={`${d.manufacturer} · ${d.model} · ${d.uHeight}U`}
                    defaultCost={d.defaultCost}
                    defaultLabor={d.laborHours}
                    cost={cost}
                    labor={labor}
                    onChangeCost={(v) => setRackDeviceOverride(d.id, { cost: v })}
                    onChangeLabor={(v) => setRackDeviceOverride(d.id, { labor: v })}
                    onReset={() => setRackDeviceOverride(d.id, null)}
                  />
                );
              })}
        </div>
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${active ? "bg-amber-knox/15 text-amber-knox" : "text-ink-300 hover:text-ink-100"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function PriceRow({
  overridden,
  iconColor,
  label,
  sub,
  defaultCost,
  defaultLabor,
  cost,
  labor,
  laborStep = 0.05,
  onChangeCost,
  onChangeLabor,
  onReset,
}: {
  overridden: boolean;
  iconColor: string;
  label: string;
  sub: string;
  defaultCost: number;
  defaultLabor: number;
  cost: number;
  labor: number;
  laborStep?: number;
  onChangeCost: (v: number) => void;
  onChangeLabor: (v: number) => void;
  onReset: () => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_72px_72px_24px] gap-2 items-center px-3 py-1.5 border-b border-white/5 hover:bg-white/[0.02]">
      <div className="min-w-0 flex items-center gap-2">
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: iconColor }}
        />
        <div className="min-w-0">
          <div className="text-xs text-ink-100 truncate">{label}</div>
          <div className="text-[10px] font-mono text-ink-400 truncate">
            {sub}
          </div>
        </div>
      </div>
      <input
        className={`input font-mono text-xs text-right ${overridden ? "ring-1 ring-amber-knox/40" : ""}`}
        inputMode="decimal"
        value={cost.toString()}
        title={`Default: ${defaultCost}`}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (isFinite(v)) onChangeCost(v);
        }}
      />
      <input
        className={`input font-mono text-xs text-right ${overridden ? "ring-1 ring-amber-knox/40" : ""}`}
        inputMode="decimal"
        step={laborStep}
        value={labor.toString()}
        title={`Default: ${defaultLabor}`}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (isFinite(v)) onChangeLabor(v);
        }}
      />
      <button
        onClick={onReset}
        disabled={!overridden}
        className={`text-ink-400 hover:text-amber-knox text-xs ${!overridden ? "opacity-30 cursor-default" : ""}`}
        title="Reset to default"
      >
        <RotateCcw className="w-3 h-3" />
      </button>
    </div>
  );
}
