import {
  DEFAULT_LAYERS,
  effectiveMarkupLayerId,
  normalizeLayers,
  type Layer,
  type Markup,
} from "../store/projectStore";

/**
 * The layer editor presents layers top-to-bottom. Konva/pdf-lib draw in
 * call order, so lower layers must be emitted first.
 */
export function sortMarkupsForRender(
  markups: Markup[],
  layers: Layer[] | undefined = DEFAULT_LAYERS,
): Markup[] {
  const normalizedLayers = normalizeLayers(layers);
  const topIndex = new Map(normalizedLayers.map((layer, index) => [layer.id, index]));
  const fallbackIndex = normalizedLayers.length;

  return markups
    .map((markup, insertionIndex) => ({ markup, insertionIndex }))
    .sort((a, b) => {
      const aLayer = topIndex.get(effectiveMarkupLayerId(a.markup)) ?? fallbackIndex;
      const bLayer = topIndex.get(effectiveMarkupLayerId(b.markup)) ?? fallbackIndex;
      if (aLayer !== bLayer) return bLayer - aLayer;

      const aKind = kindPriority(a.markup);
      const bKind = kindPriority(b.markup);
      if (aKind !== bKind) return aKind - bKind;

      return a.insertionIndex - b.insertionIndex;
    })
    .map(({ markup }) => markup);
}

export function sortDeviceTagsForRender(
  markups: Markup[],
  layers: Layer[] | undefined = DEFAULT_LAYERS,
): Extract<Markup, { kind: "device" }>[] {
  return sortMarkupsForRender(markups, layers).filter(
    (markup): markup is Extract<Markup, { kind: "device" }> =>
      markup.kind === "device",
  );
}

export function partitionValidationHighlightOverlay(
  markups: Markup[],
  highlightedIds: Set<string>,
): { baseMarkups: Markup[]; overlayMarkups: Extract<Markup, { kind: "cable" }>[] } {
  const baseMarkups: Markup[] = [];
  const overlayMarkups: Extract<Markup, { kind: "cable" }>[] = [];

  for (const markup of markups) {
    if (markup.kind === "cable" && highlightedIds.has(markup.id)) {
      overlayMarkups.push(markup);
    } else {
      baseMarkups.push(markup);
    }
  }

  return { baseMarkups, overlayMarkups };
}

function kindPriority(markup: Markup): number {
  if (markup.kind === "cable") return 0;
  if (markup.kind === "device") return 2;
  return 1;
}
