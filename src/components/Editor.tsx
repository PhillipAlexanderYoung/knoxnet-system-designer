import { useEffect, useRef, useState, useCallback } from "react";
import { Stage, Layer, Rect } from "react-konva";
import Konva from "konva";
import { useProjectStore, type Sheet } from "../store/projectStore";
import { SheetBackground } from "./SheetBackground";
import { MarkupLayer } from "./MarkupLayer";
import { MaskLayer } from "./MaskLayer";
import { BrandPreview } from "./BrandPreview";
import { ZoomCluster } from "./ZoomCluster";
import { SelectionActionBar } from "./SelectionActionBar";
import { MaskActionBar } from "./MaskActionBar";
import { useToolGesture } from "../hooks/useToolGesture";
import {
  panCanvasViewport,
  saveCanvasViewport,
  zoomCanvasViewportAt,
  type CanvasViewport,
} from "../lib/canvasViewport";

interface Props {
  sheet: Sheet;
  onCalibrateConfirm: (pts: { x: number; y: number }[]) => void;
}

export function Editor({ sheet, onCalibrateConfirm }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const setCursor = useProjectStore((s) => s.setCursor);
  const viewport = useProjectStore((s) => s.viewport);
  const hasStoredViewport = useProjectStore((s) => Boolean(s.sheetViewports[sheet.id]));
  const setViewport = useProjectStore((s) => s.setViewport);
  const activeTool = useProjectStore((s) => s.activeTool);
  const project = useProjectStore((s) => s.project);
  const sheetIndex = project?.sheets.findIndex((s) => s.id === sheet.id) ?? 0;
  const totalSheets = project?.sheets.length ?? 1;
  const [panning, setPanning] = useState(false);
  const panStart = useRef<{ x: number; y: number; stageX: number; stageY: number } | null>(null);
  const touchGesture = useRef<
    | {
        mode: "pan";
        startCenter: { x: number; y: number };
        startViewport: CanvasViewport;
      }
    | {
        mode: "pinch";
        startCenter: { x: number; y: number };
        startDistance: number;
        startViewport: CanvasViewport;
      }
    | null
  >(null);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const latestViewportRef = useRef(viewport);
  const { rectHandlers, preview } = useToolGesture(sheet, onCalibrateConfirm);

  // Track container size
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Auto fit only until a sheet has an in-memory or restored viewport.
  useEffect(() => {
    if (size.w === 0 || size.h === 0) return;
    if (hasStoredViewport) return;
    fitToPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheet.id, size.w, size.h, hasStoredViewport]);

  useEffect(() => {
    if (!project?.id || !hasStoredViewport) return;
    const t = window.setTimeout(() => {
      saveCanvasViewport(project.id, sheet.id, viewport);
    }, 250);
    return () => window.clearTimeout(t);
  }, [project?.id, sheet.id, viewport, hasStoredViewport]);

  useEffect(() => {
    latestViewportRef.current = viewport;
  }, [viewport]);

  useEffect(() => {
    if (!project?.id || !hasStoredViewport) return;
    const flush = () => {
      saveCanvasViewport(project.id, sheet.id, latestViewportRef.current);
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [project?.id, sheet.id, hasStoredViewport]);

  const fitToPage = useCallback(() => {
    if (size.w === 0 || size.h === 0) return;
    const padding = 48;
    const scaleX = (size.w - padding * 2) / sheet.pageWidth;
    const scaleY = (size.h - padding * 2) / sheet.pageHeight;
    const scale = Math.min(scaleX, scaleY);
    const x = (size.w - sheet.pageWidth * scale) / 2;
    const y = (size.h - sheet.pageHeight * scale) / 2;
    setViewport({ scale, x, y });
  }, [size.w, size.h, sheet.pageWidth, sheet.pageHeight, setViewport]);

  // Track space key for pan modifier
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        const t = e.target as HTMLElement;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
        setSpaceHeld(true);
        e.preventDefault();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceHeld(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = viewport.scale;
    const p = stage.getPointerPosition();
    let pointer = p && isFinite(p.x) && isFinite(p.y) ? p : null;
    if (!pointer) {
      const native = e.evt as WheelEvent;
      const rect = stage.container().getBoundingClientRect();
      pointer = { x: native.clientX - rect.left, y: native.clientY - rect.top };
    }
    if (!pointer) return;
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const factor = e.evt.deltaY === 0 ? 1 : 1 + 0.12 * direction;
    const newScale = Math.max(0.05, Math.min(20, oldScale * factor));
    setViewport({
      ...zoomCanvasViewportAt(viewport, pointer, newScale),
    });
  };

  // Resolve pointer position in stage (screen) coordinates, with a robust
  // fallback for browsers (e.g. Brave with strict Shields) where Konva's
  // `getPointerPosition()` can intermittently return null because of
  // canvas-API hardening.
  const stagePointerOf = (
    e: Konva.KonvaEventObject<MouseEvent>,
    stage: Konva.Stage,
  ): { x: number; y: number } | null => {
    const p = stage.getPointerPosition();
    if (p && isFinite(p.x) && isFinite(p.y)) return p;
    const native = e.evt;
    if (!native) return null;
    const rect = stage.container().getBoundingClientRect();
    return { x: native.clientX - rect.left, y: native.clientY - rect.top };
  };

  const onMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stagePointerOf(e, stage);
    if (!pointer) return;
    if (panning && panStart.current) {
      const dx = pointer.x - panStart.current.x;
      const dy = pointer.y - panStart.current.y;
      setViewport({
        x: panStart.current.stageX + dx,
        y: panStart.current.stageY + dy,
      });
      return;
    }
    const sheetX = (pointer.x - viewport.x) / viewport.scale;
    const sheetY = (pointer.y - viewport.y) / viewport.scale;
    setCursor({ x: sheetX, y: sheetY });
    rectHandlers.onMouseMove(e);
  };

  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const evt = e.evt;
    const isMiddle = evt.button === 1;
    const isPanTool = activeTool === "pan";
    if (isMiddle || spaceHeld || isPanTool) {
      const pointer = stagePointerOf(e, stage);
      if (!pointer) return;
      panStart.current = {
        x: pointer.x,
        y: pointer.y,
        stageX: viewport.x,
        stageY: viewport.y,
      };
      setPanning(true);
      evt.preventDefault();
      return;
    }
    rectHandlers.onMouseDown(e);
  };

  const onMouseUp = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!panning) rectHandlers.onMouseUp(e);
    setPanning(false);
    panStart.current = null;
  };

  const isCoarsePointer = () =>
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: none) and (pointer: coarse)").matches;

  const touchPointsFor = (stage: Konva.Stage, touches: TouchList) => {
    const rect = stage.container().getBoundingClientRect();
    return Array.from(touches).map((touch) => ({
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top,
    }));
  };

  const centerOf = (points: { x: number; y: number }[]) => ({
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  });

  const distanceBetween = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(b.x - a.x, b.y - a.y);

  const stopTouchDefaults = (e: Konva.KonvaEventObject<TouchEvent>) => {
    e.cancelBubble = true;
    e.evt.preventDefault();
    e.evt.stopPropagation();
  };

  const onTouchStart = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const touches = e.evt.touches;
    if (touches.length >= 2) {
      const points = touchPointsFor(stage, touches);
      const distance = distanceBetween(points[0], points[1]);
      if (!Number.isFinite(distance) || distance <= 0) return;
      stage.stopDrag();
      e.target?.stopDrag?.();
      touchGesture.current = {
        mode: "pinch",
        startCenter: centerOf(points),
        startDistance: distance,
        startViewport: latestViewportRef.current,
      };
      setPanning(false);
      panStart.current = null;
      stopTouchDefaults(e);
      return;
    }

    const shouldPan =
      activeTool === "pan" ||
      (activeTool === "select" && isCoarsePointer() && e.target === stage);
    if (!shouldPan || touches.length !== 1) return;

    const [point] = touchPointsFor(stage, touches);
    touchGesture.current = {
      mode: "pan",
      startCenter: point,
      startViewport: latestViewportRef.current,
    };
    setPanning(true);
    stopTouchDefaults(e);
  };

  const onTouchMove = (e: Konva.KonvaEventObject<TouchEvent>) => {
    const stage = stageRef.current;
    const gesture = touchGesture.current;
    if (!stage || !gesture) return;
    const touches = e.evt.touches;

    if (gesture.mode === "pinch" && touches.length >= 2) {
      const points = touchPointsFor(stage, touches);
      const center = centerOf(points);
      const distance = distanceBetween(points[0], points[1]);
      if (!Number.isFinite(distance) || distance <= 0) return;
      const scaled = zoomCanvasViewportAt(
        gesture.startViewport,
        gesture.startCenter,
        gesture.startViewport.scale * (distance / gesture.startDistance),
      );
      setViewport(
        panCanvasViewport(scaled, {
          x: center.x - gesture.startCenter.x,
          y: center.y - gesture.startCenter.y,
        }),
      );
      stopTouchDefaults(e);
      return;
    }

    if (gesture.mode === "pan" && touches.length === 1) {
      const [point] = touchPointsFor(stage, touches);
      setViewport(
        panCanvasViewport(gesture.startViewport, {
          x: point.x - gesture.startCenter.x,
          y: point.y - gesture.startCenter.y,
        }),
      );
      stopTouchDefaults(e);
    }
  };

  const onTouchEnd = (e: Konva.KonvaEventObject<TouchEvent>) => {
    if (touchGesture.current) stopTouchDefaults(e);
    touchGesture.current = null;
    setPanning(false);
  };

  // Cursor style
  const cursorStyle = (() => {
    if (panning) return "grabbing";
    if (spaceHeld || activeTool === "pan") return "grab";
    if (activeTool === "select") return "default";
    return "crosshair";
  })();

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 canvas-touch-surface"
      style={{ cursor: cursorStyle }}
    >
      {size.w > 0 && size.h > 0 && (
        <Stage
          ref={stageRef}
          width={size.w}
          height={size.h}
          onWheel={onWheel}
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          onDblClick={rectHandlers.onDblClick}
          onMouseLeave={() => {
            setCursor(null);
            setPanning(false);
          }}
        >
          {/* Background drawing (PDF / DXF / SVG / raster) */}
          <Layer
            listening={false}
            scaleX={viewport.scale}
            scaleY={viewport.scale}
            x={viewport.x}
            y={viewport.y}
          >
            <SheetBackground sheet={sheet} viewportScale={viewport.scale} />
          </Layer>

          {/* Markup overlay. Order matters:
              1. Hit-rect (transparent) catches blank-space clicks for tools.
              2. Markups render on top, so their own click handlers win over
                 the hit-rect for "click an existing device to select it".
              3. Preview shapes render last so the in-progress line/cloud is
                 always visible above devices. */}
          <Layer
            scaleX={viewport.scale}
            scaleY={viewport.scale}
            x={viewport.x}
            y={viewport.y}
          >
            <Rect
              x={0}
              y={0}
              width={sheet.pageWidth}
              height={sheet.pageHeight}
              fill="transparent"
              listening={false}
            />
            {/* Masks render between background and markups so devices stay
                visible on top while the user can still see what gets
                covered up at export time. */}
            <MaskLayer sheet={sheet} />
            <MarkupLayer sheet={sheet} />
            {/* Live ghost of the export's title block + legend so
                the user always sees what'll print, sized + positioned to
                match the export pixel-for-pixel (modulo Konva font
                metrics). Toggleable via the toolbar's eye button. */}
            <BrandPreview
              sheet={sheet}
              sheetIndex={Math.max(0, sheetIndex)}
              totalSheets={totalSheets}
            />
            {preview}
          </Layer>
        </Stage>
      )}
      <ZoomCluster onFit={fitToPage} />
      <SelectionActionBar />
      <MaskActionBar />
    </div>
  );
}
