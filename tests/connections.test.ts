// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  connectionFromLabel,
  connectionToLabel,
  effectivePortsForTag,
  findDeviceByTag,
  findPort,
} from "../src/lib/connections";
import { devicesById, effectiveDevicePorts } from "../src/data/devices";
import type { DeviceMarkup, Project } from "../src/store/projectStore";

function makeProject(devices: Array<Pick<DeviceMarkup, "tag" | "deviceId" | "category">>): Project {
  return {
    id: "p",
    meta: {
      projectName: "test",
      projectNumber: "",
      client: "",
      location: "",
      drawnBy: "",
      date: new Date(0).toISOString(),
      revision: "0",
    },
    sheets: [
      {
        id: "s",
        name: "test",
        fileName: "",
        pageWidth: 100,
        pageHeight: 100,
        renderScale: 1,
        markups: devices.map((d, i) => ({
          id: `m${i}`,
          kind: "device" as const,
          deviceId: d.deviceId,
          category: d.category,
          x: 0,
          y: 0,
          tag: d.tag,
          layer: "cameras",
        })),
      },
    ],
    racks: [],
    bidDefaults: {} as never,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("port inference defaults", () => {
  it("seeds cameras with ETH 0 PoE-in", () => {
    const cam = devicesById["cam-dome"];
    expect(cam.ports).toBeDefined();
    expect(cam.ports?.[0].kind).toBe("ethernet");
    expect(cam.ports?.[0].poe).toBe("in");
  });

  it("effectiveDevicePorts prefers instance overrides", () => {
    const override = [
      { id: "custom", label: "Custom", kind: "other" as const },
    ];
    const got = effectiveDevicePorts("cam-dome", override);
    expect(got).toBe(override);
  });

  it("effectiveDevicePorts falls back to catalog ports", () => {
    const got = effectiveDevicePorts("cam-dome", undefined);
    expect(got).toBeDefined();
    expect(got?.[0].id).toBe("eth0");
  });

  it("returns undefined for unknown device ids", () => {
    expect(effectiveDevicePorts("not-a-real-device", undefined)).toBeUndefined();
  });
});

describe("connection helpers", () => {
  const project = makeProject([
    { tag: "CAM-01", deviceId: "cam-dome", category: "cameras" },
  ]);

  it("findDeviceByTag finds placed devices", () => {
    expect(findDeviceByTag(project, "CAM-01")?.tag).toBe("CAM-01");
    expect(findDeviceByTag(project, "MISSING")).toBeUndefined();
  });

  it("effectivePortsForTag resolves through the device type", () => {
    const ports = effectivePortsForTag(project, "CAM-01");
    expect(ports?.[0].id).toBe("eth0");
  });

  it("findPort returns undefined for missing port id", () => {
    expect(findPort(undefined, "x")).toBeUndefined();
    expect(findPort([], undefined)).toBeUndefined();
  });

  it("connectionFromLabel prefers structured id when present", () => {
    const label = connectionFromLabel(
      {
        id: "c1",
        fromTag: "CAM-01",
        fromPortId: "eth0",
        fromPort: "old text",
        toTag: "SW-01",
      },
      project,
    );
    expect(label).toContain("ETH 0");
  });

  it("connectionFromLabel falls back to free text when structured lookup misses", () => {
    const label = connectionFromLabel(
      {
        id: "c2",
        fromTag: "CAM-01",
        fromPort: "RJ45 #1",
        toTag: "SW-01",
      },
      project,
    );
    expect(label).toBe("RJ45 #1");
  });

  it("connectionToLabel returns empty string when nothing is set", () => {
    const label = connectionToLabel(
      { id: "c3", fromTag: "CAM-01", toTag: "SW-01" },
      project,
    );
    expect(label).toBe("");
  });
});
