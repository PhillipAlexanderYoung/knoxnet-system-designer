// @vitest-environment node
import { describe, expect, it } from "vitest";
import { cablesById } from "../src/data/cables";
import { devicesById } from "../src/data/devices";
import { rackDevicesById } from "../src/data/rackDevices";
import { defaultBidDefaults } from "../src/data/defaults";
import {
  bidCableLineId,
  bidDeviceLineId,
  bidRackDeviceLineId,
  computeBid,
} from "../src/lib/bid";
import {
  useProjectStore,
  type CableMarkup,
  type DeviceMarkup,
  type Project,
  type Rack,
  type Sheet,
} from "../src/store/projectStore";

const device = (id: string, deviceId = "cam-dome"): DeviceMarkup => ({
  id,
  kind: "device",
  layer: "cameras",
  category: "cameras",
  deviceId,
  x: 10,
  y: 20,
  tag: id.toUpperCase(),
});

const cable = (overrides: Partial<CableMarkup> = {}): CableMarkup => ({
  id: "cable-1",
  kind: "cable",
  layer: "cable",
  cableId: "cat6",
  points: [0, 0, 100, 0],
  runCount: 10,
  ...overrides,
});

const sheet = (markups: Sheet["markups"]): Sheet => ({
  id: "sheet-1",
  name: "Plan",
  fileName: "plan.pdf",
  pageWidth: 800,
  pageHeight: 600,
  renderScale: 1,
  calibration: {
    p1: { x: 0, y: 0 },
    p2: { x: 100, y: 0 },
    realFeet: 100,
    pixelsPerFoot: 1,
  },
  markups,
});

const rack = (): Rack => ({
  id: "rack-1",
  name: "MDF Rack",
  uHeight: 42,
  placements: [
    {
      id: "rack-placement-1",
      deviceId: "sw-cat-24",
      uSlot: 1,
    },
  ],
  createdAt: 0,
  updatedAt: 0,
});

function project(patch: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    meta: {
      projectName: "Bid Test",
      projectNumber: "001",
      client: "",
      location: "",
      drawnBy: "",
      date: new Date(0).toISOString(),
      revision: "0",
    },
    sheets: [sheet([device("cam-1"), device("cam-2"), cable()])],
    racks: [rack()],
    bidDefaults: { ...defaultBidDefaults, slackPercent: 0 },
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

describe("computeBid labor overrides", () => {
  it("uses calculated catalog labor by default", () => {
    const bid = computeBid(project());
    const deviceLine = bid.devices.find((line) => line.deviceId === "cam-dome");
    const cableLine = bid.cables.find((line) => line.cableId === "cat6");
    const rackLine = bid.rackDevices.find((line) => line.deviceId === "sw-cat-24");

    expect(deviceLine?.calculatedLabor).toBeCloseTo(devicesById["cam-dome"].laborHours * 2);
    expect(deviceLine?.extLabor).toBeCloseTo(deviceLine?.calculatedLabor ?? 0);
    expect(cableLine?.totalFeet).toBeCloseTo(1000);
    expect(cableLine?.calculatedLabor).toBeCloseTo(
      1000 * cablesById.cat6.laborPerFoot,
    );
    expect(cableLine?.extLabor).toBeCloseTo(cableLine?.calculatedLabor ?? 0);
    expect(rackLine?.extLabor).toBeCloseTo(rackDevicesById["sw-cat-24"].laborHours);
    expect(bid.totals.laborHours).toBeCloseTo(
      (deviceLine?.calculatedLabor ?? 0) +
        (cableLine?.calculatedLabor ?? 0) +
        (rackLine?.calculatedLabor ?? 0),
    );
  });

  it("overrides total labor for grouped bid lines", () => {
    const bid = computeBid(
      project({
        bidLaborOverrides: {
          [bidCableLineId("cat6")]: { laborHours: 6 },
          [bidDeviceLineId("cam-dome")]: { laborHours: 1.5 },
          [bidRackDeviceLineId("sw-cat-24")]: { laborHours: 0.75 },
        },
      }),
    );

    const cableLine = bid.cables.find((line) => line.cableId === "cat6");
    expect(cableLine?.totalFeet).toBeCloseTo(1000);
    expect(cableLine?.calculatedLabor).toBeCloseTo(18);
    expect(cableLine?.extLabor).toBe(6);
    expect(cableLine?.laborOverridden).toBe(true);
    expect(cableLine?.laborOverrideHours).toBe(6);
    expect(bid.devices[0].extLabor).toBe(1.5);
    expect(bid.rackDevices[0].extLabor).toBe(0.75);
    expect(bid.totals.laborHours).toBeCloseTo(8.25);
  });

  it("resets a labor override back to calculated labor", () => {
    const lineId = bidCableLineId("cat6");
    useProjectStore.getState().loadProject(
      project({ bidLaborOverrides: { [lineId]: { laborHours: 6 } } }),
    );

    useProjectStore.getState().setBidLineLaborOverride(lineId, null);

    const stored = useProjectStore.getState().project!;
    const bid = computeBid(stored);
    const cableLine = bid.cables.find((line) => line.lineId === lineId);
    expect(stored.bidLaborOverrides).toBeUndefined();
    expect(cableLine?.laborOverridden).toBe(false);
    expect(cableLine?.extLabor).toBeCloseTo(cableLine?.calculatedLabor ?? 0);
  });

  it("keeps catalog labor data unchanged", () => {
    const deviceLabor = devicesById["cam-dome"].laborHours;
    const cableLabor = cablesById.cat6.laborPerFoot;

    const p = project({
      bidLaborOverrides: {
        [bidDeviceLineId("cam-dome")]: { laborHours: 0.5 },
        [bidCableLineId("cat6")]: { laborHours: 4 },
      },
    });
    computeBid(p);

    expect(devicesById["cam-dome"].laborHours).toBe(deviceLabor);
    expect(cablesById.cat6.laborPerFoot).toBe(cableLabor);
    expect(p.catalogOverrides).toBeUndefined();
  });
});
