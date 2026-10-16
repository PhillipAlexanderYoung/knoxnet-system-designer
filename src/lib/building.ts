import type { CableMarkup, DeviceConnection, Project, Sheet } from "../store/projectStore";
import { cablesById } from "../data/cables";
import { polylineLengthPts } from "./geometry";
import { withAutoAssignedConnectionPorts } from "./connections";

export interface BuildingFloor {
  id: string;
  name: string;
  elevationFt: number;
}

export interface SheetRegistration {
  floorId: string;
  xFt: number;
  yFt: number;
  rotationDeg: number;
  routingHeightFt: number;
}

export interface BuildingPoint { x: number; y: number }

export interface BuildingRiser extends BuildingPoint {
  id: string;
  name: string;
}

export interface BuildingRoute {
  id: string;
  label: string;
  cableId: string;
  segments: { sheetId: string; markupId: string }[];
  riserIds: string[];
  serviceLoopFt: number;
  slackPercent?: number;
  connectionId?: string;
}

export interface BuildingModel {
  floors: BuildingFloor[];
  registrations: Record<string, SheetRegistration>;
  risers: BuildingRiser[];
  routes: BuildingRoute[];
}

export const emptyBuilding = (): BuildingModel => ({ floors: [], registrations: {}, risers: [], routes: [] });

export function buildingError(building: BuildingModel): string | undefined {
  if (new Set(building.floors.map((floor) => floor.id)).size !== building.floors.length) return "Floor IDs must be unique.";
  if (building.floors.some((floor) => !floor.name.trim() || !Number.isFinite(floor.elevationFt))) return "Give each floor a name and a finite elevation.";
  if (new Set(building.risers.map((riser) => riser.id)).size !== building.risers.length) return "Riser IDs must be unique.";
  if (building.risers.some((riser) => !riser.name.trim() || !Number.isFinite(riser.x) || !Number.isFinite(riser.y))) return "Give each riser a name and a finite position.";
  for (const registration of Object.values(building.registrations)) {
    if (!building.floors.some((floor) => floor.id === registration.floorId)) return "A drawing references a missing floor.";
    if (![registration.xFt, registration.yFt, registration.rotationDeg, registration.routingHeightFt].every(Number.isFinite) || registration.routingHeightFt < 0) return "Drawing offsets and rotation must be finite; routing height must be non-negative.";
  }
  return undefined;
}

export function registrationFor(project: Project, sheetId: string): SheetRegistration | undefined {
  return project.building?.registrations[sheetId];
}

export function sheetToBuilding(sheet: Sheet, registration: SheetRegistration, point: BuildingPoint): BuildingPoint | undefined {
  const scale = sheet.calibration?.pixelsPerFoot;
  if (!scale || !Number.isFinite(scale) || scale <= 0) return undefined;
  const angle = registration.rotationDeg * Math.PI / 180;
  const x = point.x / scale;
  const y = point.y / scale;
  const result = { x: registration.xFt + x * Math.cos(angle) - y * Math.sin(angle), y: registration.yFt + x * Math.sin(angle) + y * Math.cos(angle) };
  return Number.isFinite(result.x) && Number.isFinite(result.y) ? result : undefined;
}

export function buildingToSheet(sheet: Sheet, registration: SheetRegistration, point: BuildingPoint): BuildingPoint | undefined {
  const scale = sheet.calibration?.pixelsPerFoot;
  if (!scale || !Number.isFinite(scale) || scale <= 0) return undefined;
  const angle = -registration.rotationDeg * Math.PI / 180;
  const x = point.x - registration.xFt;
  const y = point.y - registration.yFt;
  const result = { x: (x * Math.cos(angle) - y * Math.sin(angle)) * scale, y: (x * Math.sin(angle) + y * Math.cos(angle)) * scale };
  return Number.isFinite(result.x) && Number.isFinite(result.y) ? result : undefined;
}

export function alignSheet(sheet: Sheet, registration: SheetRegistration, local: [BuildingPoint, BuildingPoint], reference: [BuildingPoint, BuildingPoint]): SheetRegistration {
  const scale = sheet.calibration?.pixelsPerFoot;
  if (!scale || !Number.isFinite(scale) || scale <= 0) throw new Error("Calibrate the drawing before aligning it.");
  const sourceLength = Math.hypot(local[1].x - local[0].x, local[1].y - local[0].y) / scale;
  const targetLength = Math.hypot(reference[1].x - reference[0].x, reference[1].y - reference[0].y);
  if (!Number.isFinite(sourceLength) || !Number.isFinite(targetLength) || sourceLength < 0.1 || targetLength < 0.1) throw new Error("Choose two distinct reference points at least 0.1 ft apart.");
  if (Math.abs(sourceLength / targetLength - 1) > 0.02) throw new Error("Reference distances differ by more than 2%. Check both drawing calibrations.");
  const rotationDeg = (Math.atan2(reference[1].y - reference[0].y, reference[1].x - reference[0].x) - Math.atan2(local[1].y - local[0].y, local[1].x - local[0].x)) * 180 / Math.PI;
  const next = { ...registration, rotationDeg, xFt: 0, yFt: 0 };
  const origin = sheetToBuilding(sheet, next, local[0]);
  if (!origin) throw new Error("Unable to align this drawing.");
  return { ...next, xFt: reference[0].x - origin.x, yFt: reference[0].y - origin.y };
}

export function measureBuildingRoute(project: Project, route: BuildingRoute): { horizontalFt: number; verticalFt: number; totalFt: number } {
  const building = project.building;
  if (!building || route.segments.length < 2 || route.riserIds.length !== route.segments.length - 1) throw new Error("A multi-floor route needs segments joined by risers.");
  const error = buildingError(building);
  if (error) throw new Error(error);
  if (!cablesById[route.cableId] || !Number.isFinite(route.serviceLoopFt) || route.serviceLoopFt < 0 || (route.slackPercent !== undefined && (!Number.isFinite(route.slackPercent) || route.slackPercent < 0))) throw new Error("Check the route cable type, service loop, and slack.");
  if (new Set(route.segments.map((segment) => segment.markupId)).size !== route.segments.length) throw new Error("A cable segment cannot appear twice in a route.");
  let horizontalFt = 0;
  let verticalFt = 0;
  let previous: { end: BuildingPoint; elevation: number; floorId: string } | undefined;
  for (const [index, segment] of route.segments.entries()) {
    const sheet = project.sheets.find((candidate) => candidate.id === segment.sheetId);
    const registration = building.registrations[segment.sheetId];
    const floor = building.floors.find((candidate) => candidate.id === registration?.floorId);
    const cable = sheet?.markups.find((markup): markup is CableMarkup => markup.kind === "cable" && markup.id === segment.markupId);
    const scale = sheet?.calibration?.pixelsPerFoot;
    if (!sheet || !registration || !floor || !cable) throw new Error("A floor, drawing, or cable segment is missing. Restore it or remove the route.");
    if (!scale || !Number.isFinite(scale) || scale <= 0) throw new Error(`Calibrate ${sheet.name} before measuring the route.`);
    if (cable.cableId !== route.cableId || cable.points.length < 4 || cable.points.length % 2 || !cable.points.every(Number.isFinite)) throw new Error("A route segment has invalid geometry or a different cable type.");
    const start = sheetToBuilding(sheet, registration, { x: cable.points[0], y: cable.points[1] });
    const end = sheetToBuilding(sheet, registration, { x: cable.points[cable.points.length - 2], y: cable.points[cable.points.length - 1] });
    if (!start || !end) throw new Error("A route segment could not be positioned.");
    const elevation = floor.elevationFt + registration.routingHeightFt;
    horizontalFt += polylineLengthPts(cable.points) / scale;
    if (previous) {
      const riser = building.risers.find((candidate) => candidate.id === route.riserIds[index - 1]);
      if (!riser) throw new Error("A route riser is missing.");
      if (previous.floorId === floor.id) throw new Error("Riser transitions must connect different floors.");
      if (Math.hypot(start.x - riser.x, start.y - riser.y) > 0.1 || Math.hypot(previous.end.x - riser.x, previous.end.y - riser.y) > 0.1) throw new Error(`Route no longer meets ${riser.name}. Check drawing alignment or redraw the route.`);
      verticalFt += Math.abs(elevation - previous.elevation);
    }
    previous = { end, elevation, floorId: floor.id };
  }
  if (!Number.isFinite(horizontalFt + verticalFt)) throw new Error("Route length is outside the supported range.");
  return { horizontalFt, verticalFt, totalFt: horizontalFt + verticalFt };
}

export function buildingMeasurementSheets(project: Project): { sheets: Sheet[]; warnings: string[] } {
  const routes = project.building?.routes ?? [];
  if (!routes.length) return { sheets: project.sheets, warnings: [] };
  const segmentIds = new Set(routes.flatMap((route) => route.segments.map((segment) => segment.markupId)));
  const sheets = project.sheets.map((sheet) => ({ ...sheet, markups: sheet.markups.filter((markup) => !segmentIds.has(markup.id)) }));
  const warnings: string[] = [];
  const usedIds = new Set<string>();
  for (const route of routes) {
    try {
      if (route.segments.some((segment) => usedIds.has(segment.markupId))) throw new Error("Cable segment is shared by multiple routes.");
      route.segments.forEach((segment) => usedIds.add(segment.markupId));
      const length = measureBuildingRoute(project, route);
      const firstSheet = project.sheets.find((sheet) => sheet.id === route.segments[0].sheetId);
      if (!firstSheet) throw new Error("Starting sheet is missing.");
      const connection = project.connections?.find((candidate) => candidate.id === route.connectionId);
      sheets.push({
        ...firstSheet,
        id: route.id,
        name: route.segments.map((segment) => project.sheets.find((sheet) => sheet.id === segment.sheetId)?.name).join(" → "),
        sheetNumber: undefined,
        calibration: { p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 }, realFeet: 1, pixelsPerFoot: 1 },
        markups: [{ id: route.id, kind: "cable", layer: "cable", cableId: route.cableId, physicalLabel: route.label, points: [0, 0, length.totalFt, 0], serviceLoopFt: route.serviceLoopFt, slackPercent: route.slackPercent, endpointA: connection?.fromTag, endpointB: connection?.toTag }],
      });
    } catch (error) {
      warnings.push(`${route.label}: ${error instanceof Error ? error.message : "Unable to measure route."} Excluded from cable totals.`);
    }
  }
  return { sheets, warnings };
}

export interface BuildingRouteDraft {
  label: string;
  cableId: string;
  segments: { sheetId: string; points: BuildingPoint[] }[];
  riserIds: string[];
  serviceLoopFt: number;
  slackPercent?: number;
  fromDeviceId: string;
  toDeviceId: string;
}

export function addBuildingRoute(project: Project, draft: BuildingRouteDraft, makeId: () => string): Project {
  if (!project.building || !draft.label.trim()) throw new Error("Set up the building and give the cable a label.");
  if (project.building.routes.some((route) => route.label === draft.label.trim())) throw new Error("Choose a unique cable label.");
  const devices = project.sheets.flatMap((sheet) => sheet.markups.filter((markup) => markup.kind === "device"));
  const from = devices.find((device) => device.id === draft.fromDeviceId);
  const to = devices.find((device) => device.id === draft.toDeviceId);
  if (!from || !to || from.id === to.id) throw new Error("Choose different start and end devices.");
  if (devices.filter((device) => device.tag === from.tag).length !== 1 || devices.filter((device) => device.tag === to.tag).length !== 1) throw new Error("Route endpoints need unique device tags across the project.");
  if (!draft.segments.length || !project.sheets.find((sheet) => sheet.id === draft.segments[0].sheetId)?.markups.some((markup) => markup.id === from.id) || !project.sheets.find((sheet) => sheet.id === draft.segments[draft.segments.length - 1].sheetId)?.markups.some((markup) => markup.id === to.id)) throw new Error("The endpoint devices must be on the first and last route drawings.");
  const route: BuildingRoute = { id: makeId(), label: draft.label.trim(), cableId: draft.cableId, riserIds: [...draft.riserIds], segments: draft.segments.map((segment) => ({ sheetId: segment.sheetId, markupId: makeId() })), serviceLoopFt: draft.serviceLoopFt, slackPercent: draft.slackPercent, connectionId: makeId() };
  let next: Project = {
    ...project,
    building: { ...project.building, routes: [...project.building.routes, route] },
    sheets: project.sheets.map((sheet) => ({
      ...sheet,
      markups: [...sheet.markups, ...draft.segments.flatMap((segment, index): CableMarkup[] => {
        if (segment.sheetId !== sheet.id) return [];
        const before = index > 0 ? project.sheets.find((candidate) => candidate.id === draft.segments[index - 1].sheetId)?.name : undefined;
        const after = index < draft.segments.length - 1 ? project.sheets.find((candidate) => candidate.id === draft.segments[index + 1].sheetId)?.name : undefined;
        const points = segment.points.map((point) => ({ ...point }));
        if (index === 0) points[0] = { x: from.x, y: from.y };
        if (index === draft.segments.length - 1 && points.length) points[points.length - 1] = { x: to.x, y: to.y };
        const pointAttachments = points.map((_, pointIndex) => {
          const device = index === 0 && pointIndex === 0 ? from : index === draft.segments.length - 1 && pointIndex === points.length - 1 ? to : undefined;
          return device ? { deviceMarkupId: device.id, deviceTag: device.tag, deviceId: device.deviceId, category: device.category } : null;
        });
        return [{ id: route.segments[index].markupId, kind: "cable", layer: "cable", cableId: draft.cableId, points: points.flatMap((point) => [point.x, point.y]), pointAttachments, physicalLabel: `${route.label}/${index + 1}`, endpointA: before ? `From ${before}` : from.tag, endpointB: after ? `To ${after}` : to.tag, notes: `Part of ${route.label}. Edit or remove the complete route in Floors.`, locked: true }];
      })],
    })),
    updatedAt: Date.now(),
  };
  measureBuildingRoute(next, route);
  const connection: DeviceConnection = withAutoAssignedConnectionPorts(next, { id: route.connectionId!, fromTag: from.tag, toTag: to.tag, medium: route.cableId, cableMarkupId: route.segments[0].markupId, label: route.label });
  next = { ...next, connections: [...(next.connections ?? []), connection] };
  return next;
}

export function removeBuildingRoute(project: Project, routeId: string): Project {
  const route = project.building?.routes.find((candidate) => candidate.id === routeId);
  if (!route || !project.building) return project;
  const ids = new Set(route.segments.map((segment) => segment.markupId));
  return { ...project, building: { ...project.building, routes: project.building.routes.filter((candidate) => candidate.id !== routeId) }, sheets: project.sheets.map((sheet) => ({ ...sheet, markups: sheet.markups.filter((markup) => !ids.has(markup.id)) })), connections: project.connections?.filter((connection) => connection.id !== route.connectionId), updatedAt: Date.now() };
}
