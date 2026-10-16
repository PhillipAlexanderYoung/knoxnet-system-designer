// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import { addBuildingRoute, alignSheet, buildingMeasurementSheets, buildingToSheet, measureBuildingRoute, removeBuildingRoute, sheetToBuilding, type BuildingRouteDraft } from "../src/lib/building";
import { defaultBidDefaults } from "../src/data/defaults";
import { computeBid } from "../src/lib/bid";
import { selectEntities } from "../src/reports/engine";
import { parseProjectFileText, serializeProjectFile } from "../src/lib/projectFile";
import { useProjectStore, type DeviceMarkup, type Project, type Sheet } from "../src/store/projectStore";
import { validateProject } from "../src/lib/validation";

function device(id: string, x: number): DeviceMarkup {
  return { id, tag: id.toUpperCase(), deviceId: "net-switch-poe", kind: "device", layer: "network", category: "network", x, y: 0 };
}

function drawing(id: string, scale: number, endpoint: DeviceMarkup): Sheet {
  return { id, name: id, fileName: `${id}.pdf`, pageWidth: 600, pageHeight: 400, renderScale: 1, calibration: { p1: { x: 0, y: 0 }, p2: { x: scale * 10, y: 0 }, realFeet: 10, pixelsPerFoot: scale }, markups: [endpoint] };
}

function project(): Project {
  return {
    id: "building-test", meta: { projectName: "Building", projectNumber: "", client: "", location: "", drawnBy: "", date: "2026-10-16", revision: "0" },
    sheets: [drawing("Ground", 2, device("sw-01", 0)), drawing("First", 4, device("sw-02", 80))], racks: [], bidDefaults: { ...defaultBidDefaults, slackPercent: 10 }, createdAt: 0, updatedAt: 0,
    building: {
      floors: [{ id: "ground", name: "Ground", elevationFt: 0 }, { id: "first", name: "First", elevationFt: 12 }],
      registrations: { Ground: { floorId: "ground", xFt: 0, yFt: 0, rotationDeg: 0, routingHeightFt: 8 }, First: { floorId: "first", xFt: 0, yFt: 0, rotationDeg: 0, routingHeightFt: 9 } },
      risers: [{ id: "riser-a", name: "Riser A", x: 10, y: 0 }], routes: [],
    },
  };
}

function draft(): BuildingRouteDraft {
  return { label: "MF-001", cableId: "cat6", segments: [{ sheetId: "Ground", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] }, { sheetId: "First", points: [{ x: 40, y: 0 }, { x: 80, y: 0 }] }], riserIds: ["riser-a"], fromDeviceId: "sw-01", toDeviceId: "sw-02", serviceLoopFt: 2 };
}

let sequence = 0;
const makeId = () => `generated-${sequence++}`;
const routed = () => addBuildingRoute(project(), draft(), makeId);

describe("building registration and routing", () => {
  beforeEach(() => { sequence = 0; });

  it("converts source coordinates to a shared scale with translation and rotation", () => {
    const source = project().sheets[0];
    const registration = { floorId: "ground", xFt: 5, yFt: 7, rotationDeg: 90, routingHeightFt: 0 };
    const world = sheetToBuilding(source, registration, { x: 20, y: 0 })!;
    expect(world.x).toBeCloseTo(5);
    expect(world.y).toBeCloseTo(17);
    const local = buildingToSheet(source, registration, world)!;
    expect(local.x).toBeCloseTo(20);
    expect(local.y).toBeCloseTo(0);
  });

  it("aligns corresponding points without changing the calibrated scale", () => {
    const source = project();
    const registration = alignSheet(source.sheets[0], source.building!.registrations.Ground, [{ x: 4, y: 4 }, { x: 24, y: 4 }], [{ x: 10, y: 10 }, { x: 10, y: 20 }]);
    expect(registration.rotationDeg).toBeCloseTo(90);
    expect(sheetToBuilding(source.sheets[0], registration, { x: 4, y: 4 })).toEqual({ x: 10, y: 10 });
    expect(source.sheets[0].calibration?.pixelsPerFoot).toBe(2);
  });

  it("rejects mismatched reference distances and coincident points", () => {
    const source = project();
    const registration = source.building!.registrations.Ground;
    expect(() => alignSheet(source.sheets[0], registration, [{ x: 0, y: 0 }, { x: 20, y: 0 }], [{ x: 0, y: 0 }, { x: 20, y: 0 }])).toThrow("2%");
    expect(() => alignSheet(source.sheets[0], registration, [{ x: 0, y: 0 }, { x: 0, y: 0 }], [{ x: 0, y: 0 }, { x: 0, y: 0 }])).toThrow("distinct");
  });

  it.each([0, -1, Infinity, NaN])("rejects invalid drawing scale %s", (scale) => {
    const source = project();
    source.sheets[0].calibration!.pixelsPerFoot = scale;
    expect(sheetToBuilding(source.sheets[0], source.building!.registrations.Ground, { x: 0, y: 0 })).toBeUndefined();
    expect(() => addBuildingRoute(source, draft(), makeId)).toThrow("Calibrate");
  });

  it("measures both horizontal segments plus floor and routing-height differences", () => {
    const source = routed();
    expect(measureBuildingRoute(source, source.building!.routes[0])).toEqual({ horizontalFt: 20, verticalFt: 13, totalFt: 33 });
    expect(source.connections).toHaveLength(1);
    expect(source.connections![0]).toMatchObject({ fromTag: "SW-01", toTag: "SW-02", fromPortId: "port-1", toPortId: "port-1" });
    expect(validateProject(source).filter((issue) => issue.code === "duplicate-connection-port")).toHaveLength(0);
  });

  it("counts a continuous cable once in bids and reports, with one service-loop allowance", () => {
    const source = routed();
    const bid = computeBid(source);
    expect(bid.cables).toHaveLength(1);
    expect(bid.cables[0].rawFeet).toBe(33);
    expect(bid.cables[0].totalFeet).toBeCloseTo(38.5);
    const rows = selectEntities(source, "cables");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ physicalLabel: "MF-001", lengthFt: 33, lengthFtWithSlack: 38.5, serviceLoopFt: 2 });
    expect(selectEntities(source, "devices")).toHaveLength(2);
  });

  it("updates vertical length when floor heights change", () => {
    const source = routed();
    source.building!.floors[1].elevationFt = 20;
    expect(computeBid(source).cables[0].rawFeet).toBe(41);
  });

  it("reports missing segments instead of estimating a partial cable", () => {
    const source = routed();
    source.sheets[1].markups = source.sheets[1].markups.filter((markup) => markup.kind !== "cable");
    expect(buildingMeasurementSheets(source).warnings[0]).toContain("missing");
    expect(computeBid(source).cables).toHaveLength(0);
    expect(computeBid(source).warnings[0]).toContain("Excluded");
    expect(selectEntities(source, "cables")[0]).toMatchObject({ physicalLabel: "MF-001", lengthFt: null, lengthFtWithSlack: null });
  });

  it("reports riser misalignment after a drawing registration changes", () => {
    const source = routed();
    source.building!.registrations.First.xFt = 1;
    expect(computeBid(source).warnings[0]).toContain("no longer meets Riser A");
    expect(computeBid(source).cables).toHaveLength(0);
  });

  it("rejects missing risers, same-floor transitions, and invalid allowances", () => {
    const source = project();
    expect(() => addBuildingRoute(source, { ...draft(), riserIds: ["missing"] }, makeId)).toThrow("riser is missing");
    source.building!.registrations.First.floorId = "ground";
    expect(() => addBuildingRoute(source, draft(), makeId)).toThrow("different floors");
    expect(() => addBuildingRoute(project(), { ...draft(), serviceLoopFt: -1 }, makeId)).toThrow("service loop");
  });

  it("rejects repeated labels and ambiguous device tags", () => {
    expect(() => addBuildingRoute(routed(), draft(), makeId)).toThrow("unique cable label");
    const source = project();
    source.sheets[1].markups.push(device("sw-01", 30));
    expect(() => addBuildingRoute(source, draft(), makeId)).toThrow("unique device tags");
  });

  it("round-trips floors, registrations, routes, and topology through .knoxnet", async () => {
    const source = routed();
    const restored = await parseProjectFileText(serializeProjectFile(source));
    expect(restored.building).toEqual(source.building);
    expect(restored.connections).toEqual(source.connections);
    expect(computeBid(restored).cables[0].totalFeet).toBeCloseTo(38.5);
  });

  it("leaves projects without floors unchanged", () => {
    const source = project();
    delete source.building;
    expect(buildingMeasurementSheets(source)).toEqual({ sheets: source.sheets, warnings: [] });
  });

  it("removes all route segments and its connection together", () => {
    const source = routed();
    const next = removeBuildingRoute(source, source.building!.routes[0].id);
    expect(next.building!.routes).toHaveLength(0);
    expect(next.connections).toHaveLength(0);
    expect(next.sheets.flatMap((sheet) => sheet.markups)).toHaveLength(2);
  });

  it("saves and undoes a route atomically", () => {
    useProjectStore.getState().loadProject(project());
    expect(useProjectStore.getState().saveBuildingRoute(draft())).toBe(true);
    expect(useProjectStore.getState().project!.building!.routes).toHaveLength(1);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project!.building!.routes).toHaveLength(0);
    useProjectStore.getState().redo();
    expect(computeBid(useProjectStore.getState().project!).cables[0].totalFeet).toBeCloseTo(38.5);
  });

  it("deletes the complete route when a segment is deleted in Sheets", () => {
    const source = routed();
    useProjectStore.getState().loadProject(source);
    useProjectStore.getState().setActiveSheet("First");
    useProjectStore.getState().deleteMarkup(source.building!.routes[0].segments[1].markupId);
    expect(useProjectStore.getState().project!.building!.routes).toHaveLength(0);
    expect(useProjectStore.getState().project!.connections).toHaveLength(0);
    useProjectStore.getState().undo();
    expect(computeBid(useProjectStore.getState().project!).cables[0].rawFeet).toBe(33);
  });

  it("blocks deleting a drawing or editing a segment while its route exists", () => {
    const source = routed();
    useProjectStore.getState().loadProject(source);
    useProjectStore.getState().removeSheet("First");
    expect(useProjectStore.getState().project!.sheets).toHaveLength(2);
    useProjectStore.getState().updateMarkup(source.building!.routes[0].segments[0].markupId, { points: [0, 0, 100, 100] });
    expect(computeBid(useProjectStore.getState().project!).cables[0].rawFeet).toBe(33);
  });

  it("prevents endpoint moves from detaching a saved multi-floor cable", () => {
    useProjectStore.getState().loadProject(routed());
    useProjectStore.getState().updateMarkup("sw-01", { x: 100 });
    useProjectStore.getState().moveDeviceMarkup("sw-01", 100, 100);
    expect(useProjectStore.getState().project!.sheets[0].markups[0]).toMatchObject({ x: 0, y: 0 });
  });

  it("removes all segments through the existing delete-connection-and-cable action", () => {
    const source = routed();
    useProjectStore.getState().loadProject(source);
    useProjectStore.getState().removeConnectionAndCable(source.connections![0].id);
    expect(useProjectStore.getState().project!.building!.routes).toHaveLength(0);
    expect(useProjectStore.getState().project!.sheets.flatMap((sheet) => sheet.markups).filter((markup) => markup.kind === "cable")).toHaveLength(0);
  });

  it("adds three floor segments and two riser distances without double-counting", () => {
    const source = project();
    source.sheets.push(drawing("Second", 5, device("sw-03", 150)));
    source.building!.floors.push({ id: "second", name: "Second", elevationFt: 24 });
    source.building!.registrations.Second = { floorId: "second", xFt: 0, yFt: 0, rotationDeg: 0, routingHeightFt: 9 };
    source.building!.risers.push({ id: "riser-b", name: "Riser B", x: 20, y: 0 });
    const route = draft();
    route.toDeviceId = "sw-03";
    route.riserIds.push("riser-b");
    route.segments.push({ sheetId: "Second", points: [{ x: 100, y: 0 }, { x: 150, y: 0 }] });
    const next = addBuildingRoute(source, route, makeId);
    expect(measureBuildingRoute(next, next.building!.routes[0])).toEqual({ horizontalFt: 30, verticalFt: 25, totalFt: 55 });
    expect(selectEntities(next, "cables")).toHaveLength(1);
    expect(computeBid(next).cables[0].totalFeet).toBeCloseTo(62.7);
  });
});
