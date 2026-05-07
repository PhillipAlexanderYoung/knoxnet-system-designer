import { useProjectStore, type QualityMode } from "../store/projectStore";
import { QUALITY_PROFILES } from "../lib/quality";
import { Gauge, Zap, Sparkles } from "lucide-react";

const ICONS: Record<QualityMode, any> = {
  speed: Zap,
  balanced: Gauge,
  quality: Sparkles,
};

const MODES: QualityMode[] = ["speed", "balanced", "quality"];

export function QualityToggle({ compact = false }: { compact?: boolean }) {
  const mode = useProjectStore((s) => s.qualityMode);
  const setMode = useProjectStore((s) => s.setQualityMode);

  return (
    <div
      className="inline-flex items-center bg-ink-700/60 border border-white/5 rounded-md p-0.5"
      role="radiogroup"
      aria-label="Performance mode"
    >
      {MODES.map((m) => {
        const Icon = ICONS[m];
        const active = mode === m;
        const profile = QUALITY_PROFILES[m];
        return (
          <button
            key={m}
            role="radio"
            aria-checked={active}
            onClick={() => setMode(m)}
            title={`${profile.label} — ${profileSummary(m)}`}
            className={`relative px-2 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${active ? "bg-amber-knox/15 text-amber-knox" : "text-ink-300 hover:text-ink-100"}`}
          >
            <Icon className="w-3.5 h-3.5" />
            {!compact && <span>{profile.label}</span>}
          </button>
        );
      })}
    </div>
  );
}

function profileSummary(m: QualityMode): string {
  const p = QUALITY_PROFILES[m];
  return `${p.baseScale}× → ${p.maxScale}× DPI · ${p.ingestConcurrency} parallel`;
}
