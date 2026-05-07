import { useRef, useState } from "react";
import { useProjectStore, type BrandTheme } from "../store/projectStore";
import {
  X,
  Sliders,
  DollarSign,
  Sun,
  Moon,
  Wand2,
  Sparkles,
  Upload,
  RefreshCcw,
  Trash2,
} from "lucide-react";
import { QualityToggle } from "./QualityToggle";
import { QUALITY_PROFILES } from "../lib/quality";
import { PricingEditor } from "./PricingEditor";
import {
  DEFAULT_BRANDING,
  DEFAULT_COVER_SUBTITLE,
  resolveBranding,
  resolveCoverPage,
} from "../lib/branding";

type SettingsTab = "general" | "branding" | "pricing";

export function SettingsDrawer() {
  const open = useProjectStore((s) => s.settingsOpen);
  const toggle = useProjectStore((s) => s.toggleSettings);
  const project = useProjectStore((s) => s.project);
  const updateBid = useProjectStore((s) => s.updateBidDefaults);
  const setBrandTheme = useProjectStore((s) => s.setBrandTheme);
  const [tab, setTab] = useState<SettingsTab>("general");

  if (!open) return null;
  if (!project) return null;

  const d = project.bidDefaults;

  return (
    <div className="fixed inset-0 z-50 bg-midnight/60 backdrop-blur-sm animate-fade-in" onClick={toggle}>
      <div
        className="absolute right-0 top-0 bottom-0 w-[480px] panel border-l border-white/10 flex flex-col animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
          <div className="text-sm font-medium text-ink-50">Project Settings</div>
          <button onClick={toggle} className="text-ink-400 hover:text-ink-50">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-4 py-2 border-b border-white/5 flex items-center gap-1">
          <TabBtn
            active={tab === "general"}
            onClick={() => setTab("general")}
            icon={<Sliders className="w-3.5 h-3.5" />}
          >
            General
          </TabBtn>
          <TabBtn
            active={tab === "branding"}
            onClick={() => setTab("branding")}
            icon={<Sparkles className="w-3.5 h-3.5" />}
          >
            Branding
          </TabBtn>
          <TabBtn
            active={tab === "pricing"}
            onClick={() => setTab("pricing")}
            icon={<DollarSign className="w-3.5 h-3.5" />}
          >
            Pricing
          </TabBtn>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {tab === "general" && (
            <>
              <Section title="Performance Mode">
                <QualityToggle />
                <PerformanceSummary />
              </Section>
              <Section title="Export Theme">
                <div className="text-[11px] text-ink-400 leading-relaxed">
                  Controls how the title block, cover page, and BOM page
                  render on the export.{" "}
                  <span className="text-ink-200">Auto</span> picks per
                  sheet using the sampled page background — light pages
                  get a light card so the brand chrome blends in. Wordmark,
                  colors, logo, and tagline live under the{" "}
                  <span className="text-amber-knox">Branding</span> tab.
                </div>
                <ThemePicker
                  value={project.brandTheme ?? "auto"}
                  onChange={setBrandTheme}
                />
              </Section>
              <Section title="Bid Defaults">
                <NumberField
                  label="Labor rate (USD / hr)"
                  value={d.laborRate}
                  onChange={(v) => updateBid({ laborRate: v })}
                />
                <NumberField
                  label="Default cable slack (%)"
                  value={d.slackPercent}
                  onChange={(v) => updateBid({ slackPercent: v })}
                />
                <NumberField
                  label="Tax rate on materials (%)"
                  value={d.taxRate}
                  onChange={(v) => updateBid({ taxRate: v })}
                />
                <NumberField
                  label="Overhead (%)"
                  value={d.overheadPercent}
                  onChange={(v) => updateBid({ overheadPercent: v })}
                />
                <NumberField
                  label="Margin (%)"
                  value={d.marginPercent}
                  onChange={(v) => updateBid({ marginPercent: v })}
                />
              </Section>
            </>
          )}
          {tab === "branding" && <BrandingEditor />}
          {tab === "pricing" && <PricingEditor />}
        </div>
      </div>
    </div>
  );
}

/**
 * Editor for the per-project branding overrides — wordmark, tagline,
 * full company name, accent colors, doc code prefix, optional uploaded
 * logo. All fields fall through to the bundled defaults when
 * left blank, so any team can pop in their own without breaking
 * anything for users who already configured a project.
 */
function BrandingEditor() {
  const project = useProjectStore((s) => s.project);
  const setBranding = useProjectStore((s) => s.setBranding);
  const resetBranding = useProjectStore((s) => s.resetBranding);
  const pushToast = useProjectStore((s) => s.pushToast);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!project) return null;
  const b = resolveBranding(project.branding);

  const onUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      pushToast("error", "Logo must be a PNG or JPG image");
      return;
    }
    if (!/png|jpeg|jpg/i.test(file.type)) {
      pushToast(
        "error",
        "Only PNG and JPG are supported (PDFs need raster formats for embedding)",
      );
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      pushToast(
        "info",
        "That logo is over 2 MB — it'll work, but exports may be heavier",
      );
    }
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(file);
    });
    setBranding({ logoDataUrl: dataUrl });
    pushToast("success", `Logo updated (${file.name})`);
  };

  const onClearLogo = () => {
    setBranding({ logoDataUrl: undefined });
  };

  const onReset = () => {
    if (
      confirm(
        "Reset all branding fields to the bundled defaults? This clears the logo, wordmark, tagline, colors, and doc code prefix on this project — and on any new projects you create — until you customize them again.",
      )
    ) {
      resetBranding();
      pushToast("info", "Branding reset to defaults");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="label mb-2 flex items-center justify-between">
          <span>Wordmark</span>
          <span className="text-[10px] font-mono text-ink-500 normal-case tracking-normal">
            (the big two-tone lockup)
          </span>
        </div>
        <p className="text-[11px] text-ink-400 leading-relaxed mb-2">
          Drawn at the top of the title block, cover, and BOM. The two
          pieces render side-by-side — primary in bold, secondary in the
          accent color — so you get a clean two-tone look. Leave either
          empty to print only the other.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <TextField
            label="Primary"
            placeholder={DEFAULT_BRANDING.wordmarkPrimary}
            value={project.branding?.wordmarkPrimary ?? ""}
            onChange={(v) => setBranding({ wordmarkPrimary: v })}
          />
          <TextField
            label="Secondary"
            placeholder={DEFAULT_BRANDING.wordmarkSecondary}
            value={project.branding?.wordmarkSecondary ?? ""}
            onChange={(v) => setBranding({ wordmarkSecondary: v })}
          />
        </div>
        <div
          className="mt-3 rounded-md border border-white/5 px-3 py-3 flex items-baseline gap-1 bg-ink-900/40 text-ink-50"
          aria-label="Wordmark preview"
        >
          <span className="font-extrabold text-2xl">{b.wordmarkPrimary}</span>
          <span className="text-2xl" style={{ color: b.accentColor }}>
            {b.wordmarkSecondary}
          </span>
          {b.tagline && (
            <span className="ml-3 text-[10px] font-bold tracking-widest text-ink-300">
              {b.tagline}
            </span>
          )}
        </div>
      </div>

      <div>
        <div className="label mb-2">Identity Text</div>
        <TextField
          label="Tagline (small caps under wordmark)"
          placeholder={DEFAULT_BRANDING.tagline}
          value={project.branding?.tagline ?? ""}
          onChange={(v) => setBranding({ tagline: v })}
        />
        <TextField
          label="Full company name (used in &quot;BY ____&quot; footer)"
          placeholder={DEFAULT_BRANDING.fullName}
          value={project.branding?.fullName ?? ""}
          onChange={(v) => setBranding({ fullName: v })}
        />
        <TextField
          label="Document code prefix"
          placeholder={DEFAULT_BRANDING.docCodePrefix}
          value={project.branding?.docCodePrefix ?? ""}
          onChange={(v) => setBranding({ docCodePrefix: v })}
          hint={`Used in codes like ${b.docCodePrefix}-${project.meta.projectNumber || "12345"}-R0`}
        />
        <TextField
          label="Cover page categories (optional)"
          placeholder={DEFAULT_BRANDING.coverCategories}
          value={project.branding?.coverCategories ?? ""}
          onChange={(v) => setBranding({ coverCategories: v })}
          hint="Small caps line under the wordmark on the cover page. Leave blank to suppress."
        />
      </div>

      <div>
        <div className="label mb-2">Brand Color</div>
        <p className="text-[11px] text-ink-400 leading-relaxed mb-2">
          Drives the amber bar / accent strip / doc-code color across the
          export and the live preview. Pick your brand color — the deeper
          shade for the bottom accent strip is auto-derived but
          overridable.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <ColorField
            label="Accent"
            value={b.accentColor}
            onChange={(v) => setBranding({ accentColor: v })}
          />
          <ColorField
            label="Accent (deep)"
            value={b.accentDeepColor}
            onChange={(v) => setBranding({ accentDeepColor: v })}
          />
        </div>
      </div>

      <div>
        <div className="label mb-2">Logo</div>
        <p className="text-[11px] text-ink-400 leading-relaxed mb-2">
          Optional PNG or JPG that replaces the built-in shield monogram
          everywhere — title block, cover page, BOM, and the live editor
          preview. Use a square image for best results; transparency is
          supported (PNG).
        </p>
        <div className="flex items-center gap-3">
          <div
            className="w-16 h-16 rounded-md border border-white/10 bg-ink-900 flex items-center justify-center overflow-hidden"
            aria-label="Logo preview"
          >
            {b.logoDataUrl ? (
              <img
                src={b.logoDataUrl}
                alt="Logo preview"
                className="max-w-full max-h-full object-contain"
              />
            ) : (
              <div className="text-[10px] text-ink-500 font-mono text-center px-1">
                NO LOGO
                <br />
                (using monogram)
              </div>
            )}
          </div>
          <div className="flex-1 flex flex-col gap-1.5">
            <button
              onClick={() => fileRef.current?.click()}
              className="btn-ghost text-xs justify-start"
            >
              <Upload className="w-3.5 h-3.5" />
              {b.logoDataUrl ? "Replace logo…" : "Upload logo…"}
            </button>
            {b.logoDataUrl && (
              <button
                onClick={onClearLogo}
                className="btn-ghost text-xs justify-start text-signal-red hover:bg-signal-red/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove logo
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                if (fileRef.current) fileRef.current.value = "";
              }}
            />
          </div>
        </div>
      </div>

      <CoverPageSettingsEditor />

      <div className="pt-2 border-t border-white/5">
        <button
          onClick={onReset}
          className="btn-ghost text-xs w-full justify-center text-ink-300 hover:text-ink-50"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          Reset all branding to defaults
        </button>
      </div>
    </div>
  );
}

/** Per-section visibility + editable subtitle for the cover page. Lets
 *  the user customize exactly what prints on the cover, and provides a
 *  shortcut button to open the live ghost preview to see the result. */
function CoverPageSettingsEditor() {
  const project = useProjectStore((s) => s.project);
  const setCoverPageSettings = useProjectStore((s) => s.setCoverPageSettings);
  const openPagePreview = useProjectStore((s) => s.openPagePreview);
  if (!project) return null;
  const c = resolveCoverPage(project.coverPage);

  const SECTIONS: {
    key: keyof typeof c;
    label: string;
    hint?: string;
  }[] = [
    { key: "showLogo", label: "Logo / brand mark", hint: "Only renders when a logo is uploaded" },
    { key: "showWordmark", label: "Wordmark (two-tone lockup)" },
    { key: "showTagline", label: "Cover tagline / categories line" },
    { key: "showSubtitle", label: "Subtitle line above project name" },
    { key: "showProjectName", label: "Project name (large title)" },
    { key: "showLocation", label: "Project location" },
    { key: "showClient", label: "Client name (\"Client: …\")" },
    {
      key: "showSummary",
      label: "Project summary paragraph",
      hint: "Edit text in the right Properties panel → Project Summary",
    },
    {
      key: "showStats",
      label: "Project facts row (sheets / devices / cable feet / total)",
    },
    { key: "showSheetIndex", label: "Sheet index list" },
    { key: "showFooter", label: "Footer (drawn-by + doc code)" },
  ];

  return (
    <div className="pt-3 border-t border-white/5">
      <div className="label mb-2 flex items-center justify-between">
        <span>Cover Page</span>
        <button
          onClick={() => openPagePreview("cover")}
          className="text-[10px] font-mono text-amber-knox uppercase tracking-wider hover:underline normal-case tracking-normal"
          title="Open the live ghost preview"
        >
          Preview →
        </button>
      </div>
      <p className="text-[11px] text-ink-400 leading-relaxed mb-2">
        Pick exactly which sections print on the cover. Changes show up
        live in the cover-page preview and on the next export.
      </p>

      <TextField
        label="Subtitle (small caps above the project name)"
        placeholder={DEFAULT_COVER_SUBTITLE}
        value={project.coverPage?.subtitle ?? ""}
        onChange={(v) => setCoverPageSettings({ subtitle: v || undefined })}
        hint="Leave blank to suppress the line entirely."
      />

      <div className="space-y-0.5 mt-2">
        {SECTIONS.map((s) => {
          const visible = c[s.key] as boolean;
          return (
            <button
              key={s.key as string}
              onClick={() => setCoverPageSettings({ [s.key]: !visible })}
              className="w-full flex items-start gap-2 px-2 py-1.5 rounded hover:bg-white/5 text-left"
            >
              {visible ? (
                <Sun className="w-3.5 h-3.5 text-amber-knox shrink-0 mt-0.5" />
              ) : (
                <Moon className="w-3.5 h-3.5 text-ink-500 shrink-0 mt-0.5" />
              )}
              <div className="flex-1">
                <div
                  className={`text-sm leading-tight ${visible ? "text-ink-100" : "text-ink-500 line-through"}`}
                >
                  {s.label}
                </div>
                {s.hint && (
                  <div className="text-[10px] text-ink-500 mt-0.5">{s.hint}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <div className="mb-2">
      <div
        className="text-xs text-ink-300 mb-1"
        dangerouslySetInnerHTML={{ __html: label }}
      />
      <input
        className="input w-full"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && (
        <div className="text-[10px] font-mono text-ink-500 mt-0.5">{hint}</div>
      )}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <div className="text-xs text-ink-300 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <label
          className="relative w-9 h-9 rounded-md border border-white/15 overflow-hidden cursor-pointer flex-shrink-0"
          style={{ background: value }}
          title="Pick a color"
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        </label>
        <input
          className="input flex-1 font-mono text-xs"
          value={value}
          onChange={(e) => {
            const v = e.target.value.trim();
            if (/^#[0-9A-Fa-f]{6}$/.test(v)) onChange(v.toUpperCase());
            else if (v === "" || /^#?[0-9A-Fa-f]{0,6}$/.test(v)) {
              // accept partial typing without committing yet
              onChange(v.startsWith("#") ? v.toUpperCase() : `#${v}`.toUpperCase());
            }
          }}
        />
      </div>
    </div>
  );
}

function ThemePicker({
  value,
  onChange,
}: {
  value: BrandTheme;
  onChange: (v: BrandTheme) => void;
}) {
  const opts: { id: BrandTheme; label: string; icon: React.ReactNode; hint: string }[] = [
    { id: "auto", label: "Auto", icon: <Wand2 className="w-3.5 h-3.5" />, hint: "Per sheet" },
    { id: "dark", label: "Dark", icon: <Moon className="w-3.5 h-3.5" />, hint: "Midnight + amber" },
    { id: "light", label: "Light", icon: <Sun className="w-3.5 h-3.5" />, hint: "Paper + ink" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 mt-2">
      {opts.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          data-active={value === o.id}
          className="rounded-md border border-white/5 bg-ink-700/60 hover:bg-white/5 px-2 py-2 text-xs text-ink-200 data-[active=true]:border-amber-knox/60 data-[active=true]:bg-amber-knox/10 data-[active=true]:text-amber-knox flex flex-col items-center gap-1"
        >
          {o.icon}
          <span className="font-medium">{o.label}</span>
          <span className="text-[9px] font-mono text-ink-500 uppercase tracking-wider">
            {o.hint}
          </span>
        </button>
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="label mb-2">{title}</div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function PerformanceSummary() {
  const mode = useProjectStore((s) => s.qualityMode);
  const p = QUALITY_PROFILES[mode];
  return (
    <div className="bg-ink-900/60 rounded-md p-2.5 mt-2 space-y-1 text-[11px] font-mono text-ink-300">
      <div className="flex justify-between">
        <span>Render DPI</span>
        <span className="text-ink-100">
          {p.baseScale}× → {p.maxScale}×
        </span>
      </div>
      <div className="flex justify-between">
        <span>Parallel ingest</span>
        <span className="text-ink-100">{p.ingestConcurrency}</span>
      </div>
      <div className="flex justify-between">
        <span>Re-render debounce</span>
        <span className="text-ink-100">{p.rerenderDebounceMs}ms</span>
      </div>
      <div className="flex justify-between">
        <span>Inactive sheet eviction</span>
        <span className="text-ink-100">{(p.evictAfterMs / 1000).toFixed(0)}s</span>
      </div>
      <div className="text-ink-400 mt-2 leading-relaxed">
        {mode === "speed"
          ? "Lower memory + fastest interaction. PDFs render at lower DPI; pixel scaling visible when zoomed in."
          : mode === "balanced"
          ? "Default. Sharp at typical zoom levels with reasonable memory and ingest load."
          : "Maximum sharpness even when zoomed in. Higher memory use; slower ingest."}
      </div>
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded text-xs font-medium flex items-center gap-1.5 transition-all ${active ? "bg-amber-knox/15 text-amber-knox" : "text-ink-300 hover:text-ink-100 hover:bg-white/5"}`}
    >
      {icon}
      {children}
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="text-xs text-ink-300 mb-1">{label}</div>
      <input
        className="input"
        inputMode="decimal"
        value={value}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (isFinite(v)) onChange(v);
        }}
      />
    </div>
  );
}
