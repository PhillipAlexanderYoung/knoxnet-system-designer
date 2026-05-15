import { Circle, Group, Line, Text, Rect, Arrow, Path, Label, Tag } from "react-konva";
import {
  useProjectStore,
  type Project,
  type Sheet,
  type Markup,
  type DeviceMarkup,
} from "../store/projectStore";
import { devicesById } from "../data/devices";
import { cablesById } from "../data/cables";
import { DeviceIconNode } from "./DeviceIconNode";
import { CoverageShape } from "./CoverageShape";
import { resolveCoverage, rangeFtToPts } from "../lib/coverage";
import {
  cloudPath,
  distancePts,
  formatFeet,
  polylineLengthPts,
  ptsToFeet,
} from "../lib/geometry";
import { categoryColor } from "../brand/tokens";
import {
  clampTagOffset,
  maxTagOffsetDistance,
  resolveTagFontSize,
} from "../lib/tagDefaults";

export function MarkupLayer({ sheet }: { sheet: Sheet }) {
  const project = useProjectStore((s) => s.project);
  const layers = useProjectStore((s) => s.layers);
  const selected = useProjectStore((s) => s.selectedMarkupIds);
  const setSelected = useProjectStore((s) => s.setSelected);
  const updateMarkup = useProjectStore((s) => s.updateMarkup);
  const deleteMarkup = useProjectStore((s) => s.deleteMarkup);
  const activeTool = useProjectStore((s) => s.activeTool);
  const setActiveTool = useProjectStore((s) => s.setActiveTool);
  const freehandErasing = useProjectStore((s) => s.freehandErasing);
  const coverageVisible = useProjectStore((s) => s.coverageVisible);

  const layerById = Object.fromEntries(layers.map((l) => [l.id, l]));
  const isLayerOff = (id: string) => layerById[id] && !layerById[id].visible;
  const isLayerLocked = (id: string) => layerById[id]?.locked === true;

  // Clicking a placed markup ALWAYS selects it, regardless of the active
  // tool. If the user was mid-placement (e.g. dropping cameras), we also
  // switch back to the select tool so the props panel + action bar are usable
  // immediately. cancelBubble stops the click from also reaching the
  // ToolDispatcher's hit Rect (which would otherwise drop a new device on top).
  // Special case: when the freehand-eraser sub-mode is on, clicking a
  // freehand stroke deletes it instead — that's the whole point of the
  // eraser, and it lets the user delete-then-keep-drawing without ever
  // leaving the freehand tool.
  const handleClick = (m: Markup) => (e: any) => {
    e.cancelBubble = true;
    if (e.evt) e.evt.stopPropagation?.();
    if (activeTool === "freehand" && freehandErasing && m.kind === "freehand") {
      deleteMarkup(m.id);
      return;
    }
    if (activeTool !== "select") setActiveTool("select");
    if (e.evt?.shiftKey) {
      const s = new Set(selected);
      if (s.has(m.id)) s.delete(m.id);
      else s.add(m.id);
      setSelected(Array.from(s));
    } else {
      setSelected([m.id]);
    }
  };

  return (
    <Group>
      {coverageVisible && sheet.calibration && (
        <Group listening={false}>
          {sheet.markups.map((m) => {
            if (m.hidden || m.kind !== "device") return null;
            if (isLayerOff(m.layer)) return null;
            const dm = m as DeviceMarkup;
            const cov = resolveCoverage(dm);
            if (!cov || !cov.enabled) return null;
            const r = rangeFtToPts(cov.rangeFt, sheet.calibration);
            if (r === null || r <= 0) return null;
            const apex =
              rangeFtToPts(cov.apexOffsetFt, sheet.calibration) ?? 0;
            return (
              <CoverageShape
                key={`cov-${m.id}`}
                coverage={cov}
                x={dm.x}
                y={dm.y}
                rangePts={r}
                apexOffsetPts={apex}
                rotation={dm.rotation ?? 0}
                selected={selected.includes(m.id)}
              />
            );
          })}
        </Group>
      )}

      {sheet.markups.map((m) => {
        if (m.hidden) return null;
        if (isLayerOff(m.layer)) return null;
        const isSel = selected.includes(m.id);
        const draggable =
          activeTool === "select" && !m.locked && !isLayerLocked(m.layer);
        return (
          <Group key={m.id}>
            {renderMarkup(m, sheet, isSel, draggable, handleClick(m), updateMarkup, project)}
          </Group>
        );
      })}
    </Group>
  );
}

function renderMarkup(
  m: Markup,
  sheet: Sheet,
  selected: boolean,
  draggable: boolean,
  onClick: (e: any) => void,
  updateMarkup: ReturnType<typeof useProjectStore.getState>["updateMarkup"],
  project: Project | null,
) {
  switch (m.kind) {
    case "device": {
      const dev = devicesById[m.deviceId];
      if (!dev) return null;
      const size = m.size ?? 28;
      const color = m.colorOverride ?? categoryColor[dev.category] ?? "#94A0B8";
      const labelText = m.labelOverride ? `${m.tag} · ${m.labelOverride}` : m.tag;
      // Tag font size: per-device override > project default > auto-scale.
      const tagFontSize = resolveTagFontSize(m, project);
      // Tag offset: stored on the markup when the user drags or types
      // a value; falls back to the historical top-right placement.
      const defaultDx = size / 2 + 4;
      const defaultDy = -size / 2 - 4;
      const tagDx = m.tagOffsetX ?? defaultDx;
      const tagDy = m.tagOffsetY ?? defaultDy;
      // Estimate the pill rect so the leader can clip cleanly to the
      // pill's edge instead of stabbing through the text. Konva sizes
      // the Label automatically at render time; the JetBrains Mono
      // approximation here matches what the export uses to keep the
      // editor preview aligned with the printed PDF.
      const padding = 4;
      const pillW = labelText.length * tagFontSize * 0.6 + padding * 2;
      const pillH = tagFontSize + padding * 2;
      const pillLeft = m.x + tagDx;
      const pillTop = m.y + tagDy;
      const pinned =
        m.tagOffsetX !== undefined || m.tagOffsetY !== undefined;
      // Always draw a leader when the tag has any custom offset — even
      // small nudges read as "this label belongs to that device" when
      // the line is present. Skips drawing when the tag still sits in
      // the default top-right pocket so a clean grid stays clean.
      const dist = Math.hypot(tagDx, tagDy);
      const wantLeader = pinned && dist > 0;
      // Anchor the leader to the disc edge on the device side and the
      // pill edge on the tag side so it never crosses through either.
      const r = size / 2;
      const leaderStart = wantLeader
        ? {
            x: m.x + (tagDx / dist) * r,
            y: m.y + (tagDy / dist) * r,
          }
        : null;
      // Closest point on the pill rect to the device center is the
      // device center clamped into the rect bounds. Same trick the
      // export uses (Math.max(left, Math.min(devX, right))).
      const leaderEnd = wantLeader
        ? {
            x: Math.max(pillLeft, Math.min(m.x, pillLeft + pillW)),
            y: Math.max(pillTop, Math.min(m.y, pillTop + pillH)),
          }
        : null;
      return (
        <Group>
          <DeviceIconNode
            device={dev}
            x={m.x}
            y={m.y}
            size={size}
            color={color}
            rotation={m.rotation ?? 0}
            selected={selected}
            onClick={onClick}
            onMouseDown={onClick}
            draggable={draggable}
            onDragEnd={(e) =>
              updateMarkup(m.id, { x: e.target.x(), y: e.target.y() } as any)
            }
          />
          {wantLeader && leaderStart && leaderEnd && (
            <>
              <Line
                points={[leaderStart.x, leaderStart.y, leaderEnd.x, leaderEnd.y]}
                stroke={color}
                strokeWidth={0.6}
                opacity={0.55}
                dash={[3, 2]}
                listening={false}
              />
              {/* Filled dot at the device end signals "user-pinned" so
                  the tag still reads as part of the device at a glance. */}
              <Circle
                x={leaderStart.x}
                y={leaderStart.y}
                radius={1.2}
                fill={color}
                opacity={0.85}
                listening={false}
              />
            </>
          )}
          <Label
            x={pillLeft}
            y={pillTop}
            draggable={draggable}
            // Distinguish click-then-mouse-out from intentional drag.
            // Without a threshold Konva starts dragging on mousedown and
            // the pill follows the cursor as the user moves toward the
            // Properties panel. 8 stage pixels matches the standard
            // browser click/drag boundary and keeps the tag "stuck" on
            // a click-only gesture so the user can read it without
            // accidentally repositioning it.
            dragDistance={8}
            onClick={onClick}
            onTap={onClick}
            onMouseDown={onClick}
            // Soft clamp during drag — keeps the pill visually tied to
            // the device by preventing the user from accidentally
            // stranding it across the sheet. Distance scales with
            // device size so big icons get correspondingly more reach.
            onDragMove={(e) => {
              const dx = e.target.x() - m.x;
              const dy = e.target.y() - m.y;
              const max = maxTagOffsetDistance(size);
              const d = Math.hypot(dx, dy);
              if (d > max) {
                const k = max / d;
                e.target.x(m.x + dx * k);
                e.target.y(m.y + dy * k);
              }
            }}
            onDragEnd={(e) => {
              const dx = e.target.x() - m.x;
              const dy = e.target.y() - m.y;
              const clamped = clampTagOffset(dx, dy, size);
              updateMarkup(m.id, {
                tagOffsetX: clamped.dx,
                tagOffsetY: clamped.dy,
              } as Partial<DeviceMarkup>);
            }}
          >
            <Tag
              fill="#0B1220"
              stroke={color}
              strokeWidth={0.75}
              cornerRadius={3}
              shadowColor="rgba(0,0,0,0.4)"
              shadowBlur={4}
              shadowOpacity={0.6}
              // Skip Konva's double-draw stroke pass — keeps the pill
              // edge crisp at any zoom without the soft-aliased halo
              // that the default redraw introduces.
              perfectDrawEnabled={false}
              strokeScaleEnabled={false}
            />
            <Text
              text={labelText}
              fontFamily="JetBrains Mono"
              fontStyle="500"
              fontSize={tagFontSize}
              fill="#F5F7FA"
              padding={padding}
              perfectDrawEnabled={false}
            />
          </Label>
        </Group>
      );
    }

    case "cable": {
      const cab = cablesById[m.cableId];
      if (!cab) return null;
      const lenPts = polylineLengthPts(m.points);
      const ftRaw = ptsToFeet(lenPts, sheet.calibration);
      const mid = midpointOfPolyline(m.points);
      // Always paint a pill — even on uncalibrated sheets — so the user can
      // see at a glance what cable type and (approximately) how long the
      // run is. With calibration we show real feet; without, we show raw
      // pixels with a "~" so it's obviously an estimate-not-a-measurement.
      const lengthText =
        ftRaw !== null
          ? formatFeet(ftRaw, 0)
          : `~${lenPts.toFixed(0)}px`;
      const labelLines = [`${cab.shortCode}  ${lengthText}`];
      if (m.connector) labelLines.push(m.connector);
      const endpoints = [m.endpointA, m.endpointB].filter(Boolean) as string[];
      // Endpoints render at the line ends (A → B); the center pill stays
      // tight with cable type + length + connector so it doesn't dominate
      // the drawing.
      const endA = m.points.length >= 2 ? { x: m.points[0], y: m.points[1] } : null;
      const endB =
        m.points.length >= 2
          ? { x: m.points[m.points.length - 2], y: m.points[m.points.length - 1] }
          : null;
      return (
        <Group>
          <Line
            points={m.points}
            stroke={cab.color}
            strokeWidth={(cab.thickness ?? 2) + (selected ? 1 : 0)}
            dash={cab.dash}
            lineCap="round"
            lineJoin="round"
            shadowColor={selected ? cab.color : undefined}
            shadowBlur={selected ? 8 : 0}
            onClick={onClick}
            onMouseDown={onClick}
            hitStrokeWidth={Math.max(10, (cab.thickness ?? 2) + 6)}
          />
          {mid && (
            <Label x={mid.x} y={mid.y - 12} listening={false}>
              <Tag
                fill="#0B1220"
                stroke={cab.color}
                strokeWidth={0.75}
                cornerRadius={6}
                pointerDirection="down"
                pointerWidth={6}
                pointerHeight={4}
              />
              <Text
                text={labelLines.join("  ·  ")}
                fontFamily="JetBrains Mono"
                fontStyle="500"
                fontSize={10}
                fill="#F5F7FA"
                padding={4}
              />
            </Label>
          )}
          {endpoints.length > 0 && endA && m.endpointA && (
            <Label x={endA.x + 6} y={endA.y - 8} listening={false}>
              <Tag fill={cab.color} cornerRadius={3} opacity={0.95} />
              <Text
                text={`A · ${m.endpointA}`}
                fontFamily="JetBrains Mono"
                fontStyle="600"
                fontSize={9}
                fill="#0B1220"
                padding={3}
              />
            </Label>
          )}
          {endpoints.length > 0 && endB && m.endpointB && (
            <Label x={endB.x + 6} y={endB.y - 8} listening={false}>
              <Tag fill={cab.color} cornerRadius={3} opacity={0.95} />
              <Text
                text={`B · ${m.endpointB}`}
                fontFamily="JetBrains Mono"
                fontStyle="600"
                fontSize={9}
                fill="#0B1220"
                padding={3}
              />
            </Label>
          )}
        </Group>
      );
    }

    case "text":
      return (
        <Text
          x={m.x}
          y={m.y}
          text={m.text}
          fontSize={m.fontSize}
          fontFamily="Inter"
          fill={m.color}
          onClick={onClick}
          onMouseDown={onClick}
          draggable={draggable}
          onDragEnd={(e) => updateMarkup(m.id, { x: e.target.x(), y: e.target.y() } as any)}
          shadowColor={selected ? "#F4B740" : undefined}
          shadowBlur={selected ? 6 : 0}
        />
      );

    case "callout": {
      const boxW = Math.max(60, m.text.length * 7 + 12);
      const boxH = 22;
      return (
        <Group onClick={onClick} onMouseDown={onClick}>
          <Line
            points={[m.x1, m.y1, m.x2, m.y2]}
            stroke={m.color}
            strokeWidth={1.5}
          />
          <Rect
            x={m.x2}
            y={m.y2 - boxH / 2}
            width={boxW}
            height={boxH}
            fill="#0B1220"
            stroke={m.color}
            strokeWidth={1}
            cornerRadius={3}
          />
          <Text
            x={m.x2 + 6}
            y={m.y2 - 6}
            text={m.text}
            fontSize={11}
            fontFamily="Inter"
            fill={m.color}
          />
          {selected && (
            <Rect
              x={m.x2 - 2}
              y={m.y2 - boxH / 2 - 2}
              width={boxW + 4}
              height={boxH + 4}
              stroke="#F4B740"
              strokeWidth={1}
              dash={[3, 3]}
              listening={false}
            />
          )}
        </Group>
      );
    }

    case "cloud":
      return (
        <Path
          data={cloudPath(m.x, m.y, m.width, m.height)}
          stroke={m.color}
          strokeWidth={selected ? 2.5 : 1.8}
          fill="rgba(0,0,0,0)"
          onClick={onClick}
          onMouseDown={onClick}
        />
      );

    case "dimension": {
      const lenPts = distancePts(m.p1, m.p2);
      const ft = ptsToFeet(lenPts, sheet.calibration);
      const midX = (m.p1.x + m.p2.x) / 2;
      const midY = (m.p1.y + m.p2.y) / 2;
      const angle = Math.atan2(m.p2.y - m.p1.y, m.p2.x - m.p1.x);
      const tickLen = 8;
      const px = -Math.sin(angle) * tickLen;
      const py = Math.cos(angle) * tickLen;
      return (
        <Group onClick={onClick} onMouseDown={onClick}>
          <Line points={[m.p1.x, m.p1.y, m.p2.x, m.p2.y]} stroke={m.color} strokeWidth={1.2} />
          <Line points={[m.p1.x - px, m.p1.y - py, m.p1.x + px, m.p1.y + py]} stroke={m.color} strokeWidth={1.2} />
          <Line points={[m.p2.x - px, m.p2.y - py, m.p2.x + px, m.p2.y + py]} stroke={m.color} strokeWidth={1.2} />
          <Label x={midX} y={midY - 14} listening={false}>
            <Tag fill="#0B1220" stroke={m.color} strokeWidth={0.75} cornerRadius={3} />
            <Text
              text={ft !== null ? formatFeet(ft) : `${lenPts.toFixed(0)} px`}
              fontFamily="JetBrains Mono"
              fontSize={11}
              fill={m.color}
              padding={3}
            />
          </Label>
        </Group>
      );
    }

    case "rect":
      return (
        <Rect
          x={m.x}
          y={m.y}
          width={m.width}
          height={m.height}
          stroke={m.color}
          fill={m.fill}
          strokeWidth={selected ? 2.5 : 1.5}
          onClick={onClick}
          onMouseDown={onClick}
          draggable={draggable}
          onDragEnd={(e) => updateMarkup(m.id, { x: e.target.x(), y: e.target.y() } as any)}
        />
      );

    case "arrow":
      return (
        <Arrow
          points={[m.p1.x, m.p1.y, m.p2.x, m.p2.y]}
          stroke={m.color}
          fill={m.color}
          strokeWidth={selected ? 2.5 : 1.6}
          pointerLength={10}
          pointerWidth={10}
          onClick={onClick}
          onMouseDown={onClick}
        />
      );

    case "polygon":
      return (
        <Line
          points={m.points}
          stroke={m.color}
          strokeWidth={selected ? 2.5 : 1.5}
          fill={m.fill}
          closed
          onClick={onClick}
          onMouseDown={onClick}
        />
      );

    case "freehand":
      return (
        <Line
          points={m.points}
          stroke={m.color}
          strokeWidth={m.thickness + (selected ? 1 : 0)}
          lineCap="round"
          lineJoin="round"
          tension={0.4}
          onClick={onClick}
          onTap={onClick}
          onMouseDown={onClick}
          // Generous hit area so the eraser tool feels forgiving — thin
          // pen strokes are otherwise nearly impossible to land a click on.
          hitStrokeWidth={Math.max(14, m.thickness + 10)}
          shadowColor={selected ? m.color : undefined}
          shadowBlur={selected ? 6 : 0}
        />
      );
  }
}

function midpointOfPolyline(points: number[]) {
  if (points.length < 4) return null;
  const total = polylineLengthPts(points);
  const target = total / 2;
  let acc = 0;
  for (let i = 2; i < points.length; i += 2) {
    const ax = points[i - 2];
    const ay = points[i - 1];
    const bx = points[i];
    const by = points[i + 1];
    const seg = Math.hypot(bx - ax, by - ay);
    if (acc + seg >= target) {
      const t = (target - acc) / seg;
      return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
    }
    acc += seg;
  }
  return { x: points[points.length - 2], y: points[points.length - 1] };
}
