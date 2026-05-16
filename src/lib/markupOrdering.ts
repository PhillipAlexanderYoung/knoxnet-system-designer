import {
  DEFAULT_LAYERS,
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
      const aLayer = topIndex.get(a.markup.layer) ?? fallbackIndex;
      const bLayer = topIndex.get(b.markup.layer) ?? fallbackIndex;
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

function kindPriority(markup: Markup): number {
  if (markup.kind === "cable") return 0;
  if (markup.kind === "device") return 2;
  return 1;
}
