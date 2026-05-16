// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  buildScheduleBlockMarkup,
  existingScheduleBlockForTarget,
  inferScheduleTargetKind,
  scheduleBlockContent,
  scheduleBlockSize,
  scheduleRowsForDisplay,
} from "../src/lib/scheduleBlocks";
import { withAutoAssignedConnectionPorts } from "../src/lib/connections";
import {
  useProjectStore,
  type CableMarkup,
  type DeviceConnection,
  type DeviceMarkup,
  type Project,
  type ScheduleMarkup,
  type Sheet,
} from "../src/store/projectStore";

const device = (overrides: Partial<DeviceMarkup> = {}): DeviceMarkup => ({
  id: "dev-1",
  kind: "device",
  layer: "network",
  category: "network",
  deviceId: "net-switch-poe",
  x: 40,
  y: 50,
  tag: "SW-01",
  ...overrides,
});

const cable = (overrides: Partial<CableMarkup> = {}): CableMarkup => ({
  id: "cab-1",
  kind: "cable",
  layer: "cable",
  cableId: "cat6",
  points: [0, 0, 100, 0],
  endpointA: "SW-01",
  endpointB: "CAM-01",
  physicalLabel: "C-101",
  ...overrides,
});

function sheet(markups: Sheet["markups"]): Sheet {
  return {
    id: "sheet-1",
    name: "Plan",
    fileName: "plan.pdf",
    pageWidth: 500,
    pageHeight: 300,
    renderScale: 1,
    calibration: {
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      realFeet: 10,
      pixelsPerFoot: 1,
    },
    markups,
  };
}

function project(markups: Sheet["markups"], connections: DeviceConnection[] = []): Project {
  return {
    id: "project-1",
    meta: {
      projectName: "Schedule Test",
      projectNumber: "",
      client: "",
      location: "",
      drawnBy: "",
      date: new Date(0).toISOString(),
      revision: "0",
    },
    sheets: [sheet(markups)],
    racks: [],
    bidDefaults: { slackPercent: 10 } as never,
    connections,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("schedule block helpers", () => {
  it("creates a persistent floating schedule markup for a target", () => {
    const sw = device({ id: "sw", tag: "SW-01" });
    const block = buildScheduleBlockMarkup(sw, "sched-1");

    expect(block).toMatchObject({
      id: "sched-1",
      kind: "schedule",
      targetId: "sw",
      targetKind: "device",
      layer: "annotation",
      mode: "compact",
      visible: true,
    });
    expect(block?.x).toBeGreaterThan(sw.x);
    expect(inferScheduleTargetKind(cable())).toBe("cable");
  });

  it("generates switch rows from connected devices and network config", () => {
    const sw = device({ id: "sw", tag: "SW-01" });
    const cam = device({
      id: "cam",
      tag: "CAM-01",
      deviceId: "cam-dome",
      category: "cameras",
      systemConfig: { network: { ipAddress: "10.1.1.20", vlan: 20 } },
    });
    const block: ScheduleMarkup = {
      id: "sched",
      kind: "schedule",
      layer: "annotation",
      targetId: "sw",
      targetKind: "device",
      x: 80,
      y: 90,
    };
    const p = project([sw, cam, block], [
      { id: "c1", fromTag: "CAM-01", fromPort: "ETH 0", toTag: "SW-01", toPort: "Port 7" },
    ]);

    const content = scheduleBlockContent(p, p.sheets[0], block);

    expect(content.title).toBe("SW-01 Schedule");
    expect(content.rows[0]).toContain("Port 7");
    expect(content.rows[0]).toContain("CAM-01");
    expect(content.rows[0]).toContain("10.1.1.20");
    expect(content.rows[0]).toContain("VLAN 20");
  });

  it("shows auto-assigned port labels in floating switch schedules", () => {
    const sw = device({ id: "sw", tag: "SW-01" });
    const cam = device({
      id: "cam",
      tag: "CAM-01",
      deviceId: "cam-dome",
      category: "cameras",
    });
    const ap = device({
      id: "ap",
      tag: "AP-01",
      deviceId: "net-ap-i",
      category: "network",
    });
    const block: ScheduleMarkup = {
      id: "sched",
      kind: "schedule",
      layer: "annotation",
      targetId: "sw",
      targetKind: "device",
      x: 80,
      y: 90,
    };
    const p = project([sw, cam, ap, block]);
    p.connections = [
      withAutoAssignedConnectionPorts(p, {
        id: "c1",
        fromTag: "CAM-01",
        toTag: "SW-01",
        medium: "cat6",
      }),
    ];
    p.connections = [
      ...p.connections,
      withAutoAssignedConnectionPorts(p, {
        id: "c2",
        fromTag: "AP-01",
        toTag: "SW-01",
        medium: "cat6",
      }),
    ];

    const content = scheduleBlockContent(p, p.sheets[0], block);

    expect(content.rows[0]).toContain("Port 1");
    expect(content.rows[0]).toContain("CAM-01");
    expect(content.rows[0]).toContain("ETH 0 (PoE in)");
    expect(content.rows[1]).toContain("Port 2");
    expect(content.rows[1]).toContain("AP-01");
    expect(content.rows[1]).toContain("ETH 0 (PoE in)");
  });

  it("generates cable rows from length, endpoints, and served devices", () => {
    const run = cable({ servedDevices: ["CAM-01", "AP-02"], connector: "RJ45" });
    const block = buildScheduleBlockMarkup(run, "sched")!;
    const p = project([run, block]);

    const content = scheduleBlockContent(p, p.sheets[0], block);

    expect(content.title).toBe("C-101 Schedule");
    expect(content.rows).toContain("Label  C-101");
    expect(content.rows.join("\n")).toContain("SW-01 to CAM-01");
    expect(content.rows.join("\n")).toContain("CAM-01, AP-02");
    expect(content.rows.join("\n")).toContain("110.0'");
  });

  it("finds schedule blocks by target and trims display rows", () => {
    const sw = device({ id: "sw" });
    const block = buildScheduleBlockMarkup(sw, "sched")!;
    const markups = [sw, block];
    const content = {
      title: "Schedule",
      rows: ["1", "2", "3", "4", "5", "6"],
      empty: false,
    };

    expect(existingScheduleBlockForTarget(markups, "sw")).toBe(block);
    const size = scheduleBlockSize(content, "compact");
    expect(scheduleRowsForDisplay(content, size.maxRows)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "+ 2 more",
    ]);
  });

  it("persists schedule markup through normal store updates", () => {
    const sw = device({ id: "sw" });
    const block = buildScheduleBlockMarkup(sw, "sched")!;
    useProjectStore.getState().loadProject(project([sw]));

    useProjectStore.getState().addMarkup(block);
    useProjectStore.getState().updateMarkup("sched", { title: "Customer Switch Ports" });

    const saved = useProjectStore
      .getState()
      .project!.sheets[0].markups.find((m) => m.id === "sched") as ScheduleMarkup;
    expect(saved.kind).toBe("schedule");
    expect(saved.title).toBe("Customer Switch Ports");
    expect(saved.targetId).toBe("sw");
  });
});
