import { Group, Wedge, Circle, Line, Rect, Arc, Text } from "react-konva";
import type { EffectiveCoverage } from "../lib/coverage";
import { konvaSectorStart } from "../lib/coverage";
import { QUALITY_ZONES } from "../data/lenses";

interface Props {
  coverage: EffectiveCoverage;
  /** Center position in PDF user units */
  x: number;
  y: number;
  /** Outer radius in PDF user units (from feet via calibration) */
  rangePts: number;
  /** Apex offset in PDF user units (already converted from feet) */
  apexOffsetPts?: number;
  /** Device rotation: 0 = facing up, increases clockwise */
  rotation: number;
  selected?: boolean;
}

/**
 * Renders the coverage area for a placed device. Drawn BEHIND the device
 * icon. Cameras get the IPVM-style cone treatment:
 *   • cone visually starts forward of the camera body (apex offset)
 *   • optional concentric distance markers at 25/50/75% of range
 *   • optional optical-axis centerline
 *   • optional 3-zone quality bands (identify / recognize / detect)
 *   • optional FOV / range label at the cone tip
 */
export function CoverageShape({
  coverage,
  x,
  y,
  rangePts,
  apexOffsetPts = 0,
  rotation,
  selected = false,
}: Props) {
  const { shape, color, opacity } = coverage;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(rangePts) ||
    rangePts <= 0 ||
    !Number.isFinite(rotation)
  ) {
    return null;
  }
  const stroke = color;
  const fill = color;
  const strokeOp = selected ? 0.85 : 0.5;
  const fillOp = opacity * (selected ? 1.1 : 1);

  if (shape === "circle") {
    const rings = Math.max(1, coverage.rings ?? 1);
    return (
      <Group listening={false} x={x} y={y}>
        {Array.from({ length: rings }).map((_, i) => {
          const r = rangePts * ((rings - i) / rings);
          const ringFillOp = fillOp * ((i + 1) / rings) * 0.7;
          const ringStrokeOp = strokeOp * ((i + 1) / rings + 0.2);
          return (
            <Circle
              key={i}
              x={0}
              y={0}
              radius={r}
              fill={fill}
              opacity={ringFillOp}
              stroke={stroke}
              strokeWidth={0.6 + (rings === 1 ? 0.4 : 0)}
              dash={i < rings - 1 ? [3, 3] : undefined}
              listening={false}
            />
          );
        })}
        <Circle
          x={0}
          y={0}
          radius={rangePts}
          stroke={stroke}
          strokeWidth={0.7}
          opacity={strokeOp}
          listening={false}
        />
      </Group>
    );
  }

  if (shape === "sector" || shape === "beam") {
    const sweep = coverage.angle;
    if (!Number.isFinite(sweep) || sweep <= 0) return null;
    const start = konvaSectorStart(rotation, sweep);
    const apexOffset = Number.isFinite(apexOffsetPts) ? apexOffsetPts : 0;
    const apex = Math.max(0, Math.min(apexOffset, rangePts * 0.4));

    // Quality zones — replace the soft inner wedge with three opacity bands.
    const useZones = coverage.showQualityZones && shape === "sector";
    const inner = apex;

    return (
      <Group listening={false} x={x} y={y}>
        {/* Main coverage body — Arc with non-zero innerRadius produces the
            "cone extends forward of the camera" look (frustum). */}
        {!useZones && (
          <Arc
            x={0}
            y={0}
            innerRadius={inner}
            outerRadius={rangePts}
            angle={sweep}
            rotation={start}
            fill={fill}
            opacity={fillOp}
            listening={false}
          />
        )}

        {/* Stronger inner band for visual depth (only when no quality zones) */}
        {!useZones && (
          <Arc
            x={0}
            y={0}
            innerRadius={inner}
            outerRadius={(rangePts - inner) * 0.55 + inner}
            angle={sweep}
            rotation={start}
            fill={fill}
            opacity={fillOp * 0.55}
            listening={false}
          />
        )}

        {/* Quality zones: three concentric bands with darker→lighter fill */}
        {useZones &&
          QUALITY_ZONES.map((z, i) => {
            const r0 =
              i === 0 ? inner : inner + (rangePts - inner) * QUALITY_ZONES[i - 1].fraction;
            const r1 = inner + (rangePts - inner) * z.fraction;
            // Opacity decreases with distance: identify (closest) is the
            // densest band; detect (furthest) is the thinnest.
            const bandOp = fillOp * (1 - i * 0.3);
            return (
              <Arc
                key={z.id}
                x={0}
                y={0}
                innerRadius={r0}
                outerRadius={r1}
                angle={sweep}
                rotation={start}
                fill={fill}
                opacity={bandOp}
                stroke={stroke}
                strokeWidth={0.4}
                strokeOpacity={strokeOp * 0.5}
                listening={false}
              />
            );
          })}

        {/* Outer arc + radial edges — clean defined boundary */}
        <Arc
          x={0}
          y={0}
          innerRadius={rangePts}
          outerRadius={rangePts}
          angle={sweep}
          rotation={start}
          stroke={stroke}
          strokeWidth={0.9}
          opacity={strokeOp}
          listening={false}
        />
        <Line
          points={[
            ...startPoint(inner, start),
            ...endPoint(rangePts, start),
          ]}
          stroke={stroke}
          strokeWidth={0.7}
          opacity={strokeOp * 0.9}
          listening={false}
        />
        <Line
          points={[
            ...startPoint(inner, start + sweep),
            ...endPoint(rangePts, start + sweep),
          ]}
          stroke={stroke}
          strokeWidth={0.7}
          opacity={strokeOp * 0.9}
          listening={false}
        />

        {/* Optional distance markers at 25%, 50%, 75% of (range - apex) */}
        {coverage.showRangeMarkers && shape === "sector" &&
          [0.25, 0.5, 0.75].map((f) => {
            const r = inner + (rangePts - inner) * f;
            return (
              <Arc
                key={f}
                x={0}
                y={0}
                innerRadius={r}
                outerRadius={r}
                angle={sweep}
                rotation={start}
                stroke={stroke}
                strokeWidth={0.4}
                opacity={strokeOp * 0.45}
                dash={[3, 3]}
                listening={false}
              />
            );
          })}

        {/* Optical-axis centerline */}
        {coverage.showCenterline && (
          <Line
            points={[0, 0, ...endPoint(rangePts, start + sweep / 2)]}
            stroke={stroke}
            strokeWidth={0.55}
            opacity={strokeOp * 0.75}
            dash={[5, 4]}
            listening={false}
          />
        )}

        {/* Small "lens" tick at the apex — visually anchors the cone to the
            camera and makes it read as "beam emanating from here". */}
        {apex > 0 && (
          <Circle
            x={inner * Math.cos(((start + sweep / 2) * Math.PI) / 180)}
            y={inner * Math.sin(((start + sweep / 2) * Math.PI) / 180)}
            radius={1.4}
            fill={stroke}
            opacity={strokeOp + 0.2}
            listening={false}
          />
        )}

        {/* Tip label: "84° · 50 ft" */}
        {coverage.showLabel && (
          (() => {
            const tip = endPoint(rangePts * 1.04, start + sweep / 2);
            const txt = `${coverage.angle.toFixed(0)}°  ·  ${coverage.rangeFt.toFixed(0)}'`;
            const w = txt.length * 5 + 8;
            const h = 12;
            return (
              <Group x={tip[0]} y={tip[1]} listening={false}>
                <Rect
                  x={-w / 2}
                  y={-h / 2}
                  width={w}
                  height={h}
                  fill="#0B1220"
                  stroke={stroke}
                  strokeWidth={0.4}
                  cornerRadius={2}
                  opacity={0.9}
                />
                <Text
                  x={-w / 2}
                  y={-h / 2 + 2}
                  width={w}
                  height={h}
                  align="center"
                  text={txt}
                  fontFamily="JetBrains Mono"
                  fontSize={7.5}
                  fill="#F5F7FA"
                />
              </Group>
            );
          })()
        )}
      </Group>
    );
  }

  if (shape === "rect") {
    const w = rangePts;
    const h =
      coverage.angle > 0 ? rangePts * (coverage.angle / 100) : rangePts * 0.08;
    return (
      <Group listening={false} x={x} y={y} rotation={rotation - 90}>
        <Rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          fill={fill}
          opacity={fillOp}
          stroke={stroke}
          strokeWidth={0.6}
          listening={false}
        />
      </Group>
    );
  }

  return null;
}

function endPoint(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [r * Math.cos(rad), r * Math.sin(rad)];
}
function startPoint(r: number, deg: number): [number, number] {
  return endPoint(r, deg);
}
