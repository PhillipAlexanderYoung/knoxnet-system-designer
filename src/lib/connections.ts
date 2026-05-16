/**
 * Shared helpers for resolving structured port info on either end of a
 * `DeviceConnection`. Keeps the PropertiesPanel, the report engine, and
 * the future signal-flow diagram in sync about how a connection's port
 * id resolves to a human label.
 */

import type {
  DeviceConnection,
  DeviceMarkup,
  PortSpec,
  Project,
} from "../store/projectStore";
import { effectiveDevicePorts } from "../data/devices";
import { isRouteInfrastructureDevice } from "./cableRuns";

/** Find the device markup with the given tag anywhere in the project.
 *  Linear scan — connections are typically dozens, not thousands, so
 *  cheap enough not to bother memoising. */
export function findDeviceByTag(
  project: Project,
  tag: string,
): DeviceMarkup | undefined {
  for (const sh of project.sheets) {
    for (const m of sh.markups) {
      if (m.kind === "device" && m.tag === tag) return m;
    }
  }
  return undefined;
}

export function findDeviceById(
  project: Project,
  id: string | undefined,
): DeviceMarkup | undefined {
  if (!id) return undefined;
  for (const sh of project.sheets) {
    for (const m of sh.markups) {
      if (m.kind === "device" && m.id === id) return m;
    }
  }
  return undefined;
}

/** Resolve the effective port list for any device tag in the project.
 *  Returns undefined when the device has no `ports` spec — callers
 *  fall back to free-text labels in that case. */
export function effectivePortsForTag(
  project: Project,
  tag: string,
): PortSpec[] | undefined {
  const dev = findDeviceByTag(project, tag);
  if (!dev) return undefined;
  return effectiveDevicePorts(dev.deviceId, dev.instancePorts);
}

/** Look up a port by id in a list of port specs. */
export function findPort(
  ports: PortSpec[] | undefined,
  id: string | undefined,
): PortSpec | undefined {
  if (!ports || !id) return undefined;
  return ports.find((p) => p.id === id);
}

function compatiblePortKindForMedium(medium: string | undefined): PortSpec["kind"] | null {
  const normalized = medium?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.includes("fiber")) return "fiber";
  if (normalized.includes("coax")) return "coax";
  if (normalized.includes("rs485") || normalized.includes("rs-485")) return "serial";
  if (normalized.includes("rs232") || normalized.includes("rs-232")) return "serial";
  if (normalized.includes("cat") || normalized.includes("ethernet")) return "ethernet";
  return null;
}

export function isPortCompatibleWithConnection(
  port: PortSpec,
  conn: DeviceConnection,
): boolean {
  const kind = compatiblePortKindForMedium(conn.medium);
  return !kind || port.kind === kind;
}

export function isInternalPortInUse(
  project: Project,
  device: DeviceMarkup,
  portId: string,
  excludeConnectionId?: string,
): boolean {
  return isDevicePortInUse(project, device, portId, excludeConnectionId);
}

export function isDevicePortInUse(
  project: Project,
  device: DeviceMarkup,
  portId: string,
  excludeConnectionId?: string,
): boolean {
  return (project.connections ?? []).some(
    (conn) =>
      conn.id !== excludeConnectionId &&
      ((conn.fromTag === device.tag && conn.fromPortId === portId) ||
        (conn.toTag === device.tag && conn.toPortId === portId) ||
        ((conn.internalEndpoint?.deviceId === device.id ||
          conn.internalEndpoint?.deviceTag === device.tag) &&
          conn.internalEndpoint?.portId === portId)),
  );
}

export function nextAvailableDevicePort(
  project: Project,
  conn: DeviceConnection,
  device: DeviceMarkup,
): PortSpec | undefined {
  const ports = effectiveDevicePorts(device.deviceId, device.instancePorts);
  if (!ports || ports.length === 0) return undefined;
  return ports.find(
    (port) =>
      isPortCompatibleWithConnection(port, conn) &&
      !isDevicePortInUse(project, device, port.id, conn.id),
  );
}

export function nextAvailableInternalPort(
  project: Project,
  conn: DeviceConnection,
  device: DeviceMarkup,
): PortSpec | undefined {
  return nextAvailableDevicePort(project, conn, device);
}

export interface AutoAssignConnectionPortsOptions {
  from?: boolean;
  to?: boolean;
  internalEndpoint?: boolean;
}

export interface SwitchPortAssignmentResult {
  patches: Record<string, Partial<DeviceConnection>>;
  exhausted: Array<{ connectionId: string; deviceTag: string }>;
}

export function withAutoAssignedConnectionPorts(
  project: Project,
  conn: DeviceConnection,
  options: AutoAssignConnectionPortsOptions = {},
): DeviceConnection {
  let next = conn;
  const assignFrom = options.from ?? true;
  const assignTo = options.to ?? true;
  const assignInternal = options.internalEndpoint ?? true;

  if (assignFrom) {
    next = withAutoAssignedEndpointPort(project, next, "from");
  } else if (next.fromPortId) {
    next = withResolvedEndpointPortLabel(project, next, "from");
  }

  if (assignTo) {
    next = withAutoAssignedEndpointPort(project, next, "to");
  } else if (next.toPortId) {
    next = withResolvedEndpointPortLabel(project, next, "to");
  }

  if (next.internalEndpoint) {
    next = withResolvedInternalEndpoint(project, next, assignInternal);
  }

  return next;
}

export function buildSwitchPortAssignmentPatches(
  project: Project,
  switchDevice: DeviceMarkup,
  options: { overwrite?: boolean } = {},
): SwitchPortAssignmentResult {
  const ports = effectiveDevicePorts(switchDevice.deviceId, switchDevice.instancePorts) ?? [];
  const switchConnections = switchPortTargets(project, switchDevice);
  const overwrite = options.overwrite ?? false;
  const used = new Set<string>();
  const needsAssignment: SwitchPortTarget[] = [];
  const patches: Record<string, Partial<DeviceConnection>> = {};
  const exhausted: Array<{ connectionId: string; deviceTag: string }> = [];

  for (const target of switchConnections) {
    if (!overwrite && target.portId && !used.has(target.portId)) {
      used.add(target.portId);
      continue;
    }
    needsAssignment.push(target);
  }

  for (const target of needsAssignment) {
    const orderedPorts = target.portId ? portsAfterCurrentFirst(ports, target.portId) : ports;
    const port = orderedPorts.find(
      (candidate) =>
        isPortCompatibleWithConnection(candidate, target.connection) &&
        !used.has(candidate.id),
    );
    if (!port) {
      exhausted.push({ connectionId: target.connection.id, deviceTag: target.deviceTag });
      continue;
    }
    used.add(port.id);
    patches[target.connection.id] = patchSwitchPortTarget(target, port);
  }

  return { patches, exhausted };
}

function portsAfterCurrentFirst(ports: PortSpec[], currentPortId: string): PortSpec[] {
  const index = ports.findIndex((port) => port.id === currentPortId);
  if (index < 0) return ports;
  return [...ports.slice(index + 1), ...ports.slice(0, index)];
}

type SwitchPortTarget =
  | {
      connection: DeviceConnection;
      kind: "from" | "to";
      portId?: string;
      deviceTag: string;
    }
  | {
      connection: DeviceConnection;
      kind: "internal";
      portId?: string;
      deviceTag: string;
    };

function switchPortTargets(project: Project, switchDevice: DeviceMarkup): SwitchPortTarget[] {
  const targets: SwitchPortTarget[] = [];
  for (const connection of project.connections ?? []) {
    if (connection.fromTag === switchDevice.tag) {
      if (!isSwitchPortPeerTarget(project, connection.toTag)) continue;
      targets.push({
        connection,
        kind: "from",
        portId: connection.fromPortId,
        deviceTag: connection.toTag,
      });
      continue;
    }
    if (connection.toTag === switchDevice.tag) {
      if (!isSwitchPortPeerTarget(project, connection.fromTag)) continue;
      targets.push({
        connection,
        kind: "to",
        portId: connection.toPortId,
        deviceTag: connection.fromTag,
      });
      continue;
    }
    const endpoint = connection.internalEndpoint;
    if (endpoint?.deviceId === switchDevice.id || endpoint?.deviceTag === switchDevice.tag) {
      const otherTag = connection.fromTag === endpoint.containerTag ? connection.toTag : connection.fromTag;
      if (!isSwitchPortPeerTarget(project, otherTag)) continue;
      targets.push({
        connection,
        kind: "internal",
        portId: endpoint.portId,
        deviceTag: otherTag,
      });
    }
  }
  return targets;
}

function isSwitchPortPeerTarget(project: Project, deviceTag: string | undefined): boolean {
  const device = deviceTag ? findDeviceByTag(project, deviceTag) : undefined;
  return !device || !isRouteInfrastructureDevice(device);
}

function patchSwitchPortTarget(
  target: SwitchPortTarget,
  port: PortSpec,
): Partial<DeviceConnection> {
  if (target.kind === "from") {
    return { fromPortId: port.id, fromPort: port.label };
  }
  if (target.kind === "to") {
    return { toPortId: port.id, toPort: port.label };
  }
  return {
    internalEndpoint: {
      ...target.connection.internalEndpoint!,
      portId: port.id,
      port: port.label,
    },
  };
}

function withAutoAssignedEndpointPort(
  project: Project,
  conn: DeviceConnection,
  side: "from" | "to",
): DeviceConnection {
  const tag = side === "from" ? conn.fromTag : conn.toTag;
  const idKey = side === "from" ? "fromPortId" : "toPortId";
  const labelKey = side === "from" ? "fromPort" : "toPort";
  if (conn[idKey]) return withResolvedEndpointPortLabel(project, conn, side);
  if (conn[labelKey]?.trim()) return conn;
  const device = findDeviceByTag(project, tag);
  if (!device) return conn;
  if (isRouteInfrastructureDevice(device)) return conn;
  const port = nextAvailableDevicePort(project, conn, device);
  return port ? { ...conn, [idKey]: port.id, [labelKey]: port.label } : conn;
}

function withResolvedEndpointPortLabel(
  project: Project,
  conn: DeviceConnection,
  side: "from" | "to",
): DeviceConnection {
  const tag = side === "from" ? conn.fromTag : conn.toTag;
  const idKey = side === "from" ? "fromPortId" : "toPortId";
  const labelKey = side === "from" ? "fromPort" : "toPort";
  const port = findPort(effectivePortsForTag(project, tag), conn[idKey]);
  return port ? { ...conn, [labelKey]: port.label } : conn;
}

function withResolvedInternalEndpoint(
  project: Project,
  conn: DeviceConnection,
  assignMissingPort: boolean,
): DeviceConnection {
  const endpoint = conn.internalEndpoint;
  if (!endpoint) return conn;
  const device =
    findDeviceById(project, endpoint.deviceId) ??
    findDeviceByTag(project, endpoint.deviceTag);
  if (!device) return conn;
  if (isRouteInfrastructureDevice(device)) return conn;
  const ports = effectiveDevicePorts(device.deviceId, device.instancePorts);
  const explicitPort = endpoint.portId ? findPort(ports, endpoint.portId) : undefined;
  const port =
    explicitPort ??
    (assignMissingPort && !endpoint.port?.trim()
      ? nextAvailableDevicePort(project, conn, device)
      : undefined);
  return {
    ...conn,
    internalEndpoint: {
      ...endpoint,
      deviceId: device.id,
      deviceTag: device.tag,
      ...(port ? { portId: port.id, port: port.label } : {}),
    },
  };
}

/** Human label for the source endpoint of a connection — prefers the
 *  structured port id (resolved against the source device's ports),
 *  falls back to the free-text label, returns empty string when
 *  neither is set. */
export function connectionFromLabel(
  conn: DeviceConnection,
  project: Project,
): string {
  if (conn.fromPortId) {
    const p = findPort(effectivePortsForTag(project, conn.fromTag), conn.fromPortId);
    if (p) return p.label;
  }
  return conn.fromPort ?? "";
}

/** Same as `connectionFromLabel` for the destination endpoint. */
export function connectionToLabel(
  conn: DeviceConnection,
  project: Project,
): string {
  if (conn.toPortId) {
    const p = findPort(effectivePortsForTag(project, conn.toTag), conn.toPortId);
    if (p) return p.label;
  }
  return conn.toPort ?? "";
}

export function internalEndpointPortLabel(
  conn: DeviceConnection,
  project: Project,
): string {
  const endpoint = conn.internalEndpoint;
  if (!endpoint) return "";
  const dev = findDeviceById(project, endpoint.deviceId);
  const ports = dev
    ? effectiveDevicePorts(dev.deviceId, dev.instancePorts)
    : effectivePortsForTag(project, endpoint.deviceTag);
  return findPort(ports, endpoint.portId)?.label ?? endpoint.port ?? "";
}

export function connectionDiagramTags(
  conn: DeviceConnection,
): { fromTag: string; toTag: string } {
  const endpoint = conn.internalEndpoint;
  if (!endpoint) return { fromTag: conn.fromTag, toTag: conn.toTag };
  if (conn.fromTag === endpoint.containerTag) {
    return { fromTag: endpoint.deviceTag, toTag: conn.toTag };
  }
  return { fromTag: conn.fromTag, toTag: endpoint.deviceTag };
}
