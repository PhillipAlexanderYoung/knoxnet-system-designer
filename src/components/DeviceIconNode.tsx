import { Group, Path, Circle } from "react-konva";
import type { DeviceType } from "../data/devices";
import { categoryColor } from "../brand/tokens";

interface Props {
  device: DeviceType;
  x: number;
  y: number;
  size?: number;
  rotation?: number;
  /** Optional color override (hex). Defaults to the category color. */
  color?: string;
  selected?: boolean;
  hovered?: boolean;
  onMouseDown?: (e: any) => void;
  onMouseEnter?: (e: any) => void;
  onMouseLeave?: (e: any) => void;
  onTap?: (e: any) => void;
  onClick?: (e: any) => void;
  dragDistance?: number;
  draggable?: boolean;
  onDragStart?: (e: any) => void;
  onDragMove?: (e: any) => void;
  onDragEnd?: (e: any) => void;
  /** Enlarges grab hit target on touch/coarse-pointer devices. */
  touchScale?: number;
}

/**
 * Renders a device icon on the Konva stage. The icon sits on top of a colored
 * disc badge for instant category recognition. Path coords come from the
 * 24x24 viewBox in the device manifest and are scaled to `size` px.
 */
export function DeviceIconNode({
  device,
  x,
  y,
  size = 28,
  rotation = 0,
  color: colorOverride,
  selected = false,
  hovered = false,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  onTap,
  onClick,
  dragDistance,
  draggable,
  onDragStart,
  onDragMove,
  onDragEnd,
  touchScale = 1,
}: Props) {
  const color = colorOverride ?? categoryColor[device.category] ?? "#94A0B8";
  const fillSoft = color + "33"; // ~20% alpha
  const half = size / 2;
  const grabRadius = (half + 2) * touchScale;
  const iconScale = size / 24;
  const hoverActive = hovered && !selected;
  return (
    <Group
      x={x}
      y={y}
      rotation={rotation}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={onClick}
      onTap={onTap ?? onClick}
      dragDistance={dragDistance}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={onDragEnd}
    >
      {/* Selection halo */}
      {selected && (
        <Circle
          x={0}
          y={0}
          radius={half + 6}
          stroke="#F4B740"
          strokeWidth={1.5}
          dash={[3, 3]}
          listening={false}
        />
      )}
      {/* Subtle hover affordance for selectable/touchable devices. */}
      {hoverActive && (
        <Circle
          x={0}
          y={0}
          radius={half + 4}
          stroke={color}
          strokeWidth={1}
          opacity={0.55}
          shadowColor={color}
          shadowBlur={7}
          shadowOpacity={0.35}
          listening={false}
        />
      )}
      {/* Background disc (visual only — grab hit target is the topmost circle). */}
      <Circle
        x={0}
        y={0}
        radius={half}
        fill="#0B1220"
        stroke={color}
        strokeWidth={hoverActive ? 1.9 : 1.5}
        shadowColor={hoverActive ? color : undefined}
        shadowBlur={hoverActive ? 5 : 0}
        shadowOpacity={hoverActive ? 0.3 : 0}
        listening={false}
        perfectDrawEnabled={false}
      />
      <Circle x={0} y={0} radius={half - 1.5} fill={fillSoft} listening={false} />
      {/* Centered icon path group */}
      <Group x={-half} y={-half} scaleX={iconScale} scaleY={iconScale} listening={false}>
        {device.icon.paths.map((p, i) => {
          const fill =
            p.fill === "currentFill" ? fillSoft : p.fill === "currentStroke" ? color : p.fill;
          const stroke =
            p.stroke === "currentStroke"
              ? color
              : p.stroke === "currentFill"
              ? fillSoft
              : p.stroke;
          return (
            <Path
              key={i}
              data={p.d}
              fill={fill}
              stroke={stroke}
              strokeWidth={p.strokeWidth ?? 0}
              lineJoin="round"
              lineCap="round"
            />
          );
        })}
      </Group>
      {/* Dedicated grab target. Geometry hitFunc avoids Brave/Konva hit-canvas
          misses on shadowed discs and listening=false pass-through stacks. */}
      <Circle
        x={0}
        y={0}
        radius={grabRadius}
        fill="rgba(11,18,32,0.01)"
        perfectDrawEnabled={false}
        hitFunc={(ctx, shape) => {
          ctx.beginPath();
          ctx.arc(0, 0, grabRadius, 0, Math.PI * 2, false);
          ctx.closePath();
          ctx.fillStrokeShape(shape);
        }}
      />
    </Group>
  );
}
