// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  clampTagFontSize,
  clampTagOffset,
  DEFAULT_TAG_FILL,
  DEFAULT_TAG_TEXT,
  maxTagOffsetDistance,
  resolveTagFontSize,
  resolveTagStyle,
} from "../src/lib/tagDefaults";
import type { DeviceMarkup, Project } from "../src/store/projectStore";

function dev(overrides: Partial<DeviceMarkup> = {}): DeviceMarkup {
  return {
    id: "m1",
    kind: "device",
    deviceId: "cam-dome",
    category: "cameras",
    layer: "cameras",
    x: 100,
    y: 100,
    tag: "CAM-01",
    ...overrides,
  } as DeviceMarkup;
}

describe("resolveTagFontSize", () => {
  it("prefers per-device override above all", () => {
    expect(resolveTagFontSize(dev({ tagFontSize: 14, size: 28 }), null)).toBe(14);
    const p = { tagDefaults: { fontSize: 9 } } as Pick<Project, "tagDefaults">;
    expect(resolveTagFontSize(dev({ tagFontSize: 14, size: 28 }), p)).toBe(14);
  });

  it("falls back to project default when no per-device override", () => {
    const p = { tagDefaults: { fontSize: 9 } } as Pick<Project, "tagDefaults">;
    expect(resolveTagFontSize(dev({ size: 28 }), p)).toBe(9);
  });

  it("falls back to size-scaled auto when nothing is configured", () => {
    expect(resolveTagFontSize(dev({ size: 40 }), null)).toBe(14);
    // Floor at 10pt for tiny icons.
    expect(resolveTagFontSize(dev({ size: 14 }), null)).toBe(10);
  });

  it("ignores non-finite per-device overrides", () => {
    const p = { tagDefaults: { fontSize: 9 } } as Pick<Project, "tagDefaults">;
    expect(resolveTagFontSize(dev({ tagFontSize: NaN, size: 28 }), p)).toBe(9);
  });

  it("allows practical sub-6pt tag sizes", () => {
    const p = { tagDefaults: { fontSize: 4 } } as Pick<Project, "tagDefaults">;
    expect(resolveTagFontSize(dev({ size: 28 }), p)).toBe(4);
    expect(clampTagFontSize(2)).toBe(4);
  });
});

describe("resolveTagStyle", () => {
  it("defaults to black tags with white letters", () => {
    expect(resolveTagStyle(null)).toEqual({
      fillColor: DEFAULT_TAG_FILL,
      textColor: DEFAULT_TAG_TEXT,
      brandTags: false,
    });
  });

  it("uses custom project tag colors", () => {
    const p = {
      tagDefaults: { fillColor: "#ffffff", textColor: "#112233" },
    } as Pick<Project, "tagDefaults" | "branding">;
    expect(resolveTagStyle(p)).toEqual({
      fillColor: "#FFFFFF",
      textColor: "#112233",
      brandTags: false,
    });
  });

  it("uses brand accent with contrast-aware text when brand tags are enabled", () => {
    const p = {
      tagDefaults: { brandTags: true },
      branding: { accentColor: "#F4B740" },
    } as Pick<Project, "tagDefaults" | "branding">;
    expect(resolveTagStyle(p)).toEqual({
      fillColor: "#F4B740",
      textColor: DEFAULT_TAG_FILL,
      brandTags: true,
    });
  });
});

describe("maxTagOffsetDistance", () => {
  it("scales with device size but never below 200", () => {
    expect(maxTagOffsetDistance(28)).toBe(200); // 28*4=112 → 200 floor
    expect(maxTagOffsetDistance(60)).toBe(240); // 60*4=240 wins
    expect(maxTagOffsetDistance(100)).toBe(400);
  });
});

describe("clampTagOffset", () => {
  it("preserves direction when shrinking past the cap", () => {
    const c = clampTagOffset(900, 0, 28); // cap 200
    expect(c.dx).toBeCloseTo(200, 6);
    expect(c.dy).toBe(0);
  });
  it("leaves in-range offsets alone", () => {
    const c = clampTagOffset(40, -30, 28); // dist 50 < 200
    expect(c).toEqual({ dx: 40, dy: -30 });
  });
  it("handles zero offset without dividing by zero", () => {
    const c = clampTagOffset(0, 0, 28);
    expect(c).toEqual({ dx: 0, dy: 0 });
  });
  it("clamps along arbitrary direction proportionally", () => {
    // (300, 400) is dist 500. Cap is 200. Expect (120, 160).
    const c = clampTagOffset(300, 400, 28);
    expect(c.dx).toBeCloseTo(120, 6);
    expect(c.dy).toBeCloseTo(160, 6);
  });
});
