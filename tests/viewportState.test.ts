// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CANVAS_VIEWPORT,
  MAX_CANVAS_PAN,
  MAX_CANVAS_SCALE,
  MIN_CANVAS_SCALE,
  loadCanvasViewport,
  normalizeCanvasViewport,
  saveCanvasViewport,
} from "../src/lib/canvasViewport";
import { useProjectStore, type Project, type Sheet } from "../src/store/projectStore";

function installLocalStorage() {
  const data = new Map<string, string>();
  const localStorage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      data.delete(key);
    }),
    clear: vi.fn(() => data.clear()),
    key: vi.fn((index: number) => Array.from(data.keys())[index] ?? null),
    get length() {
      return data.size;
    },
  };
  vi.stubGlobal("window", { localStorage });
  return localStorage;
}

const sheet = (id: string): Sheet => ({
  id,
  name: id,
  fileName: `${id}.pdf`,
  pageWidth: 800,
  pageHeight: 600,
  renderScale: 1,
  markups: [],
});

const project = (): Project => ({
  id: "project-1",
  meta: {
    projectName: "Viewport Test",
    projectNumber: "",
    client: "",
    location: "",
    drawnBy: "",
    date: new Date(0).toISOString(),
    revision: "0",
  },
  sheets: [sheet("sheet-1"), sheet("sheet-2")],
  racks: [],
  bidDefaults: { slackPercent: 10 } as never,
  createdAt: 0,
  updatedAt: 0,
});

describe("canvas viewport state", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    useProjectStore.setState({
      project: null,
      activeSheetId: null,
      viewport: DEFAULT_CANVAS_VIEWPORT,
      sheetViewports: {},
    });
  });

  it("normalizes invalid and extreme viewport values", () => {
    expect(
      normalizeCanvasViewport({
        scale: Number.POSITIVE_INFINITY,
        x: Number.NaN,
        y: MAX_CANVAS_PAN * 2,
      }),
    ).toEqual({
      scale: DEFAULT_CANVAS_VIEWPORT.scale,
      x: DEFAULT_CANVAS_VIEWPORT.x,
      y: MAX_CANVAS_PAN,
    });

    expect(normalizeCanvasViewport({ scale: 0.001, x: 0, y: 0 }).scale).toBe(
      MIN_CANVAS_SCALE,
    );
    expect(normalizeCanvasViewport({ scale: 200, x: 0, y: 0 }).scale).toBe(
      MAX_CANVAS_SCALE,
    );
  });

  it("saves and loads viewports per project and sheet", () => {
    saveCanvasViewport("project-1", "sheet-1", { scale: 2.5, x: 120, y: -80 });
    saveCanvasViewport("project-1", "sheet-2", { scale: 1.25, x: 10, y: 20 });

    expect(loadCanvasViewport("project-1", "sheet-1")).toEqual({
      scale: 2.5,
      x: 120,
      y: -80,
    });
    expect(loadCanvasViewport("project-1", "sheet-2")).toEqual({
      scale: 1.25,
      x: 10,
      y: 20,
    });
  });

  it("restores saved viewport on project load and remembers sheet-specific views", () => {
    saveCanvasViewport("project-1", "sheet-1", { scale: 2, x: 100, y: 200 });

    const store = useProjectStore.getState();
    store.loadProject(project());

    expect(useProjectStore.getState().viewport).toEqual({ scale: 2, x: 100, y: 200 });

    useProjectStore.getState().setViewport({ scale: 3, x: 10, y: 20 });
    useProjectStore.getState().setActiveSheet("sheet-2");
    expect(useProjectStore.getState().viewport).toEqual(DEFAULT_CANVAS_VIEWPORT);

    useProjectStore.getState().setViewport({ scale: 4, x: 40, y: 50 });
    useProjectStore.getState().setActiveSheet("sheet-1");
    expect(useProjectStore.getState().viewport).toEqual({ scale: 3, x: 10, y: 20 });

    useProjectStore.getState().setActiveSheet("sheet-2");
    expect(useProjectStore.getState().viewport).toEqual({ scale: 4, x: 40, y: 50 });
  });
});
