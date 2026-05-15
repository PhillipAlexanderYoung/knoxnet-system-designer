import { useMemo } from "react";
import { Group, Line, Circle, Arc, Rect, Text } from "react-konva";
import type { Sheet } from "../store/projectStore";
import type {
  DxfBlock,
  DxfEntity,
  DxfParsedDoc,
  DxfPoint,
  DxfSheetSource,
} from "../lib/sheetSource";

/**
 * Konva-based DXF renderer. Walks the parsed entity list and emits a
 * Konva node per drawable. Pure vector — zooms infinitely without
 * raster blurring, which is the whole point of supporting DXF.
 *
 * Coordinate transform: DXF uses a math-style Y-up convention (Y grows
 * upward), while every other source kind in KnoxNet uses Y-down (top-
 * left origin). We flip Y inside a parent Group and translate by the
 * drawing's min-bound so (0,0) on the editor canvas aligns with the
 * top-left of the drawing's bounding box.
 *
 * Supported entities (covers the 80% case for real architectural DXFs):
 *   LINE, CIRCLE, ARC, ELLIPSE, LWPOLYLINE, POLYLINE, TEXT, MTEXT,
 *   INSERT (with non-recursive block expansion), POINT.
 *
 * Unsupported entities are silently skipped at parse time and reported
 * via `parsed.skippedEntityTypes` so the UI can surface a toast.
 */
export function DxfBackground({ sheet }: { sheet: Sheet }) {
  const source = sheet.source;
  if (!source || source.kind !== "dxf") return null;
  return <DxfBackgroundInner sheet={sheet} source={source} />;
}

function DxfBackgroundInner({
  sheet,
  source,
}: {
  sheet: Sheet;
  source: DxfSheetSource;
}) {
  const { parsed } = source;
  // Memoise the rendered node tree — entities are immutable per parse,
  // so we never need to recompute these on viewport changes.
  const nodes = useMemo(() => renderEntities(parsed, parsed.entities), [parsed]);

  const { minX, minY } = parsed.bounds;
  // Two transforms stacked: translate so the drawing's top-left bound
  // sits at (0,0) in editor coords, then flip Y so DXF's math-Y-up
  // becomes editor Y-down.
  return (
    <>
      <Rect
        x={0}
        y={0}
        width={sheet.pageWidth}
        height={sheet.pageHeight}
        fill="#ffffff"
        shadowColor="rgba(0,0,0,0.6)"
        shadowBlur={20}
        shadowOffset={{ x: 0, y: 8 }}
        shadowOpacity={1}
      />
      <Group
        listening={false}
        x={-minX}
        y={sheet.pageHeight + minY}
        scaleY={-1}
      >
        {nodes}
      </Group>
    </>
  );
}

// ───────── Entity → Konva nodes ─────────

const DEFAULT_STROKE = "#1B2433";

function aciToHex(idx: number | undefined): string {
  // Tiny lookup for the most common AutoCAD Color Index values; anything
  // else falls back to the default ink color. We deliberately keep this
  // table short — DXF renderers can spend pages on color handling and
  // it's not material to the user's design experience.
  if (idx === undefined) return DEFAULT_STROKE;
  switch (idx) {
    case 1: return "#FF0000";
    case 2: return "#FFFF00";
    case 3: return "#00FF00";
    case 4: return "#00FFFF";
    case 5: return "#0000FF";
    case 6: return "#FF00FF";
    case 7: return DEFAULT_STROKE;
    case 8: return "#414141";
    case 9: return "#808080";
    default: return DEFAULT_STROKE;
  }
}

interface EntityWithColor {
  color?: number;
  colorIndex?: number;
}

function strokeFor(e: EntityWithColor): string {
  if (e.color && Number.isFinite(e.color)) {
    // dxf-parser exposes truecolor as a 24-bit RGB integer in `color`.
    const c = e.color;
    return "#" + c.toString(16).padStart(6, "0");
  }
  return aciToHex(e.colorIndex);
}

function safeNum(x: unknown, fallback = 0): number {
  return typeof x === "number" && Number.isFinite(x) ? x : fallback;
}

function pt(p: DxfPoint | undefined): [number, number] | null {
  if (!p) return null;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return [p.x, p.y];
}

function renderEntities(
  parsed: DxfParsedDoc,
  entities: DxfEntity[],
  prefix: string = "",
): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  entities.forEach((e, i) => {
    const key = `${prefix}${i}-${e.type}`;
    const node = renderOne(parsed, e, key);
    if (node) out.push(node);
  });
  return out;
}

function renderOne(
  parsed: DxfParsedDoc,
  e: DxfEntity,
  key: string,
): React.ReactNode | null {
  switch (e.type) {
    case "LINE": {
      const v = (e as { vertices?: DxfPoint[] }).vertices ?? [];
      if (v.length < 2) return null;
      const flat: number[] = [];
      for (const p of v) {
        const xy = pt(p);
        if (xy) flat.push(xy[0], xy[1]);
      }
      if (flat.length < 4) return null;
      return (
        <Line
          key={key}
          points={flat}
          stroke={strokeFor(e)}
          strokeWidth={0.5}
          strokeScaleEnabled={false}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      );
    }
    case "CIRCLE": {
      const c = (e as { center?: DxfPoint; radius?: number });
      const xy = pt(c.center);
      if (!xy || !c.radius) return null;
      return (
        <Circle
          key={key}
          x={xy[0]}
          y={xy[1]}
          radius={safeNum(c.radius, 1)}
          stroke={strokeFor(e)}
          strokeWidth={0.5}
          strokeScaleEnabled={false}
          listening={false}
        />
      );
    }
    case "ARC": {
      const a = (e as {
        center?: DxfPoint;
        radius?: number;
        startAngle?: number;
        endAngle?: number;
      });
      const xy = pt(a.center);
      if (!xy || !a.radius) return null;
      // dxf-parser delivers angles in radians; Konva's <Arc> uses degrees
      // and measures clockwise from the +X axis. Our parent Group has
      // scaleY = -1 which already flips the sweep direction, so the
      // start/end map naturally.
      const startDeg = (safeNum(a.startAngle) * 180) / Math.PI;
      const endDeg = (safeNum(a.endAngle) * 180) / Math.PI;
      let sweep = endDeg - startDeg;
      if (sweep < 0) sweep += 360;
      return (
        <Arc
          key={key}
          x={xy[0]}
          y={xy[1]}
          innerRadius={safeNum(a.radius, 1)}
          outerRadius={safeNum(a.radius, 1)}
          angle={sweep}
          rotation={startDeg}
          stroke={strokeFor(e)}
          strokeWidth={0.5}
          strokeScaleEnabled={false}
          listening={false}
        />
      );
    }
    case "ELLIPSE": {
      // Approximate with a circle when axisRatio is close to 1 — good
      // enough for floor plans where ellipses are usually labels or
      // furniture. A full elliptical-arc renderer is a substantial
      // chunk of code we'd add later.
      const el = e as {
        center?: DxfPoint;
        majorAxisEndPoint?: DxfPoint;
        axisRatio?: number;
      };
      const xy = pt(el.center);
      if (!xy || !el.majorAxisEndPoint) return null;
      const major = Math.hypot(el.majorAxisEndPoint.x, el.majorAxisEndPoint.y);
      const minor = major * safeNum(el.axisRatio, 1);
      // Render as an approximated polyline so non-circular ellipses
      // still look right.
      const flat: number[] = [];
      const steps = 36;
      for (let i = 0; i <= steps; i++) {
        const t = (i / steps) * Math.PI * 2;
        flat.push(xy[0] + Math.cos(t) * major, xy[1] + Math.sin(t) * minor);
      }
      return (
        <Line
          key={key}
          points={flat}
          stroke={strokeFor(e)}
          strokeWidth={0.5}
          strokeScaleEnabled={false}
          closed={true}
          listening={false}
        />
      );
    }
    case "LWPOLYLINE":
    case "POLYLINE": {
      const p = e as { vertices?: DxfPoint[]; shape?: boolean };
      const v = p.vertices ?? [];
      if (v.length < 2) return null;
      const flat: number[] = [];
      for (const pp of v) {
        const xy = pt(pp);
        if (xy) flat.push(xy[0], xy[1]);
      }
      if (flat.length < 4) return null;
      return (
        <Line
          key={key}
          points={flat}
          stroke={strokeFor(e)}
          strokeWidth={0.5}
          strokeScaleEnabled={false}
          closed={!!p.shape}
          lineCap="round"
          lineJoin="round"
          listening={false}
        />
      );
    }
    case "TEXT":
    case "MTEXT": {
      const t = e as {
        startPoint?: DxfPoint;
        position?: DxfPoint;
        text?: string;
        textHeight?: number;
        rotation?: number;
      };
      const anchor = t.startPoint ?? t.position;
      const xy = pt(anchor);
      if (!xy) return null;
      const text = (t.text ?? "").trim();
      if (!text) return null;
      // DXF rotation is counter-clockwise from +X in degrees; our
      // parent group has scaleY = -1 which would mirror text. Counter
      // by flipping the text node back along Y so glyphs read correctly.
      return (
        <Text
          key={key}
          x={xy[0]}
          y={xy[1]}
          text={text}
          fontSize={safeNum(t.textHeight, 1)}
          rotation={-safeNum(t.rotation, 0)}
          scaleY={-1}
          fill={strokeFor(e)}
          listening={false}
        />
      );
    }
    case "POINT": {
      const xy = pt((e as { position?: DxfPoint }).position);
      if (!xy) return null;
      return (
        <Circle
          key={key}
          x={xy[0]}
          y={xy[1]}
          radius={0.4}
          fill={strokeFor(e)}
          strokeScaleEnabled={false}
          listening={false}
        />
      );
    }
    case "INSERT": {
      const ins = e as {
        name?: string;
        position?: DxfPoint;
        xScale?: number;
        yScale?: number;
        rotation?: number;
      };
      const blockName = ins.name;
      const xy = pt(ins.position);
      if (!blockName || !xy) return null;
      const block: DxfBlock | undefined = parsed.blocks[blockName];
      if (!block || !block.entities?.length) return null;
      const bp = block.basePoint ?? { x: 0, y: 0 };
      const sx = safeNum(ins.xScale, 1);
      const sy = safeNum(ins.yScale, 1);
      // Recursively render block contents, transformed into world space.
      // We cap recursion at 4 levels via the key prefix so a pathologically
      // self-referential drawing can't lock the renderer.
      const depth = (key.match(/\|/g) ?? []).length;
      if (depth > 4) return null;
      return (
        <Group
          key={key}
          x={xy[0]}
          y={xy[1]}
          rotation={safeNum(ins.rotation, 0)}
          scaleX={sx}
          scaleY={sy}
          offsetX={bp.x}
          offsetY={bp.y}
          listening={false}
        >
          {renderEntities(parsed, block.entities, key + "|")}
        </Group>
      );
    }
    default:
      return null;
  }
}
