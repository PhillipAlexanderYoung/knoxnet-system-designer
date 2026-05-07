import { useState, useEffect, type ReactNode } from "react";
import { Group, Line, Circle, Rect, Text, Path } from "react-konva";
import { useProjectStore, type Sheet } from "../store/projectStore";
import { devicesById } from "../data/devices";
import { cablesById } from "../data/cables";
import { DeviceIconNode } from "../components/DeviceIconNode";
import {
  cloudPath,
  distancePts,
  formatFeet,
  orthoSnap,
  polylineLengthPts,
  ptsToFeet,
} from "../lib/geometry";

const uid = () => Math.random().toString(36).slice(2, 10);

export interface ToolGesture {
  /** Handlers to attach to the hit-rect (rendered BEHIND markups) */
  rectHandlers: {
    onMouseDown: (e: any) => void;
    onMouseMove: (e: any) => void;
    onMouseUp: (e: any) => void;
    onDblClick: (e: any) => void;
  };
  /** Preview shapes to render ABOVE markups */
  preview: ReactNode;
}

/**
 * Owns the in-progress gesture state for whichever tool is active. Returns
 * handlers to wire to the hit-rect and a preview fragment. The hit-rect
 * lives BEHIND markups in the layer order, while preview lives ABOVE — so
 * device clicks reach the device, but the in-progress preview line/cloud is
 * always visible.
 */
export function useToolGesture(
  sheet: Sheet,
  onCalibrateConfirm: (pts: { x: number; y: number }[]) => void,
): ToolGesture {
  const tool = useProjectStore((s) => s.activeTool);
  const cursor = useProjectStore((s) => s.cursor);
  const viewport = useProjectStore((s) => s.viewport);
  const ortho = useProjectStore((s) => s.orthoEnabled);
  const activeDeviceId = useProjectStore((s) => s.activeDeviceId);
  const activeCableId = useProjectStore((s) => s.activeCableId);
  const freehandColor = useProjectStore((s) => s.freehandColor);
  const freehandThickness = useProjectStore((s) => s.freehandThickness);
  const freehandErasing = useProjectStore((s) => s.freehandErasing);
  const addMarkup = useProjectStore((s) => s.addMarkup);
  const addMaskRegion = useProjectStore((s) => s.addMaskRegion);
  const setSelected = useProjectStore((s) => s.setSelected);
  const setSelectedBrand = useProjectStore((s) => s.setSelectedBrand);
  const setCursor = useProjectStore((s) => s.setCursor);
  const nextTag = useProjectStore((s) => s.nextTag);
  const pushToast = useProjectStore((s) => s.pushToast);

  const withinSheet = (p: { x: number; y: number } | null) =>
    !!p && p.x >= 0 && p.y >= 0 && p.x <= sheet.pageWidth && p.y <= sheet.pageHeight;

  /**
   * Resolve the pointer position in sheet (PDF user) coordinates. We try
   * Konva's helper first, then fall back to computing it from the native
   * MouseEvent's clientX/clientY against the stage container's bounding
   * rect. The fallback matters in browsers (e.g. Brave with strict
   * fingerprinting/Shields) where Konva's pointer-position helper can
   * intermittently return null because it relies on internal canvas APIs
   * that are randomized or rate-limited for privacy.
   */
  const pointerInSheet = (e: any): { x: number; y: number } | null => {
    try {
      const stage =
        e?.target?.getStage?.() ?? e?.currentTarget?.getStage?.() ?? null;
      if (stage) {
        const p = stage.getPointerPosition?.();
        if (p && isFinite(p.x) && isFinite(p.y)) {
          const sheetPoint = {
            x: (p.x - viewport.x) / viewport.scale,
            y: (p.y - viewport.y) / viewport.scale,
          };
          return withinSheet(sheetPoint) ? sheetPoint : null;
        }
        const native = e.evt as MouseEvent | undefined;
        const container: HTMLElement | null = stage.container?.() ?? null;
        if (native && container) {
          const rect = container.getBoundingClientRect();
          const sx = native.clientX - rect.left;
          const sy = native.clientY - rect.top;
          const sheetPoint = {
            x: (sx - viewport.x) / viewport.scale,
            y: (sy - viewport.y) / viewport.scale,
          };
          return withinSheet(sheetPoint) ? sheetPoint : null;
        }
      }
    } catch {
      /* fall through */
    }
    return withinSheet(cursor) ? cursor : null;
  };

  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [drag, setDrag] = useState<{
    start: { x: number; y: number };
    end: { x: number; y: number };
    isDragging: boolean;
  } | null>(null);
  const [pen, setPen] = useState<{ pts: number[]; active: boolean } | null>(null);

  // Reset on tool/sheet change
  useEffect(() => {
    setPoints([]);
    setDrag(null);
    setPen(null);
  }, [tool, sheet.id]);

  const commitInProgress = () => {
    if (tool === "cable" && points.length >= 2 && activeCableId) {
      const flat = points.flatMap((p) => [p.x, p.y]);
      addMarkup({
        id: uid(),
        kind: "cable",
        layer: "cable",
        cableId: activeCableId,
        points: flat,
      });
      setPoints([]);
      pushToast("info", "Cable run added");
    } else if (tool === "polygon" && points.length >= 3) {
      const flat = points.flatMap((p) => [p.x, p.y]);
      addMarkup({
        id: uid(),
        kind: "polygon",
        layer: "annotation",
        points: flat,
        color: "#F4B740",
        fill: "rgba(244,183,64,0.08)",
      });
      setPoints([]);
    } else if (tool === "calibrate" && points.length === 2) {
      onCalibrateConfirm(points);
      setPoints([]);
    }
  };

  // Enter / Esc keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Enter") commitInProgress();
      if (e.key === "Escape") {
        setPoints([]);
        setDrag(null);
        setPen(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, tool, activeCableId]);

  const onMouseDown = (e: any) => {
    // Skip if a markup child handled the click (it sets cancelBubble)
    if (e.cancelBubble) return;
    if (e.evt && e.evt.button !== undefined && e.evt.button !== 0) return;
    const c = pointerInSheet(e);
    if (!c) return;
    // Sync the store's cursor too so the status bar / preview catch up
    setCursor(c);

    if (tool === "select") {
      // Clicking empty space in select mode deselects everything —
      // markups, masks, AND the brand preview. Otherwise the title-block
      // transformer handles linger after the user moves on.
      setSelected([]);
      setSelectedBrand(null);
      return;
    }
    if (tool === "device" && activeDeviceId) {
      const dev = devicesById[activeDeviceId];
      if (!dev) return;
      addMarkup({
        id: uid(),
        kind: "device",
        layer: dev.category,
        category: dev.category,
        deviceId: dev.id,
        x: c.x,
        y: c.y,
        tag: nextTag(dev.shortCode),
      });
      return;
    }
    if (tool === "calibrate") {
      const next = [...points, c];
      if (next.length === 2) {
        onCalibrateConfirm(next);
        setPoints([]);
      } else {
        setPoints(next);
      }
      return;
    }
    if (tool === "cable") {
      let pt = c;
      if (ortho && points.length > 0) {
        const last = points[points.length - 1];
        pt = orthoSnap(last, c);
      }
      setPoints([...points, pt]);
      return;
    }
    if (tool === "polygon") {
      setPoints([...points, c]);
      return;
    }
    if (tool === "text") {
      setTimeout(() => {
        const text = window.prompt("Annotation text:");
        if (text && text.trim()) {
          addMarkup({
            id: uid(),
            kind: "text",
            layer: "annotation",
            x: c.x,
            y: c.y,
            text: text.trim(),
            fontSize: 14,
            color: "#F5F7FA",
          });
        }
      }, 0);
      return;
    }
    if (
      tool === "rect" ||
      tool === "cloud" ||
      tool === "arrow" ||
      tool === "callout" ||
      tool === "dimension" ||
      tool === "mask"
    ) {
      setDrag({ start: c, end: c, isDragging: true });
      return;
    }
    if (tool === "freehand") {
      // In eraser sub-mode the freehand tool stops drawing — the
      // MarkupLayer handles click-to-delete on existing strokes. Suppress
      // the pen-down gesture so a click on empty space doesn't draw a
      // single-point stroke that confuses the user.
      if (freehandErasing) return;
      setPen({ pts: [c.x, c.y], active: true });
      return;
    }
  };

  const onMouseMove = (e: any) => {
    const c = pointerInSheet(e);
    if (!c) return;
    setCursor(c);
    if (drag?.isDragging) setDrag({ ...drag, end: c });
    if (pen?.active) setPen({ ...pen, pts: [...pen.pts, c.x, c.y] });
  };

  const onMouseUp = (e: any) => {
    const c = pointerInSheet(e) ?? cursor;
    if (drag?.isDragging && c) {
      const { start } = drag;
      // Use the freshest pointer position for the gesture's end-point
      const end = c;
      if (tool === "rect") {
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);
        if (w > 4 && h > 4) {
          addMarkup({
            id: uid(),
            kind: "rect",
            layer: "annotation",
            x,
            y,
            width: w,
            height: h,
            color: "#F4B740",
            fill: "rgba(244,183,64,0.06)",
          });
        }
      }
      if (tool === "cloud") {
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);
        if (w > 12 && h > 12) {
          addMarkup({
            id: uid(),
            kind: "cloud",
            layer: "annotation",
            x,
            y,
            width: w,
            height: h,
            color: "#FF5C7A",
          });
        }
      }
      if (tool === "arrow" && distancePts(start, end) > 4) {
        addMarkup({
          id: uid(),
          kind: "arrow",
          layer: "annotation",
          p1: start,
          p2: end,
          color: "#F4B740",
        });
      }
      if (tool === "callout" && distancePts(start, end) > 8) {
        const text = window.prompt("Callout text:") ?? "";
        if (text.trim()) {
          addMarkup({
            id: uid(),
            kind: "callout",
            layer: "annotation",
            x1: start.x,
            y1: start.y,
            x2: end.x,
            y2: end.y,
            text: text.trim(),
            color: "#F4B740",
          });
        }
      }
      if (tool === "dimension" && distancePts(start, end) > 4) {
        addMarkup({
          id: uid(),
          kind: "dimension",
          layer: "annotation",
          p1: start,
          p2: end,
          color: "#94A0B8",
        });
      }
      if (tool === "mask") {
        const x = Math.min(start.x, end.x);
        const y = Math.min(start.y, end.y);
        const w = Math.abs(end.x - start.x);
        const h = Math.abs(end.y - start.y);
        if (w > 8 && h > 8) {
          addMaskRegion(sheet.id, {
            id: uid(),
            x,
            y,
            width: w,
            height: h,
          });
          pushToast(
            "info",
            "Mask added — covers original content during export",
          );
        }
      }
      setDrag(null);
    }
    if (pen?.active) {
      if (pen.pts.length > 4) {
        addMarkup({
          id: uid(),
          kind: "freehand",
          layer: "annotation",
          points: pen.pts,
          color: freehandColor,
          thickness: freehandThickness,
        });
      }
      setPen(null);
    }
  };

  const onDblClick = () => {
    if ((tool === "cable" || tool === "polygon") && points.length >= 2) {
      commitInProgress();
    }
  };

  // ───── Preview render ─────

  const previewCable = (() => {
    if (tool !== "cable" || points.length === 0 || !cursor || !activeCableId) return null;
    const cab = cablesById[activeCableId];
    if (!cab) return null;
    let liveEnd = cursor;
    if (ortho) liveEnd = orthoSnap(points[points.length - 1], cursor);
    const flat = points.flatMap((p) => [p.x, p.y]).concat([liveEnd.x, liveEnd.y]);
    const lenPts = polylineLengthPts(flat);
    const ft = ptsToFeet(lenPts, sheet.calibration);
    return (
      <Group listening={false}>
        <Line
          points={flat}
          stroke={cab.color}
          strokeWidth={cab.thickness ?? 2}
          dash={cab.dash}
          opacity={0.85}
          lineCap="round"
          lineJoin="round"
        />
        {points.map((p, i) => (
          <Circle key={i} x={p.x} y={p.y} radius={3} fill={cab.color} />
        ))}
        {ft !== null && (
          <Group x={liveEnd.x + 8} y={liveEnd.y - 18}>
            <Rect width={90} height={20} fill="#0B1220" stroke={cab.color} cornerRadius={3} />
            <Text
              x={6}
              y={5}
              text={`${cab.shortCode}  ${formatFeet(ft, 0)}`}
              fontFamily="JetBrains Mono"
              fontSize={11}
              fill="#F5F7FA"
            />
          </Group>
        )}
      </Group>
    );
  })();

  const previewDevice = (() => {
    if (tool !== "device" || !activeDeviceId || !cursor) return null;
    const dev = devicesById[activeDeviceId];
    if (!dev) return null;
    return (
      <Group listening={false} opacity={0.6}>
        <DeviceIconNode device={dev} x={cursor.x} y={cursor.y} size={28} />
      </Group>
    );
  })();

  const previewCalibration = (() => {
    if (tool !== "calibrate" || !cursor) return null;
    const segs = [...points];
    if (segs.length === 0) {
      return (
        <Group listening={false}>
          <Circle x={cursor.x} y={cursor.y} radius={5} stroke="#F4B740" strokeWidth={1.5} dash={[2, 2]} />
        </Group>
      );
    }
    const last = segs[segs.length - 1];
    const lenPts = distancePts(last, cursor);
    return (
      <Group listening={false}>
        <Line points={[last.x, last.y, cursor.x, cursor.y]} stroke="#F4B740" strokeWidth={1.5} dash={[6, 4]} />
        <Circle x={last.x} y={last.y} radius={4} fill="#F4B740" />
        <Circle x={cursor.x} y={cursor.y} radius={4} stroke="#F4B740" strokeWidth={1.5} />
        <Group x={cursor.x + 10} y={cursor.y - 16}>
          <Rect width={70} height={20} fill="#0B1220" stroke="#F4B740" cornerRadius={3} />
          <Text x={6} y={5} text={`${lenPts.toFixed(0)} px`} fontFamily="JetBrains Mono" fontSize={11} fill="#F5F7FA" />
        </Group>
      </Group>
    );
  })();

  const previewDrag = (() => {
    if (!drag) return null;
    const { start, end } = drag;
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    if (tool === "rect")
      return <Rect x={x} y={y} width={w} height={h} stroke="#F4B740" dash={[4, 4]} listening={false} />;
    if (tool === "mask") {
      // Show fill preview at the live sampled bg (or white) so the user
      // can see exactly what the cover-up will look like before committing.
      const fill = sheet.bgColor ?? "#FFFFFF";
      return (
        <Group listening={false}>
          <Rect x={x} y={y} width={w} height={h} fill={fill} opacity={0.85} />
          <Rect x={x} y={y} width={w} height={h} stroke="#F4B740" strokeWidth={1} dash={[6, 4]} />
        </Group>
      );
    }
    if (tool === "cloud")
      return (
        <Path
          data={cloudPath(x, y, w, h)}
          stroke="#FF5C7A"
          strokeWidth={1.8}
          dash={[4, 4]}
          listening={false}
        />
      );
    if (tool === "arrow" || tool === "dimension" || tool === "callout") {
      const ft = tool === "dimension" ? ptsToFeet(distancePts(start, end), sheet.calibration) : null;
      return (
        <Group listening={false}>
          <Line
            points={[start.x, start.y, end.x, end.y]}
            stroke={tool === "dimension" ? "#94A0B8" : "#F4B740"}
            strokeWidth={1.5}
            dash={[4, 4]}
          />
          {ft !== null && (
            <Group x={(start.x + end.x) / 2 + 6} y={(start.y + end.y) / 2 - 18}>
              <Rect width={70} height={20} fill="#0B1220" stroke="#94A0B8" cornerRadius={3} />
              <Text x={6} y={5} text={formatFeet(ft)} fontFamily="JetBrains Mono" fontSize={11} fill="#F5F7FA" />
            </Group>
          )}
        </Group>
      );
    }
    return null;
  })();

  const previewPen = (() => {
    if (!pen?.active) return null;
    return (
      <Line
        points={pen.pts}
        stroke={freehandColor}
        strokeWidth={freehandThickness}
        lineCap="round"
        lineJoin="round"
        listening={false}
      />
    );
  })();

  // Visual feedback for the eraser sub-mode: a hollow ring follows the
  // cursor so the user knows they're in delete-mode rather than draw-mode.
  // Sized roughly to the freehand thickness so it also signals what gets
  // hit when they click.
  const previewEraser = (() => {
    if (tool !== "freehand" || !freehandErasing || !cursor) return null;
    const r = Math.max(8, freehandThickness * 3);
    return (
      <Group listening={false} opacity={0.85}>
        <Circle x={cursor.x} y={cursor.y} radius={r} stroke="#FF5C7A" strokeWidth={1.2} dash={[4, 3]} />
        <Circle x={cursor.x} y={cursor.y} radius={2} fill="#FF5C7A" />
      </Group>
    );
  })();

  const previewPolygon = (() => {
    if (tool !== "polygon" || points.length === 0) return null;
    const flat = points.flatMap((p) => [p.x, p.y]);
    const live = cursor ? [cursor.x, cursor.y] : [];
    return (
      <Group listening={false}>
        <Line points={[...flat, ...live]} stroke="#F4B740" strokeWidth={1.5} dash={[4, 4]} />
        {points.map((p, i) => (
          <Circle key={i} x={p.x} y={p.y} radius={3} fill="#F4B740" />
        ))}
      </Group>
    );
  })();

  const preview = (
    <Group listening={false}>
      {previewCalibration}
      {previewCable}
      {previewPolygon}
      {previewDrag}
      {previewPen}
      {previewEraser}
      {previewDevice}
    </Group>
  );

  return {
    rectHandlers: { onMouseDown, onMouseMove, onMouseUp, onDblClick },
    preview,
  };
}
