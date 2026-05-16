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
  return (project.connections ?? []).some(
    (conn) =>
      conn.id !== excludeConnectionId &&
      conn.internalEndpoint?.deviceId === device.id &&
      conn.internalEndpoint?.portId === portId,
  );
}

export function nextAvailableInternalPort(
  project: Project,
  conn: DeviceConnection,
  device: DeviceMarkup,
): PortSpec | undefined {
  const ports = effectiveDevicePorts(device.deviceId, device.instancePorts);
  if (!ports || ports.length === 0) return undefined;
  return ports.find(
    (port) =>
      isPortCompatibleWithConnection(port, conn) &&
      !isInternalPortInUse(project, device, port.id, conn.id),
  );
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
