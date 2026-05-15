import { useEffect, useMemo, useRef, useState } from "react";
import Konva from "konva";
import { Stage, Layer, Rect, Group, Text, Line, Circle } from "react-konva";
import {
  selectActiveDiagram,
  useProjectStore,
  type DeviceMarkup,
  type Diagram,
  type DiagramNodePosition,
} from "../store/projectStore";
import { devicesById } from "../data/devices";
import { categoryColor } from "../brand/tokens";
import {
  GitBranch,
  LayoutDashboard,
  Plus,
  Trash2,
  RefreshCcw,
} from "lucide-react";

const NODE_W = 160;
const NODE_H = 72;
const NODE_PAD = 24;
const GRID_GAP = 24;

/**
 * Signal-flow / block diagram view.
 *
 * Phase 4 scope:
 *   - Render every uniquely-tagged device in the project as a draggable
 *     rounded card. Cards are auto-laid-out on a grid when first opened.
 *   - Render every DeviceConnection as a straight line from one card
 *     center to the other.
 *   - The user can drag any card around; positions persist on the
 *     active Diagram so two diagrams can have independent layouts.
 *
 * Out of scope (future phases — wired as TODOs):
 *   - Auto-routing (Manhattan / orthogonal): elkjs already a planned
 *     dependency; we'll populate `diagram.routedEdges` on save when
 *     `diagram.autoLayout !== "manual"`.
 *   - Selecting / styling individual nodes (color, collapsed pinch).
 *   - Wire labels at midpoint with port info from the structured
 *     `PortSpec` (currently only the connection's free-text label
 *     surfaces on hover).
 */
export function DiagramBuilder() {
  const project = useProjectStore((s) => s.project);
  const diagram = useProjectStore(selectActiveDiagram);
  const addDiagram = useProjectStore((s) => s.addDiagram);
  const removeDiagram = useProjectStore((s) => s.removeDiagram);
  const setActiveDiagram = useProjectStore((s) => s.setActiveDiagram);
  const updateDiagram = useProjectStore((s) => s.updateDiagram);
  const setDiagramNodePosition = useProjectStore(
    (s) => s.setDiagramNodePosition,
  );
  const pushToast = useProjectStore((s) => s.pushToast);

  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [viewport, setViewport] = useState({ scale: 1, x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const panStart = useRef<{
    x: number;
    y: number;
    stageX: number;
    stageY: number;
  } | null>(null);

  // Gather every placed device tag (deduped). Multi-sheet projects can
  // have devices with the same tag — for the diagram we collapse them
  // to one node since the topology graph keys off the tag too.
  const devicesByTag = useMemo(() => {
    const map = new Map<string, DeviceMarkup>();
    if (!project) return map;
    for (const sh of project.sheets) {
      for (const m of sh.markups) {
        if (m.kind === "device" && !map.has(m.tag)) {
          map.set(m.tag, m);
        }
      }
    }
    return map;
  }, [project]);

  const tags = useMemo(() => Array.from(devicesByTag.keys()).sort(), [devicesByTag]);

  // Resolve effective positions for every tag: stored position or a
  // freshly-computed grid fallback. We *don't* persist the grid
  // fallback unless the user drags a node — keeps the saved record
  // minimal and lets the layout reflow if devices are added later.
  const positions = useMemo<Record<string, DiagramNodePosition>>(() => {
    if (!diagram) return {};
    const stored = diagram.nodePositions;
    const out: Record<string, DiagramNodePosition> = {};
    const cols = Math.max(1, Math.ceil(Math.sqrt(tags.length)));
    let i = 0;
    for (const tag of tags) {
      if (stored[tag]) {
        out[tag] = stored[tag];
      } else {
        const col = i % cols;
        const row = Math.floor(i / cols);
        out[tag] = {
          x: NODE_PAD + col * (NODE_W + GRID_GAP),
          y: NODE_PAD + row * (NODE_H + GRID_GAP),
        };
      }
      i++;
    }
    return out;
  }, [diagram, tags]);

  // Track container size for the stage.
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Auto-fit when the diagram changes / first render.
  useEffect(() => {
    if (!size.w || !size.h || tags.length === 0) return;
    // Bounding box of the auto-laid grid.
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const tag of tags) {
      const p = positions[tag];
      if (!p) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + NODE_W);
      maxY = Math.max(maxY, p.y + NODE_H);
    }
    if (!Number.isFinite(minX)) return;
    const padding = 48;
    const sx = (size.w - padding * 2) / Math.max(1, maxX - minX);
    const sy = (size.h - padding * 2) / Math.max(1, maxY - minY);
    const scale = Math.min(sx, sy, 1);
    setViewport({
      scale,
      x: padding - minX * scale + (size.w - padding * 2 - (maxX - minX) * scale) / 2,
      y: padding - minY * scale + (size.h - padding * 2 - (maxY - minY) * scale) / 2,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diagram?.id, size.w, size.h]);

  if (!project) return null;

  if (!diagram) {
    return (
      <DiagramEmpty
        onCreate={() =>
          addDiagram({ name: "System Diagram", kind: "signal-flow" })
        }
      />
    );
  }

  const connections = project.connections ?? [];

  const onWheel = (e: Konva.KonvaEventObject<WheelEvent>) => {
    e.evt.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const oldScale = viewport.scale;
    const p = stage.getPointerPosition();
    if (!p) return;
    const mousePointTo = {
      x: (p.x - viewport.x) / oldScale,
      y: (p.y - viewport.y) / oldScale,
    };
    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const factor = 1 + 0.1 * direction;
    const newScale = Math.max(0.1, Math.min(4, oldScale * factor));
    setViewport({
      scale: newScale,
      x: p.x - mousePointTo.x * newScale,
      y: p.y - mousePointTo.y * newScale,
    });
  };

  const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    const stage = stageRef.current;
    if (!stage) return;
    // Background click = start pan. Clicks that landed on a node card
    // are caught by the node's own draggable handler.
    if (e.target === stage || e.target.attrs?.name === "diagram-bg") {
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      panStart.current = {
        x: pointer.x,
        y: pointer.y,
        stageX: viewport.x,
        stageY: viewport.y,
      };
      setPanning(true);
    }
  };

  const onMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!panning || !panStart.current) return;
    const stage = stageRef.current;
    if (!stage) return;
    const pointer = stage.getPointerPosition();
    if (!pointer) return;
    setViewport({
      ...viewport,
      x: panStart.current.stageX + (pointer.x - panStart.current.x),
      y: panStart.current.stageY + (pointer.y - panStart.current.y),
    });
  };

  const onMouseUp = () => {
    setPanning(false);
    panStart.current = null;
  };

  const onResetLayout = () => {
    if (!diagram) return;
    if (
      !confirm(
        "Reset all node positions for this diagram? Cards will re-flow to the default grid.",
      )
    )
      return;
    updateDiagram(diagram.id, { nodePositions: {} });
    pushToast("info", "Layout reset to default grid");
  };

  return (
    <div className="flex-1 flex flex-col bg-ink-900 overflow-hidden">
      <DiagramToolbar
        diagram={diagram}
        diagrams={project.diagrams ?? []}
        onNew={() => addDiagram({ name: `Diagram ${(project.diagrams?.length ?? 0) + 1}` })}
        onSelect={(id) => setActiveDiagram(id)}
        onRename={(name) => updateDiagram(diagram.id, { name })}
        onRemove={() => {
          if (confirm(`Delete diagram "${diagram.name}"?`)) removeDiagram(diagram.id);
        }}
        onResetLayout={onResetLayout}
      />
      <div ref={containerRef} className="flex-1 relative workspace-grid">
        {size.w > 0 && size.h > 0 && (
          <Stage
            ref={stageRef}
            width={size.w}
            height={size.h}
            onWheel={onWheel}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => {
              setPanning(false);
              panStart.current = null;
            }}
          >
            <Layer
              scaleX={viewport.scale}
              scaleY={viewport.scale}
              x={viewport.x}
              y={viewport.y}
            >
              {/* Invisible large background so panning works anywhere
                  in the visible area, not just empty space between nodes. */}
              <Rect
                name="diagram-bg"
                x={-10000}
                y={-10000}
                width={20000}
                height={20000}
                fill="rgba(0,0,0,0)"
              />

              {/* Edges first so they pass behind the cards. */}
              {connections.map((c) => {
                const a = positions[c.fromTag];
                const b = positions[c.toTag];
                if (!a || !b) return null;
                const ax = a.x + NODE_W / 2;
                const ay = a.y + NODE_H / 2;
                const bx = b.x + NODE_W / 2;
                const by = b.y + NODE_H / 2;
                return (
                  <Group key={c.id} listening={true}>
                    <Line
                      points={[ax, ay, bx, by]}
                      stroke="#5E6B85"
                      strokeWidth={1.5}
                      lineCap="round"
                      hitStrokeWidth={10}
                    />
                    {/* Direction indicator at the destination end */}
                    <Circle x={bx} y={by} radius={3} fill="#F4B740" />
                  </Group>
                );
              })}

              {/* Device cards */}
              {tags.map((tag) => {
                const dev = devicesByTag.get(tag);
                if (!dev) return null;
                const pos = positions[tag];
                const cat = devicesById[dev.deviceId];
                const color = categoryColor[dev.category] ?? "#94A0B8";
                return (
                  <Group
                    key={tag}
                    x={pos.x}
                    y={pos.y}
                    draggable
                    onDragEnd={(e) => {
                      setDiagramNodePosition(diagram.id, tag, {
                        x: e.target.x(),
                        y: e.target.y(),
                      });
                    }}
                  >
                    <Rect
                      width={NODE_W}
                      height={NODE_H}
                      cornerRadius={8}
                      fill="#161E2E"
                      stroke={color}
                      strokeWidth={1.5}
                      shadowColor="rgba(0,0,0,0.6)"
                      shadowBlur={10}
                      shadowOffset={{ x: 0, y: 3 }}
                      shadowOpacity={0.7}
                    />
                    <Rect
                      width={NODE_W}
                      height={4}
                      fill={color}
                      cornerRadius={[8, 8, 0, 0]}
                    />
                    <Text
                      x={12}
                      y={14}
                      text={tag}
                      fontFamily="ui-monospace, monospace"
                      fontStyle="bold"
                      fontSize={14}
                      fill="#F4B740"
                    />
                    <Text
                      x={12}
                      y={34}
                      width={NODE_W - 24}
                      text={cat?.label ?? dev.deviceId}
                      fontSize={11}
                      fill="#E2E7EF"
                      ellipsis
                      wrap="none"
                    />
                    <Text
                      x={12}
                      y={50}
                      width={NODE_W - 24}
                      text={
                        dev.systemConfig?.network?.ipAddress ??
                        dev.systemConfig?.model ??
                        cat?.shortCode ??
                        ""
                      }
                      fontSize={10}
                      fontFamily="ui-monospace, monospace"
                      fill="#94A0B8"
                      ellipsis
                      wrap="none"
                    />
                  </Group>
                );
              })}
            </Layer>
          </Stage>
        )}
        {tags.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-ink-400 text-sm">
            No devices placed yet. Add devices to a sheet to populate this diagram.
          </div>
        )}
        {/* Tiny helper overlay — explains autoroute roadmap so users
            don't think it's missing.  */}
        <div className="absolute bottom-3 left-3 panel rounded-md px-3 py-2 text-[11px] text-ink-300 max-w-sm leading-snug">
          <span className="font-mono uppercase text-amber-knox tracking-wider">
            scaffold
          </span>{" "}
          Drag any card to lay out the diagram. Auto-routing (Manhattan, layered)
          is on the roadmap — connections render as straight lines for now.
        </div>
      </div>
    </div>
  );
}

function DiagramEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-ink-300 px-6">
      <GitBranch className="w-12 h-12 text-amber-knox mb-4" />
      <h2 className="text-xl font-light text-ink-50 mb-2">
        Signal-flow diagrams
      </h2>
      <p className="max-w-md text-center text-sm mb-6 text-ink-400">
        Render every device + connection in your project as a draggable
        node-link diagram. Lay it out manually now; auto-routing arrives
        in a future release.
      </p>
      <button onClick={onCreate} className="btn-primary">
        <Plus className="w-4 h-4" /> Create your first diagram
      </button>
    </div>
  );
}

function DiagramToolbar({
  diagram,
  diagrams,
  onNew,
  onSelect,
  onRename,
  onRemove,
  onResetLayout,
}: {
  diagram: Diagram;
  diagrams: Diagram[];
  onNew: () => void;
  onSelect: (id: string) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onResetLayout: () => void;
}) {
  return (
    <div className="px-3 py-2 border-b border-white/5 bg-ink-800/60 flex items-center gap-2">
      <LayoutDashboard className="w-3.5 h-3.5 text-amber-knox shrink-0" />
      <select
        className="input text-xs"
        value={diagram.id}
        onChange={(e) => onSelect(e.target.value)}
      >
        {diagrams.map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </select>
      <input
        className="input text-xs flex-1"
        value={diagram.name}
        onChange={(e) => onRename(e.target.value)}
      />
      <button onClick={onNew} className="btn-ghost text-amber-knox" title="New diagram">
        <Plus className="w-4 h-4" />
      </button>
      <button onClick={onResetLayout} className="btn-ghost" title="Reset layout">
        <RefreshCcw className="w-4 h-4" />
      </button>
      <button
        onClick={onRemove}
        className="btn-ghost text-signal-red"
        title="Delete diagram"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}
