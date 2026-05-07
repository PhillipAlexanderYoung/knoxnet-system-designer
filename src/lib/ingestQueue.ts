// A single shared ingest queue. Concurrency + doc cache size both track the
// active quality mode.

import { PromiseQueue } from "./queue";
import { useProjectStore } from "../store/projectStore";
import { QUALITY_PROFILES } from "./quality";
import { setDocCacheLimit } from "./pdfjs";

const queue = new PromiseQueue({ concurrency: QUALITY_PROFILES.balanced.ingestConcurrency });

// Initialize cache limits to current mode
const initialMode = useProjectStore.getState().qualityMode;
setDocCacheLimit(cacheLimitFor(initialMode));

function cacheLimitFor(mode: keyof typeof QUALITY_PROFILES) {
  // Speed: tightest hot set; Quality: larger so big projects re-render fast
  switch (mode) {
    case "speed":
      return 2;
    case "quality":
      return 6;
    default:
      return 3;
  }
}

// Subscribe once: whenever the user changes quality mode, retune the queue
// AND the document cache size.
useProjectStore.subscribe(
  (s) => s.qualityMode,
  (mode) => {
    queue.setConcurrency(QUALITY_PROFILES[mode].ingestConcurrency);
    setDocCacheLimit(cacheLimitFor(mode));
  },
);

export function enqueueIngest<T>(task: () => Promise<T>): Promise<T> {
  return queue.add(task);
}

export function ingestStats() {
  return { inFlight: queue.inFlight, pending: queue.pending };
}
