import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Circle, Group, Line, Text, Rect, Arrow, Path, Label, Tag } from "react-konva";
import {
  useProjectStore,
  effectiveMarkupLayerId,
  type Calibration,
  type Sheet,
  type Markup,
  type DeviceMarkup,
  type Project,
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
  resolveTagStyle,
  resolveTagFontSize,
} from "../lib/tagDefaults";
import {
  endpointFromMarkup,
  nearestCableRunPoint,
  runCountFor,
  runLabelLayoutsFor,
  type RunLabelLayout,
  type CableRunEndpointKey,
} from "../lib/cableRuns";
import { compactConduitLabel } from "../lib/conduit";
import { fiberCompactLabel } from "../lib/fiber";
import {
  partitionValidationHighlightOverlay,
  sortDeviceTagsForRender,
  sortMarkupsForRender,
} from "../lib/markupOrdering";
import {
  isContainerDevice,
  isNestableDevice,
  nearestContainerForDevice,
  nestedBubbleLabel,
  nestedBubbleLabelColor,
  nestedBubbleHitRadius,
  nestedBubblePoint,
  nestedBubbleSize,
} from "../lib/nesting";
import {
  scheduleBlockContent,
  scheduleBlockSize,
  scheduleRowsForDisplay,
} from "../lib/scheduleBlocks";
import { validateProject, validationMarkupIdsForIssues } from "../lib/validation";

type TagSettings = Pick<Project, "tagDefaults" | "branding"> | null;
type HoverHint = { text: string; x: number; y: number; targetKey: string; fading?: boolean };
type ShowHoverHint = (
  hint: HoverHint,
  options?: { duringDrag?: boolean; immediate?: boolean },
) => void;
type MarkupRenderPart = "body" | "tag";

const HOVER_SHADOW_OPACITY = 0.32;
const HOVER_HINT_DELAY_MS = 120;
const HOVER_HINT_VISIBLE_MS = 3000;
const HOVER_HINT_FADE_MS = 350;
const VALIDATION_RED = "#EF4444";

export const MarkupLayer = memo(function MarkupLayer({ sheet }: { sheet: Sheet }) {
  const project = useProjectStore((s) => s.project);
  const tagDefaults = useProjectStore((s) => s.project?.tagDefaults);
  const layers = useProjectStore((s) => s.layers);
  const selected = useProjectStore((s) => s.selectedMarkupIds);
  const hintedMarkupId = useProjectStore((s) => s.hintedMarkupId);
  const hintedMarkupIds = useProjectStore((s) => s.hintedMarkupIds);
  const validationHighlightMarkupIds = useProjectStore((s) => s.validationHighlightMarkupIds);
  const validationIssueMode = useProjectStore((s) => s.validationIssueMode);
  const setSelected = useProjectStore((s) => s.setSelected);
  const updateMarkup = useProjectStore((s) => s.updateMarkup);
  const moveDeviceMarkup = useProjectStore((s) => s.moveDeviceMarkup);
  const notifyLockedMoveAttempt = useProjectStore((s) => s.notifyLockedMoveAttempt);
  const deleteMarkup = useProjectStore((s) => s.deleteMarkup);
  const activeTool = useProjectStore((s) => s.activeTool);
  const setActiveTool = useProjectStore((s) => s.setActiveTool);
  const cursor = useProjectStore((s) => s.cursor);
  const viewport = useProjectStore((s) => s.viewport);
  const cableRunBulkBranch = useProjectStore((s) => s.cableRunBulkBranch);
  const placeCableRunEndpoint = useProjectStore((s) => s.placeCableRunEndpoint);
  const branchCableRunEndpoint = useProjectStore((s) => s.branchCableRunEndpoint);
  const appendCableRunPath = useProjectStore((s) => s.appendCableRunPath);
  const beginCableRunBulkBranch = useProjectStore((s) => s.beginCableRunBulkBranch);
  const toggleCableRunBulkBranchTarget = useProjectStore(
    (s) => s.toggleCableRunBulkBranchTarget,
  );
  const freehandErasing = useProjectStore((s) => s.freehandErasing);
  const coverageVisible = useProjectStore((s) => s.coverageVisible);
  const runLabelsVisible = useProjectStore((s) => s.runLabelsVisible);
  const [hoveredMarkupId, setHoveredMarkupId] = useState<string | null>(null);
  const [hint, setHint] = useState<HoverHint | null>(null);
  const hintDelayTimerRef = useRef<number | null>(null);
  const hintFadeTimerRef = useRef<number | null>(null);
  const hintHideTimerRef = useRef<number | null>(null);
  const activeHintTargetRef = useRef<string | null>(null);

  const clearHoverHintTimers = useCallback(() => {
    if (hintDelayTimerRef.current !== null) {
      window.clearTimeout(hintDelayTimerRef.current);
      hintDelayTimerRef.current = null;
    }
    if (hintFadeTimerRef.current !== null) {
      window.clearTimeout(hintFadeTimerRef.current);
      hintFadeTimerRef.current = null;
    }
    if (hintHideTimerRef.current !== null) {
      window.clearTimeout(hintHideTimerRef.current);
      hintHideTimerRef.current = null;
    }
  }, []);

  const hideHoverHint = useCallback(() => {
    clearHoverHintTimers();
    activeHintTargetRef.current = null;
    setHint(null);
  }, [clearHoverHintTimers]);

  const showHoverHint = useCallback(
    (next: HoverHint, options?: { duringDrag?: boolean; immediate?: boolean }) => {
      if (
        activeHintTargetRef.current === next.targetKey &&
        !options?.duringDrag &&
        !options?.immediate
      ) {
        return;
      }

      clearHoverHintTimers();
      activeHintTargetRef.current = next.targetKey;

      const reveal = () => {
        if (activeHintTargetRef.current !== next.targetKey) return;
        setHint({ ...next, fading: false });
        hintFadeTimerRef.current = window.setTimeout(() => {
          if (activeHintTargetRef.current !== next.targetKey) return;
          setHint((current) =>
            current?.targetKey === next.targetKey ? { ...current, fading: true } : current,
          );
          hintFadeTimerRef.current = null;
        }, Math.max(0, HOVER_HINT_VISIBLE_MS - HOVER_HINT_FADE_MS));
        hintHideTimerRef.current = window.setTimeout(() => {
          if (activeHintTargetRef.current !== next.targetKey) return;
          setHint(null);
          hintHideTimerRef.current = null;
        }, HOVER_HINT_VISIBLE_MS);
      };

      if (options?.immediate) {
        reveal();
        return;
      }

      hintDelayTimerRef.current = window.setTimeout(() => {
        reveal();
        hintDelayTimerRef.current = null;
      }, HOVER_HINT_DELAY_MS);
    },
    [clearHoverHintTimers],
  );

  useEffect(() => () => clearHoverHintTimers(), [clearHoverHintTimers]);

  const tagSettings = useMemo<TagSettings>(() => {
    if (!project) return tagDefaults ? { tagDefaults } : null;
    return { tagDefaults: project.tagDefaults, branding: project.branding };
  }, [project, tagDefaults]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const hintedSet = useMemo(
    () => new Set([hintedMarkupId, ...hintedMarkupIds].filter(Boolean) as string[]),
    [hintedMarkupId, hintedMarkupIds],
  );
  const validationHighlightedSet = useMemo(() => {
    const ids =
      validationIssueMode && project
        ? validationMarkupIdsForIssues(validateProject(project))
        : validationHighlightMarkupIds;
    return new Set(ids);
  }, [project, validationHighlightMarkupIds, validationIssueMode]);
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
  const raisedMarkups = useMemo(() => {
    if (!hoveredMarkupId) return orderedMarkups;
    const hovered = orderedMarkups.find((m) => m.id === hoveredMarkupId);
    if (!hovered) return orderedMarkups;
    return orderedMarkups.filter((m) => m.id !== hoveredMarkupId).concat(hovered);
  }, [hoveredMarkupId, orderedMarkups]);
  const validationOverlay = useMemo(
    () => partitionValidationHighlightOverlay(raisedMarkups, validationHighlightedSet),
    [raisedMarkups, validationHighlightedSet],
  );
  const orderedDeviceTags = useMemo(
    () => sortDeviceTagsForRender(validationOverlay.baseMarkups, layers),
    [layers, validationOverlay.baseMarkups],
  );
  const isMarkupLayerOff = useCallback(
    (markup: Markup) => {
      const id = effectiveMarkupLayerId(markup);
      return layerById[id] && !layerById[id].visible;
    },
    [layerById],
  );
  const isMarkupLayerLocked = useCallback(
    (markup: Markup) => layerById[effectiveMarkupLayerId(markup)]?.locked === true,
    [layerById],
  );
  const eventSheetPoint = useCallback(
    (e: any) => {
      const p = e.target?.getStage?.()?.getPointerPosition?.();
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return cursor;
      return {
        x: (p.x - viewport.x) / viewport.scale,
        y: (p.y - viewport.y) / viewport.scale,
      };
    },
    [cursor, viewport],
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
        if (e.evt?.shiftKey || cableRunBulkBranch) {
          if (m.kind === "cable") {
            const pointer = eventSheetPoint(e);
            const anchor = pointer ? nearestCableRunPoint(m, pointer) : null;
            if (anchor) beginCableRunBulkBranch([anchor], m.id);
            return;
          }
          const endpoint = endpointFromMarkup(m, { markups: sheet.markups });
          if (endpoint) {
            if (!cableRunBulkBranch) beginCableRunBulkBranch(undefined);
            toggleCableRunBulkBranchTarget(endpoint);
          }
          return;
        }
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
          markups: sheet.markups,
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
      beginCableRunBulkBranch,
      branchCableRunEndpoint,
      cableRunBulkBranch,
      deleteMarkup,
      eventSheetPoint,
      freehandErasing,
      placeCableRunEndpoint,
      selected,
      setActiveTool,
      setSelected,
      sheet.markups,
      toggleCableRunBulkBranchTarget,
    ],
  );

  return (
    <Group>
      {coverageVisible && sheet.calibration && (
        <Group listening={false}>
          {sheet.markups.map((m) => {
            if (m.hidden || m.kind !== "device") return null;
            if (isMarkupLayerOff(m)) return null;
            if (m.parentId) return null;
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

      {validationOverlay.baseMarkups.map((m) => {
        if (m.hidden) return null;
        if (m.kind === "schedule") return null;
        if (isMarkupLayerOff(m)) return null;
        const isSel = selectedSet.has(m.id);
        const isHinted = hintedSet.has(m.id);
        const isValidationHighlighted = validationHighlightedSet.has(m.id);
        const parent =
          m.kind === "device" && m.parentId
            ? sheet.markups.find(
                (candidate): candidate is DeviceMarkup =>
                  candidate.kind === "device" && candidate.id === m.parentId,
              )
            : null;
        const draggable =
          activeTool === "select" &&
          !m.locked &&
          !isMarkupLayerLocked(m) &&
          !parent?.locked &&
          !(parent && isMarkupLayerLocked(parent));
        const lockedMoveHintMessage =
          activeTool === "select" &&
          !draggable &&
          isLockHintMovableMarkup(m) &&
          (m.locked || isMarkupLayerLocked(m) || !!parent?.locked || !!(parent && isMarkupLayerLocked(parent)))
            ? "Locked. Unlock to move."
            : undefined;
        return (
          <MarkupNode
            key={m.id}
            markup={m}
            project={project}
            sheet={sheet}
            calibration={sheet.calibration}
            sheetMarkups={sheet.markups}
            selected={isSel}
            hinted={isHinted}
            validationHighlighted={isValidationHighlighted}
            draggable={draggable}
            onMarkupClick={handleMarkupClick}
            updateMarkup={updateMarkup}
            moveDeviceMarkup={moveDeviceMarkup}
            notifyLockedMoveAttempt={notifyLockedMoveAttempt}
            lockedMoveHintMessage={lockedMoveHintMessage}
            tagSettings={tagSettings}
            runLabelLayout={m.kind === "cable" ? runLabelLayouts.get(m.id) : undefined}
            renderPart="body"
            onHoverChange={setHoveredMarkupId}
            showHoverHint={showHoverHint}
            hideHoverHint={hideHoverHint}
          />
        );
      })}
      <Group>
        {orderedDeviceTags.map((m) => {
          if (m.hidden) return null;
          if (isMarkupLayerOff(m)) return null;
          const isSel = selectedSet.has(m.id);
          const isHinted = hintedSet.has(m.id);
          const isValidationHighlighted = validationHighlightedSet.has(m.id);
          const parent =
            m.kind === "device" && m.parentId
              ? sheet.markups.find(
                  (candidate): candidate is DeviceMarkup =>
                    candidate.kind === "device" && candidate.id === m.parentId,
                )
              : null;
          const draggable =
            activeTool === "select" &&
            !m.locked &&
            !isMarkupLayerLocked(m) &&
            !parent?.locked &&
            !(parent && isMarkupLayerLocked(parent));
          const lockedMoveHintMessage =
            activeTool === "select" &&
            !draggable &&
            (m.locked || isMarkupLayerLocked(m) || !!parent?.locked || !!(parent && isMarkupLayerLocked(parent)))
              ? "Locked. Unlock to move."
              : undefined;
          return (
            <MarkupNode
              key={`${m.id}-tag`}
              markup={m}
              project={project}
              sheet={sheet}
              calibration={sheet.calibration}
              sheetMarkups={sheet.markups}
              selected={isSel}
              hinted={isHinted}
              validationHighlighted={isValidationHighlighted}
              draggable={draggable}
              onMarkupClick={handleMarkupClick}
              updateMarkup={updateMarkup}
              moveDeviceMarkup={moveDeviceMarkup}
              notifyLockedMoveAttempt={notifyLockedMoveAttempt}
              lockedMoveHintMessage={lockedMoveHintMessage}
              tagSettings={tagSettings}
              renderPart="tag"
              onHoverChange={setHoveredMarkupId}
              showHoverHint={showHoverHint}
              hideHoverHint={hideHoverHint}
            />
          );
        })}
      </Group>
      <Group>
        {validationOverlay.baseMarkups.map((m) => {
          if (m.hidden) return null;
          if (m.kind !== "schedule") return null;
          if (m.visible === false) return null;
          if (isMarkupLayerOff(m)) return null;
          const isSel = selectedSet.has(m.id);
          const isHinted = hintedSet.has(m.id);
          const isValidationHighlighted = validationHighlightedSet.has(m.id);
          const draggable =
            activeTool === "select" && !m.locked && !isMarkupLayerLocked(m);
          const lockedMoveHintMessage =
            activeTool === "select" &&
            !draggable &&
            (m.locked || isMarkupLayerLocked(m))
              ? "Locked. Unlock to move."
              : undefined;
          return (
            <MarkupNode
              key={`${m.id}-schedule`}
              markup={m}
              project={project}
              sheet={sheet}
              calibration={sheet.calibration}
              sheetMarkups={sheet.markups}
              selected={isSel}
              hinted={isHinted}
              validationHighlighted={isValidationHighlighted}
              draggable={draggable}
              onMarkupClick={handleMarkupClick}
              updateMarkup={updateMarkup}
              moveDeviceMarkup={moveDeviceMarkup}
              notifyLockedMoveAttempt={notifyLockedMoveAttempt}
              lockedMoveHintMessage={lockedMoveHintMessage}
              tagSettings={tagSettings}
              renderPart="body"
              onHoverChange={setHoveredMarkupId}
              showHoverHint={showHoverHint}
              hideHoverHint={hideHoverHint}
            />
          );
        })}
      </Group>
      <Group>
        {validationOverlay.overlayMarkups.map((m) => {
          if (m.hidden) return null;
          if (isMarkupLayerOff(m)) return null;
          const isSel = selectedSet.has(m.id);
          const isHinted = hintedSet.has(m.id);
          const draggable =
            activeTool === "select" && !m.locked && !isMarkupLayerLocked(m);
          const lockedMoveHintMessage =
            activeTool === "select" &&
            !draggable &&
            (m.locked || isMarkupLayerLocked(m))
              ? "Locked. Unlock to move."
              : undefined;
          return (
            <MarkupNode
              key={`${m.id}-validation-overlay`}
              markup={m}
              project={project}
              sheet={sheet}
              calibration={sheet.calibration}
              sheetMarkups={sheet.markups}
              selected={isSel}
              hinted={isHinted}
              validationHighlighted={true}
              draggable={draggable}
              onMarkupClick={handleMarkupClick}
              updateMarkup={updateMarkup}
              moveDeviceMarkup={moveDeviceMarkup}
              notifyLockedMoveAttempt={notifyLockedMoveAttempt}
              lockedMoveHintMessage={lockedMoveHintMessage}
              tagSettings={tagSettings}
              runLabelLayout={runLabelLayouts.get(m.id)}
              renderPart="body"
              onHoverChange={setHoveredMarkupId}
              showHoverHint={showHoverHint}
              hideHoverHint={hideHoverHint}
            />
          );
        })}
      </Group>
      {hint && (
        <Group listening={false}>
          <HoverHintLabel hint={hint} />
        </Group>
      )}
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
  project,
  sheet,
  calibration,
  sheetMarkups,
  selected,
  hinted,
  validationHighlighted,
  draggable,
  onMarkupClick,
  updateMarkup,
  moveDeviceMarkup,
  notifyLockedMoveAttempt,
  lockedMoveHintMessage,
  tagSettings,
  runLabelLayout,
  renderPart,
  onHoverChange,
  showHoverHint,
  hideHoverHint,
}: {
  markup: Markup;
  project: Project | null;
  sheet: Sheet;
  calibration: Calibration | undefined;
  sheetMarkups?: Markup[];
  selected: boolean;
  hinted: boolean;
  validationHighlighted: boolean;
  draggable: boolean;
  onMarkupClick: (m: Markup, e: any) => void;
  updateMarkup: ReturnType<typeof useProjectStore.getState>["updateMarkup"];
  moveDeviceMarkup: ReturnType<typeof useProjectStore.getState>["moveDeviceMarkup"];
  notifyLockedMoveAttempt: ReturnType<typeof useProjectStore.getState>["notifyLockedMoveAttempt"];
  lockedMoveHintMessage?: string;
  tagSettings: TagSettings;
  runLabelLayout?: RunLabelLayout;
  renderPart: MarkupRenderPart;
  onHoverChange: (id: string | null) => void;
  showHoverHint: ShowHoverHint;
  hideHoverHint: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [dragging, setDragging] = useState(false);
  const handleClick = useCallback(
    (e: any) => onMarkupClick(markup, e),
    [markup, onMarkupClick],
  );
  const handleMouseEnter = useCallback(
    (e: any) => {
      if (dragging) return;
      setHovered(true);
      onHoverChange(markup.id);
      const directlyDraggable =
        draggable &&
        (markup.kind === "device" ||
          markup.kind === "text" ||
          markup.kind === "rect" ||
          markup.kind === "schedule");
      setStageCursor(e, directlyDraggable ? "grab" : "pointer");
    },
    [dragging, draggable, markup.id, markup.kind, onHoverChange],
  );
  const handleMouseLeave = useCallback((e: any) => {
    setHovered(false);
    onHoverChange(null);
    hideHoverHint();
    setStageCursor(e, "");
  }, [hideHoverHint, onHoverChange]);
  const clearHoverForDrag = useCallback((e: any) => {
    setDragging(true);
    setHovered(false);
    onHoverChange(null);
    hideHoverHint();
    setStageCursor(e, "grabbing");
  }, [hideHoverHint, onHoverChange]);
  const finishHoverDrag = useCallback((e: any) => {
    setDragging(false);
    setHovered(false);
    hideHoverHint();
    setStageCursor(e, "");
  }, [hideHoverHint]);

  return (
    <Group onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
      {renderMarkup(
        markup,
        project,
        sheet,
        calibration,
        sheetMarkups ?? [],
        selected,
        draggable,
        (hovered && !dragging) || hinted,
        validationHighlighted,
        handleClick,
        clearHoverForDrag,
        finishHoverDrag,
        showHoverHint,
        hideHoverHint,
        updateMarkup,
        moveDeviceMarkup,
        tagSettings,
        notifyLockedMoveAttempt,
        lockedMoveHintMessage,
        runLabelLayout,
        renderPart,
      )}
    </Group>
  );
});

function renderMarkup(
  m: Markup,
  project: Project | null,
  sheet: Sheet,
  calibration: Calibration | undefined,
  sheetMarkups: Markup[],
  selected: boolean,
  draggable: boolean,
  hovered: boolean,
  validationHighlighted: boolean,
  onClick: (e: any) => void,
  clearHoverForDrag: (e: any) => void,
  finishHoverDrag: (e: any) => void,
  showHoverHint: ShowHoverHint,
  hideHoverHint: () => void,
  updateMarkup: ReturnType<typeof useProjectStore.getState>["updateMarkup"],
  moveDeviceMarkup: ReturnType<typeof useProjectStore.getState>["moveDeviceMarkup"],
  tagSettings: TagSettings,
  notifyLockedMoveAttempt: ReturnType<typeof useProjectStore.getState>["notifyLockedMoveAttempt"],
  lockedMoveHintMessage?: string,
  runLabelLayout?: RunLabelLayout,
  renderPart: MarkupRenderPart = "body",
) {
  const notifyLockedAttempt = (message = lockedMoveHintMessage) => {
    if (!message) return;
    notifyLockedMoveAttempt({
      message,
      scope: m.kind === "device" ? "global" : "selection",
      targetIds: [m.id],
    });
  };
  const handlePointerDown = (e: any) => {
    onClick(e);
    notifyLockedAttempt();
  };

  switch (m.kind) {
    case "schedule": {
      if (renderPart === "tag" || !project || m.visible === false) return null;
      const content = scheduleBlockContent(project, sheet, m);
      const size = scheduleBlockSize(content, m.mode);
      const rows = scheduleRowsForDisplay(content, size.maxRows);
      const tagStyle = resolveTagStyle(tagSettings);
      const target = sheet.markups.find((candidate) => candidate.id === m.targetId);
      const accent =
        target?.kind === "device"
          ? target.colorOverride ??
            categoryColor[devicesById[target.deviceId]?.category ?? target.category] ??
            "#F4B740"
          : target?.kind === "cable"
            ? cablesById[target.cableId]?.color ?? "#F4B740"
            : "#F4B740";
      const issueAccent = validationHighlighted ? VALIDATION_RED : accent;
      return (
        <Group
          x={m.x}
          y={m.y}
          draggable={draggable}
          dragDistance={2}
          onClick={onClick}
          onTap={onClick}
          onMouseDown={handlePointerDown}
          onMouseEnter={(e) => {
            showHoverHint({
              text: draggable ? "move schedule" : "select schedule",
              x: m.x + size.width + 6,
              y: m.y - 12,
              targetKey: `${m.id}:schedule`,
            });
            setStageCursor(e, draggable ? "grab" : "pointer");
          }}
          onMouseLeave={(e) => {
            hideHoverHint();
            setStageCursor(e, "");
          }}
          onDragStart={clearHoverForDrag}
          onDragEnd={(e) => {
            updateMarkup(m.id, { x: e.target.x(), y: e.target.y() } as any);
            finishHoverDrag(e);
          }}
        >
          <Rect
            width={size.width}
            height={size.height}
            fill={tagStyle.fillColor}
            stroke={selected ? "#F4B740" : issueAccent}
            strokeWidth={validationHighlighted ? 1.4 : selected ? 1.2 : hovered ? 0.95 : 0.65}
            cornerRadius={4}
            opacity={0.94}
            shadowColor={validationHighlighted || hovered || selected ? issueAccent : "rgba(0,0,0,0.55)"}
            shadowBlur={validationHighlighted ? 11 : hovered || selected ? 8 : 4}
            shadowOpacity={validationHighlighted ? 0.72 : hovered || selected ? HOVER_SHADOW_OPACITY : 0.48}
            perfectDrawEnabled={false}
          />
          <Rect
            width={size.width}
            height={15}
            fill={issueAccent}
            cornerRadius={[4, 4, 0, 0]}
            opacity={0.96}
            perfectDrawEnabled={false}
            listening={false}
          />
          <Text
            x={7}
            y={4}
            width={size.width - 14}
            text={content.title}
            fontFamily="JetBrains Mono"
            fontStyle="700"
            fontSize={6.5}
            fill={tagStyle.textColor}
            wrap="none"
            ellipsis
            listening={false}
            perfectDrawEnabled={false}
          />
          {rows.map((line, i) => (
            <Text
              key={`${m.id}-row-${i}`}
              x={7}
              y={19 + i * size.lineHeight}
              width={size.width - 14}
              text={line || "No schedule data"}
              fontFamily="JetBrains Mono"
              fontSize={size.fontSize}
              fill={tagStyle.textColor}
              opacity={content.empty ? 0.62 : 0.88}
              wrap="none"
              ellipsis
              listening={false}
              perfectDrawEnabled={false}
            />
          ))}
        </Group>
      );
    }
    case "device": {
      const dev = devicesById[m.deviceId];
      if (!dev) return null;
      const size = m.size ?? 28;
      const color = validationHighlighted
        ? VALIDATION_RED
        : m.colorOverride ?? categoryColor[dev.category] ?? "#94A0B8";
      const hoverActive = (hovered || validationHighlighted) && !selected;
      const nestedParent = m.parentId
        ? sheetMarkups.find(
            (candidate): candidate is DeviceMarkup =>
              candidate.kind === "device" && candidate.id === m.parentId,
          )
        : null;
      if (nestedParent && renderPart === "tag") return null;
      const labelText = m.labelOverride ? `${m.tag} · ${m.labelOverride}` : m.tag;
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
      const deviceMoveHint = m.parentId
        ? "move racked device"
        : sheetMarkups.some(
            (candidate) => candidate.kind === "device" && candidate.parentId === m.id,
          )
          ? "move racked devices"
          : isContainerDevice(m)
            ? "rack devices here"
            : isNestableDevice(m)
              ? "rack device"
              : "move device";
      if (nestedParent && renderPart === "body") {
        const bubble = nestedBubblePoint(sheetMarkups, nestedParent, m);
        const slotSize = nestedBubbleSize(m);
        const bubbleSize = Math.max(8, slotSize - 2);
        const radius = bubbleSize / 2;
        const hitRadius = nestedBubbleHitRadius(m);
        const bubbleText = nestedBubbleLabel(m);
        const textColor = nestedBubbleLabelColor(color);
        const nestedDragLocked = !!(m.locked || nestedParent.locked);
        return (
          <Group
            x={bubble.x}
            y={bubble.y}
            draggable={draggable}
            dragDistance={2}
            onClick={onClick}
            onTap={onClick}
            onMouseDown={(e) => {
              onClick(e);
              if (lockedMoveHintMessage || nestedDragLocked) notifyLockedAttempt();
            }}
            onMouseEnter={(e) => {
              showHoverHint({
                text: draggable ? "move racked device" : "select racked device",
                x: bubble.x + radius + 4,
                y: bubble.y - radius - 5,
                targetKey: `${m.id}:racked-bubble`,
              });
              setStageCursor(e, draggable ? "grab" : "pointer");
            }}
            onMouseLeave={(e) => {
              hideHoverHint();
              setStageCursor(e, "");
            }}
            onDragStart={clearHoverForDrag}
            onDragEnd={(e) => {
              moveDeviceMarkup(m.id, e.target.x(), e.target.y());
              finishHoverDrag(e);
            }}
          >
            <Circle radius={hitRadius} fill="rgba(11,18,32,0.01)" />
            <Circle
              radius={radius}
              fill={color}
              stroke={selected ? "#F4B740" : "#0B1220"}
              strokeWidth={selected ? 1 : 0.65}
              shadowColor={hoverActive ? color : undefined}
              shadowBlur={hoverActive ? 3 : 0}
              shadowOpacity={hoverActive ? 0.22 : 0}
              perfectDrawEnabled={false}
            />
            <Text
              x={-radius}
              y={-Math.min(3, radius * 0.58)}
              width={bubbleSize}
              text={bubbleText}
              fontFamily="JetBrains Mono"
              fontStyle="700"
              fontSize={Math.max(4.5, Math.min(5.5, bubbleSize * 0.46))}
              fill={textColor}
              align="center"
              wrap="none"
              listening={false}
              perfectDrawEnabled={false}
            />
          </Group>
        );
      }
      return (
        <Group>
          {renderPart === "body" && (
            <>
              <DeviceIconNode
                device={dev}
                x={m.x}
                y={m.y}
                size={size}
                color={color}
                rotation={m.rotation ?? 0}
                selected={selected}
                hovered={hovered || validationHighlighted}
                onClick={onClick}
                onMouseDown={handlePointerDown}
                onMouseEnter={(e) => {
                  showHoverHint({
                    text: draggable ? deviceMoveHint : "select device",
                    x: m.x + size / 2 + 7,
                    y: m.y - size / 2 - 5,
                    targetKey: `${m.id}:device`,
                  });
                  setStageCursor(e, draggable ? "grab" : "pointer");
                }}
                onMouseLeave={(e) => {
                  hideHoverHint();
                  setStageCursor(e, "");
                }}
                draggable={draggable}
                onDragStart={clearHoverForDrag}
                onDragMove={(e) => {
                  if (!isNestableDevice(m)) return;
                  const container = nearestContainerForDevice(sheetMarkups, m, {
                    x: e.target.x(),
                    y: e.target.y(),
                  });
                  if (!container) {
                    hideHoverHint();
                    return;
                  }
                  showHoverHint(
                    {
                      text: "drop to rack",
                      x: e.target.x() + size / 2 + 7,
                      y: e.target.y() - size / 2 - 5,
                      targetKey: `${m.id}:drop-rack`,
                    },
                    { duringDrag: true, immediate: true },
                  );
                }}
                onDragEnd={(e) => {
                  moveDeviceMarkup(m.id, e.target.x(), e.target.y());
                  finishHoverDrag(e);
                }}
              />
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
                    onMouseEnter={(e) => {
                      showHoverHint({
                        text: "aim camera",
                        x: aimHandle.x + 7,
                        y: aimHandle.y - 16,
                        targetKey: `${m.id}:aim-handle`,
                      });
                      setStageCursor(e, "grab");
                    }}
                    onMouseLeave={(e) => {
                      hideHoverHint();
                      setStageCursor(e, "");
                    }}
                    onMouseDown={(e) => {
                      onClick(e);
                      e.cancelBubble = true;
                      e.evt?.stopPropagation?.();
                    }}
                    onDragStart={(e) => {
                      e.cancelBubble = true;
                      clearHoverForDrag(e);
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
                      updateMarkup(m.id, {
                        rotation: Math.round(
                          rotationDegFromPoint(
                            { x: m.x, y: m.y },
                            { x: e.target.x(), y: e.target.y() },
                          ),
                        ),
                      } as Partial<DeviceMarkup>);
                      finishHoverDrag(e);
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
                      strokeWidth={hovered ? 0.55 : 0.35}
                      shadowColor="#F4B740"
                      shadowBlur={hovered ? 5 : 2.5}
                      shadowOpacity={hovered ? 0.55 : 0.35}
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
            </>
          )}
          {renderPart === "tag" && (
            <>
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
                onMouseDown={handlePointerDown}
                onMouseEnter={(e) => {
                  showHoverHint({
                    text: draggable ? "move tag" : "select tag",
                    x: pillLeft + pillW + 5,
                    y: pillTop - 4,
                    targetKey: `${m.id}:device-tag`,
                  });
                  setStageCursor(e, draggable ? "grab" : "pointer");
                }}
                onMouseLeave={(e) => {
                  hideHoverHint();
                  setStageCursor(e, "");
                }}
                onDragStart={(e) => {
                  e.cancelBubble = true;
                  clearHoverForDrag(e);
                }}
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
                  finishHoverDrag(e);
                }}
              >
                <Tag
                  fill="#0B1220"
                  stroke={color}
                  strokeWidth={hoverActive ? 1 : 0.75}
                  cornerRadius={3}
                  shadowColor={hoverActive ? color : "rgba(0,0,0,0.4)"}
                  shadowBlur={hoverActive ? 7 : 4}
                  shadowOpacity={hoverActive ? HOVER_SHADOW_OPACITY : 0.6}
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
            </>
          )}
        </Group>
      );
    }

    case "cable": {
      const cab = cablesById[m.cableId];
      if (!cab) return null;
      const cableColor = validationHighlighted ? VALIDATION_RED : cab.color;
      const hoverActive = (hovered || validationHighlighted) && !selected;
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
      const showRunLabel = runLabelLayout?.visible === true;
      const labelOffset = runLabelLayout?.offset ?? { dx: 0, dy: -11 };
      const arched = m.routeStyle === "archedDrop" && m.points.length === 4;
      return (
        <Group>
          {arched ? (
            <>
              {validationHighlighted && (
                <Path
                  data={archedCablePath(m.points)}
                  stroke={VALIDATION_RED}
                  strokeWidth={(cab.thickness ?? 2) + 8}
                  lineCap="round"
                  lineJoin="round"
                  opacity={0.22}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              )}
              <Path
                data={archedCablePath(m.points)}
                stroke={cableColor}
                strokeWidth={(cab.thickness ?? 2) + (validationHighlighted ? 2.6 : selected ? 1 : hoverActive ? 0.6 : 0)}
                dash={cab.dash}
                lineCap="round"
                lineJoin="round"
                shadowColor={validationHighlighted || selected || hoverActive ? cableColor : undefined}
                shadowBlur={validationHighlighted ? 16 : selected ? 8 : hoverActive ? 6 : 0}
                shadowOpacity={validationHighlighted ? 0.9 : selected ? 0.55 : hoverActive ? HOVER_SHADOW_OPACITY : 0}
                onClick={onClick}
                onMouseDown={handlePointerDown}
                onMouseEnter={(e) => {
                  if (mid) {
                    showHoverHint({
                      text: selected && draggable ? "move run label or joints" : "select cable run",
                      x: mid.x + 7,
                      y: mid.y - 16,
                      targetKey: `${m.id}:cable`,
                    });
                  }
                  setStageCursor(e, "pointer");
                }}
                onMouseLeave={(e) => {
                  hideHoverHint();
                  setStageCursor(e, "");
                }}
                hitStrokeWidth={Math.max(10, (cab.thickness ?? 2) + 6)}
              />
            </>
          ) : (
            <>
              {validationHighlighted && (
                <Line
                  points={m.points}
                  stroke={VALIDATION_RED}
                  strokeWidth={(cab.thickness ?? 2) + 8}
                  lineCap="round"
                  lineJoin="round"
                  opacity={0.22}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              )}
              <Line
                points={m.points}
                stroke={cableColor}
                strokeWidth={(cab.thickness ?? 2) + (validationHighlighted ? 2.6 : selected ? 1 : hoverActive ? 0.6 : 0)}
                dash={cab.dash}
                lineCap="round"
                lineJoin="round"
                shadowColor={validationHighlighted || selected || hoverActive ? cableColor : undefined}
                shadowBlur={validationHighlighted ? 16 : selected ? 8 : hoverActive ? 6 : 0}
                shadowOpacity={validationHighlighted ? 0.9 : selected ? 0.55 : hoverActive ? HOVER_SHADOW_OPACITY : 0}
                onClick={onClick}
                onMouseDown={handlePointerDown}
                onMouseEnter={(e) => {
                  if (mid) {
                    showHoverHint({
                      text: selected && draggable ? "move run label or joints" : "select cable run",
                      x: mid.x + 7,
                      y: mid.y - 16,
                      targetKey: `${m.id}:cable`,
                    });
                  }
                  setStageCursor(e, "pointer");
                }}
                onMouseLeave={(e) => {
                  hideHoverHint();
                  setStageCursor(e, "");
                }}
                hitStrokeWidth={Math.max(10, (cab.thickness ?? 2) + 6)}
              />
            </>
          )}
          {mid && showRunLabel && (
            <Group
              x={mid.x + labelOffset.dx}
              y={mid.y + labelOffset.dy}
              listening
              draggable={selected && draggable}
              dragDistance={3}
              onClick={onClick}
              onTap={onClick}
              onMouseEnter={(e) => {
                const canMoveLabel = selected && draggable;
                showHoverHint({
                  text: canMoveLabel ? "move label" : lockedMoveHintMessage ? "locked" : "select label",
                  x: mid.x + labelOffset.dx + labelW / 2 + 5,
                  y: mid.y + labelOffset.dy - labelH / 2 - 5,
                  targetKey: `${m.id}:run-label`,
                });
                setStageCursor(e, canMoveLabel ? "grab" : "pointer");
              }}
              onMouseLeave={(e) => {
                hideHoverHint();
                setStageCursor(e, "");
              }}
              onMouseDown={(e) => {
                if (!(selected && draggable)) {
                  onClick(e);
                  notifyLockedAttempt();
                  return;
                }
                onClick(e);
                e.cancelBubble = true;
                e.evt?.stopPropagation?.();
              }}
              onDragStart={(e) => {
                e.cancelBubble = true;
                clearHoverForDrag(e);
              }}
              onDragMove={(e) => {
                e.cancelBubble = true;
              }}
              onDragEnd={(e) => {
                e.cancelBubble = true;
                updateMarkup(m.id, {
                  labelOffsetX: e.target.x() - mid.x,
                  labelOffsetY: e.target.y() - mid.y,
                } as any);
                finishHoverDrag(e);
              }}
            >
              <Rect
                x={-labelW / 2}
                y={-labelH / 2}
                width={labelW}
                height={labelH}
                fill="#0B1220"
                stroke={cableColor}
                strokeWidth={hoverActive ? 0.85 : 0.55}
                cornerRadius={3}
                opacity={hoverActive ? 0.96 : 0.92}
                shadowColor={hoverActive ? cableColor : "rgba(0,0,0,0.55)"}
                shadowBlur={validationHighlighted ? 10 : hoverActive ? 7 : 3}
                shadowOpacity={validationHighlighted ? 0.72 : hoverActive ? HOVER_SHADOW_OPACITY : 0.55}
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
            (draggable || !!lockedMoveHintMessage) &&
            m.points.length >= 4 &&
            m.points.map((_, i) => {
              if (i % 2 !== 0) return null;
              const pointIndex = i / 2;
              const endpoint = cableEndpointForIndex(m.points, pointIndex);
              const endpointLocked = !!(
                endpoint &&
                hasLockedAttachedInfrastructure(sheetMarkups, m.id, endpoint)
              );
              const jointLockedHintMessage =
                endpointLocked || lockedMoveHintMessage ? "Locked. Unlock to move." : undefined;
              const jointDraggable = draggable && !endpointLocked;
              const x = m.points[i];
              const y = m.points[i + 1];
              return (
                <Group
                  key={`${m.id}-joint-${pointIndex}`}
                  x={x}
                  y={y}
                  draggable={jointDraggable}
                  dragDistance={2}
                  onMouseEnter={(e) => {
                    showHoverHint({
                      text: jointDraggable ? "move joint" : "locked",
                      x: x + 7,
                      y: y - 15,
                      targetKey: `${m.id}:joint:${pointIndex}`,
                    });
                    setStageCursor(e, jointDraggable ? "grab" : "pointer");
                  }}
                  onMouseLeave={(e) => {
                    hideHoverHint();
                    setStageCursor(e, "");
                  }}
                  onMouseDown={(e) => {
                    onClick(e);
                    e.cancelBubble = true;
                    e.evt?.stopPropagation?.();
                    if (jointLockedHintMessage) notifyLockedAttempt(jointLockedHintMessage);
                  }}
                  onDragStart={(e) => {
                    e.cancelBubble = true;
                    clearHoverForDrag(e);
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
                    moveCableVertex(
                      m,
                      sheetMarkups,
                      pointIndex,
                      e.target.x(),
                      e.target.y(),
                      updateMarkup,
                    );
                    finishHoverDrag(e);
                  }}
                >
                  <Circle radius={7} fill="rgba(11,18,32,0.01)" />
                  <Circle
                    radius={2.6}
                    fill="#0B1220"
                    stroke={cableColor}
                    strokeWidth={hovered ? 1.15 : 0.9}
                    opacity={hovered ? 1 : 0.92}
                    shadowColor={cableColor}
                    shadowBlur={hovered ? 4 : 0}
                    shadowOpacity={hovered ? HOVER_SHADOW_OPACITY : 0}
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
          onMouseDown={handlePointerDown}
          onMouseEnter={() => {
            showHoverHint({
              text: draggable ? "move text" : "select text",
              x: m.x + Math.max(28, m.text.length * m.fontSize * 0.45),
              y: m.y - 14,
              targetKey: `${m.id}:text`,
            });
          }}
          onMouseLeave={hideHoverHint}
          draggable={draggable}
          onDragStart={clearHoverForDrag}
          onDragEnd={(e) => {
            updateMarkup(m.id, { x: e.target.x(), y: e.target.y() } as any);
            finishHoverDrag(e);
          }}
          shadowColor={selected ? "#F4B740" : hovered ? m.color : undefined}
          shadowBlur={selected ? 6 : hovered ? 5 : 0}
          shadowOpacity={selected ? 0.55 : hovered ? HOVER_SHADOW_OPACITY : 0}
        />
      );

    case "callout": {
      const boxW = Math.max(60, m.text.length * 7 + 12);
      const boxH = 22;
      return (
        <Group
          onClick={onClick}
          onMouseDown={onClick}
          onMouseEnter={(e) => {
            showHoverHint({
              text: "select callout",
              x: m.x2 + boxW + 6,
              y: m.y2 - boxH / 2 - 8,
              targetKey: `${m.id}:callout`,
            });
            setStageCursor(e, "pointer");
          }}
          onMouseLeave={(e) => {
            hideHoverHint();
            setStageCursor(e, "");
          }}
        >
          <Line
            points={[m.x1, m.y1, m.x2, m.y2]}
            stroke={m.color}
            strokeWidth={1.5 + (hovered && !selected ? 0.3 : 0)}
            shadowColor={hovered && !selected ? m.color : undefined}
            shadowBlur={hovered && !selected ? 5 : 0}
            shadowOpacity={hovered && !selected ? HOVER_SHADOW_OPACITY : 0}
          />
          <Rect
            x={m.x2}
            y={m.y2 - boxH / 2}
            width={boxW}
            height={boxH}
            fill="#0B1220"
            stroke={m.color}
            strokeWidth={hovered && !selected ? 1.25 : 1}
            cornerRadius={3}
            shadowColor={hovered && !selected ? m.color : undefined}
            shadowBlur={hovered && !selected ? 6 : 0}
            shadowOpacity={hovered && !selected ? HOVER_SHADOW_OPACITY : 0}
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
          strokeWidth={selected ? 2.5 : hovered ? 2.1 : 1.8}
          fill="rgba(0,0,0,0)"
          onClick={onClick}
          onMouseDown={onClick}
          onMouseEnter={(e) => {
            showHoverHint({
              text: "select cloud",
              x: m.x + m.width + 6,
              y: m.y - 12,
              targetKey: `${m.id}:cloud`,
            });
            setStageCursor(e, "pointer");
          }}
          onMouseLeave={(e) => {
            hideHoverHint();
            setStageCursor(e, "");
          }}
          shadowColor={!selected && hovered ? m.color : undefined}
          shadowBlur={!selected && hovered ? 6 : 0}
          shadowOpacity={!selected && hovered ? HOVER_SHADOW_OPACITY : 0}
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
        <Group
          onClick={onClick}
          onMouseDown={onClick}
          onMouseEnter={(e) => {
            showHoverHint({
              text: "select dimension",
              x: midX + 8,
              y: midY - 24,
              targetKey: `${m.id}:dimension`,
            });
            setStageCursor(e, "pointer");
          }}
          onMouseLeave={(e) => {
            hideHoverHint();
            setStageCursor(e, "");
          }}
        >
          <Line
            points={[m.p1.x, m.p1.y, m.p2.x, m.p2.y]}
            stroke={m.color}
            strokeWidth={hovered && !selected ? 1.45 : 1.2}
            shadowColor={hovered && !selected ? m.color : undefined}
            shadowBlur={hovered && !selected ? 5 : 0}
            shadowOpacity={hovered && !selected ? HOVER_SHADOW_OPACITY : 0}
          />
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
          strokeWidth={selected ? 2.5 : hovered ? 1.8 : 1.5}
          onClick={onClick}
          onMouseDown={handlePointerDown}
          onMouseEnter={() => {
            showHoverHint({
              text: draggable ? "move shape" : "select shape",
              x: m.x + m.width + 6,
              y: m.y - 12,
              targetKey: `${m.id}:rect`,
            });
          }}
          onMouseLeave={hideHoverHint}
          draggable={draggable}
          onDragStart={clearHoverForDrag}
          onDragEnd={(e) => {
            updateMarkup(m.id, { x: e.target.x(), y: e.target.y() } as any);
            finishHoverDrag(e);
          }}
          shadowColor={!selected && hovered ? m.color : undefined}
          shadowBlur={!selected && hovered ? 6 : 0}
          shadowOpacity={!selected && hovered ? HOVER_SHADOW_OPACITY : 0}
        />
      );

    case "arrow": {
      const midX = (m.p1.x + m.p2.x) / 2;
      const midY = (m.p1.y + m.p2.y) / 2;
      return (
        <Arrow
          points={[m.p1.x, m.p1.y, m.p2.x, m.p2.y]}
          stroke={m.color}
          fill={m.color}
          strokeWidth={selected ? 2.5 : hovered ? 1.9 : 1.6}
          pointerLength={10}
          pointerWidth={10}
          onClick={onClick}
          onMouseDown={onClick}
          onMouseEnter={(e) => {
            showHoverHint({
              text: "select arrow",
              x: midX + 8,
              y: midY - 14,
              targetKey: `${m.id}:arrow`,
            });
            setStageCursor(e, "pointer");
          }}
          onMouseLeave={(e) => {
            hideHoverHint();
            setStageCursor(e, "");
          }}
          shadowColor={!selected && hovered ? m.color : undefined}
          shadowBlur={!selected && hovered ? 6 : 0}
          shadowOpacity={!selected && hovered ? HOVER_SHADOW_OPACITY : 0}
        />
      );
    }

    case "polygon": {
      const bounds = boundsOfFlatPoints(m.points);
      return (
        <Line
          points={m.points}
          stroke={m.color}
          strokeWidth={selected ? 2.5 : hovered ? 1.8 : 1.5}
          fill={m.fill}
          closed
          onClick={onClick}
          onMouseDown={onClick}
          onMouseEnter={(e) => {
            showHoverHint({
              text: "select polygon",
              x: bounds.x + bounds.width + 6,
              y: bounds.y - 12,
              targetKey: `${m.id}:polygon`,
            });
            setStageCursor(e, "pointer");
          }}
          onMouseLeave={(e) => {
            hideHoverHint();
            setStageCursor(e, "");
          }}
          shadowColor={!selected && hovered ? m.color : undefined}
          shadowBlur={!selected && hovered ? 6 : 0}
          shadowOpacity={!selected && hovered ? HOVER_SHADOW_OPACITY : 0}
        />
      );
    }

    case "freehand": {
      const bounds = boundsOfFlatPoints(m.points);
      return (
        <Line
          points={m.points}
          stroke={m.color}
          strokeWidth={m.thickness + (selected ? 1 : hovered ? 0.6 : 0)}
          lineCap="round"
          lineJoin="round"
          tension={0.4}
          onClick={onClick}
          onTap={onClick}
          onMouseDown={onClick}
          onMouseEnter={(e) => {
            showHoverHint({
              text: "select stroke",
              x: bounds.x + bounds.width + 6,
              y: bounds.y - 12,
              targetKey: `${m.id}:freehand`,
            });
            setStageCursor(e, "pointer");
          }}
          onMouseLeave={(e) => {
            hideHoverHint();
            setStageCursor(e, "");
          }}
          // Generous hit area so the eraser tool feels forgiving — thin
          // pen strokes are otherwise nearly impossible to land a click on.
          hitStrokeWidth={Math.max(14, m.thickness + 10)}
          shadowColor={selected || hovered ? m.color : undefined}
          shadowBlur={selected ? 6 : hovered ? 5 : 0}
          shadowOpacity={selected ? 0.55 : hovered ? HOVER_SHADOW_OPACITY : 0}
        />
      );
    }
  }
}

function HoverHintLabel({ hint }: { hint: HoverHint }) {
  return (
    <Label x={hint.x} y={hint.y} listening={false} opacity={hint.fading ? 0.16 : 0.36}>
      <Tag
        fill="#0B1220"
        stroke="#B8C3D7"
        strokeWidth={0.14}
        cornerRadius={2}
        shadowColor="#000000"
        shadowBlur={1}
        shadowOpacity={0.08}
        perfectDrawEnabled={false}
      />
      <Text
        text={hint.text}
        fontFamily="JetBrains Mono"
        fontStyle="500"
        fontSize={5}
        fill="#B8C3D7"
        padding={1.6}
        perfectDrawEnabled={false}
      />
    </Label>
  );
}

function boundsOfFlatPoints(points: number[]) {
  if (points.length < 2) return { x: 0, y: 0, width: 0, height: 0 };
  let minX = points[0];
  let maxX = points[0];
  let minY = points[1];
  let maxY = points[1];
  for (let i = 2; i < points.length; i += 2) {
    const x = points[i];
    const y = points[i + 1];
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
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

function isLockHintMovableMarkup(markup: Markup) {
  return (
    markup.kind === "device" ||
    markup.kind === "cable" ||
    markup.kind === "text" ||
    markup.kind === "rect" ||
    markup.kind === "schedule"
  );
}
