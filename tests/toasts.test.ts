// @vitest-environment node
import { describe, expect, it } from "vitest";
import { enqueueToast, toastDurationMs, type Toast } from "../src/lib/toasts";

const ids = () => {
  let next = 0;
  return () => `toast-${++next}`;
};

describe("toast queue policy", () => {
  it("coalesces repeated identical messages", () => {
    const makeId = ids();
    let toasts: Toast[] = [];

    toasts = enqueueToast(toasts, "error", "Pick a different Cable Run point", 1000, makeId);
    toasts = enqueueToast(toasts, "error", "Pick a different Cable Run point", 1200, makeId);
    toasts = enqueueToast(toasts, "error", "Pick a different Cable Run point", 1400, makeId);

    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({
      id: "toast-1",
      kind: "info",
      message: "Pick a different Cable Run point",
      count: 3,
    });
  });

  it("deduplicates active long-lived errors beyond the base throttle window", () => {
    const makeId = ids();
    let toasts: Toast[] = [];

    toasts = enqueueToast(toasts, "error", "Export failed", 1000, makeId);
    toasts = enqueueToast(toasts, "error", "Export failed", 4500, makeId);

    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toMatchObject({ kind: "error", message: "Export failed", count: 2 });
  });

  it("limits visible toasts while keeping important errors", () => {
    const makeId = ids();
    let toasts: Toast[] = [];

    toasts = enqueueToast(toasts, "info", "One", 1000, makeId);
    toasts = enqueueToast(toasts, "info", "Two", 1100, makeId);
    toasts = enqueueToast(toasts, "success", "Saved", 1200, makeId);
    toasts = enqueueToast(toasts, "error", "Export failed", 1300, makeId);

    expect(toasts.map((toast) => toast.message)).toEqual(["Two", "Saved", "Export failed"]);
  });

  it("keeps lightweight tool guidance short lived", () => {
    expect(toastDurationMs("error", "Pick a different Cable Run endpoint")).toBe(1500);
    expect(toastDurationMs("error", "Export failed")).toBeGreaterThan(1500);
  });
});
