// @vitest-environment node
import { describe, expect, it } from "vitest";
import { sortMarkupsForRender } from "../src/lib/markupOrdering";
import {
  DEFAULT_LAYERS,
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

  it("persists layer reordering onto the active project", () => {
    useProjectStore.getState().newProject({ projectName: "Layer Order Test" });
    useProjectStore.getState().moveLayer("cable", "up");

    const state = useProjectStore.getState();
    expect(state.project?.layers?.map((l) => l.id)).toEqual(
      state.layers.map((l) => l.id),
    );
  });

  it("defaults cable run labels off until the user enables them", () => {
    useProjectStore.getState().newProject({ projectName: "Run Label Test" });

    expect(useProjectStore.getState().runLabelsVisible).toBe(false);
    expect(useProjectStore.getState().project?.runLabelsVisible).toBeUndefined();

    useProjectStore.getState().toggleRunLabelsVisible();

    expect(useProjectStore.getState().runLabelsVisible).toBe(true);
    expect(useProjectStore.getState().project?.runLabelsVisible).toBe(true);
  });
});
