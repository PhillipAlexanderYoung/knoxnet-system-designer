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
  onMouseDown?: (e: any) => void;
  onClick?: (e: any) => void;
  draggable?: boolean;
  onDragEnd?: (e: any) => void;
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
  onMouseDown,
  onClick,
  draggable,
  onDragEnd,
}: Props) {
  const color = colorOverride ?? categoryColor[device.category] ?? "#94A0B8";
  const fillSoft = color + "33"; // ~20% alpha
  const half = size / 2;
  const iconScale = size / 24;
  return (
    <Group
      x={x}
      y={y}
      rotation={rotation}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onTap={onClick}
      draggable={draggable}
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
      {/* Background disc */}
      <Circle
        x={0}
        y={0}
        radius={half}
        fill="#0B1220"
        stroke={color}
        strokeWidth={1.5}
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
    </Group>
  );
}
