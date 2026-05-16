import type {
  CableMarkup,
  DeviceConnection,
  DeviceMarkup,
  Project,
  RackPlacement,
} from "../store/projectStore";
import { normalizeIdentifier } from "./cableLabels";
import {
  connectionFromLabel,
  connectionToLabel,
  internalEndpointPortLabel,
} from "./connections";
import { isContainerDevice, nestedScheduleTitle } from "./nesting";

export type ValidationSeverity = "warning" | "error";
export type ValidationScope =
  | "cable"
  | "device"
  | "connection"
  | "rack"
  | "sheet"
  | "project";

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  scope: ValidationScope;
  field: string;
  message: string;
  value?: string;
  entityIds: string[];
  sheetId?: string;
}

interface DuplicateCandidate {
  id: string;
  label: string;
  sheetId?: string;
}

export function validateProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const cables: DuplicateCandidate[] = [];
  const deviceTags: DuplicateCandidate[] = [];
  const deviceLabels: DuplicateCandidate[] = [];
  const ips: DuplicateCandidate[] = [];
  const macs: DuplicateCandidate[] = [];
  const hostnames: DuplicateCandidate[] = [];
  const serials: DuplicateCandidate[] = [];
  const assetTags: DuplicateCandidate[] = [];
  const cableTags: DuplicateCandidate[] = [];
  const switchPortText: DuplicateCandidate[] = [];
  const schedules: DuplicateCandidate[] = [];

  for (const sheet of project.sheets) {
    for (const markup of sheet.markups) {
      if (markup.kind === "cable") {
        pushIfValue(cables, markup.physicalLabel, markup.id, sheet.id);
        continue;
      }
      if (markup.kind !== "device") continue;
      const device = markup as DeviceMarkup;
      pushIfValue(deviceTags, device.tag, device.id, sheet.id);
      pushIfValue(deviceLabels, device.labelOverride, device.id, sheet.id);
      pushIfValue(ips, device.systemConfig?.network?.ipAddress, device.id, sheet.id);
      pushIfValue(macs, device.systemConfig?.network?.macAddress, device.id, sheet.id);
      pushIfValue(hostnames, device.systemConfig?.network?.hostname, device.id, sheet.id);
      pushIfValue(serials, device.systemConfig?.serialNumber, device.id, sheet.id);
      pushIfValue(assetTags, device.systemConfig?.assetTag, device.id, sheet.id);
      pushIfValue(cableTags, device.systemConfig?.cableTag, device.id, sheet.id);
      pushIfValue(switchPortText, device.systemConfig?.switchPort, device.id, sheet.id);
      if (isContainerDevice(device)) {
        pushIfValue(schedules, nestedScheduleTitle(device), device.id, sheet.id);
      }
    }
  }

  addDuplicateIssues(issues, {
    candidates: cables,
    scope: "cable",
    field: "physicalLabel",
    idPrefix: "duplicate-cable-label",
    message: (value, count) =>
      `Duplicate cable physical label "${value}" is used by ${count} runs.`,
  });
  addDuplicateIssues(issues, {
    candidates: deviceTags,
    scope: "device",
    field: "tag",
    idPrefix: "duplicate-device-tag",
    message: (value, count) => `Duplicate device tag "${value}" is used by ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: deviceLabels,
    scope: "device",
    field: "labelOverride",
    idPrefix: "duplicate-device-label",
    message: (value, count) =>
      `Duplicate device display label "${value}" is used by ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: ips,
    scope: "device",
    field: "systemConfig.network.ipAddress",
    idPrefix: "duplicate-ip",
    message: (value, count) => `Duplicate IP address "${value}" is assigned to ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: macs,
    scope: "device",
    field: "systemConfig.network.macAddress",
    idPrefix: "duplicate-mac",
    message: (value, count) => `Duplicate MAC address "${value}" is assigned to ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: hostnames,
    scope: "device",
    field: "systemConfig.network.hostname",
    idPrefix: "duplicate-hostname",
    message: (value, count) => `Duplicate hostname "${value}" is assigned to ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: serials,
    scope: "device",
    field: "systemConfig.serialNumber",
    idPrefix: "duplicate-serial",
    message: (value, count) => `Duplicate serial number "${value}" is assigned to ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: assetTags,
    scope: "device",
    field: "systemConfig.assetTag",
    idPrefix: "duplicate-asset-tag",
    message: (value, count) => `Duplicate asset tag "${value}" is assigned to ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: cableTags,
    scope: "device",
    field: "systemConfig.cableTag",
    idPrefix: "duplicate-device-cable-tag",
    message: (value, count) => `Duplicate device cable tag "${value}" is used by ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: switchPortText,
    scope: "device",
    field: "systemConfig.switchPort",
    idPrefix: "duplicate-switch-port-text",
    message: (value, count) =>
      `Duplicate switch port assignment "${value}" is used by ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: schedules,
    scope: "device",
    field: "nestedScheduleName",
    idPrefix: "duplicate-container-schedule",
    message: (value, count) =>
      `Duplicate rack/container schedule name "${value}" is used by ${count} containers.`,
  });

  addDuplicateRackIssues(project, issues);
  addDuplicateConnectionPortIssues(project, issues);
  return issues;
}

export function validationIssuesForEntity(
  project: Project,
  entityId: string,
): ValidationIssue[] {
  return validateProject(project).filter((issue) => issue.entityIds.includes(entityId));
}

export function validationWarningsForEntity(project: Project, entityId: string): string {
  return validationWarningsByEntity(project).get(entityId) ?? "";
}

export function validationWarningsByEntity(project: Project): Map<string, string> {
  const warnings = new Map<string, string[]>();
  for (const issue of validateProject(project)) {
    for (const entityId of issue.entityIds) {
      const existing = warnings.get(entityId) ?? [];
      existing.push(issue.message);
      warnings.set(entityId, existing);
    }
  }
  return new Map(
    Array.from(warnings.entries()).map(([entityId, messages]) => [
      entityId,
      messages.join("; "),
    ]),
  );
}

function addDuplicateRackIssues(project: Project, issues: ValidationIssue[]) {
  addDuplicateIssues(issues, {
    candidates: (project.racks ?? []).map((rack) => ({
      id: rack.id,
      label: rack.name,
    })),
    scope: "rack",
    field: "name",
    idPrefix: "duplicate-rack-name",
    message: (value, count) => `Duplicate rack name "${value}" is used by ${count} racks.`,
  });

  const placementLabels: DuplicateCandidate[] = [];
  for (const rack of project.racks ?? []) {
    for (const placement of rack.placements) {
      pushRackPlacementLabel(placementLabels, rack.id, placement);
    }
  }
  addDuplicateIssues(issues, {
    candidates: placementLabels,
    scope: "rack",
    field: "placements.label",
    idPrefix: "duplicate-rack-placement-label",
    message: (value, count) =>
      `Duplicate rack placement label "${value}" is used by ${count} rack devices.`,
  });
}

function addDuplicateConnectionPortIssues(project: Project, issues: ValidationIssue[]) {
  const portAssignments: DuplicateCandidate[] = [];
  for (const conn of project.connections ?? []) {
    pushConnectionPort(project, portAssignments, conn, "from");
    pushConnectionPort(project, portAssignments, conn, "to");
    pushInternalConnectionPort(project, portAssignments, conn);
  }
  addDuplicateIssues(issues, {
    candidates: portAssignments,
    scope: "connection",
    field: "port",
    idPrefix: "duplicate-connection-port",
    message: (value, count) =>
      `Duplicate port assignment "${value}" appears on ${count} connections.`,
  });
}

function pushConnectionPort(
  project: Project,
  candidates: DuplicateCandidate[],
  conn: DeviceConnection,
  side: "from" | "to",
) {
  const tag = side === "from" ? conn.fromTag : conn.toTag;
  const port = side === "from" ? connectionFromLabel(conn, project) : connectionToLabel(conn, project);
  if (!tag?.trim() || !port?.trim()) return;
  candidates.push({
    id: conn.id,
    label: `${tag.trim()} ${port.trim()}`,
  });
}

function pushInternalConnectionPort(
  project: Project,
  candidates: DuplicateCandidate[],
  conn: DeviceConnection,
) {
  const endpoint = conn.internalEndpoint;
  const port = internalEndpointPortLabel(conn, project);
  const device = endpoint?.deviceTag ?? endpoint?.deviceId;
  if (!device?.trim() || !port?.trim()) return;
  candidates.push({
    id: conn.id,
    label: `${device.trim()} ${port.trim()}`,
  });
}

function pushRackPlacementLabel(
  candidates: DuplicateCandidate[],
  rackId: string,
  placement: RackPlacement,
) {
  if (!placement.label?.trim()) return;
  candidates.push({
    id: placement.id,
    label: `${rackId} ${placement.label.trim()}`,
  });
}

function pushIfValue(
  candidates: DuplicateCandidate[],
  value: string | undefined,
  id: string,
  sheetId?: string,
) {
  if (!value?.trim()) return;
  candidates.push({ id, label: value.trim(), sheetId });
}

function addDuplicateIssues(
  issues: ValidationIssue[],
  options: {
    candidates: DuplicateCandidate[];
    scope: ValidationScope;
    field: string;
    idPrefix: string;
    message: (value: string, count: number) => string;
  },
) {
  const groups = new Map<string, DuplicateCandidate[]>();
  for (const candidate of options.candidates) {
    const key = normalizeIdentifier(candidate.label);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    issues.push({
      id: `${options.idPrefix}:${key}`,
      severity: "warning",
      scope: options.scope,
      field: options.field,
      value: group[0].label,
      message: options.message(group[0].label, group.length),
      entityIds: group.map((candidate) => candidate.id),
      sheetId: group[0].sheetId,
    });
  }
}
