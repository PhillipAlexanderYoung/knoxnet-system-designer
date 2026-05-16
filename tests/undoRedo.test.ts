// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useProjectStore,
  type CableMarkup,
  type DeviceConnection,
  type DeviceMarkup,
  type Project,
  type ScheduleMarkup,
  type Sheet,
} from "../src/store/projectStore";
import { buildCableRunMarkup, endpointFromMarkup } from "../src/lib/cableRuns";
import { isDevicePortInUse, withAutoAssignedConnectionPorts } from "../src/lib/connections";
import { connectedDevicesForSwitch } from "../src/lib/networkConfig";
import { scheduleBlockContent } from "../src/lib/scheduleBlocks";
import { selectEntities } from "../src/reports/engine";

const device = (overrides: Partial<DeviceMarkup> = {}): DeviceMarkup => ({
  id: "device-1",
  kind: "device",
  layer: "network",
  category: "network",
  deviceId: "net-switch-poe",
  x: 10,
  y: 20,
  tag: "SW-01",
  ...overrides,
});

const cable = (overrides: Partial<CableMarkup> = {}): CableMarkup => ({
  id: "cable-1",
  kind: "cable",
  layer: "cable",
  cableId: "cat6",
  points: [0, 0, 50, 0],
  ...overrides,
});

const sheet = (markups: Sheet["markups"]): Sheet => ({
  id: "sheet-1",
  name: "Plan",
  fileName: "plan.pdf",
  pageWidth: 800,
  pageHeight: 600,
  renderScale: 1,
  markups,
});

const project = (markups: Sheet["markups"]): Project => ({
  id: "project-1",
  meta: {
    projectName: "Undo Test",
    projectNumber: "001",
    client: "",
    location: "",
    drawnBy: "",
    date: new Date(0).toISOString(),
    revision: "0",
  },
  sheets: [sheet(markups)],
  racks: [],
  bidDefaults: { slackPercent: 10 } as never,
  createdAt: 0,
  updatedAt: 0,
});

const schedule = (overrides: Partial<ScheduleMarkup> = {}): ScheduleMarkup => ({
  id: "sched-1",
  kind: "schedule",
  layer: "annotation",
  targetId: "device-1",
  targetKind: "device",
  x: 0,
  y: 0,
  ...overrides,
});

function activeMarkup<T extends Sheet["markups"][number]>(id: string): T {
  const markup = useProjectStore
    .getState()
    .project!.sheets[0].markups.find((m) => m.id === id);
  expect(markup).toBeTruthy();
  return markup as T;
}

describe("project undo/redo", () => {
  beforeEach(() => {
    useProjectStore.getState().loadProject(project([device(), cable()]));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("undoes and redoes device moves", () => {
    useProjectStore.getState().moveDeviceMarkup("device-1", 100, 120);

    expect(activeMarkup<DeviceMarkup>("device-1")).toMatchObject({ x: 100, y: 120 });
    expect(useProjectStore.getState().history.past).toHaveLength(1);

    useProjectStore.getState().undo();
    expect(activeMarkup<DeviceMarkup>("device-1")).toMatchObject({ x: 10, y: 20 });

    useProjectStore.getState().redo();
    expect(activeMarkup<DeviceMarkup>("device-1")).toMatchObject({ x: 100, y: 120 });
  });

  it("coalesces drag transactions into one undo step", () => {
    const store = useProjectStore.getState();
    store.beginHistoryTransaction();
    store.moveDeviceMarkup("device-1", 20, 30);
    store.moveDeviceMarkup("device-1", 40, 50);
    store.moveDeviceMarkup("device-1", 80, 90);
    store.endHistoryTransaction();

    expect(activeMarkup<DeviceMarkup>("device-1")).toMatchObject({ x: 80, y: 90 });
    expect(useProjectStore.getState().history.past).toHaveLength(1);

    useProjectStore.getState().undo();
    expect(activeMarkup<DeviceMarkup>("device-1")).toMatchObject({ x: 10, y: 20 });
  });

  it("rate-limits locked-device move hints outside project history", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const store = useProjectStore.getState();

    store.notifyLockedDeviceMoveAttempt();
    const first = useProjectStore.getState().lockMoveHint;

    expect(first).toMatchObject({
      message: "Devices are locked. Unlock to move.",
      shownAt: 1000,
      pulseKey: 1000,
    });
    expect(useProjectStore.getState().history.past).toHaveLength(0);

    vi.setSystemTime(2000);
    useProjectStore.getState().notifyLockedDeviceMoveAttempt();
    expect(useProjectStore.getState().lockMoveHint).toBe(first);

    vi.setSystemTime(2600);
    useProjectStore.getState().notifyLockedDeviceMoveAttempt();
    expect(useProjectStore.getState().lockMoveHint).toMatchObject({
      shownAt: 2600,
      pulseKey: 2600,
    });
    expect(useProjectStore.getState().history.past).toHaveLength(0);
  });

  it("keeps canvas viewport changes outside undo history", () => {
    const store = useProjectStore.getState();

    store.setViewport({ scale: 2, x: -120, y: 80 });

    expect(useProjectStore.getState().viewport).toMatchObject({
      scale: 2,
      x: -120,
      y: 80,
    });
    expect(useProjectStore.getState().history.past).toHaveLength(0);

    store.undo();
    expect(useProjectStore.getState().viewport).toMatchObject({
      scale: 2,
      x: -120,
      y: 80,
    });
  });

  it("restores in-memory viewport per sheet", () => {
    useProjectStore.getState().loadProject({
      ...project([]),
      sheets: [
        sheet([]),
        {
          ...sheet([]),
          id: "sheet-2",
          name: "Second Floor",
          fileName: "second.pdf",
        },
      ],
    });
    const store = useProjectStore.getState();

    store.setViewport({ scale: 3, x: -300, y: 40 });
    store.setActiveSheet("sheet-2");
    store.setViewport({ scale: 1.5, x: 12, y: -18 });
    store.setActiveSheet("sheet-1");

    expect(useProjectStore.getState().viewport).toMatchObject({
      scale: 3,
      x: -300,
      y: 40,
    });

    useProjectStore.getState().setActiveSheet("sheet-2");
    expect(useProjectStore.getState().viewport).toMatchObject({
      scale: 1.5,
      x: 12,
      y: -18,
    });
  });

  it("undoes cable route, label offset, and property edits", () => {
    const store = useProjectStore.getState();
    store.updateMarkup("cable-1", {
      cableId: "conduit",
      labelOffsetX: 18,
      labelOffsetY: -24,
      points: [0, 0, 25, 25, 50, 0],
    } as Partial<CableMarkup>);

    expect(activeMarkup<CableMarkup>("cable-1")).toMatchObject({
      cableId: "conduit",
      labelOffsetX: 18,
      labelOffsetY: -24,
      points: [0, 0, 25, 25, 50, 0],
    });

    store.undo();
    expect(activeMarkup<CableMarkup>("cable-1")).toMatchObject({
      cableId: "cat6",
      points: [0, 0, 50, 0],
    });
    expect(activeMarkup<CableMarkup>("cable-1").labelOffsetX).toBeUndefined();
    expect(activeMarkup<CableMarkup>("cable-1").labelOffsetY).toBeUndefined();

    store.redo();
    expect(activeMarkup<CableMarkup>("cable-1")).toMatchObject({
      cableId: "conduit",
      labelOffsetX: 18,
      labelOffsetY: -24,
      points: [0, 0, 25, 25, 50, 0],
    });
  });

  it("undoes batched device system config edits in one step", () => {
    const store = useProjectStore.getState();
    store.loadProject(
      project([
        device({ id: "cam-1", tag: "CAM-01", deviceId: "cam-dome", category: "cameras" }),
        device({ id: "ap-1", tag: "AP-01", deviceId: "net-ap-i" }),
      ]),
    );

    store.updateDeviceSystemConfigs({
      "cam-1": { network: { ipAddress: "192.168.1.100" } },
      "ap-1": { network: { ipAddress: "192.168.1.101" } },
    });

    expect(activeMarkup<DeviceMarkup>("cam-1").systemConfig?.network?.ipAddress).toBe(
      "192.168.1.100",
    );
    expect(activeMarkup<DeviceMarkup>("ap-1").systemConfig?.network?.ipAddress).toBe(
      "192.168.1.101",
    );
    expect(useProjectStore.getState().history.past).toHaveLength(1);

    store.undo();
    expect(activeMarkup<DeviceMarkup>("cam-1").systemConfig).toBeUndefined();
    expect(activeMarkup<DeviceMarkup>("ap-1").systemConfig).toBeUndefined();
  });

  it("undoes and redoes auto-assigned connection ports with the connection", () => {
    const store = useProjectStore.getState();
    store.loadProject(
      project([
        device({ id: "sw-1", tag: "SW-01", deviceId: "net-switch-poe" }),
        device({
          id: "cam-1",
          tag: "CAM-01",
          deviceId: "cam-dome",
          category: "cameras",
        }),
      ]),
    );
    store.clearHistory();

    store.addConnection({
      id: "conn-1",
      fromTag: "CAM-01",
      toTag: "SW-01",
      medium: "cat6",
    });

    expect(useProjectStore.getState().project?.connections?.[0]).toMatchObject({
      fromPortId: "eth0",
      fromPort: "ETH 0 (PoE in)",
      toPortId: "port-1",
      toPort: "Port 1",
    });
    expect(useProjectStore.getState().history.past).toHaveLength(1);

    store.undo();
    expect(useProjectStore.getState().project?.connections ?? []).toHaveLength(0);

    store.redo();
    expect(useProjectStore.getState().project?.connections?.[0]).toMatchObject({
      fromPortId: "eth0",
      toPortId: "port-1",
    });
  });

  it("auto-assigns connected device IP config with a new switch connection", () => {
    const store = useProjectStore.getState();
    store.loadProject(
      project([
        device({
          id: "sw-1",
          tag: "SW-01",
          deviceId: "net-switch-poe",
          systemConfig: {
            network: { ipAddress: "10.10.30.2", gateway: "10.10.30.1" },
            switchConfig: { managementVlan: 30 },
          },
        }),
        device({
          id: "cam-1",
          tag: "CAM-01",
          deviceId: "cam-dome",
          category: "cameras",
        }),
      ]),
    );
    store.clearHistory();

    store.addConnection({
      id: "conn-1",
      fromTag: "CAM-01",
      toTag: "SW-01",
      medium: "cat6",
    });

    expect(activeMarkup<DeviceMarkup>("cam-1").systemConfig?.network).toMatchObject({
      ipAddress: "10.10.30.100",
      gateway: "10.10.30.1",
      vlan: 30,
      hostname: "cam-01",
    });
    expect(activeMarkup<DeviceMarkup>("cam-1").systemConfig?.switchPort).toBe("SW-01 Port 1");
    expect(useProjectStore.getState().history.past).toHaveLength(1);

    store.undo();
    expect(useProjectStore.getState().project?.connections ?? []).toHaveLength(0);
    expect(activeMarkup<DeviceMarkup>("cam-1").systemConfig).toBeUndefined();

    store.redo();
    expect(activeMarkup<DeviceMarkup>("cam-1").systemConfig?.network?.ipAddress).toBe("10.10.30.100");
  });

  it("repairs conflicting switch ports during connection updates", () => {
    const store = useProjectStore.getState();
    store.loadProject(
      project([
        device({ id: "sw-1", tag: "SW-01", deviceId: "net-switch-poe" }),
        device({ id: "cam-1", tag: "CAM-01", deviceId: "cam-dome", category: "cameras" }),
        device({ id: "cam-2", tag: "CAM-02", deviceId: "cam-dome", category: "cameras" }),
      ]),
    );
    store.clearHistory();

    store.addConnection({
      id: "conn-1",
      fromTag: "CAM-01",
      toTag: "SW-01",
      toPortId: "port-1",
      medium: "cat6",
    });
    store.addConnection({
      id: "conn-2",
      fromTag: "CAM-02",
      toTag: "SW-01",
      toPortId: "port-1",
      medium: "cat6",
    });

    const ports = useProjectStore.getState().project?.connections?.map((conn) => conn.toPortId);
    expect(ports).toEqual(["port-1", "port-2"]);
    expect(activeMarkup<DeviceMarkup>("cam-2").systemConfig?.network?.vlan).toBe(1);
  });

  it("undoes nesting and unnesting changes", () => {
    const headEnd = device({
      id: "headend-1",
      deviceId: "net-headend",
      tag: "HE-01",
      x: 200,
      y: 200,
    });
    const child = device({ id: "child-1", tag: "SW-02", x: 40, y: 40 });
    useProjectStore.getState().loadProject(project([headEnd, child]));

    useProjectStore.getState().moveDeviceMarkup("child-1", 202, 198);
    expect(activeMarkup<DeviceMarkup>("child-1").parentId).toBe("headend-1");

    useProjectStore.getState().undo();
    expect(activeMarkup<DeviceMarkup>("child-1")).toMatchObject({
      x: 40,
      y: 40,
    });
    expect(activeMarkup<DeviceMarkup>("child-1").parentId).toBeUndefined();

    useProjectStore.getState().redo();
    expect(activeMarkup<DeviceMarkup>("child-1").parentId).toBe("headend-1");
  });

  it("undoes internal endpoint assignment and cable re-anchor together", () => {
    const headEnd = device({
      id: "he-1",
      deviceId: "net-headend",
      tag: "HE-01",
      x: 10,
      y: 10,
    });
    const bridge = device({
      id: "br-1",
      deviceId: "net-wifi-bridge",
      tag: "BR-01",
      x: 100,
      y: 10,
    });
    const sw = device({
      id: "sw-1",
      tag: "SW-01",
      x: 24,
      y: 10,
      parentId: "he-1",
    });
    const run = buildCableRunMarkup("run-1", "cat6", [
      endpointFromMarkup(headEnd)!,
      endpointFromMarkup(bridge)!,
    ]);
    const conn: DeviceConnection = {
      id: "link-1",
      fromTag: "HE-01",
      toTag: "BR-01",
      medium: "cat6",
      cableMarkupId: "run-1",
    };
    useProjectStore.getState().loadProject(project([headEnd, bridge, sw, run]));
    useProjectStore.getState().addConnection(conn);
    useProjectStore.getState().clearHistory();

    useProjectStore.getState().updateConnection("link-1", {
      internalEndpoint: {
        containerId: "he-1",
        containerTag: "HE-01",
        deviceId: "sw-1",
        deviceTag: "SW-01",
      },
    });

    expect(activeMarkup<CableMarkup>("run-1").points).toEqual([28, 10, 100, 10]);
    expect(
      useProjectStore.getState().project!.connections?.find((c) => c.id === "link-1")
        ?.internalEndpoint,
    ).toMatchObject({ portId: "port-1", port: "Port 1" });
    expect(useProjectStore.getState().history.past).toHaveLength(1);

    useProjectStore.getState().undo();
    expect(activeMarkup<CableMarkup>("run-1").points).toEqual([10, 10, 100, 10]);
    expect(
      useProjectStore.getState().project!.connections?.find((c) => c.id === "link-1")
        ?.internalEndpoint,
    ).toBeUndefined();

    useProjectStore.getState().redo();
    expect(activeMarkup<CableMarkup>("run-1").points).toEqual([28, 10, 100, 10]);
    expect(
      useProjectStore.getState().project!.connections?.find((c) => c.id === "link-1")
        ?.internalEndpoint,
    ).toMatchObject({ portId: "port-1", port: "Port 1" });
  });

  it.each([
    {
      name: "camera copper run",
      endpoint: device({ id: "cam-1", tag: "CAM-01", deviceId: "cam-dome", category: "cameras", x: 80 }),
      cableId: "cat6",
      expectedSwitchPortId: "port-1",
      expectedSwitchPort: "SW-01 Port 1",
    },
    {
      name: "AP copper run",
      endpoint: device({ id: "ap-1", tag: "AP-01", deviceId: "net-ap-i", category: "network", x: 80 }),
      cableId: "cat6",
      expectedSwitchPortId: "port-1",
      expectedSwitchPort: "SW-01 Port 1",
    },
    {
      name: "fiber SFP run",
      endpoint: device({
        id: "nid-1",
        tag: "NID-01",
        deviceId: "net-nid",
        category: "network",
        x: 80,
      }),
      cableId: "fiber-sm",
      expectedSwitchPortId: "sfp-1",
      expectedSwitchPort: "SW-01 SFP+ 1",
    },
  ])(
    "deletes linked connection, switch occupancy, reports, and schedules for $name",
    ({ endpoint, cableId, expectedSwitchPortId, expectedSwitchPort }) => {
      const store = useProjectStore.getState();
      const sw = device({ id: "sw-1", tag: "SW-01", deviceId: "net-switch-poe", x: 10 });
      const run = buildCableRunMarkup("run-1", cableId, [
        endpointFromMarkup(endpoint)!,
        endpointFromMarkup(sw)!,
      ]);
      const switchSchedule = schedule({ id: "switch-sched", targetId: "sw-1", targetKind: "device" });
      const runSchedule = schedule({ id: "run-sched", targetId: "run-1", targetKind: "cable" });
      const base = project([sw, endpoint, run, switchSchedule, runSchedule]);
      const conn: DeviceConnection = {
        id: "conn-1",
        fromTag: endpoint.tag,
        toTag: "SW-01",
        medium: cableId,
        cableMarkupId: "run-1",
      };
      store.loadProject(base);
      store.addConnection(conn);
      store.clearHistory();

      expect(connectedDevicesForSwitch(useProjectStore.getState().project!, sw).map((row) => row.device.tag)).toEqual([
        endpoint.tag,
      ]);
      expect(isDevicePortInUse(useProjectStore.getState().project!, sw, expectedSwitchPortId)).toBe(true);
      expect(activeMarkup<DeviceMarkup>(endpoint.id).systemConfig?.switchPort).toBe(expectedSwitchPort);

      store.deleteMarkup("run-1");

      const afterDelete = useProjectStore.getState().project!;
      const afterSw = activeMarkup<DeviceMarkup>("sw-1");
      const afterSwitchSchedule = activeMarkup<ScheduleMarkup>("switch-sched");
      expect(afterDelete.connections ?? []).toHaveLength(0);
      expect(afterDelete.sheets[0].markups.some((m) => m.id === "run-1")).toBe(false);
      expect(afterDelete.sheets[0].markups.some((m) => m.id === "run-sched")).toBe(false);
      expect(connectedDevicesForSwitch(afterDelete, afterSw)).toEqual([]);
      expect(isDevicePortInUse(afterDelete, afterSw, expectedSwitchPortId)).toBe(false);
      expect(activeMarkup<DeviceMarkup>(endpoint.id).systemConfig?.switchPort).toBeUndefined();
      expect(selectEntities(afterDelete, "connections")).toHaveLength(0);
      expect(selectEntities(afterDelete, "cables")).toHaveLength(0);
      expect(
        selectEntities(afterDelete, "ports").find(
          (row) =>
            row.deviceTag === "SW-01" &&
            (row.port as { id: string }).id === expectedSwitchPortId,
        ),
      ).toMatchObject({ isConnected: false, connectedTo: "" });
      expect(
        scheduleBlockContent(afterDelete, afterDelete.sheets[0], afterSwitchSchedule).rows.join("\n"),
      ).not.toContain(endpoint.tag);

      store.undo();
      const restored = useProjectStore.getState().project!;
      const restoredSw = activeMarkup<DeviceMarkup>("sw-1");
      expect(restored.connections).toHaveLength(1);
      expect(activeMarkup<CableMarkup>("run-1").id).toBe("run-1");
      expect(activeMarkup<ScheduleMarkup>("run-sched").targetId).toBe("run-1");
      expect(connectedDevicesForSwitch(restored, restoredSw).map((row) => row.device.tag)).toEqual([
        endpoint.tag,
      ]);
      expect(isDevicePortInUse(restored, restoredSw, expectedSwitchPortId)).toBe(true);

      store.redo();
      expect(useProjectStore.getState().project?.connections ?? []).toHaveLength(0);
      expect(useProjectStore.getState().project?.sheets[0].markups.some((m) => m.id === "run-1")).toBe(
        false,
      );
    },
  );

  it("removing a logical SFP connection frees the switch port and connected-device row", () => {
    const store = useProjectStore.getState();
    const sw = device({ id: "sw-1", tag: "SW-01", deviceId: "net-switch-poe", x: 10 });
    const nid = device({
      id: "nid-1",
      tag: "NID-01",
      deviceId: "net-nid",
      category: "network",
      x: 80,
    });
    const base = project([sw, nid]);
    const conn: DeviceConnection = {
      id: "fiber-link",
      fromTag: "NID-01",
      toTag: "SW-01",
      medium: "fiber-sm",
    };
    store.loadProject(base);
    store.addConnection(conn);
    store.clearHistory();
    const savedConn = useProjectStore.getState().project?.connections?.[0];

    expect(savedConn?.toPortId).toBe("sfp-1");
    expect(connectedDevicesForSwitch(useProjectStore.getState().project!, sw)).toHaveLength(1);
    expect(activeMarkup<DeviceMarkup>("nid-1").systemConfig?.switchPort).toBe("SW-01 SFP+ 1");

    store.removeConnection("fiber-link");

    const afterDelete = useProjectStore.getState().project!;
    const afterSw = activeMarkup<DeviceMarkup>("sw-1");
    expect(afterDelete.connections ?? []).toHaveLength(0);
    expect(connectedDevicesForSwitch(afterDelete, afterSw)).toEqual([]);
    expect(isDevicePortInUse(afterDelete, afterSw, "sfp-1")).toBe(false);
    expect(activeMarkup<DeviceMarkup>("nid-1").systemConfig?.switchPort).toBeUndefined();

    store.undo();
    expect(useProjectStore.getState().project?.connections).toHaveLength(1);
    expect(isDevicePortInUse(useProjectStore.getState().project!, activeMarkup("sw-1"), "sfp-1")).toBe(
      true,
    );
  });

  it("port remove deletes a linked fiber run and frees both switch visuals", () => {
    const store = useProjectStore.getState();
    const swA = device({ id: "sw-a", tag: "SW-A", deviceId: "net-switch-poe", x: 10 });
    const swB = device({ id: "sw-b", tag: "SW-B", deviceId: "net-switch-poe", x: 100 });
    const run = buildCableRunMarkup(
      "fiber-run",
      "fiber-sm",
      [endpointFromMarkup(swA)!, endpointFromMarkup(swB)!],
      {
        physicalLabel: "SMF-001",
        fiberStrandCount: 24,
        serviceLoopFt: 15,
      },
    );
    const base = project([swA, swB, run, schedule({ id: "fiber-sched", targetId: "fiber-run", targetKind: "cable" })]);
    const conn: DeviceConnection = {
      id: "fiber-link",
      fromTag: "SW-A",
      toTag: "SW-B",
      medium: "fiber-sm",
      cableMarkupId: "fiber-run",
    };
    store.loadProject(base);
    store.addConnection(conn);
    store.clearHistory();
    const savedConn = useProjectStore.getState().project?.connections?.[0];

    expect(savedConn?.fromPortId).toBe("sfp-1");
    expect(savedConn?.toPortId).toBe("sfp-1");
    expect(connectedDevicesForSwitch(useProjectStore.getState().project!, swA)).toHaveLength(1);
    expect(connectedDevicesForSwitch(useProjectStore.getState().project!, swB)).toHaveLength(1);

    store.removeConnectionAndCable("fiber-link");

    const afterRemove = useProjectStore.getState().project!;
    expect(afterRemove.connections ?? []).toHaveLength(0);
    expect(afterRemove.sheets[0].markups.some((m) => m.id === "fiber-run")).toBe(false);
    expect(afterRemove.sheets[0].markups.some((m) => m.id === "fiber-sched")).toBe(false);
    expect(isDevicePortInUse(afterRemove, activeMarkup<DeviceMarkup>("sw-a"), "sfp-1")).toBe(false);
    expect(isDevicePortInUse(afterRemove, activeMarkup<DeviceMarkup>("sw-b"), "sfp-1")).toBe(false);
    expect(selectEntities(afterRemove, "connections")).toHaveLength(0);
    expect(selectEntities(afterRemove, "cables")).toHaveLength(0);

    store.undo();
    expect(useProjectStore.getState().project?.connections).toHaveLength(1);
    expect(activeMarkup<CableMarkup>("fiber-run")).toMatchObject({
      physicalLabel: "SMF-001",
      fiberStrandCount: 24,
      serviceLoopFt: 15,
    });
  });

  it("port disconnect leaves fiber run geometry and labels intact but frees the SFP", () => {
    const store = useProjectStore.getState();
    const sw = device({ id: "sw-1", tag: "SW-01", deviceId: "net-switch-poe", x: 10 });
    const nid = device({
      id: "nid-1",
      tag: "NID-01",
      deviceId: "net-nid",
      category: "network",
      x: 90,
    });
    const run = buildCableRunMarkup(
      "fiber-run",
      "fiber-sm",
      [endpointFromMarkup(nid)!, endpointFromMarkup(sw)!],
      {
        physicalLabel: "SMF-DISC",
        fiberStrandCount: 12,
        serviceLoopFt: 20,
      },
    );
    const base = project([sw, nid, run]);
    const conn: DeviceConnection = {
      id: "fiber-link",
      fromTag: "NID-01",
      toTag: "SW-01",
      medium: "fiber-sm",
      cableMarkupId: "fiber-run",
    };
    store.loadProject(base);
    store.addConnection(conn);
    store.clearHistory();

    store.disconnectConnectionFromSwitch("fiber-link", "SW-01");

    const afterDisconnect = useProjectStore.getState().project!;
    const preservedRun = activeMarkup<CableMarkup>("fiber-run");
    expect(afterDisconnect.connections ?? []).toHaveLength(0);
    expect(preservedRun).toMatchObject({
      physicalLabel: "SMF-DISC",
      fiberStrandCount: 12,
      serviceLoopFt: 20,
      points: run.points,
    });
    expect(connectedDevicesForSwitch(afterDisconnect, activeMarkup<DeviceMarkup>("sw-1"))).toEqual([]);
    expect(isDevicePortInUse(afterDisconnect, activeMarkup<DeviceMarkup>("sw-1"), "sfp-1")).toBe(false);
    expect(selectEntities(afterDisconnect, "cables")).toHaveLength(1);

    store.undo();
    expect(useProjectStore.getState().project?.connections).toHaveLength(1);
    expect(isDevicePortInUse(useProjectStore.getState().project!, activeMarkup("sw-1"), "sfp-1")).toBe(
      true,
    );
  });

  it("disconnecting an internal switch endpoint keeps the cable connection at the container", () => {
    const store = useProjectStore.getState();
    const headEnd = device({ id: "he-1", deviceId: "net-headend", tag: "HE-01", x: 10 });
    const bridge = device({ id: "br-1", deviceId: "net-wifi-bridge", tag: "BR-01", x: 100 });
    const sw = device({ id: "sw-1", tag: "SW-01", x: 24, parentId: "he-1" });
    const run = buildCableRunMarkup("run-1", "cat6", [
      endpointFromMarkup(headEnd)!,
      endpointFromMarkup(bridge)!,
    ]);
    const base = project([headEnd, bridge, sw, run]);
    const conn = withAutoAssignedConnectionPorts(base, {
      id: "link-1",
      fromTag: "HE-01",
      toTag: "BR-01",
      medium: "cat6",
      cableMarkupId: "run-1",
      internalEndpoint: {
        containerId: "he-1",
        containerTag: "HE-01",
        deviceId: "sw-1",
        deviceTag: "SW-01",
      },
    });
    store.loadProject({ ...base, connections: [conn] });
    store.clearHistory();

    store.disconnectConnectionFromSwitch("link-1", "SW-01");

    const afterDisconnect = useProjectStore.getState().project!;
    expect(afterDisconnect.connections).toHaveLength(1);
    expect(afterDisconnect.connections?.[0].internalEndpoint).toBeUndefined();
    expect(activeMarkup<CableMarkup>("run-1").id).toBe("run-1");
    expect(connectedDevicesForSwitch(afterDisconnect, activeMarkup<DeviceMarkup>("sw-1"))).toEqual([]);
    expect(isDevicePortInUse(afterDisconnect, activeMarkup<DeviceMarkup>("sw-1"), "port-1")).toBe(false);

    store.undo();
    expect(useProjectStore.getState().project?.connections?.[0].internalEndpoint).toMatchObject({
      portId: "port-1",
    });
  });

  it("multi-markup port hover hints are transient UI state outside history", () => {
    const store = useProjectStore.getState();
    store.loadProject(project([device(), cable()]));
    store.clearHistory();

    store.setHintedMarkups(["device-1", "cable-1"]);

    expect(useProjectStore.getState().hintedMarkupIds).toEqual(["device-1", "cable-1"]);
    expect(useProjectStore.getState().history.past).toHaveLength(0);

    store.setHintedMarkups([]);
    expect(useProjectStore.getState().hintedMarkupId).toBeNull();
  });
});
