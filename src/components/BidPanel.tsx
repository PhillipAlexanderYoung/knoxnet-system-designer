import { useMemo, useState } from "react";
import {
  useProjectStore,
  defaultBidExportVisibility,
  type BidExportVisibility,
} from "../store/projectStore";
import { computeBid, usd, type BidResult } from "../lib/bid";
import { categoryColor, categoryLabel } from "../brand/tokens";
import { exportBidPdf, exportBidXlsx } from "../export/exportBid";
import {
  Calculator,
  X,
  AlertTriangle,
  Percent,
  Pencil,
  Check,
  RotateCcw,
  Eye,
  EyeOff,
  FileDown,
  FileSpreadsheet,
} from "lucide-react";

type RepriceScope = "all" | "devices" | "cables" | "racks";

export function BidPanel({ className = "" }: { className?: string }) {
  const project = useProjectStore((s) => s.project);
  const toggle = useProjectStore((s) => s.toggleBidPanel);
  const setDeviceOverride = useProjectStore((s) => s.setDeviceOverride);
  const setCableOverride = useProjectStore((s) => s.setCableOverride);
  const setRackOverride = useProjectStore((s) => s.setRackDeviceOverride);
  const setBidLineLaborOverride = useProjectStore((s) => s.setBidLineLaborOverride);
  const updateBidDefaults = useProjectStore((s) => s.updateBidDefaults);
  const setVis = useProjectStore((s) => s.setBidExportVisibility);
  const pushToast = useProjectStore((s) => s.pushToast);
  const bid = useMemo<BidResult | null>(
    () => (project ? computeBid(project) : null),
    [project],
  );
  const [bulkPct, setBulkPct] = useState("");
  const [bulkScope, setBulkScope] = useState<RepriceScope>("all");
  const [exporting, setExporting] = useState<string | null>(null);

  if (!project || !bid) return null;

  const visibility: BidExportVisibility =
    project.bidExportVisibility ?? defaultBidExportVisibility;

  const exp = async (kind: "customer-pdf" | "internal-pdf" | "xlsx") => {
    setExporting(kind);
    try {
      if (kind === "customer-pdf") {
        await exportBidPdf(project, { audience: "customer" });
        pushToast("success", "Customer PDF exported");
      } else if (kind === "internal-pdf") {
        await exportBidPdf(project, { audience: "internal" });
        pushToast("success", "Internal bid PDF exported");
      } else {
        await exportBidXlsx(project, { audience: "internal" });
        pushToast("success", "Bid workbook exported");
      }
    } catch (e) {
      console.error(e);
      pushToast("error", "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const placedSummary =
    bid.devices.length + bid.cables.length + bid.rackDevices.length;

  /**
   * Apply a percentage multiplier to every PLACED line in scope. This
   * differs from the catalog-wide bulk reprice in Settings: items not used
   * on this project are left at their default prices, so the bid only
   * reflects negotiated/marked-up rates for what's actually being sold.
   */
  const applyBulkToPlaced = () => {
    const pct = parseFloat(bulkPct);
    if (!isFinite(pct)) {
      pushToast("error", "Enter a percentage like 10 or -5");
      return;
    }
    const m = 1 + pct / 100;
    if (m <= 0) {
      pushToast("error", "Percentage must result in a positive multiplier");
      return;
    }
    let touched = 0;
    if (bulkScope === "all" || bulkScope === "devices") {
      for (const d of bid.devices) {
        setDeviceOverride(d.deviceId, { cost: round(d.unitCost * m) });
        touched++;
      }
    }
    if (bulkScope === "all" || bulkScope === "cables") {
      for (const c of bid.cables) {
        setCableOverride(c.cableId, { costPerFoot: round(c.costPerFoot * m, 4) });
        touched++;
      }
    }
    if (bulkScope === "all" || bulkScope === "racks") {
      for (const d of bid.rackDevices) {
        setRackOverride(d.deviceId, { cost: round(d.unitCost * m) });
        touched++;
      }
    }
    pushToast(
      "success",
      `${pct >= 0 ? "+" : ""}${pct}% applied to ${touched} placed line${touched === 1 ? "" : "s"}`,
    );
    setBulkPct("");
  };

  const resetPlacedOverrides = () => {
    if (
      !confirm(
        "Reset every placed item back to its catalog default price? Items used elsewhere in the catalog stay untouched.",
      )
    ) return;
    for (const d of bid.devices) setDeviceOverride(d.deviceId, null);
    for (const c of bid.cables) setCableOverride(c.cableId, null);
    for (const d of bid.rackDevices) setRackOverride(d.deviceId, null);
    pushToast("info", "Placed-item overrides reset");
  };

  return (
    <aside className={`w-96 shrink-0 border-l border-white/5 bg-ink-800/85 backdrop-blur-md flex flex-col animate-slide-up ${className}`}>
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-amber-knox" />
          <div className="text-sm font-medium text-ink-50">Live Bid</div>
        </div>
        <button onClick={toggle} className="text-ink-400 hover:text-ink-50">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Bulk reprice (placed items only) */}
        <div className="panel rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Percent className="w-4 h-4 text-amber-knox" />
              <div className="text-xs font-medium text-ink-100">
                Reprice Placed Items
              </div>
            </div>
            <BidHint label="Reset all placed items to default catalog prices">
              <button
                onClick={resetPlacedOverrides}
                disabled={placedSummary === 0}
                className="btn-ghost text-[10px] disabled:opacity-30"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </BidHint>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-1.5">
            <div className="relative">
              <input
                value={bulkPct}
                onChange={(e) => setBulkPct(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applyBulkToPlaced()}
                placeholder="e.g. 15 or -10"
                className="input pr-7 font-mono"
                inputMode="decimal"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-ink-400 font-mono pointer-events-none">
                %
              </span>
            </div>
            <select
              value={bulkScope}
              onChange={(e) => setBulkScope(e.target.value as RepriceScope)}
              className="input w-28"
            >
              <option value="all">All placed</option>
              <option value="devices">Devices</option>
              <option value="cables">Cables</option>
              <option value="racks">Rack equip.</option>
            </select>
          </div>
          <button
            onClick={applyBulkToPlaced}
            disabled={placedSummary === 0 || !bulkPct}
            className="btn-primary w-full justify-center disabled:opacity-40"
          >
            Apply to {bulkScope === "all" ? `${placedSummary} placed lines` : scopeLabel(bulkScope, bid)}
          </button>
          <div className="text-[10px] text-ink-400 leading-relaxed">
            Only items actually placed in this project are repriced. Use
            Settings → Pricing to reprice the entire catalog. Click any unit
            cost or labor total below to edit a single line.
          </div>
        </div>

        {bid.warnings.length > 0 && (
          <div className="rounded-md bg-signal-red/10 border border-signal-red/30 p-2.5 text-[11px] text-signal-red">
            <div className="flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="font-medium">{bid.warnings.length} warning{bid.warnings.length === 1 ? "" : "s"}</span>
            </div>
            {bid.warnings.slice(0, 3).map((w, i) => (
              <div key={i} className="opacity-90">{w}</div>
            ))}
          </div>
        )}

        <Section title="Devices" count={bid.devices.length}>
          {bid.devices.length === 0 && <Empty>No devices placed yet.</Empty>}
          {bid.devices.map((d) => {
            const ov = project.catalogOverrides?.devices?.[d.deviceId];
            return (
              <Row
                key={d.deviceId}
                left={
                  <>
                    <span
                      className="w-2 h-2 rounded-full inline-block mr-2 align-middle"
                      style={{ backgroundColor: categoryColor[d.category] }}
                    />
                    <span className="text-ink-100">{d.label}</span>
                    <span className="text-[10px] text-ink-400 ml-1.5 font-mono">
                      {categoryLabel[d.category]}
                    </span>
                  </>
                }
                qty={`${d.qty}`}
                unitCost={d.unitCost}
                extCost={d.extCost}
                laborHours={d.extLabor}
                calculatedLaborHours={d.calculatedLabor}
                laborOverridden={d.laborOverridden}
                overridden={ov?.cost !== undefined}
                onChangeUnit={(v) => setDeviceOverride(d.deviceId, { cost: v })}
                onResetUnit={() => setDeviceOverride(d.deviceId, null)}
                onChangeLabor={(v) => setBidLineLaborOverride(d.lineId, v)}
                onResetLabor={() => setBidLineLaborOverride(d.lineId, null)}
              />
            );
          })}
        </Section>

        <Section title="Rack Devices" count={bid.rackDevices.length}>
          {bid.rackDevices.length === 0 && (
            <Empty>No rack-mount equipment placed.</Empty>
          )}
          {bid.rackDevices.map((d) => {
            const ov = project.catalogOverrides?.rackDevices?.[d.deviceId];
            return (
              <Row
                key={d.deviceId}
                left={
                  <>
                    <span className="text-ink-100">{d.label}</span>
                    <span className="text-[10px] text-ink-400 ml-1.5 font-mono">
                      {d.manufacturer} · {d.uHeight}U
                    </span>
                  </>
                }
                qty={`${d.qty}`}
                unitCost={d.unitCost}
                extCost={d.extCost}
                laborHours={d.extLabor}
                calculatedLaborHours={d.calculatedLabor}
                laborOverridden={d.laborOverridden}
                overridden={ov?.cost !== undefined}
                onChangeUnit={(v) => setRackOverride(d.deviceId, { cost: v })}
                onResetUnit={() => setRackOverride(d.deviceId, null)}
                onChangeLabor={(v) => setBidLineLaborOverride(d.lineId, v)}
                onResetLabor={() => setBidLineLaborOverride(d.lineId, null)}
              />
            );
          })}
        </Section>

        <Section title="Cable Runs" count={bid.cables.length}>
          {bid.cables.length === 0 && <Empty>No cable runs (or sheet not calibrated).</Empty>}
          {bid.cables.map((c) => {
            const ov = project.catalogOverrides?.cables?.[c.cableId];
            return (
              <Row
                key={c.cableId}
                left={
                  <>
                    <span className="text-ink-100">{c.label}</span>
                    <span className="text-[10px] text-ink-400 ml-1.5 font-mono">
                      {c.totalFeet.toFixed(0)}' (raw {c.rawFeet.toFixed(0)}')
                    </span>
                  </>
                }
                qty={`${c.totalFeet.toFixed(0)}'`}
                unitCost={c.costPerFoot}
                unitLabel="/ft"
                extCost={c.extCost}
                laborHours={c.extLabor}
                calculatedLaborHours={c.calculatedLabor}
                laborOverridden={c.laborOverridden}
                overridden={ov?.costPerFoot !== undefined}
                onChangeUnit={(v) => setCableOverride(c.cableId, { costPerFoot: v })}
                onResetUnit={() => setCableOverride(c.cableId, null)}
                onChangeLabor={(v) => setBidLineLaborOverride(c.lineId, v)}
                onResetLabor={() => setBidLineLaborOverride(c.lineId, null)}
              />
            );
          })}
        </Section>

        <Section title="Rollup">
          <div className="text-[10px] text-ink-400 leading-relaxed mb-1.5">
            Click a rate or line labor total to edit. Use the <Eye className="w-2.5 h-2.5 inline-block" /> toggle to choose what shows on the customer-facing export.
          </div>
          <RollupRow
            label="Material"
            value={usd(bid.totals.materialCost)}
            visible={visibility.material}
            onToggleVisible={() => setVis("material", !visibility.material)}
          />
          <RollupRow
            label="Labor"
            sub={`${bid.totals.laborHours.toFixed(1)} hr × $`}
            rate={project.bidDefaults.laborRate}
            rateUnit="/hr"
            value={usd(bid.totals.laborCost)}
            visible={visibility.labor}
            onToggleVisible={() => setVis("labor", !visibility.labor)}
            onChangeRate={(v) => updateBidDefaults({ laborRate: v })}
          />
          <RollupRow
            label="Overhead"
            rate={project.bidDefaults.overheadPercent}
            rateUnit="%"
            value={usd(bid.totals.overhead)}
            visible={visibility.overhead}
            onToggleVisible={() => setVis("overhead", !visibility.overhead)}
            onChangeRate={(v) => updateBidDefaults({ overheadPercent: v })}
          />
          <RollupRow
            label="Tax"
            sub="on materials"
            rate={project.bidDefaults.taxRate}
            rateUnit="%"
            value={usd(bid.totals.tax)}
            visible={visibility.tax}
            onToggleVisible={() => setVis("tax", !visibility.tax)}
            onChangeRate={(v) => updateBidDefaults({ taxRate: v })}
          />
          <RollupRow
            label="Margin"
            rate={project.bidDefaults.marginPercent}
            rateUnit="%"
            value={usd(bid.totals.margin)}
            visible={visibility.margin}
            onToggleVisible={() => setVis("margin", !visibility.margin)}
            onChangeRate={(v) => updateBidDefaults({ marginPercent: v })}
          />
          <div className="my-2 divider" />
          <div className="flex justify-between items-baseline">
            <span className="text-sm text-ink-100">Grand Total</span>
            <span className="text-2xl font-extrabold text-amber-knox">
              {usd(bid.totals.grandTotal)}
            </span>
          </div>
        </Section>

        <div className="panel rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <FileDown className="w-4 h-4 text-amber-knox" />
            <div className="text-xs font-medium text-ink-100">Quick Export</div>
          </div>
          <BidHint
            label="Branded PDF with rollup lines hidden per your visibility settings"
            className="w-full"
          >
            <button
              onClick={() => exp("customer-pdf")}
              disabled={exporting !== null}
              className="btn-primary w-full justify-center disabled:opacity-50"
            >
              <FileDown className="w-3.5 h-3.5" />
              {exporting === "customer-pdf" ? "Exporting…" : "Customer PDF"}
            </button>
          </BidHint>
          <div className="grid grid-cols-2 gap-1.5">
            <BidHint
              label="Full internal breakdown with overhead, margin, unit costs"
              className="w-full"
            >
              <button
                onClick={() => exp("internal-pdf")}
                disabled={exporting !== null}
                className="btn w-full justify-center disabled:opacity-50"
              >
                <FileDown className="w-3.5 h-3.5" />
                <span className="text-xs">Internal PDF</span>
              </button>
            </BidHint>
            <BidHint
              label="Internal workbook (Devices, Cables, Racks, Sheets)"
              className="w-full"
            >
              <button
                onClick={() => exp("xlsx")}
                disabled={exporting !== null}
                className="btn w-full justify-center disabled:opacity-50"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span className="text-xs">XLSX</span>
              </button>
            </BidHint>
          </div>
          <div className="text-[10px] text-ink-400 leading-relaxed">
            Customer view hides any rollup line marked
            <EyeOff className="w-2.5 h-2.5 inline-block mx-0.5" />
            and strips per-line cost columns.
          </div>
        </div>
      </div>
    </aside>
  );
}

function scopeLabel(scope: RepriceScope, bid: BidResult): string {
  switch (scope) {
    case "devices":
      return `${bid.devices.length} device line${bid.devices.length === 1 ? "" : "s"}`;
    case "cables":
      return `${bid.cables.length} cable line${bid.cables.length === 1 ? "" : "s"}`;
    case "racks":
      return `${bid.rackDevices.length} rack line${bid.rackDevices.length === 1 ? "" : "s"}`;
    default:
      return "lines";
  }
}

function round(n: number, decimals = 2) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="panel rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="label">{title}</div>
        {count !== undefined && (
          <span className="text-[10px] font-mono text-ink-400">{count}</span>
        )}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

interface RowProps {
  left: React.ReactNode;
  qty: string;
  unitCost: number;
  unitLabel?: string;
  extCost: number;
  laborHours: number;
  calculatedLaborHours: number;
  laborOverridden: boolean;
  overridden: boolean;
  onChangeUnit: (v: number) => void;
  onResetUnit: () => void;
  onChangeLabor: (v: number) => void;
  onResetLabor: () => void;
}

function Row({
  left,
  qty,
  unitCost,
  unitLabel,
  extCost,
  laborHours,
  calculatedLaborHours,
  laborOverridden,
  overridden,
  onChangeUnit,
  onResetUnit,
  onChangeLabor,
  onResetLabor,
}: RowProps) {
  const [editing, setEditing] = useState(false);
  const [editingLabor, setEditingLabor] = useState(false);
  const [val, setVal] = useState("");
  const [laborVal, setLaborVal] = useState("");

  const commit = () => {
    const v = parseFloat(val);
    if (isFinite(v) && v >= 0) onChangeUnit(round(v, 4));
    setEditing(false);
  };

  const commitLabor = () => {
    const v = parseFloat(laborVal);
    if (isFinite(v) && v >= 0) onChangeLabor(round(v, 2));
    setEditingLabor(false);
  };

  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-start text-xs py-0.5 group">
      <div className="truncate min-w-0">{left}</div>
      <div className="font-mono text-ink-300 text-right tabular-nums pt-0.5">
        {qty}
      </div>
      <div className="font-mono text-ink-100 text-right tabular-nums min-w-[88px]">
        <div className="font-bold text-ink-50 leading-tight">{usd(extCost)}</div>
        {editing ? (
          <div className="mt-0.5 flex items-center gap-0.5 justify-end">
            <input
              autoFocus
              defaultValue={unitCost.toString()}
              onChange={(e) => setVal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(false);
              }}
              onBlur={commit}
              className="bg-ink-900 border border-amber-knox/50 rounded px-1 py-0 w-16 text-[10px] font-mono text-ink-50 text-right focus:outline-none"
            />
            <BidHint label="Save">
              <button
                onClick={commit}
                className="text-amber-knox hover:text-amber-glow"
              >
                <Check className="w-3 h-3" />
              </button>
            </BidHint>
          </div>
        ) : (
          <BidHint
            label={
              overridden
                ? "Custom price set — click to edit, double-click to reset"
                : "Click to override unit price"
            }
            className="ml-auto"
          >
            <button
              onClick={() => {
                setVal(unitCost.toString());
                setEditing(true);
              }}
              className={`mt-0.5 flex items-center gap-1 text-[10px] font-mono leading-tight hover:text-amber-knox transition-colors ${overridden ? "text-amber-knox" : "text-ink-400"}`}
              onDoubleClick={() => overridden && onResetUnit()}
            >
              <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
              ${unitCost.toFixed(unitCost < 1 ? 3 : 2)}
              {unitLabel}
            </button>
          </BidHint>
        )}
        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10px] leading-tight">
          {editingLabor ? (
            <>
              <input
                autoFocus
                defaultValue={laborHours.toString()}
                onChange={(e) => setLaborVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitLabor();
                  if (e.key === "Escape") setEditingLabor(false);
                }}
                onBlur={commitLabor}
                className="bg-ink-900 border border-amber-knox/50 rounded px-1 py-0 w-14 text-[10px] font-mono text-ink-50 text-right focus:outline-none"
              />
              <BidHint label="Save labor hours">
                <button
                  onClick={commitLabor}
                  className="text-amber-knox hover:text-amber-glow"
                >
                  <Check className="w-3 h-3" />
                </button>
              </BidHint>
            </>
          ) : (
            <>
              <BidHint
                label={
                  laborOverridden
                    ? `Labor overridden from ${calculatedLaborHours.toFixed(1)} hr. Click to edit.`
                    : "Click to override total labor hours for this bid line"
                }
              >
                <button
                  onClick={() => {
                    setLaborVal(laborHours.toString());
                    setEditingLabor(true);
                  }}
                  className={`font-mono hover:text-amber-knox transition-colors ${laborOverridden ? "text-amber-knox" : "text-ink-500"}`}
                >
                  {laborHours.toFixed(1)} hr
                  {laborOverridden ? " override" : ""}
                </button>
              </BidHint>
              {laborOverridden && (
                <BidHint label={`Reset to calculated labor (${calculatedLaborHours.toFixed(1)} hr)`}>
                  <button
                    onClick={onResetLabor}
                    className="text-ink-500 hover:text-amber-knox"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                  </button>
                </BidHint>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-ink-400 italic">{children}</div>;
}

interface RollupRowProps {
  label: string;
  /** Optional context text shown after the label (e.g. "on materials") */
  sub?: string;
  /** Editable rate (laborRate / overhead% / tax% / margin%) */
  rate?: number;
  /** Suffix shown after the rate value, e.g. "/hr" or "%" */
  rateUnit?: string;
  /** The computed dollar value to display on the right */
  value: string;
  /** Whether this line is shown on customer-facing exports */
  visible: boolean;
  onToggleVisible: () => void;
  onChangeRate?: (v: number) => void;
}

function RollupRow({
  label,
  sub,
  rate,
  rateUnit,
  value,
  visible,
  onToggleVisible,
  onChangeRate,
}: RollupRowProps) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState("");

  const commit = () => {
    if (onChangeRate) {
      const v = parseFloat(val);
      if (isFinite(v) && v >= 0) onChangeRate(v);
    }
    setEditing(false);
  };

  return (
    <div
      className={`grid grid-cols-[16px_1fr_auto] gap-2 items-center text-xs py-1 px-1 rounded -mx-1 group ${visible ? "" : "opacity-60"}`}
    >
      <BidHint
        label={visible ? "Hidden in customer export — click to show" : "Visible in customer export — click to hide"}
        align="left"
      >
        <button
          onClick={onToggleVisible}
          className="text-ink-400 hover:text-amber-knox transition-colors"
          style={{ width: 16, height: 16 }}
        >
          {visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>
      </BidHint>
      <div className="min-w-0 flex items-baseline flex-wrap gap-1">
        <span className="text-ink-200">{label}</span>
        {sub && <span className="text-[10px] text-ink-400 font-mono">{sub}</span>}
        {rate !== undefined && onChangeRate && (
          editing ? (
            <span className="inline-flex items-center gap-0.5">
              <input
                autoFocus
                defaultValue={rate.toString()}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commit();
                  if (e.key === "Escape") setEditing(false);
                }}
                onBlur={commit}
                className="bg-ink-900 border border-amber-knox/50 rounded px-1 py-0 w-12 text-[11px] font-mono text-ink-50 text-right focus:outline-none"
              />
              <span className="text-[10px] text-ink-400 font-mono">{rateUnit}</span>
              <button onClick={commit} className="text-amber-knox hover:text-amber-glow ml-0.5">
                <Check className="w-3 h-3" />
              </button>
            </span>
          ) : (
            <BidHint label="Click to edit rate" align="left">
              <button
                onClick={() => {
                  setVal(String(rate));
                  setEditing(true);
                }}
                className="text-[11px] font-mono text-ink-100 hover:text-amber-knox transition-colors flex items-center gap-1"
              >
                <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                {rateUnit === "/hr" ? "$" : ""}
                {rate}
                {rateUnit}
              </button>
            </BidHint>
          )
        )}
      </div>
      <span className="font-mono text-ink-100 tabular-nums text-right">{value}</span>
    </div>
  );
}

function BidHint({
  label,
  children,
  align = "right",
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <span className={`relative inline-flex group/bid-hint ${className}`}>
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full z-50 mt-1 max-w-[min(18rem,calc(100vw_-_2rem))] whitespace-normal break-words rounded-md border border-white/10 bg-ink-900/95 px-2 py-1 text-left text-[10px] font-medium leading-snug text-ink-100 opacity-0 shadow-panel transition-opacity duration-150 group-hover/bid-hint:opacity-100 group-focus-within/bid-hint:opacity-100 ${align === "left" ? "left-0" : "right-0"}`}
      >
        {label}
      </span>
    </span>
  );
}
