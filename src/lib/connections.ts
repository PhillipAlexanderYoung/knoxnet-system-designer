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
