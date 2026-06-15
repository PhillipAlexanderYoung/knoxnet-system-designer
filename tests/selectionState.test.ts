// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { useProjectStore } from "../src/store/projectStore";

describe("selection state", () => {
  afterEach(() => {
    useProjectStore.setState({
      project: null,
      activeSheetId: null,
      selectedMarkupIds: [],
      selectedBrand: null,
    });
  });

  it("skips store updates when selection is unchanged", () => {
    const store = useProjectStore.getState();
    store.setSelected(["device-1"]);
    const afterFirst = useProjectStore.getState();

    store.setSelected(["device-1"]);
    expect(useProjectStore.getState()).toBe(afterFirst);
  });

  it("updates selection when ids change", () => {
    const store = useProjectStore.getState();
    store.setSelected(["device-1"]);
    store.setSelected(["device-2"]);
    expect(useProjectStore.getState().selectedMarkupIds).toEqual(["device-2"]);
  });
});
