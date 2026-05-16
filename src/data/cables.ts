// Cable type catalog: cost per foot, labor per foot, line color/style.

export interface CableType {
  id: string;
  label: string;
  shortCode: string;
  costPerFoot: number;
  laborPerFoot: number; // hours
  /** Approximate outside diameter for planning-level conduit fill. */
  outsideDiameterIn?: number;
  /** Default fiber strand count for fiber cable families. */
  defaultStrandCount?: number;
  /** Common strand counts offered as quick-pick suggestions. */
  strandCountPresets?: number[];
  color: string;
  dash?: number[]; // konva dash pattern
  thickness?: number;
  notes?: string;
}

export const fiberStrandCountPresets = [2, 4, 6, 12, 24, 48, 72, 96, 144, 288];

export const cables: CableType[] = [
  {
    id: "cat6",
    label: "Cat6 UTP",
    shortCode: "C6",
    costPerFoot: 0.42,
    laborPerFoot: 0.018,
    outsideDiameterIn: 0.24,
    color: "#4FB7FF",
    thickness: 2.5,
  },
  {
    id: "cat6a",
    label: "Cat6A Shielded",
    shortCode: "C6A",
    costPerFoot: 0.78,
    laborPerFoot: 0.022,
    outsideDiameterIn: 0.29,
    color: "#2BD37C",
    thickness: 2.5,
  },
  {
    id: "cat6-plenum",
    label: "Cat6 Plenum",
    shortCode: "C6P",
    costPerFoot: 0.95,
    laborPerFoot: 0.02,
    outsideDiameterIn: 0.24,
    color: "#B58CFF",
    thickness: 2.5,
  },
  {
    id: "fiber-sm",
    label: "Single-Mode Fiber (12-strand)",
    shortCode: "SMF",
    costPerFoot: 1.85,
    laborPerFoot: 0.045,
    outsideDiameterIn: 0.35,
    defaultStrandCount: 12,
    strandCountPresets: fiberStrandCountPresets,
    color: "#F4B740",
    thickness: 3,
  },
  {
    id: "fiber-mm",
    label: "Multi-Mode Fiber OM4 (12-strand)",
    shortCode: "MMF",
    costPerFoot: 2.25,
    laborPerFoot: 0.045,
    outsideDiameterIn: 0.35,
    defaultStrandCount: 12,
    strandCountPresets: fiberStrandCountPresets,
    color: "#F7C765",
    thickness: 3,
    dash: [10, 4],
  },
  {
    id: "coax-rg6",
    label: "Coax RG6",
    shortCode: "RG6",
    costPerFoot: 0.32,
    laborPerFoot: 0.018,
    outsideDiameterIn: 0.27,
    color: "#FF5C7A",
    thickness: 2,
  },
  {
    id: "lv-18-2",
    label: "Low-Voltage 18/2",
    shortCode: "18/2",
    costPerFoot: 0.18,
    laborPerFoot: 0.012,
    outsideDiameterIn: 0.18,
    color: "#3DD4D0",
    thickness: 1.5,
    dash: [4, 4],
  },
  {
    id: "lv-22-4",
    label: "Low-Voltage 22/4",
    shortCode: "22/4",
    costPerFoot: 0.22,
    laborPerFoot: 0.014,
    outsideDiameterIn: 0.16,
    color: "#94A0B8",
    thickness: 1.5,
    dash: [4, 4],
  },
  {
    id: "conduit",
    label: "Conduit",
    shortCode: "EMT",
    costPerFoot: 1.85,
    laborPerFoot: 0.075,
    color: "#C2CADA",
    thickness: 4,
    dash: [12, 6],
  },
];

export const cablesById: Record<string, CableType> = Object.fromEntries(
  cables.map((c) => [c.id, c]),
);
