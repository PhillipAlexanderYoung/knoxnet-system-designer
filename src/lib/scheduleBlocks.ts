import { cablesById } from "../data/cables";
import { devicesById } from "../data/devices";
import type {
  CableMarkup,
  DeviceMarkup,
  Markup,
  Project,
  ScheduleBlockMode,
  ScheduleMarkup,
  ScheduleTargetKind,
  Sheet,
} from "../store/projectStore";
import {
  cableLengthBreakdown,
  routeSummariesForDevice,
  runCountFor,
} from "./cableRuns";
import { conduitLabelFor } from "./conduit";
import {
  connectionFromLabel,
  connectionToLabel,
} from "./connections";
import { formatFeetDecimal } from "./geometry";
import { connectedDevicesForSwitch } from "./networkConfig";
import {
  deviceDisplayName,
  isContainerDevice,
  nestedChildren,
  nestedConnectionSummary,
  nestedScheduleTitle,
} from "./nesting";

export interface ScheduleBlockContent {
  title: string;
  rows: string[];
  empty: boolean;
}

export interface ScheduleBlockSize {
  width: number;
  height: number;
  fontSize: number;
  lineHeight: number;
  maxRows: number;
}

const COMPACT_MAX_ROWS = 5;
const DETAILED_MAX_ROWS = 8;
const MIN_WIDTH = 112;
const MAX_WIDTH = 240;

export function existingScheduleBlockForTarget(
  markups: Markup[],
  targetId: string,
): ScheduleMarkup | undefined {
  return markups.find(
    (m): m is ScheduleMarkup => m.kind === "schedule" && m.targetId === targetId,
  );
}

export function inferScheduleTargetKind(target: Markup): ScheduleTargetKind | null {
  if (target.kind === "cable") return "cable";
  if (target.kind === "device") return isContainerDevice(target) ? "container" : "device";
  return null;
}

export function defaultSchedulePositionForTarget(
  target: Markup,
): { x: number; y: number } {
  if (target.kind === "cable" && target.points.length >= 2) {
    const mid = midpoint(target.points);
    return { x: mid.x + 18, y: mid.y + 18 };
  }
  if (target.kind === "device") {
    const size = target.size ?? 28;
    return { x: target.x + size / 2 + 18, y: target.y + size / 2 + 18 };
  }
  return { x: 80, y: 80 };
}

export function buildScheduleBlockMarkup(
  target: Markup,
  id = Math.random().toString(36).slice(2, 10),
): ScheduleMarkup | null {
  const targetKind = inferScheduleTargetKind(target);
  if (!targetKind) return null;
  const position = defaultSchedulePositionForTarget(target);
  return {
    id,
    kind: "schedule",
    layer: "annotation",
    targetId: target.id,
    targetKind,
    x: position.x,
    y: position.y,
    mode: "compact",
    preset: "auto",
    visible: true,
  };
}

export function scheduleBlockContent(
  project: Project,
  sheet: Sheet,
  block: ScheduleMarkup,
): ScheduleBlockContent {
  const target = sheet.markups.find((m) => m.id === block.targetId);
  const mode = block.mode ?? "compact";
  const maxRows = mode === "detailed" ? DETAILED_MAX_ROWS : COMPACT_MAX_ROWS;
  if (!target) {
    return {
      title: block.title?.trim() || "Schedule",
      rows: ["Target not found"],
      empty: true,
    };
  }

  if (target.kind === "cable") {
    return withCustomTitle(block, cableSchedule(project, sheet, target, maxRows));
  }
  if (target.kind === "device") {
    return withCustomTitle(block, deviceSchedule(project, sheet, target, maxRows, mode));
  }

  return {
    title: block.title?.trim() || "Schedule",
    rows: ["No schedule adapter"],
    empty: true,
  };
}

export function scheduleBlockSize(
  content: ScheduleBlockContent,
  mode: ScheduleBlockMode | undefined,
  measureText?: (text: string, fontSize: number) => number,
): ScheduleBlockSize {
  const detailed = mode === "detailed";
  const fontSize = detailed ? 7.4 : 6.8;
  const lineHeight = detailed ? 10.2 : 9.2;
  const maxRows = detailed ? DETAILED_MAX_ROWS : COMPACT_MAX_ROWS;
  const visibleRows = content.rows.slice(0, maxRows);
  const lines = [content.title, ...visibleRows];
  const textWidth = Math.max(
    ...lines.map((line) =>
      measureText ? measureText(line, fontSize) : line.length * fontSize * 0.56,
    ),
  );
  const width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, textWidth + 18));
  const height = 18 + visibleRows.length * lineHeight + 8;
  return { width, height, fontSize, lineHeight, maxRows };
}

export function scheduleRowsForDisplay(
  content: ScheduleBlockContent,
  maxRows: number,
): string[] {
  if (content.rows.length === 0) return ["No schedule data"];
  if (content.rows.length <= maxRows) return content.rows;
  const visible = content.rows.slice(0, Math.max(0, maxRows - 1));
  return [...visible, `+ ${content.rows.length - visible.length} more`];
}

function withCustomTitle(
  block: ScheduleMarkup,
  content: ScheduleBlockContent,
): ScheduleBlockContent {
  const title = block.title?.trim();
  return title ? { ...content, title } : content;
}

function deviceSchedule(
  project: Project,
  sheet: Sheet,
  device: DeviceMarkup,
  maxRows: number,
  mode: ScheduleBlockMode,
): ScheduleBlockContent {
  const switchRows = connectedDevicesForSwitch(project, device);
  if (switchRows.length > 0) {
    return {
      title: `${device.tag} Schedule`,
      rows: switchRows.slice(0, maxRows + 6).map(({ device: connected, switchPort, devicePort }) => {
        const net = connected.systemConfig?.network;
        return compactLine([
          switchPort || "Port",
          connected.tag,
          devicePort,
          net?.ipAddress,
          net?.vlan ? `VLAN ${net.vlan}` : undefined,
        ]);
      }),
      empty: false,
    };
  }

  const routing = routeSummariesForDevice(sheet, device);
  if (routing.length > 0) {
    return {
      title: `${deviceDisplayName(device)} Routing`,
      rows: routing.map(({ cable, role }) =>
        compactLine([
          role,
          cable.cableId === "conduit"
            ? conduitLabelFor(cable)
            : cablesById[cable.cableId]?.shortCode ?? cable.cableId,
          cable.endpointA && cable.endpointB
            ? `${cable.endpointA} to ${cable.endpointB}`
            : cable.endpointA ?? cable.endpointB,
        ]),
      ),
      empty: false,
    };
  }

  if (isContainerDevice(device)) {
    const children = nestedChildren(sheet.markups, device.id);
    return {
      title: nestedScheduleTitle(device),
      rows: children.map((child) =>
        compactLine([
          deviceDisplayName(child),
          nestedConnectionSummary(project.connections, child.tag),
        ]),
      ),
      empty: children.length === 0,
    };
  }

  const rows = genericDeviceRows(project, device, mode);
  return {
    title: `${deviceDisplayName(device)} Schedule`,
    rows,
    empty: rows.length === 0,
  };
}

function genericDeviceRows(
  project: Project,
  device: DeviceMarkup,
  mode: ScheduleBlockMode,
): string[] {
  const cfg = device.systemConfig ?? {};
  const net = cfg.network ?? {};
  const rows = [
    compactLine(["IP", net.ipAddress]),
    compactLine(["VLAN", net.vlan ? String(net.vlan) : undefined]),
    compactLine(["MAC", net.macAddress]),
    compactLine(["Switch Port", cfg.switchPort]),
    compactLine(["Cable", cfg.cableTag]),
    compactLine(["Model", [cfg.manufacturer, cfg.model].filter(Boolean).join(" ")]),
  ].filter(Boolean);

  const connectionRows = (project.connections ?? [])
    .filter(
      (conn) =>
        conn.fromTag === device.tag ||
        conn.toTag === device.tag ||
        conn.internalEndpoint?.deviceTag === device.tag,
    )
    .map((conn) => {
      if (conn.internalEndpoint?.deviceTag === device.tag) {
        const other = conn.fromTag === conn.internalEndpoint.containerTag ? conn.toTag : conn.fromTag;
        return compactLine(["Conn", other, conn.internalEndpoint.port ?? conn.internalEndpoint.portId]);
      }
      const fromHere = conn.fromTag === device.tag;
      const other = fromHere ? conn.toTag : conn.fromTag;
      const ownPort = fromHere ? connectionFromLabel(conn, project) : connectionToLabel(conn, project);
      return compactLine(["Conn", other, ownPort]);
    });

  return mode === "detailed" ? [...rows, ...connectionRows] : [...rows, ...connectionRows.slice(0, 2)];
}

function cableSchedule(
  project: Project,
  sheet: Sheet,
  cable: CableMarkup,
  maxRows: number,
): ScheduleBlockContent {
  const catalog = cablesById[cable.cableId];
  const length = cableLengthBreakdown(
    cable,
    sheet.calibration,
    project.bidDefaults?.slackPercent ?? 0,
  );
  const attachmentLabels = (cable.pointAttachments ?? [])
    .map((a) => a?.label || a?.deviceTag)
    .filter(Boolean) as string[];
  const endpoints = [cable.endpointA, cable.endpointB].filter(Boolean).join(" to ");
  const served = cable.servedDevices?.filter(Boolean).join(", ");
  const rows = [
    compactLine(["Label", cable.physicalLabel || cable.label || cable.id]),
    compactLine([
      "Type",
      cable.cableId === "conduit"
        ? conduitLabelFor(cable)
        : catalog?.label ?? cable.cableId,
    ]),
    compactLine(["Count", String(runCountFor(cable))]),
    compactLine([
      "Length",
      length ? formatFeetDecimal(length.totalWithSlackFt, 1) : undefined,
    ]),
    compactLine(["Ends", endpoints || undefined]),
    compactLine(["Serves", served || attachmentLabels.join(", ")]),
    compactLine(["Connector", cable.connector]),
  ].filter(Boolean);

  return {
    title: `${cable.physicalLabel || catalog?.shortCode || "Cable"} Schedule`,
    rows: rows.slice(0, maxRows + 6),
    empty: rows.length === 0,
  };
}

function compactLine(parts: Array<string | number | undefined | null | false>): string {
  return parts
    .map((part) => (part === undefined || part === null || part === false ? "" : String(part).trim()))
    .filter(Boolean)
    .join("  ");
}

function midpoint(points: number[]): { x: number; y: number } {
  if (points.length < 2) return { x: 80, y: 80 };
  let minX = points[0];
  let maxX = points[0];
  let minY = points[1];
  let maxY = points[1];
  for (let i = 0; i + 1 < points.length; i += 2) {
    minX = Math.min(minX, points[i]);
    maxX = Math.max(maxX, points[i]);
    minY = Math.min(minY, points[i + 1]);
    maxY = Math.max(maxY, points[i + 1]);
  }
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}
