// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { devicesById, effectiveDevicePorts } from "../src/data/devices";
import { wallOutletDevices, wallOutletId } from "../src/data/wallOutlets";
import { defaultBidDefaults } from "../src/data/defaults";
import { cablesById } from "../src/data/cables";
import { computeBid } from "../src/lib/bid";
import { resolveCoverage } from "../src/lib/coverage";
import { connectionDiagramTags, withAutoAssignedConnectionPorts } from "../src/lib/connections";
import { buildAutoIpAssignmentPatches, isNetworkAddressableDevice, isSwitchLikeDevice } from "../src/lib/networkConfig";
import { parseProjectFileText, serializeProjectFile } from "../src/lib/projectFile";
import { validateProject } from "../src/lib/validation";
import { selectEntities } from "../src/reports/engine";
import { useProjectStore, type DeviceConnection, type DeviceMarkup, type Project } from "../src/store/projectStore";

const twoPortId = wallOutletId({ gangs: 1, sockets: 2, category: "cat6" });
const sixPortId = wallOutletId({ gangs: 2, sockets: 6, category: "cat5e" });
const outlet = (patch: Partial<DeviceMarkup> = {}): DeviceMarkup => ({
  id: "outlet", kind: "device", deviceId: twoPortId, category: "network", layer: "network",
  tag: "DATA-01", x: 100, y: 100, ...patch,
});
const switchDevice = outlet({ id: "switch", deviceId: "net-switch-poe", tag: "SW-01" });
const camera = outlet({ id: "camera", deviceId: "cam-dome", category: "cameras", tag: "CAM-01" });
const rearConnection: DeviceConnection = {
  id: "rear", fromTag: "SW-01", fromPortId: "port-1", toTag: "DATA-01", toPortId: "socket-1-rear", medium: "cat6",
};
const frontConnection: DeviceConnection = {
  id: "front", fromTag: "DATA-01", fromPortId: "socket-1-front", toTag: "CAM-01", toPortId: "eth0", medium: "cat6",
};

function project(markups: DeviceMarkup[] = [outlet(), switchDevice, camera], connections: DeviceConnection[] = []): Project {
  return {
    id: "outlet-project",
    meta: { projectName: "Wall outlets", projectNumber: "", client: "", location: "", drawnBy: "", date: "2026-10-16", revision: "0" },
    sheets: [{ id: "sheet", name: "Plan", fileName: "", pageWidth: 800, pageHeight: 600, renderScale: 1, markups }],
    connections, racks: [], bidDefaults: defaultBidDefaults, createdAt: 0, updatedAt: 0,
  };
}

function currentOutlet(): DeviceMarkup {
  return useProjectStore.getState().project!.sheets[0].markups[0] as DeviceMarkup;
}

describe("network wall outlets", () => {
  beforeEach(() => useProjectStore.getState().loadProject(project()));

  it.each(wallOutletDevices)("provides paired passive terminals for $label", (device) => {
    const ports = effectiveDevicePorts(device.id, undefined)!;
    expect(ports).toHaveLength(device.wallOutlet!.sockets * 2);
    expect(new Set(ports.map((port) => port.id)).size).toBe(ports.length);
    expect(ports.every((port) => port.kind === "ethernet" && !port.speed && !port.poe)).toBe(true);
    expect(devicesById[device.id]).toBeDefined();
    expect(isNetworkAddressableDevice(outlet({ deviceId: device.id }))).toBe(false);
    expect(isSwitchLikeDevice(outlet({ deviceId: device.id }))).toBe(false);
    expect(resolveCoverage(outlet({ deviceId: device.id }))).toBeNull();
  });

  it("keeps front and rear cables distinct in validation, reports, and diagram endpoints", () => {
    const connected = project(undefined, [rearConnection, frontConnection]);
    expect(validateProject(connected).filter((issue) => issue.code === "duplicate-connection-port")).toEqual([]);
    const rows = selectEntities(connected, "ports").filter((row) => row.deviceTag === "DATA-01");
    expect(rows).toHaveLength(4);
    expect(rows.filter((row) => row.isConnected).map((row) => row.connectedTo)).toEqual(["SW-01", "CAM-01"]);
    expect(connected.connections!.map(connectionDiagramTags)).toEqual([
      { fromTag: "SW-01", toTag: "DATA-01" }, { fromTag: "DATA-01", toTag: "CAM-01" },
    ]);
  });

  it("auto-assigns cable runs to free rear terminals without consuming front sockets", () => {
    const connected = project(undefined, [rearConnection]);
    const next = withAutoAssignedConnectionPorts(connected, { ...rearConnection, id: "second", fromPortId: "port-2", toPortId: undefined });
    expect(next.toPortId).toBe("socket-2-rear");
    connected.connections!.push(next);
    const exhausted = withAutoAssignedConnectionPorts(connected, { ...rearConnection, id: "third", fromPortId: "port-3", toPortId: undefined });
    expect(exhausted.toPortId).toBeUndefined();
  });

  it("does not assign network identity on placement, duplication, or switch connection", () => {
    const store = useProjectStore.getState();
    store.loadProject(project([switchDevice]));
    store.addMarkup(outlet());
    store.addConnection(rearConnection);
    const placed = useProjectStore.getState().project!;
    expect((placed.sheets[0].markups[1] as DeviceMarkup).systemConfig?.network).toBeUndefined();
    expect(buildAutoIpAssignmentPatches(placed, switchDevice, { overwrite: true }).patches).toEqual({});
    store.setSelected(["outlet"]);
    store.duplicateSelectedMarkups();
    const copy = useProjectStore.getState().project!.sheets[0].markups[2] as DeviceMarkup;
    expect(copy.tag).toBe("DATA-02");
    expect(copy.systemConfig?.network).toBeUndefined();
  });

  it("preserves existing links and instance data when changing configuration, with undo/redo", () => {
    const store = useProjectStore.getState();
    store.loadProject(project([outlet({ labelOverride: "Office", costOverride: 30 })], [rearConnection, frontConnection]));
    store.updateMarkup("outlet", { deviceId: sixPortId });
    expect(currentOutlet()).toMatchObject({ deviceId: sixPortId, tag: "DATA-01", labelOverride: "Office", costOverride: 30 });
    expect(useProjectStore.getState().project!.connections).toEqual([rearConnection, frontConnection]);
    store.undo();
    expect(currentOutlet().deviceId).toBe(twoPortId);
    store.redo();
    expect(currentOutlet().deviceId).toBe(sixPortId);
  });

  it.each(["from", "to", "internal", "legacy"])("blocks removing an occupied %s terminal without changing history", (side) => {
    const connection: DeviceConnection = side === "from"
      ? { ...frontConnection, fromPortId: "socket-6-front" }
      : side === "internal"
        ? { ...rearConnection, toTag: "RACK-01", toPortId: undefined, internalEndpoint: { containerId: "rack", containerTag: "RACK-01", deviceId: "outlet", deviceTag: "DATA-01", portId: "socket-6-rear" } }
        : side === "legacy"
          ? { ...rearConnection, toPortId: undefined, toPort: "Socket 6 rear (cable)" }
          : { ...rearConnection, toPortId: "socket-6-rear" };
    const store = useProjectStore.getState();
    store.loadProject(project([outlet({ deviceId: sixPortId })], [connection]));
    const before = useProjectStore.getState().project;
    store.updateMarkup("outlet", { deviceId: twoPortId });
    expect(useProjectStore.getState().project).toBe(before);
    expect(useProjectStore.getState().history.past).toHaveLength(0);
    expect(useProjectStore.getState().toasts.at(-1)?.message).toContain("Disconnect Socket 6");
  });

  it("allows reducing unconnected sockets and preserves custom ports instead of silently replacing them", () => {
    const store = useProjectStore.getState();
    store.loadProject(project([outlet({ deviceId: sixPortId })], [rearConnection]));
    store.updateMarkup("outlet", { deviceId: twoPortId });
    expect(currentOutlet().deviceId).toBe(twoPortId);
    store.updateMarkup("outlet", { instancePorts: [{ id: "custom", label: "Custom", kind: "ethernet" }] });
    expect(currentOutlet().instancePorts).toBeUndefined();
    store.loadProject(project([outlet({ instancePorts: [{ id: "custom", label: "Custom", kind: "ethernet" }] })]));
    store.updateMarkup("outlet", { deviceId: sixPortId });
    expect(currentOutlet().deviceId).toBe(twoPortId);
    expect(currentOutlet().instancePorts?.[0].id).toBe("custom");
  });

  it("groups bid quantities by assembly and honors catalog pricing overrides", () => {
    const configured = project([outlet(), outlet({ id: "second", tag: "DATA-02" }), outlet({ id: "six", tag: "DATA-03", deviceId: sixPortId })]);
    configured.catalogOverrides = { devices: { [twoPortId]: { cost: 25, labor: 0.75 } } };
    const lines = computeBid(configured).devices;
    expect(lines).toHaveLength(2);
    expect(lines.find((line) => line.deviceId === twoPortId)).toMatchObject({ qty: 2, extCost: 50, calculatedLabor: 1.5 });
    expect(lines.find((line) => line.deviceId === sixPortId)?.qty).toBe(1);
    expect(cablesById.cat5e.label).toBe("Cat5e UTP");
  });

  it("round-trips outlet variants and both cable endpoints through a portable project", async () => {
    const original = project([outlet({ deviceId: sixPortId }), switchDevice, camera], [rearConnection, frontConnection]);
    const restored = await parseProjectFileText(serializeProjectFile(original));
    expect(restored.sheets[0].markups).toEqual(original.sheets[0].markups);
    expect(restored.connections).toEqual(original.connections);
    expect(selectEntities(restored, "ports").filter((row) => row.deviceTag === "DATA-01")).toHaveLength(12);
  });
});
