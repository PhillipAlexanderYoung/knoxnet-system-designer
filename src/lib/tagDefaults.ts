/**
 * Single source of truth for resolving a device tag's effective font
 * size and the maximum offset distance the user can drag a tag pill
 * away from its device. The editor canvas, the properties panel, and
 * the markup PDF export all read through these so they never disagree.
 */

import type { DeviceMarkup, Project } from "../store/projectStore";

/**
 * Resolve the effective tag font size for a device:
 *   1. Per-device override (`m.tagFontSize`) wins.
 *   2. Project-wide default (`project.tagDefaults.fontSize`).
 *   3. Auto: scale with the icon size, floor at 10pt.
 */
export function resolveTagFontSize(
  m: DeviceMarkup,
  project?: Pick<Project, "tagDefaults"> | null,
): number {
  if (typeof m.tagFontSize === "number" && Number.isFinite(m.tagFontSize)) {
    return m.tagFontSize;
  }
  const projectDefault = project?.tagDefaults?.fontSize;
  if (typeof projectDefault === "number" && Number.isFinite(projectDefault)) {
    return projectDefault;
  }
  const size = m.size ?? 28;
  return Math.max(10, size * 0.35);
}

/**
 * Maximum distance (in PDF user units) that a tag pill is allowed to
 * sit from its device center. Scales with icon size so big devices
 * can have correspondingly farther tags, but never below the 200pt
 * floor — that's roughly two thumb-widths on a typical sheet and
 * reads as "still attached" at any reasonable zoom level.
 */
export function maxTagOffsetDistance(deviceSize: number): number {
  return Math.max(200, deviceSize * 4);
}

/**
 * Clamp a (dx, dy) offset to `maxTagOffsetDistance` while preserving
 * the direction. Returns the original offset when already in range.
 */
export function clampTagOffset(
  dx: number,
  dy: number,
  deviceSize: number,
): { dx: number; dy: number } {
  const max = maxTagOffsetDistance(deviceSize);
  const dist = Math.hypot(dx, dy);
  if (dist <= max || dist === 0) return { dx, dy };
  const k = max / dist;
  return { dx: dx * k, dy: dy * k };
}
