// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useProjectStore,
  VALIDATION_HIGHLIGHT_TTL_MS,
  type DeviceConnection,
  type DeviceMarkup,
  type Project,
  type Sheet,
} from "../src/store/projectStore";
import { validateProject } from "../src/lib/validation";

const camera = (overrides: Partial<DeviceMarkup> = {}): DeviceMarkup => ({
  id: "cam-1",
  kind: "device",
  layer: "cameras",
  category: "cameras",
  deviceId: "cam-dome",
  x: 10,
  y: 20,
  tag: "CAM-01",
  systemConfig: {
    network: {
      ipAddress: "192.168.1.100",
      hostname: "cam-01",
      macAddress: "AA:BB:CC:DD:EE:01",
    },
    switchPort: "SW-01 Port 1",
  },
  ...overrides,
});

const switchDevice = (): DeviceMarkup => ({
  id: "sw-1",
  kind: "device",
  layer: "network",
  category: "network",
  deviceId: "net-switch-poe",
  x: 200,
  y: 20,
  tag: "SW-01",
  systemConfig: {
    network: { ipAddress: "192.168.1.2", hostname: "sw-01" },
    switchConfig: { portCount: 24 },
  },
});

const sheet = (markups: Sheet["markups"]): Sheet => ({
  id: "sheet-1",
  name: "Plan",
  fileName: "plan.pdf",
  pageWidth: 800,
  pageHeight: 600,
  renderScale: 1,
  markups,
});

const project = (
  markups: Sheet["markups"],
  connections: DeviceConnection[] = [],
): Project => ({
  id: "project-1",
  meta: {
    projectName: "Duplicate Device Test",
    projectNumber: "",
    client: "",
    location: "",
    drawnBy: "",
    date: new Date(0).toISOString(),
    revision: "0",
  },
  sheets: [sheet(markups)],
  racks: [],
  connections,
  bidDefaults: {} as never,
  createdAt: 0,
  updatedAt: 0,
});

function devices(): DeviceMarkup[] {
  return useProjectStore
    .getState()
    .project!.sheets[0].markups.filter((markup): markup is DeviceMarkup => markup.kind === "device");
}

describe("device duplication", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    useProjectStore.getState().clearValidationHighlights();
    useProjectStore.getState().clearIpSchemaFocus();
    useProjectStore.setState({
      project: null,
      activeSheetId: null,
      selectedMarkupIds: [],
      selectedBrand: null,
      ipSchemaFocus: null,
      validationHighlightMarkupIds: [],
      validationIssueMode: false,
    });
    vi.useRealTimers();
  });

  it("assigns unique hostnames and IPs when repeatedly duplicating network devices", () => {
    useProjectStore.getState().loadProject(project([camera()]));
    useProjectStore.getState().setSelected(["cam-1"]);

    for (let i = 0; i < 3; i += 1) {
      const duplicated = useProjectStore.getState().duplicateSelectedMarkups();
      expect(duplicated).toHaveLength(1);
    }

    expect(devices().map((device) => device.tag)).toEqual([
      "CAM-01",
      "CAM-02",
      "CAM-03",
      "CAM-04",
    ]);
    expect(devices().map((device) => device.systemConfig?.network?.hostname)).toEqual([
      "cam-01",
      "cam-02",
      "cam-03",
      "cam-04",
    ]);
    const ips = devices().map((device) => device.systemConfig?.network?.ipAddress);
    expect(new Set(ips).size).toBe(4);
    expect(
      validateProject(useProjectStore.getState().project!).some((issue) =>
        issue.id.startsWith("duplicate-hostname:"),
      ),
    ).toBe(false);
    expect(
      validateProject(useProjectStore.getState().project!).some((issue) =>
        issue.id.startsWith("duplicate-ip:"),
      ),
    ).toBe(false);
  });

  it("does not copy MAC or switch-port text onto the duplicate", () => {
    useProjectStore.getState().loadProject(project([camera()]));
    useProjectStore.getState().setSelected(["cam-1"]);
    useProjectStore.getState().duplicateSelectedMarkups();

    const clone = devices().find((device) => device.tag === "CAM-02");
    expect(clone?.systemConfig?.network?.macAddress).toBeUndefined();
    expect(clone?.systemConfig?.switchPort).toBeUndefined();
  });

  it("auto-clears validation highlights after the TTL", () => {
    useProjectStore.getState().loadProject(project([camera(), camera({ id: "cam-2", tag: "CAM-02" })]));
    useProjectStore.getState().setValidationHighlights(["cam-1", "cam-2"]);
    useProjectStore.getState().setValidationIssueMode(true);

    expect(useProjectStore.getState().validationHighlightMarkupIds).toEqual(["cam-1", "cam-2"]);
    vi.advanceTimersByTime(VALIDATION_HIGHLIGHT_TTL_MS);
    expect(useProjectStore.getState().validationHighlightMarkupIds).toEqual([]);
    expect(useProjectStore.getState().validationIssueMode).toBe(false);
  });

  it("opens the switch IP schema for hostname conflicts via Review IPs", () => {
    const camA = camera();
    const camB = camera({
      id: "cam-2",
      tag: "CAM-02",
      x: 40,
      systemConfig: {
        network: {
          ipAddress: "192.168.1.101",
          hostname: "cam-01", // intentional conflict
        },
      },
    });
    const sw = switchDevice();
    const connections: DeviceConnection[] = [
      {
        id: "c1",
        fromTag: "CAM-01",
        fromPortId: "eth0",
        toTag: "SW-01",
        toPortId: "port-1",
        medium: "cat6",
      },
      {
        id: "c2",
        fromTag: "CAM-02",
        fromPortId: "eth0",
        toTag: "SW-01",
        toPortId: "port-2",
        medium: "cat6",
      },
    ];
    useProjectStore.getState().loadProject(project([camA, camB, sw], connections));

    const issues = validateProject(useProjectStore.getState().project!);
    const hostnameIssue = issues.find((issue) => issue.id.startsWith("duplicate-hostname:"));
    expect(hostnameIssue).toBeTruthy();
    expect(hostnameIssue!.details?.some((d) => d.includes("IP 192.168.1.100"))).toBe(true);
    expect(hostnameIssue!.details?.some((d) => d.includes("IP 192.168.1.101"))).toBe(true);

    const opened = useProjectStore
      .getState()
      .reviewNetworkConflictsInIpSchema(hostnameIssue!.affected.deviceIds);
    expect(opened).toBe(true);
    expect(useProjectStore.getState().selectedMarkupIds).toEqual(["sw-1"]);
    expect(useProjectStore.getState().ipSchemaFocus).toMatchObject({
      switchId: "sw-1",
      deviceIds: expect.arrayContaining(["cam-1", "cam-2"]),
    });
  });
});
