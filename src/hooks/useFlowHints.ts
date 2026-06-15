import { useProjectStore } from "../store/projectStore";
import {
  FLOW_HINT_CANVAS_CLASS,
  FLOW_HINT_CLASS,
  type FlowHintTarget,
  isFlowHintActive,
} from "../lib/flowHints";

/** Returns Tailwind classes to illuminate a flow-hint target, or empty string. */
export function useFlowHintClass(target: FlowHintTarget): string {
  const step = useProjectStore((s) => s.flowHintStep);
  const enabled = useProjectStore((s) => s.flowHintsEnabled);
  const paletteOpen = useProjectStore((s) => s.paletteOpen);

  if (!enabled) return "";
  return isFlowHintActive(step, target, { paletteOpen }) ? FLOW_HINT_CLASS : "";
}

/** Canvas overlay uses a dedicated pseudo-element class. */
export function useFlowHintCanvasClass(): string {
  const step = useProjectStore((s) => s.flowHintStep);
  const enabled = useProjectStore((s) => s.flowHintsEnabled);

  if (!enabled) return "";
  return isFlowHintActive(step, "canvas") ? FLOW_HINT_CANVAS_CLASS : "";
}
