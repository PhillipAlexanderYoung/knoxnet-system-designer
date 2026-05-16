// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  normalizeRotationDeg,
  resolveCoverage,
  rotationDegFromPoint,
} from "../src/lib/coverage";
import type { DeviceMarkup } from "../src/store/projectStore";

describe("coverage aim geometry", () => {
  it("normalizes rotations into the stored 0-359deg range", () => {
    expect(normalizeRotationDeg(0)).toBe(0);
    expect(normalizeRotationDeg(360)).toBe(0);
    expect(normalizeRotationDeg(-90)).toBe(270);
    expect(normalizeRotationDeg(725)).toBe(5);
  });

  it("maps drag points to camera aim rotation", () => {
    const center = { x: 10, y: 10 };

    expect(rotationDegFromPoint(center, { x: 10, y: 0 })).toBe(0);
    expect(rotationDegFromPoint(center, { x: 20, y: 10 })).toBe(90);
    expect(rotationDegFromPoint(center, { x: 10, y: 20 })).toBe(180);
    expect(rotationDegFromPoint(center, { x: 0, y: 10 })).toBe(270);
  });
});

describe("coverage display defaults", () => {
  const cameraMarkup: DeviceMarkup = {
    id: "cam-1",
    kind: "device",
    deviceId: "cam-dome",
    category: "cameras",
    layer: "cameras",
    x: 10,
    y: 10,
    tag: "CAM-01",
  };

  it("keeps camera coverage enabled while hiding the FOV/range tip label by default", () => {
    const coverage = resolveCoverage(cameraMarkup);

    expect(coverage?.isCamera).toBe(true);
    expect(coverage?.enabled).toBe(true);
    expect(coverage?.showLabel).toBe(false);
  });

  it("allows camera FOV/range tip labels to be opted in per device", () => {
    const coverage = resolveCoverage({
      ...cameraMarkup,
      coverage: { showLabel: true },
    });

    expect(coverage?.showLabel).toBe(true);
  });
});
