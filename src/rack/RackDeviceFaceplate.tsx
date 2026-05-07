import type { CSSProperties } from "react";
import type {
  RackDeviceType,
  Faceplate,
  FaceplateLed,
  FaceplatePortGroup,
  FaceplateText,
  FaceplateBay,
  LedKind,
} from "../data/rackDevices";

interface Props {
  device: RackDeviceType;
  /** Pixel height of one U in the renderer */
  uPx: number;
  /** Optional override label printed inside the faceplate (e.g. asset tag) */
  overlayLabel?: string;
  /** Visual width override; defaults to standard 19" rack interior (same scale) */
  widthPx?: number;
  /** Render a placement-style border (used when ghosting/dragging) */
  ghost?: boolean;
}

const BASE_STYLES: Record<Faceplate["base"], CSSProperties> = {
  black: {
    background:
      "linear-gradient(180deg, #1A1F29 0%, #0E121B 50%, #1A1F29 100%)",
    color: "#E2E7EF",
  },
  graphite: {
    background:
      "linear-gradient(180deg, #2A3140 0%, #1A2030 50%, #2A3140 100%)",
    color: "#E2E7EF",
  },
  white: {
    background:
      "linear-gradient(180deg, #F5F7FA 0%, #DCE2EC 50%, #F5F7FA 100%)",
    color: "#1A2030",
  },
  silver: {
    background:
      "linear-gradient(180deg, #B8C0CF 0%, #98A0B0 50%, #B8C0CF 100%)",
    color: "#1A2030",
  },
  amber: {
    background:
      "linear-gradient(180deg, #F4B740 0%, #C99227 50%, #F4B740 100%)",
    color: "#1A2030",
  },
};

const LED_COLOR: Record<LedKind, string> = {
  power: "#2BD37C",
  status: "#4FB7FF",
  link: "#F4B740",
  alert: "#FF5C7A",
};

const TEXT_SIZE: Record<NonNullable<FaceplateText["size"]>, number> = {
  xs: 7,
  sm: 9,
  md: 11,
  lg: 14,
};

export function RackDeviceFaceplate({
  device,
  uPx,
  overlayLabel,
  widthPx,
  ghost = false,
}: Props) {
  const f = device.faceplate;
  const heightPx = device.uHeight * uPx;
  const widthEffective = widthPx ?? 600; // logical width; CSS scales as needed

  return (
    <div
      className="relative overflow-hidden select-none"
      style={{
        width: widthPx ? `${widthPx}px` : "100%",
        height: heightPx,
        ...BASE_STYLES[f.base],
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.3), 0 1px 0 rgba(0,0,0,0.5)",
        opacity: ghost ? 0.6 : 1,
        outline: ghost ? "1px dashed #F4B740" : undefined,
      }}
    >
      {/* Vent stripes */}
      {f.vents && (
        <div
          className="absolute inset-y-1 left-8 right-8 opacity-40"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, transparent 0 4px, rgba(0,0,0,0.55) 4px 6px)",
          }}
        />
      )}

      {/* Mounting screws */}
      {f.screws && <Screws heightPx={heightPx} base={f.base} />}

      {/* Brand wedge */}
      {f.brand && <Brand brand={f.brand} heightPx={heightPx} />}

      {/* Texts */}
      {f.texts?.map((t, i) => (
        <FText key={i} t={t} heightPx={heightPx} widthEffective={widthEffective} />
      ))}

      {/* Bays (HDDs, batteries, vents) */}
      {f.bays?.map((b, i) => (
        <Bay key={i} bay={b} heightPx={heightPx} />
      ))}

      {/* Port groups */}
      {f.ports?.map((p, i) => (
        <PortGroup key={i} g={p} heightPx={heightPx} />
      ))}

      {/* LEDs */}
      {f.leds?.map((l, i) => (
        <Led key={i} led={l} heightPx={heightPx} />
      ))}

      {/* Overlay label (e.g. user tag) */}
      {overlayLabel && (
        <div
          className="absolute right-12 bottom-1 text-[8px] font-mono tracking-wider px-1.5 py-0.5 rounded bg-black/60 text-amber-knox border border-amber-knox/40"
          style={{ fontFamily: "JetBrains Mono, monospace" }}
        >
          {overlayLabel}
        </div>
      )}

      {/* Subtle scan-line / glass sheen */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 6%, transparent 92%, rgba(0,0,0,0.18) 100%)",
        }}
      />
    </div>
  );
}

// ───── Sub-components ─────

function Screws({ heightPx, base }: { heightPx: number; base: Faceplate["base"] }) {
  const dark = base === "black" || base === "graphite";
  const screwBg = dark
    ? "radial-gradient(circle, #C2CADA 0%, #5E6B85 60%, #1A2030 100%)"
    : "radial-gradient(circle, #1A2030 0%, #5E6B85 60%, #C2CADA 100%)";
  const cy = heightPx / 2;
  return (
    <>
      <div
        className="absolute rounded-full"
        style={{
          left: 6,
          top: cy - 5,
          width: 10,
          height: 10,
          background: screwBg,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3)",
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[6px] h-[1px] bg-black/70"
          style={{ transform: "translate(-50%,-50%) rotate(35deg)" }}
        />
      </div>
      <div
        className="absolute rounded-full"
        style={{
          right: 6,
          top: cy - 5,
          width: 10,
          height: 10,
          background: screwBg,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3)",
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[6px] h-[1px] bg-black/70"
          style={{ transform: "translate(-50%,-50%) rotate(-35deg)" }}
        />
      </div>
    </>
  );
}

function Brand({
  brand,
  heightPx,
}: {
  brand: NonNullable<Faceplate["brand"]>;
  heightPx: number;
}) {
  const accent = brand.accent ?? "#F4B740";
  return (
    <div
      className="absolute flex items-center"
      style={{
        left: `${brand.x}%`,
        top: heightPx * 0.18,
        height: heightPx * 0.64,
      }}
    >
      <div
        className="h-full rounded-sm mr-1.5"
        style={{ width: 3, backgroundColor: accent }}
      />
      <div
        className="font-bold tracking-wider"
        style={{
          fontSize: Math.max(7, heightPx * 0.16),
          color: accent,
          letterSpacing: "0.08em",
          textShadow: "0 1px 0 rgba(0,0,0,0.5)",
        }}
      >
        {brand.text}
      </div>
    </div>
  );
}

function FText({
  t,
  heightPx,
}: {
  t: FaceplateText;
  heightPx: number;
  widthEffective: number;
}) {
  const size = TEXT_SIZE[t.size ?? "sm"];
  const scaled = Math.max(6, size * (heightPx / 32));
  const yPct = t.y ?? 30;
  return (
    <div
      className={`absolute ${t.weight === "bold" ? "font-bold" : "font-medium"}`}
      style={{
        left: `${t.x}%`,
        top: `${yPct}%`,
        fontSize: scaled,
        color:
          t.color === "amber"
            ? "#F4B740"
            : t.color === "muted"
            ? "rgba(120,128,144,0.85)"
            : undefined,
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      {t.text}
    </div>
  );
}

function Bay({ bay, heightPx }: { bay: FaceplateBay; heightPx: number }) {
  const yPct = bay.y ?? 12;
  const top = (yPct / 100) * heightPx;
  const h = (bay.h / 100) * heightPx;
  let bg = "linear-gradient(180deg, #0B0F18 0%, #1A2030 100%)";
  let inner: React.ReactNode = null;
  let border = "rgba(255,255,255,0.1)";
  switch (bay.style) {
    case "hdd":
      bg = "linear-gradient(180deg, #14202E 0%, #0B0F18 100%)";
      inner = (
        <>
          <div
            className="absolute right-1 top-1 w-1 h-1 rounded-full"
            style={{ background: "#2BD37C", boxShadow: "0 0 4px #2BD37C" }}
          />
          <div className="absolute left-1.5 bottom-1 text-[6px] font-mono text-ink-300">
            {bay.label}
          </div>
          <div
            className="absolute left-2 top-1.5 right-2 bottom-3 rounded-sm"
            style={{
              background:
                "repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0 1px, transparent 1px 3px)",
            }}
          />
        </>
      );
      break;
    case "battery":
      bg = "linear-gradient(180deg, #2A3140 0%, #14202E 100%)";
      inner = (
        <div className="absolute inset-1 flex items-center justify-center text-[7px] font-mono tracking-wider text-amber-knox/80">
          {bay.label}
        </div>
      );
      break;
    case "outlet":
      bg = "linear-gradient(180deg, #08101A 0%, #1A2030 100%)";
      border = "rgba(255,255,255,0.05)";
      inner = (
        <>
          <div
            className="absolute left-1/2 top-[28%] -translate-x-1/2 w-[3px] h-[6px] rounded-sm bg-black/80"
            style={{ marginLeft: -3 }}
          />
          <div
            className="absolute left-1/2 top-[28%] -translate-x-1/2 w-[3px] h-[6px] rounded-sm bg-black/80"
            style={{ marginLeft: 3 }}
          />
          <div
            className="absolute left-1/2 bottom-[15%] -translate-x-1/2 w-[5px] h-[5px] rounded-full bg-black/80"
          />
        </>
      );
      break;
    case "vent":
      bg =
        "repeating-linear-gradient(90deg, rgba(255,255,255,0.05) 0 2px, rgba(0,0,0,0.4) 2px 4px)";
      inner = bay.label ? (
        <div className="absolute inset-1 flex items-center justify-center text-[7px] font-mono tracking-wider text-ink-300">
          {bay.label}
        </div>
      ) : null;
      break;
    case "breaker":
      bg = "linear-gradient(180deg, #2A3140 0%, #0B0F18 100%)";
      inner = (
        <div className="absolute inset-1 flex items-center justify-center text-[7px] font-mono text-signal-red">
          {bay.label}
        </div>
      );
      break;
  }
  return (
    <div
      className="absolute rounded-sm"
      style={{
        left: `${bay.x}%`,
        top,
        width: `${bay.w}%`,
        height: h,
        background: bg,
        border: `1px solid ${border}`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
      }}
    >
      {inner}
    </div>
  );
}

function PortGroup({
  g,
  heightPx,
}: {
  g: FaceplatePortGroup;
  heightPx: number;
}) {
  const colors = {
    amber: "#F4B740",
    navy: "#1F3A5F",
    green: "#2BD37C",
    white: "#E2E7EF",
    black: "#1A2030",
  };
  const accent = colors[g.color ?? "amber"];
  const rows = g.rows ?? 1;
  const portsPerRow = Math.ceil(g.count / rows);
  const portW = Math.max(5, Math.min(12, 64 / portsPerRow));
  const portH = Math.max(6, Math.min(10, (heightPx * 0.32) / rows));
  const yPct = g.y ?? 18;
  const startTop = (yPct / 100) * heightPx;
  const ports: JSX.Element[] = [];
  let i = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < portsPerRow; c++) {
      if (i >= g.count) break;
      ports.push(
        <div
          key={i}
          className="rounded-[1px]"
          style={{
            width: portW,
            height: portH,
            background: `linear-gradient(180deg, ${accent}cc 0%, ${accent} 60%, ${accent}99 100%)`,
            border: "1px solid rgba(0,0,0,0.55)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.18), inset 0 -1px 0 rgba(0,0,0,0.3)",
            marginRight: 1,
            marginBottom: 1,
          }}
        />,
      );
      i++;
    }
  }
  return (
    <div
      className="absolute"
      style={{
        left: `${g.x}%`,
        top: startTop,
      }}
    >
      <div
        className="flex flex-wrap"
        style={{ width: portsPerRow * (portW + 1) }}
      >
        {ports}
      </div>
      {g.label && (
        <div
          className="absolute -bottom-2.5 left-0 font-mono text-[6px] text-ink-300/70 tracking-wider whitespace-nowrap"
          style={{ transform: "translateY(100%)" }}
        >
          {g.label}
        </div>
      )}
    </div>
  );
}

function Led({ led, heightPx }: { led: FaceplateLed; heightPx: number }) {
  const color = LED_COLOR[led.kind];
  const size = led.size ?? Math.max(3, heightPx * 0.07);
  const yPct = led.y ?? 28;
  const on = led.on ?? false;
  return (
    <div
      className="absolute rounded-full"
      style={{
        left: `${led.x}%`,
        top: `${yPct}%`,
        width: size,
        height: size,
        background: on
          ? `radial-gradient(circle, ${color} 0%, ${color}aa 40%, ${color}33 100%)`
          : `radial-gradient(circle, ${color}30 0%, ${color}15 100%)`,
        boxShadow: on
          ? `0 0 ${size * 1.6}px ${color}88, inset 0 0 ${size / 2}px ${color}`
          : "inset 0 0 2px rgba(0,0,0,0.6)",
        border: `0.5px solid ${color}55`,
      }}
    />
  );
}
