// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  normalizeRotation,
  rotationCompensationMatrix,
} from "../src/export/exportMarkupPdf";

/** Apply a pdf-lib `[a b c d e f]` matrix to a point. */
function apply(
  m: [number, number, number, number, number, number],
  x: number,
  y: number,
) {
  const [a, b, c, d, e, f] = m;
  return { x: a * x + c * y + e, y: b * x + d * y + f };
}

/**
 * Independent reference implementation of "rotate the physical page
 * clockwise by `deg` about its center, then re-anchor to the new
 * bounding box" — used to cross-check `rotationCompensationMatrix`
 * without reusing its own formula.
 */
function referenceRotate(deg: number, w: number, h: number, x: number, y: number) {
  const rad = (-deg * Math.PI) / 180; // clockwise physical rotation
  const cx = w / 2;
  const cy = h / 2;
  const px = x - cx;
  const py = y - cy;
  const rx = Math.cos(rad) * px - Math.sin(rad) * py;
  const ry = Math.sin(rad) * px + Math.cos(rad) * py;
  const rotated = deg === 90 || deg === 270;
  const newW = rotated ? h : w;
  const newH = rotated ? w : h;
  return { x: rx + newW / 2, y: ry + newH / 2 };
}

describe("normalizeRotation", () => {
  it("passes through canonical PDF /Rotate values", () => {
    expect(normalizeRotation(0)).toBe(0);
    expect(normalizeRotation(90)).toBe(90);
    expect(normalizeRotation(180)).toBe(180);
    expect(normalizeRotation(270)).toBe(270);
  });

  it("normalizes negative and out-of-range multiples of 90", () => {
    expect(normalizeRotation(-90)).toBe(270);
    expect(normalizeRotation(-270)).toBe(90);
    expect(normalizeRotation(360)).toBe(0);
    expect(normalizeRotation(450)).toBe(90);
  });
});

describe("rotationCompensationMatrix", () => {
  const w = 1728; // raw MediaBox width (portrait) — mirrors the reported bug
  const h = 2592; // raw MediaBox height

  it("is the identity for an unrotated page", () => {
    expect(rotationCompensationMatrix(0, w, h)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  const corners = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: 0, y: h },
    { x: w, y: h },
  ];

  for (const rotation of [90, 180, 270] as const) {
    it(`maps every corner to the reference rotation for ${rotation}°`, () => {
      const m = rotationCompensationMatrix(rotation, w, h);
      for (const corner of corners) {
        const actual = apply(m, corner.x, corner.y);
        const expected = referenceRotate(rotation, w, h, corner.x, corner.y);
        expect(actual.x).toBeCloseTo(expected.x, 6);
        expect(actual.y).toBeCloseTo(expected.y, 6);
      }
    });
  }

  it("maps the raw page's bounding box exactly onto the swapped visual page for 90/270 (the reported landscape-sheet case)", () => {
    for (const rotation of [90, 270] as const) {
      const m = rotationCompensationMatrix(rotation, w, h);
      const mapped = corners.map((c) => apply(m, c.x, c.y));
      const xs = mapped.map((p) => p.x);
      const ys = mapped.map((p) => p.y);
      // New visual space should be exactly h wide by w tall (swapped),
      // matching sheet.pageWidth/pageHeight from pdf.js's rotation-aware
      // viewport — with no point outside [0, h] x [0, w].
      expect(Math.min(...xs)).toBeCloseTo(0, 6);
      expect(Math.max(...xs)).toBeCloseTo(h, 6);
      expect(Math.min(...ys)).toBeCloseTo(0, 6);
      expect(Math.max(...ys)).toBeCloseTo(w, 6);
    }
  });

  it("keeps the bounding box unchanged (w x h) for a 180° flip", () => {
    const m = rotationCompensationMatrix(180, w, h);
    const mapped = corners.map((c) => apply(m, c.x, c.y));
    const xs = mapped.map((p) => p.x);
    const ys = mapped.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0, 6);
    expect(Math.max(...xs)).toBeCloseTo(w, 6);
    expect(Math.min(...ys)).toBeCloseTo(0, 6);
    expect(Math.max(...ys)).toBeCloseTo(h, 6);
  });
});
