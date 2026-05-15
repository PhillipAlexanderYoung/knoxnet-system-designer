// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  migrateSheetV1toV2,
  migrateProjectV1toV2,
} from "../src/lib/migrate";
import type { Project, Sheet } from "../src/store/projectStore";

const FAKE_PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF

describe("migrateSheetV1toV2", () => {
  it("wraps legacy pdfBytes into a pdf source", () => {
    const v1: Sheet = {
      id: "s1",
      name: "Sheet 1",
      fileName: "plan.pdf",
      pdfBytes: FAKE_PDF_BYTES,
      pageWidth: 1000,
      pageHeight: 700,
      renderScale: 2,
      markups: [],
    };
    const migrated = migrateSheetV1toV2(v1);
    expect(migrated.source).toBeDefined();
    expect(migrated.source?.kind).toBe("pdf");
    if (migrated.source?.kind === "pdf") {
      expect(migrated.source.bytes).toBe(FAKE_PDF_BYTES);
    }
  });

  it("is idempotent for v2 sheets that already have a source", () => {
    const v2: Sheet = {
      id: "s2",
      name: "Sheet 2",
      fileName: "plan.dxf",
      source: {
        kind: "dxf",
        bytes: new Uint8Array(0),
        units: "ft",
        parsed: {
          entities: [],
          blocks: {},
          bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
          skippedEntityCount: 0,
          skippedEntityTypes: [],
        },
      },
      pageWidth: 100,
      pageHeight: 100,
      renderScale: 1,
      markups: [],
    };
    expect(migrateSheetV1toV2(v2)).toBe(v2);
  });

  it("leaves sheets without bytes or source untouched", () => {
    const v1: Sheet = {
      id: "s3",
      name: "Placeholder",
      fileName: "tbd.pdf",
      pageWidth: 100,
      pageHeight: 100,
      renderScale: 1,
      markups: [],
    };
    expect(migrateSheetV1toV2(v1).source).toBeUndefined();
  });
});

describe("migrateProjectV1toV2", () => {
  it("migrates every sheet in a project", () => {
    const v1: Project = {
      id: "p1",
      meta: {
        projectName: "Test",
        projectNumber: "",
        client: "",
        location: "",
        drawnBy: "",
        date: new Date(0).toISOString(),
        revision: "0",
      },
      sheets: [
        {
          id: "s1",
          name: "First",
          fileName: "a.pdf",
          pdfBytes: FAKE_PDF_BYTES,
          pageWidth: 100,
          pageHeight: 100,
          renderScale: 1,
          markups: [],
        },
        {
          id: "s2",
          name: "Second",
          fileName: "b.pdf",
          pdfBytes: FAKE_PDF_BYTES,
          pageWidth: 200,
          pageHeight: 200,
          renderScale: 1,
          markups: [],
        },
      ],
      racks: [],
      bidDefaults: {} as never,
      createdAt: 0,
      updatedAt: 0,
    };
    const v2 = migrateProjectV1toV2(v1);
    expect(v2.sheets.every((s) => s.source?.kind === "pdf")).toBe(true);
  });
});
