import { useEffect, useRef } from "react";
import { Group, Rect, Label, Tag, Text, Transformer } from "react-konva";
import Konva from "konva";
import {
  useProjectStore,
  type Sheet,
  type MaskRegion,
} from "../store/projectStore";

/**
 * Visualizes per-sheet "mask" rectangles — the cover-ups the user has drawn
 * (or auto-placed) over the original PDF's title block, logos, and stamps.
 *
 * Each mask is rendered with its sampled fill so the user previews exactly
 * what will be painted on top of the source PDF on export. With the select
 * tool active, masks become draggable and gain resize handles via Konva's
 * Transformer; in any other tool they're click-through so they don't get
 * in the way of placing devices or drawing markups.
 */
export function MaskLayer({ sheet }: { sheet: Sheet }) {
  const masks = sheet.maskRegions ?? [];
  const selected = useProjectStore((s) => s.selectedMarkupIds);
  const setSelected = useProjectStore((s) => s.setSelected);
  const updateMaskRegion = useProjectStore((s) => s.updateMaskRegion);
  const activeTool = useProjectStore((s) => s.activeTool);
  const setActiveTool = useProjectStore((s) => s.setActiveTool);

  if (masks.length === 0) return null;

  return (
    <Group>
      {masks.map((m) => (
        <MaskNode
          key={m.id}
          mask={m}
          sheet={sheet}
          selected={selected.includes(m.id)}
          interactive={activeTool === "select"}
          onSelect={(e: any) => {
            e.cancelBubble = true;
            if (e.evt) e.evt.stopPropagation?.();
            if (activeTool !== "select") setActiveTool("select");
            setSelected([m.id]);
          }}
          onChange={(patch) => updateMaskRegion(sheet.id, m.id, patch)}
        />
      ))}
    </Group>
  );
}

function MaskNode({
  mask,
  sheet,
  selected,
  interactive,
  onSelect,
  onChange,
}: {
  mask: MaskRegion;
  sheet: Sheet;
  selected: boolean;
  interactive: boolean;
  onSelect: (e: any) => void;
  onChange: (patch: Partial<MaskRegion>) => void;
}) {
  const rectRef = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);

  // Keep the Transformer attached to the Rect when this mask becomes
  // selected, and detach when it's not.
  useEffect(() => {
    if (selected && trRef.current && rectRef.current) {
      trRef.current.nodes([rectRef.current]);
      trRef.current.getLayer()?.batchDraw();
    } else if (trRef.current) {
      trRef.current.nodes([]);
    }
  }, [selected]);

  if (mask.hiddenInEditor) return null;

  const fill = mask.fill ?? sheet.bgColor ?? "#FFFFFF";
  const accent = "#5E6B85";
  const dash = [4, 4];

  return (
    <Group>
      <Rect
        ref={rectRef}
        x={mask.x}
        y={mask.y}
        width={mask.width}
        height={mask.height}
        fill={fill}
        opacity={interactive ? 0.8 : 0.92}
        stroke={accent}
        strokeWidth={1.2}
        dash={dash}
        listening={interactive}
        draggable={interactive}
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => {
          onChange({ x: e.target.x(), y: e.target.y() });
        }}
        onTransformEnd={() => {
          // Konva applies width/height as scaleX/scaleY on Rect; bake those
          // back into actual width/height so the values stay sane on the
          // next interaction and survive serialization.
          const node = rectRef.current;
          if (!node) return;
          const sx = node.scaleX();
          const sy = node.scaleY();
          const newW = Math.max(8, node.width() * sx);
          const newH = Math.max(8, node.height() * sy);
          node.scaleX(1);
          node.scaleY(1);
          onChange({
            x: node.x(),
            y: node.y(),
            width: newW,
            height: newH,
          });
        }}
      />
      {/* Tag label so the mask is identifiable at a glance */}
      <Label x={mask.x + 4} y={mask.y + 4} listening={false}>
        <Tag fill="#0B1220" opacity={0.9} cornerRadius={2} />
        <Text
          text="MASK"
          fontFamily="Inter, system-ui, sans-serif"
          fontStyle="600"
          fontSize={9}
          padding={3}
          fill="#F5F7FA"
        />
      </Label>
      {selected && interactive && (
        <Transformer
          ref={trRef}
          rotateEnabled={false}
          flipEnabled={false}
          ignoreStroke
          anchorSize={8}
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
          boundBoxFunc={(_old, next) => {
            // Keep masks within the page so they don't get lost off-screen.
            return {
              ...next,
              x: Math.max(0, next.x),
              y: Math.max(0, next.y),
              width: Math.min(sheet.pageWidth, Math.max(8, next.width)),
              height: Math.min(sheet.pageHeight, Math.max(8, next.height)),
            };
          }}
        />
      )}
    </Group>
  );
}
