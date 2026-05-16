// @vitest-environment node
import { beforeEach, describe, expect, it } from "vitest";
import {
  buildCableRunConnection,
  buildCableRunMarkup,
  cableLengthBreakdown,
  conduitCarrySummaries,
  DEFAULT_SERVICE_LOOP_FT,
  endpointFromMarkup,
  isCableAddressableMarkup,
  nearestCableRunEndpoint,
  nearestCableRunPoint,
  runLabelLayoutsFor,
  runLabelOffsetFor,
  routeSummariesForDevice,
  runCountFor,
  servedDevicesSummary,
} from "../src/lib/cableRuns";
import {
  approximateConduitFill,
  compactConduitLabel,
  CONDUIT_TYPES,
  conduitLabelFor,
} from "../src/lib/conduit";
import { computeBid } from "../src/lib/bid";
import {
  fiberCompactLabel,
  fiberDisplayLabel,
  normalizeFiberStrandCount,
} from "../src/lib/fiber";
import { devicesById } from "../src/data/devices";
import {
  useProjectStore,
  type CableMarkup,
  type DeviceConnection,
  type DeviceMarkup,
  type Sheet,
} from "../src/store/projectStore";
import { nestedSlotPoint } from "../src/lib/nesting";

const device = (overrides: Partial<DeviceMarkup> = {}): DeviceMarkup => ({
  id: "m1",
  kind: "device",
  layer: "cameras",
  deviceId: "cam-dome",
  category: "cameras",
  x: 10,
  y: 20,
  tag: "CAM-01",
  ...overrides,
});

const sheet = (): Sheet => ({
  id: "sheet-1",
  name: "Sheet 1",
  fileName: "sheet.pdf",
  pageWidth: 200,
  pageHeight: 200,
  renderScale: 1,
  markups: [],
});

const cable = (overrides: Partial<CableMarkup> = {}): CableMarkup => ({
  id: "cable-1",
  kind: "cable",
  layer: "cable",
  cableId: "cat6",
  points: [0, 0, 40, 0, 80, 0],
  ...overrides,
});

describe("cable run helpers", () => {
  beforeEach(() => {
    useProjectStore.getState().newProject({ projectName: "Cable Test" });
    useProjectStore.getState().addSheet(sheet());
    useProjectStore.getState().setActiveTool("cable");
    useProjectStore.getState().setActiveCable("cat6");
  });

  it("anchors device endpoints to the device center and tag label", () => {
    const endpoint = endpointFromMarkup(device({ labelOverride: "Lobby" }));

    expect(endpoint).toMatchObject({
      x: 10,
      y: 20,
      label: "CAM-01 · Lobby",
      deviceTag: "CAM-01",
    });
  });

  it("anchors nested device endpoints to the visible bubble", () => {
    const headEnd = device({
      id: "he-1",
      layer: "network",
      deviceId: "net-headend",
      category: "network",
      x: 100,
      y: 100,
      tag: "HE-01",
    });
    const sw = device({
      id: "sw-1",
      layer: "network",
      deviceId: "net-switch-poe",
      category: "network",
      x: 130,
      y: 100,
      tag: "SW-01",
      parentId: "he-1",
    });
    const markups = [headEnd, sw];
    const slot = nestedSlotPoint(markups, headEnd, sw);

    expect(endpointFromMarkup(sw, { markups })).toMatchObject({
      x: slot.x,
      y: slot.y,
      deviceMarkupId: "sw-1",
      deviceTag: "SW-01",
    });
  });

  it("treats APs and head-end cabinets as cable-addressable device endpoints", () => {
    const ap = device({
      id: "ap-1",
      layer: "network",
      deviceId: "net-ap-i",
      category: "network",
      x: 32,
      y: 48,
      tag: "AP-01",
      labelOverride: "Lobby Wi-Fi",
    });
    const headEnd = device({
      id: "he-1",
      layer: "network",
      deviceId: "net-headend",
      category: "network",
      x: 100,
      y: 120,
      tag: "HE-01",
    });

    expect(isCableAddressableMarkup(ap)).toBe(true);
    expect(endpointFromMarkup(ap)).toMatchObject({
      x: 32,
      y: 48,
      label: "AP-01 · Lobby Wi-Fi",
      deviceTag: "AP-01",
      deviceId: "net-ap-i",
      category: "network",
    });
    expect(endpointFromMarkup(headEnd)).toMatchObject({
      x: 100,
      y: 120,
      label: "HE-01",
      deviceTag: "HE-01",
      deviceId: "net-headend",
      category: "network",
    });
  });

  it("can promote any cable-addressable device click to a route waypoint", () => {
    const endpoint = endpointFromMarkup(
      device({
        layer: "network",
        deviceId: "net-ap-i",
        category: "network",
        tag: "AP-01",
      }),
      { asRouteWaypoint: true },
    );

    expect(endpoint).toMatchObject({
      label: "AP-01",
      deviceTag: "AP-01",
      deviceId: "net-ap-i",
      routeWaypoint: true,
    });
  });

  it("marks route infrastructure devices as cable waypoints", () => {
    expect(devicesById["site-junction-box"]?.label).toBe("Junction Box");
    expect(devicesById["site-pullbox"]?.label).toBe("Pull Box");
    expect(devicesById["site-weatherproof-enclosure"]?.label).toBe(
      "Weatherproof Enclosure",
    );

    expect(
      endpointFromMarkup(
        device({
          deviceId: "site-junction-box",
          category: "site",
          tag: "JB-01",
        }),
      ),
    ).toMatchObject({
      label: "JB-01",
      deviceTag: "JB-01",
      routeWaypoint: true,
    });
  });

  it("builds a two-point cable markup with endpoint labels", () => {
    const markup = buildCableRunMarkup(
      "cable-1",
      "cat6",
      [
        { x: 10, y: 20, label: "MDF", deviceTag: "MDF-01" },
        { x: 50, y: 60, label: "CAM-01", deviceTag: "CAM-01" },
      ],
    );

    expect(markup).toMatchObject({
      id: "cable-1",
      kind: "cable",
      layer: "cable",
      cableId: "cat6",
      runCount: 1,
      points: [10, 20, 50, 60],
      endpointA: "MDF",
      endpointB: "CAM-01",
    });
  });

  it("automatically separates conduit and carried cable run labels", () => {
    const conduit = cable({
      id: "conduit-1",
      cableId: "conduit",
      points: [0, 0, 40, 0, 80, 0],
    });
    const fiber = cable({
      id: "fiber-1",
      cableId: "fiber-sm",
      points: [0, 0, 40, 0],
    });
    const markups = [conduit, fiber];

    expect(runLabelOffsetFor(conduit, markups)).toEqual({ dx: 0, dy: -20 });
    expect(runLabelOffsetFor(fiber, markups)).toEqual({ dx: 0, dy: 10 });
  });

  it("preserves manual cable run label offsets", () => {
    const markup = cable({ labelOffsetX: 18, labelOffsetY: -32 });

    expect(runLabelOffsetFor(markup, [markup])).toEqual({ dx: 18, dy: -32 });
  });

  it("thins dense auto-placed run label clusters", () => {
    const runs = Array.from({ length: 6 }, (_, i) =>
      cable({
        id: `drop-${i + 1}`,
        points: [0, 0, 80 + i * 2, i % 2 === 0 ? 0 : 2],
      }),
    );

    const layouts = runLabelLayoutsFor(runs, { showRunLabels: true });
    const visible = runs.filter((run) => layouts.get(run.id)?.visible);

    expect(visible.length).toBeLessThan(runs.length);
    expect(visible.length).toBe(2);
    expect(layouts.get("drop-3")?.clustered).toBe(true);
  });

  it("keeps manual and selected run labels visible inside dense clusters", () => {
    const runs = Array.from({ length: 6 }, (_, i) =>
      cable({
        id: `drop-${i + 1}`,
        points: [0, 0, 80 + i * 2, i % 2 === 0 ? 0 : 2],
        ...(i === 2 ? { labelOffsetX: 24, labelOffsetY: -28 } : {}),
      }),
    );

    const layouts = runLabelLayoutsFor(runs, {
      showRunLabels: true,
      selectedIds: new Set(["drop-5"]),
    });

    expect(layouts.get("drop-3")?.visible).toBe(true);
    expect(layouts.get("drop-3")?.manual).toBe(true);
    expect(layouts.get("drop-5")?.visible).toBe(true);
  });

  it("defaults run label layouts hidden until the global toggle is enabled", () => {
    const run = cable({ id: "run-1" });

    expect(runLabelLayoutsFor([run]).get("run-1")?.visible).toBe(false);
    expect(
      runLabelLayoutsFor([run], { showRunLabels: true }).get("run-1")?.visible,
    ).toBe(true);
  });

  it("defaults new and loaded project run labels off unless explicitly enabled", () => {
    const store = useProjectStore.getState();
    const currentProject = store.project!;

    expect(store.runLabelsVisible).toBe(false);
    expect(currentProject.runLabelsVisible).toBe(false);

    store.loadProject({ ...currentProject, runLabelsVisible: undefined });
    expect(useProjectStore.getState().runLabelsVisible).toBe(false);

    store.loadProject({ ...currentProject, runLabelsVisible: true });
    expect(useProjectStore.getState().runLabelsVisible).toBe(true);
  });

  it("honors global and per-run run label visibility toggles", () => {
    const visibleRun = cable({ id: "visible" });
    const hiddenRun = cable({ id: "hidden", showLabel: false });

    expect(
      runLabelLayoutsFor([visibleRun, hiddenRun], { showRunLabels: true }).get(
        "hidden",
      )?.visible,
    ).toBe(false);
    expect(
      runLabelLayoutsFor([visibleRun, hiddenRun], { showRunLabels: false }).get(
        "visible",
      )?.visible,
    ).toBe(false);
  });

  it("keeps manual and selected run labels hidden when the global toggle is off", () => {
    const manualRun = cable({
      id: "manual",
      labelOffsetX: 18,
      labelOffsetY: -24,
      showLabel: true,
    });
    const selectedRun = cable({ id: "selected", showLabel: true });

    const layouts = runLabelLayoutsFor([manualRun, selectedRun], {
      showRunLabels: false,
      selectedIds: new Set(["selected"]),
    });

    expect(layouts.get("manual")?.visible).toBe(false);
    expect(layouts.get("selected")?.visible).toBe(false);
  });

  it("builds a routed cable markup through pinned turn points", () => {
    const markup = buildCableRunMarkup(
      "cable-2",
      "cat6a",
      [
        { x: 10, y: 20, label: "SW-01", deviceTag: "SW-01" },
        { x: 25, y: 20 },
        { x: 25, y: 45 },
        { x: 50, y: 60, label: "CAM-01", deviceTag: "CAM-01" },
      ],
    );

    expect(markup.points).toEqual([10, 20, 25, 20, 25, 45, 50, 60]);
    expect(markup.endpointA).toBe("SW-01");
    expect(markup.endpointB).toBe("CAM-01");
  });

  it("marks pull-box-to-camera drops as arched drops with service loop", () => {
    const markup = buildCableRunMarkup(
      "drop-1",
      "cat6",
      [
        {
          x: 10,
          y: 20,
          label: "PB-01",
          deviceTag: "PB-01",
          deviceId: "site-pullbox",
          category: "site",
          routeWaypoint: true,
        },
        {
          x: 50,
          y: 60,
          label: "CAM-01",
          deviceTag: "CAM-01",
          deviceId: "cam-dome",
          category: "cameras",
        },
      ],
    );

    expect(markup.routeStyle).toBe("archedDrop");
    expect(markup.serviceLoopFt).toBe(DEFAULT_SERVICE_LOOP_FT);
  });

  it("adds service loop before percent slack in cable length math", () => {
    const markup = buildCableRunMarkup(
      "drop-2",
      "cat6",
      [
        { x: 0, y: 0 },
        { x: 30, y: 40 },
      ],
      { serviceLoopFt: 10 },
    );

    expect(
      cableLengthBreakdown(
        { ...markup, slackPercent: 10, runCount: 2 },
        {
          p1: { x: 0, y: 0 },
          p2: { x: 10, y: 0 },
          realFeet: 1,
          pixelsPerFoot: 10,
        },
        0,
      ),
    ).toMatchObject({
      baseFt: 5,
      runCount: 2,
      totalServiceLoopFt: 20,
      totalWithSlackFt: 33,
    });
  });

  it("normalizes run count to a positive integer", () => {
    expect(runCountFor({ runCount: undefined })).toBe(1);
    expect(runCountFor({ runCount: 3 })).toBe(3);
    expect(runCountFor({ runCount: 2.8 })).toBe(2);
    expect(runCountFor({ runCount: 0 })).toBe(1);
  });

  it("finds the nearest cable run endpoint within the snap threshold", () => {
    const cable: CableMarkup = {
      id: "cable-1",
      kind: "cable",
      layer: "cable",
      cableId: "conduit",
      points: [10, 20, 50, 20, 50, 60],
    };

    expect(nearestCableRunEndpoint([cable], { x: 52, y: 59 }, 8)).toMatchObject({
      cable,
      endpoint: "B",
      x: 50,
      y: 60,
    });
    expect(nearestCableRunEndpoint([cable], { x: 32, y: 20 }, 8)).toBeNull();
  });

  it("finds a branch anchor on the middle of an existing route", () => {
    const main = cable({
      id: "main-route",
      endpointA: "HE-01",
      endpointB: "PB-01",
      points: [10, 20, 80, 20, 80, 90],
    });

    expect(nearestCableRunPoint(main, { x: 42, y: 23 }, 8)).toMatchObject({
      x: 42,
      y: 20,
    });
    expect(nearestCableRunPoint(main, { x: 42, y: 45 }, 8)).toBeNull();
  });

  it("persists conduit size and type on cable markups", () => {
    const markup = buildCableRunMarkup(
      "conduit-1",
      "conduit",
      [
        { x: 0, y: 0, label: "MDF" },
        { x: 50, y: 20 },
        { x: 100, y: 0, label: "Gate" },
      ],
      { conduitType: "PVC Schedule 40", conduitSize: "2\"" },
    );

    expect(markup).toMatchObject({
      cableId: "conduit",
      conduitType: "PVC Schedule 40",
      conduitSize: "2\"",
    });
    expect(conduitLabelFor(markup)).toBe("PVC Schedule 40 2\"");
  });

  it("persists physical labels without changing compact visual labels", () => {
    const markup = buildCableRunMarkup(
      "fiber-label-1",
      "fiber-sm",
      [
        { x: 0, y: 0, label: "MDF" },
        { x: 100, y: 0, label: "IDF" },
      ],
      { fiberStrandCount: 24, physicalLabel: "FOC-BLDG-A-001" },
    );

    expect(markup.physicalLabel).toBe("FOC-BLDG-A-001");
    expect(fiberCompactLabel("fiber-sm", "SMF", markup)).toBe("SMF 24F");
  });

  it("persists custom fiber strand counts on cable runs", () => {
    const markup = buildCableRunMarkup(
      "fiber-1",
      "fiber-sm",
      [
        { x: 0, y: 0, label: "MDF" },
        { x: 100, y: 0, label: "IDF" },
      ],
      { fiberStrandCount: 144 },
    );

    expect(markup.fiberStrandCount).toBe(144);
    expect(normalizeFiberStrandCount(24.9)).toBe(24);
    expect(fiberCompactLabel("fiber-sm", "SMF", markup)).toBe("SMF 144F");
    expect(fiberDisplayLabel("fiber-sm", "Single-Mode Fiber (12-strand)", markup)).toBe(
      "Single-Mode Fiber (144-strand)",
    );
  });

  it("keeps bid lines separate for different fiber strand counts", () => {
    const store = useProjectStore.getState();
    store.updateSheet("sheet-1", {
      calibration: {
        p1: { x: 0, y: 0 },
        p2: { x: 10, y: 0 },
        realFeet: 1,
        pixelsPerFoot: 10,
      },
    });
    store.addMarkup(
      buildCableRunMarkup(
        "fiber-12",
        "fiber-sm",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        { fiberStrandCount: 12 },
      ),
    );
    store.addMarkup(
      buildCableRunMarkup(
        "fiber-24",
        "fiber-sm",
        [
          { x: 0, y: 10 },
          { x: 100, y: 10 },
        ],
        { fiberStrandCount: 24 },
      ),
    );

    const project = useProjectStore.getState().project;
    expect(project).toBeTruthy();
    const bid = computeBid(project!);
    expect(bid.cables.map((c) => c.label)).toEqual([
      "Single-Mode Fiber (12-strand)",
      "Single-Mode Fiber (24-strand)",
    ]);
    expect(bid.cables.map((c) => c.fiberStrandCount)).toEqual([12, 24]);
  });

  it("offers common conduit materials and grades as preserved labels", () => {
    expect(CONDUIT_TYPES).toEqual([
      "EMT",
      "Rigid Steel / RMC",
      "Aluminum Rigid",
      "IMC",
      "PVC Schedule 40",
      "PVC Schedule 80",
      "Flexible Metal Conduit / FMC",
      "Liquid-Tight Flexible Metal Conduit / LFMC",
      "ENT / Smurf Tube",
    ]);

    for (const conduitType of CONDUIT_TYPES) {
      expect(conduitLabelFor({ conduitType, conduitSize: "3/4\"" })).toBe(
        `${conduitType} 3/4"`,
      );
    }
  });

  it("builds compact conduit labels for visual tags", () => {
    expect(
      compactConduitLabel({
        conduitType: "PVC Schedule 40",
        conduitSize: '1-1/4"',
      }),
    ).toBe('PVC40 1-1/4"');
    expect(
      compactConduitLabel({
        conduitType: "Liquid-Tight Flexible Metal Conduit / LFMC",
        conduitSize: '3/4"',
      }),
    ).toBe('LFMC 3/4"');
  });

  it("creates a logical connection only when both endpoints are devices", () => {
    expect(
      buildCableRunConnection(
        "conn-1",
        "cable-1",
        "cat6",
        [
          { x: 10, y: 20, deviceTag: "MDF-01" },
          { x: 25, y: 20 },
          { x: 50, y: 60, deviceTag: "CAM-01" },
        ],
      ),
    ).toMatchObject({
      id: "conn-1",
      fromTag: "MDF-01",
      toTag: "CAM-01",
      medium: "cat6",
      cableMarkupId: "cable-1",
    });

    expect(
      buildCableRunConnection(
        "conn-2",
        "cable-2",
        "cat6",
        [
          { x: 10, y: 20 },
          { x: 50, y: 60, deviceTag: "CAM-01" },
        ],
      ),
    ).toBeNull();
  });

  it("does not create logical connections to route waypoints such as pull boxes", () => {
    const sw = device({
      id: "sw-1",
      deviceId: "net-switch-poe",
      category: "network",
      tag: "SW-01",
    });
    const pullBox = device({
      id: "pb-1",
      deviceId: "site-pullbox",
      category: "site",
      tag: "PB-01",
    });
    const cam = device({ id: "cam-1", tag: "CAM-01" });

    expect(
      buildCableRunConnection("conn-waypoint-end", "fiber-1", "fiber-sm", [
        endpointFromMarkup(sw)!,
        endpointFromMarkup(pullBox)!,
      ]),
    ).toBeNull();
    expect(
      buildCableRunConnection("conn-waypoint-start", "fiber-2", "fiber-sm", [
        endpointFromMarkup(pullBox)!,
        endpointFromMarkup(cam)!,
      ]),
    ).toBeNull();
    expect(
      buildCableRunConnection("conn-through", "fiber-3", "fiber-sm", [
        endpointFromMarkup(sw)!,
        endpointFromMarkup(pullBox)!,
        endpointFromMarkup(cam)!,
      ]),
    ).toMatchObject({
      fromTag: "SW-01",
      toTag: "CAM-01",
      cableMarkupId: "fiber-3",
    });
  });

  it("creates a routed run from device clicks and pinned turns", () => {
    const store = useProjectStore.getState();

    expect(
      store.placeCableRunEndpoint({
        x: 10,
        y: 20,
        label: "SW-01",
        deviceTag: "SW-01",
      }),
    ).toBe("started");
    expect(store.placeCableRunEndpoint({ x: 40, y: 20 })).toBe("routed");
    expect(store.placeCableRunEndpoint({ x: 40, y: 70 })).toBe("routed");
    expect(
      store.placeCableRunEndpoint({
        x: 90,
        y: 70,
        label: "CAM-01",
        deviceTag: "CAM-01",
      }),
    ).toBe("completed");

    const project = useProjectStore.getState().project;
    const cable = project?.sheets[0].markups[0];
    expect(cable).toMatchObject({
      kind: "cable",
      cableId: "cat6",
      physicalLabel: "C-001",
      points: [10, 20, 40, 20, 40, 70, 90, 70],
      endpointA: "SW-01",
      endpointB: "CAM-01",
    });
    expect(project?.connections?.[0]).toMatchObject({
      fromTag: "SW-01",
      toTag: "CAM-01",
      cableMarkupId: cable?.id,
    });
  });

  it("finishing a switch-to-pull-box route leaves it as cable metadata only", () => {
    const store = useProjectStore.getState();
    const sw = device({
      id: "sw-1",
      deviceId: "net-switch-poe",
      category: "network",
      tag: "SW-01",
      x: 20,
      y: 30,
    });
    const pullBox = device({
      id: "pb-1",
      deviceId: "site-pullbox",
      category: "site",
      tag: "PB-01",
      x: 100,
      y: 30,
    });
    store.setActiveCable("fiber-sm");
    store.addMarkup(sw);
    store.addMarkup(pullBox);

    expect(store.placeCableRunEndpoint(endpointFromMarkup(sw)!)).toBe("started");
    expect(store.placeCableRunEndpoint(endpointFromMarkup(pullBox)!)).toBe("routed");
    expect(store.finishCableRunDraft()).toBe("completed");

    const project = useProjectStore.getState().project!;
    const run = project.sheets[0].markups.find(
      (markup): markup is CableMarkup => markup.kind === "cable",
    );
    expect(run).toMatchObject({
      cableId: "fiber-sm",
      endpointA: "SW-01",
      endpointB: "PB-01",
    });
    expect(run?.pointAttachments?.at(-1)).toMatchObject({
      deviceTag: "PB-01",
      routeWaypoint: true,
    });
    expect(project.connections ?? []).toHaveLength(0);
  });

  it("auto-assigns switch and device ports for cable-run connections", () => {
    const store = useProjectStore.getState();
    const switchMarkup = device({
      id: "sw-1",
      layer: "network",
      category: "network",
      deviceId: "net-switch-poe",
      x: 10,
      y: 20,
      tag: "SW-01",
    });
    const camera = device({ id: "cam-1", x: 90, y: 20, tag: "CAM-01" });
    const ap = device({
      id: "ap-1",
      layer: "network",
      category: "network",
      deviceId: "net-ap-i",
      x: 90,
      y: 50,
      tag: "AP-01",
    });
    const bridge = device({
      id: "br-1",
      layer: "network",
      category: "network",
      deviceId: "net-wifi-bridge",
      x: 90,
      y: 80,
      tag: "BR-01",
    });
    store.addMarkup(switchMarkup);
    store.addMarkup(camera);
    store.addMarkup(ap);
    store.addMarkup(bridge);

    for (const target of [camera, ap, bridge]) {
      expect(store.placeCableRunEndpoint(endpointFromMarkup(switchMarkup)!)).toBe("started");
      expect(store.placeCableRunEndpoint(endpointFromMarkup(target)!)).toBe("completed");
    }

    const connections = useProjectStore.getState().project?.connections ?? [];
    expect(connections.map((conn) => conn.fromPortId)).toEqual([
      "port-1",
      "port-2",
      "port-3",
    ]);
    expect(connections.map((conn) => conn.toPortId)).toEqual(["eth0", "eth0", "eth0"]);
    expect(new Set(connections.map((conn) => conn.fromPortId)).size).toBe(3);
    expect(connections.map((conn) => conn.toPort)).toEqual([
      "ETH 0 (PoE in)",
      "ETH 0 (PoE in)",
      "ETH 0 (LAN)",
    ]);
  });

  it("uses junction boxes as intermediate path nodes before final device", () => {
    const store = useProjectStore.getState();

    store.placeCableRunEndpoint({
      x: 10,
      y: 20,
      label: "HE-01",
      deviceTag: "HE-01",
    });
    expect(
      store.placeCableRunEndpoint({
        x: 40,
        y: 20,
        label: "JB-01",
        deviceTag: "JB-01",
        routeWaypoint: true,
      }),
    ).toBe("routed");
    expect(
      store.placeCableRunEndpoint({
        x: 80,
        y: 40,
        label: "CAM-01",
        deviceTag: "CAM-01",
      }),
    ).toBe("completed");

    const project = useProjectStore.getState().project;
    expect(project?.sheets[0].markups[0]).toMatchObject({
      kind: "cable",
      points: [10, 20, 40, 20, 80, 40],
      endpointA: "HE-01",
      endpointB: "CAM-01",
    });
    expect(project?.connections?.[0]).toMatchObject({
      fromTag: "HE-01",
      toTag: "CAM-01",
    });
  });

  it("routes from a pull box through an AP to a head-end cabinet", () => {
    const store = useProjectStore.getState();

    store.placeCableRunEndpoint({
      x: 10,
      y: 20,
      label: "PB-01",
      deviceTag: "PB-01",
      deviceId: "site-pullbox",
      category: "site",
      routeWaypoint: true,
    });
    expect(
      store.placeCableRunEndpoint({
        x: 50,
        y: 40,
        label: "AP-01",
        deviceTag: "AP-01",
        deviceId: "net-ap-i",
        category: "network",
        routeWaypoint: true,
      }),
    ).toBe("routed");
    expect(
      store.placeCableRunEndpoint({
        x: 90,
        y: 80,
        label: "HE-01",
        deviceTag: "HE-01",
        deviceId: "net-headend",
        category: "network",
      }),
    ).toBe("completed");

    const project = useProjectStore.getState().project;
    expect(project?.sheets[0].markups[0]).toMatchObject({
      kind: "cable",
      points: [10, 20, 50, 40, 90, 80],
      endpointA: "PB-01",
      endpointB: "HE-01",
    });
    expect(project?.connections ?? []).toHaveLength(0);
  });

  it("branches from a pull box to AP and head-end device endpoints", () => {
    const store = useProjectStore.getState();

    store.placeCableRunEndpoint({
      x: 10,
      y: 20,
      label: "PB-01",
      deviceTag: "PB-01",
      deviceId: "site-pullbox",
      category: "site",
      routeWaypoint: true,
    });
    expect(
      store.branchCableRunEndpoint({
        x: 60,
        y: 40,
        label: "AP-01",
        deviceTag: "AP-01",
        deviceId: "net-ap-i",
        category: "network",
      }),
    ).toBe("completed");
    expect(
      store.branchCableRunEndpoint({
        x: 90,
        y: 70,
        label: "HE-01",
        deviceTag: "HE-01",
        deviceId: "net-headend",
        category: "network",
      }),
    ).toBe("completed");

    const project = useProjectStore.getState().project;
    expect(project?.sheets[0].markups).toHaveLength(2);
    expect(project?.sheets[0].markups.map((m) => m.kind === "cable" ? m.points : [])).toEqual([
      [10, 20, 60, 40],
      [10, 20, 90, 70],
    ]);
    expect(project?.connections ?? []).toHaveLength(0);
  });

  it("branches to multiple endpoint devices while preserving the draft route", () => {
    const store = useProjectStore.getState();

    store.placeCableRunEndpoint({
      x: 10,
      y: 20,
      label: "SW-01",
      deviceTag: "SW-01",
    });
    store.placeCableRunEndpoint({ x: 40, y: 20 });
    expect(
      store.branchCableRunEndpoint({
        x: 80,
        y: 30,
        label: "CAM-01",
        deviceTag: "CAM-01",
      }),
    ).toBe("completed");
    expect(
      store.branchCableRunEndpoint({
        x: 80,
        y: 60,
        label: "CAM-02",
        deviceTag: "CAM-02",
      }),
    ).toBe("completed");

    const project = useProjectStore.getState().project;
    expect(project?.sheets[0].markups).toHaveLength(2);
    expect(project?.sheets[0].markups.map((m) => m.kind === "cable" ? m.points : [])).toEqual([
      [10, 20, 40, 20, 80, 30],
      [10, 20, 40, 20, 80, 60],
    ]);
    expect(project?.connections?.map((c) => c.toTag)).toEqual(["CAM-01", "CAM-02"]);
    expect(useProjectStore.getState().cableRunDraft?.points).toMatchObject([
      { x: 10, y: 20 },
      { x: 40, y: 20 },
    ]);
  });

  it("bulk-branches selected camera drops from the active run origin", () => {
    const store = useProjectStore.getState();

    store.placeCableRunEndpoint({
      x: 10,
      y: 20,
      label: "PB-01",
      deviceTag: "PB-01",
      deviceId: "site-pullbox",
      category: "site",
      routeWaypoint: true,
    });
    expect(
      store.branchCableRunToEndpoints([
        {
          x: 70,
          y: 20,
          label: "CAM-01",
          deviceTag: "CAM-01",
          deviceId: "cam-dome",
          category: "cameras",
        },
        {
          x: 70,
          y: 50,
          label: "CAM-02",
          deviceTag: "CAM-02",
          deviceId: "cam-dome",
          category: "cameras",
        },
      ]),
    ).toBe(2);

    const project = useProjectStore.getState().project;
    expect(project?.sheets[0].markups).toHaveLength(2);
    expect(
      project?.sheets[0].markups.every(
        (m) =>
          m.kind === "cable" &&
          m.routeStyle === "archedDrop" &&
          m.serviceLoopFt === DEFAULT_SERVICE_LOOP_FT,
      ),
    ).toBe(true);
    expect(
      project?.sheets[0].markups
        .filter((m): m is CableMarkup => m.kind === "cable")
        .map((m) => m.physicalLabel),
    ).toEqual(["C-001", "C-002"]);
  });

  it("places multi-device drops on each target click and finalizes as one undo step", () => {
    const store = useProjectStore.getState();
    const headEnd = device({
      id: "he-1",
      layer: "network",
      category: "network",
      deviceId: "net-headend",
      x: 10,
      y: 20,
      tag: "HE-01",
    });
    const switchMarkup = device({
      id: "sw-1",
      layer: "network",
      category: "network",
      deviceId: "net-switch-poe",
      x: 90,
      y: 20,
      tag: "SW-01",
    });
    const pullBox = device({
      id: "pb-1",
      deviceId: "site-pullbox",
      category: "site",
      x: 50,
      y: 50,
      tag: "PB-01",
    });
    store.addMarkup(headEnd);
    store.addMarkup(switchMarkup);
    store.addMarkup(pullBox);
    store.clearHistory();

    store.beginCableRunBulkBranch([endpointFromMarkup(headEnd)!]);
    expect(store.toggleCableRunBulkBranchTarget(endpointFromMarkup(switchMarkup)!)).toBe(1);
    expect(
      useProjectStore.getState().project!.sheets[0].markups.filter((m) => m.kind === "cable"),
    ).toHaveLength(1);
    expect(store.toggleCableRunBulkBranchTarget(endpointFromMarkup(pullBox)!)).toBe(2);
    expect(
      useProjectStore.getState().project!.sheets[0].markups.filter((m) => m.kind === "cable"),
    ).toHaveLength(2);
    expect(useProjectStore.getState().history.past).toHaveLength(0);
    expect(store.commitCableRunBulkBranch()).toBe(2);

    const state = useProjectStore.getState();
    const cables = state.project!.sheets[0].markups.filter(
      (m): m is CableMarkup => m.kind === "cable",
    );
    expect(cables.map((m) => m.endpointB)).toEqual(["SW-01", "PB-01"]);
    expect(state.cableRunBulkBranch).toBeNull();
    expect(state.history.past).toHaveLength(1);
    state.undo();
    expect(
      useProjectStore.getState().project!.sheets[0].markups.filter((m) => m.kind === "cable"),
    ).toHaveLength(0);
  });

  it("bulk-branches from a pull box route point with drop defaults", () => {
    const store = useProjectStore.getState();
    const pullBox = device({
      id: "pb-1",
      deviceId: "site-pullbox",
      category: "site",
      x: 30,
      y: 30,
      tag: "PB-01",
    });
    const camera = device({ id: "cam-1", x: 100, y: 60, tag: "CAM-01" });
    store.beginCableRunBulkBranch([endpointFromMarkup(pullBox)!]);
    expect(store.toggleCableRunBulkBranchTarget(endpointFromMarkup(camera)!)).toBe(1);

    const run = useProjectStore.getState().project!.sheets[0].markups.find(
      (m): m is CableMarkup => m.kind === "cable",
    )!;
    expect(run).toMatchObject({
      endpointA: "PB-01",
      endpointB: "CAM-01",
      routeStyle: "archedDrop",
      serviceLoopFt: DEFAULT_SERVICE_LOOP_FT,
    });
    expect(store.commitCableRunBulkBranch()).toBe(1);
    expect(useProjectStore.getState().cableRunBulkBranch).toBeNull();
  });

  it("places a multi-device drop from the current draft route point immediately", () => {
    const store = useProjectStore.getState();
    store.placeCableRunEndpoint({ x: 10, y: 20, label: "HE-01", deviceTag: "HE-01" });
    store.placeCableRunEndpoint({ x: 60, y: 20 });
    store.beginCableRunBulkBranch(undefined);
    expect(store.toggleCableRunBulkBranchTarget({
      x: 100,
      y: 50,
      label: "CAM-01",
      deviceTag: "CAM-01",
    })).toBe(1);

    expect(useProjectStore.getState().cableRunDraft?.points).toMatchObject([
      { x: 10, y: 20 },
      { x: 60, y: 20 },
    ]);
    expect(useProjectStore.getState().project?.sheets[0].markups[0]).toMatchObject({
      kind: "cable",
      points: [10, 20, 60, 20, 100, 50],
    });
    expect(store.commitCableRunBulkBranch()).toBe(1);
  });

  it("keeps the multi-device drop anchor fixed across repeated target clicks", () => {
    const store = useProjectStore.getState();
    const resetCableProject = () => {
      store.newProject({ projectName: "Cable Test" });
      store.addSheet(sheet());
      store.setActiveTool("cable");
      store.setActiveCable("cat6");
    };
    const cam1 = {
      x: 100,
      y: 50,
      label: "CAM-01",
      deviceTag: "CAM-01",
      deviceId: "cam-dome",
      category: "cameras" as const,
    };
    const cam2 = {
      x: 120,
      y: 80,
      label: "CAM-02",
      deviceTag: "CAM-02",
      deviceId: "cam-dome",
      category: "cameras" as const,
    };
    const scenarios = [
      {
        route: [
          endpointFromMarkup(
            device({
              id: "he-1",
              layer: "network",
              category: "network",
              deviceId: "net-headend",
              x: 10,
              y: 20,
              tag: "HE-01",
            }),
          )!,
        ],
        expectedStarts: [
          [10, 20],
          [10, 20],
        ],
      },
      {
        route: [
          endpointFromMarkup(
            device({
              id: "pb-1",
              deviceId: "site-pullbox",
              category: "site",
              x: 30,
              y: 30,
              tag: "PB-01",
            }),
          )!,
        ],
        expectedStarts: [
          [30, 30],
          [30, 30],
        ],
      },
      {
        route: [
          { x: 10, y: 20, label: "HE-01", deviceTag: "HE-01" },
          { x: 60, y: 20 },
        ],
        expectedStarts: [
          [10, 20, 60, 20],
          [10, 20, 60, 20],
        ],
      },
    ];

    for (const scenario of scenarios) {
      resetCableProject();
      store.beginCableRunBulkBranch(scenario.route);
      expect(store.toggleCableRunBulkBranchTarget(cam1)).toBe(1);
      expect(store.toggleCableRunBulkBranchTarget(cam2)).toBe(2);

      const state = useProjectStore.getState();
      const runs = state.project!.sheets[0].markups.filter(
        (m): m is CableMarkup => m.kind === "cable",
      );
      expect(runs.map((run) => run.points)).toEqual([
        [...scenario.expectedStarts[0], 100, 50],
        [...scenario.expectedStarts[1], 120, 80],
      ]);
      expect(runs[1].points.slice(0, 2)).not.toEqual([100, 50]);
      expect(state.cableRunBulkBranch?.route).toMatchObject(scenario.route);
      expect(state.cableRunBulkBranch?.anchor).toMatchObject(
        scenario.route[scenario.route.length - 1],
      );
      expect(store.commitCableRunBulkBranch()).toBe(2);
    }
  });

  it("records served devices on a main route as middle-route targets are clicked", () => {
    const store = useProjectStore.getState();
    const main = buildCableRunMarkup("main-route", "cat6", [
      { x: 10, y: 20, label: "HE-01", deviceTag: "HE-01" },
      { x: 90, y: 20, label: "PB-01", deviceTag: "PB-01" },
    ]);
    store.addMarkup(main);
    const anchor = nearestCableRunPoint(main, { x: 50, y: 20 })!;
    store.beginCableRunBulkBranch([anchor], "main-route");
    expect(
      store.toggleCableRunBulkBranchTarget({
        x: 80,
        y: 60,
        label: "CAM-01",
        deviceTag: "CAM-01",
      }),
    ).toBe(1);
    expect(
      store.toggleCableRunBulkBranchTarget({
        x: 90,
        y: 70,
        label: "CAM-02",
        deviceTag: "CAM-02",
      }),
    ).toBe(2);

    const updatedMain = useProjectStore.getState().project!.sheets[0].markups.find(
      (m): m is CableMarkup => m.kind === "cable" && m.id === "main-route",
    )!;
    expect(updatedMain.servedDevices).toEqual(["CAM-01", "CAM-02"]);
    expect(servedDevicesSummary(updatedMain)).toBe("CAM-01, CAM-02");
    expect(store.commitCableRunBulkBranch()).toBe(2);
  });

  it("keeps many pull-box camera drops attached across repeated moves", () => {
    const store = useProjectStore.getState();
    const calibration = {
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      realFeet: 1,
      pixelsPerFoot: 10,
    };
    store.updateSheet("sheet-1", { calibration });
    const pullBox = device({
      id: "pb-1",
      deviceId: "site-pullbox",
      category: "site",
      x: 40,
      y: 40,
      tag: "PB-01",
    });
    const cameras = Array.from({ length: 18 }, (_, i) =>
      device({
        id: `cam-${i + 1}`,
        x: 140 + (i % 6) * 18,
        y: 70 + Math.floor(i / 6) * 35,
        tag: `CAM-${String(i + 1).padStart(2, "0")}`,
      }),
    );

    store.addMarkup(pullBox);
    for (const camera of cameras) store.addMarkup(camera);
    const runs = cameras.map((camera, i) => {
      const run = {
        ...buildCableRunMarkup(`drop-${i + 1}`, "cat6", [
          endpointFromMarkup(pullBox)!,
          endpointFromMarkup(camera)!,
        ]),
        runCount: i + 1,
        physicalLabel: `CAT6-PB01-${String(i + 1).padStart(2, "0")}`,
        serviceLoopFt: DEFAULT_SERVICE_LOOP_FT + i,
        showLabel: i % 2 === 0,
      } satisfies CableMarkup;
      store.addMarkup(run);
      const connection = buildCableRunConnection(
        `conn-${i + 1}`,
        run.id,
        run.cableId,
        [endpointFromMarkup(pullBox)!, endpointFromMarkup(camera)!],
      );
      if (connection) store.addConnection(connection);
      return run;
    });
    const initialLength = cableLengthBreakdown(runs[0], calibration, 0)!.baseFt;

    for (const [x, y] of [
      [55, 52],
      [73, 68],
      [92, 88],
      [120, 96],
      [85, 115],
      [66, 76],
    ]) {
      store.moveDeviceMarkup("pb-1", x, y);
    }

    const project = useProjectStore.getState().project!;
    const movedRuns = project.sheets[0].markups.filter(
      (m): m is CableMarkup => m.kind === "cable" && m.id.startsWith("drop-"),
    );
    expect(movedRuns).toHaveLength(18);
    expect(project.connections ?? []).toHaveLength(0);
    for (const [i, run] of movedRuns.entries()) {
      expect(run.points.slice(0, 2)).toEqual([66, 76]);
      expect(run.pointAttachments?.[0]).toMatchObject({
        deviceMarkupId: "pb-1",
        deviceTag: "PB-01",
        deviceId: "site-pullbox",
        routeWaypoint: true,
      });
      expect(run.pointAttachments?.[1]).toMatchObject({
        deviceMarkupId: `cam-${i + 1}`,
        deviceTag: `CAM-${String(i + 1).padStart(2, "0")}`,
      });
      expect(run.runCount).toBe(i + 1);
      expect(run.physicalLabel).toBe(`CAT6-PB01-${String(i + 1).padStart(2, "0")}`);
      expect(run.serviceLoopFt).toBe(DEFAULT_SERVICE_LOOP_FT + i);
    }
    expect(cableLengthBreakdown(movedRuns[0], calibration, 0)!.baseFt).not.toBe(
      initialLength,
    );
  });

  it("moves a pull-box waypoint without stealing nearby owned drop endpoints", () => {
    const store = useProjectStore.getState();
    const headEnd = device({
      id: "he-1",
      layer: "network",
      category: "network",
      deviceId: "net-headend",
      x: 10,
      y: 10,
      tag: "HE-01",
    });
    const pullBox = device({
      id: "pb-1",
      deviceId: "site-pullbox",
      category: "site",
      x: 60,
      y: 20,
      tag: "PB-01",
    });
    const camera = device({ id: "cam-1", x: 120, y: 40, tag: "CAM-01" });
    const waypointRun = buildCableRunMarkup("waypoint-run", "cat6", [
      endpointFromMarkup(headEnd)!,
      endpointFromMarkup(pullBox)!,
      endpointFromMarkup(camera)!,
    ]);
    const dropRun = buildCableRunMarkup("drop-run", "cat6", [
      endpointFromMarkup(pullBox)!,
      endpointFromMarkup(camera)!,
    ]);
    store.addMarkup(headEnd);
    store.addMarkup(pullBox);
    store.addMarkup(camera);
    store.addMarkup(waypointRun);
    store.addMarkup(dropRun);

    store.moveDeviceMarkup("pb-1", 66, 20);
    store.moveDeviceMarkup("pb-1", 72, 22);

    const markups = useProjectStore.getState().project!.sheets[0].markups;
    const movedWaypoint = markups.find((m) => m.id === "waypoint-run") as CableMarkup;
    const movedDrop = markups.find((m) => m.id === "drop-run") as CableMarkup;
    const movedPullBox = markups.find((m) => m.id === "pb-1") as DeviceMarkup;
    expect(movedPullBox.attachedRunEndpoint).toBeUndefined();
    expect(movedWaypoint.points).toEqual([10, 10, 72, 22, 120, 40]);
    expect(movedWaypoint.pointAttachments?.[1]).toMatchObject({
      deviceMarkupId: "pb-1",
      routeWaypoint: true,
    });
    expect(movedDrop.points).toEqual([72, 22, 120, 40]);
    expect(movedDrop.pointAttachments?.[0]).toMatchObject({
      deviceMarkupId: "pb-1",
      routeWaypoint: true,
    });
  });

  it("does not silently detach a locked cable from a moved pull box", () => {
    const store = useProjectStore.getState();
    const pullBox = device({
      id: "pb-1",
      deviceId: "site-pullbox",
      category: "site",
      x: 40,
      y: 40,
      tag: "PB-01",
    });
    const camera = device({ id: "cam-1", x: 110, y: 40, tag: "CAM-01" });
    const lockedRun = {
      ...buildCableRunMarkup("locked-drop", "cat6", [
        endpointFromMarkup(pullBox)!,
        endpointFromMarkup(camera)!,
      ]),
      locked: true,
    } satisfies CableMarkup;
    store.addMarkup(pullBox);
    store.addMarkup(camera);
    store.addMarkup(lockedRun);

    store.moveDeviceMarkup("pb-1", 80, 80);

    const markups = useProjectStore.getState().project!.sheets[0].markups;
    expect(markups.find((m) => m.id === "pb-1")).toMatchObject({ x: 40, y: 40 });
    expect(markups.find((m) => m.id === "locked-drop")).toMatchObject({
      points: [40, 40, 110, 40],
    });
  });

  it("can append an existing conduit path into the active draft", () => {
    const store = useProjectStore.getState();

    store.placeCableRunEndpoint({
      x: 90,
      y: 60,
      label: "SW-01",
      deviceTag: "SW-01",
    });
    expect(store.appendCableRunPath([10, 20, 40, 20, 90, 60])).toBe("routed");

    expect(useProjectStore.getState().cableRunDraft?.points).toMatchObject([
      { x: 90, y: 60 },
      { x: 40, y: 20 },
      { x: 10, y: 20 },
    ]);
  });

  it("keeps raw-to-device routed runs as markup without logical connections", () => {
    const store = useProjectStore.getState();

    store.placeCableRunEndpoint({ x: 5, y: 5 });
    store.placeCableRunEndpoint({ x: 25, y: 5 });
    store.placeCableRunEndpoint({
      x: 25,
      y: 40,
      label: "AP-01",
      deviceTag: "AP-01",
    });

    const project = useProjectStore.getState().project;
    const cable = project?.sheets[0].markups[0];
    expect(cable).toMatchObject({
      kind: "cable",
      points: [5, 5, 25, 5, 25, 40],
      endpointB: "AP-01",
    });
    expect(project?.connections).toBeUndefined();
  });

  it("moves attached cable, conduit, and fiber endpoints with their devices", () => {
    const store = useProjectStore.getState();
    const calibration = {
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      realFeet: 1,
      pixelsPerFoot: 10,
    };
    store.updateSheet("sheet-1", { calibration });
    const headEnd = device({
      id: "he-1",
      layer: "network",
      category: "network",
      deviceId: "net-headend",
      x: 10,
      y: 10,
      tag: "HE-01",
    });
    const ap = device({
      id: "ap-1",
      layer: "network",
      category: "network",
      deviceId: "net-ap-i",
      x: 100,
      y: 10,
      tag: "AP-01",
    });
    const camera = device({
      id: "cam-1",
      x: 90,
      y: 70,
      tag: "CAM-01",
    });
    const pullBox = device({
      id: "pb-1",
      deviceId: "site-pullbox",
      category: "site",
      x: 100,
      y: 100,
      tag: "PB-01",
    });
    const apRun = buildCableRunMarkup("cat6-1", "cat6", [
      endpointFromMarkup(headEnd)!,
      { x: 50, y: 10 },
      endpointFromMarkup(ap)!,
    ]);
    const cameraRun = buildCableRunMarkup("fiber-1", "fiber-sm", [
      endpointFromMarkup(headEnd)!,
      endpointFromMarkup(camera)!,
    ]);
    const conduitRun = buildCableRunMarkup("conduit-1", "conduit", [
      endpointFromMarkup(headEnd)!,
      endpointFromMarkup(pullBox)!,
    ]);
    store.addMarkup(headEnd);
    store.addMarkup(ap);
    store.addMarkup(camera);
    store.addMarkup(pullBox);
    store.addMarkup(apRun);
    store.addMarkup(cameraRun);
    store.addMarkup(conduitRun);

    const initialLength = cableLengthBreakdown(apRun, calibration, 0)!.baseFt;
    store.moveDeviceMarkup("ap-1", 160, 40);
    store.moveDeviceMarkup("cam-1", 120, 90);
    store.moveDeviceMarkup("pb-1", 120, 120);
    store.moveDeviceMarkup("he-1", 20, 30);

    const markups = useProjectStore.getState().project!.sheets[0].markups;
    const movedApRun = markups.find((m) => m.id === "cat6-1") as CableMarkup;
    const movedCameraRun = markups.find((m) => m.id === "fiber-1") as CableMarkup;
    const movedConduitRun = markups.find((m) => m.id === "conduit-1") as CableMarkup;
    expect(movedApRun.points).toEqual([20, 30, 50, 10, 160, 40]);
    expect(movedCameraRun.points).toEqual([20, 30, 120, 90]);
    expect(movedConduitRun.points).toEqual([20, 30, 120, 120]);
    expect(movedApRun.pointAttachments?.[2]).toMatchObject({
      deviceMarkupId: "ap-1",
      deviceTag: "AP-01",
    });
    expect(cableLengthBreakdown(movedApRun, calibration, 0)!.baseFt).not.toBe(
      initialLength,
    );
  });

  it("re-anchors a container cable endpoint to an assigned nested device", () => {
    const store = useProjectStore.getState();
    const headEnd = device({
      id: "he-1",
      layer: "network",
      category: "network",
      deviceId: "net-headend",
      x: 10,
      y: 10,
      tag: "HE-01",
    });
    const bridge = device({
      id: "br-1",
      layer: "network",
      category: "network",
      deviceId: "net-wifi-bridge",
      x: 100,
      y: 10,
      tag: "BR-01",
    });
    const sw = device({
      id: "sw-1",
      layer: "network",
      category: "network",
      deviceId: "net-switch-poe",
      x: 24,
      y: 10,
      tag: "SW-01",
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
    store.addMarkup(headEnd);
    store.addMarkup(bridge);
    store.addMarkup(sw);
    store.addMarkup(run);
    store.addConnection(conn);

    store.updateConnection("link-1", {
      internalEndpoint: {
        containerId: "he-1",
        containerTag: "HE-01",
        deviceId: "sw-1",
        deviceTag: "SW-01",
      },
    });

    const assignedProject = useProjectStore.getState().project!;
    const assignedRun = assignedProject.sheets[0].markups.find(
      (m) => m.id === "run-1",
    ) as CableMarkup;
    const assignedConn = assignedProject.connections?.find((c) => c.id === "link-1");
    expect(assignedRun.points).toEqual([28, 10, 100, 10]);
    expect(assignedRun.pointAttachments?.[0]).toMatchObject({
      deviceMarkupId: "sw-1",
      deviceTag: "SW-01",
    });
    expect(assignedConn?.internalEndpoint).toMatchObject({
      containerId: "he-1",
      deviceId: "sw-1",
      portId: "port-1",
      port: "Port 1",
    });

    store.updateConnection("link-1", { internalEndpoint: undefined });

    const clearedRun = useProjectStore
      .getState()
      .project!.sheets[0].markups.find((m) => m.id === "run-1") as CableMarkup;
    expect(clearedRun.points).toEqual([10, 10, 100, 10]);
    expect(clearedRun.pointAttachments?.[0]).toMatchObject({
      deviceMarkupId: "he-1",
      deviceTag: "HE-01",
    });
  });

  it("auto-assigns container runs when a ported device is nested", () => {
    const store = useProjectStore.getState();
    const headEnd = device({
      id: "he-1",
      layer: "network",
      category: "network",
      deviceId: "net-headend",
      x: 10,
      y: 10,
      tag: "HE-01",
    });
    const bridge1 = device({
      id: "br-1",
      layer: "network",
      category: "network",
      deviceId: "net-wifi-bridge",
      x: 100,
      y: 10,
      tag: "BR-01",
    });
    const bridge2 = device({
      id: "br-2",
      layer: "network",
      category: "network",
      deviceId: "net-wifi-bridge",
      x: 100,
      y: 40,
      tag: "BR-02",
    });
    const sw = device({
      id: "sw-1",
      layer: "network",
      category: "network",
      deviceId: "net-switch-poe",
      x: 60,
      y: 60,
      tag: "SW-01",
    });
    const run1 = buildCableRunMarkup("run-1", "cat6", [
      endpointFromMarkup(headEnd)!,
      endpointFromMarkup(bridge1)!,
    ]);
    const run2 = buildCableRunMarkup("run-2", "cat6", [
      endpointFromMarkup(headEnd)!,
      endpointFromMarkup(bridge2)!,
    ]);
    store.addMarkup(headEnd);
    store.addMarkup(bridge1);
    store.addMarkup(bridge2);
    store.addMarkup(sw);
    store.addMarkup(run1);
    store.addMarkup(run2);
    store.addConnection({
      id: "link-1",
      fromTag: "HE-01",
      toTag: "BR-01",
      medium: "cat6",
      cableMarkupId: "run-1",
    });
    store.addConnection({
      id: "link-2",
      fromTag: "HE-01",
      toTag: "BR-02",
      medium: "cat6",
      cableMarkupId: "run-2",
    });

    store.moveDeviceMarkup("sw-1", 10, 10);

    const project = useProjectStore.getState().project!;
    const assigned = project.connections ?? [];
    expect(assigned.find((c) => c.id === "link-1")?.internalEndpoint).toMatchObject({
      deviceId: "sw-1",
      portId: "port-1",
    });
    expect(assigned.find((c) => c.id === "link-2")?.internalEndpoint).toMatchObject({
      deviceId: "sw-1",
      portId: "port-2",
    });
    const movedRun = project.sheets[0].markups.find((m) => m.id === "run-1") as CableMarkup;
    expect(movedRun.pointAttachments?.[0]).toMatchObject({ deviceMarkupId: "sw-1" });

    store.updateConnection("link-1", {
      internalEndpoint: {
        containerId: "he-1",
        containerTag: "HE-01",
        deviceId: "sw-1",
        deviceTag: "SW-01",
        portId: "port-5",
      },
    });
    store.autoAssignContainerInternalConnections("he-1");
    expect(
      useProjectStore
        .getState()
        .project!.connections?.find((c) => c.id === "link-1")?.internalEndpoint,
    ).toMatchObject({ portId: "port-5", port: "Port 5" });
  });

  it("moves intermediate pull-box waypoints while preserving manual turns", () => {
    const store = useProjectStore.getState();
    const headEnd = device({
      id: "he-1",
      layer: "network",
      category: "network",
      deviceId: "net-headend",
      x: 10,
      y: 20,
      tag: "HE-01",
    });
    const pullBox = device({
      id: "pb-1",
      deviceId: "site-pullbox",
      category: "site",
      x: 50,
      y: 20,
      tag: "PB-01",
    });
    const camera = device({
      id: "cam-1",
      x: 100,
      y: 60,
      tag: "CAM-01",
    });
    const run = buildCableRunMarkup("run-1", "cat6", [
      endpointFromMarkup(headEnd)!,
      { x: 30, y: 20 },
      endpointFromMarkup(pullBox)!,
      { x: 80, y: 20 },
      endpointFromMarkup(camera)!,
    ]);
    store.addMarkup(headEnd);
    store.addMarkup(pullBox);
    store.addMarkup(camera);
    store.addMarkup(run);

    store.moveDeviceMarkup("pb-1", 55, 35);

    const moved = useProjectStore
      .getState()
      .project!.sheets[0].markups.find((m) => m.id === "run-1") as CableMarkup;
    expect(moved.points).toEqual([10, 20, 30, 20, 55, 35, 80, 20, 100, 60]);
    expect(moved.pointAttachments?.[1]).toBeNull();
    expect(moved.pointAttachments?.[2]).toMatchObject({
      deviceMarkupId: "pb-1",
      routeWaypoint: true,
    });
    expect(moved.pointAttachments?.[3]).toBeNull();
  });

  it("keeps intermediate and fiber drop metadata during small repeated pull-box moves", () => {
    const store = useProjectStore.getState();
    const calibration = {
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      realFeet: 1,
      pixelsPerFoot: 10,
    };
    store.updateSheet("sheet-1", { calibration });
    const pullBox = device({
      id: "pb-1",
      deviceId: "site-pullbox",
      category: "site",
      layer: "site",
      x: 100,
      y: 100,
      tag: "PB-01",
    });
    const cameras = Array.from({ length: 18 }, (_, i) =>
      device({
        id: `cam-${i + 1}`,
        x: 180 + i * 8,
        y: 60 + (i % 6) * 22,
        tag: `CAM-${String(i + 1).padStart(2, "0")}`,
      }),
    );
    const runs = cameras.map((cameraMarkup, i) =>
      buildCableRunMarkup(
        `drop-${i + 1}`,
        i % 3 === 0 ? "fiber-sm" : "cat6",
        [
          endpointFromMarkup(pullBox)!,
          { x: 125 + i, y: 100 + (i % 4) * 5 },
          endpointFromMarkup(cameraMarkup)!,
        ],
        {
          runCount: i + 1,
          serviceLoopFt: 10 + i,
          fiberStrandCount: i % 3 === 0 ? 24 + i : undefined,
          physicalLabel: `DROP-${String(i + 1).padStart(2, "0")}`,
        },
      ),
    );
    store.addMarkup(pullBox);
    cameras.forEach((cameraMarkup) => store.addMarkup(cameraMarkup));
    runs.forEach((run) => store.addMarkup(run));

    const initialLengths = new Map(
      runs.map((run) => [run.id, cableLengthBreakdown(run, calibration, 0)!.baseFt]),
    );
    for (const [x, y] of [
      [106, 106],
      [112, 112],
      [118, 118],
    ]) {
      store.moveDeviceMarkup("pb-1", x, y);
    }

    const markups = useProjectStore.getState().project!.sheets[0].markups;
    for (const original of runs) {
      const moved = markups.find((m) => m.id === original.id) as CableMarkup;
      expect(moved.points.slice(0, 2)).toEqual([118, 118]);
      expect(moved.points.slice(2)).toEqual(original.points.slice(2));
      expect(moved.pointAttachments?.[0]).toMatchObject({
        deviceMarkupId: "pb-1",
        deviceTag: "PB-01",
        deviceId: "site-pullbox",
        routeWaypoint: true,
      });
      expect(moved.pointAttachments?.[1]).toBeNull();
      expect(moved.pointAttachments?.[2]).toEqual(original.pointAttachments?.[2]);
      expect(moved.runCount).toBe(original.runCount);
      expect(moved.serviceLoopFt).toBe(original.serviceLoopFt);
      expect(moved.fiberStrandCount).toBe(original.fiberStrandCount);
      expect(moved.physicalLabel).toBe(original.physicalLabel);
      expect(cableLengthBreakdown(moved, calibration, 0)!.baseFt).not.toBe(
        initialLengths.get(original.id),
      );
    }
  });

  it("moves nested device cable endpoints when a container moves", () => {
    const store = useProjectStore.getState();
    const headEnd = device({
      id: "he-1",
      layer: "network",
      category: "network",
      deviceId: "net-headend",
      x: 100,
      y: 100,
      tag: "HE-01",
    });
    const switchMarkup = device({
      id: "sw-1",
      layer: "network",
      category: "network",
      deviceId: "net-switch-poe",
      x: 130,
      y: 100,
      tag: "SW-01",
      parentId: "he-1",
    });
    const camera = device({
      id: "cam-1",
      x: 200,
      y: 100,
      tag: "CAM-01",
    });
    const initialMarkups = [headEnd, switchMarkup, camera];
    const run = buildCableRunMarkup("nested-run", "cat6", [
      endpointFromMarkup(switchMarkup, { markups: initialMarkups })!,
      endpointFromMarkup(camera, { markups: initialMarkups })!,
    ]);
    store.addMarkup(headEnd);
    store.addMarkup(switchMarkup);
    store.addMarkup(camera);
    store.addMarkup(run);

    store.moveDeviceMarkup("he-1", 140, 150);

    const movedRun = useProjectStore
      .getState()
      .project!.sheets[0].markups.find((m) => m.id === "nested-run") as CableMarkup;
    const movedHeadEnd = useProjectStore
      .getState()
      .project!.sheets[0].markups.find((m) => m.id === "he-1") as DeviceMarkup;
    const movedSwitch = useProjectStore
      .getState()
      .project!.sheets[0].markups.find((m) => m.id === "sw-1") as DeviceMarkup;
    const movedSlot = nestedSlotPoint(
      useProjectStore.getState().project!.sheets[0].markups,
      movedHeadEnd,
      movedSwitch,
    );
    expect(movedRun.points).toEqual([movedSlot.x, movedSlot.y, 200, 100]);
  });

  it("snaps route infrastructure to a nearby run endpoint and can disconnect it", () => {
    const store = useProjectStore.getState();
    const cable: CableMarkup = {
      id: "conduit-1",
      kind: "cable",
      layer: "cable",
      cableId: "conduit",
      points: [10, 20, 80, 20],
    };
    const pullBox = device({
      id: "pb-1",
      deviceId: "site-pullbox",
      category: "site",
      tag: "PB-01",
      x: 75,
      y: 24,
    });

    store.addMarkup(cable);
    store.addMarkup(pullBox);
    store.moveDeviceMarkup("pb-1", 78, 22);

    let project = useProjectStore.getState().project;
    expect(project?.sheets[0].markups.find((m) => m.id === "pb-1")).toMatchObject({
      x: 80,
      y: 20,
      attachedRunEndpoint: { cableMarkupId: "conduit-1", endpoint: "B" },
    });
    expect(project?.sheets[0].markups.find((m) => m.id === "conduit-1")).toMatchObject({
      endpointB: "PB-01",
    });

    store.disconnectRouteInfrastructure("pb-1");
    project = useProjectStore.getState().project;
    expect(
      project?.sheets[0].markups.find((m) => m.id === "pb-1" && m.kind === "device")
        ?.attachedRunEndpoint,
    ).toBeUndefined();
    expect(
      project?.sheets[0].markups.find((m) => m.id === "conduit-1" && m.kind === "cable")
        ?.endpointB,
    ).toBeUndefined();
  });

  it("summarizes pull-box pass-through and termination roles", () => {
    const pb = device({
      id: "pb-1",
      deviceId: "site-pullbox",
      category: "site",
      tag: "PB-01",
      x: 40,
      y: 20,
    });
    const sh = sheet();
    sh.markups = [
      pb,
      {
        id: "backbone",
        kind: "cable",
        layer: "cable",
        cableId: "conduit",
        points: [10, 20, 40, 20, 90, 20],
      },
      {
        id: "drop",
        kind: "cable",
        layer: "cable",
        cableId: "cat6",
        points: [40, 20, 70, 50],
        endpointA: "PB-01",
        endpointB: "CAM-01",
      },
    ];

    expect(routeSummariesForDevice(sh, pb).map((s) => [s.cable.id, s.role])).toEqual([
      ["backbone", "Pass-through"],
      ["drop", "Termination"],
    ]);
  });

  it("estimates carried cables for first-pass conduit fill", () => {
    const conduit: CableMarkup = {
      id: "conduit-1",
      kind: "cable",
      layer: "cable",
      cableId: "conduit",
      conduitSize: '1"',
      points: [0, 0, 50, 0, 100, 0],
    };
    const cable: CableMarkup = {
      id: "cat6-1",
      kind: "cable",
      layer: "cable",
      cableId: "cat6",
      runCount: 2,
      points: [0, 0, 50, 0, 70, 20],
    };
    const sh = sheet();
    sh.markups = [conduit, cable];

    const summaries = conduitCarrySummaries(sh);
    expect(summaries[0].carriedCables.map((c) => c.id)).toEqual(["cat6-1"]);
    expect(approximateConduitFill(conduit, [cable])).toMatchObject({
      cableCount: 2,
      knownCableCount: 2,
    });
    expect(approximateConduitFill(conduit, [cable])?.fillPercent).toBeGreaterThan(0);
  });
});
