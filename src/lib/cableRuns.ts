import type {
  CableMarkup,
  CableRunEndpoint,
  DeviceMarkup,
  DeviceConnection,
  Markup,
  Sheet,
} from "../store/projectStore";
import type { Calibration } from "../store/projectStore";
import { polylineLengthPts, ptsToFeet } from "./geometry";
import { nestedBubblePoint } from "./nesting";

export const ROUTE_INFRA_DEVICE_IDS = new Set([
  "site-handhole",
  "site-pullbox",
  "site-junction-box",
  "site-jbox-out",
  "site-weatherproof-enclosure",
  "site-fiber-splice",
  "site-conduit",
]);

export type CableRunEndpointKey = "A" | "B";

export interface CableRunEndpointHit {
  cable: CableMarkup;
  endpoint: CableRunEndpointKey;
  x: number;
  y: number;
  distance: number;
}

export interface NearestCableRunEndpointCandidate extends CableRunEndpointHit {
  pointIndex: number;
  attachment: CableMarkup["pointAttachments"] extends Array<infer T> | undefined
    ? T | undefined
    : never;
}

export const CABLE_RUN_ENDPOINT_SNAP_PTS = 14;
export const DEFAULT_SERVICE_LOOP_FT = 10;
export const CABLE_RUN_SEGMENT_HIT_PTS = 14;

export function isCableAddressableMarkup(markup: Markup): markup is DeviceMarkup {
  if (markup.kind !== "device") return false;
  return (markup as DeviceMarkup & { cableConnectable?: boolean }).cableConnectable !== false;
}

export function endpointFromMarkup(
  markup: Markup,
  options: { asRouteWaypoint?: boolean; markups?: Markup[] } = {},
): CableRunEndpoint | null {
  if (!isCableAddressableMarkup(markup)) return null;
  const parent = markup.parentId
    ? options.markups?.find(
        (m): m is DeviceMarkup => m.kind === "device" && m.id === markup.parentId,
      )
    : null;
  const anchor = parent ? nestedBubblePoint(options.markups ?? [], parent, markup) : markup;
  const tag = markup.tag?.trim();
  const label = markup.labelOverride?.trim()
    ? `${tag} · ${markup.labelOverride.trim()}`
    : tag;
  const routeWaypoint =
    options.asRouteWaypoint === true || ROUTE_INFRA_DEVICE_IDS.has(markup.deviceId);
  return {
    x: anchor.x,
    y: anchor.y,
    label: label || undefined,
    deviceMarkupId: markup.id,
    deviceTag: tag || undefined,
    deviceId: markup.deviceId,
    category: markup.category,
    ...(routeWaypoint ? { routeWaypoint: true } : {}),
  };
}

export function isRouteInfrastructureMarkup(
  markup: Markup,
): markup is DeviceMarkup {
  return markup.kind === "device" && ROUTE_INFRA_DEVICE_IDS.has(markup.deviceId);
}

export function routeInfrastructureLabel(markup: DeviceMarkup) {
  const tag = markup.tag?.trim();
  if (!tag) return undefined;
  return markup.labelOverride?.trim()
    ? `${tag} · ${markup.labelOverride.trim()}`
    : tag;
}

export function nearestCableRunEndpoint(
  markups: Markup[],
  point: { x: number; y: number },
  threshold = CABLE_RUN_ENDPOINT_SNAP_PTS,
  options: {
    ignoreEndpoint?: (candidate: NearestCableRunEndpointCandidate) => boolean;
  } = {},
): CableRunEndpointHit | null {
  let best: CableRunEndpointHit | null = null;
  for (const m of markups) {
    if (m.kind !== "cable" || m.points.length < 4) continue;
    const lastPointIndex = Math.floor(m.points.length / 2) - 1;
    const endpoints: Array<{
      endpoint: CableRunEndpointKey;
      pointIndex: number;
      x: number;
      y: number;
    }> = [
      { endpoint: "A", pointIndex: 0, x: m.points[0], y: m.points[1] },
      {
        endpoint: "B",
        pointIndex: lastPointIndex,
        x: m.points[m.points.length - 2],
        y: m.points[m.points.length - 1],
      },
    ];
    for (const candidate of endpoints) {
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance > threshold) continue;
      if (
        options.ignoreEndpoint?.({
          cable: m,
          distance,
          ...candidate,
          attachment: m.pointAttachments?.[candidate.pointIndex],
        })
      ) {
        continue;
      }
      if (!best || distance < best.distance) {
        best = {
          cable: m,
          endpoint: candidate.endpoint,
          x: candidate.x,
          y: candidate.y,
          distance,
        };
      }
    }
  }
  return best;
}

export function nearestCableRunPoint(
  cable: CableMarkup,
  point: { x: number; y: number },
  threshold = CABLE_RUN_SEGMENT_HIT_PTS,
): CableRunEndpoint | null {
  if (cable.points.length < 2) return null;
  let best: { x: number; y: number; distance: number } | null = null;
  for (let i = 2; i < cable.points.length; i += 2) {
    const candidate = closestPointOnSegment(
      point,
      { x: cable.points[i - 2], y: cable.points[i - 1] },
      { x: cable.points[i], y: cable.points[i + 1] },
    );
    if (candidate.distance > threshold) continue;
    if (!best || candidate.distance < best.distance) best = candidate;
  }
  if (!best) return null;
  return { x: best.x, y: best.y, label: servedDevicesSummary(cable) || cable.endpointA };
}

export function servedDevicesSummary(
  markup: Pick<CableMarkup, "servedDevices" | "endpointB">,
): string {
  const labels = markup.servedDevices?.filter(Boolean) ?? [];
  if (labels.length > 0) return labels.join(", ");
  return markup.endpointB ?? "";
}

export function buildCableRunMarkup(
  id: string,
  cableId: string,
  route: CableRunEndpoint[],
  options: Pick<
    CableMarkup,
    | "conduitType"
    | "conduitSize"
    | "fiberStrandCount"
    | "serviceLoopFt"
    | "routeStyle"
    | "physicalLabel"
  > = {},
): CableMarkup {
  const first = route[0];
  const last = route[route.length - 1];
  const autoDrop =
    cableId !== "conduit" && isRouteInfrastructureToCameraDrop(route);
  return {
    id,
    kind: "cable",
    layer: "cable",
    cableId,
    ...options,
    runCount: 1,
    ...(autoDrop && options.serviceLoopFt === undefined
      ? { serviceLoopFt: DEFAULT_SERVICE_LOOP_FT }
      : {}),
    ...(autoDrop && options.routeStyle === undefined
      ? { routeStyle: "archedDrop" as const }
      : {}),
    points: route.flatMap((p) => [p.x, p.y]),
    pointAttachments: route.map((p) =>
      p.deviceMarkupId || p.deviceTag
        ? {
            deviceMarkupId: p.deviceMarkupId,
            deviceTag: p.deviceTag,
            label: p.label,
            deviceId: p.deviceId,
            category: p.category,
            routeWaypoint: p.routeWaypoint,
          }
        : null,
    ),
    endpointA: first?.label,
    endpointB: last && last !== first ? last.label : undefined,
  };
}

export function runCountFor(markup: Pick<CableMarkup, "runCount">): number {
  const n = Math.floor(Number(markup.runCount ?? 1));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function serviceLoopFtFor(markup: Pick<CableMarkup, "serviceLoopFt">): number {
  const n = Number(markup.serviceLoopFt ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function cableSlackPercentFor(
  markup: Pick<CableMarkup, "slackPercent">,
  projectDefault = 0,
): number {
  const n = Number(markup.slackPercent ?? projectDefault);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function cableLengthBreakdown(
  markup: Pick<CableMarkup, "points" | "runCount" | "serviceLoopFt" | "slackPercent">,
  calibration: Calibration | undefined,
  projectSlackPercent = 0,
) {
  const baseFt = ptsToFeet(polylineLengthPts(markup.points), calibration);
  if (baseFt === null) return null;
  const runCount = runCountFor(markup);
  const serviceLoopFt = serviceLoopFtFor(markup);
  const slackPercent = cableSlackPercentFor(markup, projectSlackPercent);
  const singleWithServiceLoop = baseFt + serviceLoopFt;
  return {
    baseFt,
    runCount,
    serviceLoopFt,
    slackPercent,
    totalRawFt: baseFt * runCount,
    totalServiceLoopFt: serviceLoopFt * runCount,
    totalWithServiceLoopFt: singleWithServiceLoop * runCount,
    totalWithSlackFt: singleWithServiceLoop * (1 + slackPercent / 100) * runCount,
  };
}

export interface RouteBoxCableSummary {
  cable: CableMarkup;
  role: "Pass-through" | "Termination";
}

export interface ConduitCarrySummary {
  conduit: CableMarkup;
  carriedCables: CableMarkup[];
}

function isCameraEndpoint(endpoint: CableRunEndpoint | undefined): boolean {
  return (
    endpoint?.category === "cameras" ||
    endpoint?.deviceId?.startsWith("cam-") === true
  );
}

export function isRouteInfrastructureToCameraDrop(route: CableRunEndpoint[]) {
  const last = route[route.length - 1];
  const penultimate = route[route.length - 2];
  return !!penultimate?.routeWaypoint && isCameraEndpoint(last);
}

export function routeSummariesForDevice(
  sheet: Sheet,
  device: DeviceMarkup,
): RouteBoxCableSummary[] {
  const summaries: RouteBoxCableSummary[] = [];
  for (const markup of sheet.markups) {
    if (markup.kind !== "cable") continue;
    const pointIndex = matchingPointIndex(markup.points, device.x, device.y);
    const tagMatch =
      !!device.tag &&
      (markup.endpointA === device.tag ||
        markup.endpointB === device.tag ||
        markup.endpointA?.startsWith(`${device.tag} ·`) ||
        markup.endpointB?.startsWith(`${device.tag} ·`));
    if (pointIndex === -1 && !tagMatch) continue;
    const lastIndex = markup.points.length / 2 - 1;
    const role =
      tagMatch || pointIndex === 0 || pointIndex === lastIndex
        ? "Termination"
        : "Pass-through";
    summaries.push({ cable: markup, role });
  }
  return summaries;
}

export function conduitCarrySummaries(sheet: Sheet): ConduitCarrySummary[] {
  const conduits = sheet.markups.filter(
    (m): m is CableMarkup => m.kind === "cable" && m.cableId === "conduit",
  );
  const cables = sheet.markups.filter(
    (m): m is CableMarkup => m.kind === "cable" && m.cableId !== "conduit",
  );
  return conduits.map((conduit) => ({
    conduit,
    carriedCables: cables.filter((cable) => cableUsesConduitPath(cable, conduit)),
  }));
}

export function carriedByConduits(sheet: Sheet, cable: CableMarkup): CableMarkup[] {
  if (cable.cableId === "conduit") return [];
  return conduitCarrySummaries(sheet)
    .filter((summary) => summary.carriedCables.some((c) => c.id === cable.id))
    .map((summary) => summary.conduit);
}

export interface RunLabelOffset {
  dx: number;
  dy: number;
}

export interface RunLabelLayout {
  offset: RunLabelOffset;
  visible: boolean;
  clustered: boolean;
  manual: boolean;
}

const RUN_LABEL_CLUSTER_RADIUS_PTS = 42;
const RUN_LABEL_CLUSTER_MIN = 4;
const RUN_LABEL_CLUSTER_MAX_VISIBLE = 2;

/**
 * Resolve a cable/conduit label offset from the route midpoint. Manual offsets
 * win; otherwise deterministic lanes separate conduit labels from cable/fiber
 * labels that share the same conduit path.
 */
export function runLabelOffsetFor(
  markup: Pick<CableMarkup, "id" | "cableId" | "points" | "labelOffsetX" | "labelOffsetY">,
  markups: Markup[],
): RunLabelOffset {
  if (
    typeof markup.labelOffsetX === "number" ||
    typeof markup.labelOffsetY === "number"
  ) {
    return {
      dx: markup.labelOffsetX ?? 0,
      dy: markup.labelOffsetY ?? -11,
    };
  }
  if (markup.cableId === "conduit") {
    const carriesCable = markups.some(
      (m) =>
        m.kind === "cable" &&
        m.id !== markup.id &&
        m.cableId !== "conduit" &&
        cableUsesConduitPath(m, markup as CableMarkup),
    );
    return carriesCable ? { dx: 0, dy: -20 } : { dx: 0, dy: -11 };
  }
  const conduitIndex = markups.findIndex(
    (m) =>
      m.kind === "cable" &&
      m.cableId === "conduit" &&
      cableUsesConduitPath(markup as CableMarkup, m),
  );
  if (conduitIndex === -1) return { dx: 0, dy: -11 };

  const conduit = markups[conduitIndex] as CableMarkup;
  const sameLane = markups
    .filter(
      (m): m is CableMarkup =>
        m.kind === "cable" &&
        m.cableId !== "conduit" &&
        cableUsesConduitPath(m, conduit),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const lane = Math.max(0, sameLane.findIndex((m) => m.id === markup.id));
  return { dx: 0, dy: 10 + lane * 16 };
}

/**
 * Decide which cable/conduit run labels should draw. Labels are opt-in through
 * the project-wide toggle; when enabled, dense auto-placed clusters are thinned
 * so pull-box fan-outs do not produce a stack of nearly identical tags. Manual
 * label offsets and selected runs win only while the global toggle is on.
 */
export function runLabelLayoutsFor(
  markups: Markup[],
  options: {
    showRunLabels?: boolean;
    selectedIds?: Set<string>;
  } = {},
): Map<string, RunLabelLayout> {
  const showRunLabels = options.showRunLabels === true;
  const selectedIds = options.selectedIds ?? new Set<string>();
  const layouts = new Map<string, RunLabelLayout>();
  type Candidate = {
    cable: CableMarkup;
    x: number;
    y: number;
    manual: boolean;
    selected: boolean;
  };
  const candidates: Candidate[] = [];

  for (const m of markups) {
    if (m.kind !== "cable" || m.hidden) continue;
    const offset = runLabelOffsetFor(m, markups);
    const manual =
      typeof m.labelOffsetX === "number" || typeof m.labelOffsetY === "number";
    const selected = selectedIds.has(m.id);
    const mid = runLabelAnchorPoint(m.points, offset);
    const globallyHidden = !showRunLabels || m.showLabel === false;
    layouts.set(m.id, {
      offset,
      visible: !globallyHidden && (manual || selected),
      clustered: false,
      manual,
    });
    if (!mid || globallyHidden || manual || selected) continue;
    candidates.push({ cable: m, x: mid.x, y: mid.y, manual, selected });
  }

  const clusters: Candidate[][] = [];
  for (const candidate of candidates) {
    let best: Candidate[] | null = null;
    let bestDistance = Infinity;
    for (const cluster of clusters) {
      const center = clusterCenter(cluster);
      const distance = Math.hypot(candidate.x - center.x, candidate.y - center.y);
      if (distance <= RUN_LABEL_CLUSTER_RADIUS_PTS && distance < bestDistance) {
        best = cluster;
        bestDistance = distance;
      }
    }
    if (best) best.push(candidate);
    else clusters.push([candidate]);
  }

  for (const cluster of clusters) {
    if (cluster.length < RUN_LABEL_CLUSTER_MIN) {
      for (const candidate of cluster) {
        const cur = layouts.get(candidate.cable.id);
        if (cur) layouts.set(candidate.cable.id, { ...cur, visible: true });
      }
      continue;
    }

    const visibleIds = visibleClusterMembers(cluster);
    for (const candidate of cluster) {
      const cur = layouts.get(candidate.cable.id);
      if (!cur) continue;
      layouts.set(candidate.cable.id, {
        ...cur,
        visible: visibleIds.has(candidate.cable.id),
        clustered: true,
      });
    }
  }

  return layouts;
}

function runLabelAnchorPoint(points: number[], offset: RunLabelOffset) {
  const mid = midpointOfRun(points);
  if (!mid) return null;
  return { x: mid.x + offset.dx, y: mid.y + offset.dy };
}

function midpointOfRun(points: number[]) {
  if (points.length < 4) return null;
  const total = polylineLengthPts(points);
  const target = total / 2;
  let acc = 0;
  for (let i = 2; i < points.length; i += 2) {
    const ax = points[i - 2];
    const ay = points[i - 1];
    const bx = points[i];
    const by = points[i + 1];
    const seg = Math.hypot(bx - ax, by - ay);
    if (acc + seg >= target) {
      const t = seg === 0 ? 0 : (target - acc) / seg;
      return {
        x: ax + (bx - ax) * t,
        y: ay + (by - ay) * t,
      };
    }
    acc += seg;
  }
  return {
    x: points[points.length - 2],
    y: points[points.length - 1],
  };
}

function clusterCenter(cluster: Array<{ x: number; y: number }>) {
  return {
    x: cluster.reduce((sum, p) => sum + p.x, 0) / cluster.length,
    y: cluster.reduce((sum, p) => sum + p.y, 0) / cluster.length,
  };
}

function visibleClusterMembers(cluster: CandidateForCluster[]): Set<string> {
  const visible = new Set<string>();
  if (cluster.length === 0) return visible;
  visible.add(cluster[0].cable.id);
  if (RUN_LABEL_CLUSTER_MAX_VISIBLE <= 1 || cluster.length === 1) return visible;

  let farthest = cluster[0];
  let farthestDistance = -1;
  const first = cluster[0];
  for (const candidate of cluster.slice(1)) {
    const distance = Math.hypot(candidate.x - first.x, candidate.y - first.y);
    if (distance > farthestDistance) {
      farthest = candidate;
      farthestDistance = distance;
    }
  }
  visible.add(farthest.cable.id);
  return visible;
}

type CandidateForCluster = {
  cable: CableMarkup;
  x: number;
  y: number;
};

function matchingPointIndex(points: number[], x: number, y: number, tolerance = 1) {
  for (let i = 0; i + 1 < points.length; i += 2) {
    if (Math.hypot(points[i] - x, points[i + 1] - y) <= tolerance) return i / 2;
  }
  return -1;
}

function closestPointOnSegment(
  point: { x: number; y: number },
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  const t =
    lenSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lenSq));
  const x = a.x + dx * t;
  const y = a.y + dy * t;
  return { x, y, distance: Math.hypot(point.x - x, point.y - y) };
}

function cableUsesConduitPath(cable: CableMarkup, conduit: CableMarkup) {
  for (let ci = 2; ci < cable.points.length; ci += 2) {
    const ca = { x: cable.points[ci - 2], y: cable.points[ci - 1] };
    const cb = { x: cable.points[ci], y: cable.points[ci + 1] };
    for (let pi = 2; pi < conduit.points.length; pi += 2) {
      const pa = { x: conduit.points[pi - 2], y: conduit.points[pi - 1] };
      const pb = { x: conduit.points[pi], y: conduit.points[pi + 1] };
      if (sameSegment(ca, cb, pa, pb)) return true;
    }
  }
  return false;
}

function sameSegment(
  a1: { x: number; y: number },
  a2: { x: number; y: number },
  b1: { x: number; y: number },
  b2: { x: number; y: number },
  tolerance = 1,
) {
  return (
    (samePoint(a1, b1, tolerance) && samePoint(a2, b2, tolerance)) ||
    (samePoint(a1, b2, tolerance) && samePoint(a2, b1, tolerance))
  );
}

function samePoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
  tolerance: number,
) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= tolerance;
}

export function buildCableRunConnection(
  id: string,
  cableMarkupId: string,
  cableId: string,
  route: CableRunEndpoint[],
): DeviceConnection | null {
  const start = route[0];
  const end = route[route.length - 1];
  if (!start || !end) return null;
  if (!start.deviceTag || !end.deviceTag || start.deviceTag === end.deviceTag) {
    return null;
  }
  return {
    id,
    fromTag: start.deviceTag,
    toTag: end.deviceTag,
    medium: cableId,
    cableMarkupId,
  };
}
