// Rack-mount device library. Each entry describes the visual faceplate via a
// declarative schema (no hand-drawn SVG per device — the renderer interprets
// the schema). This way, adding a new device is one JSON entry and looks
// consistent with the rest of the catalog.

export type RackCategory =
  | "switch"
  | "router"
  | "patch"
  | "nvr"
  | "server"
  | "ups"
  | "pdu"
  | "kvm"
  | "audio"
  | "video"
  | "lighting"
  | "broadcast"
  | "wireless"
  | "passive"
  | "demarc";

export type LedKind = "power" | "status" | "link" | "alert";

export interface FaceplateLed {
  /** position as a percentage 0-100 along the U-row, left-to-right */
  x: number;
  y?: number; // 0-100 within row
  kind: LedKind;
  on?: boolean;
  size?: number; // px diameter override
}

export interface FaceplatePortGroup {
  /** start x % */
  x: number;
  y?: number;
  /** count of ports */
  count: number;
  /** rows when count > 12 typically split into 2 rows */
  rows?: number;
  /** color of ports (typical RJ45 = "amber"; SFP = "navy") */
  color?: "amber" | "navy" | "green" | "white" | "black";
  /** label rendered above the group (e.g. "1-24 PoE") */
  label?: string;
}

export interface FaceplateText {
  x: number;
  y?: number;
  text: string;
  size?: "xs" | "sm" | "md" | "lg";
  weight?: "regular" | "bold";
  color?: "ink" | "amber" | "muted";
}

export interface FaceplateBay {
  /** rectangular cutout (HDD bay, battery, breaker) */
  x: number;
  y?: number;
  w: number;
  h: number;
  /** label inside */
  label?: string;
  /** style hint */
  style?: "hdd" | "battery" | "breaker" | "outlet" | "vent";
}

export interface FaceplateBrand {
  x: number;
  y?: number;
  text: string;
  /** Accent vertical/horizontal bar color */
  accent?: string;
}

export interface Faceplate {
  /** Base color of the chassis */
  base: "black" | "graphite" | "white" | "silver" | "amber";
  brand?: FaceplateBrand;
  ports?: FaceplatePortGroup[];
  leds?: FaceplateLed[];
  texts?: FaceplateText[];
  bays?: FaceplateBay[];
  /** Show side mounting screws */
  screws?: boolean;
  /** Vent slot pattern across full width (NVRs / servers) */
  vents?: boolean;
}

export interface RackDeviceType {
  id: string;
  label: string; // friendly name
  manufacturer: string; // for display
  model: string; // model number
  category: RackCategory;
  /** Height in U; 1U ≈ 44.45 mm */
  uHeight: number;
  powerWatts: number;
  weightLbs: number;
  defaultCost: number;
  laborHours: number;
  /** Front-facing port count (for the schedule) */
  frontPorts?: number;
  /** Rear-facing port count */
  rearPorts?: number;
  faceplate: Faceplate;
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────
// Library
// ─────────────────────────────────────────────────────────────────

export const rackDevices: RackDeviceType[] = [
  // ─── Switches ───
  {
    id: "sw-cat-24",
    label: "Catalyst 24-port PoE+ Switch",
    manufacturer: "Cisco",
    model: "C9200-24P",
    category: "switch",
    uHeight: 1,
    powerWatts: 715,
    weightLbs: 12,
    defaultCost: 2850,
    laborHours: 1.5,
    frontPorts: 28,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.2, text: "CISCO", accent: "#1BA0D7" },
      texts: [
        { x: 8, text: "CATALYST 9200", size: "sm", weight: "bold" },
        { x: 8, y: 64, text: "C9200-24P", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 23, kind: "power", on: true },
        { x: 23, y: 60, kind: "status", on: true },
        { x: 26, kind: "link", on: true },
        { x: 26, y: 60, kind: "alert" },
      ],
      ports: [
        { x: 30, count: 24, rows: 2, color: "amber", label: "1-24 PoE+" },
        { x: 78, count: 4, rows: 1, color: "navy", label: "SFP" },
      ],
    },
  },
  {
    id: "sw-cat-48",
    label: "Catalyst 48-port PoE+ Switch",
    manufacturer: "Cisco",
    model: "C9200-48P",
    category: "switch",
    uHeight: 1,
    powerWatts: 1100,
    weightLbs: 16,
    defaultCost: 4250,
    laborHours: 2.0,
    frontPorts: 52,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.2, text: "CISCO", accent: "#1BA0D7" },
      texts: [
        { x: 8, text: "CATALYST 9200", size: "sm", weight: "bold" },
        { x: 8, y: 64, text: "C9200-48P", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 23, kind: "power", on: true },
        { x: 23, y: 60, kind: "status", on: true },
      ],
      ports: [
        { x: 28, count: 48, rows: 2, color: "amber", label: "1-48 PoE+" },
        { x: 86, count: 4, rows: 1, color: "navy", label: "SFP" },
      ],
    },
  },
  {
    id: "sw-aruba-48",
    label: "Aruba CX 48-port Switch",
    manufacturer: "HPE Aruba",
    model: "6300M-48G",
    category: "switch",
    uHeight: 1,
    powerWatts: 850,
    weightLbs: 14,
    defaultCost: 3950,
    laborHours: 2.0,
    frontPorts: 52,
    faceplate: {
      base: "white",
      screws: true,
      brand: { x: 1.2, text: "aruba", accent: "#FF8300" },
      texts: [
        { x: 8, text: "CX 6300M", size: "sm", weight: "bold" },
        { x: 8, y: 64, text: "JL663A · 48G", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 24, kind: "power", on: true },
        { x: 24, y: 60, kind: "status", on: true },
      ],
      ports: [
        { x: 28, count: 48, rows: 2, color: "black", label: "1-48" },
        { x: 86, count: 4, rows: 1, color: "navy", label: "SFP56" },
      ],
    },
  },
  {
    id: "sw-core-2u",
    label: "Core Aggregation Switch",
    manufacturer: "Cisco",
    model: "C9500-32C",
    category: "switch",
    uHeight: 2,
    powerWatts: 1600,
    weightLbs: 32,
    defaultCost: 18500,
    laborHours: 4.0,
    frontPorts: 32,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.2, text: "CISCO", accent: "#1BA0D7" },
      texts: [
        { x: 8, text: "CATALYST 9500", size: "md", weight: "bold" },
        { x: 8, y: 70, text: "C9500-32C  ·  32×100G QSFP28", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 24, kind: "power", on: true },
        { x: 24, y: 60, kind: "status", on: true },
        { x: 27, kind: "link", on: true },
      ],
      ports: [
        { x: 30, count: 32, rows: 2, color: "navy", label: "QSFP28" },
      ],
    },
  },

  // ─── Routers ───
  {
    id: "rtr-edge",
    label: "Edge Router",
    manufacturer: "Cisco",
    model: "ISR4351",
    category: "router",
    uHeight: 2,
    powerWatts: 250,
    weightLbs: 18,
    defaultCost: 4850,
    laborHours: 3.0,
    frontPorts: 7,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.2, text: "CISCO", accent: "#1BA0D7" },
      texts: [
        { x: 8, text: "ISR 4351 SERIES", size: "md", weight: "bold" },
        { x: 8, y: 70, text: "INTEGRATED SERVICES ROUTER", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 30, kind: "power", on: true },
        { x: 30, y: 60, kind: "status", on: true },
      ],
      ports: [
        { x: 50, count: 3, rows: 1, color: "amber", label: "GE 0/0/0-2" },
        { x: 70, count: 4, rows: 1, color: "navy", label: "SFP" },
      ],
      bays: [{ x: 86, w: 12, h: 70, label: "USB / SVC", style: "vent" }],
    },
  },

  // ─── Patch panels ───
  {
    id: "pp-24",
    label: "24-port Cat6 Patch Panel",
    manufacturer: "Panduit",
    model: "DP24688TGY",
    category: "patch",
    uHeight: 1,
    powerWatts: 0,
    weightLbs: 4,
    defaultCost: 145,
    laborHours: 1.0,
    frontPorts: 24,
    faceplate: {
      base: "black",
      screws: true,
      texts: [
        { x: 1.5, text: "PANDUIT", size: "xs", weight: "bold", color: "muted" },
      ],
      ports: [
        { x: 8, count: 24, rows: 1, color: "amber", label: "1   2   3   …   24" },
      ],
    },
  },
  {
    id: "pp-48",
    label: "48-port Cat6 Patch Panel",
    manufacturer: "Panduit",
    model: "DP48688TGY",
    category: "patch",
    uHeight: 2,
    powerWatts: 0,
    weightLbs: 7,
    defaultCost: 245,
    laborHours: 1.5,
    frontPorts: 48,
    faceplate: {
      base: "black",
      screws: true,
      texts: [
        { x: 1.5, text: "PANDUIT", size: "xs", weight: "bold", color: "muted" },
      ],
      ports: [
        { x: 6, count: 24, rows: 1, color: "amber", label: "1-24" },
        { x: 6, y: 65, count: 24, rows: 1, color: "amber", label: "25-48" },
      ],
    },
  },
  {
    id: "pp-fiber-12",
    label: "Fiber Patch Panel 12-port LC",
    manufacturer: "Corning",
    model: "CCH-01U",
    category: "patch",
    uHeight: 1,
    powerWatts: 0,
    weightLbs: 5,
    defaultCost: 385,
    laborHours: 1.5,
    frontPorts: 12,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.2, text: "CORNING", accent: "#F4B740" },
      ports: [{ x: 25, count: 12, rows: 1, color: "amber", label: "LC DUPLEX" }],
    },
  },

  // ─── NVRs ───
  {
    id: "nvr-16",
    label: "NVR 16-channel · 8TB",
    manufacturer: "Avigilon",
    model: "NVR4-PRM-8TB",
    category: "nvr",
    uHeight: 2,
    powerWatts: 400,
    weightLbs: 38,
    defaultCost: 4850,
    laborHours: 3.0,
    frontPorts: 0,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "AVIGILON", accent: "#FF6B00" },
      texts: [
        { x: 8, text: "NVR4 PREMIUM", size: "sm", weight: "bold" },
        { x: 8, y: 65, text: "16-CHANNEL · 8TB", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 60, kind: "status", on: true },
      ],
      bays: [
        { x: 38, w: 8, h: 70, label: "1", style: "hdd" },
        { x: 47, w: 8, h: 70, label: "2", style: "hdd" },
        { x: 56, w: 8, h: 70, label: "3", style: "hdd" },
        { x: 65, w: 8, h: 70, label: "4", style: "hdd" },
        { x: 76, w: 22, h: 70, label: "MEDIA", style: "vent" },
      ],
    },
  },
  {
    id: "nvr-32",
    label: "NVR 32-channel · 24TB",
    manufacturer: "Avigilon",
    model: "NVR5-STD-24TB",
    category: "nvr",
    uHeight: 3,
    powerWatts: 650,
    weightLbs: 62,
    defaultCost: 9850,
    laborHours: 5.0,
    frontPorts: 0,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "AVIGILON", accent: "#FF6B00" },
      texts: [
        { x: 8, text: "NVR5 STANDARD", size: "md", weight: "bold" },
        { x: 8, y: 70, text: "32-CHANNEL · 24TB · RAID 6", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 30, kind: "power", on: true },
        { x: 30, y: 60, kind: "status", on: true },
        { x: 33, kind: "alert" },
      ],
      bays: [
        { x: 40, w: 7, h: 80, label: "1", style: "hdd" },
        { x: 48, w: 7, h: 80, label: "2", style: "hdd" },
        { x: 56, w: 7, h: 80, label: "3", style: "hdd" },
        { x: 64, w: 7, h: 80, label: "4", style: "hdd" },
        { x: 72, w: 7, h: 80, label: "5", style: "hdd" },
        { x: 80, w: 7, h: 80, label: "6", style: "hdd" },
        { x: 88, w: 7, h: 80, label: "7", style: "hdd" },
      ],
    },
  },

  // ─── UPS ───
  {
    id: "ups-1500",
    label: "UPS 1500VA / 1000W",
    manufacturer: "APC",
    model: "SMT1500RM2U",
    category: "ups",
    uHeight: 2,
    powerWatts: 0, // UPS provides power; net draw at idle ~30W but we treat as 0 for the bid load
    weightLbs: 49,
    defaultCost: 875,
    laborHours: 1.5,
    frontPorts: 0,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "APC", accent: "#41B883" },
      texts: [
        { x: 7, text: "SMART-UPS 1500", size: "sm", weight: "bold" },
        { x: 7, y: 65, text: "1500VA / 1000W · LCD", size: "xs", color: "muted" },
      ],
      bays: [
        { x: 32, w: 22, h: 80, label: "—  88%  —", style: "battery" },
        { x: 60, w: 36, h: 80, label: "ON  LINE", style: "vent" },
      ],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 60, kind: "status", on: true },
      ],
    },
  },
  {
    id: "ups-3000",
    label: "UPS 3000VA / 2700W",
    manufacturer: "APC",
    model: "SMT3000RM2U",
    category: "ups",
    uHeight: 2,
    powerWatts: 0,
    weightLbs: 84,
    defaultCost: 1685,
    laborHours: 1.5,
    frontPorts: 0,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "APC", accent: "#41B883" },
      texts: [
        { x: 7, text: "SMART-UPS 3000", size: "sm", weight: "bold" },
        { x: 7, y: 65, text: "3000VA / 2700W · LCD", size: "xs", color: "muted" },
      ],
      bays: [
        { x: 32, w: 26, h: 80, label: "—  92%  —", style: "battery" },
        { x: 64, w: 32, h: 80, label: "ON  LINE", style: "vent" },
      ],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 60, kind: "status", on: true },
      ],
    },
  },

  // ─── PDUs ───
  {
    id: "pdu-1u-8",
    label: "PDU 8-outlet 1U",
    manufacturer: "APC",
    model: "AP7900",
    category: "pdu",
    uHeight: 1,
    powerWatts: 0,
    weightLbs: 9,
    defaultCost: 425,
    laborHours: 1.0,
    frontPorts: 8,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "APC", accent: "#41B883" },
      texts: [{ x: 8, text: "SWITCHED RACK PDU · 20A 120V", size: "xs", color: "muted" }],
      bays: [
        { x: 25, w: 8, h: 70, style: "outlet" },
        { x: 34, w: 8, h: 70, style: "outlet" },
        { x: 43, w: 8, h: 70, style: "outlet" },
        { x: 52, w: 8, h: 70, style: "outlet" },
        { x: 61, w: 8, h: 70, style: "outlet" },
        { x: 70, w: 8, h: 70, style: "outlet" },
        { x: 79, w: 8, h: 70, style: "outlet" },
        { x: 88, w: 8, h: 70, style: "outlet" },
      ],
    },
  },

  // ─── Demarc / NID ───
  {
    id: "demarc-1u",
    label: "Demarc / NID Shelf",
    manufacturer: "Generic",
    model: "DEMARC-1U",
    category: "demarc",
    uHeight: 1,
    powerWatts: 0,
    weightLbs: 6,
    defaultCost: 285,
    laborHours: 1.5,
    frontPorts: 6,
    faceplate: {
      base: "graphite",
      screws: true,
      texts: [
        { x: 1.5, text: "ISP DEMARC", size: "xs", weight: "bold", color: "amber" },
      ],
      bays: [
        { x: 12, w: 18, h: 70, label: "FIBER ENT", style: "vent" },
        { x: 32, w: 18, h: 70, label: "OPT NETWK TERM", style: "vent" },
        { x: 52, w: 18, h: 70, label: "BATT BACKUP", style: "battery" },
      ],
      ports: [{ x: 73, count: 4, rows: 1, color: "amber", label: "WAN-LAN" }],
    },
  },

  // ─── Servers / KVM ───
  {
    id: "srv-1u",
    label: "1U Application Server",
    manufacturer: "Dell",
    model: "PowerEdge R650",
    category: "server",
    uHeight: 1,
    powerWatts: 600,
    weightLbs: 38,
    defaultCost: 6850,
    laborHours: 3.0,
    frontPorts: 0,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.5, text: "DELL", accent: "#007DB8" },
      texts: [{ x: 8, text: "PowerEdge R650", size: "sm", weight: "bold" }],
      leds: [
        { x: 24, kind: "power", on: true },
        { x: 24, y: 60, kind: "status", on: true },
      ],
      bays: [
        { x: 30, w: 9, h: 75, label: "1", style: "hdd" },
        { x: 40, w: 9, h: 75, label: "2", style: "hdd" },
        { x: 50, w: 9, h: 75, label: "3", style: "hdd" },
        { x: 60, w: 9, h: 75, label: "4", style: "hdd" },
        { x: 70, w: 9, h: 75, label: "5", style: "hdd" },
        { x: 80, w: 9, h: 75, label: "6", style: "hdd" },
      ],
    },
  },
  {
    id: "kvm-1u",
    label: "Console KVM 17\" LCD",
    manufacturer: "Tripp Lite",
    model: "B040-008-17-IP",
    category: "kvm",
    uHeight: 1,
    powerWatts: 35,
    weightLbs: 22,
    defaultCost: 1485,
    laborHours: 1.5,
    frontPorts: 0,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "TRIPP·LITE", accent: "#003F87" },
      texts: [{ x: 10, text: "RACK CONSOLE  17\" LCD · 8-PORT IP KVM", size: "xs", color: "muted" }],
      bays: [{ x: 26, w: 50, h: 78, label: "[ LCD CONSOLE ]", style: "vent" }],
    },
  },

  // ─── Audio ───
  {
    id: "amp-2u",
    label: "Mass Notification Amplifier 250W",
    manufacturer: "Bogen",
    model: "TPU250",
    category: "audio",
    uHeight: 2,
    powerWatts: 320,
    weightLbs: 18,
    defaultCost: 985,
    laborHours: 2.0,
    frontPorts: 0,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.5, text: "BOGEN", accent: "#E5301B" },
      texts: [
        { x: 8, text: "TELECOM POWER UNIT", size: "sm", weight: "bold" },
        { x: 8, y: 70, text: "250W  ·  70V/100V LINE", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 30, kind: "power", on: true },
        { x: 30, y: 60, kind: "status", on: true },
      ],
      bays: [
        { x: 40, w: 14, h: 80, label: "VU", style: "vent" },
        { x: 60, w: 36, h: 80, label: "ZONE A · ZONE B · ZONE C · ZONE D", style: "vent" },
      ],
    },
  },

  // ─── Passive ───
  {
    id: "blank-1u",
    label: "Blank Filler Panel 1U",
    manufacturer: "Generic",
    model: "BLANK-1U",
    category: "passive",
    uHeight: 1,
    powerWatts: 0,
    weightLbs: 1,
    defaultCost: 12,
    laborHours: 0.1,
    faceplate: { base: "black", screws: true },
  },
  {
    id: "blank-2u",
    label: "Blank Filler Panel 2U",
    manufacturer: "Generic",
    model: "BLANK-2U",
    category: "passive",
    uHeight: 2,
    powerWatts: 0,
    weightLbs: 2,
    defaultCost: 22,
    laborHours: 0.1,
    faceplate: { base: "black", screws: true },
  },
  {
    id: "cm-1u",
    label: "Horizontal Cable Manager 1U",
    manufacturer: "Panduit",
    model: "WMPF1E",
    category: "passive",
    uHeight: 1,
    powerWatts: 0,
    weightLbs: 3,
    defaultCost: 65,
    laborHours: 0.5,
    faceplate: {
      base: "black",
      screws: true,
      bays: [
        { x: 4, w: 6, h: 60, style: "vent" },
        { x: 12, w: 6, h: 60, style: "vent" },
        { x: 20, w: 6, h: 60, style: "vent" },
        { x: 28, w: 6, h: 60, style: "vent" },
        { x: 36, w: 6, h: 60, style: "vent" },
        { x: 44, w: 6, h: 60, style: "vent" },
        { x: 52, w: 6, h: 60, style: "vent" },
        { x: 60, w: 6, h: 60, style: "vent" },
        { x: 68, w: 6, h: 60, style: "vent" },
        { x: 76, w: 6, h: 60, style: "vent" },
        { x: 84, w: 6, h: 60, style: "vent" },
        { x: 92, w: 4, h: 60, style: "vent" },
      ],
    },
  },
  {
    id: "vent-1u",
    label: "Vent Panel 1U",
    manufacturer: "Generic",
    model: "VENT-1U",
    category: "passive",
    uHeight: 1,
    powerWatts: 0,
    weightLbs: 1,
    defaultCost: 28,
    laborHours: 0.1,
    faceplate: {
      base: "black",
      screws: true,
      vents: true,
    },
  },

  // ═══════════════════════════════════════════════════════════════════════
  //  EXPANDED RACK LIBRARY — broadcast / audio / lighting / RF gear
  // ═══════════════════════════════════════════════════════════════════════

  // ─── Audio ───
  {
    id: "aud-mixer-rack-1u",
    label: "Audio Mixer 1U (Rack-mount)",
    manufacturer: "Yamaha",
    model: "MTX5-D",
    category: "audio",
    uHeight: 1,
    powerWatts: 35,
    weightLbs: 6,
    defaultCost: 1850,
    laborHours: 1.5,
    frontPorts: 0,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "YAMAHA", accent: "#A30C16" },
      texts: [
        { x: 8, text: "MTX5-D MATRIX PROCESSOR", size: "xs", weight: "bold" },
      ],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 60, kind: "status", on: true },
        { x: 31, kind: "link", on: true },
      ],
      bays: [{ x: 36, w: 60, h: 70, label: "DSP · 8×8 MATRIX · DANTE", style: "vent" }],
    },
  },
  {
    id: "aud-mixer-rack-2u",
    label: "Digital Mixer 2U (Rack-mount)",
    manufacturer: "Allen & Heath",
    model: "AHM-64",
    category: "audio",
    uHeight: 2,
    powerWatts: 60,
    weightLbs: 13,
    defaultCost: 4250,
    laborHours: 2.0,
    frontPorts: 0,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "A&H", accent: "#E2231A" },
      texts: [
        { x: 8, text: "AHM-64", size: "md", weight: "bold" },
        { x: 8, y: 70, text: "64×64 MATRIX · DANTE/SLINK", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 30, kind: "power", on: true },
        { x: 30, y: 60, kind: "status", on: true },
      ],
      bays: [{ x: 40, w: 56, h: 80, label: "[ DSP ENGINE · 96 kHz ]", style: "vent" }],
    },
  },
  {
    id: "aud-dsp-rack",
    label: "DSP Processor (BSS Soundweb)",
    manufacturer: "BSS",
    model: "BLU-100",
    category: "audio",
    uHeight: 1,
    powerWatts: 25,
    weightLbs: 7,
    defaultCost: 2850,
    laborHours: 2.0,
    frontPorts: 0,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "BSS", accent: "#3CC5F2" },
      texts: [
        { x: 8, text: "Soundweb BLU-100", size: "sm", weight: "bold" },
        { x: 8, y: 65, text: "12×8 DSP · BLU LINK", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 60, kind: "status", on: true },
      ],
      ports: [{ x: 36, count: 12, rows: 1, color: "amber", label: "ANALOG I/O" }],
    },
  },
  {
    id: "aud-amp-1u",
    label: "Power Amplifier 1U (4-ch)",
    manufacturer: "QSC",
    model: "CX-Q 4K4",
    category: "audio",
    uHeight: 1,
    powerWatts: 1200,
    weightLbs: 12,
    defaultCost: 3850,
    laborHours: 1.5,
    frontPorts: 0,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.5, text: "QSC", accent: "#FF6B00" },
      texts: [
        { x: 8, text: "CX-Q 4K4", size: "sm", weight: "bold" },
        { x: 8, y: 65, text: "4×1000W · NETWORK AMP", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 27, kind: "power", on: true },
        { x: 27, y: 60, kind: "status", on: true },
        { x: 30, kind: "link", on: true },
      ],
      bays: [{ x: 38, w: 58, h: 70, label: "CH 1 · 2 · 3 · 4 — MONITOR", style: "vent" }],
    },
  },
  {
    id: "aud-amp-2u",
    label: "Power Amplifier 2U (8-ch)",
    manufacturer: "Crown",
    model: "DCi 8|600N",
    category: "audio",
    uHeight: 2,
    powerWatts: 2000,
    weightLbs: 22,
    defaultCost: 6850,
    laborHours: 2.0,
    frontPorts: 0,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.5, text: "CROWN", accent: "#E2231A" },
      texts: [
        { x: 8, text: "DCi 8|600N", size: "md", weight: "bold" },
        { x: 8, y: 70, text: "8×600W · BLU LINK · DANTE", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 30, kind: "power", on: true },
        { x: 30, y: 60, kind: "status", on: true },
      ],
      bays: [
        { x: 38, w: 14, h: 80, label: "VU 1-4", style: "vent" },
        { x: 54, w: 14, h: 80, label: "VU 5-8", style: "vent" },
        { x: 70, w: 26, h: 80, label: "MONITOR DISPLAY", style: "vent" },
      ],
    },
  },
  {
    id: "aud-snake-head",
    label: "Digital Stage Box (32×16)",
    manufacturer: "Behringer",
    model: "S32",
    category: "audio",
    uHeight: 3,
    powerWatts: 65,
    weightLbs: 18,
    defaultCost: 1850,
    laborHours: 2.0,
    frontPorts: 32,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "BEHRINGER", accent: "#E2231A" },
      texts: [
        { x: 9, text: "S32 DIGITAL SNAKE", size: "md", weight: "bold" },
        { x: 9, y: 76, text: "32 IN · 16 OUT · AES50", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 70, kind: "link", on: true },
      ],
      ports: [
        { x: 33, count: 16, rows: 1, color: "white", label: "INPUTS 1-16" },
        { x: 33, y: 50, count: 16, rows: 1, color: "white", label: "INPUTS 17-32" },
        { x: 33, y: 80, count: 16, rows: 1, color: "amber", label: "OUTPUTS 1-16" },
      ],
    },
  },

  // ─── Lighting ───
  {
    id: "lit-dmx-dimmer",
    label: "DMX Dimmer 12-channel",
    manufacturer: "ETC",
    model: "Sensor3 SR48",
    category: "lighting",
    uHeight: 4,
    powerWatts: 15000,
    weightLbs: 75,
    defaultCost: 8850,
    laborHours: 6.0,
    frontPorts: 12,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.5, text: "ETC", accent: "#F4B740" },
      texts: [
        { x: 9, text: "SENSOR3", size: "lg", weight: "bold" },
        { x: 9, y: 80, text: "12 × 2.4kW DIMMER · DMX/sACN", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 70, kind: "status", on: true },
        { x: 31, kind: "link", on: true },
      ],
      bays: [
        { x: 36, w: 56, h: 90, label: "[ 12 DIMMER MODULES · 20A ]", style: "vent" },
      ],
    },
  },
  {
    id: "lit-dmx-gw-rack",
    label: "DMX/sACN Gateway 1U",
    manufacturer: "Pathway",
    model: "Pathport Octo",
    category: "lighting",
    uHeight: 1,
    powerWatts: 25,
    weightLbs: 5,
    defaultCost: 1450,
    laborHours: 1.0,
    frontPorts: 8,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.5, text: "PATHWAY", accent: "#F4B740" },
      texts: [
        { x: 8, text: "PATHPORT OCTO", size: "sm", weight: "bold" },
        { x: 8, y: 65, text: "8 PORT DMX / sACN", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 26, kind: "power", on: true },
        { x: 26, y: 60, kind: "link", on: true },
      ],
      ports: [{ x: 35, count: 8, rows: 1, color: "amber", label: "DMX 1-8" }],
    },
  },
  {
    id: "lit-dmx-splitter",
    label: "DMX Splitter / Buffer 1U",
    manufacturer: "Doug Fleenor",
    model: "DMX1224",
    category: "lighting",
    uHeight: 1,
    powerWatts: 8,
    weightLbs: 4,
    defaultCost: 685,
    laborHours: 0.75,
    frontPorts: 0,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "DFD", accent: "#F4B740" },
      texts: [{ x: 8, text: "DMX BUFFER · OPTO ISOLATED · 12-OUT", size: "xs", color: "muted" }],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 60, kind: "status", on: true },
      ],
    },
  },

  // ─── Video ───
  {
    id: "vid-matrix-rack",
    label: "Video Matrix Switcher 4×4",
    manufacturer: "Extron",
    model: "DXP 44 HD 4K",
    category: "video",
    uHeight: 1,
    powerWatts: 38,
    weightLbs: 6,
    defaultCost: 4850,
    laborHours: 1.5,
    frontPorts: 8,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.5, text: "EXTRON", accent: "#005DAA" },
      texts: [
        { x: 8, text: "DXP 44 HD 4K", size: "sm", weight: "bold" },
        { x: 8, y: 65, text: "4 × 4 HDMI MATRIX · 4K/60", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 27, kind: "power", on: true },
        { x: 27, y: 60, kind: "status", on: true },
      ],
      ports: [
        { x: 36, count: 4, rows: 1, color: "navy", label: "INPUTS" },
        { x: 60, count: 4, rows: 1, color: "amber", label: "OUTPUTS" },
      ],
    },
  },
  {
    id: "vid-encoder",
    label: "Streaming Encoder 1U",
    manufacturer: "AJA",
    model: "HELO Plus",
    category: "video",
    uHeight: 1,
    powerWatts: 28,
    weightLbs: 5,
    defaultCost: 4250,
    laborHours: 1.5,
    frontPorts: 4,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.5, text: "AJA", accent: "#0079C2" },
      texts: [
        { x: 8, text: "HELO PLUS", size: "sm", weight: "bold" },
        { x: 8, y: 65, text: "STREAM · RECORD · H.264/H.265", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 60, kind: "alert", on: true },
        { x: 31, kind: "status", on: true },
      ],
      bays: [{ x: 38, w: 58, h: 70, label: "[ ENCODE / RECORD ]", style: "vent" }],
    },
  },
  {
    id: "vid-media-server",
    label: "Media Server (Playout)",
    manufacturer: "BrightSign",
    model: "XT2145",
    category: "video",
    uHeight: 1,
    powerWatts: 35,
    weightLbs: 4,
    defaultCost: 2450,
    laborHours: 1.5,
    frontPorts: 0,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "BRIGHTSIGN", accent: "#F47B20" },
      texts: [
        { x: 8, text: "XT2145 MEDIA PLAYER", size: "sm", weight: "bold" },
        { x: 8, y: 65, text: "8K HDR · 4K 60p", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 60, kind: "link", on: true },
      ],
    },
  },

  // ─── Broadcast ───
  {
    id: "bc-switcher-rack",
    label: "Production Switcher (ME)",
    manufacturer: "Blackmagic",
    model: "ATEM 4 M/E Constellation",
    category: "broadcast",
    uHeight: 4,
    powerWatts: 95,
    weightLbs: 15,
    defaultCost: 8850,
    laborHours: 4.0,
    frontPorts: 0,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.5, text: "BLACKMAGIC", accent: "#FF6B00" },
      texts: [
        { x: 9, text: "ATEM 4 M/E CONSTELLATION", size: "md", weight: "bold" },
        { x: 9, y: 80, text: "40-INPUT · 4 ME · 4K", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 70, kind: "status", on: true },
      ],
      bays: [
        { x: 35, w: 60, h: 90, label: "[ 4K PRODUCTION CORE ]", style: "vent" },
      ],
    },
  },
  {
    id: "bc-router-12g",
    label: "12G-SDI Router 16×16",
    manufacturer: "Blackmagic",
    model: "Smart Videohub 12G 40×40",
    category: "broadcast",
    uHeight: 2,
    powerWatts: 75,
    weightLbs: 11,
    defaultCost: 5850,
    laborHours: 2.5,
    frontPorts: 32,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.5, text: "BLACKMAGIC", accent: "#FF6B00" },
      texts: [
        { x: 9, text: "SMART VIDEOHUB 12G", size: "md", weight: "bold" },
        { x: 9, y: 80, text: "40×40 SDI ROUTER", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 70, kind: "status", on: true },
      ],
      ports: [
        { x: 35, count: 16, rows: 1, color: "navy", label: "INPUTS 1-16" },
        { x: 35, y: 50, count: 16, rows: 1, color: "amber", label: "OUTPUTS 1-16" },
      ],
    },
  },
  {
    id: "bc-intercom-matrix",
    label: "Intercom Matrix",
    manufacturer: "Clear-Com",
    model: "Eclipse HX-Median",
    category: "broadcast",
    uHeight: 4,
    powerWatts: 120,
    weightLbs: 22,
    defaultCost: 12500,
    laborHours: 6.0,
    frontPorts: 0,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "CLEAR-COM", accent: "#0093D0" },
      texts: [
        { x: 9, text: "ECLIPSE HX-MEDIAN", size: "md", weight: "bold" },
        { x: 9, y: 80, text: "INTERCOM MATRIX · 256×256", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 70, kind: "status", on: true },
      ],
      bays: [
        { x: 36, w: 60, h: 90, label: "[ MATRIX FRAME ]", style: "vent" },
      ],
    },
  },
  {
    id: "bc-ccu-frame",
    label: "Camera Control Frame",
    manufacturer: "Sony",
    model: "HDCU-3500",
    category: "broadcast",
    uHeight: 4,
    powerWatts: 280,
    weightLbs: 28,
    defaultCost: 28500,
    laborHours: 6.0,
    frontPorts: 0,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.5, text: "SONY", accent: "#0078D7" },
      texts: [
        { x: 9, text: "HDCU-3500", size: "md", weight: "bold" },
        { x: 9, y: 80, text: "CAMERA CONTROL UNIT · 4K", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 70, kind: "status", on: true },
      ],
      bays: [{ x: 38, w: 58, h: 90, label: "[ STUDIO CCU ]", style: "vent" }],
    },
  },

  // ─── Wireless / RF ───
  {
    id: "wls-rx-rack",
    label: "Wireless Mic Receiver (Quad)",
    manufacturer: "Shure",
    model: "ULXD4Q",
    category: "wireless",
    uHeight: 1,
    powerWatts: 35,
    weightLbs: 7,
    defaultCost: 4850,
    laborHours: 1.5,
    frontPorts: 4,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "SHURE", accent: "#5BA3DC" },
      texts: [
        { x: 8, text: "ULXD4Q", size: "sm", weight: "bold" },
        { x: 8, y: 65, text: "4-CH DIGITAL RX · DANTE", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 26, kind: "power", on: true },
        { x: 26, y: 60, kind: "link", on: true },
      ],
      bays: [
        { x: 32, w: 14, h: 70, label: "CH 1", style: "vent" },
        { x: 48, w: 14, h: 70, label: "CH 2", style: "vent" },
        { x: 64, w: 14, h: 70, label: "CH 3", style: "vent" },
        { x: 80, w: 14, h: 70, label: "CH 4", style: "vent" },
      ],
    },
  },
  {
    id: "wls-iem-rack",
    label: "IEM Transmitter (Dual)",
    manufacturer: "Shure",
    model: "PSM 1000 P10T",
    category: "wireless",
    uHeight: 1,
    powerWatts: 30,
    weightLbs: 6,
    defaultCost: 3850,
    laborHours: 1.0,
    frontPorts: 0,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "SHURE", accent: "#5BA3DC" },
      texts: [
        { x: 8, text: "PSM 1000 P10T", size: "sm", weight: "bold" },
        { x: 8, y: 65, text: "DUAL IEM TRANSMITTER", size: "xs", color: "muted" },
      ],
      leds: [
        { x: 26, kind: "power", on: true },
        { x: 26, y: 60, kind: "alert", on: true },
        { x: 29, kind: "status", on: true },
      ],
      bays: [
        { x: 36, w: 28, h: 70, label: "TX A", style: "vent" },
        { x: 66, w: 28, h: 70, label: "TX B", style: "vent" },
      ],
    },
  },
  {
    id: "wls-antenna-distro-rack",
    label: "Antenna Distribution 1U",
    manufacturer: "Shure",
    model: "UA844+",
    category: "wireless",
    uHeight: 1,
    powerWatts: 18,
    weightLbs: 4,
    defaultCost: 1485,
    laborHours: 1.0,
    frontPorts: 0,
    faceplate: {
      base: "black",
      screws: true,
      brand: { x: 1.5, text: "SHURE", accent: "#5BA3DC" },
      texts: [
        { x: 8, text: "UA844+ ANTENNA DISTRIBUTION", size: "xs", weight: "bold" },
      ],
      leds: [
        { x: 30, kind: "power", on: true },
      ],
      bays: [{ x: 36, w: 60, h: 70, label: "ANT A · ANT B · 4-WAY", style: "vent" }],
    },
  },

  // ─── Server / Network additions ───
  {
    id: "net-fmc-rack",
    label: "Fiber Media Converter Chassis 1U",
    manufacturer: "Black Box",
    model: "LMC5000",
    category: "video",
    uHeight: 1,
    powerWatts: 75,
    weightLbs: 6,
    defaultCost: 1485,
    laborHours: 1.5,
    frontPorts: 16,
    faceplate: {
      base: "graphite",
      screws: true,
      brand: { x: 1.5, text: "BLACK·BOX", accent: "#F4B740" },
      texts: [{ x: 8, text: "LMC5000 · 16-BAY FIBER MEDIA CONVERTER", size: "xs", color: "muted" }],
      leds: [
        { x: 28, kind: "power", on: true },
        { x: 28, y: 60, kind: "status", on: true },
      ],
      ports: [{ x: 35, count: 16, rows: 1, color: "amber", label: "BAYS" }],
    },
  },
];

export const rackDevicesById: Record<string, RackDeviceType> = Object.fromEntries(
  rackDevices.map((d) => [d.id, d]),
);

export const rackCategoryLabel: Record<RackCategory, string> = {
  switch: "Switches",
  router: "Routers",
  patch: "Patch Panels",
  nvr: "NVRs",
  server: "Servers",
  ups: "UPS",
  pdu: "PDUs",
  kvm: "KVM",
  audio: "Audio",
  video: "Video",
  lighting: "Lighting",
  broadcast: "Broadcast",
  wireless: "Wireless / RF",
  passive: "Passive",
  demarc: "Demarc",
};
