// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  partitionValidationHighlightOverlay,
  sortDeviceTagsForRender,
  sortMarkupsForRender,
} from "../src/lib/markupOrdering";
import {
  DEFAULT_LAYERS,
  effectiveMarkupLayerId,
  isMarkupLayerVisible,
  normalizeLayers,
  useProjectStore,
  type CableMarkup,
  type DeviceMarkup,
  type Layer,
} from "../src/store/projectStore";

const cable = (overrides: Partial<CableMarkup> = {}): CableMarkup => ({
  id: "cable-1",
  kind: "cable",
  layer: "cable",
  cableId: "cat6",
  points: [0, 0, 100, 100],
  ...overrides,
});

const device = (overrides: Partial<DeviceMarkup> = {}): DeviceMarkup => ({
  id: "device-1",
  kind: "device",
  layer: "network",
  deviceId: "net-switch-poe",
  category: "network",
  x: 50,
  y: 50,
  tag: "SW-01",
  ...overrides,
});

describe("markup render ordering", () => {
  it("draws cable runs before default device layers", () => {
    const ordered = sortMarkupsForRender([
      device({ id: "pull-box", layer: "site" }),
      cable({ id: "run" }),
      device({ id: "camera", layer: "cameras" }),
    ]);

    expect(ordered.map((m) => m.id)).toEqual(["run", "pull-box", "camera"]);
  });

  it("keeps conduit runs on their own effective layer", () => {
    const conduit = cable({ id: "conduit-run", cableId: "conduit", layer: "cable" });
    const copper = cable({ id: "copper-run", cableId: "cat6", layer: "conduit" });

    expect(effectiveMarkupLayerId(conduit)).toBe("conduit");
    expect(effectiveMarkupLayerId(copper)).toBe("cable");
  });

  it("draws conduit below cable and fiber runs by default", () => {
    const ordered = sortMarkupsForRender([
      device({ id: "camera", layer: "cameras" }),
      cable({ id: "copper-run", cableId: "cat6" }),
      cable({ id: "conduit-run", cableId: "conduit", layer: "cable" }),
      cable({ id: "fiber-run", cableId: "fiber-sm" }),
    ]);

    expect(ordered.map((m) => m.id)).toEqual([
      "conduit-run",
      "copper-run",
      "fiber-run",
      "camera",
    ]);
  });

  it("applies cable and conduit layer visibility independently", () => {
    const layers: Layer[] = normalizeLayers(DEFAULT_LAYERS).map((layer) =>
      layer.id === "cable" ? { ...layer, visible: false } : layer,
    );
    const copper = cable({ id: "copper-run", cableId: "cat6" });
    const conduit = cable({ id: "conduit-run", cableId: "conduit", layer: "cable" });

    expect(isMarkupLayerVisible(copper, layers)).toBe(false);
    expect(isMarkupLayerVisible(conduit, layers)).toBe(true);

    const conduitHidden = layers.map((layer) =>
      layer.id === "conduit" ? { ...layer, visible: false } : layer,
    );
    expect(isMarkupLayerVisible(copper, conduitHidden)).toBe(false);
    expect(isMarkupLayerVisible(conduit, conduitHidden)).toBe(false);
  });

  it("lets custom layer order move cable runs above device layers", () => {
    const layers: Layer[] = normalizeLayers(DEFAULT_LAYERS);
    const cableIndex = layers.findIndex((l) => l.id === "cable");
    const [cableLayer] = layers.splice(cableIndex, 1);
    layers.unshift(cableLayer);

    const ordered = sortMarkupsForRender([
      device({ id: "camera", layer: "cameras" }),
      cable({ id: "run" }),
    ], layers);

    expect(ordered.map((m) => m.id)).toEqual(["camera", "run"]);
  });

  it("keeps devices above cables inside the same layer", () => {
    const ordered = sortMarkupsForRender([
      device({ id: "pull-box", layer: "cable" }),
      cable({ id: "run", layer: "cable" }),
    ]);

    expect(ordered.map((m) => m.id)).toEqual(["run", "pull-box"]);
  });

  it("exposes device tags as a final overlay in render order", () => {
    const ordered = sortDeviceTagsForRender([
      cable({ id: "run" }),
      device({ id: "switch", layer: "network" }),
      device({ id: "camera", layer: "cameras" }),
    ]);

    expect(ordered.map((m) => m.id)).toEqual(["switch", "camera"]);
  });

  it("lifts validation-highlighted cable runs into a transient overlay", () => {
    const ordered = sortMarkupsForRender([
      device({ id: "switch", layer: "network" }),
      cable({ id: "dead-run" }),
      cable({ id: "normal-run" }),
    ]);

    const partitioned = partitionValidationHighlightOverlay(
      ordered,
      new Set(["dead-run"]),
    );

    expect(partitioned.baseMarkups.map((m) => m.id)).toEqual(["normal-run", "switch"]);
    expect(partitioned.overlayMarkups.map((m) => m.id)).toEqual(["dead-run"]);
  });

  it("keeps tag overlay order aligned with explicit layer reordering", () => {
    const layers: Layer[] = normalizeLayers(DEFAULT_LAYERS);
    const cameraIndex = layers.findIndex((l) => l.id === "cameras");
    const [cameraLayer] = layers.splice(cameraIndex, 1);
    layers.push(cameraLayer);

    const ordered = sortDeviceTagsForRender([
      device({ id: "camera", layer: "cameras" }),
      device({ id: "switch", layer: "network" }),
      cable({ id: "run" }),
    ], layers);

    expect(ordered.map((m) => m.id)).toEqual(["camera", "switch"]);
  });

  it("persists layer reordering onto the active project", () => {
    useProjectStore.getState().newProject({ projectName: "Layer Order Test" });
    useProjectStore.getState().moveLayer("cable", "up");

    const state = useProjectStore.getState();
    expect(state.project?.layers?.map((l) => l.id)).toEqual(
      state.layers.map((l) => l.id),
    );
  });

  it("restores hidden runs when their run layer is shown", () => {
    const store = useProjectStore.getState();
    store.newProject({ projectName: "Hidden Run Restore Test" });
    store.addSheet({
      id: "sheet-1",
      name: "Sheet 1",
      fileName: "sheet.pdf",
      pageWidth: 100,
      pageHeight: 100,
      renderScale: 1,
      markups: [
        cable({ id: "hidden-cable", cableId: "cat6", hidden: true }),
        cable({ id: "hidden-conduit", cableId: "conduit", layer: "cable", hidden: true }),
      ],
    });

    store.toggleLayer("cable");
    store.toggleLayer("cable");

    const afterCableShow = useProjectStore.getState().project!.sheets[0].markups;
    expect(afterCableShow.find((m) => m.id === "hidden-cable")?.hidden).toBe(false);
    expect(afterCableShow.find((m) => m.id === "hidden-conduit")?.hidden).toBe(true);

    useProjectStore.getState().toggleLayer("conduit");
    useProjectStore.getState().toggleLayer("conduit");

    const afterConduitShow = useProjectStore.getState().project!.sheets[0].markups;
    expect(afterConduitShow.find((m) => m.id === "hidden-conduit")?.hidden).toBe(false);
  });

  it("defaults cable run labels off until the user enables them", () => {
    useProjectStore.getState().newProject({ projectName: "Run Label Test" });

    expect(useProjectStore.getState().runLabelsVisible).toBe(false);
    expect(useProjectStore.getState().project?.runLabelsVisible).toBe(false);

    useProjectStore.getState().toggleRunLabelsVisible();

    expect(useProjectStore.getState().runLabelsVisible).toBe(true);
    expect(useProjectStore.getState().project?.runLabelsVisible).toBe(true);
  });
});
