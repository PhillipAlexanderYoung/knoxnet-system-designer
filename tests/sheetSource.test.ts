// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  detectSourceKind,
  fromBase64,
  getPdfBytes,
  getSourceBytes,
  toBase64,
} from "../src/lib/sheetSource";

describe("detectSourceKind", () => {
  it("recognises PDFs by extension", () => {
    expect(detectSourceKind("plan.pdf")).toBe("pdf");
  });
  it("recognises PDFs by MIME", () => {
    expect(detectSourceKind("foo", "application/pdf")).toBe("pdf");
  });
  it("recognises DXF", () => {
    expect(detectSourceKind("floor.dxf")).toBe("dxf");
  });
  it("recognises SVG", () => {
    expect(detectSourceKind("logo.SVG")).toBe("svg");
    expect(detectSourceKind("foo", "image/svg+xml")).toBe("svg");
  });
  it("recognises raster formats", () => {
    expect(detectSourceKind("a.png")).toBe("raster");
    expect(detectSourceKind("a.jpg")).toBe("raster");
    expect(detectSourceKind("a.JPEG")).toBe("raster");
    expect(detectSourceKind("a.webp")).toBe("raster");
    expect(detectSourceKind("a.tif")).toBe("raster");
    expect(detectSourceKind("a.tiff")).toBe("raster");
    expect(detectSourceKind("a.bmp")).toBe("raster");
  });
  it("recognises IFC", () => {
    expect(detectSourceKind("building.ifc")).toBe("ifc");
  });
  it("returns null for unsupported formats", () => {
    expect(detectSourceKind("model.dwg")).toBe(null);
    expect(detectSourceKind("model.rvt")).toBe(null);
    expect(detectSourceKind("notes.txt")).toBe(null);
  });
  it("does not classify project files as drawing imports", () => {
    expect(detectSourceKind("shared.knoxnet", "")).toBeNull();
    expect(detectSourceKind("shared.knoxnet", "application/json")).toBeNull();
  });
});

describe("base64 round-trip", () => {
  it("round-trips small byte arrays", () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 251, 252, 253, 254, 255]);
    const b64 = toBase64(bytes);
    const back = fromBase64(b64);
    expect(Array.from(back)).toEqual(Array.from(bytes));
  });
  it("round-trips large byte arrays", () => {
    const bytes = new Uint8Array(40_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i & 0xff;
    const b64 = toBase64(bytes);
    const back = fromBase64(b64);
    expect(back.length).toBe(bytes.length);
    expect(back[0]).toBe(0);
    expect(back[12345]).toBe(12345 & 0xff);
  });
});

describe("source helpers", () => {
  it("getSourceBytes returns bytes for binary kinds", () => {
    expect(
      getSourceBytes({ kind: "pdf", bytes: new Uint8Array([1, 2]) }),
    ).toEqual(new Uint8Array([1, 2]));
  });
  it("getSourceBytes returns null for svg", () => {
    expect(
      getSourceBytes({
        kind: "svg",
        text: "<svg/>",
        viewBoxX: 0,
        viewBoxY: 0,
        viewBoxW: 1,
        viewBoxH: 1,
      }),
    ).toBe(null);
  });
  it("getPdfBytes prefers new source field over legacy alias", () => {
    const fresh = new Uint8Array([9, 9]);
    const legacy = new Uint8Array([1, 1]);
    const got = getPdfBytes({
      source: { kind: "pdf", bytes: fresh },
      pdfBytes: legacy,
    });
    expect(got).toBe(fresh);
  });
  it("getPdfBytes falls back to legacy alias when no source", () => {
    const legacy = new Uint8Array([1, 1]);
    const got = getPdfBytes({ pdfBytes: legacy });
    expect(got).toBe(legacy);
  });
  it("getPdfBytes returns undefined for non-pdf sources", () => {
    const got = getPdfBytes({
      source: {
        kind: "svg",
        text: "<svg/>",
        viewBoxX: 0,
        viewBoxY: 0,
        viewBoxW: 1,
        viewBoxH: 1,
      },
    });
    expect(got).toBeUndefined();
  });
});
