/** Matches touch-first devices (phones/tablets). Same query as Editor pan logic. */
export const COARSE_POINTER_MEDIA = "(hover: none) and (pointer: coarse)";

/** Multiplier for canvas control hit targets on coarse pointers. */
export const TOUCH_CONTROL_SCALE = 2;

export function isCoarsePointer(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.(COARSE_POINTER_MEDIA)?.matches === true
  );
}

export function touchControlScale(): number {
  return isCoarsePointer() ? TOUCH_CONTROL_SCALE : 1;
}

export function scaleForTouch(base: number, scale = touchControlScale()): number {
  return base * scale;
}
