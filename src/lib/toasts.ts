export type ToastKind = "info" | "success" | "error";

export type Toast = {
  id: string;
  kind: ToastKind;
  message: string;
  createdAt: number;
  durationMs: number;
  count: number;
};

const MAX_VISIBLE_TOASTS = 3;
const DEDUPE_WINDOW_MS = 2500;

const TOOL_GUIDANCE_PATTERNS = [
  /^pick a different cable run (point|endpoint)$/i,
  /^route point added\b/i,
  /^.+ set — click route turns or a device$/i,
  /^conduit path (copied|added)\b/i,
];

function isToolGuidance(message: string): boolean {
  return TOOL_GUIDANCE_PATTERNS.some((pattern) => pattern.test(message));
}

export function toastDurationMs(kind: ToastKind, message: string): number {
  if (isToolGuidance(message)) return 1500;
  if (kind === "error") return 5000;
  return 2400;
}

function normalizeToastKind(kind: ToastKind, message: string): ToastKind {
  return isToolGuidance(message) ? "info" : kind;
}

function toastPriority(toast: Toast): number {
  if (toast.kind === "error") return 3;
  if (toast.kind === "success") return 2;
  return 1;
}

export function enqueueToast(
  toasts: Toast[],
  kind: ToastKind,
  message: string,
  now: number,
  makeId: () => string,
): Toast[] {
  const normalizedKind = normalizeToastKind(kind, message);
  const existingIndex = toasts.findIndex(
    (toast) =>
      toast.kind === normalizedKind &&
      toast.message === message &&
      now - toast.createdAt <= Math.max(toast.durationMs, DEDUPE_WINDOW_MS),
  );

  const next =
    existingIndex >= 0
      ? toasts.map((toast, index) =>
          index === existingIndex
            ? {
                ...toast,
                count: toast.count + 1,
                durationMs: Math.max(toast.durationMs, toastDurationMs(normalizedKind, message)),
              }
            : toast,
        )
      : [
          ...toasts,
          {
            id: makeId(),
            kind: normalizedKind,
            message,
            createdAt: now,
            durationMs: toastDurationMs(normalizedKind, message),
            count: 1,
          },
        ];

  if (next.length <= MAX_VISIBLE_TOASTS) return next;

  return [...next]
    .sort((a, b) => {
      const priorityDelta = toastPriority(b) - toastPriority(a);
      if (priorityDelta !== 0) return priorityDelta;
      return b.createdAt - a.createdAt;
    })
    .slice(0, MAX_VISIBLE_TOASTS)
    .sort((a, b) => a.createdAt - b.createdAt);
}
