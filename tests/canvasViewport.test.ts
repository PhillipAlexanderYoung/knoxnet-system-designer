// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  MAX_CANVAS_PAN,
  MAX_CANVAS_SCALE,
  MIN_CANVAS_SCALE,
  normalizeCanvasViewport,
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
});
