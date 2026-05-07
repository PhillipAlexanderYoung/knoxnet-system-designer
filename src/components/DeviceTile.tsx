import type { DeviceType } from "../data/devices";
import { categoryColor } from "../brand/tokens";

/**
 * Renders a tile preview of a device using the same SVG path data that the
 * Konva node uses, so the palette icon == the canvas icon.
 */
export function DeviceTile({
  device,
  active,
  onClick,
}: {
  device: DeviceType;
  active: boolean;
  onClick: () => void;
}) {
  const color = categoryColor[device.category] ?? "#94A0B8";
  return (
    <button
      onClick={onClick}
      className={`group relative rounded-lg p-2 border transition-all text-left
        ${active ? "border-amber-knox bg-amber-knox/10 shadow-glow" : "border-white/5 bg-white/[0.02] hover:bg-white/5 hover:border-white/15"}`}
    >
      <div className="flex flex-col items-center">
        <div
          className="w-12 h-12 rounded-full flex items-center justify-center"
          style={{
            backgroundColor: color + "1f",
            border: `1px solid ${color}`,
          }}
        >
          <svg viewBox="0 0 24 24" width={24} height={24}>
            {device.icon.paths.map((p, i) => (
              <path
                key={i}
                d={p.d}
                fill={
                  p.fill === "currentFill"
                    ? color + "33"
                    : p.fill === "currentStroke"
                    ? color
                    : p.fill ?? "none"
                }
                stroke={
                  p.stroke === "currentStroke"
                    ? color
                    : p.stroke === "currentFill"
                    ? color + "33"
                    : p.stroke ?? "none"
                }
                strokeWidth={p.strokeWidth ?? 0}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </svg>
        </div>
        <div className="mt-1.5 text-[11px] text-ink-100 leading-tight text-center font-medium">
          {device.label}
        </div>
        <div className="mt-0.5 text-[10px] font-mono text-ink-400">
          {device.shortCode} · ${device.defaultCost}
        </div>
      </div>
    </button>
  );
}
