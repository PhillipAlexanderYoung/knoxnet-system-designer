import { cablesById } from "../data/cables";
import type { CableMarkup } from "../store/projectStore";

export const DEFAULT_FIBER_STRAND_COUNT = 12;

type FiberCountMarkup = Pick<CableMarkup, "fiberStrandCount">;

export function isFiberCableId(cableId: string | null | undefined): boolean {
  return !!cableId && typeof cablesById[cableId]?.defaultStrandCount === "number";
}

export function normalizeFiberStrandCount(
  value: unknown,
  fallback = DEFAULT_FIBER_STRAND_COUNT,
): number {
  const normalizedFallback = Math.max(1, Math.floor(Number(fallback) || 1));
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : normalizedFallback;
}

export function fiberStrandCountFor(
  markup: FiberCountMarkup | undefined,
  cableId: string,
): number | undefined {
  const catalogDefault = cablesById[cableId]?.defaultStrandCount;
  if (typeof catalogDefault !== "number") return undefined;
  return normalizeFiberStrandCount(markup?.fiberStrandCount, catalogDefault);
}

export function fiberDisplayLabel(
  cableId: string,
  catalogLabel: string,
  markup?: FiberCountMarkup,
) {
  const count = fiberStrandCountFor(markup, cableId);
  if (!count) return catalogLabel;
  const strandText = `(${count}-strand)`;
  return /\(\d+-strand\)/.test(catalogLabel)
    ? catalogLabel.replace(/\(\d+-strand\)/, strandText)
    : `${catalogLabel} ${strandText}`;
}

export function fiberCompactLabel(
  cableId: string,
  shortCode: string,
  markup?: FiberCountMarkup,
) {
  const count = fiberStrandCountFor(markup, cableId);
  return count ? `${shortCode} ${count}F` : shortCode;
}
