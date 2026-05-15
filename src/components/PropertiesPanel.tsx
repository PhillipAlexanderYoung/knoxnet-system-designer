import { useMemo, useState } from "react";
import {
  useProjectStore,
  selectActiveSheet,
  type Markup,
  type DeviceMarkup,
  type DeviceCoverageOverride,
  type NetworkConfig,
  type CameraStreamConfig,
  type PtzConfig,
  type WirelessConfig,
  type SwitchConfig,
  type AccessControlConfig,
  type DeviceSystemConfig,
  type DeviceConnection,
  type PortSpec,
} from "../store/projectStore";
import { devicesById, effectiveDevicePorts } from "../data/devices";
import {
  effectivePortsForTag,
  findPort,
} from "../lib/connections";
import { cables, cablesById } from "../data/cables";
import { categoryColor, categoryLabel } from "../brand/tokens";
import { resolveCoverage, type EffectiveCoverage } from "../lib/coverage";
import {
  LENS_PRESETS,
  SENSOR_FORMATS,
  calcHFovDeg,
} from "../data/lenses";
import type { SensorFormat } from "../store/projectStore";
import {
  Trash2,
  Copy,
  RotateCw,
  Lock,
  LockOpen,
  Eye,
  EyeOff,
  RotateCcw,
  Radar,
  Network,
  ChevronDown,
  Video,
  Cpu,
  Plug,
  Plus,
  X,
} from "lucide-react";

export function PropertiesPanel() {
  const sheet = useProjectStore(selectActiveSheet);
  const selected = useProjectStore((s) => s.selectedMarkupIds);
  const updateMarkup = useProjectStore((s) => s.updateMarkup);
  const deleteMarkup = useProjectStore((s) => s.deleteMarkup);
  const setSelected = useProjectStore((s) => s.setSelected);
  const updateSheet = useProjectStore((s) => s.updateSheet);
  const updateProjectMeta = useProjectStore((s) => s.updateProjectMeta);
  const project = useProjectStore((s) => s.project);
  const addMarkup = useProjectStore((s) => s.addMarkup);
  const nextTag = useProjectStore((s) => s.nextTag);

  const selectedMarkups = useMemo(() => {
    if (!sheet) return [];
    return sheet.markups.filter((m) => selected.includes(m.id));
  }, [sheet, selected]);

  const single = selectedMarkups.length === 1 ? selectedMarkups[0] : null;
  const multi = selectedMarkups.length > 1 ? selectedMarkups : null;

  const onDuplicate = () => {
    if (!sheet) return;
    const newIds: string[] = [];
    for (const m of selectedMarkups) {
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

  return (
    <aside className="w-72 shrink-0 border-l border-white/5 bg-ink-800/60 backdrop-blur-md flex flex-col">
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between">
        <div className="label">Properties</div>
        {selectedMarkups.length > 0 && (
          <span className="text-[11px] font-mono text-ink-400">
            {selectedMarkups.length} selected
          </span>
        )}
      </div>

      {selectedMarkups.length > 0 && (
        <div className="px-3 py-2 border-b border-white/5 flex items-center gap-1">
          <button onClick={onDuplicate} className="btn-ghost flex-1 justify-center" title="Duplicate (offset by 24pt)">
            <Copy className="w-3.5 h-3.5" />
            <span className="text-xs">Duplicate</span>
          </button>
          <button
            onClick={() => {
              selectedMarkups.forEach((m) => deleteMarkup(m.id));
              setSelected([]);
            }}
            className="btn-ghost flex-1 justify-center text-signal-red hover:bg-signal-red/10"
            title="Delete (Del)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="text-xs">Delete</span>
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {single ? (
          <SingleMarkupEditor
            markup={single}
            onChange={(patch) => updateMarkup(single.id, patch as any)}
          />
        ) : multi ? (
          <MultiMarkupEditor
            markups={multi}
            onApply={(patch) =>
              multi.forEach((m) => updateMarkup(m.id, patch as any))
            }
          />
        ) : (
          <>
            <SectionTitle>Sheet</SectionTitle>
            {sheet ? (
              <div className="space-y-2">
                <Field label="Sheet Number">
                  <input
                    className="input"
                    value={sheet.sheetNumber ?? ""}
                    placeholder="S-01"
                    onChange={(e) => updateSheet(sheet.id, { sheetNumber: e.target.value })}
                  />
                </Field>
                <Field label="Sheet Title">
                  <input
                    className="input"
                    value={sheet.sheetTitle ?? ""}
                    onChange={(e) => updateSheet(sheet.id, { sheetTitle: e.target.value })}
                  />
                </Field>
                <Field label="Scale Note">
                  <input
                    className="input"
                    placeholder={"e.g. 1\" = 20'-0\""}
                    value={sheet.scaleNote ?? ""}
                    onChange={(e) => updateSheet(sheet.id, { scaleNote: e.target.value })}
                  />
                </Field>
                <Field label="Revision">
                  <input
                    className="input"
                    value={sheet.revision ?? ""}
                    onChange={(e) => updateSheet(sheet.id, { revision: e.target.value })}
                  />
                </Field>
                {sheet.calibration && (
                  <div className="bg-signal-green/10 border border-signal-green/30 rounded-md px-2 py-1.5 text-[11px] font-mono text-signal-green">
                    ✓ Calibrated · {sheet.calibration.pixelsPerFoot.toFixed(2)} px/ft
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-ink-400">No sheet open.</div>
            )}

            <SectionTitle>Project</SectionTitle>
            {project && (
              <div className="space-y-2">
                <Field label="Project Number">
                  <input
                    className="input"
                    value={project.meta.projectNumber}
                    onChange={(e) => updateProjectMeta({ projectNumber: e.target.value })}
                  />
                </Field>
                <Field label="Client">
                  <input
                    className="input"
                    value={project.meta.client}
                    onChange={(e) => updateProjectMeta({ client: e.target.value })}
                  />
                </Field>
                <Field label="Location">
                  <input
                    className="input"
                    value={project.meta.location}
                    onChange={(e) => updateProjectMeta({ location: e.target.value })}
                  />
                </Field>
                <Field label="Drawn By">
                  <input
                    className="input"
                    value={project.meta.drawnBy}
                    onChange={(e) => updateProjectMeta({ drawnBy: e.target.value })}
                  />
                </Field>
                <Field label="Revision">
                  <input
                    className="input"
                    value={project.meta.revision}
                    onChange={(e) => updateProjectMeta({ revision: e.target.value })}
                  />
                </Field>
                <Field label="Project Summary">
                  <textarea
                    className="input min-h-[64px] resize-y"
                    value={project.meta.summary ?? ""}
                    placeholder="Short scope-of-work paragraph that prints on the cover page."
                    onChange={(e) => updateProjectMeta({ summary: e.target.value })}
                  />
                  <div className="text-[10px] text-ink-500 mt-0.5">
                    Renders as the cover page's "Project Summary" section. Leave
                    blank to suppress.
                  </div>
                </Field>
              </div>
            )}

            <div className="text-[11px] text-ink-400 pt-2 border-t border-white/5 leading-relaxed">
              Tip: click a markup to edit. Shift-click to add to selection.
              Arrow keys nudge (Shift = 10×). Press <kbd className="kbd">Del</kbd> to remove.
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

// ───── Sections ─────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="label pt-1 first:pt-0">{children}</div>;
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <div className="label mb-1">{label}</div>
        {hint && <div className="text-[10px] text-ink-500 font-mono">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

// ───── Single editor ─────

function SingleMarkupEditor({
  markup,
  onChange,
}: {
  markup: Markup;
  onChange: (patch: any) => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between">
        <SectionTitle>{describeKind(markup.kind)}</SectionTitle>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onChange({ locked: !markup.locked })}
            className="btn-ghost"
            title={markup.locked ? "Unlock" : "Lock"}
          >
            {markup.locked ? <Lock className="w-3.5 h-3.5" /> : <LockOpen className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => onChange({ hidden: !markup.hidden })}
            className="btn-ghost"
            title={markup.hidden ? "Show" : "Hide"}
          >
            {markup.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {markup.kind === "device" && <DeviceProps markup={markup} onChange={onChange} />}
      {markup.kind === "cable" && <CableProps markup={markup} onChange={onChange} />}
      {(markup.kind === "text" || markup.kind === "callout") && (
        <Field label="Text">
          <textarea
            className="input min-h-[80px]"
            value={(markup as any).text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
          />
        </Field>
      )}
      {markup.kind !== "device" && markup.kind !== "cable" && "color" in (markup as any) && (
        <Field label="Color">
          <ColorPicker
            value={(markup as any).color}
            onChange={(c) => onChange({ color: c })}
          />
        </Field>
      )}
      {(markup.kind === "rect" || markup.kind === "polygon" || markup.kind === "freehand") && (
        <PositionFields markup={markup as any} onChange={onChange} />
      )}
      <Field label="Notes">
        <textarea
          className="input min-h-[60px]"
          value={markup.notes ?? ""}
          onChange={(e) => onChange({ notes: e.target.value })}
          placeholder="Internal notes (not exported)"
        />
      </Field>
    </>
  );
}

function DeviceProps({
  markup,
  onChange,
}: {
  markup: DeviceMarkup;
  onChange: (p: Partial<DeviceMarkup>) => void;
}) {
  const dev = devicesById[markup.deviceId];
  if (!dev) return null;
  const color = markup.colorOverride ?? categoryColor[dev.category] ?? "#94A0B8";
  const size = markup.size ?? 28;
  const layers = useProjectStore.getState().layers;

  return (
    <>
      <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-ink-900/60 border border-white/5">
        <span
          className="w-7 h-7 rounded-full inline-flex items-center justify-center shrink-0"
          style={{ backgroundColor: color + "1f", border: `1px solid ${color}` }}
        >
          <svg viewBox="0 0 24 24" width={16} height={16}>
            {dev.icon.paths.map((p, i) => (
              <path
                key={i}
                d={p.d}
                fill={p.fill === "currentFill" ? color + "33" : p.fill === "currentStroke" ? color : (p.fill ?? "none")}
                stroke={p.stroke === "currentStroke" ? color : (p.stroke ?? "none")}
                strokeWidth={p.strokeWidth ?? 0}
              />
            ))}
          </svg>
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-medium text-ink-100 truncate">{dev.label}</div>
          <div className="text-[10px] font-mono text-ink-400">
            {categoryLabel[dev.category]} · ${dev.defaultCost.toFixed(0)}
          </div>
        </div>
      </div>

      <Field label="Tag">
        <input
          className="input font-mono"
          value={markup.tag ?? ""}
          onChange={(e) => onChange({ tag: e.target.value })}
          placeholder="CAM-01"
        />
      </Field>
      <Field label="Display Label" hint="optional">
        <input
          className="input"
          value={markup.labelOverride ?? ""}
          onChange={(e) => onChange({ labelOverride: e.target.value || undefined })}
          placeholder="e.g. Bandshell East"
        />
      </Field>

      <Field label="Position (X, Y)">
        <div className="grid grid-cols-2 gap-1.5">
          <input
            className="input font-mono"
            inputMode="numeric"
            value={Math.round(markup.x)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (isFinite(v)) onChange({ x: v });
            }}
          />
          <input
            className="input font-mono"
            inputMode="numeric"
            value={Math.round(markup.y)}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (isFinite(v)) onChange({ y: v });
            }}
          />
        </div>
      </Field>

      <Field label="Icon Size" hint={`${Math.round(size)} pt`}>
        <input
          type="range"
          min={14}
          max={72}
          step={1}
          value={size}
          onChange={(e) => onChange({ size: parseInt(e.target.value, 10) })}
          className="w-full accent-amber-knox"
        />
      </Field>

      <Field label="Rotation" hint={`${markup.rotation ?? 0}°`}>
        <div className="flex items-center gap-1.5">
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={markup.rotation ?? 0}
            onChange={(e) => onChange({ rotation: parseInt(e.target.value, 10) })}
            className="flex-1 accent-amber-knox"
          />
          <button
            onClick={() => onChange({ rotation: ((markup.rotation ?? 0) + 90) % 360 })}
            className="btn-ghost"
            title="Rotate 90°"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </Field>

      <Field label="Color">
        <ColorPicker
          value={color}
          onChange={(c) => onChange({ colorOverride: c })}
          onReset={() => onChange({ colorOverride: undefined })}
          isDefault={!markup.colorOverride}
        />
      </Field>

      <Field label="Cost Override (USD)" hint={`default $${dev.defaultCost.toFixed(2)}`}>
        <input
          className="input"
          inputMode="decimal"
          value={markup.costOverride ?? ""}
          placeholder={`${dev.defaultCost.toFixed(2)}`}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange({ costOverride: isFinite(v) ? v : undefined });
          }}
        />
      </Field>

      <Field label="Layer">
        <select
          className="input"
          value={markup.layer}
          onChange={(e) => onChange({ layer: e.target.value as any })}
        >
          {layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>

      <CoverageSection markup={markup} onChange={onChange} />
      <SystemConfigSection markup={markup} onChange={onChange} />
    </>
  );
}

// ───── Coverage editor ─────

function CoverageSection({
  markup,
  onChange,
}: {
  markup: DeviceMarkup;
  onChange: (p: Partial<DeviceMarkup>) => void;
}) {
  const cov = resolveCoverage(markup);
  if (!cov) return null;

  const ov = markup.coverage ?? {};
  const calibrated = useProjectStore.getState().project?.sheets.find(
    (s) => s.id === useProjectStore.getState().activeSheetId,
  )?.calibration;
  const setOv = (patch: Partial<DeviceCoverageOverride>) =>
    onChange({ coverage: { ...ov, ...patch } });
  const reset = () => onChange({ coverage: undefined });
  const overridden =
    ov.range !== undefined ||
    ov.angle !== undefined ||
    ov.color !== undefined ||
    ov.opacity !== undefined ||
    ov.enabled !== undefined ||
    ov.focalLengthMm !== undefined ||
    ov.sensorFormat !== undefined ||
    ov.apexOffsetFt !== undefined ||
    ov.showRangeMarkers !== undefined ||
    ov.showCenterline !== undefined ||
    ov.showQualityZones !== undefined ||
    ov.showLabel !== undefined;

  return (
    <div className="pt-2 mt-2 border-t border-white/5 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Radar className="w-3.5 h-3.5 text-amber-knox" />
          <span className="text-xs font-medium text-ink-100">{cov.label}</span>
        </div>
        <button
          onClick={() => setOv({ enabled: !cov.enabled })}
          className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${cov.enabled ? "bg-amber-knox/15 text-amber-knox border-amber-knox/40" : "text-ink-300 border-white/10 hover:border-white/20"}`}
        >
          {cov.enabled ? "Visible" : "Hidden"}
        </button>
      </div>

      {!calibrated && (
        <div className="text-[11px] text-signal-red bg-signal-red/10 border border-signal-red/30 rounded px-2 py-1.5">
          Sheet not calibrated — coverage shapes can't be drawn to scale.
          Use the Calibrate tool (K) first.
        </div>
      )}

      {/* ── Lens spec (cameras only, when shape = sector) ── */}
      {cov.isCamera && cov.shape === "sector" && (
        <LensControls
          ov={ov}
          cov={cov}
          setOv={setOv}
        />
      )}

      <Field label={`Range — ${cov.rangeFt.toFixed(0)} ft`}>
        <input
          type="range"
          min={1}
          max={cov.shape === "beam" ? 2000 : cov.preset.range * 4}
          step={1}
          value={cov.rangeFt}
          onChange={(e) => setOv({ range: parseInt(e.target.value, 10) })}
          className="w-full accent-amber-knox"
        />
      </Field>

      {(cov.shape === "sector" || cov.shape === "beam") && (
        <Field
          label={
            cov.isCamera && ov.focalLengthMm !== undefined && ov.angle === undefined
              ? `HFOV — ${cov.angle.toFixed(0)}° (from ${ov.focalLengthMm} mm lens)`
              : `Angle — ${cov.angle.toFixed(0)}°`
          }
        >
          <input
            type="range"
            min={cov.shape === "beam" ? 0.5 : 5}
            max={cov.shape === "beam" ? 30 : 360}
            step={cov.shape === "beam" ? 0.5 : 1}
            value={cov.angle}
            onChange={(e) => setOv({ angle: parseFloat(e.target.value) })}
            className="w-full accent-amber-knox"
          />
        </Field>
      )}

      {(cov.shape === "sector" || cov.shape === "beam" || cov.shape === "rect") && (
        <Field label={`Aim — ${(markup.rotation ?? 0).toFixed(0)}°`}>
          <input
            type="range"
            min={0}
            max={359}
            step={1}
            value={markup.rotation ?? 0}
            onChange={(e) =>
              onChange({ rotation: parseInt(e.target.value, 10) })
            }
            className="w-full accent-amber-knox"
          />
        </Field>
      )}

      {/* Apex offset — how far the cone visually extends OUT from camera */}
      {cov.shape === "sector" && (
        <Field label={`Apex offset — ${cov.apexOffsetFt.toFixed(1)} ft from device`}>
          <input
            type="range"
            min={0}
            max={Math.max(2, Math.round(cov.rangeFt * 0.3))}
            step={0.5}
            value={cov.apexOffsetFt}
            onChange={(e) =>
              setOv({ apexOffsetFt: parseFloat(e.target.value) })
            }
            className="w-full accent-amber-knox"
          />
        </Field>
      )}

      <Field label={`Opacity — ${(cov.opacity * 100).toFixed(0)}%`}>
        <input
          type="range"
          min={5}
          max={60}
          step={1}
          value={Math.round(cov.opacity * 100)}
          onChange={(e) => setOv({ opacity: parseInt(e.target.value, 10) / 100 })}
          className="w-full accent-amber-knox"
        />
      </Field>

      <Field label="Coverage color">
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={cov.color}
            onChange={(e) => setOv({ color: e.target.value })}
            className="w-9 h-7 rounded bg-ink-700 border border-white/10 cursor-pointer"
          />
          <input
            value={cov.color}
            onChange={(e) => setOv({ color: e.target.value })}
            className="input font-mono text-xs"
          />
        </div>
      </Field>

      {/* Visual extras */}
      {cov.shape === "sector" && (
        <div className="grid grid-cols-2 gap-1.5">
          <CovToggle
            label="Range markers"
            on={cov.showRangeMarkers}
            onChange={(v) => setOv({ showRangeMarkers: v })}
          />
          <CovToggle
            label="Centerline"
            on={cov.showCenterline}
            onChange={(v) => setOv({ showCenterline: v })}
          />
          <CovToggle
            label="Quality zones"
            on={cov.showQualityZones}
            onChange={(v) => setOv({ showQualityZones: v })}
          />
          <CovToggle
            label="Tip label"
            on={cov.showLabel}
            onChange={(v) => setOv({ showLabel: v })}
          />
        </div>
      )}

      {overridden && (
        <button
          onClick={reset}
          className="btn-ghost w-full justify-center text-[11px]"
          title="Reset all coverage settings to the device default"
        >
          <RotateCcw className="w-3 h-3" />
          Reset coverage to default
        </button>
      )}

      <div className="text-[10px] text-ink-400 leading-relaxed">
        {cov.shape === "circle" && cov.rings > 1 ? (
          <>{cov.rings} concentric rings show signal-strength bands.</>
        ) : cov.shape === "beam" ? (
          <>Narrow beam path — useful for P2P bridges and beam detectors.</>
        ) : cov.shape === "circle" ? (
          <>Omnidirectional coverage — full {cov.rangeFt.toFixed(0)} ft radius.</>
        ) : cov.shape === "rect" ? (
          <>Rectangular wash zone — width set by range.</>
        ) : (
          <>Cone extends from the camera in the Aim direction. Pick a lens preset above to derive HFOV from real specs.</>
        )}
      </div>
    </div>
  );
}

function LensControls({
  ov,
  cov,
  setOv,
}: {
  ov: DeviceCoverageOverride;
  cov: EffectiveCoverage;
  setOv: (p: Partial<DeviceCoverageOverride>) => void;
}) {
  const focal = ov.focalLengthMm ?? "";
  const sensor = (ov.sensorFormat ?? cov.sensorFormat) as SensorFormat;

  // Find the active preset (if focal+sensor exactly matches one)
  const activePresetId =
    focal === ""
      ? ""
      : LENS_PRESETS.find(
          (p) => p.focalLengthMm === focal && p.sensor === sensor,
        )?.id ?? "custom";

  const onPresetChange = (id: string) => {
    if (id === "") {
      // Clear lens spec → revert to manual angle
      setOv({ focalLengthMm: undefined, sensorFormat: undefined, angle: undefined });
      return;
    }
    const p = LENS_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setOv({
      focalLengthMm: p.focalLengthMm,
      sensorFormat: p.sensor,
      angle: undefined, // let it be derived
    });
  };

  const previewAngle = focal !== "" ? calcHFovDeg(Number(focal), sensor) : null;

  return (
    <div className="rounded-md bg-ink-900/40 border border-white/5 p-2 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-mono uppercase tracking-wider text-amber-knox">
          Lens Spec
        </div>
        {previewAngle !== null && (
          <span className="text-[10px] font-mono text-ink-300">
            HFOV ≈ <span className="text-amber-knox">{previewAngle.toFixed(1)}°</span>
          </span>
        )}
      </div>

      <Field label="Lens preset">
        <select
          className="input"
          value={activePresetId}
          onChange={(e) => onPresetChange(e.target.value)}
        >
          <option value="">— Manual angle (no lens) —</option>
          {LENS_PRESETS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label} — {p.hint}
            </option>
          ))}
          {activePresetId === "custom" && (
            <option value="custom">Custom — {focal} mm on {sensor}"</option>
          )}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Focal length (mm)">
          <input
            className="input font-mono"
            inputMode="decimal"
            value={focal}
            placeholder="e.g. 4"
            onChange={(e) => {
              const v = e.target.value;
              if (v === "") {
                setOv({ focalLengthMm: undefined, angle: undefined });
                return;
              }
              const n = parseFloat(v);
              if (isFinite(n) && n > 0) {
                setOv({ focalLengthMm: n, angle: undefined });
              }
            }}
          />
        </Field>
        <Field label="Sensor format">
          <select
            className="input font-mono"
            value={sensor}
            onChange={(e) => setOv({ sensorFormat: e.target.value as SensorFormat })}
          >
            {SENSOR_FORMATS.map((s) => (
              <option key={s} value={s}>
                {s === "1" ? '1"' : s + '"'}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="text-[10px] text-ink-400 leading-relaxed">
        Set focal length + sensor and the FOV is computed for you (industry-standard
        pinhole formula). Drag the Angle slider below to override at any time.
      </div>
    </div>
  );
}

function CovToggle({
  label,
  on,
  onChange,
}: {
  label: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`text-[11px] px-2 py-1 rounded border transition-colors text-left ${on ? "bg-amber-knox/10 border-amber-knox/40 text-amber-knox" : "text-ink-300 border-white/10 hover:border-white/20"}`}
    >
      {on ? "✓ " : "  "}
      {label}
    </button>
  );
}

// Sensible default connector suggestions based on the cable family.
// Used to seed the connector input's autocomplete; the user can still
// type anything they want.
const CONNECTOR_HINTS: Record<string, string[]> = {
  cat6: ["RJ45", "RJ45 keystone", "110-block"],
  cat6a: ["RJ45 shielded", "RJ45 keystone shielded"],
  "cat6-plenum": ["RJ45", "RJ45 keystone"],
  "fiber-sm": ["LC-LC", "LC-SC", "MTP/MPO"],
  "fiber-mm": ["LC-LC", "LC-SC", "MTP/MPO"],
  "coax-rg6": ["F-Type", "BNC"],
  "lv-18-2": ["Wago 221", "Crimp"],
  "lv-22-4": ["Wago 221", "Crimp"],
  conduit: ["—"],
};

function CableProps({ markup, onChange }: any) {
  const cab = cablesById[markup.cableId];
  const hints = CONNECTOR_HINTS[markup.cableId] ?? [];
  const datalistId = `connector-hints-${markup.cableId}`;
  return (
    <>
      <Field label="Cable Type">
        <select
          className="input"
          value={markup.cableId}
          onChange={(e) => onChange({ cableId: e.target.value })}
        >
          {cables.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Connector / Termination">
        <input
          className="input"
          list={datalistId}
          value={markup.connector ?? ""}
          placeholder={hints[0] ?? "e.g. RJ45"}
          onChange={(e) =>
            onChange({ connector: e.target.value || undefined })
          }
        />
        {hints.length > 0 && (
          <datalist id={datalistId}>
            {hints.map((h) => (
              <option key={h} value={h} />
            ))}
          </datalist>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Endpoint A">
          <input
            className="input"
            value={markup.endpointA ?? ""}
            placeholder="MDF / IDF / Rack"
            onChange={(e) =>
              onChange({ endpointA: e.target.value || undefined })
            }
          />
        </Field>
        <Field label="Endpoint B">
          <input
            className="input"
            value={markup.endpointB ?? ""}
            placeholder="Cam-04 / AP-12"
            onChange={(e) =>
              onChange({ endpointB: e.target.value || undefined })
            }
          />
        </Field>
      </div>
      <Field label="Slack % (overrides project default)">
        <input
          className="input"
          inputMode="decimal"
          value={markup.slackPercent ?? ""}
          placeholder="default"
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            onChange({ slackPercent: isFinite(v) ? v : undefined });
          }}
        />
      </Field>
      {cab && (
        <div className="text-[11px] font-mono text-ink-400">
          ${cab.costPerFoot.toFixed(2)}/ft · {cab.laborPerFoot.toFixed(3)} hr/ft
        </div>
      )}
    </>
  );
}

function PositionFields({ markup, onChange }: any) {
  if (typeof markup.x !== "number" || typeof markup.y !== "number") return null;
  return (
    <Field label="Position (X, Y)">
      <div className="grid grid-cols-2 gap-1.5">
        <input
          className="input font-mono"
          inputMode="numeric"
          value={Math.round(markup.x)}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (isFinite(v)) onChange({ x: v });
          }}
        />
        <input
          className="input font-mono"
          inputMode="numeric"
          value={Math.round(markup.y)}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (isFinite(v)) onChange({ y: v });
          }}
        />
      </div>
    </Field>
  );
}

// ───── Multi-select editor ─────

function MultiMarkupEditor({
  markups,
  onApply,
}: {
  markups: Markup[];
  onApply: (patch: any) => void;
}) {
  const devices = markups.filter((m) => m.kind === "device") as DeviceMarkup[];
  const allDevices = devices.length === markups.length && devices.length > 0;
  const layers = useProjectStore.getState().layers;

  // Compute "common" defaults for sliders
  const commonSize = allDevices ? deriveCommon(devices.map((d) => d.size ?? 28)) : 28;
  const commonRot = allDevices ? deriveCommon(devices.map((d) => d.rotation ?? 0)) : 0;

  return (
    <>
      <SectionTitle>Group Edit · {markups.length} items</SectionTitle>
      <div className="text-[11px] text-ink-400 pb-1">
        {allDevices
          ? `${markups.length} devices selected. Edits below apply to all.`
          : `Mixed selection (${devices.length} devices, ${markups.length - devices.length} other). Common edits only.`}
      </div>

      {allDevices && (
        <>
          <Field label="Icon Size (all)" hint={`${commonSize} pt`}>
            <input
              type="range"
              min={14}
              max={72}
              step={1}
              defaultValue={commonSize}
              onChange={(e) => onApply({ size: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-knox"
            />
          </Field>
          <Field label="Rotation (all)" hint={`${commonRot}°`}>
            <input
              type="range"
              min={0}
              max={359}
              step={1}
              defaultValue={commonRot}
              onChange={(e) => onApply({ rotation: parseInt(e.target.value, 10) })}
              className="w-full accent-amber-knox"
            />
          </Field>
          <Field label="Color (all)">
            <ColorPicker
              value="#F4B740"
              onChange={(c) => onApply({ colorOverride: c })}
              onReset={() => onApply({ colorOverride: undefined })}
              isDefault={false}
            />
          </Field>
        </>
      )}

      <Field label="Layer (all)">
        <select
          className="input"
          defaultValue=""
          onChange={(e) => e.target.value && onApply({ layer: e.target.value as any })}
        >
          <option value="">— change to —</option>
          {layers.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex gap-2 pt-2">
        <button
          onClick={() => onApply({ locked: true })}
          className="btn flex-1 justify-center"
        >
          <Lock className="w-3.5 h-3.5" />
          Lock all
        </button>
        <button
          onClick={() => onApply({ locked: false })}
          className="btn flex-1 justify-center"
        >
          <LockOpen className="w-3.5 h-3.5" />
          Unlock all
        </button>
      </div>

      <div className="text-[11px] text-ink-400 pt-2 border-t border-white/5 leading-relaxed">
        Tip: arrow keys move all selected. Shift+arrow = 10× nudge. <kbd className="kbd">Del</kbd> deletes the group.
      </div>
    </>
  );
}

// ───── Misc ─────

function ColorPicker({
  value,
  onChange,
  onReset,
  isDefault,
}: {
  value: string;
  onChange: (v: string) => void;
  onReset?: () => void;
  isDefault?: boolean;
}) {
  const swatches = [
    "#F4B740", // amber
    "#4FB7FF", // signal blue
    "#2BD37C", // signal green
    "#FF5C7A", // signal red
    "#B58CFF", // violet
    "#3DD4D0", // teal
    "#F5F7FA", // ink-50
    "#94A0B8", // ink-300
  ];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="color"
          className="w-9 h-8 rounded-md bg-ink-700 border border-white/5 cursor-pointer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          className="input font-mono"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#RRGGBB"
        />
        {onReset && !isDefault && (
          <button onClick={onReset} className="btn-ghost text-xs" title="Reset to category color">
            reset
          </button>
        )}
        {isDefault && <span className="text-[10px] text-ink-500 font-mono">default</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {swatches.map((s) => (
          <button
            key={s}
            onClick={() => onChange(s)}
            className={`w-5 h-5 rounded-md border ${value.toLowerCase() === s.toLowerCase() ? "border-amber-knox ring-1 ring-amber-knox" : "border-white/10"}`}
            style={{ backgroundColor: s }}
            title={s}
          />
        ))}
      </div>
    </div>
  );
}

// ───── System Config Section ─────────────────────────────────────────────────

/** Which section groups apply to each device category */
const CATEGORY_SECTIONS = {
  cameras:    { streams: true,  ptz: true,  wireless: false, switchCfg: false, access: false },
  av:         { streams: true,  ptz: false, wireless: false, switchCfg: false, access: false },
  broadcast:  { streams: true,  ptz: false, wireless: false, switchCfg: false, access: false },
  production: { streams: false, ptz: false, wireless: false, switchCfg: false, access: false },
  network:    { streams: false, ptz: false, wireless: true,  switchCfg: true,  access: false },
  wireless:   { streams: false, ptz: false, wireless: true,  switchCfg: false, access: false },
  access:     { streams: false, ptz: false, wireless: false, switchCfg: false, access: true  },
  detection:  { streams: false, ptz: false, wireless: false, switchCfg: false, access: false },
  audio:      { streams: false, ptz: false, wireless: false, switchCfg: false, access: false },
  lighting:   { streams: false, ptz: false, wireless: false, switchCfg: false, access: false },
  site:       { streams: false, ptz: false, wireless: false, switchCfg: false, access: false },
} as const;

function CollapsibleGroup({
  icon: Icon,
  title,
  badge,
  children,
  defaultOpen = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  badge?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-md border border-white/5 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-2.5 py-2 bg-ink-900/40 hover:bg-ink-900/70 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-signal-blue" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-ink-200">{title}</span>
          {badge && (
            <span className="text-[10px] font-mono text-signal-blue bg-signal-blue/10 border border-signal-blue/20 px-1.5 rounded">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-2.5 py-2.5 space-y-2">{children}</div>}
    </div>
  );
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-ink-400 mb-0.5">{label}</div>
      {children}
    </div>
  );
}

function Inp(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input font-mono text-xs ${props.className ?? ""}`} />;
}
function Sel({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }) {
  return <select {...props} className="input text-xs">{children}</select>;
}

function NetworkSection({
  net,
  managementUrl,
  patch,
  patchCfg,
}: {
  net: NetworkConfig;
  managementUrl?: string;
  patch: (p: Partial<NetworkConfig>) => void;
  patchCfg: (p: Partial<DeviceSystemConfig>) => void;
}) {
  return (
    <CollapsibleGroup icon={Network} title="Network" defaultOpen={!!(net.ipAddress)} badge={net.ipAddress}>
      <div className="flex items-center gap-2 mb-1">
        <button
          onClick={() => patch({ dhcp: !net.dhcp })}
          className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${net.dhcp ? "bg-signal-green/15 text-signal-green border-signal-green/40" : "text-ink-300 border-white/10 hover:border-white/20"}`}
        >
          {net.dhcp ? "DHCP" : "Static IP"}
        </button>
        {net.dhcp && <span className="text-[10px] text-ink-500">IP assigned by DHCP server</span>}
      </div>

      {!net.dhcp && (
        <div className="grid grid-cols-2 gap-1.5">
          <F label="IP Address"><Inp placeholder="192.168.1.x" value={net.ipAddress ?? ""} onChange={(e) => patch({ ipAddress: e.target.value || undefined })} /></F>
          <F label="Subnet Mask"><Inp placeholder="255.255.255.0" value={net.subnetMask ?? ""} onChange={(e) => patch({ subnetMask: e.target.value || undefined })} /></F>
          <F label="Gateway"><Inp placeholder="192.168.1.1" value={net.gateway ?? ""} onChange={(e) => patch({ gateway: e.target.value || undefined })} /></F>
          <F label="DNS 1"><Inp placeholder="8.8.8.8" value={net.dns1 ?? ""} onChange={(e) => patch({ dns1: e.target.value || undefined })} /></F>
          <F label="DNS 2"><Inp placeholder="8.8.4.4" value={net.dns2 ?? ""} onChange={(e) => patch({ dns2: e.target.value || undefined })} /></F>
          <F label="HTTP Port"><Inp placeholder="80" inputMode="numeric" value={net.httpPort ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ httpPort: isFinite(v)?v:undefined }); }} /></F>
          <F label="HTTPS Port"><Inp placeholder="443" inputMode="numeric" value={net.httpsPort ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ httpsPort: isFinite(v)?v:undefined }); }} /></F>
        </div>
      )}

      <div className="grid grid-cols-2 gap-1.5">
        <F label="Hostname"><Inp placeholder="device-01" value={net.hostname ?? ""} onChange={(e) => patch({ hostname: e.target.value || undefined })} /></F>
        <F label="VLAN"><Inp placeholder="10" inputMode="numeric" value={net.vlan ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ vlan: isFinite(v)?v:undefined }); }} /></F>
        <F label="MAC Address"><Inp placeholder="AA:BB:CC:DD:EE:FF" className="col-span-2" value={net.macAddress ?? ""} onChange={(e) => patch({ macAddress: e.target.value || undefined })} /></F>
      </div>

      <F label="Management URL">
        <Inp
          placeholder={net.ipAddress ? `http://${net.ipAddress}` : "http://192.168.x.x"}
          value={managementUrl ?? ""}
          onChange={(e) => patchCfg({ managementUrl: e.target.value || undefined })}
        />
      </F>
    </CollapsibleGroup>
  );
}

function StreamsSection({
  streams,
  patch,
}: {
  streams: CameraStreamConfig;
  patch: (p: Partial<CameraStreamConfig>) => void;
}) {
  return (
    <CollapsibleGroup icon={Video} title="Streams & Recording" defaultOpen={!!(streams.primaryRtsp)}>
      <F label="Primary RTSP URL">
        <Inp placeholder="rtsp://user:pass@192.168.x.x:554/stream1" value={streams.primaryRtsp ?? ""} onChange={(e) => patch({ primaryRtsp: e.target.value || undefined })} />
      </F>
      <F label="Secondary RTSP URL">
        <Inp placeholder="rtsp://192.168.x.x:554/stream2" value={streams.secondaryRtsp ?? ""} onChange={(e) => patch({ secondaryRtsp: e.target.value || undefined })} />
      </F>
      <div className="grid grid-cols-2 gap-1.5">
        <F label="Username"><Inp placeholder="admin" value={streams.username ?? ""} onChange={(e) => patch({ username: e.target.value || undefined })} /></F>
        <F label="Password"><Inp type="password" placeholder="••••••••" value={streams.password ?? ""} onChange={(e) => patch({ password: e.target.value || undefined })} /></F>
        <F label="Resolution">
          <input className="input text-xs" list="stream-res" placeholder="1080p" value={streams.resolution ?? ""} onChange={(e) => patch({ resolution: e.target.value || undefined })} />
          <datalist id="stream-res">{["8MP","4K","5MP","4MP","1080p","720p","D1"].map(r=><option key={r} value={r}/>)}</datalist>
        </F>
        <F label="Codec">
          <Sel value={streams.codec ?? ""} onChange={(e) => patch({ codec: e.target.value || undefined })}>
            <option value="">—</option>
            <option>H.265</option><option>H.264</option><option>MJPEG</option>
          </Sel>
        </F>
        <F label="Bitrate (kbps)"><Inp placeholder="4096" inputMode="numeric" value={streams.bitrateKbps ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ bitrateKbps: isFinite(v)?v:undefined }); }} /></F>
        <F label="FPS"><Inp placeholder="30" inputMode="numeric" value={streams.fps ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ fps: isFinite(v)?v:undefined }); }} /></F>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => patch({ onvifEnabled: !streams.onvifEnabled })}
          className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${streams.onvifEnabled ? "bg-amber-knox/15 text-amber-knox border-amber-knox/40" : "text-ink-300 border-white/10"}`}
        >
          ONVIF {streams.onvifEnabled ? "ON" : "OFF"}
        </button>
        {streams.onvifEnabled && <Inp className="w-20" placeholder="port 80" inputMode="numeric" value={streams.onvifPort ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ onvifPort: isFinite(v)?v:undefined }); }} />}
      </div>
      <F label="NVR Tag / Recorder">
        <div className="grid grid-cols-2 gap-1.5">
          <Inp placeholder="NVR-01" value={streams.nvrTag ?? ""} onChange={(e) => patch({ nvrTag: e.target.value || undefined })} />
          <Inp placeholder="ch. 1" inputMode="numeric" value={streams.nvrChannel ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ nvrChannel: isFinite(v)?v:undefined }); }} />
        </div>
      </F>
      {streams.nvrTag && (
        <F label="NVR Channel Name">
          <Inp placeholder="Lobby East" value={streams.nvrChannelName ?? ""} onChange={(e) => patch({ nvrChannelName: e.target.value || undefined })} />
        </F>
      )}
    </CollapsibleGroup>
  );
}

function PtzSection({ ptz, patch }: { ptz: PtzConfig; patch: (p: Partial<PtzConfig>) => void }) {
  return (
    <CollapsibleGroup icon={Cpu} title="PTZ" defaultOpen={ptz.enabled === true}>
      <div className="flex items-center gap-2">
        <button
          onClick={() => patch({ enabled: !ptz.enabled })}
          className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${ptz.enabled ? "bg-signal-green/15 text-signal-green border-signal-green/40" : "text-ink-300 border-white/10"}`}
        >
          PTZ {ptz.enabled ? "Enabled" : "Disabled"}
        </button>
      </div>
      {ptz.enabled && (
        <div className="grid grid-cols-2 gap-1.5 mt-1">
          <F label="Protocol">
            <Sel value={ptz.protocol ?? ""} onChange={(e) => patch({ protocol: e.target.value || undefined })}>
              <option value="">—</option>
              <option value="onvif">ONVIF (IP)</option>
              <option value="pelco-d">Pelco-D (RS-485)</option>
              <option value="pelco-p">Pelco-P (RS-485)</option>
              <option value="visca">VISCA (RS-232/IP)</option>
            </Sel>
          </F>
          <F label={ptz.protocol === "onvif" ? "TCP Port" : "Baud Rate"}>
            <Inp placeholder={ptz.protocol === "onvif" ? "80" : "9600"} inputMode="numeric" value={ptz.port ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ port: isFinite(v)?v:undefined }); }} />
          </F>
          {ptz.protocol !== "onvif" && (
            <F label="RS-485 Address">
              <Inp placeholder="1" inputMode="numeric" value={ptz.address ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ address: isFinite(v)?v:undefined }); }} />
            </F>
          )}
        </div>
      )}
    </CollapsibleGroup>
  );
}

function WirelessSection({
  w,
  patch,
}: {
  w: WirelessConfig;
  patch: (p: Partial<WirelessConfig>) => void;
}) {
  return (
    <CollapsibleGroup icon={Network} title="Wireless / RF" defaultOpen={!!(w.ssid)}>
      <div className="grid grid-cols-2 gap-1.5">
        <F label="SSID"><Inp placeholder="NetworkName" value={w.ssid ?? ""} onChange={(e) => patch({ ssid: e.target.value || undefined })} /></F>
        <F label="Password"><Inp type="password" placeholder="••••••••" value={w.password ?? ""} onChange={(e) => patch({ password: e.target.value || undefined })} /></F>
        <F label="Band">
          <Sel value={w.band ?? ""} onChange={(e) => patch({ band: e.target.value || undefined })}>
            <option value="">—</option>
            <option value="2.4GHz">2.4 GHz</option>
            <option value="5GHz">5 GHz</option>
            <option value="6GHz">6 GHz</option>
            <option value="dual-band">Dual-band</option>
            <option value="tri-band">Tri-band</option>
          </Sel>
        </F>
        <F label="Security">
          <Sel value={w.security ?? ""} onChange={(e) => patch({ security: e.target.value || undefined })}>
            <option value="">—</option>
            <option value="WPA2">WPA2</option>
            <option value="WPA3">WPA3</option>
            <option value="WPA2/WPA3">WPA2/WPA3</option>
            <option value="Open">Open</option>
          </Sel>
        </F>
        <F label="Channel"><Inp placeholder="auto" inputMode="numeric" value={w.channel ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ channel: isFinite(v)?v:undefined }); }} /></F>
        <F label="Max Clients"><Inp placeholder="128" inputMode="numeric" value={w.maxClients ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ maxClients: isFinite(v)?v:undefined }); }} /></F>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => patch({ hiddenSsid: !w.hiddenSsid })}
          className={`text-[10px] font-mono px-2 py-0.5 rounded border transition-colors ${w.hiddenSsid ? "bg-amber-knox/15 text-amber-knox border-amber-knox/40" : "text-ink-300 border-white/10"}`}
        >
          SSID {w.hiddenSsid ? "Hidden" : "Broadcast"}
        </button>
      </div>
      <F label="Controller / Cloud Tag">
        <Inp placeholder="CTRL-01" value={w.controllerTag ?? ""} onChange={(e) => patch({ controllerTag: e.target.value || undefined })} />
      </F>
    </CollapsibleGroup>
  );
}

function SwitchSection({
  sw,
  patch,
}: {
  sw: SwitchConfig;
  patch: (p: Partial<SwitchConfig>) => void;
}) {
  return (
    <CollapsibleGroup icon={Network} title="Switch / Router Config" defaultOpen={!!(sw.portCount || sw.vlans)}>
      <div className="grid grid-cols-2 gap-1.5">
        <F label="Port Count"><Inp placeholder="24" inputMode="numeric" value={sw.portCount ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ portCount: isFinite(v)?v:undefined }); }} /></F>
        <F label="PoE Budget (W)"><Inp placeholder="370" inputMode="numeric" value={sw.poeBudgetW ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ poeBudgetW: isFinite(v)?v:undefined }); }} /></F>
        <F label="Active VLANs"><Inp placeholder="1, 10, 20, 100" value={sw.vlans ?? ""} onChange={(e) => patch({ vlans: e.target.value || undefined })} /></F>
        <F label="Mgmt VLAN"><Inp placeholder="1" inputMode="numeric" value={sw.managementVlan ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ managementVlan: isFinite(v)?v:undefined }); }} /></F>
        <F label="Uplink Port"><Inp placeholder="Port 49 (SFP)" value={sw.uplinkPort ?? ""} onChange={(e) => patch({ uplinkPort: e.target.value || undefined })} /></F>
        <F label="STP Role">
          <Sel value={sw.stpRole ?? ""} onChange={(e) => patch({ stpRole: e.target.value || undefined })}>
            <option value="">—</option>
            <option value="root">Root</option>
            <option value="switch">Switch</option>
            <option value="disabled">Disabled</option>
          </Sel>
        </F>
      </div>
      <F label="Controller / Cloud Tag">
        <Inp placeholder="CTRL-01 or cloud org" value={sw.controllerTag ?? ""} onChange={(e) => patch({ controllerTag: e.target.value || undefined })} />
      </F>
    </CollapsibleGroup>
  );
}

function AccessSection({
  ac,
  patch,
}: {
  ac: AccessControlConfig;
  patch: (p: Partial<AccessControlConfig>) => void;
}) {
  return (
    <CollapsibleGroup icon={Cpu} title="Access Control" defaultOpen={!!(ac.doorName || ac.protocol)}>
      <div className="grid grid-cols-2 gap-1.5">
        <F label="Door / Opening">
          <Inp placeholder="Main Entry" value={ac.doorName ?? ""} onChange={(e) => patch({ doorName: e.target.value || undefined })} />
        </F>
        <F label="Zone / Partition">
          <Inp placeholder="Zone A" value={ac.zone ?? ""} onChange={(e) => patch({ zone: e.target.value || undefined })} />
        </F>
        <F label="Protocol">
          <Sel value={ac.protocol ?? ""} onChange={(e) => patch({ protocol: e.target.value || undefined })}>
            <option value="">—</option>
            <option value="wiegand-26">Wiegand 26-bit</option>
            <option value="wiegand-34">Wiegand 34-bit</option>
            <option value="osdp-v1">OSDP v1</option>
            <option value="osdp-v2">OSDP v2</option>
            <option value="f2f">F2F</option>
          </Sel>
        </F>
        <F label="Relay Type">
          <Sel value={ac.relayType ?? ""} onChange={(e) => patch({ relayType: e.target.value || undefined })}>
            <option value="">—</option>
            <option value="NO">Normally Open</option>
            <option value="NC">Normally Closed</option>
          </Sel>
        </F>
        <F label="Hold Time (ms)">
          <Inp placeholder="5000" inputMode="numeric" value={ac.holdTimeMs ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ holdTimeMs: isFinite(v)?v:undefined }); }} />
        </F>
        {ac.protocol?.startsWith("osdp") && (
          <F label="OSDP Address">
            <Inp placeholder="0" inputMode="numeric" value={ac.osdpAddress ?? ""} onChange={(e) => { const v=parseInt(e.target.value); patch({ osdpAddress: isFinite(v)?v:undefined }); }} />
          </F>
        )}
      </div>
      <F label="Controller Panel Tag">
        <Inp placeholder="ACP-01" value={ac.controllerTag ?? ""} onChange={(e) => patch({ controllerTag: e.target.value || undefined })} />
      </F>
    </CollapsibleGroup>
  );
}

function SystemConfigSection({
  markup,
  onChange,
}: {
  markup: DeviceMarkup;
  onChange: (p: Partial<DeviceMarkup>) => void;
}) {
  const addConnection = useProjectStore((s) => s.addConnection);
  const removeConnection = useProjectStore((s) => s.removeConnection);
  const updateConnection = useProjectStore((s) => s.updateConnection);
  const connections = useProjectStore((s) => s.project?.connections ?? []);
  const project = useProjectStore((s) => s.project);
  const [open, setOpen] = useState(false);
  const [newTo, setNewTo] = useState("");
  const [newFromPortId, setNewFromPortId] = useState("");
  const [newFromPort, setNewFromPort] = useState("");
  const [newToPortId, setNewToPortId] = useState("");
  const [newToPort, setNewToPort] = useState("");
  const [newMedium, setNewMedium] = useState("cat6");

  // Structured port list for the source device — used to switch the
  // port input between a dropdown (known ports) and a free-text field
  // (unknown / custom).
  const myPorts: PortSpec[] | undefined = effectiveDevicePorts(
    markup.deviceId,
    markup.instancePorts,
  );
  // Resolve destination ports based on the tag the user is typing. We
  // re-query on every keystroke; cheap relative to React's render cost.
  const toPorts: PortSpec[] | undefined = project
    ? effectivePortsForTag(project, newTo.trim().toUpperCase())
    : undefined;

  const cfg = markup.systemConfig ?? {};
  const net = cfg.network ?? {};
  const streams = cfg.streams ?? {};
  const ptz = cfg.ptz ?? {};
  const wireless = cfg.wireless ?? {};
  const switchCfg = cfg.switchConfig ?? {};
  const accessCfg = cfg.accessControl ?? {};

  const cat = markup.category as keyof typeof CATEGORY_SECTIONS;
  const sections = CATEGORY_SECTIONS[cat] ?? { streams: false, ptz: false, wireless: false, switchCfg: false, access: false };

  const patchCfg = (patch: Partial<DeviceSystemConfig>) =>
    onChange({ systemConfig: { ...cfg, ...patch } });
  const patchNet = (p: Partial<NetworkConfig>) =>
    patchCfg({ network: { ...net, ...p } });
  const patchStreams = (p: Partial<CameraStreamConfig>) =>
    patchCfg({ streams: { ...streams, ...p } });
  const patchPtz = (p: Partial<PtzConfig>) =>
    patchCfg({ ptz: { ...ptz, ...p } });
  const patchWireless = (p: Partial<WirelessConfig>) =>
    patchCfg({ wireless: { ...wireless, ...p } });
  const patchSwitch = (p: Partial<SwitchConfig>) =>
    patchCfg({ switchConfig: { ...switchCfg, ...p } });
  const patchAccess = (p: Partial<AccessControlConfig>) =>
    patchCfg({ accessControl: { ...accessCfg, ...p } });

  const myConns = connections.filter(
    (c) => c.fromTag === markup.tag || c.toTag === markup.tag,
  );

  const addConn = () => {
    if (!newTo.trim()) return;
    // Resolve port label from the structured id when the user picked
    // from a dropdown — keeps the legacy text field populated so
    // anything reading `fromPort` directly still works.
    const fromPort = newFromPortId
      ? findPort(myPorts, newFromPortId)?.label
      : newFromPort.trim() || undefined;
    const toPort = newToPortId
      ? findPort(toPorts, newToPortId)?.label
      : newToPort.trim() || undefined;
    addConnection({
      id: Math.random().toString(36).slice(2, 10),
      fromTag: markup.tag,
      fromPortId: newFromPortId || undefined,
      fromPort,
      toTag: newTo.trim().toUpperCase(),
      toPortId: newToPortId || undefined,
      toPort,
      medium: newMedium || undefined,
    });
    setNewTo("");
    setNewFromPort("");
    setNewFromPortId("");
    setNewToPort("");
    setNewToPortId("");
  };

  // Summary badge for the collapsed header
  const badge = [
    net.ipAddress,
    myConns.length > 0 && `${myConns.length} conn`,
  ].filter(Boolean).join(" · ") || undefined;

  return (
    <div className="pt-2 mt-2 border-t border-white/5 space-y-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-1.5">
          <Network className="w-3.5 h-3.5 text-signal-blue" />
          <span className="text-xs font-medium text-ink-100">System Config</span>
          {badge && (
            <span className="text-[10px] font-mono text-signal-blue bg-signal-blue/10 border border-signal-blue/20 px-1.5 rounded">
              {badge}
            </span>
          )}
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-2">

          {/* ── Network (all devices) ── */}
          <NetworkSection net={net} managementUrl={cfg.managementUrl} patch={patchNet} patchCfg={patchCfg} />

          {/* ── Camera / encoder streams ── */}
          {sections.streams && <StreamsSection streams={streams} patch={patchStreams} />}

          {/* ── PTZ (cameras only) ── */}
          {sections.ptz && <PtzSection ptz={ptz} patch={patchPtz} />}

          {/* ── Wireless AP ── */}
          {sections.wireless && <WirelessSection w={wireless} patch={patchWireless} />}

          {/* ── Switch / router ── */}
          {sections.switchCfg && <SwitchSection sw={switchCfg} patch={patchSwitch} />}

          {/* ── Access control ── */}
          {sections.access && <AccessSection ac={accessCfg} patch={patchAccess} />}

          {/* ── Physical / Asset (all devices) ── */}
          <CollapsibleGroup icon={Plug} title="Physical / Asset" defaultOpen={false}>
            <div className="grid grid-cols-2 gap-1.5">
              <F label="Mount Type">
                <input className="input text-xs" list="mount-types" placeholder="ceiling" value={cfg.mountType ?? ""} onChange={(e) => patchCfg({ mountType: e.target.value || undefined })} />
                <datalist id="mount-types">{["ceiling","wall","pole","pendant","desk","rack","conduit"].map(m=><option key={m} value={m}/>)}</datalist>
              </F>
              <F label="PoE Class">
                <Sel value={cfg.poeClass ?? ""} onChange={(e) => patchCfg({ poeClass: e.target.value ? parseInt(e.target.value) : undefined })}>
                  <option value="">—</option>
                  {[0,1,2,3,4,5,6,7,8].map(c=><option key={c} value={c}>Class {c} ({[0.44,4,7,15.4,30,45,60,75,90][c]}W)</option>)}
                </Sel>
              </F>
              <F label="Switch Port"><Inp placeholder="SW-01 · Port 12" value={cfg.switchPort ?? ""} onChange={(e) => patchCfg({ switchPort: e.target.value || undefined })} /></F>
              <F label="Cable Tag"><Inp placeholder="matches cable run" value={cfg.cableTag ?? ""} onChange={(e) => patchCfg({ cableTag: e.target.value || undefined })} /></F>
              <F label="Manufacturer"><Inp placeholder="Hikvision" value={cfg.manufacturer ?? ""} onChange={(e) => patchCfg({ manufacturer: e.target.value || undefined })} /></F>
              <F label="Model"><Inp placeholder="DS-2CD2T43G2" value={cfg.model ?? ""} onChange={(e) => patchCfg({ model: e.target.value || undefined })} /></F>
              <F label="Serial No."><Inp placeholder="SN-..." value={cfg.serialNumber ?? ""} onChange={(e) => patchCfg({ serialNumber: e.target.value || undefined })} /></F>
              <F label="Firmware"><Inp placeholder="v5.7.15" value={cfg.firmwareVersion ?? ""} onChange={(e) => patchCfg({ firmwareVersion: e.target.value || undefined })} /></F>
              <F label="Asset Tag"><Inp placeholder="IT-00234" value={cfg.assetTag ?? ""} onChange={(e) => patchCfg({ assetTag: e.target.value || undefined })} /></F>
              <F label="Installed By"><Inp placeholder="technician" value={cfg.installedBy ?? ""} onChange={(e) => patchCfg({ installedBy: e.target.value || undefined })} /></F>
              <F label="Install Date">
                <input type="date" className="input text-xs" value={cfg.installedAt ?? ""} onChange={(e) => patchCfg({ installedAt: e.target.value || undefined })} />
              </F>
              <F label="Warranty Expiry">
                <input type="date" className="input text-xs" value={cfg.warrantyExpiry ?? ""} onChange={(e) => patchCfg({ warrantyExpiry: e.target.value || undefined })} />
              </F>
            </div>
          </CollapsibleGroup>

          {/* ── Connections (all devices) ── */}
          <div className="rounded-md border border-white/5 overflow-hidden">
            <div className="px-2.5 py-2 bg-ink-900/40 flex items-center gap-1.5">
              <Plug className="w-3.5 h-3.5 text-amber-knox" />
              <span className="text-[11px] font-mono uppercase tracking-wider text-ink-200">
                Connections {myConns.length > 0 && `(${myConns.length})`}
              </span>
            </div>

            {myConns.map((c) => {
              const isFrom = c.fromTag === markup.tag;
              const other = isFrom ? c.toTag : c.fromTag;
              // Resolve port labels through the structured-port helper
              // first so a renamed port spec re-flows to existing
              // connections; fall back to the persisted free-text label
              // for devices that don't expose a `ports` array.
              const otherPorts = project ? effectivePortsForTag(project, other) : undefined;
              const myStructured = isFrom
                ? findPort(myPorts, c.fromPortId)
                : findPort(myPorts, c.toPortId);
              const otherStructured = isFrom
                ? findPort(otherPorts, c.toPortId)
                : findPort(otherPorts, c.fromPortId);
              const myPort = myStructured?.label ?? (isFrom ? c.fromPort : c.toPort);
              const otherPort = otherStructured?.label ?? (isFrom ? c.toPort : c.fromPort);
              return (
                <div key={c.id} className="px-2.5 py-1.5 border-t border-white/5 flex items-start gap-2 group">
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1 text-[11px] flex-wrap">
                      <span className="font-mono text-amber-knox">{markup.tag}</span>
                      {myPort && <span className="text-ink-400 font-mono text-[10px]">{myPort}</span>}
                      <span className="text-ink-500">→</span>
                      <span className="font-mono text-signal-blue">{other}</span>
                      {otherPort && <span className="text-ink-400 font-mono text-[10px]">{otherPort}</span>}
                    </div>
                    {c.medium && <div className="text-[10px] text-ink-500 font-mono">{c.medium}</div>}
                    <input
                      className="input text-xs w-full mt-0.5"
                      placeholder="label / notes"
                      value={c.label ?? ""}
                      onChange={(e) => updateConnection(c.id, { label: e.target.value || undefined })}
                    />
                  </div>
                  <button
                    onClick={() => removeConnection(c.id)}
                    className="opacity-0 group-hover:opacity-100 btn-ghost text-signal-red p-0.5 mt-0.5 shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}

            <div className="px-2.5 py-2 border-t border-white/5 space-y-1.5">
              <div className="text-[10px] font-mono text-ink-500 uppercase tracking-wider">Add connection</div>
              <div className="grid grid-cols-2 gap-1.5">
                <F label={`${markup.tag} port`}>
                  {myPorts && myPorts.length > 0 ? (
                    <Sel
                      value={newFromPortId}
                      onChange={(e) => {
                        setNewFromPortId(e.target.value);
                        setNewFromPort("");
                      }}
                    >
                      <option value="">— pick port —</option>
                      {myPorts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                      <option value="">Custom…</option>
                    </Sel>
                  ) : (
                    <Inp
                      placeholder="ETH0"
                      value={newFromPort}
                      onChange={(e) => setNewFromPort(e.target.value)}
                    />
                  )}
                </F>
                <F label="→ Device tag">
                  <Inp
                    placeholder="SW-01"
                    value={newTo}
                    onChange={(e) => setNewTo(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && addConn()}
                  />
                </F>
                <F label="Destination port">
                  {toPorts && toPorts.length > 0 ? (
                    <Sel
                      value={newToPortId}
                      onChange={(e) => {
                        setNewToPortId(e.target.value);
                        setNewToPort("");
                      }}
                    >
                      <option value="">— pick port —</option>
                      {toPorts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </Sel>
                  ) : (
                    <Inp
                      placeholder="Port 12"
                      value={newToPort}
                      onChange={(e) => setNewToPort(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addConn()}
                    />
                  )}
                </F>
                <F label="Medium">
                  <input className="input text-xs" list="mediums" placeholder="cat6" value={newMedium} onChange={(e) => setNewMedium(e.target.value)} />
                  <datalist id="mediums">{["cat6","cat6a","cat5e","fiber-sm","fiber-mm","coax","rs485","rs232","wireless"].map(m=><option key={m} value={m}/>)}</datalist>
                </F>
              </div>
              <button onClick={addConn} disabled={!newTo.trim()} className="btn w-full justify-center text-xs disabled:opacity-40">
                <Plus className="w-3.5 h-3.5" /> Add connection
              </button>
              {myPorts && myPorts.length > 0 && (
                <p className="text-[10px] text-ink-500 leading-snug">
                  {myPorts.length} structured port{myPorts.length === 1 ? "" : "s"} on{" "}
                  {markup.tag}. Switch to a custom port by clearing the dropdown
                  and typing in the cable schedule.
                </p>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

function describeKind(k: string) {
  const map: Record<string, string> = {
    device: "Device",
    cable: "Cable Run",
    text: "Text",
    callout: "Callout",
    cloud: "Revision Cloud",
    dimension: "Dimension",
    rect: "Rectangle",
    arrow: "Arrow",
    polygon: "Polygon",
    freehand: "Freehand",
  };
  return map[k] ?? "Markup";
}

function deriveCommon<T extends number>(arr: T[]): T {
  if (arr.length === 0) return 0 as T;
  if (arr.every((v) => v === arr[0])) return arr[0];
  // Use median as reasonable display value
  const sorted = [...arr].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as T;
}
