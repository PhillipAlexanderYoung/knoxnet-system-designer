import { useEffect } from "react";
import { useProjectStore } from "../store/projectStore";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export function Toasts() {
  const toasts = useProjectStore((s) => s.toasts);
  const dismiss = useProjectStore((s) => s.dismissToast);

  useEffect(() => {
    if (toasts.length === 0) return;
    const timers = toasts.map((t) =>
      setTimeout(() => dismiss(t.id), t.kind === "error" ? 6000 : 3500),
    );
    return () => timers.forEach((t) => clearTimeout(t));
  }, [toasts, dismiss]);

  return (
    <div className="fixed bottom-12 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="panel rounded-lg pl-3 pr-2 py-2 flex items-center gap-2 max-w-sm pointer-events-auto animate-slide-up"
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
          <div className="text-sm text-ink-100">{t.message}</div>
          <button
            onClick={() => dismiss(t.id)}
            className="text-ink-400 hover:text-ink-50 ml-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
