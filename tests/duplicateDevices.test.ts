// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import {
  useProjectStore,
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
    },
  },
  ...overrides,
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

const project = (markups: Sheet["markups"]): Project => ({
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
  afterEach(() => {
    useProjectStore.setState({
      project: null,
      activeSheetId: null,
      selectedMarkupIds: [],
      selectedBrand: null,
    });
  });

  it("assigns unique hostnames when repeatedly duplicating network devices", () => {
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
    expect(
      validateProject(useProjectStore.getState().project!).some(
        (issue) => issue.id === "duplicate-hostname:cam-01",
      ),
    ).toBe(false);
  });
});
