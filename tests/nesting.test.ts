// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  canNestDeviceIn,
  deviceDisplayName,
  isContainerDevice,
  isNestableDevice,
  nearestContainerForDevice,
  nestedBubbleLabel,
  nestedBubbleLabelColor,
  nestedBubbleSize,
  nestedConnectionSummary,
  nestedScheduleLines,
  nestedScheduleTitle,
  nestedSlotPoint,
} from "../src/lib/nesting";
import {
  useProjectStore,
  type DeviceMarkup,
  type Project,
} from "../src/store/projectStore";

function device(overrides: Partial<DeviceMarkup>): DeviceMarkup {
  return {
    id: "d1",
    kind: "device",
    deviceId: "net-switch-poe",
    category: "network",
    layer: "network",
    x: 0,
    y: 0,
    tag: "SW-01",
    ...overrides,
  } as DeviceMarkup;
}

function project(markups: DeviceMarkup[]): Project {
  return {
    id: "p1",
    meta: {
      projectName: "Nested Test",
      projectNumber: "001",
      client: "",
      location: "",
      drawnBy: "",
      date: new Date(0).toISOString(),
      revision: "0",
    },
    sheets: [
      {
        id: "s1",
        name: "Plan",
        fileName: "plan.pdf",
        pageWidth: 800,
        pageHeight: 600,
        renderScale: 1,
        markups,
      },
    ],
    racks: [],
    bidDefaults: { slackPercent: 10 } as never,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("nesting helpers", () => {
  it("identifies containers and rack-mount style devices", () => {
    const headEnd = device({
      id: "he1",
      deviceId: "net-headend",
      tag: "HE-01",
    });
    const switchMarkup = device({ id: "sw1", tag: "SW-01" });
    expect(isContainerDevice(headEnd)).toBe(true);
    expect(isNestableDevice(switchMarkup)).toBe(true);
    expect(canNestDeviceIn(switchMarkup, headEnd, [headEnd, switchMarkup])).toBe(true);
  });

  it("finds a nearby container and formats schedule lines", () => {
    const headEnd = device({
      id: "he1",
      deviceId: "net-headend",
      tag: "HE-01",
      x: 100,
      y: 100,
    });
    const switchMarkup = device({
      id: "sw1",
      tag: "SW-01",
      labelOverride: "PoE Access",
      x: 116,
      y: 105,
      parentId: "he1",
    });
    expect(nearestContainerForDevice([headEnd, switchMarkup], switchMarkup, switchMarkup)).toBe(
      headEnd,
    );
    expect(deviceDisplayName(switchMarkup)).toBe("SW-01 - PoE Access");
    expect(nestedScheduleLines([headEnd, switchMarkup], "he1")).toEqual([
      "SW-01 - PoE Access",
    ]);
    expect(nestedBubbleSize(switchMarkup)).toBe(10);
    const slot = nestedSlotPoint([headEnd], headEnd, switchMarkup);
    expect(slot.x).toBeCloseTo(100 + 14 + 10 / 2 - 1);
    expect(slot.y).toBeCloseTo(100);
  });

  it("keeps nested bubbles attached and labels compact", () => {
    const headEnd = device({
      id: "he1",
      deviceId: "net-headend",
      tag: "HE-01",
      x: 100,
      y: 100,
      size: 30,
    });
    const switchMarkup = device({
      id: "sw1",
      tag: "SW-01",
      size: 30,
      parentId: "he1",
    });
    const controllerMarkup = device({
      id: "ctrl1",
      deviceId: "acs-controller",
      category: "access",
      tag: "CTRL-002",
      size: 30,
      parentId: "he1",
    });

    const slot = nestedSlotPoint([headEnd, switchMarkup], headEnd, switchMarkup);
    const distance = Math.hypot(slot.x - headEnd.x, slot.y - headEnd.y);
    expect(distance).toBeCloseTo((headEnd.size ?? 30) / 2 + nestedBubbleSize(switchMarkup) / 2 - 1);
    expect(nestedBubbleLabel(switchMarkup)).toBe("SW1");
    expect(nestedBubbleLabel(controllerMarkup)).toBe("CTR");
    expect(nestedBubbleLabel(switchMarkup).length).toBeLessThanOrEqual(3);
    expect(nestedBubbleLabelColor("#0B1220")).toBe("#FFFFFF");
    expect(nestedBubbleLabelColor("#F8FAFC")).toBe("#0B1220");
  });

  it("uses custom schedule names and connection summaries", () => {
    const headEnd = device({
      id: "he1",
      deviceId: "net-headend",
      tag: "HE-01",
      nestedScheduleName: "MDF-1 Schedule",
    });
    expect(nestedScheduleTitle(headEnd)).toBe("MDF-1 Schedule");
    expect(
      nestedConnectionSummary(
        [{ id: "c1", fromTag: "SW-01", toTag: "CAM-01", fromPort: "Port 1" }],
        "SW-01",
      ),
    ).toBe("CAM-01 (Port 1)");
  });
});

describe("nesting store behavior", () => {
  it("associates a dragged device with a nearby container", () => {
    const headEnd = device({
      id: "he1",
      deviceId: "net-headend",
      tag: "HE-01",
      x: 200,
      y: 200,
    });
    const switchMarkup = device({ id: "sw1", tag: "SW-01", x: 40, y: 40 });
    useProjectStore.getState().loadProject(project([headEnd, switchMarkup]));

    useProjectStore.getState().moveDeviceMarkup("sw1", 202, 198);

    const sheet = useProjectStore.getState().project!.sheets[0];
    const moved = sheet.markups.find((m) => m.id === "sw1") as DeviceMarkup;
    expect(moved.parentId).toBe("he1");
    expect(moved.x).toBeCloseTo(218);
    expect(moved.y).toBe(200);
  });

  it("does not nest on ordinary nearby moves outside the tight drop zone", () => {
    const headEnd = device({
      id: "he1",
      deviceId: "net-headend",
      tag: "HE-01",
      x: 200,
      y: 200,
    });
    const switchMarkup = device({ id: "sw1", tag: "SW-01", x: 40, y: 40 });
    useProjectStore.getState().loadProject(project([headEnd, switchMarkup]));

    useProjectStore.getState().moveDeviceMarkup("sw1", 232, 200);

    const sheet = useProjectStore.getState().project!.sheets[0];
    const moved = sheet.markups.find((m) => m.id === "sw1") as DeviceMarkup;
    expect(moved.parentId).toBeUndefined();
    expect(moved.x).toBe(232);
    expect(moved.y).toBe(200);
  });

  it("moves unlocked nested devices with their container", () => {
    const headEnd = device({
      id: "he1",
      deviceId: "net-headend",
      tag: "HE-01",
      x: 200,
      y: 200,
    });
    const switchMarkup = device({
      id: "sw1",
      tag: "SW-01",
      x: 230,
      y: 210,
      parentId: "he1",
    });
    useProjectStore.getState().loadProject(project([headEnd, switchMarkup]));

    useProjectStore.getState().moveDeviceMarkup("he1", 250, 260);

    const sheet = useProjectStore.getState().project!.sheets[0];
    const movedChild = sheet.markups.find((m) => m.id === "sw1") as DeviceMarkup;
    expect(movedChild.x).toBe(280);
    expect(movedChild.y).toBe(270);
  });

  it("links Rack parents to the rack system only for Rack devices", () => {
    const rack = device({
      id: "rack1",
      deviceId: "net-rack",
      tag: "RACK-01",
      x: 200,
      y: 200,
    });
    const headEnd = device({
      id: "he1",
      deviceId: "net-headend",
      tag: "HE-01",
      x: 300,
      y: 300,
    });
    const switchMarkup = device({ id: "sw1", tag: "SW-01", x: 40, y: 40 });
    useProjectStore.getState().loadProject(project([rack, headEnd, switchMarkup]));

    useProjectStore.getState().moveDeviceMarkup("sw1", 200, 200);

    let state = useProjectStore.getState();
    let racks = state.project!.racks ?? [];
    expect(racks).toHaveLength(1);
    expect(racks[0].sourceMarkupId).toBe("rack1");
    expect(racks[0].placements).toMatchObject([
      { sourceMarkupId: "sw1", deviceId: "sw-cat-24", label: "SW-01" },
    ]);

    useProjectStore.getState().updateMarkup("sw1", { parentId: undefined });
    state = useProjectStore.getState();
    racks = state.project!.racks ?? [];
    expect(racks).toHaveLength(1);
    expect(racks[0].placements).toHaveLength(0);

    useProjectStore.getState().moveDeviceMarkup("sw1", 300, 300);
    state = useProjectStore.getState();
    expect(state.project!.racks?.[0]?.placements).toHaveLength(0);
  });
});
