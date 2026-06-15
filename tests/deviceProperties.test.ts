// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { useProjectStore } from "../src/store/projectStore";
import { shouldOpenDeviceProperties } from "../src/lib/deviceProperties";
import type { DeviceMarkup } from "../src/store/projectStore";

const deviceMarkup = {
  id: "dev-1",
  kind: "device",
  deviceId: "cam-dome",
  tag: "CAM-1",
  x: 10,
  y: 20,
} as DeviceMarkup;

describe("shouldOpenDeviceProperties", () => {
  it("allows device double-open in select mode", () => {
    expect(shouldOpenDeviceProperties(deviceMarkup, "select", false)).toBe(true);
  });

  it("blocks cable-run placement mode", () => {
    expect(shouldOpenDeviceProperties(deviceMarkup, "cable", false)).toBe(false);
  });

  it("blocks freehand eraser sub-mode", () => {
    expect(shouldOpenDeviceProperties(deviceMarkup, "freehand", true)).toBe(false);
  });

  it("ignores non-device markups", () => {
    expect(
      shouldOpenDeviceProperties(
        { id: "t1", kind: "text", text: "hi", x: 0, y: 0, fontSize: 12, color: "#fff" },
        "select",
        false,
      ),
    ).toBe(false);
  });
});

describe("requestPropertiesPanelFocus", () => {
  afterEach(() => {
    useProjectStore.setState({ propertiesPanelFocusRequest: 0 });
  });

  it("increments the focus request counter", () => {
    const store = useProjectStore.getState();
    expect(store.propertiesPanelFocusRequest).toBe(0);
    store.requestPropertiesPanelFocus();
    expect(useProjectStore.getState().propertiesPanelFocusRequest).toBe(1);
    store.requestPropertiesPanelFocus();
    expect(useProjectStore.getState().propertiesPanelFocusRequest).toBe(2);
  });
});
