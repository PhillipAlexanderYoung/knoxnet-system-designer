// Device library: data-driven manifest. Adding a new device type = one entry.
// Icons are described as SVG path commands relative to a 24x24 viewBox so they
// render crisply both inside react-konva (Path nodes) and inside pdf-lib
// (drawSvgPath) on export.

import type { PortSpec } from "../store/projectStore";

export type DeviceCategory =
  | "cameras"
  | "access"
  | "network"
  | "detection"
  | "av"
  | "audio"
  | "lighting"
  | "production"
  | "wireless"
  | "broadcast"
  | "site";

export interface DeviceType {
  id: string;
  label: string;
  shortCode: string; // used for auto-numbered labels (e.g. CAM, AP, NID)
  category: DeviceCategory;
  /** Optional second-level grouping inside the palette (e.g. "Microphones"). */
  subcategory?: string;
  /** Optional manufacturer-style hint (e.g. "Cisco", "Shure"). Surfaces in
   *  search and the properties panel. */
  manufacturer?: string;
  /** Free-form keywords for fuzzy palette search (model numbers, slang,
   *  abbreviations — anything a tech might type). */
  keywords?: string[];
  // SVG paths drawn within a 24x24 viewBox, centered on (12,12).
  // Each path will be stroked/filled in the device's category color.
  icon: {
    paths: { d: string; fill?: string; stroke?: string; strokeWidth?: number }[];
  };
  defaultCost: number; // material cost per unit, USD
  laborHours: number; // installation labor per unit
  notes?: string;
  /**
   * Bundled port spec for this device type. Surfaces in the
   * properties-panel connection editor as a dropdown, in reports as
   * a flattened "Ports" column, and (Phase 4+) as wireable handles in
   * the signal-flow diagram. Optional — devices without a spec keep
   * the free-text fallback so the editor never blocks the user.
   */
  ports?: PortSpec[];
}

// ───────── Shared port templates ─────────
// Most devices fall into one of a handful of physical-port patterns.
// Pulling them out as helpers keeps the catalog readable and avoids
// drift (e.g. forgetting to mark camera ETH0 as PoE-in).

const ETH0_POE_IN: PortSpec = {
  id: "eth0",
  label: "ETH 0 (PoE in)",
  kind: "ethernet",
  poe: "in",
  speed: "1G",
};

const ETH0_LAN: PortSpec = {
  id: "eth0",
  label: "ETH 0 (LAN)",
  kind: "ethernet",
  speed: "1G",
};

const RS485_BUS: PortSpec = {
  id: "rs485",
  label: "RS-485",
  kind: "serial",
};

const POWER_DC: PortSpec = {
  id: "dc-in",
  label: "DC In (12 V)",
  kind: "power",
};

/** Build N copper switch ports with optional PoE on every port. */
function switchPorts(
  count: number,
  opts: { poe?: "out"; speed?: string; prefix?: string } = {},
): PortSpec[] {
  const out: PortSpec[] = [];
  const prefix = opts.prefix ?? "Port";
  for (let i = 1; i <= count; i++) {
    out.push({
      id: `port-${i}`,
      label: `${prefix} ${i}`,
      kind: "ethernet",
      poe: opts.poe,
      speed: opts.speed ?? "1G",
    });
  }
  return out;
}

/** Build M SFP/SFP+ uplinks. */
function sfpPorts(count: number, speed = "10G"): PortSpec[] {
  const out: PortSpec[] = [];
  for (let i = 1; i <= count; i++) {
    out.push({
      id: `sfp-${i}`,
      label: `SFP+ ${i}`,
      kind: "fiber",
      speed,
      pluggable: true,
    });
  }
  return out;
}

// helper: ring + body builder pattern keeps icons consistent
const RING = (color: string) =>
  `<circle cx="12" cy="12" r="11" fill="none" stroke="${color}"/>`;

export const devices: DeviceType[] = [
  // ───────── Cameras ─────────
  {
    id: "cam-dome",
    label: "Dome Camera",
    shortCode: "CAM",
    category: "cameras",
    defaultCost: 425,
    laborHours: 1.25,
    icon: {
      paths: [
        { d: "M2 12 a10 10 0 0 1 20 0 z", fill: "currentFill" },
        { d: "M2 12 a10 10 0 0 1 20 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", fill: "currentStroke", stroke: "none" },
      ],
    },
  },
  {
    id: "cam-bullet",
    label: "Bullet Camera",
    shortCode: "CAM",
    category: "cameras",
    defaultCost: 380,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M3 9 h12 l4 3 l-4 3 h-12 z", fill: "currentFill" },
        { d: "M3 9 h12 l4 3 l-4 3 h-12 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M16 12 m-1.4 0 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0", fill: "currentStroke", stroke: "none" },
      ],
    },
  },
  {
    id: "cam-ptz",
    label: "PTZ Camera",
    shortCode: "PTZ",
    category: "cameras",
    defaultCost: 1850,
    laborHours: 2.5,
    icon: {
      paths: [
        { d: "M4 16 h16", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 16 v-4 a5 5 0 0 1 10 0 v4 z", fill: "currentFill" },
        { d: "M7 16 v-4 a5 5 0 0 1 10 0 v4 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M14 11 m-1.6 0 a1.6 1.6 0 1 0 3.2 0 a1.6 1.6 0 1 0 -3.2 0", fill: "currentStroke", stroke: "none" },
      ],
    },
  },
  {
    id: "cam-fisheye",
    label: "Fisheye Camera",
    shortCode: "FSH",
    category: "cameras",
    defaultCost: 925,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M12 12 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", fill: "currentFill" },
        { d: "M12 12 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 12 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0", fill: "none", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M12 12 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0", fill: "currentStroke", stroke: "none" },
      ],
    },
  },
  {
    id: "cam-multi",
    label: "Multi-Sensor Camera",
    shortCode: "MSC",
    category: "cameras",
    defaultCost: 2400,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M2 12 a10 10 0 0 1 20 0 z", fill: "currentFill" },
        { d: "M2 12 a10 10 0 0 1 20 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 11 m-1.4 0 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0", fill: "currentStroke", stroke: "none" },
        { d: "M12 8 m-1.4 0 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0", fill: "currentStroke", stroke: "none" },
        { d: "M17 11 m-1.4 0 a1.4 1.4 0 1 0 2.8 0 a1.4 1.4 0 1 0 -2.8 0", fill: "currentStroke", stroke: "none" },
      ],
    },
  },
  {
    id: "cam-thermal",
    label: "Thermal Camera",
    shortCode: "THR",
    category: "cameras",
    defaultCost: 3200,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M3 9 h12 l4 3 l-4 3 h-12 z", fill: "currentFill" },
        { d: "M3 9 h12 l4 3 l-4 3 h-12 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M6 11 h6 M6 13 h6", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "cam-lpr",
    label: "LPR Camera",
    shortCode: "LPR",
    category: "cameras",
    defaultCost: 1950,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M3 9 h12 l4 3 l-4 3 h-12 z", fill: "currentFill" },
        { d: "M3 9 h12 l4 3 l-4 3 h-12 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 17 h10 v3 h-10 z", fill: "currentStroke", stroke: "none" },
      ],
    },
  },

  // ───────── Access Control ─────────
  {
    id: "ac-reader",
    label: "Card Reader",
    shortCode: "CR",
    category: "access",
    defaultCost: 285,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M6 4 h12 v16 h-12 z", fill: "currentFill" },
        { d: "M6 4 h12 v16 h-12 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 8 h6 M9 11 h6 M10 18 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0", stroke: "currentStroke", strokeWidth: 1, fill: "currentStroke" },
      ],
    },
  },
  {
    id: "ac-rex",
    label: "REX Button",
    shortCode: "RX",
    category: "access",
    defaultCost: 95,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M2 12 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", fill: "currentFill" },
        { d: "M2 12 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M8 11 h8 v2 h-8 z", fill: "currentStroke", stroke: "none" },
      ],
    },
  },
  {
    id: "ac-maglock",
    label: "Magnetic Lock",
    shortCode: "ML",
    category: "access",
    defaultCost: 215,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M4 6 h16 v6 h-16 z", fill: "currentFill" },
        { d: "M4 6 h16 v6 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M8 12 v6 M16 12 v6", stroke: "currentStroke", strokeWidth: 2 },
      ],
    },
  },
  {
    id: "ac-strike",
    label: "Electric Strike",
    shortCode: "ES",
    category: "access",
    defaultCost: 245,
    laborHours: 2.5,
    icon: {
      paths: [
        { d: "M9 4 h6 v16 h-6 z", fill: "currentFill" },
        { d: "M9 4 h6 v16 h-6 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M11 10 h2 v4 h-2 z", fill: "currentStroke", stroke: "none" },
      ],
    },
  },
  {
    id: "ac-intercom",
    label: "Video Intercom",
    shortCode: "IC",
    category: "access",
    defaultCost: 685,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M5 4 h14 v16 h-14 z", fill: "currentFill" },
        { d: "M5 4 h14 v16 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M8 7 h8 v6 h-8 z", fill: "currentStroke", stroke: "none" },
        { d: "M9 16 h6", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M9 18 h6", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "ac-dps",
    label: "Door Position Switch",
    shortCode: "DPS",
    category: "access",
    defaultCost: 35,
    laborHours: 0.5,
    icon: {
      paths: [
        { d: "M5 10 h6 v4 h-6 z", fill: "currentFill" },
        { d: "M5 10 h6 v4 h-6 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M13 10 h6 v4 h-6 z", fill: "currentFill" },
        { d: "M13 10 h6 v4 h-6 z", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },
  {
    id: "ac-panic",
    label: "Panic / Duress",
    shortCode: "PB",
    category: "access",
    defaultCost: 115,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M2 12 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", fill: "currentFill" },
        { d: "M2 12 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 7 v7 M12 17 v0.5", stroke: "currentStroke", strokeWidth: 2 },
      ],
    },
  },

  // ───────── Network ─────────
  {
    id: "net-ap-i",
    label: "AP (Indoor)",
    shortCode: "AP",
    category: "network",
    defaultCost: 320,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M12 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", fill: "currentFill" },
        { d: "M12 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M6 12 a6 6 0 0 1 12 0", fill: "none", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M3 12 a9 9 0 0 1 18 0", fill: "none", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "net-ap-o",
    label: "AP (Outdoor)",
    shortCode: "AP-O",
    category: "network",
    defaultCost: 595,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M5 5 h14 v14 h-14 z", fill: "currentFill" },
        { d: "M5 5 h14 v14 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 12 a3 3 0 0 1 6 0", fill: "none", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M12 12 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0", fill: "currentStroke", stroke: "none" },
      ],
    },
  },
  {
    id: "net-switch-poe",
    label: "PoE Switch",
    shortCode: "SW",
    category: "network",
    defaultCost: 850,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M3 8 h18 v8 h-18 z", fill: "currentFill" },
        { d: "M3 8 h18 v8 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 11 h2 v2 h-2 z M8 11 h2 v2 h-2 z M11 11 h2 v2 h-2 z M14 11 h2 v2 h-2 z M17 11 h2 v2 h-2 z", fill: "currentStroke", stroke: "none" },
      ],
    },
  },
  {
    id: "net-switch-core",
    label: "Core Switch",
    shortCode: "CS",
    category: "network",
    defaultCost: 4200,
    laborHours: 4.0,
    icon: {
      paths: [
        { d: "M3 6 h18 v4 h-18 z M3 12 h18 v4 h-18 z", fill: "currentFill" },
        { d: "M3 6 h18 v4 h-18 z M3 12 h18 v4 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },
  {
    id: "net-nid",
    label: "NID / Demarc",
    shortCode: "NID",
    category: "network",
    defaultCost: 425,
    laborHours: 3.0,
    icon: {
      paths: [
        { d: "M5 4 h14 v16 h-14 z", fill: "currentFill" },
        { d: "M5 4 h14 v16 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M8 8 h8 v3 h-8 z", fill: "currentStroke", stroke: "none" },
        { d: "M8 13 h8 v3 h-8 z", fill: "none", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "net-router",
    label: "Router",
    shortCode: "RTR",
    category: "network",
    defaultCost: 1250,
    laborHours: 2.5,
    icon: {
      paths: [
        { d: "M2 12 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", fill: "currentFill" },
        { d: "M2 12 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 12 h10 M12 7 v10 M8 8 l8 8 M8 16 l8 -8", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "net-nvr",
    label: "NVR",
    shortCode: "NVR",
    category: "network",
    defaultCost: 2850,
    laborHours: 3.0,
    icon: {
      paths: [
        { d: "M3 7 h18 v10 h-18 z", fill: "currentFill" },
        { d: "M3 7 h18 v10 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 9 h7 v6 h-7 z", fill: "currentStroke", stroke: "none" },
        { d: "M14 10 h5 M14 12 h5 M14 14 h5", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "net-headend",
    label: "Head-end Cabinet",
    shortCode: "HE",
    category: "network",
    defaultCost: 3850,
    laborHours: 6.0,
    icon: {
      paths: [
        { d: "M4 3 h16 v18 h-16 z", fill: "currentFill" },
        { d: "M4 3 h16 v18 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M6 6 h12 M6 9 h12 M6 12 h12 M6 15 h12 M6 18 h12", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "net-rack",
    label: "Rack",
    shortCode: "RACK",
    category: "network",
    subcategory: "Infrastructure",
    keywords: ["equipment rack", "data rack", "rack system"],
    defaultCost: 1850,
    laborHours: 4.0,
    icon: {
      paths: [
        { d: "M5 3 h14 v18 h-14 z", fill: "currentFill" },
        { d: "M5 3 h14 v18 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 6 h10 M7 9 h10 M7 12 h10 M7 15 h10 M7 18 h10", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M5 5 h2 M17 5 h2 M5 19 h2 M17 19 h2", stroke: "currentStroke", strokeWidth: 0.8 },
      ],
    },
  },
  {
    id: "net-ups",
    label: "UPS",
    shortCode: "UPS",
    category: "network",
    defaultCost: 1450,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M5 4 h14 v16 h-14 z", fill: "currentFill" },
        { d: "M5 4 h14 v16 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M11 7 l-3 6 h3 l-1 4 4 -6 h-3 z", fill: "currentStroke", stroke: "none" },
      ],
    },
  },

  // ───────── Detection ─────────
  {
    id: "det-pir",
    label: "PIR Motion",
    shortCode: "PIR",
    category: "detection",
    defaultCost: 75,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M12 4 a8 8 0 0 1 8 8 h-16 a8 8 0 0 1 8 -8 z", fill: "currentFill" },
        { d: "M12 4 a8 8 0 0 1 8 8 h-16 a8 8 0 0 1 8 -8 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M8 12 l4 6 l4 -6", fill: "none", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "det-dual",
    label: "Dual-Tech Motion",
    shortCode: "DTM",
    category: "detection",
    defaultCost: 145,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M4 4 h16 v12 h-16 z", fill: "currentFill" },
        { d: "M4 4 h16 v12 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M8 16 l4 4 l4 -4", fill: "none", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "det-glass",
    label: "Glass Break",
    shortCode: "GB",
    category: "detection",
    defaultCost: 95,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0", fill: "currentFill" },
        { d: "M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 5 l3 4 l-2 3 l3 4 M9 5 l-3 4 l2 3 l-3 4", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "det-contact",
    label: "Door Contact",
    shortCode: "DC",
    category: "detection",
    defaultCost: 28,
    laborHours: 0.4,
    icon: {
      paths: [
        { d: "M5 9 h6 v6 h-6 z M13 9 h6 v6 h-6 z", fill: "currentFill" },
        { d: "M5 9 h6 v6 h-6 z M13 9 h6 v6 h-6 z", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },
  {
    id: "det-smoke",
    label: "Smoke Detector",
    shortCode: "SM",
    category: "detection",
    defaultCost: 195,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M12 12 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", fill: "currentFill" },
        { d: "M12 12 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 12 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0", fill: "none", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },

  // ───────── Audio / Video ─────────
  {
    id: "av-spk-c",
    label: "Ceiling Speaker",
    shortCode: "SPK",
    category: "av",
    defaultCost: 165,
    laborHours: 1.25,
    icon: {
      paths: [
        { d: "M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0", fill: "currentFill" },
        { d: "M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", fill: "none", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M12 12 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0", fill: "currentStroke", stroke: "none" },
      ],
    },
  },
  {
    id: "av-spk-h",
    label: "Horn Speaker",
    shortCode: "HRN",
    category: "av",
    defaultCost: 245,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M5 9 h6 l8 -4 v14 l-8 -4 h-6 z", fill: "currentFill" },
        { d: "M5 9 h6 l8 -4 v14 l-8 -4 h-6 z", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },
  {
    id: "av-display",
    label: "Display / Monitor",
    shortCode: "DSP",
    category: "av",
    defaultCost: 1450,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M3 5 h18 v12 h-18 z", fill: "currentFill" },
        { d: "M3 5 h18 v12 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 19 h6", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },
  {
    id: "av-mic",
    label: "Microphone",
    shortCode: "MIC",
    category: "av",
    defaultCost: 385,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M10 4 h4 v10 h-4 z", fill: "currentFill" },
        { d: "M10 4 h4 v10 h-4 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 12 a5 5 0 0 0 10 0 M12 17 v3", fill: "none", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },

  // ───────── Site / Fiber ─────────
  {
    id: "site-handhole",
    label: "Hand-hole",
    shortCode: "HH",
    category: "site",
    defaultCost: 485,
    laborHours: 4.0,
    icon: {
      paths: [
        { d: "M4 6 h16 v12 h-16 z", fill: "currentFill" },
        { d: "M4 6 h16 v12 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M4 12 h16 M12 6 v12", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "site-pullbox",
    label: "Pull Box",
    shortCode: "PB",
    category: "site",
    defaultCost: 185,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M5 7 h14 v10 h-14 z", fill: "currentFill" },
        { d: "M5 7 h14 v10 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },
  {
    id: "site-junction-box",
    label: "Junction Box",
    shortCode: "JB",
    category: "site",
    subcategory: "Distribution",
    keywords: ["junction box", "j-box", "splice box", "route point"],
    defaultCost: 95,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M5 5 h14 v14 h-14 z", fill: "currentFill" },
        { d: "M5 5 h14 v14 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M8 8 h8 v8 h-8 z", fill: "none", stroke: "currentStroke", strokeWidth: 0.8 },
        { d: "M12 5 v14 M5 12 h14", stroke: "currentStroke", strokeWidth: 0.6 },
      ],
    },
  },
  {
    id: "site-weatherproof-enclosure",
    label: "Weatherproof Enclosure",
    shortCode: "WPE",
    category: "site",
    subcategory: "Distribution",
    keywords: ["weatherproof enclosure", "nema", "outdoor enclosure", "junction box"],
    defaultCost: 325,
    laborHours: 1.75,
    icon: {
      paths: [
        { d: "M4 5 h16 v14 h-16 z", fill: "currentFill" },
        { d: "M4 5 h16 v14 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 8 h10 v8 h-10 z", fill: "none", stroke: "currentStroke", strokeWidth: 0.8 },
        { d: "M9 5 v-2 h6 v2 M8 12 h8", stroke: "currentStroke", strokeWidth: 0.8 },
      ],
    },
  },
  {
    id: "site-fiber-splice",
    label: "Fiber Splice Enclosure",
    shortCode: "FSE",
    category: "site",
    defaultCost: 950,
    laborHours: 5.0,
    icon: {
      paths: [
        { d: "M3 9 a4 4 0 0 1 4 -4 h10 a4 4 0 0 1 4 4 v6 a4 4 0 0 1 -4 4 h-10 a4 4 0 0 1 -4 -4 z", fill: "currentFill" },
        { d: "M3 9 a4 4 0 0 1 4 -4 h10 a4 4 0 0 1 4 4 v6 a4 4 0 0 1 -4 4 h-10 a4 4 0 0 1 -4 -4 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 12 h10", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },
  {
    id: "site-conduit",
    label: "Conduit Endpoint",
    shortCode: "CE",
    category: "site",
    defaultCost: 65,
    laborHours: 0.5,
    icon: {
      paths: [
        { d: "M12 12 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0", fill: "currentFill" },
        { d: "M12 12 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", fill: "none", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "site-ground",
    label: "Ground Rod",
    shortCode: "GND",
    category: "site",
    defaultCost: 95,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M12 4 v8", stroke: "currentStroke", strokeWidth: 2 },
        { d: "M6 12 h12 M8 15 h8 M10 18 h4", stroke: "currentStroke", strokeWidth: 2 },
      ],
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  EXPANDED LIBRARY — additional sheet devices across all categories
  // ═══════════════════════════════════════════════════════════════════════

  // ───────── Cameras (additions) ─────────
  {
    id: "cam-pinhole",
    label: "Pinhole / Covert Camera",
    shortCode: "PIN",
    category: "cameras",
    subcategory: "Specialty",
    keywords: ["covert", "spy", "hidden"],
    defaultCost: 285,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M2 12 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", fill: "currentFill" },
        { d: "M2 12 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 12 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0", fill: "currentStroke", stroke: "none" },
      ],
    },
  },
  {
    id: "cam-360",
    label: "360° Panoramic Camera",
    shortCode: "PAN",
    category: "cameras",
    subcategory: "Specialty",
    keywords: ["panoramic", "fisheye", "panomersive"],
    defaultCost: 1450,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M12 12 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", fill: "currentFill" },
        { d: "M12 12 m-10 0 a10 10 0 1 0 20 0 a10 10 0 1 0 -20 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 12 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0", fill: "none", stroke: "currentStroke", strokeWidth: 0.8 },
        { d: "M12 12 m-4 0 a4 4 0 1 0 8 0 a4 4 0 1 0 -8 0", fill: "none", stroke: "currentStroke", strokeWidth: 0.8 },
        { d: "M12 12 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0", fill: "currentStroke", stroke: "none" },
      ],
    },
  },
  {
    id: "cam-broadcast",
    label: "Broadcast Camera (Studio)",
    shortCode: "BCAM",
    category: "cameras",
    subcategory: "Broadcast",
    keywords: ["studio", "shoulder", "ENG", "cinema"],
    defaultCost: 28500,
    laborHours: 4.0,
    icon: {
      paths: [
        { d: "M3 8 h11 l3 -2 v10 l-3 -2 h-11 z", fill: "currentFill" },
        { d: "M3 8 h11 l3 -2 v10 l-3 -2 h-11 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M16 9 l4 -2 v10 l-4 -2 z", fill: "currentStroke", stroke: "none" },
      ],
    },
  },
  {
    id: "cam-pov",
    label: "POV / Action Camera",
    shortCode: "POV",
    category: "cameras",
    subcategory: "Specialty",
    keywords: ["gopro", "action", "mini"],
    defaultCost: 685,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M6 8 h12 v8 h-12 z", fill: "currentFill" },
        { d: "M6 8 h12 v8 h-12 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 12 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "cam-robotic-ptz",
    label: "Robotic Studio PTZ",
    shortCode: "RPTZ",
    category: "cameras",
    subcategory: "Broadcast",
    keywords: ["NewTek", "PTZOptics", "broadcast PTZ"],
    defaultCost: 4250,
    laborHours: 3.0,
    icon: {
      paths: [
        { d: "M5 17 h14 v-1 h-14 z", fill: "currentStroke" },
        { d: "M8 17 v-3 a4 4 0 0 1 8 0 v3 z", fill: "currentFill" },
        { d: "M8 17 v-3 a4 4 0 0 1 8 0 v3 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M14 13 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0", fill: "currentStroke" },
        { d: "M12 6 v3", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },

  // ───────── Access Control (additions) ─────────
  {
    id: "ac-turnstile",
    label: "Turnstile",
    shortCode: "TS",
    category: "access",
    subcategory: "Barriers",
    keywords: ["barrier", "tripod", "speed gate"],
    defaultCost: 4850,
    laborHours: 6.0,
    icon: {
      paths: [
        { d: "M5 4 h4 v16 h-4 z M15 4 h4 v16 h-4 z", fill: "currentFill" },
        { d: "M5 4 h4 v16 h-4 z M15 4 h4 v16 h-4 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 12 h6", stroke: "currentStroke", strokeWidth: 2 },
      ],
    },
  },
  {
    id: "ac-gate-arm",
    label: "Vehicle Gate Arm",
    shortCode: "GATE",
    category: "access",
    subcategory: "Barriers",
    keywords: ["barrier arm", "parking", "boom"],
    defaultCost: 3850,
    laborHours: 8.0,
    icon: {
      paths: [
        { d: "M4 16 h4 v4 h-4 z", fill: "currentFill" },
        { d: "M4 16 h4 v4 h-4 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M8 17 l13 -3 v2 l-13 3 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "ac-bio-finger",
    label: "Biometric Reader (Finger)",
    shortCode: "BIO",
    category: "access",
    subcategory: "Readers",
    keywords: ["biometric", "fingerprint"],
    defaultCost: 685,
    laborHours: 1.75,
    icon: {
      paths: [
        { d: "M6 4 h12 v16 h-12 z", fill: "currentFill" },
        { d: "M6 4 h12 v16 h-12 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 9 a3 3 0 0 1 6 0 v4 a3 3 0 0 1 -6 0 z", fill: "none", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M9 11 h6 M9 13 h6", stroke: "currentStroke", strokeWidth: 0.7 },
      ],
    },
  },
  {
    id: "ac-bio-face",
    label: "Biometric Reader (Face)",
    shortCode: "FACE",
    category: "access",
    subcategory: "Readers",
    keywords: ["biometric", "face", "facial"],
    defaultCost: 1250,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M5 4 h14 v16 h-14 z", fill: "currentFill" },
        { d: "M5 4 h14 v16 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 11 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M14 11 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0", fill: "currentStroke" },
        { d: "M9 14 q3 2 6 0", stroke: "currentStroke", strokeWidth: 1, fill: "none" },
      ],
    },
  },
  {
    id: "ac-key-cabinet",
    label: "Smart Key Cabinet",
    shortCode: "KC",
    category: "access",
    subcategory: "Storage",
    keywords: ["key tracer", "key control", "morse watchman"],
    defaultCost: 2450,
    laborHours: 2.5,
    icon: {
      paths: [
        { d: "M5 3 h14 v18 h-14 z", fill: "currentFill" },
        { d: "M5 3 h14 v18 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M8 8 h2 v2 h-2 z M14 8 h2 v2 h-2 z M8 13 h2 v2 h-2 z M14 13 h2 v2 h-2 z M8 18 h2 v0.5 h-2 z M14 18 h2 v0.5 h-2 z", fill: "currentStroke" },
      ],
    },
  },

  // ───────── Network (additions) ─────────
  {
    id: "net-wifi-bridge",
    label: "Wireless Bridge (P2P)",
    shortCode: "BR",
    category: "network",
    subcategory: "Wireless",
    keywords: ["bridge", "point-to-point", "PtP", "Ubiquiti", "AirFiber"],
    defaultCost: 685,
    laborHours: 3.0,
    icon: {
      paths: [
        { d: "M5 8 h6 v8 h-6 z", fill: "currentFill" },
        { d: "M5 8 h6 v8 h-6 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M11 12 q3 -3 6 0 q3 3 6 0", fill: "none", stroke: "currentStroke", strokeWidth: 1.2 },
        { d: "M11 12 q3 3 6 0 q3 -3 6 0", fill: "none", stroke: "currentStroke", strokeWidth: 1.2 },
      ],
    },
  },
  {
    id: "net-mesh-node",
    label: "Mesh Node",
    shortCode: "MSH",
    category: "network",
    subcategory: "Wireless",
    keywords: ["mesh", "node", "wifi 6"],
    defaultCost: 425,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M12 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", fill: "currentFill" },
        { d: "M12 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M4 4 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0 M20 4 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0 M4 20 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0 M20 20 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0", fill: "currentStroke" },
        { d: "M5 5 l6 6 M19 5 l-6 6 M5 19 l6 -6 M19 19 l-6 -6", stroke: "currentStroke", strokeWidth: 0.7 },
      ],
    },
  },
  {
    id: "net-microwave",
    label: "Microwave Link",
    shortCode: "MW",
    category: "network",
    subcategory: "Wireless",
    keywords: ["microwave", "long-haul", "dish"],
    defaultCost: 4850,
    laborHours: 8.0,
    icon: {
      paths: [
        { d: "M2 12 a10 10 0 0 1 20 0 z", fill: "currentFill" },
        { d: "M2 12 a10 10 0 0 1 20 0 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 4 v18 M9 22 h6", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },
  {
    id: "net-media-conv",
    label: "Fiber Media Converter",
    shortCode: "MC",
    category: "network",
    subcategory: "Distribution",
    keywords: ["media converter", "fiber to copper", "transceiver"],
    defaultCost: 185,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M4 9 h16 v6 h-16 z", fill: "currentFill" },
        { d: "M4 9 h16 v6 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M6 11 h3 v2 h-3 z M15 11 h3 v2 h-3 z", fill: "currentStroke" },
        { d: "M11 12 h2", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "net-poe-injector",
    label: "PoE Injector",
    shortCode: "POE",
    category: "network",
    subcategory: "Distribution",
    keywords: ["poe", "injector", "power over ethernet"],
    defaultCost: 95,
    laborHours: 0.5,
    icon: {
      paths: [
        { d: "M5 9 h14 v6 h-14 z", fill: "currentFill" },
        { d: "M5 9 h14 v6 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M11 7 l-2 5 h2 l-1 4 4 -6 h-2 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "net-sfp",
    label: "SFP / Transceiver Module",
    shortCode: "SFP",
    category: "network",
    subcategory: "Distribution",
    keywords: ["sfp", "sfp+", "qsfp", "transceiver"],
    defaultCost: 285,
    laborHours: 0.25,
    icon: {
      paths: [
        { d: "M6 10 h10 v4 h-10 z l-2 0 v4 h-2 v-8 h2 v4", fill: "currentFill" },
        { d: "M6 10 h12 v4 h-12 z", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },

  // ───────── Detection (additions) ─────────
  {
    id: "det-temp",
    label: "Temperature Sensor",
    shortCode: "TS",
    category: "detection",
    subcategory: "Environmental",
    keywords: ["temperature", "thermometer", "RTD"],
    defaultCost: 125,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M11 4 a2 2 0 0 1 2 2 v9 a3 3 0 1 1 -2 0 v-9 a0 0 0 0 1 0 0 z", fill: "currentFill" },
        { d: "M11 4 a2 2 0 0 1 2 2 v9 a3 3 0 1 1 -2 0 v-9", stroke: "currentStroke", strokeWidth: 1.2 },
        { d: "M12 17 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "det-humidity",
    label: "Humidity Sensor",
    shortCode: "RH",
    category: "detection",
    subcategory: "Environmental",
    keywords: ["humidity", "RH", "moisture"],
    defaultCost: 145,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M12 4 c-4 6 -6 9 -6 12 a6 6 0 0 0 12 0 c0 -3 -2 -6 -6 -12 z", fill: "currentFill" },
        { d: "M12 4 c-4 6 -6 9 -6 12 a6 6 0 0 0 12 0 c0 -3 -2 -6 -6 -12 z", stroke: "currentStroke", strokeWidth: 1.2 },
      ],
    },
  },
  {
    id: "det-co",
    label: "CO Detector",
    shortCode: "CO",
    category: "detection",
    subcategory: "Environmental",
    keywords: ["carbon monoxide", "co"],
    defaultCost: 165,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0", fill: "currentFill" },
        { d: "M12 12 m-9 0 a9 9 0 1 0 18 0 a9 9 0 1 0 -18 0", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },
  {
    id: "det-co2",
    label: "CO2 Sensor",
    shortCode: "CO2",
    category: "detection",
    subcategory: "Environmental",
    keywords: ["carbon dioxide", "co2", "air quality"],
    defaultCost: 285,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M5 8 h14 v8 h-14 z", fill: "currentFill" },
        { d: "M5 8 h14 v8 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },
  {
    id: "det-water",
    label: "Water Leak Sensor",
    shortCode: "H2O",
    category: "detection",
    subcategory: "Environmental",
    keywords: ["water leak", "flood", "moisture"],
    defaultCost: 95,
    laborHours: 0.5,
    icon: {
      paths: [
        { d: "M12 4 c-3 4 -5 7 -5 10 a5 5 0 0 0 10 0 c0 -3 -2 -6 -5 -10 z", fill: "currentFill" },
        { d: "M12 4 c-3 4 -5 7 -5 10 a5 5 0 0 0 10 0 c0 -3 -2 -6 -5 -10 z", stroke: "currentStroke", strokeWidth: 1.2 },
        { d: "M9 14 q1 2 3 0 q1 -2 3 0", stroke: "currentStroke", strokeWidth: 0.8, fill: "none" },
      ],
    },
  },
  {
    id: "det-beam",
    label: "Photoelectric Beam Detector",
    shortCode: "BEAM",
    category: "detection",
    subcategory: "Perimeter",
    keywords: ["beam", "photoelectric", "perimeter"],
    defaultCost: 485,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M3 9 h4 v6 h-4 z M17 9 h4 v6 h-4 z", fill: "currentFill" },
        { d: "M3 9 h4 v6 h-4 z M17 9 h4 v6 h-4 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 12 h10", stroke: "currentStroke", strokeWidth: 0.8 },
      ],
    },
  },
  {
    id: "det-vibration",
    label: "Vibration Sensor",
    shortCode: "VIB",
    category: "detection",
    subcategory: "Specialty",
    keywords: ["vibration", "shock", "tamper"],
    defaultCost: 185,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M12 12 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0", fill: "currentFill" },
        { d: "M12 12 m-6 0 a6 6 0 1 0 12 0 a6 6 0 1 0 -12 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 12 l1 -2 l2 4 l2 -4 l1 2", stroke: "currentStroke", strokeWidth: 1, fill: "none" },
      ],
    },
  },

  // ───────── Video / Display (was AV) ─────────
  {
    id: "av-projector",
    label: "Projector (Ceiling)",
    shortCode: "PRJ",
    category: "av",
    subcategory: "Displays",
    keywords: ["projector", "epson", "panasonic", "barco"],
    defaultCost: 4850,
    laborHours: 3.0,
    icon: {
      paths: [
        { d: "M3 9 h12 v6 h-12 z", fill: "currentFill" },
        { d: "M3 9 h12 v6 h-12 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M15 12 l5 -2 v4 z", fill: "currentStroke" },
        { d: "M5 11 m-0.5 0 a0.5 0.5 0 1 0 1 0 a0.5 0.5 0 1 0 -1 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "av-projector-st",
    label: "Short-throw Projector",
    shortCode: "STP",
    category: "av",
    subcategory: "Displays",
    keywords: ["short throw", "projector", "ust"],
    defaultCost: 2850,
    laborHours: 2.5,
    icon: {
      paths: [
        { d: "M4 14 h12 v4 h-12 z", fill: "currentFill" },
        { d: "M4 14 h12 v4 h-12 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M16 16 l4 -8 v6 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "av-screen",
    label: "Motorized Projection Screen",
    shortCode: "SCR",
    category: "av",
    subcategory: "Displays",
    keywords: ["screen", "projection", "draper", "da-lite"],
    defaultCost: 1850,
    laborHours: 3.0,
    icon: {
      paths: [
        { d: "M3 4 h18 v3 h-18 z", fill: "currentFill" },
        { d: "M3 4 h18 v3 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 7 v10 h14 v-10", fill: "none", stroke: "currentStroke", strokeWidth: 0.8 },
      ],
    },
  },
  {
    id: "av-videowall",
    label: "Video Wall Tile",
    shortCode: "VW",
    category: "av",
    subcategory: "Displays",
    keywords: ["video wall", "led wall", "tile", "absen", "samsung"],
    defaultCost: 3850,
    laborHours: 3.0,
    icon: {
      paths: [
        { d: "M3 4 h8 v8 h-8 z M13 4 h8 v8 h-8 z M3 14 h8 v8 h-8 z M13 14 h8 v8 h-8 z", fill: "currentFill" },
        { d: "M3 4 h8 v8 h-8 z M13 4 h8 v8 h-8 z M3 14 h8 v8 h-8 z M13 14 h8 v8 h-8 z", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "av-matrix",
    label: "Video Matrix Switcher",
    shortCode: "MTX",
    category: "av",
    subcategory: "Distribution",
    keywords: ["matrix", "switcher", "extron", "crestron", "kramer"],
    defaultCost: 4250,
    laborHours: 3.0,
    icon: {
      paths: [
        { d: "M3 7 h18 v10 h-18 z", fill: "currentFill" },
        { d: "M3 7 h18 v10 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 10 h2 v2 h-2 z M9 10 h2 v2 h-2 z M13 10 h2 v2 h-2 z M17 10 h2 v2 h-2 z M5 14 h2 v2 h-2 z M9 14 h2 v2 h-2 z M13 14 h2 v2 h-2 z M17 14 h2 v2 h-2 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "av-scaler",
    label: "Scaler / Presentation Switcher",
    shortCode: "SCL",
    category: "av",
    subcategory: "Distribution",
    keywords: ["scaler", "presentation switcher", "kramer", "extron"],
    defaultCost: 685,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M4 9 h16 v6 h-16 z", fill: "currentFill" },
        { d: "M4 9 h16 v6 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 11 h2 v2 h-2 z M11 11 h6 v2 h-6 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "av-da",
    label: "Distribution Amp (Video)",
    shortCode: "DA",
    category: "av",
    subcategory: "Distribution",
    keywords: ["DA", "distribution amp", "splitter"],
    defaultCost: 385,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M5 9 h14 v6 h-14 z", fill: "currentFill" },
        { d: "M5 9 h14 v6 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 12 h2 M14 10 h2 M14 12 h2 M14 14 h2", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M9 12 l4 -2 M9 12 l4 0 M9 12 l4 2", stroke: "currentStroke", strokeWidth: 0.8 },
      ],
    },
  },
  {
    id: "av-extender",
    label: "HDBaseT Extender Pair",
    shortCode: "EXT",
    category: "av",
    subcategory: "Distribution",
    keywords: ["hdbaset", "extender", "balun"],
    defaultCost: 425,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M3 10 h7 v4 h-7 z M14 10 h7 v4 h-7 z", fill: "currentFill" },
        { d: "M3 10 h7 v4 h-7 z M14 10 h7 v4 h-7 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M10 12 h4", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "av-wallplate",
    label: "AV Wall Plate (HDMI/Network)",
    shortCode: "WP",
    category: "av",
    subcategory: "Plates & Boxes",
    keywords: ["wall plate", "hdmi", "input plate"],
    defaultCost: 165,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M5 4 h14 v16 h-14 z", fill: "currentFill" },
        { d: "M5 4 h14 v16 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M8 8 h8 v3 h-8 z M8 14 m-1 1 a4 1 0 1 0 8 0 a4 1 0 1 0 -8 0", fill: "currentStroke" },
      ],
    },
  },

  // ───────── AUDIO ─────────
  {
    id: "aud-mic-handheld",
    label: "Handheld Microphone (Wired)",
    shortCode: "MIC",
    category: "audio",
    subcategory: "Microphones",
    keywords: ["mic", "handheld", "sm58", "vocal"],
    defaultCost: 165,
    laborHours: 0.5,
    icon: {
      paths: [
        { d: "M10 3 a3 3 0 0 1 4 0 v8 a3 3 0 0 1 -4 0 z", fill: "currentFill" },
        { d: "M10 3 a3 3 0 0 1 4 0 v8 a3 3 0 0 1 -4 0 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M11 11 v5 M9 16 h6", stroke: "currentStroke", strokeWidth: 1.2 },
        { d: "M11 16 h2 v5 h-2 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "aud-mic-condenser",
    label: "Condenser Microphone",
    shortCode: "MIC",
    category: "audio",
    subcategory: "Microphones",
    keywords: ["condenser", "studio mic", "neumann", "rode"],
    defaultCost: 685,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M9 4 h6 v10 h-6 z", fill: "currentFill" },
        { d: "M9 4 h6 v10 h-6 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M11 14 v4 M8 18 h8", stroke: "currentStroke", strokeWidth: 1.2 },
      ],
    },
  },
  {
    id: "aud-mic-lav",
    label: "Lavalier Microphone",
    shortCode: "LAV",
    category: "audio",
    subcategory: "Microphones",
    keywords: ["lav", "lavalier", "lapel", "tie clip"],
    defaultCost: 285,
    laborHours: 0.25,
    icon: {
      paths: [
        { d: "M12 6 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0", fill: "currentFill" },
        { d: "M12 6 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0", stroke: "currentStroke", strokeWidth: 1.2 },
        { d: "M12 8 q-3 4 -3 8 q0 4 3 4 q3 0 3 -4 q0 -4 -3 -8", fill: "none", stroke: "currentStroke", strokeWidth: 0.8 },
      ],
    },
  },
  {
    id: "aud-mic-headset",
    label: "Headset Microphone",
    shortCode: "HSM",
    category: "audio",
    subcategory: "Microphones",
    keywords: ["headset", "countryman", "DPA"],
    defaultCost: 485,
    laborHours: 0.25,
    icon: {
      paths: [
        { d: "M5 12 a7 7 0 0 1 14 0", stroke: "currentStroke", strokeWidth: 1.5, fill: "none" },
        { d: "M4 12 h2 v6 h-2 z M18 12 h2 v6 h-2 z", fill: "currentFill" },
        { d: "M4 12 h2 v6 h-2 z M18 12 h2 v6 h-2 z", stroke: "currentStroke", strokeWidth: 1.2 },
        { d: "M19 16 q-3 4 -7 4", stroke: "currentStroke", strokeWidth: 1, fill: "none" },
        { d: "M11 19 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "aud-mic-shotgun",
    label: "Shotgun Microphone",
    shortCode: "SHM",
    category: "audio",
    subcategory: "Microphones",
    keywords: ["shotgun", "boom", "sennheiser MKH", "directional"],
    defaultCost: 1250,
    laborHours: 0.5,
    icon: {
      paths: [
        { d: "M3 11 h14 v2 h-14 z l-1 1 z", fill: "currentFill" },
        { d: "M3 11 h14 v2 h-14 z", stroke: "currentStroke", strokeWidth: 1.2 },
        { d: "M17 10 h4 v4 h-4 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "aud-mic-boundary",
    label: "Boundary / Tabletop Mic",
    shortCode: "BND",
    category: "audio",
    subcategory: "Microphones",
    keywords: ["boundary", "PZM", "conference", "tabletop"],
    defaultCost: 385,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M3 16 h18 v3 h-18 z", fill: "currentFill" },
        { d: "M3 16 h18 v3 h-18 z", stroke: "currentStroke", strokeWidth: 1.2 },
        { d: "M9 10 h6 v6 h-6 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "aud-mic-gooseneck",
    label: "Gooseneck Mic (Podium)",
    shortCode: "GNM",
    category: "audio",
    subcategory: "Microphones",
    keywords: ["gooseneck", "podium", "lectern"],
    defaultCost: 285,
    laborHours: 0.5,
    icon: {
      paths: [
        { d: "M10 18 h4 v4 h-4 z", fill: "currentFill" },
        { d: "M10 18 h4 v4 h-4 z", stroke: "currentStroke", strokeWidth: 1.2 },
        { d: "M12 18 v-6 q0 -4 4 -4 q4 0 4 -4", stroke: "currentStroke", strokeWidth: 1.5, fill: "none" },
        { d: "M20 4 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "aud-spk-pendant",
    label: "Pendant Speaker",
    shortCode: "PEN",
    category: "audio",
    subcategory: "Speakers",
    keywords: ["pendant", "hanging", "70V"],
    defaultCost: 245,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M12 4 v3", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M12 14 m-6 0 a6 6 0 1 0 12 0 z", fill: "currentFill" },
        { d: "M12 14 m-6 0 a6 6 0 1 0 12 0 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 14 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "aud-spk-surface",
    label: "Surface-mount Speaker",
    shortCode: "SSPK",
    category: "audio",
    subcategory: "Speakers",
    keywords: ["surface mount", "wall speaker", "JBL"],
    defaultCost: 285,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M5 4 h14 v16 h-14 z", fill: "currentFill" },
        { d: "M5 4 h14 v16 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 10 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", fill: "none", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M12 16 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "aud-spk-line",
    label: "Line Array Speaker",
    shortCode: "LA",
    category: "audio",
    subcategory: "Speakers",
    keywords: ["line array", "JBL VTX", "Meyer", "L-Acoustics"],
    defaultCost: 4250,
    laborHours: 4.0,
    icon: {
      paths: [
        { d: "M9 4 h6 v3 h-6 z M8 8 h8 v3 h-8 z M7 12 h10 v3 h-10 z M6 16 h12 v4 h-12 z", fill: "currentFill" },
        { d: "M9 4 h6 v3 h-6 z M8 8 h8 v3 h-8 z M7 12 h10 v3 h-10 z M6 16 h12 v4 h-12 z", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "aud-spk-sub",
    label: "Subwoofer",
    shortCode: "SUB",
    category: "audio",
    subcategory: "Speakers",
    keywords: ["sub", "subwoofer", "low frequency"],
    defaultCost: 1850,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M3 5 h18 v14 h-18 z", fill: "currentFill" },
        { d: "M3 5 h18 v14 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 12 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0", fill: "none", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M12 12 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "aud-spk-monitor",
    label: "Stage Monitor (Wedge)",
    shortCode: "MON",
    category: "audio",
    subcategory: "Speakers",
    keywords: ["monitor", "wedge", "stage monitor", "floor monitor"],
    defaultCost: 985,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M3 18 l4 -10 h10 l4 10 z", fill: "currentFill" },
        { d: "M3 18 l4 -10 h10 l4 10 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 14 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "aud-mixer-analog",
    label: "Analog Mixer (Compact)",
    shortCode: "MX",
    category: "audio",
    subcategory: "Mixers",
    keywords: ["mixer", "analog", "Mackie", "Yamaha MG", "soundcraft"],
    defaultCost: 685,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M4 4 h16 v16 h-16 z", fill: "currentFill" },
        { d: "M4 4 h16 v16 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M6 8 m-0.6 0 a0.6 0.6 0 1 0 1.2 0 a0.6 0.6 0 1 0 -1.2 0 M9 8 m-0.6 0 a0.6 0.6 0 1 0 1.2 0 a0.6 0.6 0 1 0 -1.2 0 M12 8 m-0.6 0 a0.6 0.6 0 1 0 1.2 0 a0.6 0.6 0 1 0 -1.2 0 M15 8 m-0.6 0 a0.6 0.6 0 1 0 1.2 0 a0.6 0.6 0 1 0 -1.2 0 M18 8 m-0.6 0 a0.6 0.6 0 1 0 1.2 0 a0.6 0.6 0 1 0 -1.2 0", fill: "currentStroke" },
        { d: "M6 12 v6 M9 12 v6 M12 12 v6 M15 12 v6 M18 12 v6", stroke: "currentStroke", strokeWidth: 0.5 },
        { d: "M5.4 14 h1.2 M8.4 13 h1.2 M11.4 16 h1.2 M14.4 14 h1.2 M17.4 13 h1.2", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },
  {
    id: "aud-mixer-digital",
    label: "Digital Console",
    shortCode: "DCM",
    category: "audio",
    subcategory: "Mixers",
    keywords: ["digital console", "X32", "M32", "SQ", "Avantis", "Avid", "DiGiCo"],
    defaultCost: 4850,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M3 4 h18 v16 h-18 z", fill: "currentFill" },
        { d: "M3 4 h18 v16 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 6 h14 v6 h-14 z", fill: "currentStroke", stroke: "none" },
        { d: "M6 14 v5 M8 14 v5 M10 14 v5 M12 14 v5 M14 14 v5 M16 14 v5 M18 14 v5", stroke: "currentStroke", strokeWidth: 0.6 },
        { d: "M5.4 16 h1.2 M7.4 15 h1.2 M9.4 17 h1.2 M11.4 15 h1.2 M13.4 18 h1.2 M15.4 16 h1.2 M17.4 17 h1.2", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },
  {
    id: "aud-amp",
    label: "Audio Amplifier",
    shortCode: "AMP",
    category: "audio",
    subcategory: "Processing",
    keywords: ["amplifier", "amp", "QSC", "Crown"],
    defaultCost: 1250,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M4 8 h16 v8 h-16 z", fill: "currentFill" },
        { d: "M4 8 h16 v8 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M6 10 h2 v4 h-2 z M9 10 h2 v4 h-2 z", fill: "currentStroke" },
        { d: "M14 10 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M18 10 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "aud-dsp",
    label: "DSP Processor",
    shortCode: "DSP",
    category: "audio",
    subcategory: "Processing",
    keywords: ["dsp", "BSS", "Symetrix", "Q-Sys", "Biamp"],
    defaultCost: 2850,
    laborHours: 3.0,
    icon: {
      paths: [
        { d: "M3 8 h18 v8 h-18 z", fill: "currentFill" },
        { d: "M3 8 h18 v8 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 12 q3 -4 6 0 q3 4 6 0 q3 -4 6 0", stroke: "currentStroke", strokeWidth: 1, fill: "none" },
      ],
    },
  },
  {
    id: "aud-di",
    label: "DI Box (Direct Box)",
    shortCode: "DI",
    category: "audio",
    subcategory: "Processing",
    keywords: ["DI", "direct box", "Radial", "Countryman"],
    defaultCost: 145,
    laborHours: 0.25,
    icon: {
      paths: [
        { d: "M7 6 h10 v12 h-10 z", fill: "currentFill" },
        { d: "M7 6 h10 v12 h-10 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 9 h6 v3 h-6 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "aud-snake",
    label: "Audio Snake (Analog)",
    shortCode: "SNK",
    category: "audio",
    subcategory: "Distribution",
    keywords: ["snake", "multicore", "audio snake"],
    defaultCost: 685,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M4 12 q4 -8 8 0 q4 8 8 0", stroke: "currentStroke", strokeWidth: 2.5, fill: "none" },
        { d: "M19 12 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0", fill: "currentFill" },
        { d: "M19 12 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },

  // ───────── LIGHTING ─────────
  {
    id: "lit-led-1x1",
    label: "LED Panel 1×1",
    shortCode: "LP1",
    category: "lighting",
    subcategory: "Studio Lights",
    keywords: ["LED panel", "Litepanels", "Aputure", "1x1"],
    defaultCost: 685,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M5 5 h14 v14 h-14 z", fill: "currentFill" },
        { d: "M5 5 h14 v14 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 7 h2 v2 h-2 z M11 7 h2 v2 h-2 z M15 7 h2 v2 h-2 z M7 11 h2 v2 h-2 z M11 11 h2 v2 h-2 z M15 11 h2 v2 h-2 z M7 15 h2 v2 h-2 z M11 15 h2 v2 h-2 z M15 15 h2 v2 h-2 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "lit-led-2x2",
    label: "LED Panel 2×2 (Soft)",
    shortCode: "LP2",
    category: "lighting",
    subcategory: "Studio Lights",
    keywords: ["soft panel", "Aputure Nova", "Astra"],
    defaultCost: 1850,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M3 3 h18 v18 h-18 z", fill: "currentFill" },
        { d: "M3 3 h18 v18 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M3 12 h18 M12 3 v18", stroke: "currentStroke", strokeWidth: 0.6 },
      ],
    },
  },
  {
    id: "lit-fresnel",
    label: "Fresnel (LED)",
    shortCode: "FRES",
    category: "lighting",
    subcategory: "Theatrical",
    keywords: ["fresnel", "ARRI", "Mole"],
    defaultCost: 1450,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M6 6 h12 v12 h-12 z", fill: "currentFill" },
        { d: "M6 6 h12 v12 h-12 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0 M12 12 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0", fill: "none", stroke: "currentStroke", strokeWidth: 0.7 },
        { d: "M5 4 h2 v2 h-2 z M17 4 h2 v2 h-2 z M5 18 h2 v2 h-2 z M17 18 h2 v2 h-2 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "lit-ellipsoidal",
    label: "Ellipsoidal (Source 4)",
    shortCode: "ELL",
    category: "lighting",
    subcategory: "Theatrical",
    keywords: ["ellipsoidal", "leko", "source four", "ETC", "S4"],
    defaultCost: 985,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M3 12 l5 -5 h6 l4 4 v2 l-4 4 h-6 z", fill: "currentFill" },
        { d: "M3 12 l5 -5 h6 l4 4 v2 l-4 4 h-6 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M18 11 h3 v2 h-3 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "lit-par-led",
    label: "LED PAR Can",
    shortCode: "PAR",
    category: "lighting",
    subcategory: "Theatrical",
    keywords: ["par", "par can", "wash", "RGBW"],
    defaultCost: 285,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M5 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", fill: "currentFill" },
        { d: "M5 12 m-3 0 a3 3 0 1 0 6 0 a3 3 0 1 0 -6 0", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M8 9 h10 v6 h-10 z", fill: "currentFill" },
        { d: "M8 9 h10 v6 h-10 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M18 11 h3 v2 h-3 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "lit-mover-spot",
    label: "Moving Head (Spot)",
    shortCode: "MH",
    category: "lighting",
    subcategory: "Moving Lights",
    keywords: ["moving head", "spot", "Martin", "Robe", "Ayrton"],
    defaultCost: 4850,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M5 17 h14 v3 h-14 z", fill: "currentFill" },
        { d: "M5 17 h14 v3 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 4 h6 v8 a3 3 0 0 1 -6 0 z", fill: "currentFill" },
        { d: "M9 4 h6 v8 a3 3 0 0 1 -6 0 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M12 4 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0", fill: "currentStroke" },
        { d: "M11 13 v4 M13 13 v4", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "lit-mover-wash",
    label: "Moving Head (Wash)",
    shortCode: "MHW",
    category: "lighting",
    subcategory: "Moving Lights",
    keywords: ["moving wash", "wash light", "RGBW mover"],
    defaultCost: 3850,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M5 17 h14 v3 h-14 z", fill: "currentFill" },
        { d: "M5 17 h14 v3 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M8 6 h8 v8 a4 4 0 0 1 -8 0 z", fill: "currentFill" },
        { d: "M8 6 h8 v8 a4 4 0 0 1 -8 0 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M11 14 v3 M13 14 v3", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "lit-mover-beam",
    label: "Moving Head (Beam)",
    shortCode: "MHB",
    category: "lighting",
    subcategory: "Moving Lights",
    keywords: ["beam", "Sharpy", "moving beam"],
    defaultCost: 3450,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M5 17 h14 v3 h-14 z", fill: "currentFill" },
        { d: "M5 17 h14 v3 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M10 5 h4 v6 h-4 z", fill: "currentFill" },
        { d: "M10 5 h4 v6 h-4 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M11 11 v6 M13 11 v6", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "lit-strip",
    label: "LED Strip / Bar",
    shortCode: "STR",
    category: "lighting",
    subcategory: "Architectural",
    keywords: ["strip", "bar", "linear", "ColorBlast", "ColorKinetics"],
    defaultCost: 385,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M3 11 h18 v2 h-18 z", fill: "currentFill" },
        { d: "M3 11 h18 v2 h-18 z", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M5 11 v2 M7 11 v2 M9 11 v2 M11 11 v2 M13 11 v2 M15 11 v2 M17 11 v2 M19 11 v2", stroke: "currentStroke", strokeWidth: 0.8 },
      ],
    },
  },
  {
    id: "lit-cyc",
    label: "Cyc Light / Ground Row",
    shortCode: "CYC",
    category: "lighting",
    subcategory: "Architectural",
    keywords: ["cyc", "cyclorama", "ground row"],
    defaultCost: 1250,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M3 14 h18 v6 h-18 z", fill: "currentFill" },
        { d: "M3 14 h18 v6 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 14 v-3 h2 v3 M9 14 v-3 h2 v3 M13 14 v-3 h2 v3 M17 14 v-3 h2 v3", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "lit-blinder",
    label: "Audience Blinder",
    shortCode: "BLD",
    category: "lighting",
    subcategory: "Theatrical",
    keywords: ["blinder", "molefay", "audience"],
    defaultCost: 685,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M5 5 h14 v14 h-14 z", fill: "currentFill" },
        { d: "M5 5 h14 v14 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 9 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M15 9 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M9 15 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0 M15 15 m-2 0 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "lit-followspot",
    label: "Follow Spot",
    shortCode: "FOL",
    category: "lighting",
    subcategory: "Theatrical",
    keywords: ["follow spot", "lycian", "robert juliat"],
    defaultCost: 4850,
    laborHours: 4.0,
    icon: {
      paths: [
        { d: "M3 14 h6 l4 -4 h6 v8 h-6 l-4 -4 z", fill: "currentFill" },
        { d: "M3 14 h6 l4 -4 h6 v8 h-6 l-4 -4 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M19 11 h2 v6 h-2 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "lit-work",
    label: "Work Light",
    shortCode: "WL",
    category: "lighting",
    subcategory: "Architectural",
    keywords: ["work light", "wall pack", "vapor tight"],
    defaultCost: 145,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M5 5 h14 v8 h-14 z", fill: "currentFill" },
        { d: "M5 5 h14 v8 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 13 l-2 6 h10 l-2 -6", fill: "none", stroke: "currentStroke", strokeWidth: 1.2 },
      ],
    },
  },
  {
    id: "lit-fog",
    label: "Fog / Haze Machine",
    shortCode: "FOG",
    category: "lighting",
    subcategory: "Effects",
    keywords: ["fog machine", "haze", "Le Maitre", "MDG"],
    defaultCost: 685,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M4 12 h12 v6 h-12 z", fill: "currentFill" },
        { d: "M4 12 h12 v6 h-12 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M16 14 q2 -1 4 0 q-2 1 -4 0", fill: "currentStroke" },
        { d: "M16 12 q3 -2 6 -1 M17 16 q3 0 6 -1", stroke: "currentStroke", strokeWidth: 0.8, fill: "none" },
      ],
    },
  },

  // ───────── PRODUCTION / STAGE ─────────
  {
    id: "prod-stagebox-xlr",
    label: "Stage Box (8× XLR)",
    shortCode: "SB",
    category: "production",
    subcategory: "Stage Boxes",
    keywords: ["stage box", "XLR", "audio panel"],
    defaultCost: 385,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M5 4 h14 v16 h-14 z", fill: "currentFill" },
        { d: "M5 4 h14 v16 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M8 8 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M12 8 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M16 8 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M8 12 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M12 12 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M16 12 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M8 16 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M12 16 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "prod-stagebox-mixed",
    label: "Stage Box (Mixed XLR/Cat6)",
    shortCode: "MSB",
    category: "production",
    subcategory: "Stage Boxes",
    keywords: ["stage box", "mixed", "data + audio"],
    defaultCost: 685,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M4 4 h16 v16 h-16 z", fill: "currentFill" },
        { d: "M4 4 h16 v16 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M6 7 h12 v6 h-12 z", fill: "none", stroke: "currentStroke", strokeWidth: 0.7 },
        { d: "M6 15 h5 v3 h-5 z M13 15 h5 v3 h-5 z", fill: "currentStroke" },
        { d: "M8 9 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M12 9 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M16 9 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "prod-stagebox-data",
    label: "Stage Box (Data — Dante/AVB)",
    shortCode: "DSB",
    category: "production",
    subcategory: "Stage Boxes",
    keywords: ["dante", "AVB", "stage box", "digital snake"],
    defaultCost: 1850,
    laborHours: 2.5,
    icon: {
      paths: [
        { d: "M4 4 h16 v16 h-16 z", fill: "currentFill" },
        { d: "M4 4 h16 v16 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 7 h10 v4 h-10 z", fill: "currentStroke" },
        { d: "M7 14 h2 v4 h-2 z M11 14 h2 v4 h-2 z M15 14 h2 v4 h-2 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "prod-floorbox",
    label: "Floor Box (AV/Power)",
    shortCode: "FB",
    category: "production",
    subcategory: "Plates & Boxes",
    keywords: ["floor box", "FSR", "wiremold", "raceway"],
    defaultCost: 485,
    laborHours: 3.0,
    icon: {
      paths: [
        { d: "M4 4 h16 v16 h-16 z", fill: "currentFill" },
        { d: "M4 4 h16 v16 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 7 h10 v4 h-10 z M7 13 h4 v4 h-4 z M13 13 h4 v4 h-4 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "prod-floor-pocket",
    label: "Stage Floor Pocket",
    shortCode: "FP",
    category: "production",
    subcategory: "Plates & Boxes",
    keywords: ["floor pocket", "stage pocket", "deep box"],
    defaultCost: 685,
    laborHours: 4.0,
    icon: {
      paths: [
        { d: "M5 5 h14 v14 h-14 z", fill: "currentFill" },
        { d: "M5 5 h14 v14 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 11 h14", stroke: "currentStroke", strokeWidth: 0.8 },
        { d: "M8 13 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M12 13 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M16 13 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "prod-multbox",
    label: "Mult Box (Press Box)",
    shortCode: "MB",
    category: "production",
    subcategory: "Stage Boxes",
    keywords: ["mult box", "press box", "audio mult"],
    defaultCost: 985,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M4 6 h16 v12 h-16 z", fill: "currentFill" },
        { d: "M4 6 h16 v12 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M6 9 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M9 9 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M12 9 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M15 9 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M18 9 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M6 12 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M9 12 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M12 12 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M15 12 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M18 12 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M6 15 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M9 15 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M12 15 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M15 15 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M18 15 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "prod-drop-snake",
    label: "Drop Snake / Sub Snake",
    shortCode: "DS",
    category: "production",
    subcategory: "Distribution",
    keywords: ["drop snake", "sub snake", "fanout"],
    defaultCost: 285,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M3 11 h10 v2 h-10 z", fill: "currentFill" },
        { d: "M3 11 h10 v2 h-10 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M13 12 l5 -5 M13 12 l5 -2 M13 12 l5 1 M13 12 l5 4 M13 12 l5 7", stroke: "currentStroke", strokeWidth: 0.8 },
        { d: "M18 7 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M18 10 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M18 13 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M18 16 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M18 19 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "prod-power-distro",
    label: "Power Distro (3-Phase)",
    shortCode: "PD",
    category: "production",
    subcategory: "Power",
    keywords: ["distro", "3 phase", "power", "Lex", "Motion Labs"],
    defaultCost: 2850,
    laborHours: 2.5,
    icon: {
      paths: [
        { d: "M4 4 h16 v16 h-16 z", fill: "currentFill" },
        { d: "M4 4 h16 v16 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 7 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0 M12 7 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0 M17 7 m-1.5 0 a1.5 1.5 0 1 0 3 0 a1.5 1.5 0 1 0 -3 0", fill: "currentStroke" },
        { d: "M11 11 l-2 5 h2 l-1 4 4 -6 h-3 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "prod-dmx-console-sm",
    label: "DMX Console (Small)",
    shortCode: "DMX",
    category: "production",
    subcategory: "Lighting Control",
    keywords: ["DMX", "console", "Hog", "ION", "ColorSource", "Element"],
    defaultCost: 2850,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M3 6 h18 v12 h-18 z", fill: "currentFill" },
        { d: "M3 6 h18 v12 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 8 h8 v4 h-8 z", fill: "currentStroke" },
        { d: "M14 8 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M17 8 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M14 11 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0 M17 11 m-0.7 0 a0.7 0.7 0 1 0 1.4 0 a0.7 0.7 0 1 0 -1.4 0", fill: "currentStroke" },
        { d: "M5 14 v3 M7 14 v3 M9 14 v3 M11 14 v3 M13 14 v3 M15 14 v3 M17 14 v3 M19 14 v3", stroke: "currentStroke", strokeWidth: 0.6 },
      ],
    },
  },
  {
    id: "prod-dmx-console-lg",
    label: "DMX Console (Large)",
    shortCode: "LBD",
    category: "production",
    subcategory: "Lighting Control",
    keywords: ["dmx", "lighting console", "grandMA", "Hog 4", "ETC EOS"],
    defaultCost: 18500,
    laborHours: 4.0,
    icon: {
      paths: [
        { d: "M2 5 h20 v14 h-20 z", fill: "currentFill" },
        { d: "M2 5 h20 v14 h-20 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M4 7 h7 v6 h-7 z M13 7 h7 v6 h-7 z", fill: "currentStroke" },
        { d: "M4 15 v3 M6 15 v3 M8 15 v3 M10 15 v3 M14 15 v3 M16 15 v3 M18 15 v3 M20 15 v3", stroke: "currentStroke", strokeWidth: 0.6 },
      ],
    },
  },
  {
    id: "prod-dmx-gateway",
    label: "DMX/sACN Gateway",
    shortCode: "GW",
    category: "production",
    subcategory: "Lighting Control",
    keywords: ["sACN", "Art-Net", "DMX gateway", "Pathport", "Net3"],
    defaultCost: 685,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M5 9 h14 v6 h-14 z", fill: "currentFill" },
        { d: "M5 9 h14 v6 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 11 h2 v2 h-2 z M11 11 h2 v2 h-2 z", fill: "currentStroke" },
        { d: "M15 11 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M18 11 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "prod-dmx-splitter",
    label: "DMX Splitter / Buffer",
    shortCode: "SPL",
    category: "production",
    subcategory: "Lighting Control",
    keywords: ["DMX splitter", "buffer", "opto-isolator"],
    defaultCost: 285,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M5 9 h14 v6 h-14 z", fill: "currentFill" },
        { d: "M5 9 h14 v6 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 12 l-2 0 M19 12 l2 0 M19 10 l2 -2 M19 14 l2 2", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "prod-scene-ctrl",
    label: "Scene Controller / Wall Station",
    shortCode: "SC",
    category: "production",
    subcategory: "Lighting Control",
    keywords: ["scene controller", "wall station", "Lutron", "ETC Mosaic"],
    defaultCost: 485,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M7 4 h10 v16 h-10 z", fill: "currentFill" },
        { d: "M7 4 h10 v16 h-10 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 7 h6 v3 h-6 z M9 12 h6 v3 h-6 z M9 17 h6 v1 h-6 z", fill: "currentStroke" },
      ],
    },
  },

  // ───────── WIRELESS / RF ─────────
  {
    id: "wls-mic-rx",
    label: "Wireless Mic Receiver",
    shortCode: "WRX",
    category: "wireless",
    subcategory: "Microphones",
    keywords: ["wireless mic", "receiver", "Shure", "Sennheiser", "ULX", "QLX", "EW"],
    defaultCost: 1850,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M3 8 h18 v8 h-18 z", fill: "currentFill" },
        { d: "M3 8 h18 v8 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 11 v2 M7 11 v2", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M11 12 l4 -2 M11 12 l4 0 M11 12 l4 2", stroke: "currentStroke", strokeWidth: 0.8 },
        { d: "M16 4 v6 M19 4 v6", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "wls-mic-tx-hh",
    label: "Wireless Handheld Transmitter",
    shortCode: "WHH",
    category: "wireless",
    subcategory: "Microphones",
    keywords: ["wireless mic", "handheld", "transmitter", "SM58 wireless"],
    defaultCost: 685,
    laborHours: 0.25,
    icon: {
      paths: [
        { d: "M9 4 h6 v6 a3 3 0 0 1 -6 0 z", fill: "currentFill" },
        { d: "M9 4 h6 v6 a3 3 0 0 1 -6 0 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M11 10 h2 v8 h-2 z", fill: "currentStroke" },
        { d: "M9 19 h6 v2 h-6 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "wls-mic-tx-bp",
    label: "Bodypack Transmitter",
    shortCode: "BP",
    category: "wireless",
    subcategory: "Microphones",
    keywords: ["bodypack", "beltpack", "transmitter"],
    defaultCost: 685,
    laborHours: 0.25,
    icon: {
      paths: [
        { d: "M7 4 h10 v14 h-10 z", fill: "currentFill" },
        { d: "M7 4 h10 v14 h-10 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 7 h6 v3 h-6 z", fill: "currentStroke" },
        { d: "M11 18 v3", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "wls-iem-tx",
    label: "IEM Transmitter",
    shortCode: "IEM",
    category: "wireless",
    subcategory: "IEM",
    keywords: ["IEM", "in-ear", "PSM", "monitor"],
    defaultCost: 1450,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M3 9 h18 v6 h-18 z", fill: "currentFill" },
        { d: "M3 9 h18 v6 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M16 5 v4 M19 5 v4", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M5 12 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "wls-iem-rx",
    label: "IEM Receiver (Bodypack)",
    shortCode: "IRX",
    category: "wireless",
    subcategory: "IEM",
    keywords: ["IEM receiver", "bodypack", "P10R"],
    defaultCost: 685,
    laborHours: 0.25,
    icon: {
      paths: [
        { d: "M8 4 h8 v14 h-8 z", fill: "currentFill" },
        { d: "M8 4 h8 v14 h-8 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M10 7 h4 v3 h-4 z", fill: "currentStroke" },
        { d: "M11 18 v3 M14 18 q2 0 2 2", stroke: "currentStroke", strokeWidth: 1, fill: "none" },
      ],
    },
  },
  {
    id: "wls-antenna-paddle",
    label: "Paddle Antenna",
    shortCode: "ANT",
    category: "wireless",
    subcategory: "Antennas",
    keywords: ["antenna", "paddle", "directional", "PA805"],
    defaultCost: 285,
    laborHours: 0.75,
    icon: {
      paths: [
        { d: "M9 5 h6 v8 h-6 z", fill: "currentFill" },
        { d: "M9 5 h6 v8 h-6 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M11 5 v-2 M13 5 v-2", stroke: "currentStroke", strokeWidth: 1 },
        { d: "M11 13 v8 M13 13 v8", stroke: "currentStroke", strokeWidth: 1 },
      ],
    },
  },
  {
    id: "wls-antenna-helical",
    label: "Helical Antenna (Long Range)",
    shortCode: "HEL",
    category: "wireless",
    subcategory: "Antennas",
    keywords: ["helical", "long range", "directional", "Helical Solutions"],
    defaultCost: 685,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M5 5 q3 -2 7 0 q3 2 7 0", stroke: "currentStroke", strokeWidth: 1.5, fill: "none" },
        { d: "M5 9 q3 -2 7 0 q3 2 7 0", stroke: "currentStroke", strokeWidth: 1.5, fill: "none" },
        { d: "M5 13 q3 -2 7 0 q3 2 7 0", stroke: "currentStroke", strokeWidth: 1.5, fill: "none" },
        { d: "M5 17 q3 -2 7 0 q3 2 7 0", stroke: "currentStroke", strokeWidth: 1.5, fill: "none" },
      ],
    },
  },
  {
    id: "wls-distro",
    label: "Antenna Distribution",
    shortCode: "AD",
    category: "wireless",
    subcategory: "Antennas",
    keywords: ["antenna distribution", "splitter", "active distro"],
    defaultCost: 985,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M3 9 h18 v6 h-18 z", fill: "currentFill" },
        { d: "M3 9 h18 v6 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 12 l4 -3 M5 12 l4 -1 M5 12 l4 1 M5 12 l4 3", stroke: "currentStroke", strokeWidth: 0.8 },
        { d: "M19 11 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M15 11 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0", fill: "currentStroke" },
      ],
    },
  },

  // ───────── BROADCAST ─────────
  {
    id: "bc-switcher",
    label: "Production Switcher",
    shortCode: "SW",
    category: "broadcast",
    subcategory: "Switchers",
    keywords: ["production switcher", "TriCaster", "ATEM", "vMix", "Ross"],
    defaultCost: 8850,
    laborHours: 3.0,
    icon: {
      paths: [
        { d: "M3 5 h18 v14 h-18 z", fill: "currentFill" },
        { d: "M3 5 h18 v14 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 7 h14 v4 h-14 z", fill: "currentStroke" },
        { d: "M5 13 h2 v4 h-2 z M8 13 h2 v4 h-2 z M11 13 h2 v4 h-2 z M14 13 h2 v4 h-2 z M17 13 h2 v4 h-2 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "bc-ccu",
    label: "Camera Control Unit (CCU)",
    shortCode: "CCU",
    category: "broadcast",
    subcategory: "Control",
    keywords: ["CCU", "camera control", "RCP", "remote control panel"],
    defaultCost: 4850,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M5 4 h14 v16 h-14 z", fill: "currentFill" },
        { d: "M5 4 h14 v16 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M7 6 h10 v3 h-10 z", fill: "currentStroke" },
        { d: "M9 12 v6 M11 12 v6 M13 12 v6 M15 12 v6", stroke: "currentStroke", strokeWidth: 0.8 },
        { d: "M8.4 14 h1.2 M10.4 13 h1.2 M12.4 16 h1.2 M14.4 14 h1.2", stroke: "currentStroke", strokeWidth: 1.2 },
      ],
    },
  },
  {
    id: "bc-prompter",
    label: "Teleprompter",
    shortCode: "TP",
    category: "broadcast",
    subcategory: "Studio",
    keywords: ["teleprompter", "prompter"],
    defaultCost: 2850,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M4 4 h16 v12 h-16 z", fill: "currentFill" },
        { d: "M4 4 h16 v12 h-16 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M6 7 h10 v1 h-10 z M6 9 h12 v1 h-12 z M6 11 h8 v1 h-8 z M6 13 h11 v1 h-11 z", fill: "currentStroke" },
        { d: "M11 16 h2 v4 h-2 z M9 20 h6 v1 h-6 z", fill: "currentStroke" },
      ],
    },
  },
  {
    id: "bc-intercom",
    label: "Intercom Beltpack",
    shortCode: "ICM",
    category: "broadcast",
    subcategory: "Comms",
    keywords: ["intercom", "Clear-Com", "RTS", "talkback", "beltpack"],
    defaultCost: 685,
    laborHours: 0.5,
    icon: {
      paths: [
        { d: "M7 4 h10 v14 h-10 z", fill: "currentFill" },
        { d: "M7 4 h10 v14 h-10 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 6 h6 v2 h-6 z", fill: "currentStroke" },
        { d: "M9 11 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0 M14 11 m-1 0 a1 1 0 1 0 2 0 a1 1 0 1 0 -2 0", fill: "currentStroke" },
        { d: "M9 15 v3 M15 15 q1 0 1 2", stroke: "currentStroke", strokeWidth: 1, fill: "none" },
      ],
    },
  },
  {
    id: "bc-tally",
    label: "Tally Light",
    shortCode: "TL",
    category: "broadcast",
    subcategory: "Studio",
    keywords: ["tally", "on air", "red light"],
    defaultCost: 165,
    laborHours: 0.5,
    icon: {
      paths: [
        { d: "M9 4 h6 v8 h-6 z", fill: "currentFill" },
        { d: "M9 4 h6 v8 h-6 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M11 12 v6 M13 12 v6 M9 18 h6", stroke: "currentStroke", strokeWidth: 1.2 },
      ],
    },
  },
  {
    id: "bc-monitor",
    label: "Production Monitor",
    shortCode: "PM",
    category: "broadcast",
    subcategory: "Studio",
    keywords: ["monitor", "broadcast monitor", "SDI", "FSI", "TVlogic"],
    defaultCost: 1850,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M3 4 h18 v13 h-18 z", fill: "currentFill" },
        { d: "M3 4 h18 v13 h-18 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 6 h14 v9 h-14 z", fill: "none", stroke: "currentStroke", strokeWidth: 0.6 },
        { d: "M9 18 h6 v1 h-6 z", fill: "currentStroke" },
      ],
    },
  },

  // ───────── Site (additions) ─────────
  {
    id: "site-bollard",
    label: "Bollard (Security)",
    shortCode: "BLD",
    category: "site",
    subcategory: "Hardscape",
    keywords: ["bollard", "barrier", "security post"],
    defaultCost: 685,
    laborHours: 4.0,
    icon: {
      paths: [
        { d: "M9 6 h6 v14 h-6 z", fill: "currentFill" },
        { d: "M9 6 h6 v14 h-6 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 6 a3 3 0 0 1 6 0", fill: "none", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },
  {
    id: "site-pole",
    label: "Camera / AP Pole",
    shortCode: "POLE",
    category: "site",
    subcategory: "Hardscape",
    keywords: ["pole", "mast", "stanchion"],
    defaultCost: 2850,
    laborHours: 6.0,
    icon: {
      paths: [
        { d: "M11 3 h2 v18 h-2 z", fill: "currentFill" },
        { d: "M11 3 h2 v18 h-2 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 21 h14", stroke: "currentStroke", strokeWidth: 1.5 },
      ],
    },
  },
  {
    id: "site-jbox-out",
    label: "Outdoor Junction Box",
    shortCode: "JB",
    category: "site",
    subcategory: "Distribution",
    keywords: ["junction box", "weatherproof", "Hoffman"],
    defaultCost: 285,
    laborHours: 1.5,
    icon: {
      paths: [
        { d: "M5 5 h14 v14 h-14 z", fill: "currentFill" },
        { d: "M5 5 h14 v14 h-14 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M5 5 l14 14 M19 5 l-14 14", stroke: "currentStroke", strokeWidth: 0.6 },
      ],
    },
  },
  {
    id: "site-lightning",
    label: "Lightning Protection",
    shortCode: "LP",
    category: "site",
    subcategory: "Grounding",
    keywords: ["lightning", "surge protection", "polyphaser"],
    defaultCost: 485,
    laborHours: 2.0,
    icon: {
      paths: [
        { d: "M13 4 l-4 8 h3 l-2 8 l5 -10 h-3 l1 -6 z", fill: "currentFill" },
        { d: "M13 4 l-4 8 h3 l-2 8 l5 -10 h-3 l1 -6 z", stroke: "currentStroke", strokeWidth: 1.2 },
      ],
    },
  },
  {
    id: "site-loop",
    label: "Vehicle Loop Detector",
    shortCode: "VLD",
    category: "site",
    subcategory: "Sensors",
    keywords: ["loop", "vehicle detector", "induction loop"],
    defaultCost: 285,
    laborHours: 4.0,
    icon: {
      paths: [
        { d: "M4 6 h16 v12 h-16 z", fill: "none", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M6 8 h12 v8 h-12 z", fill: "none", stroke: "currentStroke", strokeWidth: 0.8 },
        { d: "M8 10 h8 v4 h-8 z", fill: "currentFill" },
        { d: "M8 10 h8 v4 h-8 z", stroke: "currentStroke", strokeWidth: 0.6 },
      ],
    },
  },
  {
    id: "site-strobe",
    label: "Outdoor Strobe / Beacon",
    shortCode: "STR",
    category: "site",
    subcategory: "Notification",
    keywords: ["strobe", "beacon", "warning light"],
    defaultCost: 285,
    laborHours: 1.0,
    icon: {
      paths: [
        { d: "M9 12 h6 v8 h-6 z", fill: "currentFill" },
        { d: "M9 12 h6 v8 h-6 z", stroke: "currentStroke", strokeWidth: 1.5 },
        { d: "M9 12 a3 3 0 0 1 6 0 z", fill: "currentFill" },
        { d: "M9 12 a3 3 0 0 1 6 0", stroke: "currentStroke", strokeWidth: 1.5, fill: "none" },
        { d: "M5 7 l3 1 M5 12 h3 M5 17 l3 -1 M19 7 l-3 1 M19 12 h-3 M19 17 l-3 -1", stroke: "currentStroke", strokeWidth: 0.8 },
      ],
    },
  },
];

// ───────── Default port inference ─────────
// Most catalog entries don't bother spelling out a `ports` array, so we
// fill in sensible defaults based on category + shortCode at module
// load time. Explicit `ports` always wins, so a device that needs a
// custom layout can just add `ports: [...]` to its entry.

function inferDefaultPorts(d: DeviceType): PortSpec[] | undefined {
  if (d.ports) return d.ports; // explicit wins
  const code = d.shortCode.toUpperCase();
  switch (d.category) {
    case "cameras":
      // Every IP camera has one PoE-in copper port; PTZ cameras
      // typically add an RS-485 line for legacy joystick control.
      if (code === "PTZ") return [ETH0_POE_IN, RS485_BUS];
      return [ETH0_POE_IN];

    case "wireless":
      // APs: one PoE-in uplink + a passthrough LAN downlink.
      if (code === "AP")
        return [
          ETH0_POE_IN,
          { id: "eth1", label: "ETH 1 (LAN)", kind: "ethernet", speed: "1G" },
        ];
      return [ETH0_LAN];

    case "access": {
      // Card readers, door controllers, REX, locks.
      if (code === "RDR" || code === "READER")
        return [
          { id: "osdp", label: "OSDP / Wiegand", kind: "serial" },
          { id: "12vdc", label: "12 VDC", kind: "power" },
        ];
      if (code === "ACP" || code === "CTRL" || code === "PANEL")
        return [
          ETH0_POE_IN,
          { id: "osdp", label: "OSDP Bus", kind: "serial" },
          { id: "relay-1", label: "Relay 1 (Door)", kind: "other" },
        ];
      if (code === "LOCK" || code === "MAG")
        return [
          { id: "12vdc", label: "12 VDC", kind: "power" },
          { id: "rex", label: "REX Input", kind: "other" },
        ];
      return [{ id: "wires", label: "Wired", kind: "other" }];
    }

    case "network": {
      // Switches, routers, NIDs, APs, PoE injectors. Common sizes
      // seeded with a generic 24-port pattern; specific models can
      // override via an explicit `ports` field on their catalog row.
      if (code === "SW" || code === "SWITCH")
        return [...switchPorts(24, { poe: "out" }), ...sfpPorts(4, "10G")];
      if (code === "RTR" || code === "ROUTER")
        return [
          { id: "wan", label: "WAN", kind: "ethernet", speed: "1G" },
          ...switchPorts(4, { speed: "1G" }),
        ];
      if (code === "NID")
        return [
          { id: "fiber", label: "Fiber Demarc", kind: "fiber", pluggable: true },
          { id: "lan", label: "LAN", kind: "ethernet", speed: "1G" },
        ];
      if (code === "POE" || code === "INJ")
        return [
          { id: "in", label: "Data In", kind: "ethernet", speed: "1G" },
          {
            id: "out",
            label: "PoE+ Out",
            kind: "ethernet",
            speed: "1G",
            poe: "out",
          },
        ];
      // The catalog files most APs under "network" rather than
      // "wireless"; cover both so the AP port-pair lands regardless.
      if (code === "AP" || code === "AP-O" || code.startsWith("AP-"))
        return [
          ETH0_POE_IN,
          { id: "eth1", label: "ETH 1 (LAN)", kind: "ethernet", speed: "1G" },
        ];
      return [ETH0_LAN];
    }

    case "broadcast":
    case "av": {
      // NVR / DVR have many channels + an IP uplink.
      if (code === "NVR" || code === "DVR")
        return [
          {
            id: "uplink",
            label: "LAN",
            kind: "ethernet",
            speed: "1G",
          },
          { id: "hdmi-out", label: "HDMI Out", kind: "video" },
        ];
      if (code === "DISP" || code === "TV" || code === "MON")
        return [
          { id: "hdmi-in", label: "HDMI In", kind: "video" },
          POWER_DC,
        ];
      return [
        { id: "video", label: "Video In", kind: "video" },
        { id: "video-out", label: "Video Out", kind: "video" },
      ];
    }

    case "audio":
      if (code === "MIC")
        return [
          { id: "xlr", label: "XLR Out", kind: "audio" },
        ];
      if (code === "SPK" || code === "SPKR")
        return [
          { id: "in", label: "Speaker In (70V)", kind: "audio" },
        ];
      return [
        { id: "audio-in", label: "Audio In", kind: "audio" },
        { id: "audio-out", label: "Audio Out", kind: "audio" },
      ];

    case "detection":
      return [
        { id: "signal", label: "Signal Pair", kind: "other" },
        POWER_DC,
      ];

    case "lighting":
      if (code === "DMX")
        return [
          { id: "dmx-in", label: "DMX In", kind: "serial" },
          { id: "dmx-out", label: "DMX Thru", kind: "serial" },
          POWER_DC,
        ];
      return [POWER_DC];

    case "production":
      return [
        { id: "io", label: "I/O", kind: "other" },
      ];

    case "site":
      return undefined;

    default:
      return undefined;
  }
}

export const devicesById: Record<string, DeviceType> = Object.fromEntries(
  devices.map((d) => {
    const ports = inferDefaultPorts(d);
    return [d.id, ports ? { ...d, ports } : d];
  }),
);

/**
 * Resolve the effective port list for a placed device instance:
 *   - Per-instance `instancePorts` (if set) wins outright.
 *   - Otherwise falls back to the catalog `ports` for the device type.
 *   - Returns undefined when neither is set so callers can drop back
 *     to the free-text label fallback.
 */
export function effectiveDevicePorts(
  deviceId: string,
  instancePorts: PortSpec[] | undefined,
): PortSpec[] | undefined {
  if (instancePorts && instancePorts.length > 0) return instancePorts;
  return devicesById[deviceId]?.ports;
}
