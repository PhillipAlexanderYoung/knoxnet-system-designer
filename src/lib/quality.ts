// Maps the user-facing quality mode + current zoom level into concrete
// render parameters. Centralized so the UI toggle has a single, predictable
// effect across thumbnails, background renders, and ingest concurrency.

import type { QualityMode } from "../store/projectStore";

export interface QualityProfile {
  /** Render DPI scale at 1.0 zoom */
  baseScale: number;
  /** Maximum DPI scale we'll re-render up to as the user zooms in */
  maxScale: number;
  /** PDFs to ingest in parallel (1 = strictly serial, safest for CPU) */
  ingestConcurrency: number;
  /** Thumbnail render DPI multiplier (smaller = faster but blurrier) */
  thumbScaleMultiplier: number;
  /** Min ms between zoom-triggered upscale re-renders */
  rerenderDebounceMs: number;
  /** Idle ms after which an inactive sheet's rendered canvas is freed */
  evictAfterMs: number;
  /** Human label */
  label: string;
}

export const QUALITY_PROFILES: Record<QualityMode, QualityProfile> = {
  speed: {
    baseScale: 1.0,
    maxScale: 1.5,
    ingestConcurrency: 1,
    thumbScaleMultiplier: 1.0,
    rerenderDebounceMs: 600,
    evictAfterMs: 4000,
    label: "Speed",
  },
  balanced: {
    baseScale: 1.5,
    maxScale: 2.5,
    ingestConcurrency: 2,
    thumbScaleMultiplier: 1.25,
    rerenderDebounceMs: 350,
    evictAfterMs: 15000,
    label: "Balanced",
  },
  quality: {
    baseScale: 2.0,
    maxScale: 4.0,
    ingestConcurrency: 3,
    thumbScaleMultiplier: 1.5,
    rerenderDebounceMs: 200,
    evictAfterMs: 60000,
    label: "Quality",
  },
};

/** Pick the right render scale for a given zoom level given the active profile. */
export function pickRenderScale(profile: QualityProfile, viewportScale: number): number {
  // Linearly bump scale with zoom but cap at maxScale
  if (viewportScale <= 1.0) return profile.baseScale;
  const extra = Math.min(profile.maxScale - profile.baseScale, viewportScale - 1.0);
  return Math.min(profile.maxScale, profile.baseScale + extra);
}
