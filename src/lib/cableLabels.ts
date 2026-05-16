import type { CableMarkup, Project } from "../store/projectStore";
import { isFiberCableId } from "./fiber";

export interface CableLabelScheme {
  cablePrefix?: string;
  fiberPrefix?: string;
  conduitPrefix?: string;
  minDigits?: number;
  separator?: string;
}

export const DEFAULT_CABLE_LABEL_SCHEME: Required<CableLabelScheme> = {
  cablePrefix: "C",
  fiberPrefix: "F",
  conduitPrefix: "CN",
  minDigits: 3,
  separator: "-",
};

export function resolveCableLabelScheme(
  scheme: CableLabelScheme | undefined,
): Required<CableLabelScheme> {
  const defaults = DEFAULT_CABLE_LABEL_SCHEME;
  return {
    cablePrefix: cleanPrefix(scheme?.cablePrefix) || defaults.cablePrefix,
    fiberPrefix: cleanPrefix(scheme?.fiberPrefix) || defaults.fiberPrefix,
    conduitPrefix: cleanPrefix(scheme?.conduitPrefix) || defaults.conduitPrefix,
    minDigits: Math.max(1, Math.min(8, Math.floor(scheme?.minDigits ?? defaults.minDigits))),
    separator: scheme?.separator ?? defaults.separator,
  };
}

export function cableLabelPrefixFor(
  cableId: string,
  scheme: CableLabelScheme | undefined,
): string {
  const resolved = resolveCableLabelScheme(scheme);
  if (cableId === "conduit") return resolved.conduitPrefix;
  if (isFiberCableId(cableId)) return resolved.fiberPrefix;
  return resolved.cablePrefix;
}

export function normalizeIdentifier(value: string | undefined): string {
  return value?.trim().replace(/\s+/g, " ").toUpperCase() ?? "";
}

export function generateCablePhysicalLabel(
  cableId: string,
  existingLabels: Iterable<string>,
  scheme: CableLabelScheme | undefined,
): string {
  const resolved = resolveCableLabelScheme(scheme);
  const prefix = cableLabelPrefixFor(cableId, resolved);
  const used = new Set(Array.from(existingLabels, normalizeIdentifier).filter(Boolean));
  const matcher = new RegExp(
    `^${escapeRegExp(prefix)}${escapeRegExp(resolved.separator)}?(\\d+)$`,
    "i",
  );
  let next = 1;
  for (const label of used) {
    const match = label.match(matcher);
    if (!match) continue;
    next = Math.max(next, Number(match[1]) + 1);
  }

  let candidate = formatCablePhysicalLabel(prefix, next, resolved);
  while (used.has(normalizeIdentifier(candidate))) {
    next += 1;
    candidate = formatCablePhysicalLabel(prefix, next, resolved);
  }
  return candidate;
}

export function assignGeneratedCableLabels(
  markups: CableMarkup[],
  project: Project,
): CableMarkup[] {
  const scheme = project.cableLabelScheme;
  const used = new Set(
    allCableMarkups(project)
      .map((m) => normalizeIdentifier(m.physicalLabel))
      .filter(Boolean),
  );
  return markups.map((markup) => {
    const label = markup.physicalLabel?.trim();
    if (label) {
      used.add(normalizeIdentifier(label));
      return markup;
    }
    const physicalLabel = generateCablePhysicalLabel(markup.cableId, used, scheme);
    used.add(normalizeIdentifier(physicalLabel));
    return { ...markup, physicalLabel };
  });
}

export function generatedCableLabelsForProject(project: Project): Map<string, string> {
  const labels = new Map<string, string>();
  const used = new Set(
    allCableMarkups(project)
      .map((m) => normalizeIdentifier(m.physicalLabel))
      .filter(Boolean),
  );
  for (const markup of allCableMarkups(project)) {
    const existing = markup.physicalLabel?.trim();
    if (existing) {
      labels.set(markup.id, existing);
      continue;
    }
    const generated = generateCablePhysicalLabel(markup.cableId, used, project.cableLabelScheme);
    used.add(normalizeIdentifier(generated));
    labels.set(markup.id, generated);
  }
  return labels;
}

export function projectWithGeneratedCableLabels(project: Project): Project {
  const generated = generatedCableLabelsForProject(project);
  let changed = false;
  const sheets = project.sheets.map((sheet) => {
    let sheetChanged = false;
    const markups = sheet.markups.map((markup) => {
      if (markup.kind !== "cable" || markup.physicalLabel?.trim()) return markup;
      const physicalLabel = generated.get(markup.id);
      if (!physicalLabel) return markup;
      sheetChanged = true;
      changed = true;
      return { ...markup, physicalLabel };
    });
    return sheetChanged ? { ...sheet, markups } : sheet;
  });
  return changed ? { ...project, sheets } : project;
}

function allCableMarkups(project: Project): CableMarkup[] {
  return project.sheets.flatMap((sheet) =>
    sheet.markups.filter((m): m is CableMarkup => m.kind === "cable"),
  );
}

function formatCablePhysicalLabel(
  prefix: string,
  sequence: number,
  scheme: Required<CableLabelScheme>,
): string {
  return `${prefix}${scheme.separator}${String(sequence).padStart(scheme.minDigits, "0")}`;
}

function cleanPrefix(value: string | undefined): string {
  return value?.trim().toUpperCase().replace(/\s+/g, "") ?? "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
