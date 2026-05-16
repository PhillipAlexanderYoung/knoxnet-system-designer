// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import {
  useProjectStore,
  type CableMarkup,
  type DeviceMarkup,
  type Project,
  type Sheet,
} from "../src/store/projectStore";

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
});
