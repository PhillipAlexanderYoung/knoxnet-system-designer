// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useProjectStore,
  type CableMarkup,
  type DeviceConnection,
  type DeviceMarkup,
  type Project,
  type Sheet,
} from "../src/store/projectStore";
import { buildCableRunMarkup, endpointFromMarkup } from "../src/lib/cableRuns";

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
    expect(useProjectStore.getState().history.past).toHaveLength(1);

    useProjectStore.getState().undo();
    expect(activeMarkup<CableMarkup>("run-1").points).toEqual([10, 10, 100, 10]);
    expect(
      useProjectStore.getState().project!.connections?.find((c) => c.id === "link-1")
        ?.internalEndpoint,
    ).toBeUndefined();

    useProjectStore.getState().redo();
    expect(activeMarkup<CableMarkup>("run-1").points).toEqual([28, 10, 100, 10]);
  });
});
