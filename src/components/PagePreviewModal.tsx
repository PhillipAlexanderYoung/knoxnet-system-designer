import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectStore } from "../store/projectStore";
import {
  resolveBranding,
  resolveCoverPage,
  type BrandingConfig,
} from "../lib/branding";
import { computeBid, usd } from "../lib/bid";
import { Monogram } from "../brand/Wordmark";
import { X, Sliders, Sparkles, Pencil, Sun, Moon } from "lucide-react";

/**
 * Live ghost of the cover page or BOM page that the export will produce.
 * Renders an HTML approximation at the same logical layout as the
 * pdf-lib draw calls (792×612 landscape) and scales it to fit the
 * window. The preview reads live from the project + branding store, so
 * any edit the user makes in Settings or in the project metadata is
 * reflected immediately. Has shortcut buttons that jump to the right
 * settings tab so the user can edit content without leaving the
 * preview.
 */
export function PagePreviewModal() {
  const which = useProjectStore((s) => s.pagePreview);
  const close = useProjectStore((s) => s.closePagePreview);
  const project = useProjectStore((s) => s.project);
  const toggleSettings = useProjectStore((s) => s.toggleSettings);
  const settingsOpen = useProjectStore((s) => s.settingsOpen);
  const setBrandTheme = useProjectStore((s) => s.setBrandTheme);

  const branding = useMemo(
    () => resolveBranding(project?.branding),
    [project?.branding],
  );

  // Scale the 792×612 page to fit the modal viewport while preserving
  // aspect ratio. We measure the viewport on resize so the page always
  // fills it nicely.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (!which) return;
    const update = () => {
      const el = wrapperRef.current;
      if (!el) return;
      const margin = 32;
      const availW = el.clientWidth - margin * 2;
      const availH = el.clientHeight - margin * 2;
      const sx = availW / 792;
      const sy = availH / 612;
      setScale(Math.max(0.2, Math.min(2, Math.min(sx, sy))));
    };
    update();
    const ro = new ResizeObserver(update);
    if (wrapperRef.current) ro.observe(wrapperRef.current);
    return () => ro.disconnect();
  }, [which]);

  // Esc closes the modal — same UX as the Settings drawer.
  useEffect(() => {
    if (!which) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [which, close]);

  if (!which || !project) return null;

  // Theme used for the standalone pages — explicit `light` honors the
  // user's pick; everything else (auto / dark / undefined) falls back
  // to dark since these pages have no host PDF to blend with.
  const theme: "dark" | "light" =
    project.brandTheme === "light" ? "light" : "dark";

  const onEditMeta = () => {
    // The project metadata fields live in the markup-page Properties
    // panel, not in the Settings drawer. We just close the modal so
    // the user lands back on the canvas where those fields are visible
    // in the right rail.
    close();
  };

  const onEditBranding = () => {
    if (!settingsOpen) toggleSettings();
    // The drawer remembers the last tab; nudge it to "branding" via the
    // store's setting if that ever exists. For now just opens settings.
    close();
  };

  const onFlipTheme = () => {
    setBrandTheme(theme === "light" ? "dark" : "light");
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-midnight/80 backdrop-blur-sm animate-fade-in flex flex-col"
      onClick={close}
    >
      {/* Header — title + edit shortcuts + close */}
      <div
        className="px-5 py-3 border-b border-white/10 bg-ink-900/90 flex items-center justify-between"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-ink-50">
            {which === "cover" ? "Cover Page" : "Bill of Materials"} preview
          </span>
          <span className="text-[10px] font-mono text-ink-400 uppercase tracking-wider">
            Live · {theme} theme
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onFlipTheme}
            className="btn-ghost text-xs"
            title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}
          >
            {theme === "light" ? (
              <Moon className="w-3.5 h-3.5" />
            ) : (
              <Sun className="w-3.5 h-3.5" />
            )}
            {theme === "light" ? "Dark" : "Light"}
          </button>
          <button onClick={onEditMeta} className="btn-ghost text-xs" title="Edit project metadata in the right panel">
            <Pencil className="w-3.5 h-3.5" />
            Project info
          </button>
          <button
            onClick={onEditBranding}
            className="btn-ghost text-xs"
            title="Edit wordmark, logo, color, and tagline"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Branding
          </button>
          <button onClick={onEditBranding} className="btn-ghost text-xs" title="Open Settings drawer">
            <Sliders className="w-3.5 h-3.5" />
            Settings
          </button>
          <div className="w-px h-5 bg-white/10 mx-1" />
          <button onClick={close} className="btn-ghost" title="Close (Esc)">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Page canvas */}
      <div ref={wrapperRef} className="flex-1 relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div
          className="absolute origin-center transition-shadow"
          style={{
            top: "50%",
            left: "50%",
            transform: `translate(-50%, -50%) scale(${scale})`,
            width: 792,
            height: 612,
            boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
          }}
        >
          {which === "cover" ? (
            <CoverPagePreview
              project={project}
              branding={branding}
              theme={theme}
            />
          ) : (
            <BomPagePreview
              project={project}
              branding={branding}
              theme={theme}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ───────── Theme palette (mirrors export's `standalonePalette`) ─────────

interface PreviewPalette {
  bg: string;
  bgPanel: string;
  bgPanelBorder: string;
  footerBg: string;
  divider: string;
  ink: string;
  ink2: string;
  ink3: string;
  accent: string;
  accentDeep: string;
}

function previewPalette(theme: "dark" | "light", branding: BrandingConfig): PreviewPalette {
  if (theme === "light") {
    return {
      bg: "#FFFFFF",
      bgPanel: "#F4F6FA",
      bgPanelBorder: "#D8DDE6",
      footerBg: "#F0F2F6",
      divider: "#C2CADA",
      ink: "#0B1220",
      ink2: "#3A4458",
      ink3: "#5E6B85",
      accent: branding.accentColor,
      accentDeep: branding.accentDeepColor,
    };
  }
  return {
    bg: "#0B1220",
    bgPanel: "#141C2B",
    bgPanelBorder: "#1B2433",
    footerBg: "#080E1A",
    divider: "#1B2433",
    ink: "#F5F7FA",
    ink2: "#94A0B8",
    ink3: "#5E6B85",
    accent: branding.accentColor,
    accentDeep: branding.accentDeepColor,
  };
}

// ───────── Cover preview ─────────

function CoverPagePreview({
  project,
  branding,
  theme,
}: {
  project: NonNullable<ReturnType<typeof useProjectStore.getState>["project"]>;
  branding: BrandingConfig;
  theme: "dark" | "light";
}) {
  const p = previewPalette(theme, branding);
  const bid = useMemo(() => computeBid(project), [project]);
  // Per-section visibility + editable subtitle, with sane defaults so a
  // brand-new project still shows the full layout.
  const cover = resolveCoverPage(project.coverPage);
  const racksCount = project.racks?.length ?? 0;
  const stats = [
    { label: "SHEETS", value: String(project.sheets.length) },
    { label: "DEVICES", value: String(bid.devices.reduce((s, d) => s + d.qty, 0)) },
    { label: "CABLE FEET", value: bid.cables.reduce((s, c) => s + c.totalFeet, 0).toFixed(0) },
    {
      label: racksCount > 0 ? "RACKS" : "TOTAL",
      value: racksCount > 0 ? String(racksCount) : usd(bid.totals.grandTotal),
    },
  ];
  const docCode = `${branding.docCodePrefix}-${project.meta.projectNumber || "NEW"}-R${project.meta.revision || "0"}`;
  const sheets = project.sheets.slice(0, 8);
  // The wordmark slides left when there's no logo (or the logo section
  // is hidden) so it doesn't sit awkwardly far from the page edge.
  const showLogoSlot = cover.showLogo && !!branding.logoDataUrl;
  const wordmarkLeft = showLogoSlot ? 168 : 60;
  const taglineLeft = showLogoSlot ? 170 : 60;

  return (
    <div
      className="w-full h-full relative overflow-hidden"
      style={{ background: p.bg }}
    >
      {/* Accent strip + diagonal */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{ height: 8, background: p.accent }}
      />
      <div
        className="absolute left-0 right-0"
        style={{ top: 8, height: 4, background: p.accentDeep }}
      />

      {/* Big mark — only renders when section is on AND a logo is set */}
      {showLogoSlot && (
        <div
          className="absolute"
          style={{ top: 50, left: 60, width: 90, height: 90 }}
        >
          <Monogram size={90} branding={branding} />
        </div>
      )}
      {cover.showWordmark && (
        <div
          className="absolute font-extrabold leading-none"
          style={{
            top: 60,
            left: wordmarkLeft,
            fontSize: 48,
            color: p.ink,
            fontFamily: "Inter, system-ui, sans-serif",
            letterSpacing: "0.02em",
          }}
        >
          {branding.wordmarkPrimary}
          <span style={{ color: p.accent, fontWeight: 300 }}>
            {branding.wordmarkSecondary}
          </span>
        </div>
      )}
      {cover.showTagline && branding.coverCategories && (
        <div
          className="absolute font-bold uppercase tracking-widest"
          style={{
            top: 122,
            left: taglineLeft,
            fontSize: 9,
            color: p.ink2,
            fontFamily: "Inter, system-ui, sans-serif",
          }}
        >
          {branding.coverCategories}
        </div>
      )}

      {/* Body block — flows top-down so suppressed sections don't leave
          holes in the layout. Mirrors the cursor-based flow that the
          export uses in `drawCoverPage`. */}
      <div
        className="absolute"
        style={{ top: 220, left: 60, right: 60, bottom: 32 }}
      >
        {cover.showSubtitle && cover.subtitle && (
          <div
            className="font-bold tracking-wider"
            style={{ fontSize: 11, color: p.accent, marginBottom: 4 }}
          >
            {cover.subtitle}
          </div>
        )}
        {cover.showProjectName && (
          <div
            className="font-extrabold leading-tight"
            style={{ fontSize: 32, color: p.ink, marginBottom: 6 }}
          >
            {project.meta.projectName || "Untitled Project"}
          </div>
        )}
        {cover.showLocation && project.meta.location && (
          <div
            className="leading-tight"
            style={{ fontSize: 13, color: p.ink2, marginBottom: 2 }}
          >
            {project.meta.location}
          </div>
        )}
        {cover.showClient && project.meta.client && (
          <div className="leading-tight" style={{ fontSize: 11, color: p.ink2 }}>
            Client: {project.meta.client}
          </div>
        )}

        {/* Project Summary — wrapping body paragraph in place of the
            old chunky stats grid. Renders only when the user wrote
            something in `meta.summary` AND the section is enabled. */}
        {cover.showSummary && project.meta.summary && project.meta.summary.trim() && (
          <div style={{ marginTop: 18 }}>
            <SectionHeader
              text="PROJECT SUMMARY"
              color={p.accent}
              divider={p.divider}
              size={9}
            />
            <div
              className="whitespace-pre-wrap"
              style={{
                fontSize: 11,
                color: p.ink,
                lineHeight: 1.35,
                marginTop: 8,
                // Cap height so a runaway paragraph doesn't push the
                // sheet index off the page in the preview.
                maxHeight: 130,
                overflow: "hidden",
              }}
            >
              {project.meta.summary}
            </div>
          </div>
        )}

        {/* Compact Project Facts row — small label-value pairs, not the
            dashboard-style grid we used to have. */}
        {cover.showStats && (
          <div style={{ marginTop: 18 }}>
            <SectionHeader
              text="PROJECT FACTS"
              color={p.ink3}
              divider={p.divider}
              size={7}
            />
            <div
              className="grid grid-cols-4 mt-2"
              style={{ gap: 8 }}
            >
              {stats.map((s) => (
                <div key={s.label}>
                  <div
                    className="font-bold uppercase tracking-wider"
                    style={{ fontSize: 7, color: p.ink3 }}
                  >
                    {s.label}
                  </div>
                  <div
                    className="font-bold leading-tight"
                    style={{ fontSize: 14, color: p.ink, marginTop: 2 }}
                  >
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sheet index */}
        {cover.showSheetIndex && (
          <div style={{ marginTop: 18 }}>
            <SectionHeader
              text="SHEET INDEX"
              color={p.ink3}
              divider={p.divider}
              size={7}
            />
            <div
              className="mt-2 grid gap-1"
              style={{ gridTemplateColumns: "50px 1fr" }}
            >
              {sheets.map((s, i) => (
                <div key={s.id} className="contents">
                  <div className="font-bold" style={{ fontSize: 8, color: p.accent }}>
                    {s.sheetNumber || `S-${String(i + 1).padStart(2, "0")}`}
                  </div>
                  <div className="truncate" style={{ fontSize: 8, color: p.ink2 }}>
                    {s.sheetTitle || s.name}
                  </div>
                </div>
              ))}
              {project.sheets.length > 8 && (
                <div className="col-span-2" style={{ fontSize: 8, color: p.ink3 }}>
                  + {project.sheets.length - 8} more
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {cover.showFooter && (
        <div
          className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-[60px]"
          style={{ height: 24, background: p.footerBg }}
        >
          <span style={{ fontSize: 8, color: p.ink3 }}>
            {project.meta.drawnBy || branding.fullName} ·{" "}
            {new Date(project.meta.date).toLocaleDateString()}
          </span>
          <span className="font-bold font-mono" style={{ fontSize: 8, color: p.accent }}>
            {docCode}
          </span>
        </div>
      )}
    </div>
  );
}

// ───────── BOM preview ─────────

function BomPagePreview({
  project,
  branding,
  theme,
}: {
  project: NonNullable<ReturnType<typeof useProjectStore.getState>["project"]>;
  branding: BrandingConfig;
  theme: "dark" | "light";
}) {
  const p = previewPalette(theme, branding);
  const bid = useMemo(() => computeBid(project), [project]);
  const visibleDevices = bid.devices.slice(0, 18);
  const visibleCables = bid.cables.slice(0, 8);

  return (
    <div
      className="w-full h-full relative overflow-hidden"
      style={{ background: p.bg }}
    >
      {/* Accent strip */}
      <div
        className="absolute top-0 left-0 right-0"
        style={{ height: 8, background: p.accent }}
      />

      {/* Header — small mark + title */}
      <div className="absolute" style={{ top: 28, left: 36, width: 40, height: 40 }}>
        <Monogram size={40} branding={branding} />
      </div>
      <div
        className="absolute font-extrabold"
        style={{ top: 36, left: 92, fontSize: 22, color: p.ink, lineHeight: 1 }}
      >
        BILL OF MATERIALS
      </div>
      <div
        className="absolute"
        style={{ top: 64, left: 92, fontSize: 10, color: p.ink2 }}
      >
        {project.meta.projectName}
      </div>

      {/* Devices table */}
      <div className="absolute" style={{ top: 110, left: 36, right: 308 }}>
        <TableHeader
          accent={p.accent}
          cols={[
            { label: "DEVICE", width: "1fr" },
            { label: "TAG", width: "70px" },
            { label: "QTY", width: "50px" },
            { label: "UNIT $", width: "70px" },
            { label: "EXT $", width: "70px" },
            { label: "HRS", width: "50px" },
          ]}
        />
        <div className="mt-1.5">
          {visibleDevices.map((d) => (
            <div
              key={d.deviceId}
              className="grid items-baseline border-b py-1"
              style={{
                gridTemplateColumns: "1fr 70px 50px 70px 70px 50px",
                borderColor: p.bgPanelBorder,
                fontSize: 8,
                color: p.ink,
              }}
            >
              <div className="truncate pr-2">{d.label}</div>
              <div>{d.shortCode}</div>
              <div>{d.qty}</div>
              <div>{usd(d.unitCost)}</div>
              <div>{usd(d.extCost)}</div>
              <div>{d.extLabor.toFixed(1)}</div>
            </div>
          ))}
          {bid.devices.length > visibleDevices.length && (
            <div style={{ fontSize: 8, color: p.ink3 }} className="mt-1">
              + {bid.devices.length - visibleDevices.length} more device lines
            </div>
          )}
        </div>

        <div
          className="mt-5 mb-1.5 font-bold uppercase tracking-wider"
          style={{ fontSize: 11, color: p.accent }}
        >
          CABLE SCHEDULE
        </div>
        <TableHeader
          accent={p.accent}
          cols={[
            { label: "CABLE", width: "1fr" },
            { label: "FT (POST-SLACK)", width: "110px" },
            { label: "$/FT", width: "70px" },
            { label: "EXT $", width: "70px" },
            { label: "HRS", width: "50px" },
          ]}
        />
        <div className="mt-1.5">
          {visibleCables.map((c) => (
            <div
              key={c.cableId}
              className="grid items-baseline border-b py-1"
              style={{
                gridTemplateColumns: "1fr 110px 70px 70px 50px",
                borderColor: p.bgPanelBorder,
                fontSize: 8,
                color: p.ink,
              }}
            >
              <div className="truncate pr-2">{c.label}</div>
              <div>{c.totalFeet.toFixed(0)}</div>
              <div>{usd(c.costPerFoot)}</div>
              <div>{usd(c.extCost)}</div>
              <div>{c.extLabor.toFixed(1)}</div>
            </div>
          ))}
          {bid.cables.length > visibleCables.length && (
            <div style={{ fontSize: 8, color: p.ink3 }} className="mt-1">
              + {bid.cables.length - visibleCables.length} more cable lines
            </div>
          )}
        </div>
      </div>

      {/* Totals box */}
      <div
        className="absolute"
        style={{
          right: 36,
          bottom: 60,
          width: 240,
          background: p.bgPanel,
          border: `0.6px solid ${p.accent}`,
        }}
      >
        <div
          className="font-bold uppercase tracking-wider px-3 py-1"
          style={{ background: p.accent, color: "#0B1220", fontSize: 9 }}
        >
          ESTIMATED TOTAL
        </div>
        <div className="px-3 py-2.5 space-y-1">
          {[
            ["Material", usd(bid.totals.materialCost)],
            [`Labor (${bid.totals.laborHours.toFixed(1)} hr)`, usd(bid.totals.laborCost)],
            ["Overhead", usd(bid.totals.overhead)],
            ["Margin", usd(bid.totals.margin)],
            ["Tax", usd(bid.totals.tax)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between" style={{ fontSize: 8 }}>
              <span style={{ color: p.ink2 }}>{k}</span>
              <span className="font-bold" style={{ color: p.ink }}>
                {v}
              </span>
            </div>
          ))}
          <div style={{ borderTop: `0.4px solid ${p.divider}` }} className="my-1.5 pt-2">
            <div className="flex items-baseline justify-between">
              <span className="font-bold" style={{ fontSize: 10, color: p.accent }}>
                GRAND TOTAL
              </span>
              <span className="font-extrabold" style={{ fontSize: 14, color: p.ink }}>
                {usd(bid.totals.grandTotal)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="absolute"
        style={{ bottom: 20, left: 36, right: 36, fontSize: 7, color: p.ink3 }}
      >
        {branding.fullName} · {project.meta.drawnBy || branding.fullName} ·{" "}
        {new Date().toLocaleDateString()}
      </div>
    </div>
  );
}

/** Small "section title + accent rule" header reused by the cover
 *  preview. Kept here rather than inlined per-section so the spacing is
 *  consistent across Project Summary / Project Facts / Sheet Index. */
function SectionHeader({
  text,
  color,
  divider,
  size = 9,
}: {
  text: string;
  color: string;
  divider: string;
  size?: number;
}) {
  return (
    <div>
      <div
        className="font-bold uppercase tracking-wider"
        style={{ fontSize: size, color }}
      >
        {text}
      </div>
      <div
        className="mt-1"
        style={{ borderBottom: `0.4px solid ${divider}` }}
      />
    </div>
  );
}

function TableHeader({
  accent,
  cols,
}: {
  accent: string;
  cols: { label: string; width: string }[];
}) {
  return (
    <div>
      <div
        className="grid font-bold uppercase tracking-wider"
        style={{
          gridTemplateColumns: cols.map((c) => c.width).join(" "),
          fontSize: 7,
          color: accent,
          paddingBottom: 2,
          borderBottom: `0.4px solid ${accent}`,
        }}
      >
        {cols.map((c) => (
          <div key={c.label}>{c.label}</div>
        ))}
      </div>
    </div>
  );
}
