// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildAutoIpAssignmentPatches,
  connectedDevicesForSwitch,
  DEFAULT_VLAN,
  withDefaultNetworkConfig,
} from "../src/lib/networkConfig";
import type { DeviceConnection, DeviceMarkup, Project, Sheet } from "../src/store/projectStore";

const device = (overrides: Partial<DeviceMarkup> = {}): DeviceMarkup => ({
  id: "dev-1",
  kind: "device",
  layer: "network",
  category: "network",
  deviceId: "net-switch-poe",
  x: 0,
  y: 0,
  tag: "SW-01",
  ...overrides,
});

const sheet = (markups: Sheet["markups"]): Sheet => ({
  id: "sheet-1",
  name: "Plan",
  fileName: "plan.pdf",
  pageWidth: 100,
  pageHeight: 100,
  renderScale: 1,
  markups,
});

function project(markups: Sheet["markups"], connections: DeviceConnection[] = []): Project {
  return {
    id: "project-1",
    meta: {
      projectName: "Network Config Test",
      projectNumber: "",
      client: "",
      location: "",
      drawnBy: "",
      date: new Date(0).toISOString(),
      revision: "0",
    },
    sheets: [sheet(markups)],
    racks: [],
    bidDefaults: {} as never,
    connections,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("network config helpers", () => {
  it("finds any device type connected to a switch", () => {
    const sw = device({ id: "sw", tag: "SW-01", deviceId: "net-switch-poe" });
    const cam = device({ id: "cam", tag: "CAM-01", deviceId: "cam-dome", category: "cameras" });
    const ap = device({ id: "ap", tag: "AP-01", deviceId: "net-ap-i", category: "network" });
    const controller = device({
      id: "acp",
      tag: "ACP-01",
      deviceId: "ac-controller",
      category: "access",
    });
    const p = project([sw, cam, ap, controller], [
      { id: "c1", fromTag: "CAM-01", fromPort: "ETH 0", toTag: "SW-01", toPort: "Port 1" },
      { id: "c2", fromTag: "SW-01", fromPort: "Port 2", toTag: "AP-01", toPort: "ETH 0" },
      { id: "c3", fromTag: "ACP-01", fromPort: "ETH 0", toTag: "SW-01", toPort: "Port 3" },
    ]);

    expect(connectedDevicesForSwitch(p, sw).map((row) => row.device.tag)).toEqual([
      "CAM-01",
      "AP-01",
      "ACP-01",
    ]);
  });

  it("assigns default IP config to new network-addressable devices without collisions", () => {
    const existing = device({
      id: "cam-1",
      tag: "CAM-01",
      deviceId: "cam-dome",
      category: "cameras",
      systemConfig: { network: { ipAddress: "192.168.1.100" } },
    });
    const p = project([existing]);
    const next = withDefaultNetworkConfig(
      device({ id: "cam-2", tag: "CAM-02", deviceId: "cam-dome", category: "cameras" }),
      p,
    );

    expect(next.systemConfig?.network).toMatchObject({
      ipAddress: "192.168.1.101",
      subnetMask: "255.255.255.0",
      gateway: "192.168.1.1",
      vlan: DEFAULT_VLAN,
      hostname: "cam-02",
    });
  });

  it("defaults blank connected device VLANs to 1 without changing manual IPs", () => {
    const sw = device({ id: "sw", tag: "SW-01" });
    const cam = device({
      id: "cam",
      tag: "CAM-01",
      deviceId: "cam-dome",
      category: "cameras",
      systemConfig: { network: { ipAddress: "192.168.1.88" } },
    });
    const p = project([sw, cam], [
      { id: "c1", fromTag: "CAM-01", toTag: "SW-01", toPort: "Port 1" },
    ]);

    const result = buildAutoIpAssignmentPatches(p, sw);

    expect(result.assigned).toBe(0);
    expect(result.patches.cam.network).toMatchObject({
      ipAddress: "192.168.1.88",
      vlan: DEFAULT_VLAN,
      hostname: "cam-01",
    });
  });

  it("auto-assigns blank connected IPs while preserving manual IPs", () => {
    const sw = device({
      id: "sw",
      tag: "SW-01",
      systemConfig: {
        network: { ipAddress: "10.20.30.2", subnetMask: "255.255.255.0", gateway: "10.20.30.1" },
        switchConfig: { managementVlan: 20 },
      },
    });
    const manual = device({
      id: "manual",
      tag: "CAM-01",
      deviceId: "cam-dome",
      category: "cameras",
      systemConfig: { network: { ipAddress: "10.20.30.100" } },
    });
    const blank = device({ id: "blank", tag: "AP-01", deviceId: "net-ap-i" });
    const p = project([sw, manual, blank], [
      { id: "c1", fromTag: "CAM-01", toTag: "SW-01", toPort: "Port 1" },
      { id: "c2", fromTag: "AP-01", toTag: "SW-01", toPort: "Port 2" },
    ]);

    const result = buildAutoIpAssignmentPatches(p, sw, { startIp: "10.20.30.100" });

    expect(result.assigned).toBe(1);
    expect(result.patches.manual.network).toMatchObject({
      ipAddress: "10.20.30.100",
      vlan: 20,
    });
    expect(result.patches.blank.network).toMatchObject({
      ipAddress: "10.20.30.101",
      subnetMask: "255.255.255.0",
      gateway: "10.20.30.1",
      vlan: 20,
      hostname: "ap-01",
    });
  });

  it("repairs colliding connected IPs without changing unique manual IPs", () => {
    const sw = device({ id: "sw", tag: "SW-01" });
    const duplicate = device({
      id: "cam",
      tag: "CAM-01",
      deviceId: "cam-dome",
      category: "cameras",
      systemConfig: { network: { ipAddress: "192.168.1.50" } },
    });
    const existing = device({
      id: "existing",
      tag: "CAM-00",
      deviceId: "cam-dome",
      category: "cameras",
      systemConfig: { network: { ipAddress: "192.168.1.50" } },
    });
    const unique = device({
      id: "ap",
      tag: "AP-01",
      deviceId: "net-ap-i",
      systemConfig: { network: { ipAddress: "192.168.1.88" } },
    });
    const p = project([sw, duplicate, existing, unique], [
      { id: "c1", fromTag: "CAM-01", toTag: "SW-01", toPort: "Port 1" },
      { id: "c2", fromTag: "AP-01", toTag: "SW-01", toPort: "Port 2" },
    ]);

    const result = buildAutoIpAssignmentPatches(p, sw, { startIp: "192.168.1.100" });

    expect(result.patches.cam.network?.ipAddress).toBe("192.168.1.100");
    expect(result.patches.ap.network).toMatchObject({
      ipAddress: "192.168.1.88",
      vlan: DEFAULT_VLAN,
    });
  });

  it("only overwrites existing IPs when requested", () => {
    const sw = device({ id: "sw", tag: "SW-01" });
    const cam = device({
      id: "cam",
      tag: "CAM-01",
      deviceId: "cam-dome",
      category: "cameras",
      systemConfig: { network: { ipAddress: "172.16.1.44" } },
    });
    const p = project([sw, cam], [
      { id: "c1", fromTag: "CAM-01", toTag: "SW-01", toPort: "Port 1" },
    ]);

    expect(buildAutoIpAssignmentPatches(p, sw, { startIp: "172.16.1.100" }).assigned).toBe(0);
    expect(
      buildAutoIpAssignmentPatches(p, sw, {
        startIp: "172.16.1.100",
        vlan: 7,
        overwrite: true,
      }).patches.cam.network,
    ).toMatchObject({
      ipAddress: "172.16.1.100",
      vlan: 7,
    });
  });
});
