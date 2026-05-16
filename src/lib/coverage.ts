// Effective-coverage resolver. Merges the device's preset with any
// per-instance overrides on the placed markup. Single source of truth used
// by the on-canvas overlay, the properties panel, and the PDF exporter.

import type {
  DeviceMarkup,
  Calibration,
  SensorFormat,
} from "../store/projectStore";
import { devicesById } from "../data/devices";
import { categoryColor } from "../brand/tokens";
import {
  getCoveragePreset,
  type CoveragePreset,
  type CoverageShape,
} from "../data/coveragePresets";
import { calcHFovDeg, DEFAULT_SENSOR } from "../data/lenses";

export interface EffectiveCoverage {
  shape: CoverageShape;
  /** Range in real-world feet */
  rangeFt: number;
  /** Sweep / beam angle in degrees */
  angle: number;
  /** Number of concentric "signal-strength" rings (rings >= 1) */
  rings: number;
  color: string;
  opacity: number;
  enabled: boolean;
  label: string;
  preset: CoveragePreset;
  /** Whether this device's category is "cameras" (drives lens UI gating). */
  isCamera: boolean;
  /** Active focal length in mm, if the user picked one. */
  focalLengthMm?: number;
  /** Sensor format actually used for the angle calculation. */
  sensorFormat: SensorFormat;
  /** Apex offset in feet — how far the cone visually starts in front of
   *  the camera body. */
  apexOffsetFt: number;
  /** Visual extras */
  showRangeMarkers: boolean;
  showCenterline: boolean;
  showQualityZones: boolean;
  showLabel: boolean;
}

const DEFAULT_OPACITY = 0.18;
const DEFAULT_APEX_OFFSET_FT = 1.5; // ~ "off the camera body"

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const finiteNumber = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function resolveCoverage(m: DeviceMarkup): EffectiveCoverage | null {
  const dev = devicesById[m.deviceId];
  if (!dev) return null;
  const preset = getCoveragePreset(dev.id, dev.category);
  if (!preset) return null;
  const override = m.coverage ?? {};
  const baseColor =
    preset.color ?? m.colorOverride ?? categoryColor[dev.category] ?? "#94A0B8";

  const isCamera = dev.category === "cameras";
  const sensorFormat = override.sensorFormat ?? DEFAULT_SENSOR;
  const focalLengthMm =
    typeof override.focalLengthMm === "number" &&
    Number.isFinite(override.focalLengthMm) &&
    override.focalLengthMm > 0
      ? override.focalLengthMm
      : undefined;

  // Angle priority:
  //   1. Explicit override.angle (user dragged the angle slider)
  //   2. Calculated from focal length + sensor (camera-style spec)
  //   3. Preset angle (default)
  let angle = finiteNumber(preset.angle, 90);
  if (focalLengthMm && override.angle === undefined) {
    angle = calcHFovDeg(focalLengthMm, sensorFormat);
  }
  if (override.angle !== undefined) angle = finiteNumber(override.angle, angle);
  angle = clamp(angle, 0.5, 360);

  const presetRange = Math.max(1, finiteNumber(preset.range, 1));
  const rangeFt = Math.max(1, finiteNumber(override.range, presetRange));
  const opacity = clamp(
    finiteNumber(override.opacity, finiteNumber(preset.opacity, DEFAULT_OPACITY)),
    0,
    1,
  );
  const apexOffsetFt = Math.max(
    0,
    finiteNumber(override.apexOffsetFt, isCamera ? DEFAULT_APEX_OFFSET_FT : 0),
  );

  return {
    shape: preset.shape,
    rangeFt,
    angle,
    rings: preset.rings ?? 1,
    color: override.color ?? baseColor,
    opacity,
    enabled: override.enabled ?? preset.defaultEnabled ?? false,
    label: preset.label ?? "Coverage",
    preset,
    isCamera,
    focalLengthMm,
    sensorFormat,
    apexOffsetFt,
    showRangeMarkers: override.showRangeMarkers ?? isCamera,
    showCenterline: override.showCenterline ?? isCamera,
    showQualityZones: override.showQualityZones ?? false,
    showLabel: override.showLabel ?? false,
  };
}

/**
 * Convert a coverage range from real-world feet to PDF user units using
 * the sheet's calibration. Returns null if the sheet hasn't been calibrated
 * (in which case we can't draw an accurate footprint).
 */
export function rangeFtToPts(
  ft: number,
  calibration: Calibration | undefined,
): number | null {
  if (!Number.isFinite(ft) || ft <= 0) return null;
  if (
    !calibration ||
    !Number.isFinite(calibration.pixelsPerFoot) ||
    calibration.pixelsPerFoot <= 0
  ) {
    return null;
  }
  const pts = ft * calibration.pixelsPerFoot;
  return Number.isFinite(pts) && pts > 0 ? pts : null;
}

/**
 * Convert our "0 = facing up, sweep clockwise" rotation convention into
 * Konva's "0 = 3 o'clock, sweep clockwise" wedge angles. Returns the
 * starting angle in degrees for a sector centered around the device's
 * rotation, given a sweep amount.
 */
export function konvaSectorStart(
  deviceRotationDeg: number,
  sweepDeg: number,
): number {
  return -90 + deviceRotationDeg - sweepDeg / 2;
}

export function normalizeRotationDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/**
 * Convert an aim point in app-space (y-down) into the app's device rotation
 * convention: 0deg faces up, increasing clockwise.
 */
export function rotationDegFromPoint(
  center: { x: number; y: number },
  point: { x: number; y: number },
): number {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  if (dx === 0 && dy === 0) return 0;
  return normalizeRotationDeg((Math.atan2(dy, dx) * 180) / Math.PI + 90);
}
