// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  DEVICE_HOVER_ACTION_SIZE,
  deviceHoverActionBridge,
  deviceHoverActionPosition,
} from "../src/lib/deviceHoverActions";

describe("deviceHoverActions", () => {
  it("tucks the gear into the north-east rim of the device", () => {
    const pos = deviceHoverActionPosition(100, 200, 14);
    expect(pos.x).toBeCloseTo(100 + 14 - DEVICE_HOVER_ACTION_SIZE * 0.7);
    expect(pos.y).toBeCloseTo(200 - 14 - DEVICE_HOVER_ACTION_SIZE * 0.3);
    // Overlaps the disc rather than floating outside it.
    expect(pos.x).toBeLessThan(100 + 14);
    expect(pos.y + DEVICE_HOVER_ACTION_SIZE).toBeGreaterThan(200 - 14);
  });

  it("keeps the gear tiny", () => {
    expect(DEVICE_HOVER_ACTION_SIZE).toBeLessThanOrEqual(8);
  });

  it("bridges back toward the device from the chip", () => {
    const bridge = deviceHoverActionBridge();
    expect(bridge.x).toBeLessThan(0);
    expect(bridge.y + bridge.height).toBeGreaterThan(DEVICE_HOVER_ACTION_SIZE * 0.8);
    expect(bridge.width).toBeGreaterThan(DEVICE_HOVER_ACTION_SIZE);
  });
});
