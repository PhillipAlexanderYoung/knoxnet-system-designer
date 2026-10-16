import type { DeviceType } from "./devices";
import type { PortSpec } from "../store/projectStore";

export interface WallOutletConfig {
  gangs: 1 | 2;
  sockets: 1 | 2 | 4 | 6;
  category: "cat5e" | "cat6";
}

export const wallOutletLayouts: Pick<WallOutletConfig, "gangs" | "sockets">[] = [
  { gangs: 1, sockets: 1 },
  { gangs: 1, sockets: 2 },
  { gangs: 2, sockets: 2 },
  { gangs: 2, sockets: 4 },
  { gangs: 2, sockets: 6 },
];

export function wallOutletId(config: WallOutletConfig): string {
  return `net-outlet-${config.category}-${config.gangs}g-${config.sockets}p`;
}

function outletPorts(count: number): PortSpec[] {
  return Array.from({ length: count }, (_, index) => index + 1).flatMap((socket) =>
    (["rear", "front"] as const).map((side) => ({
      id: `socket-${socket}-${side}`,
      label: `Socket ${socket} ${side === "rear" ? "rear (cable)" : "front (RJ45)"}`,
      kind: "ethernet" as const,
      notes: `Passive termination; paired with socket-${socket}-${side === "rear" ? "front" : "rear"}.`,
    })),
  );
}

function outletIcon(config: WallOutletConfig): DeviceType["icon"] {
  const left = config.gangs === 1 ? 5 : 2;
  const width = config.gangs === 1 ? 14 : 20;
  const columns = config.gangs;
  const rows = Math.ceil(config.sockets / columns);
  return {
    paths: [
      { d: `M${left} 2 h${width} v20 h-${width} z`, fill: "currentFill", stroke: "currentStroke", strokeWidth: 1.2 },
      { d: "M11 4 h2 M11 20 h2", stroke: "currentStroke", strokeWidth: 1 },
      ...Array.from({ length: config.sockets }, (_, index) => {
        const x = columns === 1 ? 9 : 5 + (index % columns) * 8;
        const y = 12 - rows * 2.5 + Math.floor(index / columns) * 5;
        return {
          d: `M${x} ${y} h6 v3 h-2 v1 h-2 v-1 h-2 z`,
          stroke: "currentStroke",
          strokeWidth: 0.8,
        };
      }),
    ],
  };
}

export const wallOutletDevices: DeviceType[] = (["cat5e", "cat6"] as const).flatMap((category) =>
  wallOutletLayouts.map((layout) => {
    const config = { ...layout, category };
    const categoryLabel = category === "cat5e" ? "Cat5e" : "Cat6";
    return {
      id: wallOutletId(config),
      label: `${categoryLabel} Wall Outlet (${layout.gangs}-gang, ${layout.sockets}-port)`,
      shortCode: "DATA",
      category: "network",
      subcategory: "Wall Outlets",
      keywords: ["network wall socket", "data outlet", "ethernet", "RJ45", "keystone", "faceplate", "wall plate", category],
      wallOutlet: config,
      defaultCost: layout.gangs * 3 + layout.sockets * (category === "cat6" ? 6 : 4),
      laborHours: 0.25 + layout.sockets * 0.15,
      notes: "Planning allowance for a faceplate with loaded jacks and termination labor; excludes back box and cable. Adjust catalog pricing for your installation.",
      icon: outletIcon(config),
      ports: outletPorts(layout.sockets),
    };
  }),
);
