import { useEffect, useRef, useState } from "react";
import { GitFork, X } from "lucide-react";

interface Props {
  /** Name of the project being forked — used to seed the suggested
   *  new name and to label the dialog so the user knows which project
   *  they're branching from. */
  sourceName: string;
  /** Current revision label (e.g. "0", "1", "A"). The dialog seeds the
   *  next-revision input by bumping this value when it's a number. */
  sourceRevision: string;
  /** What the action button reads. Defaults to "Create Fork" — the
   *  Topbar can pass "Save as Version" so the wording matches the
   *  surrounding UI. */
  actionLabel?: string;
  onSubmit: (opts: { name: string; revision: string }) => void | Promise<void>;
  onClose: () => void;
}

/**
 * Lightweight modal that collects a new name + revision label before
 * forking a project. Used by both the StartScreen "Duplicate" action
 * and the Topbar "Save as new version" action so the wording and
 * keyboard ergonomics stay consistent across surfaces.
 *
 * Why both fields? Renaming alone loses the version-history trail
 * (multiple revisions of the same install all show up named "Acme HQ
 * (copy)"). Bumping the revision lets doc codes — `KN-12345-R1` etc.
 * — continue to read correctly without manual cleanup.
 */
export function ForkProjectDialog({
  sourceName,
  sourceRevision,
  actionLabel = "Create Fork",
  onSubmit,
  onClose,
}: Props) {
  const [name, setName] = useState(suggestForkName(sourceName, sourceRevision));
  const [revision, setRevision] = useState(bumpRevision(sourceRevision));
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  // Auto-select the suggested name on open so the user can immediately
  // type over it without an extra click.
  useEffect(() => {
    nameRef.current?.select();
  }, []);

  const submit = async () => {
    if (busy) return;
    const trimmed = name.trim() || sourceName;
    setBusy(true);
    try {
      await onSubmit({ name: trimmed, revision: revision.trim() || sourceRevision });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-midnight/70 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="panel rounded-xl w-[440px] p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-amber-knox/15 text-amber-knox flex items-center justify-center">
              <GitFork className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-ink-50">Fork Project</div>
              <div className="text-xs text-ink-400">
                Branch{" "}
                <span className="text-ink-200">{sourceName}</span> into a new
                editable copy. The original stays untouched.
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-400 hover:text-ink-50"
            disabled={busy}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <div className="label mb-1">New Name</div>
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="input"
              placeholder="e.g. Acme HQ — Phase II"
              disabled={busy}
            />
          </div>
          <div>
            <div className="label mb-1">Revision</div>
            <input
              value={revision}
              onChange={(e) => setRevision(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              className="input font-mono"
              placeholder={`Bumped from R${sourceRevision}`}
              disabled={busy}
            />
            <div className="text-[11px] text-ink-400 mt-1">
              Used in the document code — e.g.{" "}
              <span className="font-mono text-ink-200">
                KN-12345-R{revision || "?"}
              </span>
              .
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn" disabled={busy}>
            Cancel
          </button>
          <button onClick={submit} className="btn-primary" disabled={busy}>
            {busy ? "Forking…" : actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Suggest a sensible default name for the new fork. We avoid stacking
 * "(copy) (copy) (copy)" on top of each other by stripping a trailing
 * "(copy)" suffix when present. When the source already carries a
 * revision-style name like "Acme HQ R0", we bump it so users get a
 * tidy "Acme HQ R1" suggestion to accept with Enter.
 */
function suggestForkName(name: string, revision: string): string {
  const trimmed = name.replace(/\s*\(copy\)$/i, "").trim();
  // If the name already ends with a revision tag like "R0" or "R12",
  // bump the number so the suggestion encodes the intended next rev.
  const revMatch = trimmed.match(/^(.*?)[\s_-]*R(\d+)$/i);
  if (revMatch) {
    const base = revMatch[1].trim();
    const next = String(parseInt(revMatch[2], 10) + 1);
    return `${base} R${next}`;
  }
  // Otherwise, append the bumped revision so the new name is at least
  // distinguishable from the source in the recent-projects list.
  const bumped = bumpRevision(revision);
  if (bumped && bumped !== revision) return `${trimmed} R${bumped}`;
  return `${trimmed} (copy)`;
}

/** Bump a revision label. Numeric revisions increment normally
 *  ("0" → "1", "12" → "13"). Single-letter revisions advance
 *  alphabetically ("A" → "B"). Anything else is returned unchanged
 *  so the user can edit the field manually. */
function bumpRevision(rev: string): string {
  const trimmed = (rev ?? "").trim();
  if (/^\d+$/.test(trimmed)) return String(parseInt(trimmed, 10) + 1);
  if (/^[A-Y]$/.test(trimmed)) {
    return String.fromCharCode(trimmed.charCodeAt(0) + 1);
  }
  if (/^[a-y]$/.test(trimmed)) {
    return String.fromCharCode(trimmed.charCodeAt(0) + 1);
  }
  return trimmed || "1";
}
