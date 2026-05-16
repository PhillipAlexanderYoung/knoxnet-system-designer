// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  assignGeneratedCableLabels,
  generateCablePhysicalLabel,
  projectWithGeneratedCableLabels,
} from "../src/lib/cableLabels";
import {
  resolveValidationIssues,
  resolveValidationIssue,
  safeDeadReferenceIssueIds,
  validateProject,
  validationMarkupIdsForIssues,
  validationPortConflictsForDevice,
} from "../src/lib/validation";
import type {
  CableMarkup,
  DeviceConnection,
  DeviceMarkup,
  Project,
  Sheet,
} from "../src/store/projectStore";

const sheet = (markups: Sheet["markups"]): Sheet => ({
  id: "s1",
  name: "Sheet 1",
  fileName: "s1.pdf",
  pageWidth: 100,
  pageHeight: 100,
  renderScale: 1,
  markups,
});

const cable = (overrides: Partial<CableMarkup> = {}): CableMarkup => ({
  id: "c1",
  kind: "cable",
  layer: "cable",
  cableId: "cat6",
  points: [0, 0, 10, 10],
  ...overrides,
});

const device = (overrides: Partial<DeviceMarkup> = {}): DeviceMarkup => ({
  id: "d1",
  kind: "device",
  layer: "cameras",
  deviceId: "cam-dome",
  category: "cameras",
  x: 0,
  y: 0,
  tag: "CAM-01",
  ...overrides,
});

function project(markups: Sheet["markups"], connections: DeviceConnection[] = []): Project {
  return {
    id: "p1",
    meta: {
      projectName: "Validation Test",
      projectNumber: "",
      client: "",
      location: "",
      drawnBy: "",
      date: new Date(0).toISOString(),
      revision: "0",
    },
    sheets: [sheet(markups)],
    racks: [],
    bidDefaults: {} as never,
    connections,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("cable physical label generation", () => {
  it("generates type-specific labels after existing labels", () => {
    const p = project([
      cable({ id: "existing-cat", physicalLabel: "C-003" }),
      cable({ id: "existing-fiber", cableId: "fiber-sm", physicalLabel: "F-002" }),
      cable({ id: "existing-conduit", cableId: "conduit", physicalLabel: "CN-007" }),
    ]);

    expect(generateCablePhysicalLabel("cat6", ["C-001", "C-003"], undefined)).toBe("C-004");
    expect(assignGeneratedCableLabels([cable({ id: "new-cat" })], p)[0].physicalLabel).toBe("C-004");
    expect(
      assignGeneratedCableLabels([cable({ id: "new-fiber", cableId: "fiber-sm" })], p)[0]
        .physicalLabel,
    ).toBe("F-003");
    expect(
      assignGeneratedCableLabels([cable({ id: "new-conduit", cableId: "conduit" })], p)[0]
        .physicalLabel,
    ).toBe("CN-008");
  });

  it("backfills unlabeled runs while preserving manual labels", () => {
    const p = project([
      cable({ id: "manual", physicalLabel: "DROP-A" }),
      cable({ id: "blank-1" }),
      cable({ id: "blank-2", cableId: "fiber-sm" }),
    ]);

    const next = projectWithGeneratedCableLabels(p);
    const labels = next.sheets[0].markups
      .filter((m): m is CableMarkup => m.kind === "cable")
      .map((m) => m.physicalLabel);

    expect(labels).toEqual(["DROP-A", "C-001", "F-001"]);
  });

  it("supports project-specific prefixes", () => {
    const p = {
      ...project([]),
      cableLabelScheme: { cablePrefix: "LV", fiberPrefix: "FO", conduitPrefix: "EC" },
    };

    expect(assignGeneratedCableLabels([cable({ id: "new-cat" })], p)[0].physicalLabel).toBe(
      "LV-001",
    );
  });
});

describe("project validation", () => {
  it("warns about duplicate cable labels, device identifiers, and IPs", () => {
    const p = project([
      cable({ id: "c1", physicalLabel: "C-001" }),
      cable({ id: "c2", physicalLabel: "c-001" }),
      device({
        id: "d1",
        tag: "CAM-01",
        labelOverride: "Lobby",
        systemConfig: { network: { ipAddress: "10.0.0.10" } },
      }),
      device({
        id: "d2",
        tag: "CAM-01",
        labelOverride: "Lobby",
        systemConfig: { network: { ipAddress: "10.0.0.10" } },
      }),
    ]);

    const messages = validateProject(p).map((issue) => issue.message);
    expect(messages).toContain('Duplicate cable physical label "C-001" is used by 2 runs.');
    expect(messages).toContain('Duplicate device tag "CAM-01" is used by 2 devices.');
    expect(messages).toContain(
      'Duplicate device display label "Lobby" is used by 2 devices.',
    );
    expect(messages).toContain(
      'Duplicate IP address "10.0.0.10" is assigned to 2 devices.',
    );
  });

  it("warns about reused structured device ports without duplicate free-text conflicts", () => {
    const p = project(
      [
        device({ id: "sw-1", tag: "SW-01", deviceId: "net-switch-poe", category: "network" }),
        device({ id: "cam-1", tag: "CAM-01", systemConfig: { switchPort: "SW-01 Port 1" } }),
        device({ id: "cam-2", tag: "CAM-02", systemConfig: { switchPort: "SW-01 Port 1" } }),
      ],
      [
        { id: "conn-1", fromTag: "CAM-01", toTag: "SW-01", toPort: "Port 1" },
        { id: "conn-2", fromTag: "CAM-02", toTag: "SW-01", toPort: "Port 1" },
      ],
    );

    const issues = validateProject(p);
    const messages = issues.map((issue) => issue.message);
    expect(issues.some((issue) => issue.code === "duplicate-switch-port-text")).toBe(false);
    expect(messages).toContain(
      'Duplicate port assignment "SW-01 Port 1" appears on 2 connections.',
    );
  });

  it("flags duplicate unlinked switch port text as a cleanup note", () => {
    const p = project([
      device({ id: "sw-2", tag: "SW-02", deviceId: "net-switch-poe", category: "network" }),
      device({ id: "cam-8", tag: "CAM-8", systemConfig: { switchPort: "SW-02 Port 12" } }),
      device({ id: "cam-20", tag: "CAM-20", systemConfig: { switchPort: "SW-02 Port 12" } }),
    ]);

    const issues = validateProject(p);
    const staleIssue = issues.find((candidate) => candidate.code === "unlinked-switch-port-note");

    expect(issues.some((candidate) => candidate.code === "duplicate-switch-port-text")).toBe(false);
    expect(issues.some((candidate) => candidate.code === "duplicate-connection-port")).toBe(false);
    expect(staleIssue).toMatchObject({
      id: "unlinked-switch-port-note:sw02port12",
      resolver: {
        kind: "clear-stale-switch-port-text",
        label: "Clear stale switch port text from CAM-8 and CAM-20",
      },
      affected: {
        deviceIds: ["cam-8", "cam-20"],
      },
    });

    const result = resolveValidationIssue(p, staleIssue!.id);
    const cam8 = result.project.sheets[0].markups.find((m) => m.id === "cam-8") as DeviceMarkup;
    const cam20 = result.project.sheets[0].markups.find((m) => m.id === "cam-20") as DeviceMarkup;

    expect(result.resolved).toBe(true);
    expect(cam8.systemConfig?.switchPort).toBeUndefined();
    expect(cam20.systemConfig?.switchPort).toBeUndefined();
    expect(validateProject(result.project).some((candidate) => candidate.id === staleIssue!.id)).toBe(false);
  });

  it("includes actionable metadata for duplicate connection ports", () => {
    const p = project(
      [
        device({ id: "sw-1", tag: "SW-01", deviceId: "net-switch-poe", category: "network" }),
        device({ id: "cam-1", tag: "CAM-01" }),
        device({ id: "cam-2", tag: "CAM-02" }),
        cable({ id: "run-1", endpointA: "CAM-01", endpointB: "SW-01" }),
        cable({ id: "run-2", endpointA: "CAM-02", endpointB: "SW-01" }),
      ],
      [
        { id: "conn-1", fromTag: "CAM-01", toTag: "SW-01", toPortId: "port-6", toPort: "Port 6", medium: "cat6", cableMarkupId: "run-1" },
        { id: "conn-2", fromTag: "CAM-02", toTag: "SW-01", toPortId: "port-6", toPort: "Port 6", medium: "cat6", cableMarkupId: "run-2" },
      ],
    );

    const issue = validateProject(p).find((candidate) => candidate.code === "duplicate-connection-port");

    expect(issue).toMatchObject({
      id: "duplicate-connection-port:sw01port6",
      resolver: { kind: "reassign-duplicate-port" },
      affected: {
        connectionIds: ["conn-1", "conn-2"],
        cableMarkupIds: ["run-1", "run-2"],
      },
    });
    expect(validationMarkupIdsForIssues([issue!])).toEqual(["run-1", "run-2"]);
    expect(issue?.affected.ports?.map((port) => port.deviceTag)).toEqual(["SW-01", "SW-01"]);
    expect(issue?.resolver?.label).toBe("Move CAM-02 to SW-01 Port 7");
    expect(issue?.resolver?.options?.[0].label).toBe("Move CAM-02 to SW-01 Port 7");
  });

  it("summarizes duplicate switch ports for the switch visual", () => {
    const p = project(
      [
        device({ id: "sw-1", tag: "SW-01", deviceId: "net-switch-poe", category: "network" }),
        device({ id: "cam-1", tag: "CAM-01" }),
        device({ id: "cam-2", tag: "CAM-02" }),
      ],
      [
        { id: "conn-1", fromTag: "CAM-01", toTag: "SW-01", toPortId: "port-6", toPort: "Port 6", medium: "cat6" },
        { id: "conn-2", fromTag: "CAM-02", toTag: "SW-01", toPortId: "port-6", toPort: "Port 6", medium: "cat6" },
      ],
    );
    const sw = p.sheets[0].markups.find((m) => m.id === "sw-1") as DeviceMarkup;

    expect(validationPortConflictsForDevice(p, sw)).toEqual([
      expect.objectContaining({
        portLabel: "Port 6",
        connectionIds: ["conn-1", "conn-2"],
        deviceTags: ["CAM-01", "CAM-02"],
      }),
    ]);
  });

  it("auto-resolves duplicate switch ports by moving only later duplicates", () => {
    const p = project(
      [
        device({ id: "sw-1", tag: "SW-01", deviceId: "net-switch-poe", category: "network" }),
        device({
          id: "cam-1",
          tag: "CAM-01",
          systemConfig: { switchPort: "SW-01 Port 6" },
        }),
        device({
          id: "cam-2",
          tag: "CAM-02",
          systemConfig: { switchPort: "SW-01 Port 6" },
        }),
      ],
      [
        { id: "conn-1", fromTag: "CAM-01", toTag: "SW-01", toPortId: "port-6", toPort: "Port 6", medium: "cat6" },
        { id: "conn-2", fromTag: "CAM-02", toTag: "SW-01", toPortId: "port-6", toPort: "Port 6", medium: "cat6" },
      ],
    );
    const issue = validateProject(p).find((candidate) => candidate.code === "duplicate-connection-port")!;

    const result = resolveValidationIssue(p, issue.id);

    expect(result.resolved).toBe(true);
    expect(result.project.connections?.map((conn) => conn.toPortId)).toEqual(["port-6", "port-7"]);
    const cam2 = result.project.sheets[0].markups.find((m) => m.id === "cam-2") as DeviceMarkup;
    expect(cam2.systemConfig?.switchPort).toBe("SW-01 Port 7");
    expect(validateProject(result.project).some((candidate) => candidate.id === issue.id)).toBe(false);
  });

  it("repairs switch port assignments that landed on route infrastructure", () => {
    const p = project(
      [
        device({ id: "sw-1", tag: "SW-01", deviceId: "net-switch-poe", category: "network" }),
        device({
          id: "pb-3",
          tag: "PB-03",
          deviceId: "site-pullbox",
          category: "site",
          systemConfig: { switchPort: "SW-01 Port 1" },
        }),
        device({ id: "cam-8", tag: "CAM-08" }),
        cable({
          id: "run-1",
          points: [0, 0, 10, 0, 20, 0],
          pointAttachments: [
            { deviceMarkupId: "sw-1", deviceTag: "SW-01", deviceId: "net-switch-poe" },
            {
              deviceMarkupId: "pb-3",
              deviceTag: "PB-03",
              deviceId: "site-pullbox",
              routeWaypoint: true,
            },
            { deviceMarkupId: "cam-8", deviceTag: "CAM-08", deviceId: "cam-dome" },
          ],
        }),
      ],
      [
        {
          id: "bad-route-endpoint",
          fromTag: "SW-01",
          fromPortId: "port-1",
          fromPort: "Port 1",
          toTag: "PB-03",
          medium: "cat6",
          cableMarkupId: "run-1",
        },
      ],
    );

    const issue = validateProject(p).find(
      (candidate) => candidate.code === "route-infrastructure-port-assignment",
    )!;
    expect(issue.resolver?.label).toBe("Move switch assignment from PB-03 to CAM-08");

    const result = resolveValidationIssue(p, issue.id);
    const repaired = result.project.connections?.[0];
    const pullBox = result.project.sheets[0].markups.find((m) => m.id === "pb-3") as DeviceMarkup;
    const camera = result.project.sheets[0].markups.find((m) => m.id === "cam-8") as DeviceMarkup;

    expect(result.resolved).toBe(true);
    expect(repaired).toMatchObject({
      fromTag: "SW-01",
      fromPortId: "port-1",
      toTag: "CAM-08",
      toPortId: "eth0",
    });
    expect(pullBox.systemConfig?.switchPort).toBeUndefined();
    expect(camera.systemConfig?.switchPort).toBe("SW-01 Port 1");
    expect(validateProject(result.project).some((candidate) => candidate.id === issue.id)).toBe(false);
  });

  it("flags and safely removes ghost connections with missing devices", () => {
    const p = project([device({ id: "cam-1", tag: "CAM-01" })], [
      { id: "ghost", fromTag: "CAM-01", toTag: "SW-MISSING", medium: "cat6" },
    ]);
    const issue = validateProject(p).find((candidate) => candidate.code === "ghost-connection")!;

    expect(issue.resolver?.kind).toBe("remove-ghost-connection");
    const result = resolveValidationIssue(p, issue.id);

    expect(result.resolved).toBe(true);
    expect(result.project.connections).toEqual([]);
  });

  it("offers clear-or-remove choices for connections linked to deleted cable runs", () => {
    const p = project(
      [
        device({ id: "cam-8", tag: "CAM-08" }),
        device({ id: "cam-20", tag: "CAM-20" }),
      ],
      [
        {
          id: "stale-link",
          fromTag: "CAM-08",
          toTag: "CAM-20",
          medium: "cat6",
          cableMarkupId: "deleted-run",
        },
      ],
    );

    const issue = validateProject(p).find((candidate) => candidate.id === "ghost-connection:stale-link")!;

    expect(issue.resolver?.options?.map((option) => option.label)).toEqual([
      "Remove dead cable reference",
      "Remove stale connection stale-link",
    ]);
    const result = resolveValidationIssue(p, issue.id, "remove-stale-connection");
    expect(result.project.connections).toEqual([]);
  });

  it("removes stale duplicate connections whose linked cable was already deleted", () => {
    const p = project(
      [
        device({ id: "cam-8", tag: "CAM-08" }),
        device({ id: "cam-20", tag: "CAM-20" }),
        cable({ id: "run-20", endpointA: "CAM-08", endpointB: "CAM-20" }),
      ],
      [
        {
          id: "live",
          fromTag: "CAM-08",
          toTag: "CAM-20",
          medium: "cat6",
          cableMarkupId: "run-20",
        },
        {
          id: "stale",
          fromTag: "CAM-08",
          toTag: "CAM-20",
          medium: "cat6",
          cableMarkupId: "deleted-run",
        },
      ],
    );
    const issue = validateProject(p).find((candidate) => candidate.code === "duplicate-run")!;

    expect(issue.resolver?.label).toBe("Remove stale connection stale");
    const result = resolveValidationIssue(p, issue.id);

    expect(result.project.connections?.map((conn) => conn.id)).toEqual(["live"]);
    expect(validateProject(result.project).some((candidate) => candidate.code === "duplicate-run")).toBe(false);
  });

  it("flags dead cable metadata and clears only stale endpoint attachments", () => {
    const p = project([
      cable({
        id: "run-1",
        pointAttachments: [
          { deviceMarkupId: "missing", deviceTag: "CAM-MISSING" },
          null,
        ],
      }),
    ]);
    const issue = validateProject(p).find(
      (candidate) => candidate.id === "dead-cable-run:stale-attachments:run-1",
    )!;

    expect(issue.resolver?.kind).toBe("clear-stale-cable-attachments");
    const result = resolveValidationIssue(p, issue.id);
    const run = result.project.sheets[0].markups.find((m) => m.id === "run-1") as CableMarkup;

    expect(run.pointAttachments).toEqual([null, null]);
  });

  it("does not warn about plain unlinked conduit runs", () => {
    const p = project([
      cable({
        id: "conduit-1",
        cableId: "conduit",
        endpointA: "Pull Box A",
        endpointB: "Pull Box B",
      }),
    ]);

    expect(validateProject(p).some((candidate) => candidate.id === "dead-cable-run:unlinked:conduit-1")).toBe(false);
  });

  it("still warns when conduit endpoint metadata is stale", () => {
    const p = project([
      cable({
        id: "conduit-1",
        cableId: "conduit",
        pointAttachments: [{ deviceMarkupId: "missing", deviceTag: "PB-MISSING" }],
      }),
    ]);

    expect(validateProject(p).some((candidate) => candidate.id === "dead-cable-run:stale-attachments:conduit-1")).toBe(true);
  });

  it("bulk-clears safe dead cable references", () => {
    const p = project([
      cable({
        id: "run-1",
        pointAttachments: [{ deviceMarkupId: "missing", deviceTag: "CAM-MISSING" }],
      }),
      device({
        id: "cam-1",
        tag: "CAM-01",
        attachedRunEndpoint: { cableMarkupId: "missing-run", endpoint: "A" },
      }),
    ]);
    const issues = validateProject(p);
    const safeIds = safeDeadReferenceIssueIds(issues);

    const result = resolveValidationIssues(p, safeIds);
    const run = result.project.sheets[0].markups.find((m) => m.id === "run-1") as CableMarkup;
    const cam = result.project.sheets[0].markups.find((m) => m.id === "cam-1") as DeviceMarkup;

    expect(safeIds).toHaveLength(2);
    expect(result.resolved).toBe(true);
    expect(run.pointAttachments).toEqual([null]);
    expect(cam.attachedRunEndpoint).toBeUndefined();
  });
});
