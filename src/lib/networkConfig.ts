import { effectiveDevicePorts } from "../data/devices";
import type {
  DeviceConnection,
  DeviceMarkup,
  DeviceSystemConfig,
  NetworkConfig,
  Project,
} from "../store/projectStore";
import {
  connectionFromLabel,
  connectionToLabel,
  findDeviceByTag,
  internalEndpointPortLabel,
} from "./connections";
import { isRouteInfrastructureDevice } from "./cableRuns";

export const DEFAULT_NETWORK_START_IP = "192.168.1.100";
export const DEFAULT_SUBNET_MASK = "255.255.255.0";
export const DEFAULT_VLAN = 1;

export interface ConnectedSwitchDevice {
  connection: DeviceConnection;
  device: DeviceMarkup;
  devicePort?: string;
  switchPort?: string;
  viaInternalEndpoint: boolean;
}

export interface AutoIpAssignmentOptions {
  startIp?: string;
  subnetMask?: string;
  gateway?: string;
  vlan?: number;
  overwrite?: boolean;
}

export interface AutoIpAssignmentResult {
  patches: Record<string, DeviceSystemConfig>;
  assigned: number;
}

export function isNetworkAddressableDevice(device: DeviceMarkup): boolean {
  const ports = effectiveDevicePorts(device.deviceId, device.instancePorts);
  if (ports?.some((p) => p.kind === "ethernet" || p.kind === "fiber" || p.kind === "wireless")) {
    return true;
  }
  return ["cameras", "network", "wireless", "av", "broadcast"].includes(device.category);
}

export function isSwitchLikeDevice(device: DeviceMarkup): boolean {
  if (device.systemConfig?.switchConfig) return true;
  if (device.deviceId.toLowerCase().includes("switch")) return true;
  const ports = effectiveDevicePorts(device.deviceId, device.instancePorts) ?? [];
  const networkPorts = ports.filter((p) => p.kind === "ethernet" || p.kind === "fiber");
  return device.category === "network" && networkPorts.length >= 4;
}

export function withDefaultNetworkConfig(markup: DeviceMarkup, project: Project): DeviceMarkup {
  if (!isNetworkAddressableDevice(markup)) return markup;

  const net = markup.systemConfig?.network ?? {};
  const existingIp = normalizeIp(net.ipAddress);
  const collides = existingIp ? projectIpSet(project, markup.id).has(existingIp) : false;
  if (existingIp && !collides) {
    return withNetworkDefaults(markup, {});
  }

  const ipAddress = nextAvailableIp(projectIpSet(project, markup.id), DEFAULT_NETWORK_START_IP);
  return withNetworkDefaults(markup, { ipAddress });
}

export function connectedDevicesForSwitch(
  project: Project,
  switchDevice: DeviceMarkup,
): ConnectedSwitchDevice[] {
  if (!isSwitchLikeDevice(switchDevice)) return [];

  const rows: ConnectedSwitchDevice[] = [];
  const seen = new Set<string>();

  for (const connection of project.connections ?? []) {
    const direct = directConnectedDevice(project, connection, switchDevice.tag);
    if (direct) {
      pushConnectedRow(rows, seen, direct.device, connection, {
        devicePort: direct.devicePort,
        switchPort: direct.switchPort,
        viaInternalEndpoint: false,
      });
      continue;
    }

    const internal = internalConnectedDevice(project, connection, switchDevice);
    if (internal) {
      pushConnectedRow(rows, seen, internal.device, connection, {
        devicePort: internal.devicePort,
        switchPort: internal.switchPort,
        viaInternalEndpoint: true,
      });
    }
  }

  return rows.sort((a, b) =>
    (a.switchPort ?? "").localeCompare(b.switchPort ?? "", undefined, {
      numeric: true,
      sensitivity: "base",
    }) || a.device.tag.localeCompare(b.device.tag, undefined, { numeric: true }),
  );
}

export function buildAutoIpAssignmentPatches(
  project: Project,
  switchDevice: DeviceMarkup,
  options: AutoIpAssignmentOptions = {},
): AutoIpAssignmentResult {
  const rows = connectedDevicesForSwitch(project, switchDevice);
  const targetIds = new Set(
    rows
      .filter(({ device }) => options.overwrite || shouldAutoAssignIp(project, device))
      .map(({ device }) => device.id),
  );
  const usedIps = projectIpSet(project, undefined, targetIds);
  const patches: Record<string, DeviceSystemConfig> = {};
  const switchNet = switchDevice.systemConfig?.network ?? {};
  const startIp = normalizeIp(options.startIp) ?? inferStartIp(switchNet) ?? DEFAULT_NETWORK_START_IP;
  const subnetMask = options.subnetMask ?? switchNet.subnetMask ?? DEFAULT_SUBNET_MASK;
  const gateway = options.gateway ?? switchNet.gateway ?? gatewayForIp(startIp);
  const vlan =
    options.vlan ??
    switchNet.vlan ??
    switchDevice.systemConfig?.switchConfig?.managementVlan ??
    DEFAULT_VLAN;

  let nextIp = startIp;
  let assigned = 0;
  for (const { device, switchPort } of rows) {
    if (patches[device.id]) continue;
    const shouldAssignIp = targetIds.has(device.id);
    const shouldSetVlan =
      device.systemConfig?.network?.vlan === undefined ||
      (options.overwrite && options.vlan !== undefined);
    const shouldDefaultSwitchPort = !device.systemConfig?.switchPort && !!switchPort;
    if (!shouldAssignIp && !shouldSetVlan && !shouldDefaultSwitchPort) continue;

    const assignedIp = shouldAssignIp ? nextAvailableIp(usedIps, nextIp) : undefined;
    if (assignedIp) usedIps.add(assignedIp);
    patches[device.id] = mergeDeviceConfig(device, {
      switchPort: device.systemConfig?.switchPort ?? switchPortLabel(switchDevice.tag, switchPort),
      network: {
        ...device.systemConfig?.network,
        dhcp: assignedIp ? false : device.systemConfig?.network?.dhcp,
        ipAddress: assignedIp ?? device.systemConfig?.network?.ipAddress,
        subnetMask: assignedIp ? subnetMask : device.systemConfig?.network?.subnetMask,
        gateway: assignedIp ? gateway : device.systemConfig?.network?.gateway,
        vlan: shouldSetVlan ? vlan : device.systemConfig?.network?.vlan,
        hostname: device.systemConfig?.network?.hostname ?? hostnameForTag(device.tag),
      },
    });
    if (assignedIp) {
      assigned += 1;
      nextIp = incrementIp(assignedIp) ?? assignedIp;
    }
  }

  return { patches, assigned };
}

function shouldAutoAssignIp(project: Project, device: DeviceMarkup): boolean {
  const ip = normalizeIp(device.systemConfig?.network?.ipAddress);
  return !ip || projectIpSet(project, device.id).has(ip);
}

export function mergeDeviceConfig(
  device: DeviceMarkup,
  patch: Partial<DeviceSystemConfig>,
): DeviceSystemConfig {
  const current = device.systemConfig ?? {};
  return {
    ...current,
    ...patch,
    network: patch.network ? { ...(current.network ?? {}), ...patch.network } : current.network,
  };
}

export function nextAvailableIp(usedIps: Set<string>, startIp = DEFAULT_NETWORK_START_IP): string {
  let next = normalizeIp(startIp) ?? DEFAULT_NETWORK_START_IP;
  for (let i = 0; i < 4096; i += 1) {
    if (!usedIps.has(next)) return next;
    const incremented = incrementIp(next);
    if (!incremented) break;
    next = incremented;
  }
  return next;
}

function withNetworkDefaults(
  markup: DeviceMarkup,
  netPatch: Partial<NetworkConfig>,
): DeviceMarkup {
  const currentNet = markup.systemConfig?.network ?? {};
  return {
    ...markup,
    systemConfig: mergeDeviceConfig(markup, {
      network: {
        dhcp: currentNet.dhcp ?? false,
        subnetMask: currentNet.subnetMask ?? DEFAULT_SUBNET_MASK,
        gateway: currentNet.gateway ?? (netPatch.ipAddress ? gatewayForIp(netPatch.ipAddress) : undefined),
        hostname: currentNet.hostname ?? hostnameForTag(markup.tag),
        vlan: currentNet.vlan ?? DEFAULT_VLAN,
        ...netPatch,
      },
    }),
  };
}

function directConnectedDevice(
  project: Project,
  connection: DeviceConnection,
  switchTag: string,
):
  | { device: DeviceMarkup; devicePort?: string; switchPort?: string }
  | undefined {
  if (connection.fromTag === switchTag) {
    const device = findDeviceByTag(project, connection.toTag);
    if (!device) return undefined;
    if (isRouteInfrastructureDevice(device)) return undefined;
    return {
      device,
      devicePort: connectionToLabel(connection, project),
      switchPort: connectionFromLabel(connection, project),
    };
  }
  if (connection.toTag === switchTag) {
    const device = findDeviceByTag(project, connection.fromTag);
    if (!device) return undefined;
    if (isRouteInfrastructureDevice(device)) return undefined;
    return {
      device,
      devicePort: connectionFromLabel(connection, project),
      switchPort: connectionToLabel(connection, project),
    };
  }
  return undefined;
}

function internalConnectedDevice(
  project: Project,
  connection: DeviceConnection,
  switchDevice: DeviceMarkup,
):
  | { device: DeviceMarkup; devicePort?: string; switchPort?: string }
  | undefined {
  const endpoint = connection.internalEndpoint;
  if (!endpoint || endpoint.deviceTag !== switchDevice.tag) return undefined;
  const switchIsSource = connection.fromTag === endpoint.containerTag;
  const otherTag = switchIsSource ? connection.toTag : connection.fromTag;
  const device = findDeviceByTag(project, otherTag);
  if (!device || device.id === switchDevice.id) return undefined;
  if (isRouteInfrastructureDevice(device)) return undefined;
  return {
    device,
    devicePort: switchIsSource
      ? connectionToLabel(connection, project)
      : connectionFromLabel(connection, project),
    switchPort: internalEndpointPortLabel(connection, project),
  };
}

function pushConnectedRow(
  rows: ConnectedSwitchDevice[],
  seen: Set<string>,
  device: DeviceMarkup,
  connection: DeviceConnection,
  options: Omit<ConnectedSwitchDevice, "connection" | "device">,
) {
  const key = `${connection.id}:${device.id}`;
  if (seen.has(key)) return;
  seen.add(key);
  rows.push({ connection, device, ...options });
}

function projectIpSet(project: Project, excludeDeviceId?: string, excludeIds = new Set<string>()): Set<string> {
  const ips = new Set<string>();
  for (const sheet of project.sheets) {
    for (const markup of sheet.markups) {
      if (markup.kind !== "device") continue;
      if (markup.id === excludeDeviceId || excludeIds.has(markup.id)) continue;
      const ip = normalizeIp(markup.systemConfig?.network?.ipAddress);
      if (ip) ips.add(ip);
    }
  }
  return ips;
}

function normalizeIp(value: string | undefined): string | undefined {
  const parsed = parseIp(value);
  return parsed ? parsed.join(".") : undefined;
}

function parseIp(value: string | undefined): [number, number, number, number] | undefined {
  const parts = value?.trim().split(".").map((part) => Number(part));
  if (!parts || parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return undefined;
  }
  return parts as [number, number, number, number];
}

function incrementIp(value: string): string | undefined {
  const parts = parseIp(value);
  if (!parts) return undefined;
  const next = [...parts] as [number, number, number, number];
  for (let i = 3; i >= 0; i -= 1) {
    if (next[i] < 254) {
      next[i] += 1;
      break;
    }
    next[i] = i === 3 ? 1 : 0;
  }
  return next.join(".");
}

function inferStartIp(net: NetworkConfig): string | undefined {
  const base = parseIp(net.ipAddress ?? net.gateway);
  if (!base) return undefined;
  return [base[0], base[1], base[2], 100].join(".");
}

function gatewayForIp(value: string): string | undefined {
  const parts = parseIp(value);
  if (!parts) return undefined;
  return [parts[0], parts[1], parts[2], 1].join(".");
}

function hostnameForTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function switchPortLabel(switchTag: string, switchPort: string | undefined): string | undefined {
  return switchPort?.trim() ? `${switchTag} ${switchPort.trim()}` : undefined;
}
