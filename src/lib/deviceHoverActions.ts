/** Desktop hover settings-gear geometry (Konva / PDF user units). */

export const DEVICE_HOVER_ACTION_SIZE = 7;
/** Delay before clearing hover so the pointer can reach the overlay gear. */
export const DEVICE_HOVER_CLEAR_MS = 160;

export type DeviceHoverActionPlacement = "icon" | "bubble";

/**
 * Tuck the gear into the north-east rim of the device disc/bubble so it
 * sits on the device edge rather than floating away from it.
 */
export function deviceHoverActionPosition(
  anchorX: number,
  anchorY: number,
  radius: number,
): { x: number; y: number } {
  const size = DEVICE_HOVER_ACTION_SIZE;
  return {
    x: anchorX + radius - size * 0.7,
    y: anchorY - radius - size * 0.3,
  };
}

/**
 * Invisible bridge in gear-local coords covering the short path back onto
 * the device so hover doesn't drop mid-travel.
 */
export function deviceHoverActionBridge(): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const size = DEVICE_HOVER_ACTION_SIZE;
  return {
    x: -size * 0.4,
    y: size * 0.15,
    width: size * 1.25,
    height: size * 1.2,
  };
}
