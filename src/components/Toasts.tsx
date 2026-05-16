import { useEffect } from "react";
import { useProjectStore } from "../store/projectStore";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export function Toasts() {
  const toasts = useProjectStore((s) => s.toasts);
  const dismiss = useProjectStore((s) => s.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const now = Date.now();
    const timers = toasts.map((t) => {
      const remaining = Math.max(0, t.createdAt + t.durationMs - now);
      return setTimeout(() => dismiss(t.id), remaining);
    });
    return () => timers.forEach((t) => clearTimeout(t));
  }, [toasts, dismiss]);

  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 flex-col-reverse gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="panel rounded-lg pl-3 pr-2 py-2 flex items-center gap-2 max-w-[28rem] pointer-events-none animate-slide-up shadow-lg"
        >
          {t.kind === "success" && (
            <CheckCircle2 className="w-4 h-4 text-signal-green shrink-0" />
          )}
          {t.kind === "error" && (
            <AlertCircle className="w-4 h-4 text-signal-red shrink-0" />
          )}
          {t.kind === "info" && (
            <Info className="w-4 h-4 text-signal-blue shrink-0" />
          )}
          <div className="text-sm text-ink-100">
            {t.message}
            {t.count > 1 && (
              <span className="ml-2 text-[11px] text-ink-500 font-mono">x{t.count}</span>
            )}
          </div>
          <button
            onClick={() => dismiss(t.id)}
            className="text-ink-400 hover:text-ink-50 ml-1 pointer-events-auto"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
