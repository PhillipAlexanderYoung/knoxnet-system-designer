// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseProjectFileText,
  serializeProjectFile,
  serializeProjectFilePayload,
} from "../src/lib/projectFile";
import { defaultBidDefaults } from "../src/data/defaults";
import { DEFAULT_LAYERS, type Project } from "../src/store/projectStore";
import { validateProject } from "../src/lib/validation";

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

function stubObjectUrls() {
  return vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:knoxnet-test");
}

afterEach(() => {
  vi.restoreAllMocks();
});

function richProject(): Project {
  return {
    id: "project-rich",
    meta: {
      projectName: "Portable Project",
      projectNumber: "KX-42",
      client: "Client",
      location: "Site",
      drawnBy: "Designer",
      date: new Date(0).toISOString(),
      revision: "A",
      summary: "Round-trip portability coverage",
    },
    sheets: [
      {
        id: "sheet-1",
        name: "Level 1",
        fileName: "level-1.pdf",
        source: { kind: "pdf", bytes: PDF_BYTES },
        pdfBytes: PDF_BYTES,
        objectUrl: "blob:session-only",
        pageWidth: 1200,
        pageHeight: 800,
        renderScale: 2,
        calibration: {
          p1: { x: 0, y: 0 },
          p2: { x: 100, y: 0 },
          realFeet: 25,
          pixelsPerFoot: 4,
        },
        sheetNumber: "E1.01",
        sheetTitle: "First Floor",
        markups: [
          {
            id: "cam-1",
            kind: "device",
            layer: "cameras",
            deviceId: "cam-dome",
            category: "cameras",
            x: 100,
            y: 150,
            tag: "CAM-01",
            labelOverride: "Lobby",
            locked: true,
            tagOffsetX: 18,
            tagOffsetY: -22,
            tagFontSize: 9,
            systemConfig: {
              network: {
                ipAddress: "10.10.20.101",
                subnetMask: "255.255.255.0",
                gateway: "10.10.20.1",
                vlan: 20,
                hostname: "cam-01",
                macAddress: "00:11:22:33:44:55",
              },
              switchPort: "Port 3",
              cableTag: "C-010",
              manufacturer: "Knox",
              model: "DomeCam",
            },
            instancePorts: [
              { id: "eth0", label: "ETH 0 (PoE)", kind: "ethernet", poe: "in" },
            ],
          },
          {
            id: "switch-1",
            kind: "device",
            layer: "network",
            deviceId: "net-switch-poe",
            category: "network",
            x: 300,
            y: 150,
            tag: "SW-01",
            systemConfig: {
              network: {
                ipAddress: "10.10.20.2",
                subnetMask: "255.255.255.0",
                gateway: "10.10.20.1",
                vlan: 20,
                hostname: "sw-01",
              },
              switchConfig: {
                portCount: 28,
                vlans: "1,20,30",
                managementVlan: 20,
                poeBudgetW: 370,
              },
            },
          },
          {
            id: "headend-1",
            kind: "device",
            layer: "network",
            deviceId: "net-headend",
            category: "network",
            x: 260,
            y: 220,
            tag: "HE-01",
            labelOverride: "MDF head end",
            showNestedDevices: true,
            nestedScheduleName: "MDF Rack",
          },
          {
            id: "fiber-1",
            kind: "cable",
            layer: "cable",
            cableId: "fiber-sm",
            points: [300, 150, 400, 150, 500, 220],
            pointAttachments: [
              { deviceMarkupId: "switch-1", deviceTag: "SW-01", deviceId: "net-switch-poe", category: "network" },
              { routeWaypoint: true, label: "Conduit bend" },
              { deviceMarkupId: "cam-1", deviceTag: "CAM-01", deviceId: "cam-dome", category: "cameras" },
            ],
            physicalLabel: "F-010",
            fiberStrandCount: 12,
            serviceLoopFt: 15,
            runCount: 2,
            slackPercent: 10,
            connector: "LC-LC",
            endpointA: "SW-01 SFP 1",
            endpointB: "CAM-01 media converter",
            labelOffsetX: 12,
            labelOffsetY: -8,
            showLabel: true,
            servedDevices: ["CAM-01"],
          },
          {
            id: "schedule-1",
            kind: "schedule",
            layer: "annotation",
            targetId: "fiber-1",
            targetKind: "cable",
            x: 520,
            y: 240,
            title: "Fiber Run",
            mode: "detailed",
            preset: "routing",
            visible: true,
          },
        ],
      },
    ],
    racks: [
      {
        id: "rack-1",
        name: "MDF Rack",
        uHeight: 42,
        location: "MDF",
        associatedSheetId: "sheet-1",
        placements: [
          {
            id: "placement-1",
            sourceMarkupId: "switch-1",
            deviceId: "net-switch-poe",
            uSlot: 20,
            label: "SW-01",
            notes: "Patch to panel A",
          },
        ],
        createdAt: 10,
        updatedAt: 11,
      },
    ],
    bidDefaults: { ...defaultBidDefaults, laborRate: 110 },
    bidLaborOverrides: { "cable:fiber-sm": { laborHours: 3.5 } },
    tagDefaults: {
      fontSize: 8,
      fillColor: "#112233",
      textColor: "#FFFFFF",
      brandTags: false,
    },
    layers: DEFAULT_LAYERS.map((layer, index) => ({
      ...layer,
      visible: layer.id !== "annotation",
      locked: layer.id === "cable",
      label: `${index + 1}. ${layer.label}`,
    })).reverse(),
    connections: [
      {
        id: "conn-1",
        fromTag: "CAM-01",
        fromPortId: "eth0",
        fromPort: "ETH 0",
        toTag: "SW-01",
        toPortId: "port-3",
        toPort: "Port 3",
        medium: "fiber-sm",
        cableMarkupId: "fiber-1",
        internalEndpoint: {
          containerId: "headend-1",
          containerTag: "HE-01",
          deviceId: "switch-1",
          deviceTag: "SW-01",
          portId: "sfp-1",
          port: "SFP 1",
        },
        label: "Lobby camera uplink",
      },
    ],
    diagrams: [
      {
        id: "diagram-1",
        name: "Network",
        kind: "network",
        nodePositions: {
          "CAM-01": { x: 100, y: 100 },
          "SW-01": { x: 300, y: 100 },
          "HE-01": { x: 250, y: 200 },
        },
        nodeStyles: { "SW-01": { color: "#223344", collapsed: false } },
        autoLayout: "layered",
        routedEdges: { "conn-1": { points: [100, 100, 200, 100, 300, 100] } },
        createdAt: 12,
        updatedAt: 13,
      },
    ],
    reports: [
      {
        id: "report-1",
        name: "Fiber Review",
        scope: "cables",
        filters: [{ field: "fiberStrandCount", op: "gte", value: 12 }],
        columns: [
          { field: "physicalLabel" },
          { field: "fiberStrandCount" },
          { field: "runCount" },
        ],
        groupBy: ["sheetName"],
        sortBy: [{ field: "physicalLabel", dir: "asc" }],
        formats: ["csv", "pdf"],
      },
    ],
    cableLabelScheme: {
      cablePrefix: "C",
      fiberPrefix: "FO",
      conduitPrefix: "CN",
      minDigits: 4,
      separator: "-",
    },
    runLabelsVisible: true,
    bidExportVisibility: {
      material: true,
      labor: true,
      overhead: true,
      tax: false,
      margin: false,
    },
    createdAt: 1,
    updatedAt: 2,
  };
}

describe(".knoxnet project files", () => {
  it("round-trips representative project data and embeds sheet sources", async () => {
    const project = richProject();
    const payload = serializeProjectFilePayload(project, "2026-05-16T00:00:00.000Z");
    const serializedSheet = payload.project.sheets[0];

    expect(serializedSheet.sourceSerialized).toEqual({
      kind: "pdf",
      bytesB64: "JVBERi0x",
    });
    expect(serializedSheet).not.toHaveProperty("source");
    expect(serializedSheet).not.toHaveProperty("pdfBytes");
    expect(serializedSheet).not.toHaveProperty("objectUrl");

    stubObjectUrls();
    const imported = await parseProjectFileText(serializeProjectFile(project, payload.exportedAt));
    expect(imported.sheets[0].source?.kind).toBe("pdf");
    if (imported.sheets[0].source?.kind === "pdf") {
      expect(imported.sheets[0].source.bytes).toEqual(PDF_BYTES);
    }

    expect(imported.sheets[0].markups).toEqual(project.sheets[0].markups);
    expect(imported.racks).toEqual(project.racks);
    expect(imported.connections).toEqual(project.connections);
    expect(imported.diagrams).toEqual(project.diagrams);
    expect(imported.reports).toEqual(project.reports);
    expect(imported.bidLaborOverrides).toEqual(project.bidLaborOverrides);
    expect(imported.tagDefaults).toEqual(project.tagDefaults);
    expect(imported.layers).toEqual(project.layers);
    expect(imported.runLabelsVisible).toBe(true);
    expect(imported.cableLabelScheme).toEqual(project.cableLabelScheme);
    expect(validateProject(imported)).toEqual([]);
  });

  it("keeps intentionally empty templates while normalizing old minimal files", async () => {
    stubObjectUrls();
    const minimal = {
      knoxnet: "1.0",
      exportedAt: "2026-05-16T00:00:00.000Z",
      project: {
        id: "old-project",
        meta: { projectName: "Old Project" },
        sheets: [
          {
            id: "old-sheet",
            name: "Legacy",
            fileName: "legacy.pdf",
            pdfBytesB64: "JVBERi0x",
            pageWidth: 0,
            pageHeight: 0,
            renderScale: 0,
          },
        ],
        reports: [],
      },
    };

    const imported = await parseProjectFileText(JSON.stringify(minimal));
    expect(imported.meta).toMatchObject({
      projectName: "Old Project",
      projectNumber: "",
      client: "",
      location: "",
      drawnBy: "",
      revision: "0",
    });
    expect(imported.sheets[0]).toMatchObject({
      id: "old-sheet",
      pageWidth: 1000,
      pageHeight: 1000,
      renderScale: 1,
      markups: [],
    });
    expect(imported.sheets[0].source?.kind).toBe("pdf");
    expect(imported.racks).toEqual([]);
    expect(imported.connections).toBeUndefined();
    expect(imported.diagrams).toEqual([]);
    expect(imported.reports).toEqual([]);
    expect(imported.layers).toHaveLength(DEFAULT_LAYERS.length);
    expect(imported.bidDefaults).toMatchObject(defaultBidDefaults);
    expect(imported.bidExportVisibility).toMatchObject({
      material: true,
      labor: true,
      overhead: false,
      tax: true,
      margin: false,
    });
    expect(Number.isFinite(imported.createdAt)).toBe(true);
    expect(Number.isFinite(imported.updatedAt)).toBe(true);
  });
});
