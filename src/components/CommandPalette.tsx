import { useEffect, useMemo, useState } from "react";
import { useProjectStore, type ToolId } from "../store/projectStore";
import {
  Search,
  MousePointer2,
  Hand,
  Ruler,
  Sparkles,
  Cable,
  Type as TypeIcon,
  MessageSquare,
  Cloud,
  Square,
  Hexagon,
  ArrowUpRight,
  Pen,
  Calculator,
  Settings2,
  FileDown,
} from "lucide-react";
import { exportMarkupPdf } from "../export/exportMarkupPdf";
import { exportBidPdf, exportBidXlsx } from "../export/exportBid";

interface Command {
  id: string;
  label: string;
  icon: any;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const open = useProjectStore((s) => s.commandPaletteOpen);
  const toggle = useProjectStore((s) => s.toggleCommandPalette);
  const setTool = useProjectStore((s) => s.setActiveTool);
  const toggleBid = useProjectStore((s) => s.toggleBidPanel);
  const toggleSettings = useProjectStore((s) => s.toggleSettings);
  const project = useProjectStore((s) => s.project);
  const pushToast = useProjectStore((s) => s.pushToast);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
    }
  }, [open]);

  const commands: Command[] = useMemo(() => {
    const tools: { id: ToolId; label: string; icon: any }[] = [
      { id: "select", label: "Select", icon: MousePointer2 },
      { id: "pan", label: "Pan", icon: Hand },
      { id: "calibrate", label: "Calibrate Scale", icon: Ruler },
      { id: "device", label: "Place Device", icon: Sparkles },
      { id: "cable", label: "Cable Run", icon: Cable },
      { id: "text", label: "Text", icon: TypeIcon },
      { id: "callout", label: "Callout", icon: MessageSquare },
      { id: "cloud", label: "Revision Cloud", icon: Cloud },
      { id: "rect", label: "Rectangle", icon: Square },
      { id: "polygon", label: "Polygon", icon: Hexagon },
      { id: "arrow", label: "Arrow", icon: ArrowUpRight },
      { id: "freehand", label: "Freehand", icon: Pen },
      { id: "dimension", label: "Dimension", icon: Ruler },
    ];
    const out: Command[] = tools.map((t) => ({
      id: `tool:${t.id}`,
      label: `Tool · ${t.label}`,
      icon: t.icon,
      run: () => setTool(t.id),
    }));
    out.push(
      {
        id: "panel:bid",
        label: "Toggle Bid Panel",
        icon: Calculator,
        hint: "⌘B",
        run: () => toggleBid(),
      },
      {
        id: "panel:settings",
        label: "Open Settings",
        icon: Settings2,
        hint: "⌘,",
        run: () => toggleSettings(),
      },
    );
    if (project) {
      out.push(
        {
          id: "export:markup",
          label: "Export Branded Markup PDF",
          icon: FileDown,
          run: async () => {
            try {
              await exportMarkupPdf(project);
              pushToast("success", "Markup PDF exported");
            } catch (e) {
              console.error(e);
              pushToast("error", "Export failed");
            }
          },
        },
        {
          id: "export:bid-pdf",
          label: "Export Bid PDF",
          icon: FileDown,
          run: async () => {
            try {
              await exportBidPdf(project);
              pushToast("success", "Bid PDF exported");
            } catch (e) {
              console.error(e);
              pushToast("error", "Export failed");
            }
          },
        },
        {
          id: "export:bid-xlsx",
          label: "Export Bid XLSX",
          icon: FileDown,
          run: async () => {
            try {
              await exportBidXlsx(project);
              pushToast("success", "Bid XLSX exported");
            } catch (e) {
              console.error(e);
              pushToast("error", "Export failed");
            }
          },
        },
      );
    }
    return out;
  }, [project, setTool, toggleBid, toggleSettings, pushToast]);

  const filtered = useMemo(() => {
    if (!q.trim()) return commands;
    const lower = q.toLowerCase();
    return commands.filter((c) => c.label.toLowerCase().includes(lower));
  }, [commands, q]);

  useEffect(() => {
    if (idx >= filtered.length) setIdx(0);
  }, [filtered.length, idx]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      toggle();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      const cmd = filtered[idx];
      if (cmd) {
        cmd.run();
        toggle();
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-midnight/60 backdrop-blur-sm flex items-start justify-center pt-32 animate-fade-in"
      onClick={toggle}
    >
      <div
        className="w-full max-w-lg panel rounded-xl overflow-hidden animate-scale-in"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKey}
      >
        <div className="px-3 py-2 border-b border-white/5 flex items-center gap-2">
          <Search className="w-4 h-4 text-ink-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Type a command…"
            className="flex-1 bg-transparent outline-none text-sm text-ink-50 placeholder:text-ink-400"
          />
          <span className="font-mono text-[11px] text-ink-400">esc</span>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {filtered.map((c, i) => {
            const Icon = c.icon;
            return (
              <button
                key={c.id}
                onClick={() => {
                  c.run();
                  toggle();
                }}
                onMouseEnter={() => setIdx(i)}
                className={`w-full px-3 py-2 flex items-center gap-3 text-left text-sm ${i === idx ? "bg-amber-knox/10 text-ink-50" : "text-ink-200 hover:bg-white/5"}`}
              >
                <Icon className="w-4 h-4 text-ink-300" />
                <span className="flex-1">{c.label}</span>
                {c.hint && (
                  <span className="font-mono text-[11px] text-ink-400">{c.hint}</span>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-3 py-6 text-center text-xs text-ink-400">
              No commands found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
