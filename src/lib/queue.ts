// Tiny promise queue with bounded concurrency. Used to throttle PDF
// ingestion so we never blast the user's machine with N parallel parses
// of huge architectural sheets.

export interface QueueOptions {
  concurrency?: number;
}

export class PromiseQueue {
  private concurrency: number;
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(opts: QueueOptions = {}) {
    this.concurrency = Math.max(1, opts.concurrency ?? 1);
  }

  setConcurrency(n: number) {
    this.concurrency = Math.max(1, n);
    this.drain();
  }

  add<T>(task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        this.active++;
        task().then(resolve, reject).finally(() => {
          this.active--;
          this.drain();
        });
      };
      this.queue.push(run);
      this.drain();
    });
  }

  private drain() {
    while (this.active < this.concurrency && this.queue.length > 0) {
      const next = this.queue.shift()!;
      next();
    }
  }

  get pending() {
    return this.queue.length;
  }
  get inFlight() {
    return this.active;
  }
}

/** Yield to the browser to let it paint, then continue. Use between heavy
 *  CPU passes to keep the UI responsive. */
export function yieldToBrowser(): Promise<void> {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    return new Promise((res) =>
      (window as any).requestIdleCallback(() => res(), { timeout: 100 }),
    );
  }
  return new Promise((res) => setTimeout(res, 0));
}
