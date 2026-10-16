import { devicesById, effectiveDevicePorts } from "../data/devices";
import type { DeviceMarkup, Project } from "../store/projectStore";
import { isDevicePortInUse } from "./connections";

export function wallOutletChangeError(
  project: Project,
  device: DeviceMarkup,
  next: DeviceMarkup,
): string | undefined {
  if (!devicesById[device.deviceId]?.wallOutlet) return undefined;
  if (device.deviceId === next.deviceId && device.instancePorts === next.instancePorts) return undefined;
  if (!devicesById[next.deviceId]?.wallOutlet) return "Choose a supported wall outlet configuration.";
  if (device.instancePorts?.length && device.deviceId !== next.deviceId) {
    return "This outlet has custom ports. Keep its configuration to preserve those ports.";
  }
  const nextIds = new Set((effectiveDevicePorts(next.deviceId, next.instancePorts) ?? []).map((port) => port.id));
  const removed = (effectiveDevicePorts(device.deviceId, device.instancePorts) ?? []).filter((port) => !nextIds.has(port.id));
  for (const port of removed) {
    const usedByLabel = (project.connections ?? []).some((connection) =>
      (connection.fromTag === device.tag && !connection.fromPortId && connection.fromPort === port.label) ||
      (connection.toTag === device.tag && !connection.toPortId && connection.toPort === port.label) ||
      ((connection.internalEndpoint?.deviceId === device.id || connection.internalEndpoint?.deviceTag === device.tag) &&
        !connection.internalEndpoint?.portId && connection.internalEndpoint?.port === port.label),
    );
    if (isDevicePortInUse(project, device, port.id) || usedByLabel) {
      return `Disconnect ${port.label} before reducing the socket count.`;
    }
  }
  return undefined;
}
