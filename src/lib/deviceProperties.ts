import type { Markup, ToolId } from "../store/projectStore";

/** Whether double-tap/click on a markup should open the Properties panel. */
export function shouldOpenDeviceProperties(
  markup: Markup,
  activeTool: ToolId,
  freehandErasing: boolean,
): boolean {
  if (markup.kind !== "device") return false;
  if (activeTool === "cable") return false;
  if (activeTool === "freehand" && freehandErasing) return false;
  return true;
}
