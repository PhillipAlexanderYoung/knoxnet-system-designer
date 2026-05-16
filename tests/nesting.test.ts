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
  nestedBubbleHitRadius,
  nestedBubbleSize,
  nestedConnectionSummary,
  nestedScheduleLines,
  nestedScheduleTitle,
  nestedSlotPoint,
} from "../src/lib/nesting";
import { buildCableRunMarkup, endpointFromMarkup } from "../src/lib/cableRuns";
import {
  useProjectStore,
  type CableMarkup,
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

function project(markups: Array<DeviceMarkup | CableMarkup>): Project {
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
    expect(nestedBubbleHitRadius(switchMarkup)).toBeGreaterThan(nestedBubbleSize(switchMarkup) / 2);
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

  it("unnests a dragged nested bubble and keeps cable attachments intact", () => {
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
      parentId: "he1",
    });
    const initialSlot = nestedSlotPoint([headEnd, switchMarkup], headEnd, switchMarkup);
    const nestedSwitch = { ...switchMarkup, x: initialSlot.x, y: initialSlot.y };
    const camera = device({
      id: "cam1",
      deviceId: "cam-dome",
      category: "cameras",
      layer: "cameras",
      tag: "CAM-01",
      x: 220,
      y: 120,
    });
    const run = buildCableRunMarkup("run1", "cat6", [
      endpointFromMarkup(nestedSwitch, { markups: [headEnd, nestedSwitch, camera] })!,
      endpointFromMarkup(camera, { markups: [headEnd, nestedSwitch, camera] })!,
    ]);
    useProjectStore.getState().loadProject(project([headEnd, nestedSwitch, camera, run]));

    useProjectStore.getState().moveDeviceMarkup("sw1", 260, 240);

    const sheet = useProjectStore.getState().project!.sheets[0];
    const moved = sheet.markups.find((m) => m.id === "sw1") as DeviceMarkup;
    const movedRun = sheet.markups.find((m) => m.id === "run1") as CableMarkup;
    expect(moved.parentId).toBeUndefined();
    expect(moved).toMatchObject({ x: 260, y: 240 });
    expect(movedRun.points.slice(0, 2)).toEqual([260, 240]);
    expect(movedRun.pointAttachments?.[0]).toMatchObject({
      deviceMarkupId: "sw1",
      deviceTag: "SW-01",
    });
  });

  it("can re-nest a dragged-out device into a different container", () => {
    const firstHeadEnd = device({
      id: "he1",
      deviceId: "net-headend",
      tag: "HE-01",
      x: 100,
      y: 100,
    });
    const secondHeadEnd = device({
      id: "he2",
      deviceId: "net-headend",
      tag: "HE-02",
      x: 300,
      y: 300,
    });
    const switchMarkup = device({ id: "sw1", tag: "SW-01", x: 120, y: 100, parentId: "he1" });
    useProjectStore
      .getState()
      .loadProject(project([firstHeadEnd, secondHeadEnd, switchMarkup]));

    useProjectStore.getState().moveDeviceMarkup("sw1", 240, 240);
    expect(
      (useProjectStore.getState().project!.sheets[0].markups.find((m) => m.id === "sw1") as DeviceMarkup)
        .parentId,
    ).toBeUndefined();

    useProjectStore.getState().moveDeviceMarkup("sw1", 300, 300);

    const sheet = useProjectStore.getState().project!.sheets[0];
    const moved = sheet.markups.find((m) => m.id === "sw1") as DeviceMarkup;
    expect(moved.parentId).toBe("he2");
    expect(moved).toMatchObject(nestedSlotPoint(sheet.markups, secondHeadEnd, moved));
  });

  it("blocks nested bubble movement when the parent is locked", () => {
    const headEnd = device({
      id: "he1",
      deviceId: "net-headend",
      tag: "HE-01",
      x: 100,
      y: 100,
      locked: true,
    });
    const switchMarkup = device({ id: "sw1", tag: "SW-01", x: 118, y: 100, parentId: "he1" });
    useProjectStore.getState().loadProject(project([headEnd, switchMarkup]));

    useProjectStore.getState().moveDeviceMarkup("sw1", 240, 240);

    const moved = useProjectStore
      .getState()
      .project!.sheets[0].markups.find((m) => m.id === "sw1") as DeviceMarkup;
    expect(moved).toMatchObject({ x: 118, y: 100, parentId: "he1" });
    expect(useProjectStore.getState().lockMoveHint).toMatchObject({
      message: "Devices are locked. Unlock to move.",
    });
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
    expect(movedChild.x).toBe(268);
    expect(movedChild.y).toBe(260);
  });

  it("locks all device markups without locking cable runs", () => {
    const headEnd = device({
      id: "he1",
      deviceId: "net-headend",
      tag: "HE-01",
    });
    const switchMarkup = device({ id: "sw1", tag: "SW-01" });
    const cable: CableMarkup = {
      id: "run1",
      kind: "cable",
      layer: "cable",
      cableId: "cat6",
      points: [0, 0, 10, 10],
    };
    useProjectStore.getState().loadProject(project([headEnd, switchMarkup, cable]));

    expect(useProjectStore.getState().setAllDeviceMarkupsLocked(true)).toBe(2);

    const markups = useProjectStore.getState().project!.sheets[0].markups;
    expect(markups.find((m) => m.id === "he1")).toMatchObject({ locked: true });
    expect(markups.find((m) => m.id === "sw1")).toMatchObject({ locked: true });
    expect(markups.find((m) => m.id === "run1")).not.toMatchObject({ locked: true });
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
