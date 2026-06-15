// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  flowHintTarget,
  flowHintTargets,
  isFlowHintActive,
  reduceFlowHint,
  sheetNeedsCalibration,
  type FlowHintStep,
} from "../src/lib/flowHints";
import type { Sheet } from "../src/store/projectStore";

function sheet(overrides: Partial<Sheet> = {}): Sheet {
  return {
    id: "s1",
    name: "Floor 1",
    fileName: "floor.png",
    pageWidth: 1000,
    pageHeight: 800,
    renderScale: 1,
    markups: [],
    source: { kind: "raster", bytes: new Uint8Array(), mime: "image/png" },
    ...overrides,
  };
}

describe("flowHints", () => {
  it("flags raster and dxf sheets without calibration", () => {
    expect(sheetNeedsCalibration(sheet())).toBe(true);
    expect(
      sheetNeedsCalibration(
        sheet({ source: { kind: "dxf", text: "0\nEOF" } }),
      ),
    ).toBe(true);
    expect(
      sheetNeedsCalibration(
        sheet({
          source: { kind: "pdf", bytes: new Uint8Array() },
          calibration: {
            p1: { x: 0, y: 0 },
            p2: { x: 10, y: 0 },
            realFeet: 1,
            pixelsPerFoot: 10,
          },
        }),
      ),
    ).toBe(false);
    expect(
      sheetNeedsCalibration(
        sheet({ source: { kind: "pdf", bytes: new Uint8Array() } }),
      ),
    ).toBe(false);
  });

  it("walks import → scale → device → library → place → cable", () => {
    let step: FlowHintStep | null = null;
    let enabled = true;

    const advance = (event: Parameters<typeof reduceFlowHint>[2]) => {
      const next = reduceFlowHint(enabled, step, event);
      step = next.step;
      enabled = next.enabled;
      return next;
    };

    advance({ type: "sheet_added", needsCalibration: true });
    expect(step).toBe("scale");
    expect(flowHintTarget(step)).toBe("tool-calibrate");

    advance({ type: "calibration_set", stillNeedsCalibration: false });
    expect(step).toBe("device");

    advance({ type: "tool_selected", tool: "device" });
    expect(step).toBe("library");
    expect(flowHintTargets(step, { paletteOpen: true })).toEqual(["library"]);
    expect(flowHintTargets(step, { paletteOpen: false })).toEqual([
      "tool-device",
      "library",
    ]);

    advance({ type: "device_selected" });
    expect(step).toBe("place");
    expect(isFlowHintActive(step, "canvas")).toBe(true);

    advance({ type: "device_placed" });
    expect(step).toBe("cable");

    const done = advance({ type: "tool_selected", tool: "cable" });
    expect(step).toBe("done");
    expect(done.markGlobalDone).toBe(true);
    expect(enabled).toBe(false);
  });

  it("skips scale when imported sheet is already scaled", () => {
    const next = reduceFlowHint(true, null, {
      type: "sheet_added",
      needsCalibration: false,
    });
    expect(next.step).toBe("device");
  });

  it("stays on scale until every sheet is calibrated", () => {
    const next = reduceFlowHint(true, "scale", {
      type: "calibration_set",
      stillNeedsCalibration: true,
    });
    expect(next.step).toBe("scale");
  });

  it("jumps to place when a device is picked from the library early", () => {
    const next = reduceFlowHint(true, "device", { type: "device_selected" });
    expect(next.step).toBe("place");
  });

  it("does nothing when hints are disabled", () => {
    const next = reduceFlowHint(false, null, {
      type: "sheet_added",
      needsCalibration: true,
    });
    expect(next.step).toBe("done");
    expect(next.enabled).toBe(false);
  });
});
