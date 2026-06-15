import type { Project, Sheet, ToolId } from "../store/projectStore";

export type FlowHintStep =
  | "scale"
  | "device"
  | "library"
  | "place"
  | "cable"
  | "done";

export type FlowHintTarget =
  | "tool-calibrate"
  | "tool-device"
  | "tool-cable"
  | "library"
  | "canvas";

export type FlowHintEvent =
  | { type: "sheet_added"; needsCalibration: boolean }
  | { type: "calibration_set"; stillNeedsCalibration: boolean }
  | { type: "tool_selected"; tool: ToolId }
  | { type: "device_selected" }
  | { type: "device_placed" };

export const FLOW_HINTS_DONE_KEY = "knoxnet-system-designer:flow-hints-done";

/** Subtle amber pulse — matches toolbar lock hint and panel accents. */
export const FLOW_HINT_CLASS =
  "ring-2 ring-amber-knox/55 shadow-glow animate-pulse-glow";

export const FLOW_HINT_CANVAS_CLASS = "flow-hint-canvas";

export function isFlowHintsGloballyDone(): boolean {
  try {
    return localStorage.getItem(FLOW_HINTS_DONE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markFlowHintsGloballyDone(): void {
  try {
    localStorage.setItem(FLOW_HINTS_DONE_KEY, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function sheetNeedsCalibration(sheet: Sheet): boolean {
  if (sheet.calibration) return false;
  const kind = sheet.source?.kind;
  return kind === "dxf" || kind === "raster";
}

export function projectHasDevices(project: Project): boolean {
  return project.sheets.some((sh) =>
    sh.markups.some((m) => m.kind === "device"),
  );
}

export function projectNeedsCalibration(project: Project): boolean {
  return project.sheets.some(sheetNeedsCalibration);
}

export function flowHintTargets(
  step: FlowHintStep | null,
  opts?: { paletteOpen?: boolean },
): FlowHintTarget[] {
  if (!step || step === "done") return [];
  switch (step) {
    case "scale":
      return ["tool-calibrate"];
    case "device":
      return ["tool-device"];
    case "library":
      return opts?.paletteOpen ? ["library"] : ["tool-device", "library"];
    case "place":
      return ["canvas"];
    case "cable":
      return ["tool-cable"];
    default:
      return [];
  }
}

export function flowHintTarget(
  step: FlowHintStep | null,
  opts?: { paletteOpen?: boolean },
): FlowHintTarget | null {
  return flowHintTargets(step, opts)[0] ?? null;
}

export function isFlowHintActive(
  step: FlowHintStep | null,
  target: FlowHintTarget,
  opts?: { paletteOpen?: boolean },
): boolean {
  return flowHintTargets(step, opts).includes(target);
}

export function reduceFlowHint(
  enabled: boolean,
  step: FlowHintStep | null,
  event: FlowHintEvent,
): {
  step: FlowHintStep | null;
  enabled: boolean;
  markGlobalDone?: boolean;
} {
  if (!enabled || isFlowHintsGloballyDone()) {
    return { step: "done", enabled: false };
  }

  switch (event.type) {
    case "sheet_added": {
      if (step === "done") return { step, enabled };
      if (event.needsCalibration) return { step: "scale", enabled };
      if (step === null) return { step: "device", enabled };
      return { step, enabled };
    }
    case "calibration_set": {
      if (step !== "scale") return { step, enabled };
      if (event.stillNeedsCalibration) return { step: "scale", enabled };
      return { step: "device", enabled };
    }
    case "tool_selected": {
      if (step === "device" && event.tool === "device") {
        return { step: "library", enabled };
      }
      if (step === "cable" && event.tool === "cable") {
        return { step: "done", enabled: false, markGlobalDone: true };
      }
      return { step, enabled };
    }
    case "device_selected": {
      if (step === "library" || step === "device") {
        return { step: "place", enabled };
      }
      return { step, enabled };
    }
    case "device_placed": {
      if (step === "place" || step === "library" || step === "device") {
        return { step: "cable", enabled };
      }
      return { step, enabled };
    }
    default:
      return { step, enabled };
  }
}
