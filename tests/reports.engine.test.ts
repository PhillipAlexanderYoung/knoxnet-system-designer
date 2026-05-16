// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  applyFilters,
  formatCell,
  groupRows,
  resolveColumns,
  runReport,
  selectEntities,
  sortRows,
} from "../src/reports/engine";
import { getByPath, coerceCell } from "../src/reports/paths";
import { reportToCsv } from "../src/reports/formats/csv";
import { reportToJson } from "../src/reports/formats/json";
import { reportToMarkdown } from "../src/reports/formats/markdown";
import { reportToHtml } from "../src/reports/formats/html";
import { withAutoAssignedConnectionPorts } from "../src/lib/connections";
import type { Project, ReportTemplate } from "../src/store/projectStore";

function mkProject(): Project {
  return {
    id: "p1",
    meta: {
      projectName: "Test Project",
      projectNumber: "001",
      client: "",
      location: "",
      drawnBy: "",
      date: new Date(0).toISOString(),
      revision: "0",
    },
    sheets: [
      {
        id: "s1",
        name: "L1 - Plan",
        fileName: "plan.pdf",
        pageWidth: 800,
        pageHeight: 600,
        renderScale: 1,
        markups: [
          {
            id: "m1",
            kind: "device",
            deviceId: "cam-dome",
            category: "cameras",
            x: 100,
            y: 100,
            tag: "CAM-01",
            layer: "cameras",
            systemConfig: {
              manufacturer: "Hikvision",
              model: "DS-2CD2143",
              network: {
                ipAddress: "10.0.10.21",
                vlan: 10,
                macAddress: "aa:bb:cc:dd:ee:01",
              },
            },
          },
          {
            id: "m2",
            kind: "device",
            deviceId: "cam-bullet",
            category: "cameras",
            x: 200,
            y: 200,
            tag: "CAM-02",
            layer: "cameras",
            systemConfig: {
              manufacturer: "Hikvision",
              model: "DS-2CD2T43",
              network: { ipAddress: "10.0.10.22", vlan: 10 },
            },
          },
          {
            id: "m3",
            kind: "device",
            deviceId: "net-ap-i",
            category: "network",
            x: 300,
            y: 300,
            tag: "AP-01",
            layer: "network",
            systemConfig: {
              manufacturer: "Ubiquiti",
              network: { ipAddress: "10.0.20.21", vlan: 20 },
            },
          },
        ],
      },
    ],
    racks: [],
    bidDefaults: { slackPercent: 10 } as never,
    connections: [
      {
        id: "c1",
        fromTag: "CAM-01",
        fromPortId: "eth0",
        toTag: "SW-01",
        toPort: "Port 1",
      },
    ],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("paths", () => {
  it("reads dotted paths from nested objects", () => {
    const obj = { a: { b: { c: 42 } } };
    expect(getByPath(obj, "a.b.c")).toBe(42);
    expect(getByPath(obj, "a.b.missing")).toBeUndefined();
    expect(getByPath(null, "a")).toBeUndefined();
  });

  it("coerces cells to strings", () => {
    expect(coerceCell(null)).toBe("");
    expect(coerceCell(undefined)).toBe("");
    expect(coerceCell(42)).toBe("42");
    expect(coerceCell(true)).toBe("true");
    expect(coerceCell(["a", "b"])).toBe("a, b");
  });
});

describe("selectEntities", () => {
  it("flattens devices across sheets", () => {
    const p = mkProject();
    const rows = selectEntities(p, "devices");
    expect(rows).toHaveLength(3);
    const cam = rows.find((r) => (r as Record<string, unknown>).tag === "CAM-01");
    expect(cam).toBeDefined();
    expect((cam as Record<string, unknown>).deviceLabel).toBe("Dome Camera");
    expect((cam as Record<string, unknown>).connectionCount).toBe(1);
  });

  it("surfaces nested device relationships", () => {
    const p = mkProject();
    p.sheets[0].markups.push({
      id: "m4",
      kind: "device",
      deviceId: "net-headend",
      category: "network",
      x: 400,
      y: 400,
      tag: "HE-01",
      layer: "network",
    });
    const ap = p.sheets[0].markups.find((m) => m.id === "m3") as any;
    ap.parentId = "m4";

    const rows = selectEntities(p, "devices");
    const apRow = rows.find((r) => (r as Record<string, unknown>).tag === "AP-01");
    const headEndRow = rows.find((r) => (r as Record<string, unknown>).tag === "HE-01");
    expect((apRow as Record<string, unknown>).parentTag).toBe("HE-01");
    expect((headEndRow as Record<string, unknown>).nestedDeviceCount).toBe(1);
    expect((headEndRow as Record<string, unknown>).nestedDevices).toBe("AP-01");
  });

  it("builds area schedule rows with nested connections", () => {
    const p = mkProject();
    p.sheets[0].markups.push({
      id: "m4",
      kind: "device",
      deviceId: "net-headend",
      category: "network",
      x: 400,
      y: 400,
      tag: "HE-01",
      layer: "network",
      nestedScheduleName: "MDF-1 Schedule",
      showNestedDevices: true,
    });
    const ap = p.sheets[0].markups.find((m) => m.id === "m3") as any;
    ap.parentId = "m4";
    p.connections?.push({
      id: "c2",
      fromTag: "AP-01",
      fromPort: "ETH 0",
      toTag: "SW-01",
      toPort: "Port 7",
    });

    const rows = selectEntities(p, "areaSchedules");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      areaTag: "HE-01",
      areaName: "MDF-1 Schedule",
      deviceTag: "AP-01",
      connections: "SW-01 (ETH 0)",
    });
  });

  it("flattens connections", () => {
    const p = mkProject();
    const rows = selectEntities(p, "connections");
    expect(rows).toHaveLength(1);
  });

  it("surfaces container internal port assignments in connection and port reports", () => {
    const p = mkProject();
    p.sheets[0].markups.push(
      {
        id: "m4",
        kind: "device",
        deviceId: "net-headend",
        category: "network",
        x: 400,
        y: 400,
        tag: "HE-01",
        layer: "network",
      },
      {
        id: "m5",
        kind: "device",
        deviceId: "net-switch-poe",
        category: "network",
        x: 420,
        y: 400,
        tag: "SW-01",
        layer: "network",
        parentId: "m4",
      },
      {
        id: "m6",
        kind: "device",
        deviceId: "net-wifi-bridge",
        category: "network",
        x: 100,
        y: 400,
        tag: "BR-01",
        layer: "network",
      },
    );
    p.connections?.push({
      id: "c2",
      fromTag: "BR-01",
      toTag: "HE-01",
      medium: "cat6",
      internalEndpoint: {
        containerId: "m4",
        containerTag: "HE-01",
        deviceId: "m5",
        deviceTag: "SW-01",
        portId: "port-1",
      },
    });

    const connectionRows = selectEntities(p, "connections");
    expect(connectionRows.find((row) => row.id === "c2")).toMatchObject({
      internalContainerTag: "HE-01",
      internalDeviceTag: "SW-01",
      internalPortId: "port-1",
      internalPort: "Port 1",
    });

    const portRows = selectEntities(p, "ports");
    const switchPort = portRows.find(
      (row) =>
        row.deviceTag === "SW-01" &&
        (row.port as Record<string, unknown>).id === "port-1",
    );
    expect(switchPort).toMatchObject({
      isConnected: true,
      connectedTo: "BR-01",
    });
  });

  it("surfaces auto-assigned port labels in reports and area schedules", () => {
    const p = mkProject();
    p.sheets[0].markups.push(
      {
        id: "m4",
        kind: "device",
        deviceId: "net-headend",
        category: "network",
        x: 400,
        y: 400,
        tag: "HE-01",
        layer: "network",
        nestedScheduleName: "MDF-1 Schedule",
        showNestedDevices: true,
      },
      {
        id: "m5",
        kind: "device",
        deviceId: "net-switch-poe",
        category: "network",
        x: 420,
        y: 400,
        tag: "SW-01",
        layer: "network",
        parentId: "m4",
      },
    );
    const ap = p.sheets[0].markups.find((m) => m.id === "m3") as any;
    ap.parentId = "m4";
    p.connections = [
      withAutoAssignedConnectionPorts(p, {
        id: "auto-ap",
        fromTag: "AP-01",
        toTag: "SW-01",
        medium: "cat6",
      }),
    ];

    const connectionRows = selectEntities(p, "connections");
    expect(connectionRows.find((row) => row.id === "auto-ap")).toMatchObject({
      fromPortId: "eth0",
      fromPortResolved: "ETH 0 (PoE in)",
      toPortId: "port-1",
      toPortResolved: "Port 1",
    });

    const scheduleRows = selectEntities(p, "areaSchedules");
    expect(scheduleRows[0]).toMatchObject({
      deviceTag: "AP-01",
      connections: "SW-01 (ETH 0 (PoE in))",
    });
  });

  it("surfaces physical cable labels in cable report rows", () => {
    const p = mkProject();
    p.sheets[0].calibration = {
      p1: { x: 0, y: 0 },
      p2: { x: 10, y: 0 },
      realFeet: 1,
      pixelsPerFoot: 10,
    };
    p.sheets[0].markups.push({
      id: "run-1",
      kind: "cable",
      layer: "cable",
      cableId: "cat6",
      label: "R1",
      physicalLabel: "CBL-CAM-001",
      endpointA: "SW-01",
      endpointB: "CAM-01",
      servedDevices: ["CAM-01", "CAM-02"],
      runCount: 1,
      points: [0, 0, 100, 0],
    });

    const rows = selectEntities(p, "cables");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      physicalLabel: "CBL-CAM-001",
      endpointA: "SW-01",
      endpointB: "CAM-01",
      servedDevices: "CAM-01, CAM-02",
      lengthFt: 10,
    });
  });

  it("flattens ports across devices", () => {
    const p = mkProject();
    const rows = selectEntities(p, "ports");
    // CAM-01 (eth0), CAM-02 (eth0), AP-01 (eth0, eth1) = 4 rows
    expect(rows.length).toBe(4);
    const camPort = rows.find(
      (r) =>
        (r as Record<string, unknown>).deviceTag === "CAM-01" &&
        ((r as Record<string, unknown>).port as Record<string, unknown>).id === "eth0",
    );
    expect(camPort).toBeDefined();
    expect((camPort as Record<string, unknown>).isConnected).toBe(true);
    expect((camPort as Record<string, unknown>).connectedTo).toBe("SW-01");
  });
});

describe("applyFilters", () => {
  it("filters by eq", () => {
    const p = mkProject();
    const rows = selectEntities(p, "devices");
    const filtered = applyFilters(rows, [
      { field: "category", op: "eq", value: "cameras" },
    ]);
    expect(filtered).toHaveLength(2);
  });

  it("filters by contains (case insensitive)", () => {
    const p = mkProject();
    const rows = selectEntities(p, "devices");
    const filtered = applyFilters(rows, [
      { field: "systemConfig.manufacturer", op: "contains", value: "hik" },
    ]);
    expect(filtered).toHaveLength(2);
  });

  it("filters by exists", () => {
    const p = mkProject();
    const rows = selectEntities(p, "devices");
    const filtered = applyFilters(rows, [
      { field: "systemConfig.network.macAddress", op: "exists" },
    ]);
    expect(filtered).toHaveLength(1);
  });

  it("filters by gte/lte on numbers", () => {
    const p = mkProject();
    const rows = selectEntities(p, "devices");
    const filtered = applyFilters(rows, [
      { field: "systemConfig.network.vlan", op: "gte", value: 20 },
    ]);
    expect(filtered).toHaveLength(1);
    expect((filtered[0] as Record<string, unknown>).tag).toBe("AP-01");
  });
});

describe("groupRows", () => {
  it("buckets rows by group field", () => {
    const p = mkProject();
    const rows = selectEntities(p, "devices");
    const grouped = groupRows(rows, ["systemConfig.network.vlan"]);
    expect(grouped).toHaveLength(2);
    const vlan10 = grouped.find((g) => g.key[0] === "10");
    expect(vlan10?.rows).toHaveLength(2);
  });

  it("returns one ungrouped bucket when groupBy is empty", () => {
    const p = mkProject();
    const rows = selectEntities(p, "devices");
    const grouped = groupRows(rows, []);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].key).toEqual([]);
    expect(grouped[0].rows).toHaveLength(3);
  });
});

describe("sortRows", () => {
  it("sorts by single key ascending", () => {
    const p = mkProject();
    const rows = selectEntities(p, "devices");
    const sorted = sortRows(rows, [{ field: "tag", dir: "asc" }]);
    expect((sorted[0] as Record<string, unknown>).tag).toBe("AP-01");
  });
  it("sorts by single key descending", () => {
    const p = mkProject();
    const rows = selectEntities(p, "devices");
    const sorted = sortRows(rows, [{ field: "tag", dir: "desc" }]);
    expect((sorted[0] as Record<string, unknown>).tag).toBe("CAM-02");
  });
});

describe("runReport top-level", () => {
  const template: ReportTemplate = {
    id: "r1",
    name: "Camera IPs",
    scope: "devices",
    filters: [{ field: "category", op: "eq", value: "cameras" }],
    columns: [
      { field: "tag" },
      { field: "systemConfig.network.ipAddress", header: "IP" },
    ],
    sortBy: [{ field: "tag", dir: "asc" }],
    formats: ["csv"],
  };

  it("produces a ReportResult with the right columns and rows", () => {
    const p = mkProject();
    const result = runReport(p, template);
    expect(result.rowCount).toBe(2);
    expect(result.columns.map((c) => c.header)).toEqual(["Tag", "IP"]);
    expect(result.groups).toHaveLength(1);
  });

  it("resolves default headers from the field catalog", () => {
    const p = mkProject();
    const result = runReport(p, template);
    expect(result.columns[0].header).toBe("Tag");
  });

  it("emits CSV with RFC4180 escaping", () => {
    const p = mkProject();
    const result = runReport(p, template);
    const csv = reportToCsv(result);
    expect(csv.split("\r\n")[0]).toBe("Tag,IP");
    expect(csv).toContain("CAM-01,10.0.10.21");
  });

  it("emits JSON in flat shape by default", () => {
    const p = mkProject();
    const result = runReport(p, template);
    const json = reportToJson(result);
    const parsed = JSON.parse(json) as Array<Record<string, unknown>>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].Tag).toBe("CAM-01");
  });

  it("emits Markdown with title and header rows", () => {
    const p = mkProject();
    const result = runReport(p, template);
    const md = reportToMarkdown(result);
    expect(md).toContain("# Camera IPs");
    expect(md).toContain("| Tag | IP |");
  });

  it("emits HTML with table rows", () => {
    const p = mkProject();
    const result = runReport(p, template);
    const html = reportToHtml(result);
    expect(html).toContain("<title>Camera IPs");
    expect(html).toContain("CAM-01");
  });
});

describe("formatCell", () => {
  it("formats booleans as Yes/No", () => {
    expect(formatCell(true, "bool")).toBe("Yes");
    expect(formatCell(false, "bool")).toBe("No");
  });
  it("formats dates as ISO date", () => {
    expect(formatCell("2024-01-15T12:00:00Z", "date")).toBe("2024-01-15");
  });
});

describe("resolveColumns", () => {
  it("fills in headers from the field catalog", () => {
    const cols = resolveColumns({
      id: "r",
      name: "x",
      scope: "devices",
      filters: [],
      columns: [{ field: "tag" }, { field: "systemConfig.network.vlan" }],
      formats: [],
    });
    expect(cols[0].header).toBe("Tag");
    expect(cols[1].header).toBe("VLAN");
  });

  it("labels cable physical labels from the field catalog", () => {
    const cols = resolveColumns({
      id: "r",
      name: "x",
      scope: "cables",
      filters: [],
      columns: [{ field: "physicalLabel" }],
      formats: [],
    });
    expect(cols[0].header).toBe("Physical Label");
  });
});
