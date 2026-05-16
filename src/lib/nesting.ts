import { devicesById } from "../data/devices";
import type { DeviceConnection, DeviceMarkup, Markup } from "../store/projectStore";

export const NESTING_SNAP_DISTANCE_PTS = 10;
export const NESTED_BUBBLE_SCALE = 1 / 3;
export const RACK_DEVICE_ID = "net-rack";

const CONTAINER_TERMS = [
  "rack",
  "cabinet",
  "enclosure",
  "head-end",
  "head end",
  "headend",
  "mdf",
  "idf",
  "pull box",
  "pullbox",
  "junction box",
  "j-box",
  "weatherproof",
  "nema",
];

const NESTABLE_SHORT_CODES = new Set([
  "SW",
  "CS",
  "RTR",
  "NVR",
  "DVR",
  "NID",
  "UPS",
  "ACP",
  "CTRL",
  "PANEL",
  "MTX",
  "SCL",
  "DSP",
  "AMP",
  "CCU",
]);

const NESTABLE_CATEGORIES = new Set([
  "network",
  "access",
  "av",
  "audio",
  "broadcast",
  "production",
]);

export function deviceDisplayName(markup: DeviceMarkup): string {
  const tag = markup.tag?.trim();
  const label = markup.labelOverride?.trim();
  if (tag && label) return `${tag} - ${label}`;
  if (tag) return tag;
  if (label) return label;
  return devicesById[markup.deviceId]?.label ?? "Device";
}

export function isContainerDevice(markup: Markup): markup is DeviceMarkup {
  if (markup.kind !== "device") return false;
  const catalog = devicesById[markup.deviceId];
  const haystack = [
    markup.deviceId,
    catalog?.label,
    catalog?.shortCode,
    catalog?.subcategory,
    ...(catalog?.keywords ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return CONTAINER_TERMS.some((term) => haystack.includes(term));
}

export function isRackDevice(markup: Markup): markup is DeviceMarkup {
  if (markup.kind !== "device") return false;
  const catalog = devicesById[markup.deviceId];
  return (
    markup.deviceId === RACK_DEVICE_ID ||
    catalog?.shortCode?.toUpperCase() === "RACK" ||
    catalog?.label.trim().toLowerCase() === "rack"
  );
}

export function isNestableDevice(markup: Markup): markup is DeviceMarkup {
  if (markup.kind !== "device") return false;
  const catalog = devicesById[markup.deviceId];
  const haystack = [
    markup.deviceId,
    catalog?.label,
    catalog?.shortCode,
    catalog?.subcategory,
    ...(catalog?.keywords ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (CONTAINER_TERMS.some((term) => haystack.includes(term))) return false;
  const code = catalog?.shortCode?.toUpperCase();
  if (code && NESTABLE_SHORT_CODES.has(code)) return true;
  if (NESTABLE_CATEGORIES.has(markup.category)) return true;
  return false;
}

export function nestedChildren(
  markups: Markup[],
  parentId: string,
): DeviceMarkup[] {
  return markups.filter(
    (m): m is DeviceMarkup => m.kind === "device" && m.parentId === parentId,
  );
}

export function canNestDeviceIn(
  child: DeviceMarkup,
  parent: DeviceMarkup,
  markups: Markup[],
): boolean {
  if (child.id === parent.id) return false;
  if (!isNestableDevice(child) || !isContainerDevice(parent)) return false;

  // Prevent cycles if containers gain parents later.
  let cursor: DeviceMarkup | undefined = parent;
  const seen = new Set<string>();
  while (cursor?.parentId) {
    const nextParentId = cursor.parentId;
    if (nextParentId === child.id || seen.has(nextParentId)) return false;
    seen.add(nextParentId);
    cursor = markups.find(
      (m): m is DeviceMarkup => m.kind === "device" && m.id === nextParentId,
    );
  }
  return true;
}

export function nearestContainerForDevice(
  markups: Markup[],
  child: DeviceMarkup,
  point: { x: number; y: number },
  threshold = NESTING_SNAP_DISTANCE_PTS,
): DeviceMarkup | null {
  let best: { container: DeviceMarkup; distance: number } | null = null;
  for (const m of markups) {
    if (m.kind !== "device") continue;
    if (!canNestDeviceIn(child, m, markups)) continue;
    const distance = Math.hypot(m.x - point.x, m.y - point.y);
    const snapDistance = threshold + Math.min((m.size ?? 28) / 2, 14);
    if (distance > snapDistance) continue;
    if (!best || distance < best.distance) best = { container: m, distance };
  }
  return best?.container ?? null;
}

export function nestedSlotPoint(
  markups: Markup[],
  parent: DeviceMarkup,
  child: DeviceMarkup,
): { x: number; y: number } {
  return nestedBubblePoint(markups, parent, child);
}

export function nestedBubbleSize(child: DeviceMarkup): number {
  return Math.max(10, (child.size ?? 28) * NESTED_BUBBLE_SCALE);
}

export function nestedBubbleLabel(child: DeviceMarkup): string {
  const maxChars = 3;
  const catalog = devicesById[child.deviceId];
  const tag = child.tag?.trim().toUpperCase();
  if (tag) {
    const prefixedNumber = tag.match(/^([A-Z]+)[\s._-]*0*([0-9]+)$/);
    if (prefixedNumber) {
      const [, prefix, number] = prefixedNumber;
      const code = `${prefix}${number}`;
      if (code.length <= maxChars) return code;
      if (prefix.length <= maxChars) return prefix;
      return prefix.slice(0, maxChars);
    }

    const compact = tag.replace(/[^A-Z0-9]/g, "");
    if (compact.length <= maxChars) return compact;

    const trailingNumber = compact.match(/^([A-Z]+).*?0*([0-9]+)$/);
    if (trailingNumber) {
      const [, prefix, number] = trailingNumber;
      const code = `${prefix.slice(0, Math.max(1, maxChars - number.length))}${number}`;
      if (code.length <= maxChars) return code;
    }

    const leadingLetters = compact.match(/^[A-Z]+/)?.[0];
    if (leadingLetters) return leadingLetters.slice(0, maxChars);
    return compact.slice(0, maxChars);
  }

  const shortCode = catalog?.shortCode?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (shortCode) return shortCode.slice(0, maxChars);

  const initials = catalog?.label
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return initials ? initials.slice(0, maxChars) : "DEV";
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function nestedBubbleLabelColor(backgroundHex: string): "#0B1220" | "#FFFFFF" {
  const rgb = hexToRgb(backgroundHex);
  if (!rgb) return "#FFFFFF";
  return relativeLuminance(rgb) > 0.48 ? "#0B1220" : "#FFFFFF";
}

export function nestedBubblePoint(
  markups: Markup[],
  parent: DeviceMarkup,
  child: DeviceMarkup,
): { x: number; y: number } {
  const children = nestedChildren(markups, parent.id);
  const ordered = children.some((m) => m.id === child.id)
    ? children
    : [...children, child];
  const index = Math.max(0, ordered.findIndex((m) => m.id === child.id));
  const perColumn = 6;
  const row = index % perColumn;
  const col = Math.floor(index / perColumn);
  const rows = Math.min(perColumn, ordered.length);
  const parentRadius = (parent.size ?? 28) / 2;
  const bubbleSize = nestedBubbleSize(child);
  const bubbleRadius = bubbleSize / 2;
  const stepY = bubbleSize + 1.5;
  const stepX = bubbleSize + 2;
  return {
    x: parent.x + parentRadius + bubbleRadius - 1 + col * stepX,
    y: parent.y - ((rows - 1) * stepY) / 2 + row * stepY,
  };
}

export function rackDeviceIdForNestedDevice(child: DeviceMarkup): string | null {
  switch (child.deviceId) {
    case "net-switch-poe":
      return "sw-cat-24";
    case "net-switch-core":
      return "sw-core-2u";
    case "net-router":
      return "rtr-edge";
    case "net-nvr":
      return "nvr-16";
    case "net-ups":
      return "ups-1500";
    default:
      return null;
  }
}

export function nestedConnectionSummary(
  connections: DeviceConnection[] | undefined,
  tag: string,
): string {
  const t = tag.trim();
  if (!t) return "";
  return (connections ?? [])
    .filter((c) => c.fromTag === t || c.toTag === t)
    .map((c) => {
      const outbound = c.fromTag === t;
      const other = outbound ? c.toTag : c.fromTag;
      const port = outbound
        ? c.fromPort || c.fromPortId || c.toPort || c.toPortId
        : c.toPort || c.toPortId || c.fromPort || c.fromPortId;
      return port ? `${other} (${port})` : other;
    })
    .filter(Boolean)
    .join("; ");
}

export interface NestedScheduleItem {
  device: DeviceMarkup;
  deviceName: string;
  connectionSummary: string;
}

export function nestedScheduleTitle(parent: DeviceMarkup): string {
  return parent.nestedScheduleName?.trim() || deviceDisplayName(parent);
}

export function nestedScheduleItems(
  markups: Markup[],
  parentId: string,
  connections?: DeviceConnection[],
  maxItems = 6,
): NestedScheduleItem[] {
  return nestedChildren(markups, parentId)
    .slice(0, maxItems)
    .map((device) => ({
      device,
      deviceName: deviceDisplayName(device),
      connectionSummary: nestedConnectionSummary(connections, device.tag),
    }));
}

export function nestedScheduleLines(
  markups: Markup[],
  parentId: string,
  connections?: DeviceConnection[],
  maxLines = 5,
): string[] {
  const children = nestedChildren(markups, parentId);
  const lines = children.slice(0, maxLines).map((child) => {
    const connectionSummary = nestedConnectionSummary(connections, child.tag);
    return connectionSummary
      ? `${deviceDisplayName(child)} -> ${connectionSummary}`
      : deviceDisplayName(child);
  });
  if (children.length > maxLines) lines.push(`+ ${children.length - maxLines} more`);
  return lines;
}
