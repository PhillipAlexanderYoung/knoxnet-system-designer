import { useEffect, useMemo, useRef, useState } from "react";
import { Group, Rect, Text, Line, Path, Circle, Label, Tag, Transformer, Image as KImage } from "react-konva";
import Konva from "konva";
import {
  useProjectStore,
  type Sheet,
  type BrandBounds,
  type BrandSelection,
} from "../store/projectStore";
import { devicesById } from "../data/devices";
import { categoryColor } from "../brand/tokens";
import {
  resolveTheme,
  defaultTitleBlockBounds,
  defaultLegendBounds,
} from "../lib/sheetAnalysis";
import { resolveBranding, type BrandingConfig } from "../lib/branding";

/**
 * Live, interactive ghost of the export branding rendered on top of the
 * editor canvas. Two pieces — the branded title block and the device
 * legend — each click-to-select, drag to move, and resize via the
 * eight-handle Transformer when the Select tool is active. First drag on
 * either element snaps the resolved default position into the Sheet's
 * stored bounds, so subsequent edits and the export use the user's
 * placement.
 *
 * Mirrors the layout of `drawTitleBlock` and `drawLegend` from
 * `titleBlockRenderer.ts` so the preview matches the export at the size
 * and position it'll print, including light/dark theme based on the
 * sampled page background.
 */
export function BrandPreview({
  sheet,
  sheetIndex,
  totalSheets,
}: {
  sheet: Sheet;
  sheetIndex: number;
  totalSheets: number;
}) {
  const project = useProjectStore((s) => s.project);
  const enabled = useProjectStore((s) => s.brandPreviewEnabled);
  const activeTool = useProjectStore((s) => s.activeTool);
  const selectedBrand = useProjectStore((s) => s.selectedBrand);
  const setSelectedBrand = useProjectStore((s) => s.setSelectedBrand);
  const setTitleBlockBounds = useProjectStore((s) => s.setTitleBlockBounds);
  const setLegendBounds = useProjectStore((s) => s.setLegendBounds);

  const branding = useMemo(
    () => resolveBranding(project?.branding),
    [project?.branding],
  );
  const palette = useMemo(() => {
    if (!project) return null;
    const theme = resolveTheme(project.brandTheme, sheet.bgColor);
    return theme === "light" ? lightPalette(branding) : darkPalette(branding);
  }, [project?.brandTheme, sheet.bgColor, branding]);
  const logoImg = useLogoImage(branding.logoDataUrl);

  if (!enabled || !project || !palette) return null;

  // Both elements are only interactive in select mode — otherwise the
  // user is busy with another tool (drawing cables, placing devices, etc.)
  // and we don't want the preview to swallow their clicks.
  const interactive = activeTool === "select";

  const tbBounds = sheet.titleBlockBounds ?? defaultTitleBlockBounds(sheet);
  const lgBounds = sheet.legendBounds ?? defaultLegendBounds(sheet);

  return (
    <Group>
      <TitleBlockGhost
        bounds={tbBounds}
        boundsExplicit={!!sheet.titleBlockBounds}
        palette={palette}
        branding={branding}
        logoImg={logoImg}
        project={project}
        sheet={sheet}
        sheetIndex={sheetIndex}
        totalSheets={totalSheets}
        interactive={interactive}
        selected={selectedBrand === "titleblock"}
        onSelect={(e) => {
          e.cancelBubble = true;
          if (e.evt) e.evt.stopPropagation?.();
          setSelectedBrand("titleblock");
        }}
        onChange={(b) => setTitleBlockBounds(sheet.id, b)}
      />
      <LegendGhost
        bounds={lgBounds}
        palette={palette}
        sheet={sheet}
        interactive={interactive}
        selected={selectedBrand === "legend"}
        onSelect={(e) => {
          e.cancelBubble = true;
          if (e.evt) e.evt.stopPropagation?.();
          setSelectedBrand("legend");
        }}
        onChange={(b) => setLegendBounds(sheet.id, b)}
      />
    </Group>
  );
}

/** Load the user's logo data URL into an HTMLImageElement so Konva can
 *  draw it. Returns `null` while loading or if the URL is missing /
 *  malformed. */
function useLogoImage(dataUrl: string | undefined): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!dataUrl) {
      setImg(null);
      return;
    }
    const el = new window.Image();
    el.crossOrigin = "anonymous";
    el.onload = () => setImg(el);
    el.onerror = () => setImg(null);
    el.src = dataUrl;
    return () => {
      el.onload = null;
      el.onerror = null;
    };
  }, [dataUrl]);
  return img;
}

// ───────── theme palettes ─────────

interface Palette {
  bg: string;
  bgInner: string;
  border: string;
  accent: string;
  accentDeep: string;
  ink: string;
  ink2: string;
  ink3: string;
  divider: string;
  onAccent: string;
}

function darkPalette(branding: BrandingConfig): Palette {
  return {
    bg: "#0B1220",
    bgInner: "#141C2B",
    border: branding.accentColor,
    accent: branding.accentColor,
    accentDeep: branding.accentDeepColor,
    ink: "#F5F7FA",
    ink2: "#94A0B8",
    ink3: "#5E6B85",
    divider: "#3A4458",
    onAccent: "#0B1220",
  };
}

function lightPalette(branding: BrandingConfig): Palette {
  return {
    bg: "#FFFFFF",
    bgInner: "#F2F4F8",
    border: "#0B1220",
    accent: branding.accentColor,
    accentDeep: branding.accentDeepColor,
    ink: "#0B1220",
    ink2: "#3A4458",
    ink3: "#5E6B85",
    divider: "#C2CADA",
    onAccent: "#0B1220",
  };
}

// ───────── title block ─────────

function TitleBlockGhost({
  bounds,
  boundsExplicit,
  palette,
  branding,
  logoImg,
  project,
  sheet,
  sheetIndex,
  totalSheets,
  interactive,
  selected,
  onSelect,
  onChange,
}: {
  bounds: BrandBounds;
  boundsExplicit: boolean;
  palette: Palette;
  branding: BrandingConfig;
  logoImg: HTMLImageElement | null;
  project: NonNullable<ReturnType<typeof useProjectStore.getState>["project"]>;
  sheet: Sheet;
  sheetIndex: number;
  totalSheets: number;
  interactive: boolean;
  selected: boolean;
  onSelect: (e: any) => void;
  onChange: (b: BrandBounds) => void;
}) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);

  // Hook the Transformer to the group when this element is selected.
  useEffect(() => {
    if (selected && interactive && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    } else if (trRef.current) {
      trRef.current.nodes([]);
    }
  }, [selected, interactive]);

  const { x, y, width: w, height: h } = bounds;
  const headerH = Math.max(20, Math.min(30, h * 0.19));
  const accentH = Math.max(2, h * 0.022);
  const footerH = Math.max(14, h * 0.12);

  const wordSize = Math.max(11, Math.min(16, headerH * 0.55));
  const innerH = Math.max(10, h - headerH - footerH);
  const projTitleSize = Math.max(8, Math.min(12, innerH * 0.16));
  const subSize = Math.max(7, Math.min(9, innerH * 0.11));

  // Konva text positions at the top of the bounding box and the visual
  // height is roughly fontSize * 1.25 (Inter's line-height). pdf-lib draws
  // with the baseline at y. For visual line spacing that doesn't overlap
  // we use a 1.25× line height plus a small gap.
  const LH = 1.25;
  const projectName = (project.meta.projectName || "").toUpperCase();
  const sheetTitle = (sheet.sheetTitle || sheet.name || "").toUpperCase();

  const cells: { label: string; value: string }[] = [
    { label: "PROJECT", value: project.meta.projectNumber || "—" },
    {
      label: "SHEET",
      value:
        sheet.sheetNumber || `S-${String(sheetIndex + 1).padStart(2, "0")}`,
    },
    { label: "REV", value: sheet.revision || project.meta.revision || "0" },
    {
      label: "DATE",
      value: new Date(project.meta.date).toLocaleDateString(),
    },
  ];
  // Inset the metadata grid to leave breathing room on either side and
  // give each column a clipped width so long values don't bleed into the
  // next cell.
  const innerPad = 10;
  const colW = (w - innerPad * 2) / 4;

  // Header sub-layout — wordmark gets only as much room as it needs;
  // tagline only renders when there's clear daylight between the
  // wordmark and the right edge so they don't overlap.
  const monogramSize = Math.max(12, headerH - 8);
  const monogramX = innerPad - 4;
  const wordX = monogramX + monogramSize + 6;
  const wmA = branding.wordmarkPrimary;
  const wmB = branding.wordmarkSecondary;
  const wmAW = wmA ? approxTextWidth(wmA, wordSize, true) : 0;
  const wmBW = wmB ? approxTextWidth(wmB, wordSize, false) : 0;
  const wordTotalW = wmAW + (wmA && wmB ? 1 : 0) + wmBW;
  const tagline = branding.tagline;
  const taglineW = tagline ? approxTextWidth(tagline, 7, true) : 0;
  const taglineX = w - innerPad - taglineW;
  const taglineFits = !!tagline && taglineX > wordX + wordTotalW + 14;

  // Body math. Each row is sized as fontSize * LH so successive rows can't
  // overlap regardless of font.
  const headerBottom = headerH;
  const projY = headerBottom + 8;
  const projH = projTitleSize * LH;
  const locY = projY + projH;
  const locH = subSize * LH;
  const dividerY = locY + locH + 4;
  const metaY = dividerY + 8;
  const labelLineH = 6 * LH;
  const valueLineH = 9 * LH;
  const valueY = metaY + labelLineH + 1;
  const sheetTitleLabelY = valueY + valueLineH + 6;
  const sheetTitleValueY = sheetTitleLabelY + labelLineH + 1;
  // Footer is anchored to the bottom of the rect, top-aligned within its
  // own band so it never overflows the accent strip below.
  const footerTop = h - footerH;
  const footerTextY = footerTop + (footerH - 7) / 2 - 1;
  const sheetTitleFits = sheetTitleValueY + valueLineH < footerTop - 2;

  const scaleText =
    sheet.scaleNote ||
    (sheet.calibration
      ? `1" = ${(12 / sheet.calibration.pixelsPerFoot).toFixed(2)}'`
      : "NOT TO SCALE");
  const drawnBy = `BY  ${(project.meta.drawnBy || branding.fullName).toUpperCase()}`;
  const idxStr = `${sheetIndex + 1} / ${totalSheets}`;
  // Reserve room at the right edge for the page-index, on the left for
  // the scale note, and only render "BY drawnBy" if it'll actually fit
  // between them without crowding either side.
  const scaleW = approxTextWidth(scaleText, 7, true);
  const idxW = approxTextWidth(idxStr, 7, true);
  const drawnByW = approxTextWidth(drawnBy, 7, false);
  const drawnByFits =
    innerPad + scaleW + 12 < w / 2 - drawnByW / 2 &&
    w / 2 + drawnByW / 2 < w - innerPad - idxW - 12;

  const onDragEnd = (e: any) => {
    onChange({
      x: e.target.x(),
      y: e.target.y(),
      width: w,
      height: h,
    });
  };

  const onTransformEnd = () => {
    const node = groupRef.current;
    if (!node) return;
    const sx = node.scaleX();
    const sy = node.scaleY();
    const newW = Math.max(140, w * sx);
    const newH = Math.max(64, h * sy);
    node.scaleX(1);
    node.scaleY(1);
    onChange({
      x: node.x(),
      y: node.y(),
      width: newW,
      height: newH,
    });
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={x}
        y={y}
        listening={interactive}
        draggable={interactive}
        onClick={onSelect}
        onTap={onSelect}
        onMouseDown={onSelect}
        onDragEnd={onDragEnd}
        onTransformEnd={onTransformEnd}
        opacity={0.95}
      >
        {/* Outer panel. Hit area is the whole rect so clicks anywhere on
            the title block start a drag. */}
        <Rect
          width={w}
          height={h}
          fill={palette.bg}
          stroke={palette.border}
          strokeWidth={0.75}
          opacity={0.97}
        />
        {/* Header bar */}
        <Rect width={w} height={headerH} fill={palette.accent} />
        {/* Bottom accent strip */}
        <Rect y={h - accentH} width={w} height={accentH} fill={palette.accentDeep} />
        {/* Header content: optional uploaded logo + wordmark. No default
            mark renders; the wordmark slides left when there's no logo so
            it doesn't sit awkwardly. */}
        {logoImg && (
          (() => {
            // Fit-inside-square, preserving aspect ratio. Center within
            // the monogram slot so wide logos don't get squeezed.
            const r = logoImg.width / logoImg.height;
            const fitH = monogramSize;
            const fitW = Math.min(monogramSize * 1.4, fitH * r);
            return (
              <KImage
                image={logoImg}
                x={monogramX + 2 + (monogramSize - fitW) / 2}
                y={(headerH - fitH) / 2}
                width={fitW}
                height={fitH}
              />
            );
          })()
        )}
        {wmA && (
          <Text
            text={wmA}
            x={logoImg ? wordX : innerPad}
            y={(headerH - wordSize * LH) / 2}
            fontSize={wordSize}
            fontFamily="Inter, system-ui, sans-serif"
            fontStyle="700"
            fill={palette.onAccent}
          />
        )}
        {wmB && (
          <Text
            text={wmB}
            x={(logoImg ? wordX : innerPad) + wmAW + (wmA ? 1 : 0)}
            y={(headerH - wordSize * LH) / 2}
            fontSize={wordSize}
            fontFamily="Inter, system-ui, sans-serif"
            fill={palette.onAccent}
          />
        )}
        {taglineFits && (
          <Text
            text={tagline}
            x={taglineX}
            y={(headerH - 7 * LH) / 2}
            fontSize={7}
            fontFamily="Inter, system-ui, sans-serif"
            fontStyle="700"
            fill={palette.onAccent}
          />
        )}

        {/* Body — each line clipped to the inner content width so a
            long project name can't blow past the sides. */}
        <Text
          text={projectName}
          x={innerPad}
          y={projY}
          width={w - innerPad * 2}
          fontSize={projTitleSize}
          fontStyle="700"
          fontFamily="Inter, system-ui, sans-serif"
          fill={palette.ink}
          ellipsis
          wrap="none"
        />
        {project.meta.location && (
          <Text
            text={project.meta.location}
            x={innerPad}
            y={locY}
            width={w - innerPad * 2}
            fontSize={subSize}
            fontFamily="Inter, system-ui, sans-serif"
            fill={palette.ink2}
            ellipsis
            wrap="none"
          />
        )}
        {/* Divider */}
        <Line
          points={[innerPad, dividerY, w - innerPad, dividerY]}
          stroke={palette.divider}
          strokeWidth={0.4}
        />
        {/* Metadata grid — labels and values stack with explicit line
            heights so they cannot overlap each other. Values clip to
            their column width so long project numbers / dates can't bleed
            into the neighbor cell. */}
        {cells.map((c, i) => (
          <Group key={c.label}>
            <Text
              text={c.label}
              x={innerPad + colW * i}
              y={metaY}
              width={colW - 4}
              fontSize={6}
              fontStyle="700"
              fontFamily="Inter, system-ui, sans-serif"
              fill={palette.ink3}
              ellipsis
              wrap="none"
            />
            <Text
              text={c.value}
              x={innerPad + colW * i}
              y={valueY}
              width={colW - 4}
              fontSize={9}
              fontStyle="700"
              fontFamily="Inter, system-ui, sans-serif"
              fill={palette.ink}
              ellipsis
              wrap="none"
            />
          </Group>
        ))}
        {/* Sheet title only renders when there's room above the footer
            band; otherwise it's quietly suppressed instead of overlapping
            the "NOT TO SCALE / BY ..." line in the footer. */}
        {sheetTitleFits && (
          <>
            <Text
              text="SHEET TITLE"
              x={innerPad}
              y={sheetTitleLabelY}
              fontSize={6}
              fontStyle="700"
              fontFamily="Inter, system-ui, sans-serif"
              fill={palette.ink3}
            />
            <Text
              text={sheetTitle}
              x={innerPad}
              y={sheetTitleValueY}
              width={w - innerPad * 2}
              fontSize={9}
              fontStyle="700"
              fontFamily="Inter, system-ui, sans-serif"
              fill={palette.ink}
              ellipsis
              wrap="none"
            />
          </>
        )}
        {/* Footer. Three slots: scale (left), drawn-by (center, optional),
            page index (right). drawn-by is suppressed when the box is
            narrow enough that it'd collide with either flank. */}
        <Text
          text={scaleText}
          x={innerPad}
          y={footerTextY}
          width={w / 2 - innerPad - 4}
          fontSize={7}
          fontStyle="700"
          fontFamily="Inter, system-ui, sans-serif"
          fill={palette.accent}
          ellipsis
          wrap="none"
        />
        {drawnByFits && (
          <Text
            text={drawnBy}
            x={w / 2 - drawnByW / 2}
            y={footerTextY}
            fontSize={7}
            fontFamily="Inter, system-ui, sans-serif"
            fill={palette.ink2}
          />
        )}
        <Text
          text={idxStr}
          x={w - innerPad - idxW}
          y={footerTextY}
          fontSize={7}
          fontStyle="700"
          fontFamily="Inter, system-ui, sans-serif"
          fill={palette.ink}
        />
        {/* Tiny "PREVIEW" / "DEFAULT" stamp in the corner. Pinned BELOW
            the rect (just outside) so it never overlaps the header or
            the page name above it. */}
        <Label x={w - 6} y={h + 4} listening={false}>
          <Tag
            fill={palette.accent}
            cornerRadius={2}
            opacity={0.95}
            pointerDirection="up"
            pointerWidth={5}
            pointerHeight={3}
          />
          <Text
            text={boundsExplicit ? "PREVIEW" : "PREVIEW · DEFAULT POSITION"}
            fontFamily="JetBrains Mono"
            fontStyle="700"
            fontSize={7}
            fill={palette.onAccent}
            padding={3}
            align="right"
          />
        </Label>
      </Group>
      {selected && interactive && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          flipEnabled={false}
          ignoreStroke
          anchorSize={9}
          anchorCornerRadius={2}
          anchorStroke="#F4B740"
          anchorFill="#0B1220"
          borderStroke="#F4B740"
          borderDash={[4, 4]}
          enabledAnchors={[
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
            "middle-left",
            "middle-right",
            "top-center",
            "bottom-center",
          ]}
          boundBoxFunc={(_old, next) => ({
            ...next,
            x: Math.max(0, next.x),
            y: Math.max(0, next.y),
            width: Math.min(sheet.pageWidth, Math.max(140, next.width)),
            height: Math.min(sheet.pageHeight, Math.max(64, next.height)),
          })}
        />
      )}
    </>
  );
}

// ───────── legend ─────────

function LegendGhost({
  bounds,
  palette,
  sheet,
  interactive,
  selected,
  onSelect,
  onChange,
}: {
  bounds: BrandBounds;
  palette: Palette;
  sheet: Sheet;
  interactive: boolean;
  selected: boolean;
  onSelect: (e: any) => void;
  onChange: (b: BrandBounds) => void;
}) {
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (selected && interactive && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    } else if (trRef.current) {
      trRef.current.nodes([]);
    }
  }, [selected, interactive]);

  // Aggregate device counts on this sheet.
  const counts = new Map<string, number>();
  for (const m of sheet.markups) {
    if (m.kind === "device") {
      counts.set(m.deviceId, (counts.get(m.deviceId) ?? 0) + 1);
    }
  }
  const entries = Array.from(counts.entries())
    .map(([id, qty]) => ({ dev: devicesById[id], qty }))
    .filter((e) => e.dev);

  // Don't render an empty legend at all — there's nothing to show and a
  // floating empty rect is more confusing than nothing.
  if (entries.length === 0) return null;

  const { x, y, width: w, height: h } = bounds;
  const headerH = 18;
  const padding = 10;
  const lineH = 14;
  const maxLines = Math.max(0, Math.floor((h - headerH - padding * 2) / lineH));
  const visible = entries.slice(0, maxLines);
  const overflow = entries.length - visible.length;

  const onDragEnd = (e: any) => {
    onChange({ x: e.target.x(), y: e.target.y(), width: w, height: h });
  };
  const onTransformEnd = () => {
    const node = groupRef.current;
    if (!node) return;
    const sx = node.scaleX();
    const sy = node.scaleY();
    const newW = Math.max(120, w * sx);
    const newH = Math.max(50, h * sy);
    node.scaleX(1);
    node.scaleY(1);
    onChange({ x: node.x(), y: node.y(), width: newW, height: newH });
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={x}
        y={y}
        opacity={0.95}
        listening={interactive}
        draggable={interactive}
        onClick={onSelect}
        onTap={onSelect}
        onMouseDown={onSelect}
        onDragEnd={onDragEnd}
        onTransformEnd={onTransformEnd}
      >
        <Rect
          width={w}
          height={h}
          fill={palette.bg}
          stroke={palette.accent}
          strokeWidth={0.5}
          opacity={0.97}
        />
        <Rect width={w} height={headerH} fill={palette.accent} />
        <Text
          text="LEGEND"
          x={padding}
          y={(headerH - 9 * 1.25) / 2}
          fontSize={9}
          fontStyle="700"
          fontFamily="Inter, system-ui, sans-serif"
          fill={palette.onAccent}
        />
        <Text
          text={`${entries.length} ${entries.length === 1 ? "TYPE" : "TYPES"}`}
          x={w - 60}
          y={(headerH - 7 * 1.25) / 2}
          width={50}
          align="right"
          fontSize={7}
          fontStyle="700"
          fontFamily="Inter, system-ui, sans-serif"
          fill={palette.onAccent}
        />
        {visible.map((e, i) => {
          const ly = headerH + padding + lineH * i;
          const color = categoryColor[e.dev.category] ?? "#94A0B8";
          return (
            <Group key={e.dev.id}>
              <Circle
                x={padding + 6}
                y={ly + 6}
                radius={5}
                fill={palette.bgInner}
                stroke={color}
                strokeWidth={0.6}
              />
              <Text
                text={e.dev.shortCode}
                x={padding + 16}
                y={ly + 1}
                width={32}
                fontSize={7}
                fontStyle="700"
                fontFamily="Inter, system-ui, sans-serif"
                fill={color}
                ellipsis
                wrap="none"
              />
              <Text
                text={e.dev.label}
                x={padding + 50}
                y={ly + 1}
                width={w - padding * 2 - 50 - 24}
                fontSize={8}
                fontFamily="Inter, system-ui, sans-serif"
                fill={palette.ink}
                ellipsis
                wrap="none"
              />
              <Text
                text={String(e.qty)}
                x={w - padding - 18}
                y={ly}
                width={18}
                align="right"
                fontSize={9}
                fontStyle="700"
                fontFamily="Inter, system-ui, sans-serif"
                fill={palette.accent}
              />
            </Group>
          );
        })}
        {overflow > 0 && (
          <Text
            text={`+ ${overflow} more`}
            x={padding}
            y={h - padding - 10}
            width={w - padding * 2}
            fontSize={8}
            fontStyle="600"
            fontFamily="Inter, system-ui, sans-serif"
            fill={palette.ink2}
          />
        )}
      </Group>
      {selected && interactive && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          flipEnabled={false}
          ignoreStroke
          anchorSize={9}
          anchorCornerRadius={2}
          anchorStroke="#F4B740"
          anchorFill="#0B1220"
          borderStroke="#F4B740"
          borderDash={[4, 4]}
          enabledAnchors={[
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
            "middle-left",
            "middle-right",
            "top-center",
            "bottom-center",
          ]}
          boundBoxFunc={(_old, next) => ({
            ...next,
            x: Math.max(0, next.x),
            y: Math.max(0, next.y),
            width: Math.min(sheet.pageWidth, Math.max(120, next.width)),
            height: Math.min(sheet.pageHeight, Math.max(50, next.height)),
          })}
        />
      )}
    </>
  );
}

// ───────── helpers ─────────

/** Quick-and-dirty text width estimate matching pdf-lib's Helvetica
 *  metrics closely enough for layout. We don't have the actual font on
 *  the canvas yet (Konva measures asynchronously), so this keeps
 *  positions stable and matches what the export does. */
function approxTextWidth(s: string, size: number, bold: boolean): number {
  const factor = bold ? 0.58 : 0.54;
  return s.length * size * factor;
}

