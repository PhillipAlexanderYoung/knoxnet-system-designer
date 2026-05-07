import { useMemo } from "react";
import {
  useProjectStore,
  selectActiveSheet,
  type Markup,
  type DeviceMarkup,
  type DeviceCoverageOverride,
} from "../store/projectStore";
import { devicesById } from "../data/devices";
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
