import { memo, useCallback, useMemo } from "react";
import { Circle, Group, Line, Text, Rect, Arrow, Path, Label, Tag } from "react-konva";
import {
  useProjectStore,
  type Calibration,
  type Sheet,
  type Markup,
  type DeviceMarkup,
  type DeviceConnection,
} from "../store/projectStore";
import { devicesById } from "../data/devices";
import { cablesById } from "../data/cables";
import { DeviceIconNode } from "./DeviceIconNode";
import { CoverageShape } from "./CoverageShape";
import {
  resolveCoverage,
  rangeFtToPts,
  rotationDegFromPoint,
} from "../lib/coverage";
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
import {
  endpointFromMarkup,
  runCountFor,
  runLabelLayoutsFor,
  type RunLabelLayout,
  type CableRunEndpointKey,
} from "../lib/cableRuns";
import { compactConduitLabel } from "../lib/conduit";
import { fiberCompactLabel } from "../lib/fiber";
import { sortMarkupsForRender } from "../lib/markupOrdering";
import {
  isContainerDevice,
  nestedBubbleLabel,
  nestedBubbleLabelColor,
  nestedBubblePoint,
  nestedBubbleSize,
  nestedChildren,
  type NestedScheduleItem,
  nestedScheduleItems,
  nestedScheduleTitle,
} from "../lib/nesting";

type TagSettings = { tagDefaults?: { fontSize?: number } } | null;

export const MarkupLayer = memo(function MarkupLayer({ sheet }: { sheet: Sheet }) {
  const connections = useProjectStore((s) => s.project?.connections ?? []);
  const tagDefaults = useProjectStore((s) => s.project?.tagDefaults);
  const layers = useProjectStore((s) => s.layers);
  const selected = useProjectStore((s) => s.selectedMarkupIds);
  const setSelected = useProjectStore((s) => s.setSelected);
  const updateMarkup = useProjectStore((s) => s.updateMarkup);
  const moveDeviceMarkup = useProjectStore((s) => s.moveDeviceMarkup);
  const beginHistoryTransaction = useProjectStore((s) => s.beginHistoryTransaction);
  const endHistoryTransaction = useProjectStore((s) => s.endHistoryTransaction);
  const deleteMarkup = useProjectStore((s) => s.deleteMarkup);
  const activeTool = useProjectStore((s) => s.activeTool);
  const setActiveTool = useProjectStore((s) => s.setActiveTool);
  const placeCableRunEndpoint = useProjectStore((s) => s.placeCableRunEndpoint);
  const branchCableRunEndpoint = useProjectStore((s) => s.branchCableRunEndpoint);
  const appendCableRunPath = useProjectStore((s) => s.appendCableRunPath);
  const freehandErasing = useProjectStore((s) => s.freehandErasing);
  const coverageVisible = useProjectStore((s) => s.coverageVisible);
  const runLabelsVisible = useProjectStore((s) => s.runLabelsVisible);

  const tagSettings = useMemo<TagSettings>(
    () => (tagDefaults ? { tagDefaults } : null),
    [tagDefaults],
  );
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const runLabelLayouts = useMemo(
    () =>
      runLabelLayoutsFor(sheet.markups, {
        selectedIds: selectedSet,
        showRunLabels: runLabelsVisible,
      }),
    [runLabelsVisible, selectedSet, sheet.markups],
  );
  const layerById = useMemo(
    () => Object.fromEntries(layers.map((l) => [l.id, l])),
    [layers],
  );
  const orderedMarkups = useMemo(
    () => sortMarkupsForRender(sheet.markups, layers),
    [layers, sheet.markups],
  );
  const isLayerOff = useCallback(
    (id: string) => layerById[id] && !layerById[id].visible,
    [layerById],
  );
  const isLayerLocked = useCallback(
    (id: string) => layerById[id]?.locked === true,
    [layerById],
  );

  // Clicking a placed markup usually selects it, regardless of the active
  // tool. Cable Run is the one placement-mode exception: device clicks become
  // endpoint picks so the user can click equipment center-to-center.
  // cancelBubble stops the click from also reaching the ToolDispatcher's hit
  // Rect (which would otherwise drop a new device/cable point underneath).
  // Special case: when the freehand-eraser sub-mode is on, clicking a
  // freehand stroke deletes it instead — that's the whole point of the
  // eraser, and it lets the user delete-then-keep-drawing without ever
  // leaving the freehand tool.
  const handleMarkupClick = useCallback(
    (m: Markup, e: any) => {
      e.cancelBubble = true;
      if (e.evt) e.evt.stopPropagation?.();
      if (activeTool === "freehand" && freehandErasing && m.kind === "freehand") {
        deleteMarkup(m.id);
        return;
      }
      if (activeTool === "cable") {
        const branchModifier = !!(
          e.evt?.altKey ||
          e.evt?.ctrlKey ||
          e.evt?.metaKey
        );
        const routeThroughModifier = !!e.evt?.shiftKey;
        const modifier = branchModifier || routeThroughModifier;
        if (m.kind === "cable" && modifier) {
          appendCableRunPath(m.points);
          return;
        }
        const endpoint = endpointFromMarkup(m, {
          asRouteWaypoint: routeThroughModifier,
        });
        if (endpoint) {
          if (branchModifier) branchCableRunEndpoint(endpoint);
          else placeCableRunEndpoint(endpoint);
        }
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
    },
    [
      activeTool,
      appendCableRunPath,
      branchCableRunEndpoint,
      deleteMarkup,
      freehandErasing,
      placeCableRunEndpoint,
      selected,
      setActiveTool,
      setSelected,
    ],
  );

  const handleRunLabelClick = useCallback(
    (m: Markup, e: any) => {
      e.cancelBubble = true;
      if (e.evt) e.evt.stopPropagation?.();
      if (activeTool !== "select") setActiveTool("select");
      if (e.evt?.shiftKey) {
        const s = new Set(selected);
        if (s.has(m.id)) s.delete(m.id);
        else s.add(m.id);
        setSelected(Array.from(s));
      } else {
        setSelected([m.id]);
      }
    },
    [activeTool, selected, setActiveTool, setSelected],
  );

  return (
    <Group>
      {coverageVisible && sheet.calibration && (
        <Group listening={false}>
          {sheet.markups.map((m) => {
            if (m.hidden || m.kind !== "device") return null;
            if (isLayerOff(m.layer)) return null;
            const parent = m.parentId
              ? sheet.markups.find(
                  (candidate): candidate is DeviceMarkup =>
                    candidate.kind === "device" && candidate.id === m.parentId,
                )
              : null;
            if (parent) return null;
            return (
              <CoverageOverlay
                key={`cov-${m.id}`}
                markup={m}
                calibration={sheet.calibration!}
                selected={selectedSet.has(m.id)}
              />
            );
          })}
        </Group>
      )}

      {orderedMarkups.map((m) => {
        if (m.hidden) return null;
        if (isLayerOff(m.layer)) return null;
        const isSel = selectedSet.has(m.id);
        const draggable =
          activeTool === "select" && !m.locked && !isLayerLocked(m.layer);
        return (
          <MarkupNode
            key={m.id}
            markup={m}
            calibration={sheet.calibration}
            sheetMarkups={
              m.kind === "device" || (m.kind === "cable" && isSel && draggable)
                ? sheet.markups
                : undefined
            }
            connections={connections}
            selected={isSel}
            draggable={draggable}
            onMarkupClick={handleMarkupClick}
            onRunLabelClick={handleRunLabelClick}
            updateMarkup={updateMarkup}
            moveDeviceMarkup={moveDeviceMarkup}
            beginHistoryTransaction={beginHistoryTransaction}
            endHistoryTransaction={endHistoryTransaction}
            tagSettings={tagSettings}
            runLabelLayout={m.kind === "cable" ? runLabelLayouts.get(m.id) : undefined}
          />
        );
      })}
    </Group>
  );
});

const CoverageOverlay = memo(function CoverageOverlay({
  markup,
  calibration,
  selected,
}: {
  markup: DeviceMarkup;
  calibration: Calibration;
  selected: boolean;
}) {
  const cov = resolveCoverage(markup);
  if (!cov || !cov.enabled) return null;
  const r = rangeFtToPts(cov.rangeFt, calibration);
  if (r === null || r <= 0) return null;
  const apex = rangeFtToPts(cov.apexOffsetFt, calibration) ?? 0;
  return (
    <CoverageShape
      coverage={cov}
      x={markup.x}
      y={markup.y}
      rangePts={r}
      apexOffsetPts={apex}
      rotation={markup.rotation ?? 0}
      selected={selected}
    />
  );
});

const MarkupNode = memo(function MarkupNode({
  markup,
  calibration,
  sheetMarkups,
  connections,
  selected,
  draggable,
  onMarkupClick,
  onRunLabelClick,
  updateMarkup,
  moveDeviceMarkup,
  beginHistoryTransaction,
  endHistoryTransaction,
  tagSettings,
  runLabelLayout,
}: {
  markup: Markup;
  calibration: Calibration | undefined;
  sheetMarkups?: Markup[];
  connections: DeviceConnection[];
  selected: boolean;
  draggable: boolean;
  onMarkupClick: (m: Markup, e: any) => void;
  onRunLabelClick: (m: Markup, e: any) => void;
  updateMarkup: ReturnType<typeof useProjectStore.getState>["updateMarkup"];
  moveDeviceMarkup: ReturnType<typeof useProjectStore.getState>["moveDeviceMarkup"];
  beginHistoryTransaction: ReturnType<typeof useProjectStore.getState>["beginHistoryTransaction"];
  endHistoryTransaction: ReturnType<typeof useProjectStore.getState>["endHistoryTransaction"];
  tagSettings: TagSettings;
  runLabelLayout?: RunLabelLayout;
}) {
  const handleClick = useCallback(
    (e: any) => onMarkupClick(markup, e),
    [markup, onMarkupClick],
  );
  const handleRunLabelClick = useCallback(
    (e: any) => onRunLabelClick(markup, e),
    [markup, onRunLabelClick],
  );

  return (
    <Group>
      {renderMarkup(
        markup,
        calibration,
        sheetMarkups ?? [],
        connections,
        selected,
        draggable,
        handleClick,
        handleRunLabelClick,
        updateMarkup,
        moveDeviceMarkup,
        beginHistoryTransaction,
        endHistoryTransaction,
        tagSettings,
        runLabelLayout,
      )}
    </Group>
  );
});

function NestedScheduleTag({
  parent,
  items,
  overflow,
  color,
  x,
  y,
}: {
  parent: DeviceMarkup;
  items: NestedScheduleItem[];
  overflow: number;
  color: string;
  x: number;
  y: number;
}) {
  const title = nestedScheduleTitle(parent);
  const rows = items.map((item) =>
    item.connectionSummary
      ? `${item.deviceName} -> ${item.connectionSummary}`
      : item.deviceName,
  );
  if (overflow > 0) rows.push(`+ ${overflow} more`);
  const fontSize = 7.25;
  const longest = [title, ...rows].reduce((max, line) => Math.max(max, line.length), 0);
  const width = Math.max(98, Math.min(220, longest * fontSize * 0.58 + 16));
  const height = 18 + rows.length * (fontSize + 3) + 6;
  return (
    <Group x={x} y={y} listening={false}>
      <Rect
        width={width}
        height={height}
        fill="rgba(11,18,32,0.94)"
        stroke={color}
        strokeWidth={0.65}
        cornerRadius={4}
        shadowColor="rgba(0,0,0,0.35)"
        shadowBlur={5}
        shadowOpacity={0.55}
        perfectDrawEnabled={false}
      />
      <Text
        text={title}
        x={7}
        y={5}
        width={width - 14}
        fontFamily="JetBrains Mono"
        fontStyle="700"
        fontSize={fontSize}
        fill="#F4B740"
        ellipsis
        perfectDrawEnabled={false}
      />
      {rows.map((line, i) => (
        <Text
          key={`${parent.id}-nested-row-${i}`}
          text={line}
          x={7}
          y={18 + i * (fontSize + 3)}
          width={width - 14}
          fontFamily="JetBrains Mono"
          fontSize={fontSize}
          fill="#D9E2F2"
          ellipsis
          perfectDrawEnabled={false}
        />
      ))}
    </Group>
  );
}

function renderMarkup(
  m: Markup,
  calibration: Calibration | undefined,
  sheetMarkups: Markup[],
  connections: DeviceConnection[],
  selected: boolean,
  draggable: boolean,
  onClick: (e: any) => void,
  onRunLabelClick: (e: any) => void,
  updateMarkup: ReturnType<typeof useProjectStore.getState>["updateMarkup"],
  moveDeviceMarkup: ReturnType<typeof useProjectStore.getState>["moveDeviceMarkup"],
  beginHistoryTransaction: ReturnType<typeof useProjectStore.getState>["beginHistoryTransaction"],
  endHistoryTransaction: ReturnType<typeof useProjectStore.getState>["endHistoryTransaction"],
  tagSettings: TagSettings,
  runLabelLayout?: RunLabelLayout,
) {
  switch (m.kind) {
    case "device": {
      const dev = devicesById[m.deviceId];
      if (!dev) return null;
      const size = m.size ?? 28;
      const color = m.colorOverride ?? categoryColor[dev.category] ?? "#94A0B8";
      const labelText = m.labelOverride ? `${m.tag} · ${m.labelOverride}` : m.tag;
      const parent = m.parentId
        ? sheetMarkups.find(
            (candidate): candidate is DeviceMarkup =>
              candidate.kind === "device" && candidate.id === m.parentId,
          )
        : null;
      const compactNested = !!parent;
      const bubblePoint =
        compactNested && parent ? nestedBubblePoint(sheetMarkups, parent, m) : null;
      const bubbleSize = compactNested ? nestedBubbleSize(m) : size;
      const bubbleLabel = compactNested ? nestedBubbleLabel(m) : "";
      const bubbleLabelFontSize =
        bubbleLabel.length > 0
          ? Math.max(4, Math.min(5.4, (bubbleSize - 2) / (bubbleLabel.length * 0.55)))
          : 4.5;
      const bubbleLabelColor = compactNested ? nestedBubbleLabelColor("#0B1220") : "#FFFFFF";
      const containerScheduleItems =
        m.showNestedDevices && isContainerDevice(m)
          ? nestedScheduleItems(sheetMarkups, m.id, connections, 6)
          : [];
      const cov = resolveCoverage(m);
      const showAimHandle =
        selected &&
        draggable &&
        cov?.isCamera &&
        (cov.shape === "sector" || cov.shape === "beam" || cov.shape === "rect");
      const aimHandle = showAimHandle
        ? cameraAimHandlePoint(m, calibration, cov.rangeFt, size)
        : null;
      // Tag font size: per-device override > project default > auto-scale.
      const tagFontSize = resolveTagFontSize(m, tagSettings);
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
      if (compactNested) {
        const bx = bubblePoint?.x ?? m.x;
        const by = bubblePoint?.y ?? m.y;
        return (
          <Group>
            <DeviceIconNode
              device={dev}
              x={bx}
              y={by}
              size={bubbleSize}
              color={color}
              rotation={m.rotation ?? 0}
              selected={selected}
              onClick={onClick}
              onMouseDown={onClick}
              draggable={draggable}
              onDragStart={() => beginHistoryTransaction()}
              onDragMove={(e) => moveDeviceMarkup(m.id, e.target.x(), e.target.y())}
              onDragEnd={(e) => {
                moveDeviceMarkup(m.id, e.target.x(), e.target.y());
                endHistoryTransaction();
              }}
            />
            <Text
              text={bubbleLabel}
              x={bx - bubbleSize / 2}
              y={by - bubbleSize / 2}
              width={bubbleSize}
              height={bubbleSize}
              align="center"
              verticalAlign="middle"
              fontFamily="JetBrains Mono"
              fontStyle="700"
              fontSize={bubbleLabelFontSize}
              fill={bubbleLabelColor}
              listening={false}
              perfectDrawEnabled={false}
            />
          </Group>
        );
      }
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
            onDragStart={() => beginHistoryTransaction()}
            onDragMove={(e) => moveDeviceMarkup(m.id, e.target.x(), e.target.y())}
            onDragEnd={(e) => {
              moveDeviceMarkup(m.id, e.target.x(), e.target.y());
              endHistoryTransaction();
            }}
          />
          {containerScheduleItems.length > 0 && (
            <NestedScheduleTag
              parent={m}
              items={containerScheduleItems}
              color={color}
              x={m.x + size / 2 + 10}
              y={m.y + size / 2 + 10}
              overflow={nestedChildren(sheetMarkups, m.id).length - containerScheduleItems.length}
            />
          )}
          {showAimHandle && aimHandle && (
            <>
              <Line
                points={[
                  m.x + ((aimHandle.x - m.x) / aimHandle.distance) * (size / 2 + 3),
                  m.y + ((aimHandle.y - m.y) / aimHandle.distance) * (size / 2 + 3),
                  aimHandle.x,
                  aimHandle.y,
                ]}
                stroke="#F4B740"
                strokeWidth={0.65}
                opacity={0.55}
                dash={[3, 3]}
                listening={false}
              />
              <Group
                x={aimHandle.x}
                y={aimHandle.y}
                draggable
                dragDistance={2}
                onMouseEnter={(e) => setStageCursor(e, "grab")}
                onMouseLeave={(e) => setStageCursor(e, "")}
                onMouseDown={(e) => {
                  onClick(e);
                  e.cancelBubble = true;
                  e.evt?.stopPropagation?.();
                }}
                onDragStart={(e) => {
                  e.cancelBubble = true;
                  beginHistoryTransaction();
                  setStageCursor(e, "grabbing");
                }}
                onDragMove={(e) => {
                  e.cancelBubble = true;
                  updateMarkup(m.id, {
                    rotation: Math.round(
                      rotationDegFromPoint(
                        { x: m.x, y: m.y },
                        { x: e.target.x(), y: e.target.y() },
                      ),
                    ),
                  } as Partial<DeviceMarkup>);
                }}
                onDragEnd={(e) => {
                  e.cancelBubble = true;
                  setStageCursor(e, "grab");
                  updateMarkup(m.id, {
                    rotation: Math.round(
                      rotationDegFromPoint(
                        { x: m.x, y: m.y },
                        { x: e.target.x(), y: e.target.y() },
                      ),
                    ),
                  } as Partial<DeviceMarkup>);
                  endHistoryTransaction();
                }}
              >
                <Circle
                  radius={8}
                  fill="rgba(244,183,64,0.01)"
                />
                <Circle
                  radius={1.1}
                  fill="#F4B740"
                  stroke="#FFE7A8"
                  strokeWidth={0.35}
                  shadowColor="#F4B740"
                  shadowBlur={2.5}
                  listening={false}
                />
                <Circle
                  x={-0.35}
                  y={-0.4}
                  radius={0.35}
                  fill="#FFFFFF"
                  opacity={0.85}
                  listening={false}
                />
              </Group>
            </>
          )}
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
      const ftRaw = ptsToFeet(lenPts, calibration);
      const mid = midpointOfPolyline(m.points);
      const runCount = runCountFor(m);
      // Always paint a pill — even on uncalibrated sheets — so the user can
      // see at a glance what cable type and (approximately) how long the
      // run is. With calibration we show real feet; without, we show raw
      // pixels with a "~" so it's obviously an estimate-not-a-measurement.
      const lengthText =
        ftRaw !== null
          ? formatFeet(ftRaw, 0)
          : `~${lenPts.toFixed(0)}px`;
      const labelPrefix =
        m.cableId === "conduit"
          ? compactConduitLabel(m)
          : fiberCompactLabel(m.cableId, cab.shortCode, m);
      const labelText = visualRunLabel(
        m,
        labelPrefix,
        runCount,
        lengthText,
      );
      const labelFontSize = labelText.includes("\n") ? 7 : 8;
      const labelLines = labelText.split("\n");
      const longestLabelLine = labelLines.reduce((max, line) => Math.max(max, line.length), 0);
      const labelH = labelLines.length > 1 ? 22 : 14;
      const labelW = Math.min(
        220,
        Math.max(44, longestLabelLine * labelFontSize * 0.58 + 12),
      );
      const labelOffset = runLabelLayout?.offset ?? { dx: 0, dy: -11 };
      const labelVisible = runLabelLayout?.visible === true;
      const arched = m.routeStyle === "archedDrop" && m.points.length === 4;
      return (
        <Group>
          {arched ? (
            <Path
              data={archedCablePath(m.points)}
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
          ) : (
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
          )}
          {mid && labelVisible && (
            <Group
              x={mid.x + labelOffset.dx}
              y={mid.y + labelOffset.dy}
              listening
              draggable={draggable}
              dragDistance={3}
              onClick={onRunLabelClick}
              onTap={onRunLabelClick}
              onMouseEnter={(e) => draggable && setStageCursor(e, "grab")}
              onMouseLeave={(e) => draggable && setStageCursor(e, "")}
              onMouseDown={(e) => {
                onRunLabelClick(e);
                e.cancelBubble = true;
                e.evt?.stopPropagation?.();
              }}
              onDragStart={(e) => {
                e.cancelBubble = true;
                beginHistoryTransaction();
                setStageCursor(e, "grabbing");
              }}
              onDragMove={(e) => {
                e.cancelBubble = true;
              }}
              onDragEnd={(e) => {
                e.cancelBubble = true;
                setStageCursor(e, "grab");
                updateMarkup(m.id, {
                  labelOffsetX: e.target.x() - mid.x,
                  labelOffsetY: e.target.y() - mid.y,
                } as any);
                endHistoryTransaction();
              }}
            >
              <Rect
                x={-labelW / 2}
                y={-labelH / 2}
                width={labelW}
                height={labelH}
                fill="#0B1220"
                stroke={cab.color}
                strokeWidth={0.55}
                cornerRadius={3}
                opacity={0.92}
                shadowColor="rgba(0,0,0,0.55)"
                shadowBlur={3}
                shadowOpacity={0.55}
                perfectDrawEnabled={false}
              />
              {selected && draggable && (
                <Circle
                  x={labelW / 2 - 3.5}
                  y={-labelH / 2 + 3.5}
                  radius={2.1}
                  fill="#F4B740"
                  stroke="#0B1220"
                  strokeWidth={0.6}
                  opacity={0.95}
                  listening={false}
                />
              )}
              <Text
                x={-labelW / 2 + 5}
                y={labelLines.length > 1 ? -8.25 : -4.15}
                width={labelW - 10}
                text={labelText}
                fontFamily="JetBrains Mono"
                fontStyle="600"
                fontSize={labelFontSize}
                fill="#F5F7FA"
                align="center"
                lineHeight={1.15}
                wrap="none"
                perfectDrawEnabled={false}
              />
            </Group>
          )}
          {selected &&
            draggable &&
            m.points.length >= 4 &&
            m.points.map((_, i) => {
              if (i % 2 !== 0) return null;
              const pointIndex = i / 2;
              const endpoint = cableEndpointForIndex(m.points, pointIndex);
              if (
                endpoint &&
                hasLockedAttachedInfrastructure(sheetMarkups, m.id, endpoint)
              ) {
                return null;
              }
              const x = m.points[i];
              const y = m.points[i + 1];
              return (
                <Group
                  key={`${m.id}-joint-${pointIndex}`}
                  x={x}
                  y={y}
                  draggable
                  dragDistance={2}
                  onMouseEnter={(e) => setStageCursor(e, "grab")}
                  onMouseLeave={(e) => setStageCursor(e, "")}
                  onMouseDown={(e) => {
                    onClick(e);
                    e.cancelBubble = true;
                    e.evt?.stopPropagation?.();
                  }}
                  onDragStart={(e) => {
                    e.cancelBubble = true;
                    beginHistoryTransaction();
                    setStageCursor(e, "grabbing");
                  }}
                  onDragMove={(e) => {
                    e.cancelBubble = true;
                    moveCableVertex(
                      m,
                      sheetMarkups,
                      pointIndex,
                      e.target.x(),
                      e.target.y(),
                      updateMarkup,
                    );
                  }}
                  onDragEnd={(e) => {
                    e.cancelBubble = true;
                    setStageCursor(e, "grab");
                    moveCableVertex(
                      m,
                      sheetMarkups,
                      pointIndex,
                      e.target.x(),
                      e.target.y(),
                      updateMarkup,
                    );
                    endHistoryTransaction();
                  }}
                >
                  <Circle radius={7} fill="rgba(11,18,32,0.01)" />
                  <Circle
                    radius={2.6}
                    fill="#0B1220"
                    stroke={cab.color}
                    strokeWidth={0.9}
                    opacity={0.92}
                    listening={false}
                  />
                  <Circle
                    radius={0.9}
                    fill="#F5F7FA"
                    opacity={0.85}
                    listening={false}
                  />
                </Group>
              );
            })}
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
      const ft = ptsToFeet(lenPts, calibration);
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
      return {
        x: ax + (bx - ax) * t,
        y: ay + (by - ay) * t,
        angle: (Math.atan2(by - ay, bx - ax) * 180) / Math.PI,
      };
    }
    acc += seg;
  }
  return {
    x: points[points.length - 2],
    y: points[points.length - 1],
    angle: 0,
  };
}

function visualRunLabel(
  m: { cableId: string; connector?: string; endpointA?: string; endpointB?: string },
  labelPrefix: string,
  runCount: number,
  lengthText: string,
) {
  const primary = `${labelPrefix}${runCount > 1 ? ` x${runCount}` : ""} · ${lengthText}`;
  const endpoints = [m.endpointA, m.endpointB].filter(Boolean).join(" -> ");
  if (m.cableId === "conduit") {
    return endpoints && endpoints.length <= 20 ? `${primary}\n${endpoints}` : primary;
  }
  const parts = [primary];
  if (m.connector) parts.push(m.connector);
  const secondary = [m.connector, endpoints && endpoints.length <= 28 ? endpoints : ""]
    .filter(Boolean)
    .join(" · ");
  return secondary ? `${primary}\n${secondary}` : primary;
}

function archedCablePath(points: number[]) {
  const [x1, y1, x2, y2] = points;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const arch = Math.min(42, Math.max(14, len * 0.18));
  const nx = -dy / len;
  const ny = dx / len;
  const cx = (x1 + x2) / 2 + nx * arch;
  const cy = (y1 + y2) / 2 + ny * arch;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

function pointsWithMovedVertex(
  points: number[],
  pointIndex: number,
  x: number,
  y: number,
) {
  const next = [...points];
  const i = pointIndex * 2;
  next[i] = x;
  next[i + 1] = y;
  return next;
}

function cableEndpointForIndex(
  points: number[],
  pointIndex: number,
): CableRunEndpointKey | null {
  if (pointIndex === 0) return "A";
  if (pointIndex === points.length / 2 - 1) return "B";
  return null;
}

function hasLockedAttachedInfrastructure(
  markups: Markup[],
  cableMarkupId: string,
  endpoint: CableRunEndpointKey,
) {
  return markups.some(
    (m) =>
      m.kind === "device" &&
      m.locked &&
      m.attachedRunEndpoint?.cableMarkupId === cableMarkupId &&
      m.attachedRunEndpoint.endpoint === endpoint,
  );
}

function moveCableVertex(
  cable: Extract<Markup, { kind: "cable" }>,
  sheetMarkups: Markup[],
  pointIndex: number,
  x: number,
  y: number,
  updateMarkup: ReturnType<typeof useProjectStore.getState>["updateMarkup"],
) {
  const endpoint = cableEndpointForIndex(cable.points, pointIndex);
  if (endpoint && hasLockedAttachedInfrastructure(sheetMarkups, cable.id, endpoint)) {
    return;
  }
  updateMarkup(cable.id, {
    points: pointsWithMovedVertex(cable.points, pointIndex, x, y),
  } as any);
  if (!endpoint) return;
  for (const m of sheetMarkups) {
    if (
      m.kind === "device" &&
      !m.locked &&
      m.attachedRunEndpoint?.cableMarkupId === cable.id &&
      m.attachedRunEndpoint.endpoint === endpoint
    ) {
      updateMarkup(m.id, { x, y } as any);
    }
  }
}

function cameraAimHandlePoint(
  m: DeviceMarkup,
  calibration: Calibration | undefined,
  rangeFt: number,
  size: number,
) {
  const rotation = m.rotation ?? 0;
  const rad = ((rotation - 90) * Math.PI) / 180;
  const rangePts = rangeFtToPts(rangeFt, calibration);
  const min = Math.max(size * 1.8, 42);
  const max = Math.max(min, 110);
  const distance =
    rangePts && rangePts > 0
      ? Math.max(min, Math.min(max, rangePts * 0.28))
      : min;
  return {
    x: m.x + Math.cos(rad) * distance,
    y: m.y + Math.sin(rad) * distance,
    distance,
  };
}

function setStageCursor(e: any, cursor: string) {
  const container = e.target?.getStage?.()?.container?.();
  if (container) container.style.cursor = cursor;
}
