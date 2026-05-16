import type {
  CableMarkup,
  DeviceConnection,
  DeviceMarkup,
  DeviceSystemConfig,
  Markup,
  Project,
  RackPlacement,
} from "../store/projectStore";
import { normalizeIdentifier } from "./cableLabels";
import {
  buildSwitchPortAssignmentPatches,
  connectionFromLabel,
  connectionToLabel,
  findDeviceById,
  findDeviceByTag,
  internalEndpointPortLabel,
  withAutoAssignedConnectionPorts,
} from "./connections";
import {
  isRouteInfrastructureDevice,
  terminalCableRunEndpoints,
} from "./cableRuns";
import { isSwitchLikeDevice } from "./networkConfig";
import { isContainerDevice, nestedScheduleTitle } from "./nesting";

export type ValidationSeverity = "warning" | "error";
export type ValidationScope =
  | "cable"
  | "device"
  | "connection"
  | "rack"
  | "sheet"
  | "project";

export type ValidationIssueCode =
  | "duplicate-value"
  | "duplicate-switch-port-text"
  | "duplicate-connection-port"
  | "unlinked-switch-port-note"
  | "ghost-connection"
  | "dead-cable-run"
  | "duplicate-run"
  | "route-infrastructure-port-assignment";

export type ValidationResolverKind =
  | "reassign-duplicate-port"
  | "clear-stale-switch-port-text"
  | "remove-ghost-connection"
  | "clear-stale-cable-link"
  | "clear-stale-run-attachment"
  | "clear-stale-cable-attachments"
  | "remove-duplicate-connection"
  | "move-route-infrastructure-port-assignment";

export interface ValidationAffectedPort {
  connectionId?: string;
  deviceId?: string;
  deviceTag?: string;
  portId?: string;
  portLabel?: string;
  side?: "from" | "to" | "internal" | "system";
}

export interface ValidationAffectedEntities {
  markupIds: string[];
  deviceIds: string[];
  cableMarkupIds: string[];
  connectionIds: string[];
  rackIds: string[];
  ports?: ValidationAffectedPort[];
  labels?: string[];
}

export interface ValidationResolverMetadata {
  kind: ValidationResolverKind;
  label: string;
  description: string;
  destructive?: boolean;
  options?: ValidationResolverOption[];
}

export interface ValidationResolverOption {
  id: string;
  kind: ValidationResolverKind;
  label: string;
  description: string;
  destructive?: boolean;
}

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  scope: ValidationScope;
  code: ValidationIssueCode;
  field: string;
  message: string;
  value?: string;
  entityIds: string[];
  sheetId?: string;
  affected: ValidationAffectedEntities;
  details?: string[];
  resolver?: ValidationResolverMetadata;
}

export interface ValidationResolveResult {
  project: Project;
  resolved: boolean;
  message: string;
  affectedMarkupIds: string[];
}

export interface ValidationPortConflict {
  portLabel: string;
  issueIds: string[];
  connectionIds: string[];
  deviceTags: string[];
  details: string[];
}

interface DuplicateCandidate {
  id: string;
  label?: string;
  sheetId?: string;
  markupId?: string;
  deviceId?: string;
  cableMarkupId?: string;
  connectionId?: string;
  rackId?: string;
  port?: ValidationAffectedPort;
  detail?: string;
}

interface ProjectIndex {
  markupsById: Map<string, Markup>;
  devicesById: Map<string, DeviceMarkup>;
  devicesByTag: Map<string, DeviceMarkup>;
  cablesById: Map<string, CableMarkup>;
  sheetsByMarkupId: Map<string, string>;
}

const EMPTY_AFFECTED: ValidationAffectedEntities = {
  markupIds: [],
  deviceIds: [],
  cableMarkupIds: [],
  connectionIds: [],
  rackIds: [],
};

export function validateProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const index = buildProjectIndex(project);
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
        pushIfValue(cables, markup.physicalLabel, markup.id, sheet.id, {
          markupId: markup.id,
          cableMarkupId: markup.id,
          detail: labelDetail("Cable run", markup.physicalLabel, markup.id),
        });
        continue;
      }
      if (markup.kind !== "device") continue;
      const device = markup as DeviceMarkup;
      const deviceMeta = {
        markupId: device.id,
        deviceId: device.id,
        detail: deviceDetail(device),
      };
      pushIfValue(deviceTags, device.tag, device.id, sheet.id, deviceMeta);
      pushIfValue(deviceLabels, device.labelOverride, device.id, sheet.id, deviceMeta);
      pushIfValue(ips, device.systemConfig?.network?.ipAddress, device.id, sheet.id, deviceMeta);
      pushIfValue(macs, device.systemConfig?.network?.macAddress, device.id, sheet.id, deviceMeta);
      pushIfValue(hostnames, device.systemConfig?.network?.hostname, device.id, sheet.id, deviceMeta);
      pushIfValue(serials, device.systemConfig?.serialNumber, device.id, sheet.id, deviceMeta);
      pushIfValue(assetTags, device.systemConfig?.assetTag, device.id, sheet.id, deviceMeta);
      pushIfValue(cableTags, device.systemConfig?.cableTag, device.id, sheet.id, deviceMeta);
      pushIfValue(switchPortText, device.systemConfig?.switchPort, device.id, sheet.id, {
        ...deviceMeta,
        port: {
          deviceId: device.id,
          deviceTag: device.tag,
          portLabel: device.systemConfig?.switchPort,
          side: "system",
        },
      });
      if (isContainerDevice(device)) {
        pushIfValue(schedules, nestedScheduleTitle(device), device.id, sheet.id, deviceMeta);
      }
    }
  }

  addDuplicateIssues(issues, {
    candidates: cables,
    scope: "cable",
    field: "physicalLabel",
    idPrefix: "duplicate-cable-label",
    code: "duplicate-value",
    message: (value, count) =>
      `Duplicate cable physical label "${value}" is used by ${count} runs.`,
  });
  addDuplicateIssues(issues, {
    candidates: deviceTags,
    scope: "device",
    field: "tag",
    idPrefix: "duplicate-device-tag",
    code: "duplicate-value",
    message: (value, count) => `Duplicate device tag "${value}" is used by ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: deviceLabels,
    scope: "device",
    field: "labelOverride",
    idPrefix: "duplicate-device-label",
    code: "duplicate-value",
    message: (value, count) =>
      `Duplicate device display label "${value}" is used by ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: ips,
    scope: "device",
    field: "systemConfig.network.ipAddress",
    idPrefix: "duplicate-ip",
    code: "duplicate-value",
    message: (value, count) => `Duplicate IP address "${value}" is assigned to ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: macs,
    scope: "device",
    field: "systemConfig.network.macAddress",
    idPrefix: "duplicate-mac",
    code: "duplicate-value",
    message: (value, count) => `Duplicate MAC address "${value}" is assigned to ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: hostnames,
    scope: "device",
    field: "systemConfig.network.hostname",
    idPrefix: "duplicate-hostname",
    code: "duplicate-value",
    message: (value, count) => `Duplicate hostname "${value}" is assigned to ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: serials,
    scope: "device",
    field: "systemConfig.serialNumber",
    idPrefix: "duplicate-serial",
    code: "duplicate-value",
    message: (value, count) => `Duplicate serial number "${value}" is assigned to ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: assetTags,
    scope: "device",
    field: "systemConfig.assetTag",
    idPrefix: "duplicate-asset-tag",
    code: "duplicate-value",
    message: (value, count) => `Duplicate asset tag "${value}" is assigned to ${count} devices.`,
  });
  addDuplicateIssues(issues, {
    candidates: cableTags,
    scope: "device",
    field: "systemConfig.cableTag",
    idPrefix: "duplicate-device-cable-tag",
    code: "duplicate-value",
    message: (value, count) => `Duplicate device cable tag "${value}" is used by ${count} devices.`,
  });
  addUnlinkedSwitchPortTextIssues(project, issues, index, switchPortText);
  addDuplicateIssues(issues, {
    candidates: schedules,
    scope: "device",
    field: "nestedScheduleName",
    idPrefix: "duplicate-container-schedule",
    code: "duplicate-value",
    message: (value, count) =>
      `Duplicate rack/container schedule name "${value}" is used by ${count} containers.`,
  });

  addDuplicateRackIssues(project, issues);
  addDuplicateConnectionPortIssues(project, issues, index);
  addRouteInfrastructurePortAssignmentIssues(project, issues, index);
  addGhostConnectionIssues(project, issues, index);
  addDeadCableRunIssues(project, issues, index);
  addDuplicateRunIssues(project, issues, index);
  return issues;
}

export function validationIssuesForEntity(
  project: Project,
  entityId: string,
): ValidationIssue[] {
  return validateProject(project).filter(
    (issue) =>
      issue.entityIds.includes(entityId) ||
      issue.affected.markupIds.includes(entityId) ||
      issue.affected.connectionIds.includes(entityId) ||
      issue.affected.cableMarkupIds.includes(entityId),
  );
}

export function validationWarningsForEntity(project: Project, entityId: string): string {
  return validationWarningsByEntity(project).get(entityId) ?? "";
}

export function validationWarningsByEntity(project: Project): Map<string, string> {
  const warnings = new Map<string, string[]>();
  for (const issue of validateProject(project)) {
    const ids = new Set([...issue.entityIds, ...issue.affected.markupIds]);
    for (const entityId of ids) {
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

export function validationMarkupIdsForIssues(issues: ValidationIssue[]): string[] {
  return Array.from(new Set(issues.flatMap((issue) => issue.affected.markupIds)));
}

export function resolveValidationIssue(
  project: Project,
  issueId: string,
  optionId?: string,
): ValidationResolveResult {
  const issue = validateProject(project).find((candidate) => candidate.id === issueId);
  if (!issue?.resolver) {
    return {
      project,
      resolved: false,
      message: "This validation warning needs manual review.",
      affectedMarkupIds: issue ? validationMarkupIdsForIssues([issue]) : [],
    };
  }

  const resolverKind =
    issue.resolver.options?.find((option) => option.id === optionId)?.kind ?? issue.resolver.kind;

  switch (resolverKind) {
    case "reassign-duplicate-port":
      return resolveDuplicateConnectionPort(project, issue);
    case "clear-stale-switch-port-text":
      return resolveByClearingStaleSwitchPortText(project, issue);
    case "remove-ghost-connection":
      return resolveByRemovingConnections(project, issue, "Removed ghost connection.");
    case "clear-stale-cable-link":
      return resolveByClearingConnectionCableLinks(project, issue);
    case "clear-stale-run-attachment":
      return resolveByClearingDeviceRunAttachments(project, issue);
    case "clear-stale-cable-attachments":
      return resolveByClearingCableAttachments(project, issue);
    case "remove-duplicate-connection":
      return resolveByRemovingConnections(project, issue, "Removed duplicate connection.");
    case "move-route-infrastructure-port-assignment":
      return resolveRouteInfrastructurePortAssignment(project, issue);
  }
}

export function resolveValidationIssues(
  project: Project,
  issueIds: string[],
): ValidationResolveResult {
  let nextProject = project;
  const affected = new Set<string>();
  let resolvedCount = 0;
  for (const issueId of issueIds) {
    const result = resolveValidationIssue(nextProject, issueId);
    for (const id of result.affectedMarkupIds) affected.add(id);
    if (!result.resolved || result.project === nextProject) continue;
    nextProject = result.project;
    resolvedCount += 1;
  }
  return {
    project: nextProject,
    resolved: resolvedCount > 0,
    message:
      resolvedCount === 0
        ? "No safe validation cleanup was found."
        : `Cleared ${resolvedCount} safe validation reference${resolvedCount === 1 ? "" : "s"}.`,
    affectedMarkupIds: Array.from(affected),
  };
}

export function validationPortConflictsForDevice(
  project: Project,
  device: DeviceMarkup,
): ValidationPortConflict[] {
  const conflicts = new Map<string, ValidationPortConflict>();
  for (const issue of validateProject(project)) {
    if (issue.code !== "duplicate-connection-port") continue;
    for (const port of issue.affected.ports ?? []) {
      if (port.deviceTag !== device.tag || !port.portLabel?.trim()) continue;
      const key = normalizeIdentifier(port.portLabel);
      const existing =
        conflicts.get(key) ?? {
          portLabel: port.portLabel,
          issueIds: [],
          connectionIds: [],
          deviceTags: [],
          details: [],
        };
      existing.issueIds = unique([...existing.issueIds, issue.id]);
      existing.connectionIds = unique([
        ...existing.connectionIds,
        ...(port.connectionId ? [port.connectionId] : []),
      ]);
      existing.deviceTags = unique([
        ...existing.deviceTags,
        ...connectionPeerTags(project, device.tag, issue.affected.connectionIds),
      ]);
      existing.details = unique([...existing.details, issue.message, ...(issue.details ?? [])]);
      conflicts.set(key, existing);
    }
  }
  return Array.from(conflicts.values());
}

export function safeDeadReferenceIssueIds(issues: ValidationIssue[]): string[] {
  return issues
    .filter((issue) => {
      const kind = issue.resolver?.kind;
      return (
        issue.code === "dead-cable-run" &&
        (kind === "clear-stale-cable-attachments" || kind === "clear-stale-run-attachment")
      ) || kind === "clear-stale-cable-link";
    })
    .map((issue) => issue.id);
}

function duplicatePortResolver(
  project: Project,
  group: DuplicateCandidate[],
): ValidationResolverMetadata | undefined {
  const deviceTag = group.find((candidate) => candidate.port?.deviceTag)?.port?.deviceTag;
  const device = deviceTag ? findDeviceByTag(project, deviceTag) : undefined;
  if (!device) return undefined;

  const result = buildSwitchPortAssignmentPatches(project, device);
  const moves = Object.entries(result.patches).flatMap(([connectionId, patch]) => {
    const connection = (project.connections ?? []).find((candidate) => candidate.id === connectionId);
    if (!connection) return [];
    const nextPort =
      connection.fromTag === device.tag
        ? patch.fromPort
        : connection.toTag === device.tag
          ? patch.toPort
          : patch.internalEndpoint?.port;
    const peerTag = connectionPeerTag(connection, device.tag);
    return nextPort ? [{ connectionId, peerTag, nextPort }] : [];
  });

  const firstMove = moves[0];
  const label = firstMove
    ? moves.length === 1
      ? `Move ${firstMove.peerTag || firstMove.connectionId} to ${device.tag} ${firstMove.nextPort}`
      : `Move ${moves.length} connections to free ${device.tag} ports`
    : `Move duplicate off ${device.tag} ${group[0].port?.portLabel ?? "port"}`;

  return {
    kind: "reassign-duplicate-port",
    label,
    description: firstMove
      ? "Move duplicated switch-port assignments to the next compatible free ports."
      : "Try to move one duplicated connection to the next compatible free port.",
    options: [
      {
        id: "move-to-free-port",
        kind: "reassign-duplicate-port",
        label,
        description: "Keep the connections and move the duplicate endpoint to a free compatible switch port.",
      },
    ],
  };
}

function addUnlinkedSwitchPortTextIssues(
  project: Project,
  issues: ValidationIssue[],
  index: ProjectIndex,
  candidates: DuplicateCandidate[],
) {
  const groups = new Map<string, DuplicateCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.label) continue;
    const key = normalizeIdentifier(candidate.label);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }

  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const stale = group.filter(
      (candidate) => !isSwitchPortTextBackedByConnection(project, index, candidate),
    );
    if (stale.length === 0) continue;
    const value = group[0].label ?? key;
    const affected = affectedFromCandidates(stale);
    issues.push({
      id: `unlinked-switch-port-note:${issueKey(key)}`,
      severity: "warning",
      scope: "device",
      code: "unlinked-switch-port-note",
      field: "systemConfig.switchPort",
      value,
      message: `Unlinked switch port note "${value}" is present on ${stale.length} device${stale.length === 1 ? "" : "s"} without a matching current connection.`,
      entityIds: unique(stale.map((candidate) => candidate.id)),
      sheetId: stale[0].sheetId,
      affected,
      details: stale.map((candidate) => `${candidate.detail ?? candidate.id}: no current connection assigns ${value}.`),
      resolver: {
        kind: "clear-stale-switch-port-text",
        label: `Clear stale switch port text from ${candidateDeviceList(stale, index)}`,
        description: "Remove only the legacy switch-port text that is not backed by the current connection graph.",
      },
    });
  }
}

function isSwitchPortTextBackedByConnection(
  project: Project,
  index: ProjectIndex,
  candidate: DuplicateCandidate,
): boolean {
  const device = candidate.deviceId ? index.devicesById.get(candidate.deviceId) : undefined;
  const textKey = normalizeIdentifier(candidate.label);
  if (!device || !textKey) return false;
  return currentSwitchPortTextLabels(project, device.tag).some(
    (label) => normalizeIdentifier(label) === textKey,
  );
}

function currentSwitchPortTextLabels(project: Project, deviceTag: string): string[] {
  const labels: string[] = [];
  for (const conn of project.connections ?? []) {
    if (conn.fromTag === deviceTag) {
      pushSwitchPortTextLabel(labels, conn.toTag, connectionToLabel(conn, project));
    }
    if (conn.toTag === deviceTag) {
      pushSwitchPortTextLabel(labels, conn.fromTag, connectionFromLabel(conn, project));
    }

    const endpoint = conn.internalEndpoint;
    if (!endpoint) continue;
    const otherTag = conn.fromTag === endpoint.containerTag ? conn.toTag : conn.fromTag;
    if (otherTag === deviceTag) {
      pushSwitchPortTextLabel(labels, endpoint.deviceTag, internalEndpointPortLabel(conn, project));
    }
  }
  return labels;
}

function pushSwitchPortTextLabel(labels: string[], tag: string | undefined, port: string | undefined) {
  if (!tag?.trim() || !port?.trim()) return;
  labels.push(`${tag.trim()} ${port.trim()}`);
}

function candidateDeviceList(candidates: DuplicateCandidate[], index: ProjectIndex): string {
  const tags = candidates.map((candidate) => {
    const device = candidate.deviceId ? index.devicesById.get(candidate.deviceId) : undefined;
    return device?.tag || candidate.id;
  });
  if (tags.length <= 3) return tags.join(" and ");
  return `${tags.slice(0, 3).join(", ")} and ${tags.length - 3} more`;
}

function addDuplicateRackIssues(project: Project, issues: ValidationIssue[]) {
  addDuplicateIssues(issues, {
    candidates: (project.racks ?? []).map((rack) => ({
      id: rack.id,
      label: rack.name,
      rackId: rack.id,
      detail: `Rack ${rack.name || rack.id}`,
    })),
    scope: "rack",
    field: "name",
    idPrefix: "duplicate-rack-name",
    code: "duplicate-value",
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
    code: "duplicate-value",
    message: (value, count) =>
      `Duplicate rack placement label "${value}" is used by ${count} rack devices.`,
  });
}

function addDuplicateConnectionPortIssues(
  project: Project,
  issues: ValidationIssue[],
  index: ProjectIndex,
) {
  const portAssignments: DuplicateCandidate[] = [];
  for (const conn of project.connections ?? []) {
    pushConnectionPort(project, index, portAssignments, conn, "from");
    pushConnectionPort(project, index, portAssignments, conn, "to");
    pushInternalConnectionPort(project, index, portAssignments, conn);
  }
  addDuplicateIssues(issues, {
    candidates: portAssignments,
    scope: "connection",
    field: "port",
    idPrefix: "duplicate-connection-port",
    code: "duplicate-connection-port",
    message: (value, count) =>
      `Duplicate port assignment "${value}" appears on ${count} connections.`,
    resolverForGroup: (group) => duplicatePortResolver(project, group),
  });
}

interface RouteInfrastructurePortRepair {
  connection: DeviceConnection;
  side: "from" | "to";
  infrastructure: DeviceMarkup;
  target: DeviceMarkup;
  cable: CableMarkup;
}

function addRouteInfrastructurePortAssignmentIssues(
  project: Project,
  issues: ValidationIssue[],
  index: ProjectIndex,
) {
  for (const conn of project.connections ?? []) {
    const repair = routeInfrastructurePortRepair(project, index, conn);
    if (!repair) continue;
    const affected = affectedFromCandidates([
      {
        id: conn.id,
        connectionId: conn.id,
        markupId: repair.cable.id,
        cableMarkupId: repair.cable.id,
      },
      {
        id: repair.infrastructure.id,
        markupId: repair.infrastructure.id,
        deviceId: repair.infrastructure.id,
      },
      {
        id: repair.target.id,
        markupId: repair.target.id,
        deviceId: repair.target.id,
      },
    ]);
    issues.push({
      id: `route-infrastructure-port-assignment:${conn.id}:${repair.side}`,
      severity: "warning",
      scope: "connection",
      code: "route-infrastructure-port-assignment",
      field: `connections.${repair.side}Tag`,
      value: repair.infrastructure.tag,
      message: `Connection "${conn.id}" assigns a switch endpoint to route infrastructure ${repair.infrastructure.tag}; linked run continues to ${repair.target.tag}.`,
      entityIds: [conn.id, repair.infrastructure.id, repair.target.id, repair.cable.id],
      sheetId: index.sheetsByMarkupId.get(repair.cable.id),
      affected,
      details: [
        `${repair.infrastructure.tag} is a pass-through route waypoint, not the terminal connected device.`,
        `Move the ${repair.side} endpoint to ${repair.target.tag}.`,
      ],
      resolver: {
        kind: "move-route-infrastructure-port-assignment",
        label: `Move switch assignment from ${repair.infrastructure.tag} to ${repair.target.tag}`,
        description: "Keep the linked cable run and move the logical connection endpoint to the clear terminal device.",
      },
    });
  }
}

function routeInfrastructurePortRepair(
  project: Project,
  index: ProjectIndex,
  conn: DeviceConnection,
): RouteInfrastructurePortRepair | undefined {
  const cable = conn.cableMarkupId ? index.cablesById.get(conn.cableMarkupId) : undefined;
  if (!cable?.pointAttachments?.length) return undefined;
  const terminals = routeTerminalAttachmentTags(cable, index);

  for (const side of ["from", "to"] as const) {
    const infraTag = side === "from" ? conn.fromTag : conn.toTag;
    const otherTag = side === "from" ? conn.toTag : conn.fromTag;
    const infrastructure = index.devicesByTag.get(infraTag);
    if (!infrastructure || !isRouteInfrastructureDevice(infrastructure)) continue;

    const candidates = terminals.filter(
      (tag) => tag !== infraTag && tag !== otherTag && index.devicesByTag.has(tag),
    );
    if (candidates.length !== 1) continue;
    if (!terminals.includes(otherTag)) continue;

    const target = index.devicesByTag.get(candidates[0]);
    if (!target || isRouteInfrastructureDevice(target)) continue;
    return { connection: conn, side, infrastructure, target, cable };
  }
  return undefined;
}

function routeTerminalAttachmentTags(cable: CableMarkup, index: ProjectIndex): string[] {
  const tags: string[] = [];
  for (const attachment of cable.pointAttachments ?? []) {
    if (!attachment?.deviceTag?.trim()) continue;
    const device =
      (attachment.deviceMarkupId ? index.devicesById.get(attachment.deviceMarkupId) : undefined) ??
      index.devicesByTag.get(attachment.deviceTag);
    if (device ? isRouteInfrastructureDevice(device) : attachment.routeWaypoint === true) {
      continue;
    }
    if (terminalCableRunEndpoints([attachment]).length === 0 && !device) continue;
    tags.push(attachment.deviceTag.trim());
  }
  return unique(tags);
}

function addGhostConnectionIssues(
  project: Project,
  issues: ValidationIssue[],
  index: ProjectIndex,
) {
  for (const conn of project.connections ?? []) {
    const from = index.devicesByTag.get(conn.fromTag);
    const to = index.devicesByTag.get(conn.toTag);
    const cable = conn.cableMarkupId ? index.cablesById.get(conn.cableMarkupId) : undefined;
    const endpoint = conn.internalEndpoint;
    const internalContainer = endpoint
      ? index.devicesById.get(endpoint.containerId) ?? index.devicesByTag.get(endpoint.containerTag)
      : undefined;
    const internalDevice = endpoint
      ? index.devicesById.get(endpoint.deviceId) ?? index.devicesByTag.get(endpoint.deviceTag)
      : undefined;
    const details: string[] = [];
    if (!from) details.push(`Missing source device tag ${conn.fromTag}.`);
    if (!to) details.push(`Missing destination device tag ${conn.toTag}.`);
    if (conn.cableMarkupId && !cable) details.push(`Missing linked cable run ${conn.cableMarkupId}.`);
    if (endpoint && !internalContainer) details.push(`Missing internal container ${endpoint.containerTag}.`);
    if (endpoint && !internalDevice) details.push(`Missing internal endpoint device ${endpoint.deviceTag}.`);
    if (details.length === 0) continue;

    const affected = affectedFromCandidates([
      {
        id: conn.id,
        connectionId: conn.id,
        cableMarkupId: cable?.id,
        markupId: cable?.id,
      },
      from ? { id: from.id, markupId: from.id, deviceId: from.id } : undefined,
      to ? { id: to.id, markupId: to.id, deviceId: to.id } : undefined,
      internalContainer
        ? { id: internalContainer.id, markupId: internalContainer.id, deviceId: internalContainer.id }
        : undefined,
      internalDevice
        ? { id: internalDevice.id, markupId: internalDevice.id, deviceId: internalDevice.id }
        : undefined,
    ].filter(Boolean) as DuplicateCandidate[]);

    issues.push({
      id: `ghost-connection:${conn.id}`,
      severity: "warning",
      scope: "connection",
      code: "ghost-connection",
      field: "connections",
      message: `Ghost connection "${conn.id}" references missing or stale endpoints.`,
      entityIds: [conn.id, ...affected.markupIds],
      affected,
      details,
      resolver: conn.cableMarkupId && !cable && from && to
        ? {
            kind: "clear-stale-cable-link",
            label: `Remove dead cable reference from ${conn.id}`,
            description: "Keep the connection but remove its missing cable run association.",
            options: [
              {
                id: "clear-dead-cable-reference",
                kind: "clear-stale-cable-link",
                label: "Remove dead cable reference",
                description: "Keep the logical connection and clear only the missing cable run link.",
              },
              {
                id: "remove-stale-connection",
                kind: "remove-ghost-connection",
                label: `Remove stale connection ${conn.id}`,
                description: "Remove this logical connection because its linked cable run no longer exists.",
                destructive: true,
              },
            ],
          }
        : {
            kind: "remove-ghost-connection",
            label: `Remove ghost connection ${conn.id}`,
            description: "Remove the connection because one or more required endpoints no longer exist.",
            destructive: true,
          },
    });
  }
}

function addDeadCableRunIssues(
  project: Project,
  issues: ValidationIssue[],
  index: ProjectIndex,
) {
  const linkedCableIds = new Set(
    (project.connections ?? [])
      .map((connection) => connection.cableMarkupId)
      .filter((id): id is string => !!id?.trim()),
  );

  for (const cable of index.cablesById.values()) {
    const staleAttachments = (cable.pointAttachments ?? []).filter((attachment) => {
      if (!attachment) return false;
      if (attachment.deviceMarkupId && !index.devicesById.has(attachment.deviceMarkupId)) return true;
      if (attachment.deviceTag && !index.devicesByTag.has(attachment.deviceTag)) return true;
      return false;
    });
    if (staleAttachments.length > 0) {
      issues.push({
        id: `dead-cable-run:stale-attachments:${cable.id}`,
        severity: "warning",
        scope: "cable",
        code: "dead-cable-run",
        field: "pointAttachments",
        message: `Cable run "${displayCableLabel(cable)}" has stale endpoint attachment metadata.`,
        entityIds: [cable.id],
        sheetId: index.sheetsByMarkupId.get(cable.id),
        affected: affectedFromCandidates([
          { id: cable.id, markupId: cable.id, cableMarkupId: cable.id },
        ]),
        details: staleAttachments.map((attachment) => {
          const stale = attachment!;
          return `Stale endpoint ${stale.deviceTag ?? stale.deviceMarkupId ?? "unknown"}.`;
        }),
        resolver: {
          kind: "clear-stale-cable-attachments",
          label: `Clear stale endpoint${staleAttachments.length === 1 ? "" : "s"}`,
          description: "Keep the cable run and remove only missing endpoint attachment metadata.",
        },
      });
    }

    const hasEndpointText = !!(cable.endpointA?.trim() || cable.endpointB?.trim());
    if (hasEndpointText && !linkedCableIds.has(cable.id) && !isConduitRun(cable)) {
      issues.push({
        id: `dead-cable-run:unlinked:${cable.id}`,
        severity: "warning",
        scope: "cable",
        code: "dead-cable-run",
        field: "cableMarkupId",
        message: `Cable run "${displayCableLabel(cable)}" is not linked to a connection.`,
        entityIds: [cable.id],
        sheetId: index.sheetsByMarkupId.get(cable.id),
        affected: affectedFromCandidates([
          { id: cable.id, markupId: cable.id, cableMarkupId: cable.id },
        ]),
        details: ["Review before reconnecting or clearing; endpoint labels alone are not enough to infer intent."],
      });
    }
  }

  for (const device of index.devicesById.values()) {
    const attachment = device.attachedRunEndpoint;
    if (!attachment || index.cablesById.has(attachment.cableMarkupId)) continue;
    issues.push({
      id: `dead-cable-run:device-attachment:${device.id}`,
      severity: "warning",
      scope: "device",
      code: "dead-cable-run",
      field: "attachedRunEndpoint",
      message: `Device "${device.tag}" is attached to a missing cable run.`,
      entityIds: [device.id],
      sheetId: index.sheetsByMarkupId.get(device.id),
      affected: affectedFromCandidates([
        { id: device.id, markupId: device.id, deviceId: device.id },
      ]),
      details: [`Missing cable run ${attachment.cableMarkupId}.`],
      resolver: {
        kind: "clear-stale-run-attachment",
        label: `Clear stale endpoint from ${device.tag}`,
        description: "Keep the device and remove only the missing cable-run endpoint association.",
      },
    });
  }
}

function addDuplicateRunIssues(
  project: Project,
  issues: ValidationIssue[],
  index: ProjectIndex,
) {
  const groups = new Map<string, DeviceConnection[]>();
  for (const conn of project.connections ?? []) {
    const key = duplicateRunKey(conn, project);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(conn);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const removable = group.slice(1).find((conn) => isStaleDuplicateConnection(conn, index));
    const candidates = group.flatMap((conn) => {
      const from = index.devicesByTag.get(conn.fromTag);
      const to = index.devicesByTag.get(conn.toTag);
      const cable = conn.cableMarkupId ? index.cablesById.get(conn.cableMarkupId) : undefined;
      return [
        { id: conn.id, connectionId: conn.id, cableMarkupId: cable?.id, markupId: cable?.id },
        from ? { id: from.id, markupId: from.id, deviceId: from.id } : undefined,
        to ? { id: to.id, markupId: to.id, deviceId: to.id } : undefined,
      ].filter(Boolean) as DuplicateCandidate[];
    });
    issues.push({
      id: `duplicate-run:${issueKey(key)}`,
      severity: "warning",
      scope: "connection",
      code: "duplicate-run",
      field: "connections",
      message: `Duplicate run appears between ${runEndpointSummary(group[0], project)}.`,
      value: key,
      entityIds: group.map((conn) => conn.id),
      affected: affectedFromCandidates(candidates),
      details: group.map((conn) =>
        `${conn.id}: ${runEndpointSummary(conn, project)}${conn.cableMarkupId ? ` via ${conn.cableMarkupId}` : ""}`,
      ),
      resolver: removable
        ? {
            kind: "remove-duplicate-connection",
            label: removable.cableMarkupId && !index.cablesById.has(removable.cableMarkupId)
              ? `Remove stale connection ${removable.id}`
              : `Remove duplicate connection ${removable.id}`,
            description: removable.cableMarkupId && !index.cablesById.has(removable.cableMarkupId)
              ? "Remove the extra connection whose linked cable run no longer exists."
              : "Remove the extra connection that has no linked cable run.",
            destructive: true,
          }
        : undefined,
    });
  }
}

function pushConnectionPort(
  project: Project,
  index: ProjectIndex,
  candidates: DuplicateCandidate[],
  conn: DeviceConnection,
  side: "from" | "to",
) {
  const tag = side === "from" ? conn.fromTag : conn.toTag;
  const port = side === "from" ? connectionFromLabel(conn, project) : connectionToLabel(conn, project);
  const portId = side === "from" ? conn.fromPortId : conn.toPortId;
  if (!tag?.trim() || !port?.trim()) return;
  const device = index.devicesByTag.get(tag.trim());
  const cable = conn.cableMarkupId ? index.cablesById.get(conn.cableMarkupId) : undefined;
  candidates.push({
    id: conn.id,
    label: `${tag.trim()} ${port.trim()}`,
    markupId: cable?.id ?? device?.id,
    deviceId: device?.id,
    cableMarkupId: cable?.id,
    connectionId: conn.id,
    port: {
      connectionId: conn.id,
      deviceId: device?.id,
      deviceTag: tag.trim(),
      portId,
      portLabel: port.trim(),
      side,
    },
    detail: `${conn.id}: ${tag.trim()} ${port.trim()} (${side})`,
  });
}

function pushInternalConnectionPort(
  project: Project,
  index: ProjectIndex,
  candidates: DuplicateCandidate[],
  conn: DeviceConnection,
) {
  const endpoint = conn.internalEndpoint;
  const port = internalEndpointPortLabel(conn, project);
  const device = endpoint
    ? index.devicesById.get(endpoint.deviceId) ?? index.devicesByTag.get(endpoint.deviceTag)
    : undefined;
  const deviceLabel = endpoint?.deviceTag ?? endpoint?.deviceId;
  if (!deviceLabel?.trim() || !port?.trim()) return;
  const cable = conn.cableMarkupId ? index.cablesById.get(conn.cableMarkupId) : undefined;
  candidates.push({
    id: conn.id,
    label: `${deviceLabel.trim()} ${port.trim()}`,
    markupId: cable?.id ?? device?.id,
    deviceId: device?.id,
    cableMarkupId: cable?.id,
    connectionId: conn.id,
    port: {
      connectionId: conn.id,
      deviceId: device?.id,
      deviceTag: deviceLabel.trim(),
      portId: endpoint?.portId,
      portLabel: port.trim(),
      side: "internal",
    },
    detail: `${conn.id}: ${deviceLabel.trim()} ${port.trim()} (internal)`,
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
    rackId,
    detail: `Rack ${rackId}: ${placement.label.trim()}`,
  });
}

function pushIfValue(
  candidates: DuplicateCandidate[],
  value: string | undefined,
  id: string,
  sheetId?: string,
  extra: Partial<DuplicateCandidate> = {},
) {
  if (!value?.trim()) return;
  candidates.push({ id, label: value.trim(), sheetId, ...extra });
}

function addDuplicateIssues(
  issues: ValidationIssue[],
  options: {
    candidates: DuplicateCandidate[];
    scope: ValidationScope;
    field: string;
    idPrefix: string;
    code: ValidationIssueCode;
    message: (value: string, count: number) => string;
    resolverForGroup?: (group: DuplicateCandidate[]) => ValidationResolverMetadata | undefined;
  },
) {
  const groups = new Map<string, DuplicateCandidate[]>();
  for (const candidate of options.candidates) {
    if (!candidate.label) continue;
    const key = normalizeIdentifier(candidate.label);
    if (!key) continue;
    const group = groups.get(key) ?? [];
    group.push(candidate);
    groups.set(key, group);
  }
  for (const [key, group] of groups) {
    if (group.length < 2) continue;
    const value = group[0].label ?? key;
    issues.push({
      id: `${options.idPrefix}:${issueKey(key)}`,
      severity: "warning",
      scope: options.scope,
      code: options.code,
      field: options.field,
      value,
      message: options.message(value, group.length),
      entityIds: unique(group.map((candidate) => candidate.id)),
      sheetId: group[0].sheetId,
      affected: affectedFromCandidates(group),
      details: group.map((candidate) => candidate.detail).filter((detail): detail is string => !!detail),
      resolver: options.resolverForGroup?.(group),
    });
  }
}

function resolveDuplicateConnectionPort(
  project: Project,
  issue: ValidationIssue,
): ValidationResolveResult {
  const deviceTag = issue.affected.ports?.find((port) => port.deviceTag)?.deviceTag;
  const device = deviceTag ? findDeviceByTag(project, deviceTag) : undefined;
  if (!device) {
    return {
      project,
      resolved: false,
      message: "No device was found for the duplicate port assignment.",
      affectedMarkupIds: validationMarkupIdsForIssues([issue]),
    };
  }
  const result = buildSwitchPortAssignmentPatches(project, device);
  const patchIds = Object.keys(result.patches);
  if (patchIds.length === 0) {
    return {
      project,
      resolved: false,
      message: "No safe free compatible port was found.",
      affectedMarkupIds: validationMarkupIdsForIssues([issue]),
    };
  }
  let nextProject: Project = {
    ...project,
    connections: (project.connections ?? []).map((connection) => {
      const patch = result.patches[connection.id];
      return patch ? { ...connection, ...patch } : connection;
    }),
    updatedAt: Date.now(),
  };
  nextProject = syncSwitchPortTextForConnectionPatches(project, nextProject, device, result.patches);
  return {
    project: nextProject,
    resolved: true,
    message: `Moved ${patchIds.length} connection${patchIds.length === 1 ? "" : "s"} to the next free compatible port.`,
    affectedMarkupIds: validationMarkupIdsForIssues([issue]),
  };
}

function resolveByRemovingConnections(
  project: Project,
  issue: ValidationIssue,
  message: string,
): ValidationResolveResult {
  const removeIds = new Set(
    issue.resolver?.kind === "remove-duplicate-connection"
      ? removableDuplicateConnectionIds(project, issue)
      : issue.affected.connectionIds,
  );
  if (removeIds.size === 0) {
    return { project, resolved: false, message: "No safe connection removal was found.", affectedMarkupIds: [] };
  }
  return {
    project: {
      ...project,
      connections: (project.connections ?? []).filter((connection) => !removeIds.has(connection.id)),
      updatedAt: Date.now(),
    },
    resolved: true,
    message,
    affectedMarkupIds: validationMarkupIdsForIssues([issue]),
  };
}

function resolveRouteInfrastructurePortAssignment(
  project: Project,
  issue: ValidationIssue,
): ValidationResolveResult {
  const index = buildProjectIndex(project);
  const repair = (project.connections ?? [])
    .map((connection) => routeInfrastructurePortRepair(project, index, connection))
    .find((candidate) => candidate && issue.affected.connectionIds.includes(candidate.connection.id));
  if (!repair) {
    return {
      project,
      resolved: false,
      message: "No clear terminal device was found for this route-infrastructure assignment.",
      affectedMarkupIds: validationMarkupIdsForIssues([issue]),
    };
  }

  const patchedConnection = connectionWithRouteInfrastructureEndpointMoved(project, repair);
  let nextProject: Project = {
    ...project,
    connections: (project.connections ?? []).map((connection) =>
      connection.id === repair.connection.id ? patchedConnection : connection,
    ),
    updatedAt: Date.now(),
  };
  nextProject = syncSwitchPortTextForRouteInfrastructureRepair(
    project,
    nextProject,
    repair,
    patchedConnection,
  );

  return {
    project: nextProject,
    resolved: true,
    message: `Moved switch assignment from ${repair.infrastructure.tag} to ${repair.target.tag}.`,
    affectedMarkupIds: validationMarkupIdsForIssues([issue]),
  };
}

function connectionWithRouteInfrastructureEndpointMoved(
  project: Project,
  repair: RouteInfrastructurePortRepair,
): DeviceConnection {
  const base =
    repair.side === "from"
      ? {
          ...repair.connection,
          fromTag: repair.target.tag,
          fromPortId: undefined,
          fromPort: undefined,
        }
      : {
          ...repair.connection,
          toTag: repair.target.tag,
          toPortId: undefined,
          toPort: undefined,
        };
  return withAutoAssignedConnectionPorts(project, base, {
    from: repair.side === "from",
    to: repair.side === "to",
    internalEndpoint: true,
  });
}

function syncSwitchPortTextForRouteInfrastructureRepair(
  previousProject: Project,
  nextProject: Project,
  repair: RouteInfrastructurePortRepair,
  nextConnection: DeviceConnection,
): Project {
  const switchTag = repair.side === "from" ? nextConnection.toTag : nextConnection.fromTag;
  const switchDevice = findDeviceByTag(nextProject, switchTag);
  if (!switchDevice || !isSwitchLikeDevice(switchDevice)) return nextProject;

  const switchPort =
    repair.side === "from"
      ? connectionToLabel(nextConnection, nextProject)
      : connectionFromLabel(nextConnection, nextProject);
  const label = switchPort?.trim() ? `${switchDevice.tag} ${switchPort.trim()}` : undefined;
  if (!label) return nextProject;

  const previousInfra = findDeviceByTag(previousProject, repair.infrastructure.tag);
  const clearInfra = previousInfra?.systemConfig?.switchPort === label;
  return {
    ...nextProject,
    sheets: nextProject.sheets.map((sheet) => ({
      ...sheet,
      markups: sheet.markups.map((markup) => {
        if (markup.kind !== "device") return markup;
        if (markup.id === repair.infrastructure.id && clearInfra) {
          return { ...markup, systemConfig: withoutSwitchPortConfig(markup.systemConfig) };
        }
        if (markup.id === repair.target.id && !markup.systemConfig?.switchPort) {
          return {
            ...markup,
            systemConfig: {
              ...(markup.systemConfig ?? {}),
              switchPort: label,
            },
          };
        }
        return markup;
      }),
    })),
  };
}

function resolveByClearingConnectionCableLinks(
  project: Project,
  issue: ValidationIssue,
): ValidationResolveResult {
  const ids = new Set(issue.affected.connectionIds);
  return {
    project: {
      ...project,
      connections: (project.connections ?? []).map((connection) => {
        if (!ids.has(connection.id)) return connection;
        const { cableMarkupId: _removed, ...rest } = connection;
        return rest;
      }),
      updatedAt: Date.now(),
    },
    resolved: true,
    message: "Cleared stale missing cable run association.",
    affectedMarkupIds: validationMarkupIdsForIssues([issue]),
  };
}

function resolveByClearingDeviceRunAttachments(
  project: Project,
  issue: ValidationIssue,
): ValidationResolveResult {
  const ids = new Set(issue.affected.deviceIds);
  return {
    project: {
      ...project,
      sheets: project.sheets.map((sheet) => ({
        ...sheet,
        markups: sheet.markups.map((markup) => {
          if (markup.kind !== "device" || !ids.has(markup.id)) return markup;
          const { attachedRunEndpoint: _removed, ...rest } = markup;
          return rest as DeviceMarkup;
        }),
      })),
      updatedAt: Date.now(),
    },
    resolved: true,
    message: "Cleared stale device-to-run attachment.",
    affectedMarkupIds: validationMarkupIdsForIssues([issue]),
  };
}

function resolveByClearingCableAttachments(
  project: Project,
  issue: ValidationIssue,
): ValidationResolveResult {
  const index = buildProjectIndex(project);
  const ids = new Set(issue.affected.cableMarkupIds);
  return {
    project: {
      ...project,
      sheets: project.sheets.map((sheet) => ({
        ...sheet,
        markups: sheet.markups.map((markup) => {
          if (markup.kind !== "cable" || !ids.has(markup.id)) return markup;
          return {
            ...markup,
            pointAttachments: markup.pointAttachments?.map((attachment) => {
              if (!attachment) return attachment;
              if (attachment.deviceMarkupId && !index.devicesById.has(attachment.deviceMarkupId)) return null;
              if (attachment.deviceTag && !index.devicesByTag.has(attachment.deviceTag)) return null;
              return attachment;
            }),
          };
        }),
      })),
      updatedAt: Date.now(),
    },
    resolved: true,
    message: "Cleared stale cable endpoint attachment metadata.",
    affectedMarkupIds: validationMarkupIdsForIssues([issue]),
  };
}

function resolveByClearingStaleSwitchPortText(
  project: Project,
  issue: ValidationIssue,
): ValidationResolveResult {
  const ids = new Set(issue.affected.deviceIds);
  const staleKey = normalizeIdentifier(issue.value);
  let cleared = 0;
  const nextProject: Project = {
    ...project,
    sheets: project.sheets.map((sheet) => ({
      ...sheet,
      markups: sheet.markups.map((markup) => {
        if (markup.kind !== "device" || !ids.has(markup.id)) return markup;
        if (normalizeIdentifier(markup.systemConfig?.switchPort) !== staleKey) return markup;
        cleared += 1;
        return {
          ...markup,
          systemConfig: withoutSwitchPortConfig(markup.systemConfig),
        };
      }),
    })),
    updatedAt: Date.now(),
  };

  return {
    project: cleared > 0 ? nextProject : project,
    resolved: cleared > 0,
    message:
      cleared > 0
        ? `Cleared stale switch port text from ${cleared} device${cleared === 1 ? "" : "s"}.`
        : "No stale switch port text was found to clear.",
    affectedMarkupIds: validationMarkupIdsForIssues([issue]),
  };
}

function syncSwitchPortTextForConnectionPatches(
  previousProject: Project,
  nextProject: Project,
  switchDevice: DeviceMarkup,
  patches: Record<string, Partial<DeviceConnection>>,
): Project {
  const updates = new Map<string, string>();
  for (const conn of previousProject.connections ?? []) {
    if (!patches[conn.id]) continue;
    const nextConn = (nextProject.connections ?? []).find((candidate) => candidate.id === conn.id);
    if (!nextConn) continue;
    const oldPort =
      conn.fromTag === switchDevice.tag
        ? connectionFromLabel(conn, previousProject)
        : conn.toTag === switchDevice.tag
          ? connectionToLabel(conn, previousProject)
          : conn.internalEndpoint?.deviceTag === switchDevice.tag
            ? internalEndpointPortLabel(conn, previousProject)
            : "";
    const newPort =
      nextConn.fromTag === switchDevice.tag
        ? connectionFromLabel(nextConn, nextProject)
        : nextConn.toTag === switchDevice.tag
          ? connectionToLabel(nextConn, nextProject)
          : nextConn.internalEndpoint?.deviceTag === switchDevice.tag
            ? internalEndpointPortLabel(nextConn, nextProject)
            : "";
    const otherTag =
      conn.fromTag === switchDevice.tag
        ? conn.toTag
        : conn.toTag === switchDevice.tag
          ? conn.fromTag
          : conn.internalEndpoint?.deviceTag === switchDevice.tag
            ? conn.fromTag === conn.internalEndpoint.containerTag ? conn.toTag : conn.fromTag
            : "";
    if (!otherTag || !newPort) continue;
    const oldLabel = oldPort ? `${switchDevice.tag} ${oldPort}` : "";
    const newLabel = `${switchDevice.tag} ${newPort}`;
    const otherDevice = findDeviceByTag(nextProject, otherTag);
    if (!otherDevice) continue;
    const current = otherDevice.systemConfig?.switchPort;
    if (!current || current === oldLabel) updates.set(otherDevice.id, newLabel);
  }
  if (updates.size === 0) return nextProject;
  return {
    ...nextProject,
    sheets: nextProject.sheets.map((sheet) => ({
      ...sheet,
      markups: sheet.markups.map((markup) => {
        if (markup.kind !== "device" || !updates.has(markup.id)) return markup;
        return {
          ...markup,
          systemConfig: {
            ...(markup.systemConfig ?? {}),
            switchPort: updates.get(markup.id),
          },
        };
      }),
    })),
  };
}

function removableDuplicateConnectionIds(project: Project, issue: ValidationIssue): string[] {
  const index = buildProjectIndex(project);
  const group = (project.connections ?? []).filter((connection) =>
    issue.affected.connectionIds.includes(connection.id),
  );
  return group.slice(1).filter((connection) => isStaleDuplicateConnection(connection, index)).map((connection) => connection.id);
}

function isStaleDuplicateConnection(connection: DeviceConnection, index: ProjectIndex): boolean {
  return !connection.cableMarkupId || !index.cablesById.has(connection.cableMarkupId);
}

function connectionPeerTags(
  project: Project,
  deviceTag: string,
  connectionIds: string[],
): string[] {
  return unique(
    (project.connections ?? [])
      .filter((connection) => connectionIds.includes(connection.id))
      .map((connection) => connectionPeerTag(connection, deviceTag))
      .filter((tag): tag is string => !!tag?.trim()),
  );
}

function connectionPeerTag(connection: DeviceConnection, deviceTag: string): string {
  if (connection.fromTag === deviceTag) return connection.toTag;
  if (connection.toTag === deviceTag) return connection.fromTag;
  if (connection.internalEndpoint?.deviceTag === deviceTag) {
    return connection.fromTag === connection.internalEndpoint.containerTag
      ? connection.toTag
      : connection.fromTag;
  }
  return connection.fromTag || connection.toTag;
}

function buildProjectIndex(project: Project): ProjectIndex {
  const markupsById = new Map<string, Markup>();
  const devicesById = new Map<string, DeviceMarkup>();
  const devicesByTag = new Map<string, DeviceMarkup>();
  const cablesById = new Map<string, CableMarkup>();
  const sheetsByMarkupId = new Map<string, string>();
  for (const sheet of project.sheets) {
    for (const markup of sheet.markups) {
      markupsById.set(markup.id, markup);
      sheetsByMarkupId.set(markup.id, sheet.id);
      if (markup.kind === "device") {
        devicesById.set(markup.id, markup);
        if (markup.tag?.trim()) devicesByTag.set(markup.tag.trim(), markup);
      }
      if (markup.kind === "cable") cablesById.set(markup.id, markup);
    }
  }
  return { markupsById, devicesById, devicesByTag, cablesById, sheetsByMarkupId };
}

function affectedFromCandidates(candidates: DuplicateCandidate[]): ValidationAffectedEntities {
  const ports = candidates.map((candidate) => candidate.port).filter((port): port is ValidationAffectedPort => !!port);
  const labels = candidates.map((candidate) => candidate.label).filter((label): label is string => !!label);
  return {
    markupIds: unique(candidates.map((candidate) => candidate.markupId).filter(Boolean) as string[]),
    deviceIds: unique(candidates.map((candidate) => candidate.deviceId).filter(Boolean) as string[]),
    cableMarkupIds: unique(candidates.map((candidate) => candidate.cableMarkupId).filter(Boolean) as string[]),
    connectionIds: unique(candidates.map((candidate) => candidate.connectionId).filter(Boolean) as string[]),
    rackIds: unique(candidates.map((candidate) => candidate.rackId).filter(Boolean) as string[]),
    ...(ports.length > 0 ? { ports } : {}),
    ...(labels.length > 0 ? { labels: unique(labels) } : {}),
  };
}

function duplicateRunKey(conn: DeviceConnection, project: Project): string {
  const endpoints = [conn.fromTag.trim(), conn.toTag.trim()].sort().join("|");
  if (!endpoints.trim()) return "";
  const fromPort = connectionFromLabel(conn, project).trim();
  const toPort = connectionToLabel(conn, project).trim();
  const ports = [fromPort, toPort].sort().join("|");
  const internal = conn.internalEndpoint
    ? `${conn.internalEndpoint.deviceTag}:${internalEndpointPortLabel(conn, project)}`
    : "";
  return normalizeIdentifier([endpoints, ports, conn.medium ?? "", internal].join("|"));
}

function runEndpointSummary(conn: DeviceConnection, project: Project): string {
  const fromPort = connectionFromLabel(conn, project);
  const toPort = connectionToLabel(conn, project);
  return `${conn.fromTag}${fromPort ? ` ${fromPort}` : ""} and ${conn.toTag}${toPort ? ` ${toPort}` : ""}`;
}

function displayCableLabel(cable: CableMarkup): string {
  return cable.physicalLabel?.trim() || cable.endpointA || cable.endpointB || cable.id;
}

function withoutSwitchPortConfig(
  config: DeviceSystemConfig | undefined,
): DeviceSystemConfig | undefined {
  if (!config?.switchPort) return config;
  const { switchPort: _switchPort, ...rest } = config;
  return Object.keys(rest).length > 0 ? rest : undefined;
}

function isConduitRun(cable: CableMarkup): boolean {
  return cable.cableId === "conduit";
}

function deviceDetail(device: DeviceMarkup): string {
  return `${device.tag || device.id}${device.labelOverride ? ` (${device.labelOverride})` : ""}`;
}

function labelDetail(kind: string, label: string | undefined, id: string): string {
  return `${kind} ${label?.trim() || id}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => !!value?.trim())));
}

function issueKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
