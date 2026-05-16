export interface CanvasViewport {
  scale: number;
  x: number;
  y: number;
}

export const MIN_CANVAS_SCALE = 0.05;
export const MAX_CANVAS_SCALE = 20;
export const MAX_CANVAS_PAN = 1_000_000;

export const DEFAULT_CANVAS_VIEWPORT: CanvasViewport = {
  scale: 1,
  x: 0,
  y: 0,
};

const STORAGE_PREFIX = "knoxnet:canvasViewport:v1";

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const finiteOr = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function normalizeCanvasViewport(
  viewport: Partial<CanvasViewport> | null | undefined,
  fallback: CanvasViewport = DEFAULT_CANVAS_VIEWPORT,
): CanvasViewport {
  const scale = finiteOr(viewport?.scale, fallback.scale);
  const x = finiteOr(viewport?.x, fallback.x);
  const y = finiteOr(viewport?.y, fallback.y);
  return {
    scale: clamp(scale, MIN_CANVAS_SCALE, MAX_CANVAS_SCALE),
    x: clamp(x, -MAX_CANVAS_PAN, MAX_CANVAS_PAN),
    y: clamp(y, -MAX_CANVAS_PAN, MAX_CANVAS_PAN),
  };
}

function storage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function canvasViewportStorageKey(projectId: string, sheetId: string) {
  return `${STORAGE_PREFIX}:${projectId}:${sheetId}`;
}

export function loadCanvasViewport(
  projectId: string | null | undefined,
  sheetId: string | null | undefined,
): CanvasViewport | null {
  if (!projectId || !sheetId) return null;
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(canvasViewportStorageKey(projectId, sheetId));
    if (!raw) return null;
    return normalizeCanvasViewport(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveCanvasViewport(
  projectId: string | null | undefined,
  sheetId: string | null | undefined,
  viewport: Partial<CanvasViewport> | null | undefined,
) {
  if (!projectId || !sheetId) return;
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      canvasViewportStorageKey(projectId, sheetId),
      JSON.stringify(normalizeCanvasViewport(viewport)),
    );
  } catch {
    // Best-effort UI state only; project saves should never fail because
    // browser storage is unavailable or full.
  }
}
