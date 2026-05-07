// Camera lens math + presets. Keeps the FOV calculator honest by using the
// same sensor-format / focal-length tables that vendor tools (IPVM
// Calculator, Milestone System Designer, Avigilon Design Tool) use.

import type { SensorFormat } from "../store/projectStore";

/**
 * Effective image-sensor width in millimeters, by format. The "1/x" naming
 * is a holdover from the vidicon era and doesn't equal a real fraction —
 * these are the conventional measured widths used by lens manufacturers.
 */
export const SENSOR_WIDTH_MM: Record<SensorFormat, number> = {
  "1/4": 3.6,
  "1/3.6": 4.0,
  "1/3": 4.8,
  "1/2.9": 4.96,
  "1/2.8": 5.12,
  "1/2.7": 5.37,
  "1/2.5": 5.76,
  "1/2.3": 6.16,
  "1/2": 6.4,
  "1/1.8": 7.18,
  "1/1.7": 7.6,
  "2/3": 8.8,
  "1": 12.8,
};

export const SENSOR_FORMATS: SensorFormat[] = [
  "1/4",
  "1/3.6",
  "1/3",
  "1/2.9",
  "1/2.8",
  "1/2.7",
  "1/2.5",
  "1/2.3",
  "1/2",
  "1/1.8",
  "1/1.7",
  "2/3",
  "1",
];

export const DEFAULT_SENSOR: SensorFormat = "1/2.7";

/**
 * Compute the horizontal field of view (degrees) given a focal length in
 * mm and a sensor format. Uses the standard pinhole-camera model:
 *   HFOV = 2 · atan(sensorWidth / (2 · focalLength))
 */
export function calcHFovDeg(
  focalLengthMm: number,
  sensorFormat: SensorFormat = DEFAULT_SENSOR,
): number {
  if (!isFinite(focalLengthMm) || focalLengthMm <= 0) return 0;
  const w = SENSOR_WIDTH_MM[sensorFormat] ?? SENSOR_WIDTH_MM[DEFAULT_SENSOR];
  const hfov = 2 * Math.atan(w / (2 * focalLengthMm));
  return (hfov * 180) / Math.PI;
}

/**
 * Inverse: given a desired HFOV (degrees) and sensor, what focal length?
 * Useful if the user dials the angle slider and we want to show "this is
 * roughly equivalent to a Xmm lens".
 */
export function focalLengthForHfov(
  hfovDeg: number,
  sensorFormat: SensorFormat = DEFAULT_SENSOR,
): number {
  if (!isFinite(hfovDeg) || hfovDeg <= 0 || hfovDeg >= 180) return 0;
  const w = SENSOR_WIDTH_MM[sensorFormat] ?? SENSOR_WIDTH_MM[DEFAULT_SENSOR];
  const halfRad = (hfovDeg * Math.PI) / 360;
  return w / (2 * Math.tan(halfRad));
}

/**
 * A preset = a quick choice the user can pick from a dropdown. Common
 * choices found across the security industry. Values are typical (not
 * vendor-specific) so the user can always fine-tune.
 */
export interface LensPreset {
  id: string;
  label: string;
  focalLengthMm: number;
  sensor: SensorFormat;
  /** Approximate use case for the dropdown subtitle */
  hint: string;
}

export const LENS_PRESETS: LensPreset[] = [
  {
    id: "fisheye-1.4",
    label: "1.4 mm Fisheye",
    focalLengthMm: 1.4,
    sensor: "1/2.7",
    hint: "Panoramic / 360° interior coverage",
  },
  {
    id: "ultra-wide-2.1",
    label: "2.1 mm Ultra-wide",
    focalLengthMm: 2.1,
    sensor: "1/2.7",
    hint: "~120° HFOV, tight overhead corridors",
  },
  {
    id: "wide-2.8",
    label: "2.8 mm Wide",
    focalLengthMm: 2.8,
    sensor: "1/2.7",
    hint: "~94° HFOV, lobby/room overview",
  },
  {
    id: "wide-3.6",
    label: "3.6 mm",
    focalLengthMm: 3.6,
    sensor: "1/2.7",
    hint: "~78° HFOV, classrooms/offices",
  },
  {
    id: "standard-4",
    label: "4 mm Standard",
    focalLengthMm: 4,
    sensor: "1/2.7",
    hint: "~70° HFOV, most common interior pick",
  },
  {
    id: "standard-6",
    label: "6 mm",
    focalLengthMm: 6,
    sensor: "1/2.7",
    hint: "~50° HFOV, hallways, parking aisles",
  },
  {
    id: "tele-8",
    label: "8 mm",
    focalLengthMm: 8,
    sensor: "1/2.7",
    hint: "~38° HFOV, mid-range outdoor",
  },
  {
    id: "tele-12",
    label: "12 mm",
    focalLengthMm: 12,
    sensor: "1/2.7",
    hint: "~26° HFOV, parking lots, perimeter",
  },
  {
    id: "tele-16",
    label: "16 mm",
    focalLengthMm: 16,
    sensor: "1/2.7",
    hint: "~19° HFOV, long parking/loading dock",
  },
  {
    id: "tele-25",
    label: "25 mm Telephoto",
    focalLengthMm: 25,
    sensor: "1/2.7",
    hint: "~12° HFOV, license plates at distance",
  },
  {
    id: "tele-50",
    label: "50 mm LPR",
    focalLengthMm: 50,
    sensor: "1/2.7",
    hint: "~6° HFOV, dedicated LPR lane",
  },
  {
    id: "varifocal-2.7-13.5",
    label: "2.7–13.5 mm Varifocal",
    focalLengthMm: 6,
    sensor: "1/2.7",
    hint: "Adjustable in field; default to ~6 mm",
  },
  {
    id: "varifocal-3.4-22",
    label: "3.4–22 mm Motorized",
    focalLengthMm: 8,
    sensor: "1/2.5",
    hint: "Bullet/LPR adjustable; default ~8 mm",
  },
];

/**
 * Quality-zone defaults for security cameras. These are based on the
 * Pixels-Per-Foot industry rule of thumb where N ppf at distance D
 * implies a sensor-width-and-focal-length-derived bound. We expose them
 * as relative fractions of the user's chosen total range so the visual
 * always lines up with the "max usable distance" they configured.
 */
export const QUALITY_ZONES: { id: string; label: string; fraction: number }[] = [
  { id: "ident", label: "Identify", fraction: 0.35 },
  { id: "recog", label: "Recognize", fraction: 0.6 },
  { id: "detect", label: "Detect", fraction: 1.0 },
];
