/**
 * Single source of truth for resolving a device tag's effective font
 * size and the maximum offset distance the user can drag a tag pill
 * away from its device. The editor canvas, the properties panel, and
 * the markup PDF export all read through these so they never disagree.
 */

import { resolveBranding } from "./branding";
import type { DeviceMarkup, Project } from "../store/projectStore";

export const TAG_FONT_MIN = 4;
export const TAG_FONT_MAX = 28;
export const DEFAULT_TAG_FILL = "#0B1220";
export const DEFAULT_TAG_TEXT = "#F5F7FA";

export interface ResolvedTagStyle {
  fillColor: string;
  textColor: string;
  brandTags: boolean;
}

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
    return clampTagFontSize(m.tagFontSize);
  }
  const projectDefault = project?.tagDefaults?.fontSize;
  if (typeof projectDefault === "number" && Number.isFinite(projectDefault)) {
    return clampTagFontSize(projectDefault);
  }
  const size = m.size ?? 28;
  return clampTagFontSize(Math.max(10, size * 0.35));
}

export function clampTagFontSize(fontSize: number): number {
  return Math.max(TAG_FONT_MIN, Math.min(64, fontSize));
}

export function resolveTagStyle(
  project?: Pick<Project, "tagDefaults" | "branding"> | null,
): ResolvedTagStyle {
  const defaults = project?.tagDefaults;
  if (defaults?.brandTags) {
    const fillColor = normalizeHex(resolveBranding(project?.branding).accentColor, DEFAULT_TAG_FILL);
    return {
      fillColor,
      textColor: contrastTextColor(fillColor),
      brandTags: true,
    };
  }

  const fillColor = normalizeHex(defaults?.fillColor, DEFAULT_TAG_FILL);
  return {
    fillColor,
    textColor: normalizeHex(
      defaults?.textColor,
      fillColor.toUpperCase() === DEFAULT_TAG_FILL ? DEFAULT_TAG_TEXT : contrastTextColor(fillColor),
    ),
    brandTags: false,
  };
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

function normalizeHex(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim();
  const full = /^#?[0-9a-fA-F]{6}$/.test(trimmed);
  if (full) return (`#${trimmed.replace("#", "")}`).toUpperCase();
  const short = /^#?[0-9a-fA-F]{3}$/.test(trimmed);
  if (short) {
    const v = trimmed.replace("#", "");
    return `#${v[0]}${v[0]}${v[1]}${v[1]}${v[2]}${v[2]}`.toUpperCase();
  }
  return fallback;
}

function contrastTextColor(fillColor: string): string {
  const v = normalizeHex(fillColor, DEFAULT_TAG_FILL).replace("#", "");
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const linear = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance =
    0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
  return luminance > 0.48 ? DEFAULT_TAG_FILL : DEFAULT_TAG_TEXT;
}
