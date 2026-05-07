import { useProjectStore } from "../store/projectStore";
import { Loader2 } from "lucide-react";

/**
 * Ambient indicator: shows ingest progress if any sheets are still loading.
 * Renders nothing when idle so it doesn't take up topbar space.
 */
export function IngestProgress() {
  const { total, done, failed } = useProjectStore((s) => s.ingestProgress);
  if (total === 0) return null;
  const remaining = total - done - failed;
  if (remaining <= 0) return null;
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-knox/10 border border-amber-knox/30 text-[11px] font-mono text-amber-knox animate-fade-in">
      <Loader2 className="w-3 h-3 animate-spin" />
      <span>
        Ingesting {done + failed} / {total}
      </span>
    </div>
  );
}
