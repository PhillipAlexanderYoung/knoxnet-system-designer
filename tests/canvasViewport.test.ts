// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  MAX_CANVAS_PAN,
  MAX_CANVAS_SCALE,
  MIN_CANVAS_SCALE,
  normalizeCanvasViewport,
  panCanvasViewport,
  zoomCanvasViewportAt,
  type CanvasViewport,
} from "../src/lib/canvasViewport";

describe("canvas viewport helpers", () => {
  it("normalizes invalid viewport values to safe defaults", () => {
    expect(
      normalizeCanvasViewport({
        scale: Number.NaN,
        x: Number.POSITIVE_INFINITY,
        y: Number.NEGATIVE_INFINITY,
      }),
    ).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("clamps extreme zoom and pan values", () => {
    expect(normalizeCanvasViewport({ scale: 999, x: 9_000_000, y: -9_000_000 })).toEqual({
      scale: MAX_CANVAS_SCALE,
      x: MAX_CANVAS_PAN,
      y: -MAX_CANVAS_PAN,
    });

    expect(normalizeCanvasViewport({ scale: 0.0001, x: 0, y: 0 }).scale).toBe(
      MIN_CANVAS_SCALE,
    );
  });

  it("zooms around the gesture center", () => {
    const viewport: CanvasViewport = { scale: 2, x: 10, y: 20 };
    const next = zoomCanvasViewportAt(viewport, { x: 110, y: 220 }, 4);

    expect(next.scale).toBe(4);
    expect((110 - next.x) / next.scale).toBeCloseTo((110 - viewport.x) / viewport.scale);
    expect((220 - next.y) / next.scale).toBeCloseTo((220 - viewport.y) / viewport.scale);
  });

  it("pans without changing scale", () => {
    const next = panCanvasViewport({ scale: 1.5, x: 10, y: 20 }, { x: -4, y: 8 });

    expect(next).toMatchObject({ scale: 1.5, x: 6, y: 28 });
  });
});
