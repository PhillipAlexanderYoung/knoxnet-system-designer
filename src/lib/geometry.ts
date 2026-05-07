// Pure geometry & measurement helpers shared by tools, overlay, and bid engine.

import type { Calibration } from "../store/projectStore";

export function distancePts(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function polylineLengthPts(points: number[]) {
  let total = 0;
  for (let i = 2; i < points.length; i += 2) {
    const dx = points[i] - points[i - 2];
    const dy = points[i + 1] - points[i - 1];
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

export function ptsToFeet(pts: number, c: Calibration | undefined) {
  if (!c || !c.pixelsPerFoot) return null;
  return pts / c.pixelsPerFoot;
}

export function formatFeet(feet: number | null, precision = 1): string {
  if (feet === null || !isFinite(feet)) return "—";
  if (Math.abs(feet) < 1) {
    const inches = feet * 12;
    return `${inches.toFixed(0)}"`;
  }
  const whole = Math.floor(feet);
  const inches = Math.round((feet - whole) * 12);
  if (precision === 0 || inches === 0) return `${whole}'`;
  if (inches === 12) return `${whole + 1}'`;
  return `${whole}'-${inches}"`;
}

export function formatFeetDecimal(feet: number | null, precision = 1) {
  if (feet === null || !isFinite(feet)) return "—";
  return `${feet.toFixed(precision)}'`;
}

export function applySlack(feet: number, slackPercent: number) {
  return feet * (1 + slackPercent / 100);
}

/** Snap angle to nearest 90° */
export function orthoSnap(
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) {
    return { x: to.x, y: from.y };
  }
  return { x: from.x, y: to.y };
}

/** Compute a "revision cloud" path (scalloped rectangle) */
export function cloudPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(w, h) / 14 + 4;
  const cmds: string[] = [];
  cmds.push(`M ${x} ${y + r}`);
  // top
  for (let cx = x + r; cx < x + w; cx += r * 2) {
    cmds.push(`A ${r} ${r} 0 0 1 ${Math.min(cx + r * 2, x + w)} ${y + r}`);
  }
  // right
  for (let cy = y + r; cy < y + h; cy += r * 2) {
    cmds.push(`A ${r} ${r} 0 0 1 ${x + w - r} ${Math.min(cy + r * 2, y + h)}`);
  }
  // bottom
  for (let cx = x + w - r; cx > x; cx -= r * 2) {
    cmds.push(`A ${r} ${r} 0 0 1 ${Math.max(cx - r * 2, x)} ${y + h - r}`);
  }
  // left
  for (let cy = y + h - r; cy > y; cy -= r * 2) {
    cmds.push(`A ${r} ${r} 0 0 1 ${x + r} ${Math.max(cy - r * 2, y)}`);
  }
  cmds.push("Z");
  return cmds.join(" ");
}
