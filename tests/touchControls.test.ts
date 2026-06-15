// @vitest-environment node
import { describe, expect, it } from "vitest";
import { scaleForTouch, TOUCH_CONTROL_SCALE } from "../src/lib/touchControls";

describe("touchControls", () => {
  it("leaves desktop sizes unchanged", () => {
    expect(scaleForTouch(8, 1)).toBe(8);
  });

  it("doubles hit targets on coarse pointers", () => {
    expect(scaleForTouch(8, TOUCH_CONTROL_SCALE)).toBe(16);
    expect(scaleForTouch(7, TOUCH_CONTROL_SCALE)).toBe(14);
  });
});
