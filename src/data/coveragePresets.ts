// Coverage presets — describes the visual "field-of-view" / "signal
// propagation" / "beam spread" / "pickup pattern" for a given device type.
// Looked up first by device id; falls back to a category-level preset.

import type { DeviceCategory } from "./devices";

/** Visual shape for the coverage area */
export type CoverageShape = "sector" | "circle" | "beam" | "rect";

export interface CoveragePreset {
  /**
   * sector — pie wedge for cameras, motion, directional speakers, lights
   * circle — full disc for fisheye cams, ceiling speakers, smoke detectors
   * beam   — long narrow cone for P2P bridges, microwave links, beam detectors
   * rect   — rectangle for line arrays, strip lights wash zones
   */
  shape: CoverageShape;
  /** Range in real-world feet */
  range: number;
  /** Sweep / beam angle in degrees (sector + beam only) */
  angle?: number;
  /** Concentric "signal strength" rings, e.g. for APs (3 = strong/good/weak) */
  rings?: number;
  /** Override color (hex). Defaults to the device's category color. */
  color?: string;
  /** Default fill opacity (0..1). Defaults to ~0.18. */
  opacity?: number;
  /** Whether coverage shows by default when this device is placed */
  defaultEnabled?: boolean;
  /** Friendly label to display in the properties panel header */
  label?: string;
}

// ─────────────────────────────────────────────────────────────────
// Per-device presets (fine-tuned for known device types)
// ─────────────────────────────────────────────────────────────────

export const DEVICE_PRESETS: Record<string, CoveragePreset> = {
  // Cameras — typical FOVs and ranges (rough industry defaults)
  "cam-dome": { shape: "sector", range: 50, angle: 90, defaultEnabled: true, label: "Field of view" },
  "cam-bullet": { shape: "sector", range: 75, angle: 60, defaultEnabled: true, label: "Field of view" },
  "cam-ptz": { shape: "sector", range: 120, angle: 60, defaultEnabled: true, label: "Field of view" },
  "cam-fisheye": { shape: "circle", range: 35, defaultEnabled: true, label: "360° coverage" },
  "cam-360": { shape: "circle", range: 35, defaultEnabled: true, label: "360° coverage" },
  "cam-multi": { shape: "circle", range: 50, defaultEnabled: true, label: "Multi-sensor coverage" },
  "cam-thermal": {
    shape: "sector",
    range: 250,
    angle: 50,
    defaultEnabled: true,
    color: "#FF5C7A",
    label: "Thermal range",
  },
  "cam-lpr": {
    shape: "sector",
    range: 100,
    angle: 30,
    defaultEnabled: true,
    color: "#F4B740",
    label: "LPR capture zone",
  },
  "cam-broadcast": { shape: "sector", range: 80, angle: 45, defaultEnabled: false, label: "Shot framing" },
  "cam-pinhole": { shape: "sector", range: 25, angle: 60, defaultEnabled: false, label: "Field of view" },
  "cam-pov": { shape: "sector", range: 35, angle: 110, defaultEnabled: false, label: "Wide POV" },
  "cam-robotic-ptz": { shape: "sector", range: 100, angle: 60, defaultEnabled: true, label: "Field of view" },

  // Network — APs and links
  "net-ap-i": { shape: "circle", range: 50, rings: 3, defaultEnabled: true, label: "Signal coverage" },
  "net-ap-o": { shape: "circle", range: 100, rings: 3, defaultEnabled: true, label: "Signal coverage" },
  "net-mesh-node": { shape: "circle", range: 75, rings: 3, defaultEnabled: true, label: "Mesh coverage" },
  "net-wifi-bridge": {
    shape: "beam",
    range: 500,
    angle: 8,
    defaultEnabled: true,
    label: "Point-to-point link",
  },
  "net-microwave": {
    shape: "beam",
    range: 1500,
    angle: 4,
    defaultEnabled: true,
    label: "Microwave link",
  },

  // Detection
  "det-pir": { shape: "sector", range: 40, angle: 110, defaultEnabled: true, label: "PIR detection zone" },
  "det-dual": { shape: "sector", range: 50, angle: 90, defaultEnabled: true, label: "Detection zone" },
  "det-glass": { shape: "circle", range: 25, defaultEnabled: true, label: "Glass-break range" },
  "det-smoke": { shape: "circle", range: 30, defaultEnabled: false, label: "Smoke coverage" },
  "det-beam": { shape: "beam", range: 300, angle: 1.5, defaultEnabled: true, label: "Beam path" },
  "det-vibration": { shape: "circle", range: 8, defaultEnabled: false, label: "Vibration range" },
  "det-temp": { shape: "circle", range: 12, defaultEnabled: false, label: "Sensing area" },
  "det-humidity": { shape: "circle", range: 12, defaultEnabled: false, label: "Sensing area" },
  "det-co": { shape: "circle", range: 18, defaultEnabled: false, label: "Sensing area" },
  "det-co2": { shape: "circle", range: 18, defaultEnabled: false, label: "Sensing area" },
  "det-water": { shape: "circle", range: 6, defaultEnabled: false, label: "Detection radius" },

  // Lighting — beam angles approximate
  "lit-led-1x1": { shape: "sector", range: 25, angle: 100, defaultEnabled: false, label: "Beam spread" },
  "lit-led-2x2": { shape: "sector", range: 30, angle: 110, defaultEnabled: false, label: "Beam spread" },
  "lit-fresnel": { shape: "sector", range: 40, angle: 30, defaultEnabled: false, label: "Beam spread" },
  "lit-ellipsoidal": { shape: "sector", range: 60, angle: 25, defaultEnabled: false, label: "Beam spread" },
  "lit-par-led": { shape: "sector", range: 35, angle: 35, defaultEnabled: false, label: "Beam spread" },
  "lit-mover-spot": { shape: "sector", range: 80, angle: 15, defaultEnabled: false, label: "Beam spread" },
  "lit-mover-wash": { shape: "sector", range: 50, angle: 50, defaultEnabled: false, label: "Wash spread" },
  "lit-mover-beam": { shape: "sector", range: 150, angle: 4, defaultEnabled: false, label: "Beam spread" },
  "lit-followspot": { shape: "sector", range: 100, angle: 20, defaultEnabled: false, label: "Beam spread" },
  "lit-strip": { shape: "rect", range: 16, angle: 0, defaultEnabled: false, label: "Light bar" },
  "lit-cyc": { shape: "rect", range: 20, angle: 0, defaultEnabled: false, label: "Cyc wash" },
  "lit-blinder": { shape: "sector", range: 45, angle: 80, defaultEnabled: false, label: "Audience throw" },
  "lit-work": { shape: "sector", range: 30, angle: 120, defaultEnabled: false, label: "Throw area" },

  // Audio — speaker dispersion / mic pickup
  "aud-spk-pendant": { shape: "circle", range: 25, defaultEnabled: false, label: "Coverage area" },
  "aud-spk-surface": { shape: "sector", range: 35, angle: 90, defaultEnabled: false, label: "Dispersion" },
  "aud-spk-line": { shape: "sector", range: 80, angle: 90, defaultEnabled: false, label: "Throw" },
  "aud-spk-h": { shape: "sector", range: 60, angle: 90, defaultEnabled: false, label: "Dispersion" },
  "aud-spk-monitor": { shape: "sector", range: 25, angle: 75, defaultEnabled: false, label: "Wedge throw" },
  "aud-spk-sub": { shape: "circle", range: 50, defaultEnabled: false, label: "LF coverage" },
  "av-spk-c": { shape: "circle", range: 22, defaultEnabled: false, label: "Coverage area" },
  "av-spk-h": { shape: "sector", range: 60, angle: 90, defaultEnabled: false, label: "Dispersion" },
  "aud-mic-shotgun": { shape: "sector", range: 25, angle: 30, defaultEnabled: false, label: "Pickup pattern" },
  "aud-mic-boundary": { shape: "sector", range: 18, angle: 180, defaultEnabled: false, label: "Pickup pattern" },
  "aud-mic-handheld": { shape: "circle", range: 4, defaultEnabled: false, label: "Pickup pattern" },
  "aud-mic-condenser": { shape: "circle", range: 8, defaultEnabled: false, label: "Pickup pattern" },
  "aud-mic-headset": { shape: "circle", range: 1, defaultEnabled: false, label: "Pickup pattern" },
  "aud-mic-lav": { shape: "circle", range: 1, defaultEnabled: false, label: "Pickup pattern" },
  "aud-mic-gooseneck": { shape: "sector", range: 6, angle: 110, defaultEnabled: false, label: "Pickup pattern" },

  // Wireless / RF — receiver coverage area
  "wls-mic-rx": { shape: "circle", range: 250, rings: 3, defaultEnabled: false, label: "RX coverage" },
  "wls-iem-tx": { shape: "circle", range: 250, rings: 3, defaultEnabled: false, label: "IEM coverage" },
  "wls-antenna-paddle": {
    shape: "sector",
    range: 200,
    angle: 90,
    defaultEnabled: false,
    label: "Antenna pattern",
  },
  "wls-antenna-helical": {
    shape: "sector",
    range: 600,
    angle: 30,
    defaultEnabled: false,
    label: "Helical pattern",
  },

  // Access control — read range is short
  "ac-reader": { shape: "circle", range: 4, defaultEnabled: false, label: "Read range" },
  "ac-bio-finger": { shape: "circle", range: 1, defaultEnabled: false, label: "Read range" },
  "ac-bio-face": { shape: "sector", range: 6, angle: 60, defaultEnabled: false, label: "Recognition zone" },
  "ac-rex": { shape: "sector", range: 8, angle: 110, defaultEnabled: false, label: "Detection zone" },
  "ac-intercom": { shape: "sector", range: 12, angle: 110, defaultEnabled: false, label: "Field of view" },
  "ac-dps": { shape: "circle", range: 1, defaultEnabled: false, label: "Sensor pair" },
};

// ─────────────────────────────────────────────────────────────────
// Category-level fallbacks for devices without a specific preset
// ─────────────────────────────────────────────────────────────────

export const CATEGORY_PRESETS: Partial<Record<DeviceCategory, CoveragePreset>> = {
  cameras: { shape: "sector", range: 60, angle: 90, defaultEnabled: true },
  network: { shape: "circle", range: 50, rings: 3, defaultEnabled: true },
  detection: { shape: "sector", range: 40, angle: 90, defaultEnabled: false },
  lighting: { shape: "sector", range: 30, angle: 60, defaultEnabled: false },
  audio: { shape: "circle", range: 25, defaultEnabled: false },
  av: { shape: "sector", range: 30, angle: 60, defaultEnabled: false },
  wireless: { shape: "circle", range: 200, rings: 3, defaultEnabled: false },
  broadcast: { shape: "sector", range: 60, angle: 45, defaultEnabled: false },
  access: { shape: "circle", range: 4, defaultEnabled: false },
};

export function getCoveragePreset(
  deviceId: string,
  category: DeviceCategory,
): CoveragePreset | null {
  return DEVICE_PRESETS[deviceId] ?? CATEGORY_PRESETS[category] ?? null;
}
