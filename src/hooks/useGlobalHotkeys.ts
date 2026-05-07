import { useEffect } from "react";
import { useProjectStore, type ToolId, selectActiveSheet, type Markup } from "../store/projectStore";
import { devicesById } from "../data/devices";

const KEY_TO_TOOL: Record<string, ToolId> = {
  v: "select",
  h: "pan",
  k: "calibrate",
  d: "device",
  c: "cable",
  t: "text",
  l: "callout",
  r: "rect",
  o: "cloud",
  m: "dimension",
  a: "arrow",
  p: "polygon",
  f: "freehand",
};

export function useGlobalHotkeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      // Ignore typing in inputs, textareas, contenteditable
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const s = useProjectStore.getState();

      // Cmd/Ctrl+K → command palette
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        s.toggleCommandPalette();
        return;
      }
      // Cmd/Ctrl+B → bid panel
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        s.toggleBidPanel();
        return;
      }
      // Cmd/Ctrl+, → settings
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        s.toggleSettings();
        return;
      }

      // Arrow-key nudge for selected markups
      if (
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        s.selectedMarkupIds.length > 0 &&
        (e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight")
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const sheet = selectActiveSheet(s);
        if (!sheet) return;
        for (const id of s.selectedMarkupIds) {
          const m = sheet.markups.find((mm) => mm.id === id);
          if (!m || m.locked) continue;
          nudgeMarkup(m, dx, dy, s.updateMarkup);
        }
        return;
      }

      // Plain hotkeys
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        const tool = KEY_TO_TOOL[e.key.toLowerCase()];
        if (tool) {
          e.preventDefault();
          s.setActiveTool(tool);
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          if (s.selectedMarkupIds.length > 0) {
            e.preventDefault();
            s.deleteSelected();
          }
        }
        if (e.key === "Escape") {
          s.setSelected([]);
          s.setActiveTool("select");
        }
      }

      // Cmd/Ctrl+D → duplicate selected devices
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d") {
        if (s.selectedMarkupIds.length === 0) return;
        e.preventDefault();
        const sheet = selectActiveSheet(s);
        if (!sheet) return;
        const newIds: string[] = [];
        for (const id of s.selectedMarkupIds) {
          const m = sheet.markups.find((mm) => mm.id === id);
          if (!m) continue;
          if (m.kind === "device") {
            const dev = devicesById[m.deviceId];
            const newId = Math.random().toString(36).slice(2, 10);
            const tag = s.nextTag(dev?.shortCode ?? "X");
            s.addMarkup({
              ...m,
              id: newId,
              tag,
              x: m.x + 24,
              y: m.y + 24,
            });
            newIds.push(newId);
          }
        }
        if (newIds.length) s.setSelected(newIds);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function nudgeMarkup(
  m: Markup,
  dx: number,
  dy: number,
  updateMarkup: (id: string, p: any) => void,
) {
  switch (m.kind) {
    case "device":
    case "text":
    case "rect":
    case "cloud":
      updateMarkup(m.id, { x: (m as any).x + dx, y: (m as any).y + dy });
      return;
    case "callout":
      updateMarkup(m.id, {
        x1: m.x1 + dx,
        y1: m.y1 + dy,
        x2: m.x2 + dx,
        y2: m.y2 + dy,
      });
      return;
    case "dimension":
    case "arrow":
      updateMarkup(m.id, {
        p1: { x: m.p1.x + dx, y: m.p1.y + dy },
        p2: { x: m.p2.x + dx, y: m.p2.y + dy },
      });
      return;
    case "cable":
    case "polygon":
    case "freehand": {
      const pts = [...m.points];
      for (let i = 0; i < pts.length; i += 2) {
        pts[i] += dx;
        pts[i + 1] += dy;
      }
      updateMarkup(m.id, { points: pts });
      return;
    }
  }
}
