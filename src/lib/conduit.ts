import type { CableMarkup } from "../store/projectStore";
import { cablesById } from "../data/cables";
import { runCountFor } from "./cableRuns";
import { fiberDisplayLabel } from "./fiber";

export const DEFAULT_CONDUIT_TYPE = "EMT";
export const DEFAULT_CONDUIT_SIZE = "1\"";

export const CONDUIT_TYPES = [
  "EMT",
  "Rigid Steel / RMC",
  "Aluminum Rigid",
  "IMC",
  "PVC Schedule 40",
  "PVC Schedule 80",
  "Flexible Metal Conduit / FMC",
  "Liquid-Tight Flexible Metal Conduit / LFMC",
  "ENT / Smurf Tube",
] as const;

export const CONDUIT_SIZES = [
  "1/2\"",
  "3/4\"",
  "1\"",
  "1-1/4\"",
  "1-1/2\"",
  "2\"",
  "2-1/2\"",
  "3\"",
  "4\"",
] as const;

export function normalizeConduitValue(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

export function conduitTypeFor(markup: Pick<CableMarkup, "conduitType">) {
  return normalizeConduitValue(markup.conduitType, DEFAULT_CONDUIT_TYPE);
}

export function conduitSizeFor(markup: Pick<CableMarkup, "conduitSize">) {
  return normalizeConduitValue(markup.conduitSize, DEFAULT_CONDUIT_SIZE);
}

export function conduitLabelFor(markup: Pick<CableMarkup, "conduitType" | "conduitSize">) {
  return `${conduitTypeFor(markup)} ${conduitSizeFor(markup)}`;
}

export function conduitTypeAbbreviation(type: string | undefined) {
  const normalized = conduitTypeFor({ conduitType: type });
  switch (normalized) {
    case "Rigid Steel / RMC":
      return "RMC";
    case "Aluminum Rigid":
      return "AL RMC";
    case "PVC Schedule 40":
      return "PVC40";
    case "PVC Schedule 80":
      return "PVC80";
    case "Flexible Metal Conduit / FMC":
      return "FMC";
    case "Liquid-Tight Flexible Metal Conduit / LFMC":
      return "LFMC";
    case "ENT / Smurf Tube":
      return "ENT";
    default:
      return normalized;
  }
}

export function compactConduitLabel(
  markup: Pick<CableMarkup, "conduitType" | "conduitSize">,
) {
  return `${conduitTypeAbbreviation(markup.conduitType)} ${conduitSizeFor(markup)}`;
}

export function cableDisplayLabel(
  cableId: string,
  catalogLabel: string,
  markup?: Pick<CableMarkup, "conduitType" | "conduitSize" | "fiberStrandCount">,
) {
  if (cableId === "conduit" && markup) return conduitLabelFor(markup);
  return fiberDisplayLabel(cableId, catalogLabel, markup);
}

export interface ConduitFillResult {
  conduitAreaSqIn: number;
  cableAreaSqIn: number;
  fillPercent: number;
  cableCount: number;
  knownCableCount: number;
  unknownCableIds: string[];
  label: string;
}

const CONDUIT_INTERNAL_DIAMETER_IN: Record<string, number> = {
  '1/2"': 0.622,
  '3/4"': 0.824,
  '1"': 1.049,
  '1-1/4"': 1.38,
  '1-1/2"': 1.61,
  '2"': 2.067,
  '2-1/2"': 2.469,
  '3"': 3.068,
  '4"': 4.026,
};

function circleArea(diameterIn: number) {
  const r = diameterIn / 2;
  return Math.PI * r * r;
}

export function cableOutsideDiameterIn(cableId: string): number | null {
  const value = cablesById[cableId]?.outsideDiameterIn;
  return typeof value === "number" && value > 0 ? value : null;
}

export function approximateConduitFill(
  conduit: Pick<CableMarkup, "conduitSize" | "runCount">,
  carriedCables: Array<Pick<CableMarkup, "cableId" | "runCount">>,
): ConduitFillResult | null {
  const internalDiameter = CONDUIT_INTERNAL_DIAMETER_IN[conduitSizeFor(conduit)];
  if (!internalDiameter) return null;

  const conduitAreaSqIn = circleArea(internalDiameter) * runCountFor(conduit);
  let cableAreaSqIn = 0;
  let cableCount = 0;
  let knownCableCount = 0;
  const unknownCableIds = new Set<string>();

  for (const cable of carriedCables) {
    if (cable.cableId === "conduit") continue;
    const count = runCountFor(cable);
    cableCount += count;
    const od = cableOutsideDiameterIn(cable.cableId);
    if (!od) {
      unknownCableIds.add(cable.cableId);
      continue;
    }
    knownCableCount += count;
    cableAreaSqIn += circleArea(od) * count;
  }

  const fillPercent =
    conduitAreaSqIn > 0 ? (cableAreaSqIn / conduitAreaSqIn) * 100 : 0;
  return {
    conduitAreaSqIn,
    cableAreaSqIn,
    fillPercent,
    cableCount,
    knownCableCount,
    unknownCableIds: Array.from(unknownCableIds),
    label: `Approx. ${fillPercent.toFixed(1)}% fill`,
  };
}
