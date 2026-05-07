import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import { devices as deviceCatalog, type DeviceCategory } from "../data/devices";
import { cables as cableCatalog } from "../data/cables";
import { rackDevices as rackCatalog } from "../data/rackDevices";
import { defaultBidDefaults, type BidDefaults } from "../data/defaults";
import {
  loadStickyBranding,
  saveStickyBranding,
  type BrandingConfig,
} from "../lib/branding";

// ───────── Types ─────────

export type QualityMode = "speed" | "balanced" | "quality";

export type ViewMode = "sheets" | "racks";

// ───────── Rack types ─────────

export interface RackPlacement {
  id: string;
  /** ref into rackDevices.ts */
  deviceId: string;
  /** U position from the bottom (1 = lowest U). The device occupies
   *  uSlot through uSlot + uHeight - 1. */
  uSlot: number;
  /** Optional override label printed under the schedule */
  label?: string;
  /** Per-instance cost override (USD) */
  costOverride?: number;
  /** Internal notes (not exported) */
  notes?: string;
}

export interface Rack {
  id: string;
  name: string;
  /** Total rack height in U (e.g. 42, 24, 12) */
  uHeight: number;
  /** Optional location label (e.g. "Head-end Cabinet · Equipment Rm 102") */
  location?: string;
  /** Optional sheet ID this rack is logically associated with */
  associatedSheetId?: string;
  placements: RackPlacement[];
  /** Created/updated timestamps for sorting */
  createdAt: number;
  updatedAt: number;
}

export type ToolId =
  | "select"
  | "pan"
  | "calibrate"
  | "device"
  | "cable"
  | "text"
  | "callout"
  | "cloud"
  | "dimension"
  | "rect"
  | "polygon"
  | "arrow"
  | "freehand"
  | "mask";

/** Per-sheet rectangular cover-up. Drawn as a flat-colored block during
 *  export to hide the original author's title block, logos, stamps, etc.
 *  Position-only: where the branded title block draws is now controlled
 *  separately by `Sheet.titleBlockBounds`, which the user moves and
 *  resizes directly on the canvas. */
export interface MaskRegion {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Hex fill (e.g. "#FFFFFF"). Falls back to sheet.bgColor, then white. */
  fill?: string;
  /** Optional human label shown in the editor. */
  label?: string;
  /** Hide this mask in the editor preview (still applied on export). */
  hiddenInEditor?: boolean;
}

/** Position + size of a branding element (title block, legend) on a sheet
 *  in PDF user units, top-left origin (matches mask + markup convention).
 *  Stored on the Sheet so it survives save/load. When `undefined` we fall
 *  back to the export's default placement so a brand-new sheet shows
 *  reasonable branding without any setup. */
export interface BrandBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Identifies which non-markup brand element is currently selected for
 *  drag/resize. Lives in the same selection slot conceptually as the
 *  markup IDs but is a separate field so the props panel + action bar
 *  don't get confused. */
export type BrandSelection = "titleblock" | "legend" | null;

/** Visual theme for the branded chrome on the export. `auto` picks a
 *  variant per sheet based on the sampled background luminance — light bg
 *  → light card, dark bg → dark card. */
export type BrandTheme = "auto" | "dark" | "light";

export type LayerId =
  | "cameras"
  | "access"
  | "network"
  | "detection"
  | "av"
  | "audio"
  | "lighting"
  | "production"
  | "wireless"
  | "broadcast"
  | "site"
  | "cable"
  | "annotation";

export interface Layer {
  id: LayerId;
  label: string;
  visible: boolean;
  locked: boolean;
}

export interface Calibration {
  // distance from p1 to p2 in PDF user units corresponds to realFeet
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  realFeet: number;
  pixelsPerFoot: number; // derived
}

export interface Sheet {
  id: string;
  name: string;
  /** original filename for reference */
  fileName: string;
  /** Object URL for this PDF file (created on ingest, lives for session) */
  objectUrl?: string;
  /** Raw bytes for export/persistence */
  pdfBytes?: Uint8Array;
  /** PDF intrinsic page dimensions in PDF points */
  pageWidth: number;
  pageHeight: number;
  /** rendered viewport scale used to render bg canvas */
  renderScale: number;
  calibration?: Calibration;
  markups: Markup[];
  /** sheet-level metadata for the title block */
  sheetNumber?: string;
  sheetTitle?: string;
  scaleNote?: string; // e.g. "1\" = 20'-0\""
  revision?: string;
  /** Cover-up rectangles for hiding the original author's branding. */
  maskRegions?: MaskRegion[];
  /** Sampled dominant background color from the rendered first paint
   *  (hex like "#FFFFFF"). Used as the default mask fill and to pick a
   *  brand theme that blends with the sheet. */
  bgColor?: string;
  /** User-placed position + size of the branded title block. When
   *  undefined the export and the editor preview both fall back to a
   *  default bottom-right placement. The user persists their choice by
   *  dragging or resizing the live preview on the canvas. */
  titleBlockBounds?: BrandBounds;
  /** Same as titleBlockBounds, but for the device legend. Default is
   *  top-right of the page. */
  legendBounds?: BrandBounds;
}

// ───────── Markup types ─────────

interface BaseMarkup {
  id: string;
  layer: LayerId;
  /** display label / annotation text */
  label?: string;
  notes?: string;
  /** locking & visibility per markup */
  locked?: boolean;
  hidden?: boolean;
}

/** ─── Camera lens specifications ───
 *  When `focalLengthMm` is set, the wedge angle is computed from
 *  focal length + sensor width. The user can still override `angle`
 *  directly to break free of the lens math. */
export type SensorFormat =
  | "1/4"
  | "1/3.6"
  | "1/3"
  | "1/2.9"
  | "1/2.8"
  | "1/2.7"
  | "1/2.5"
  | "1/2.3"
  | "1/2"
  | "1/1.8"
  | "1/1.7"
  | "2/3"
  | "1";

export interface DeviceCoverageOverride {
  /** Show/hide the coverage shape for this instance (overrides preset default) */
  enabled?: boolean;
  /** Range in real-world feet (overrides preset) */
  range?: number;
  /** Sweep / beam angle in degrees (overrides any lens calculation) */
  angle?: number;
  /** Coverage color (hex), defaults to category color */
  color?: string;
  /** Fill opacity 0..1, defaults to ~0.18 */
  opacity?: number;
  // ── Camera-style customization ──
  /** Focal length in mm. Drives angle when set (e.g. 2.8, 4, 6, 8, 12). */
  focalLengthMm?: number;
  /** Image sensor format (defaults to 1/2.7"). */
  sensorFormat?: SensorFormat;
  /**
   * Distance in feet to push the cone apex away from the device center
   * along the facing axis. When > 0, the cone visually "extends off" the
   * camera body the way IPVM/Milestone tools render FOVs. Defaults to a
   * small value derived from icon size when undefined.
   */
  apexOffsetFt?: number;
  /** Show concentric range markers (25/50/75% of range). */
  showRangeMarkers?: boolean;
  /** Show optical-axis centerline through the cone. */
  showCenterline?: boolean;
  /** Split the cone into 3 quality zones (identification → recognition → detection). */
  showQualityZones?: boolean;
  /** Show small angle/range label at the cone tip. */
  showLabel?: boolean;
}

export interface DeviceMarkup extends BaseMarkup {
  kind: "device";
  deviceId: string; // ref into devices.ts
  category: DeviceCategory;
  x: number;
  y: number;
  rotation?: number;
  /** Auto-numbered tag, e.g. CAM-01 */
  tag: string;
  /** Optional friendly label shown next to the tag (e.g. "Bandshell East") */
  labelOverride?: string;
  /** Icon size in PDF units (default 28) */
  size?: number;
  /** Per-instance color override (hex). Defaults to the category color. */
  colorOverride?: string;
  /** Per-instance cost override, otherwise falls back to type default */
  costOverride?: number;
  /** Per-instance coverage overrides (FOV / signal / beam visualization) */
  coverage?: DeviceCoverageOverride;
}

export interface CableMarkup extends BaseMarkup {
  kind: "cable";
  cableId: string;
  /** flat array [x1,y1,x2,y2,...] in PDF user units */
  points: number[];
  slackPercent?: number; // overrides project default
  /** Optional terminations / endpoint labels, surfaced in the on-canvas
   *  pill and the export so a glance at the run tells the install crew
   *  what plugs into what. */
  connector?: string; // e.g. "RJ45", "LC-LC", "F-Type", "BNC"
  endpointA?: string; // e.g. "MDF Patch 12"
  endpointB?: string; // e.g. "AP-04"
}

export interface TextMarkup extends BaseMarkup {
  kind: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
}

export interface CalloutMarkup extends BaseMarkup {
  kind: "callout";
  // leader from (x1,y1) → (x2,y2); box anchored at (x2,y2)
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  text: string;
  color: string;
}

export interface CloudMarkup extends BaseMarkup {
  kind: "cloud";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

export interface DimensionMarkup extends BaseMarkup {
  kind: "dimension";
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  color: string;
}

export interface RectMarkup extends BaseMarkup {
  kind: "rect";
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  fill?: string;
}

export interface ArrowMarkup extends BaseMarkup {
  kind: "arrow";
  p1: { x: number; y: number };
  p2: { x: number; y: number };
  color: string;
}

export interface PolygonMarkup extends BaseMarkup {
  kind: "polygon";
  points: number[];
  color: string;
  fill?: string;
}

export interface FreehandMarkup extends BaseMarkup {
  kind: "freehand";
  points: number[];
  color: string;
  thickness: number;
}

export type Markup =
  | DeviceMarkup
  | CableMarkup
  | TextMarkup
  | CalloutMarkup
  | CloudMarkup
  | DimensionMarkup
  | RectMarkup
  | ArrowMarkup
  | PolygonMarkup
  | FreehandMarkup;

/** Markup kind discriminator alias — handy for the export-visibility map
 *  below so consumers can iterate every kind without enumerating them. */
export type MarkupKind = Markup["kind"];

/** Per-markup-kind toggle for what shows up in exports. Independent of
 *  the editor's layer visibility (which already controls what renders on
 *  the canvas), so the user can hide all freehand drawings from the
 *  export without losing them in the editor. Missing keys default to
 *  `true` (visible). */
export type ExportVisibility = Partial<Record<MarkupKind, boolean>>;

/** Per-section visibility for the cover page. Each flag defaults to
 *  `true` when undefined so existing projects render exactly as before.
 *  Set any flag to `false` to suppress that section in the export AND
 *  the live preview. The `subtitle` field overrides the hardcoded
 *  "PROJECT MARKUP & BID DOCUMENTATION" lockup; empty string suppresses
 *  the line entirely. */
export interface CoverPageSettings {
  showLogo?: boolean;
  showWordmark?: boolean;
  showTagline?: boolean;
  showSubtitle?: boolean;
  showProjectName?: boolean;
  showLocation?: boolean;
  showClient?: boolean;
  /** When true, renders the freeform `ProjectMeta.summary` paragraph
   *  below the title block. Defaults to true; the section is silently
   *  suppressed when the summary text is empty either way. */
  showSummary?: boolean;
  showStats?: boolean;
  showSheetIndex?: boolean;
  showFooter?: boolean;
  /** Override for the small all-caps line above the project title. */
  subtitle?: string;
}

// ───────── Project ─────────

export interface ProjectMeta {
  projectName: string;
  projectNumber: string;
  client: string;
  location: string;
  drawnBy: string;
  date: string; // ISO
  revision: string;
  /** Optional freeform paragraph describing the scope of work. Renders
   *  as wrapping body text in the cover page's project summary section,
   *  in place of the big stats grid. Empty / undefined → section is
   *  suppressed. */
  summary?: string;
}

/**
 * Per-project catalog overrides. Lets the user re-price the catalog without
 * forking the device library. Keys are device/cable/rackDevice IDs.
 */
export interface CatalogOverrides {
  devices: Record<string, { cost?: number; labor?: number }>;
  cables: Record<string, { costPerFoot?: number; laborPerFoot?: number }>;
  rackDevices: Record<string, { cost?: number; labor?: number }>;
}

/**
 * Which rollup lines are revealed on customer-facing exports. Hidden lines
 * still affect the Grand Total — they just don't appear as separate line
 * items on the customer PDF/XLSX. The internal Bid panel always shows
 * everything regardless.
 */
export interface BidExportVisibility {
  material: boolean;
  labor: boolean;
  overhead: boolean;
  tax: boolean;
  margin: boolean;
}

export const defaultBidExportVisibility: BidExportVisibility = {
  // What the customer typically sees on a clean estimate
  material: true,
  labor: true,
  tax: true,
  // What we usually keep internal
  overhead: false,
  margin: false,
};

export interface Project {
  id: string;
  meta: ProjectMeta;
  sheets: Sheet[];
  racks: Rack[];
  bidDefaults: BidDefaults;
  catalogOverrides?: CatalogOverrides;
  /** Theme used for branded chrome on exports. Defaults to `auto`. */
  brandTheme?: BrandTheme;
  /** Per-project branding overrides (wordmark, tagline, full company
   *  name, accent colors, doc code prefix, optional logo). Any field
   *  left unset falls back to the bundled defaults so the tool works
   *  out-of-the-box and existing projects continue to render identically. */
  branding?: Partial<BrandingConfig>;
  /** Per-markup-kind toggle: which kinds get drawn into the exported
   *  PDF. Missing entries default to true. The editor's layer visibility
   *  ALSO filters the export (hidden layer → its markups don't print)
   *  so the user has both layer-grain and kind-grain control. */
  exportVisibility?: ExportVisibility;
  /** Per-section toggles + customizable text for the cover page. */
  coverPage?: CoverPageSettings;
  /** Which rollup lines are revealed on customer-facing exports. */
  bidExportVisibility?: BidExportVisibility;
  createdAt: number;
  updatedAt: number;
}

// ───────── Default layers ─────────

const DEFAULT_LAYERS: Layer[] = [
  { id: "cameras", label: "Cameras", visible: true, locked: false },
  { id: "access", label: "Access Control", visible: true, locked: false },
  { id: "network", label: "Network", visible: true, locked: false },
  { id: "detection", label: "Detection", visible: true, locked: false },
  { id: "av", label: "Video / Display", visible: true, locked: false },
  { id: "audio", label: "Audio", visible: true, locked: false },
  { id: "lighting", label: "Lighting", visible: true, locked: false },
  { id: "production", label: "Production / Stage", visible: true, locked: false },
  { id: "wireless", label: "Wireless / RF", visible: true, locked: false },
  { id: "broadcast", label: "Broadcast", visible: true, locked: false },
  { id: "site", label: "Site & Fiber", visible: true, locked: false },
  { id: "cable", label: "Cable Runs", visible: true, locked: false },
  { id: "annotation", label: "Annotation", visible: true, locked: false },
];

// ───────── Store shape ─────────

interface State {
  project: Project | null;
  view: ViewMode;
  activeSheetId: string | null;
  activeRackId: string | null;
  activeTool: ToolId;
  activeDeviceId: string | null;
  activeCableId: string | null;
  selectedMarkupIds: string[];
  /** Which branding element (if any) is currently selected for drag/resize
   *  on the canvas. Mutually exclusive with `selectedMarkupIds` — selecting
   *  a markup clears this and vice versa. */
  selectedBrand: BrandSelection;
  layers: Layer[];
  /** ephemeral cursor position in sheet (pdf-user) units, for status bar */
  cursor: { x: number; y: number } | null;
  /** zoom level (multiplied by renderScale to derive bg DPR) */
  viewport: { scale: number; x: number; y: number };
  /** snap state */
  snapEnabled: boolean;
  orthoEnabled: boolean;
  /** Global toggle: render coverage shapes for devices that have them */
  coverageVisible: boolean;
  /** Live ghost of the export branding (branded title block + device
   *  legend) overlayed on the editor canvas. On by default so the user
   *  always sees what's about to print; can be dismissed if it gets in
   *  the way of a tight markup pass. */
  brandPreviewEnabled: boolean;
  /** Which standalone-page preview modal (cover or BOM) is open. The
   *  modal renders an HTML ghost of the page so the user can see what
   *  the export will look like before they commit. `null` when closed. */
  pagePreview: "cover" | "bom" | null;
  /** Sticky settings for the freehand tool — survive tool switches so the
   *  user doesn't have to re-pick color and thickness every time they
   *  drop into freehand mode. */
  freehandColor: string;
  freehandThickness: number;
  /** When true, clicking a freehand stroke (or any annotation-layer
   *  markup) while the freehand tool is active deletes it instead of
   *  starting a new pen stroke. Sub-mode of the freehand tool, not a
   *  global eraser. */
  freehandErasing: boolean;
  /** Performance profile — controls render DPI, ingest concurrency, and
   *  re-render aggressiveness. */
  qualityMode: QualityMode;
  /** Per-sheet ingest progress. Used by the start screen + status bar. */
  ingestProgress: { total: number; done: number; failed: number };
  /** UI panels */
  bidPanelOpen: boolean;
  paletteOpen: boolean;
  settingsOpen: boolean;
  commandPaletteOpen: boolean;
  /** Toast notifications */
  toasts: { id: string; kind: "info" | "success" | "error"; message: string }[];

  // actions
  newProject: (meta?: Partial<ProjectMeta>) => void;
  loadProject: (p: Project) => void;
  updateProjectMeta: (patch: Partial<ProjectMeta>) => void;
  updateBidDefaults: (patch: Partial<BidDefaults>) => void;
  setBidExportVisibility: (line: keyof BidExportVisibility, visible: boolean) => void;
  setDeviceOverride: (
    id: string,
    patch: Partial<{ cost: number; labor: number }> | null,
  ) => void;
  setCableOverride: (
    id: string,
    patch: Partial<{ costPerFoot: number; laborPerFoot: number }> | null,
  ) => void;
  setRackDeviceOverride: (
    id: string,
    patch: Partial<{ cost: number; labor: number }> | null,
  ) => void;
  applyBulkPriceMultiplier: (
    target: "all" | "devices" | "cables" | "rackDevices",
    multiplier: number,
  ) => void;
  resetCatalogOverrides: () => void;

  addSheet: (sheet: Sheet) => void;
  removeSheet: (id: string) => void;
  setActiveSheet: (id: string | null) => void;
  updateSheet: (id: string, patch: Partial<Sheet>) => void;

  // Sheet branding overrides — masks + sampled bg color + per-sheet
  // bounds for the title block + legend
  addMaskRegion: (sheetId: string, m: MaskRegion) => void;
  updateMaskRegion: (
    sheetId: string,
    maskId: string,
    patch: Partial<MaskRegion>,
  ) => void;
  removeMaskRegion: (sheetId: string, maskId: string) => void;
  setSheetBgColor: (sheetId: string, color: string) => void;
  setBrandTheme: (theme: BrandTheme) => void;
  /** Patch the per-project branding overrides. Merges into existing
   *  `project.branding`; pass an empty object via `resetBranding()` to
   *  drop back to the bundled defaults. */
  setBranding: (patch: Partial<BrandingConfig>) => void;
  /** Wipe all project branding overrides — exports + preview revert to
   *  the bundled defaults. */
  resetBranding: () => void;
  /** Toggle whether a given markup kind is drawn on the export PDF.
   *  Useful for hiding e.g. annotation freehand or polygons from a
   *  customer-facing export without deleting them from the project. */
  setExportKindVisible: (kind: MarkupKind, visible: boolean) => void;
  /** Patch the cover page settings (section visibility + subtitle).
   *  Merges into existing values; `undefined` clears a single field
   *  back to its default. */
  setCoverPageSettings: (patch: Partial<CoverPageSettings>) => void;
  /** Set the title block's rect on a sheet. Pass `undefined` to revert to
   *  the default bottom-right placement. */
  setTitleBlockBounds: (
    sheetId: string,
    bounds: BrandBounds | undefined,
  ) => void;
  setLegendBounds: (sheetId: string, bounds: BrandBounds | undefined) => void;
  setSelectedBrand: (sel: BrandSelection) => void;

  setView: (v: ViewMode) => void;
  addRack: (rack?: Partial<Rack>) => string; // returns new rack id
  removeRack: (id: string) => void;
  setActiveRack: (id: string | null) => void;
  updateRack: (id: string, patch: Partial<Rack>) => void;
  addPlacement: (rackId: string, p: RackPlacement) => void;
  updatePlacement: (
    rackId: string,
    placementId: string,
    patch: Partial<RackPlacement>,
  ) => void;
  removePlacement: (rackId: string, placementId: string) => void;

  setActiveTool: (t: ToolId) => void;
  setActiveDevice: (id: string | null) => void;
  setActiveCable: (id: string | null) => void;
  setFreehandColor: (color: string) => void;
  setFreehandThickness: (n: number) => void;
  toggleFreehandErasing: () => void;
  toggleBrandPreview: () => void;
  openPagePreview: (which: "cover" | "bom") => void;
  closePagePreview: () => void;

  addMarkup: (m: Markup) => void;
  updateMarkup: (id: string, patch: Partial<Markup>) => void;
  deleteMarkup: (id: string) => void;
  deleteSelected: () => void;
  setSelected: (ids: string[]) => void;

  toggleLayer: (id: LayerId) => void;
  setLayerLocked: (id: LayerId, locked: boolean) => void;

  setCalibration: (sheetId: string, c: Calibration | undefined) => void;
  setCursor: (p: { x: number; y: number } | null) => void;
  setViewport: (v: Partial<{ scale: number; x: number; y: number }>) => void;
  toggleSnap: () => void;
  toggleOrtho: () => void;
  toggleCoverageVisible: () => void;
  setQualityMode: (m: QualityMode) => void;
  setIngestProgress: (
    p: Partial<{ total: number; done: number; failed: number }>,
  ) => void;
  resetIngestProgress: () => void;

  toggleBidPanel: () => void;
  togglePalette: () => void;
  toggleSettings: () => void;
  toggleCommandPalette: () => void;

  pushToast: (kind: "info" | "success" | "error", message: string) => void;
  dismissToast: (id: string) => void;

  /** Auto-numbering helper: returns next free tag for a shortCode on active sheet */
  nextTag: (shortCode: string) => string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const blankProject = (meta?: Partial<ProjectMeta>): Project => {
  // Inherit the user's sticky brand from localStorage so a new project
  // continues their company identity instead of snapping back to the
  // bundled defaults. Falls back through `resolveBranding` when the
  // user hasn't customized anything yet.
  const stickyBranding = loadStickyBranding();
  return {
    id: uid(),
    meta: {
      projectName: meta?.projectName ?? "Untitled Project",
      projectNumber: meta?.projectNumber ?? "",
      client: meta?.client ?? "",
      location: meta?.location ?? "",
      drawnBy: meta?.drawnBy ?? stickyBranding?.fullName ?? "",
      date: meta?.date ?? new Date().toISOString(),
      revision: meta?.revision ?? "0",
    },
    sheets: [],
    racks: [],
    bidDefaults: { ...defaultBidDefaults },
    branding: stickyBranding,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
};

export const useProjectStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    project: null,
    view: "sheets",
    activeSheetId: null,
    activeRackId: null,
    activeTool: "select",
    activeDeviceId: null,
    activeCableId: "cat6",
    selectedMarkupIds: [],
    selectedBrand: null,
    layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
    cursor: null,
    viewport: { scale: 1, x: 0, y: 0 },
    snapEnabled: true,
    orthoEnabled: false,
    coverageVisible: true,
    brandPreviewEnabled: true,
    pagePreview: null,
    freehandColor: "#F4B740",
    freehandThickness: 2,
    freehandErasing: false,
    qualityMode: "balanced",
    ingestProgress: { total: 0, done: 0, failed: 0 },
    bidPanelOpen: false,
    paletteOpen: true,
    settingsOpen: false,
    commandPaletteOpen: false,
    toasts: [],

    newProject: (meta) =>
      set({
        project: blankProject(meta),
        activeSheetId: null,
        selectedMarkupIds: [],
      }),

    loadProject: (p) =>
      set({
        // Backfill racks array for projects saved before the rack feature
        project: { ...p, racks: p.racks ?? [] },
        activeSheetId: p.sheets[0]?.id ?? null,
        activeRackId: (p.racks?.[0]?.id) ?? null,
        selectedMarkupIds: [],
      }),

    updateProjectMeta: (patch) =>
      set((s) => ({
        project: s.project
          ? {
              ...s.project,
              meta: { ...s.project.meta, ...patch },
              updatedAt: Date.now(),
            }
          : null,
      })),

    updateBidDefaults: (patch) =>
      set((s) => ({
        project: s.project
          ? {
              ...s.project,
              bidDefaults: { ...s.project.bidDefaults, ...patch },
              updatedAt: Date.now(),
            }
          : null,
      })),

    setBidExportVisibility: (line, visible) =>
      set((s) => {
        if (!s.project) return s;
        const cur = s.project.bidExportVisibility ?? defaultBidExportVisibility;
        return {
          project: {
            ...s.project,
            bidExportVisibility: { ...cur, [line]: visible },
            updatedAt: Date.now(),
          },
        };
      }),

    setDeviceOverride: (id, patch) =>
      set((s) => {
        if (!s.project) return s;
        const cur = s.project.catalogOverrides ?? {
          devices: {},
          cables: {},
          rackDevices: {},
        };
        const devices = { ...cur.devices };
        if (patch === null) delete devices[id];
        else devices[id] = { ...(devices[id] ?? {}), ...patch };
        return {
          project: {
            ...s.project,
            catalogOverrides: { ...cur, devices },
            updatedAt: Date.now(),
          },
        };
      }),

    setCableOverride: (id, patch) =>
      set((s) => {
        if (!s.project) return s;
        const cur = s.project.catalogOverrides ?? {
          devices: {},
          cables: {},
          rackDevices: {},
        };
        const cables = { ...cur.cables };
        if (patch === null) delete cables[id];
        else cables[id] = { ...(cables[id] ?? {}), ...patch };
        return {
          project: {
            ...s.project,
            catalogOverrides: { ...cur, cables },
            updatedAt: Date.now(),
          },
        };
      }),

    setRackDeviceOverride: (id, patch) =>
      set((s) => {
        if (!s.project) return s;
        const cur = s.project.catalogOverrides ?? {
          devices: {},
          cables: {},
          rackDevices: {},
        };
        const rackDevices = { ...cur.rackDevices };
        if (patch === null) delete rackDevices[id];
        else rackDevices[id] = { ...(rackDevices[id] ?? {}), ...patch };
        return {
          project: {
            ...s.project,
            catalogOverrides: { ...cur, rackDevices },
            updatedAt: Date.now(),
          },
        };
      }),

    applyBulkPriceMultiplier: (target, multiplier) =>
      set((s) => {
        if (!s.project || !isFinite(multiplier) || multiplier <= 0) return s;
        const cur = s.project.catalogOverrides ?? {
          devices: {},
          cables: {},
          rackDevices: {},
        };
        const next: CatalogOverrides = {
          devices: { ...cur.devices },
          cables: { ...cur.cables },
          rackDevices: { ...cur.rackDevices },
        };
        const apply2 = (base: number, existing: number | undefined): number =>
          +((existing ?? base) * multiplier).toFixed(4);
        if (target === "all" || target === "devices") {
          for (const d of deviceCatalog) {
            next.devices[d.id] = {
              ...next.devices[d.id],
              cost: apply2(d.defaultCost, next.devices[d.id]?.cost),
            };
          }
        }
        if (target === "all" || target === "cables") {
          for (const c of cableCatalog) {
            next.cables[c.id] = {
              ...next.cables[c.id],
              costPerFoot: apply2(c.costPerFoot, next.cables[c.id]?.costPerFoot),
            };
          }
        }
        if (target === "all" || target === "rackDevices") {
          for (const d of rackCatalog) {
            next.rackDevices[d.id] = {
              ...next.rackDevices[d.id],
              cost: apply2(d.defaultCost, next.rackDevices[d.id]?.cost),
            };
          }
        }
        return {
          project: {
            ...s.project,
            catalogOverrides: next,
            updatedAt: Date.now(),
          },
        };
      }),

    resetCatalogOverrides: () =>
      set((s) =>
        s.project
          ? {
              project: {
                ...s.project,
                catalogOverrides: undefined,
                updatedAt: Date.now(),
              },
            }
          : s,
      ),

    addSheet: (sheet) =>
      set((s) => {
        if (!s.project) return s;
        const sheets = [...s.project.sheets, sheet];
        return {
          project: { ...s.project, sheets, updatedAt: Date.now() },
          activeSheetId: s.activeSheetId ?? sheet.id,
        };
      }),

    removeSheet: (id) =>
      set((s) => {
        if (!s.project) return s;
        const sheets = s.project.sheets.filter((sh) => sh.id !== id);
        const newActive =
          s.activeSheetId === id ? (sheets[0]?.id ?? null) : s.activeSheetId;
        return {
          project: { ...s.project, sheets, updatedAt: Date.now() },
          activeSheetId: newActive,
        };
      }),

    setActiveSheet: (id) => set({ activeSheetId: id, selectedMarkupIds: [] }),

    updateSheet: (id, patch) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) =>
              sh.id === id ? { ...sh, ...patch } : sh,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    addMaskRegion: (sheetId, m) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) =>
              sh.id === sheetId
                ? { ...sh, maskRegions: [...(sh.maskRegions ?? []), m] }
                : sh,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    updateMaskRegion: (sheetId, maskId, patch) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) =>
              sh.id === sheetId
                ? {
                    ...sh,
                    maskRegions: (sh.maskRegions ?? []).map((m) =>
                      m.id === maskId ? { ...m, ...patch } : m,
                    ),
                  }
                : sh,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    removeMaskRegion: (sheetId, maskId) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) =>
              sh.id === sheetId
                ? {
                    ...sh,
                    maskRegions: (sh.maskRegions ?? []).filter(
                      (m) => m.id !== maskId,
                    ),
                  }
                : sh,
            ),
            updatedAt: Date.now(),
          },
          selectedMarkupIds: s.selectedMarkupIds.filter((sid) => sid !== maskId),
        };
      }),

    setSheetBgColor: (sheetId, color) =>
      set((s) => {
        if (!s.project) return s;
        // Already-correct values are a no-op so background sampling on
        // every render doesn't churn the store.
        const sheet = s.project.sheets.find((sh) => sh.id === sheetId);
        if (!sheet || sheet.bgColor === color) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) =>
              sh.id === sheetId ? { ...sh, bgColor: color } : sh,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    setBrandTheme: (theme) =>
      set((s) =>
        s.project
          ? {
              project: {
                ...s.project,
                brandTheme: theme,
                updatedAt: Date.now(),
              },
            }
          : s,
      ),

    setBranding: (patch) =>
      set((s) => {
        if (!s.project) return s;
        // Strip empty-string fields so they fall through to the default
        // (e.g. clearing the tagline input drops back to "SECURITY
        // SYSTEMS" rather than printing nothing).
        const cleaned: Partial<BrandingConfig> = { ...patch };
        for (const k of Object.keys(cleaned) as Array<keyof BrandingConfig>) {
          const v = cleaned[k];
          if (v === "" || v === undefined) delete (cleaned as any)[k];
        }
        const merged = { ...s.project.branding, ...cleaned };
        // Persist the new branding so future projects (and sessions)
        // start with the user's identity instead of bundled defaults.
        saveStickyBranding(merged);
        return {
          project: {
            ...s.project,
            branding: merged,
            updatedAt: Date.now(),
          },
        };
      }),

    resetBranding: () => {
      // Wipe both the in-project override AND the cross-session sticky
      // copy so the user is fully back to defaults — anything else would
      // be confusing ("I clicked reset, why does my logo come back when
      // I open a new project?").
      saveStickyBranding(undefined);
      return set((s) =>
        s.project
          ? {
              project: {
                ...s.project,
                branding: undefined,
                updatedAt: Date.now(),
              },
            }
          : s,
      );
    },

    setExportKindVisible: (kind, visible) =>
      set((s) => {
        if (!s.project) return s;
        const cur = s.project.exportVisibility ?? {};
        const next: ExportVisibility = { ...cur };
        if (visible) {
          // True is the default — store nothing so we don't churn the
          // project with no-ops.
          delete next[kind];
        } else {
          next[kind] = false;
        }
        return {
          project: {
            ...s.project,
            exportVisibility:
              Object.keys(next).length === 0 ? undefined : next,
            updatedAt: Date.now(),
          },
        };
      }),

    setCoverPageSettings: (patch) =>
      set((s) => {
        if (!s.project) return s;
        const cur = s.project.coverPage ?? {};
        // Strip undefined keys so they fall back to defaults — keeps
        // the persisted record minimal.
        const next: CoverPageSettings = { ...cur, ...patch };
        for (const k of Object.keys(next) as Array<keyof CoverPageSettings>) {
          if (next[k] === undefined) delete (next as any)[k];
        }
        return {
          project: {
            ...s.project,
            coverPage: Object.keys(next).length === 0 ? undefined : next,
            updatedAt: Date.now(),
          },
        };
      }),

    setTitleBlockBounds: (sheetId, bounds) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) =>
              sh.id === sheetId ? { ...sh, titleBlockBounds: bounds } : sh,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    setLegendBounds: (sheetId, bounds) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) =>
              sh.id === sheetId ? { ...sh, legendBounds: bounds } : sh,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    setSelectedBrand: (sel) =>
      set((s) => ({
        selectedBrand: sel,
        // Selecting a brand element clears any markup/mask selection so
        // the action bars don't fight each other.
        selectedMarkupIds: sel ? [] : s.selectedMarkupIds,
      })),

    setView: (v) => set({ view: v }),

    addRack: (rack) => {
      const id = uid();
      set((s) => {
        if (!s.project) return s;
        const racks = s.project.racks ?? [];
        const nextNumber = racks.length + 1;
        const newRack: Rack = {
          id,
          name: rack?.name ?? `Rack ${nextNumber}`,
          uHeight: rack?.uHeight ?? 42,
          location: rack?.location,
          associatedSheetId: rack?.associatedSheetId,
          placements: rack?.placements ?? [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return {
          project: { ...s.project, racks: [...racks, newRack], updatedAt: Date.now() },
          activeRackId: id,
          view: "racks",
        };
      });
      return id;
    },

    removeRack: (id) =>
      set((s) => {
        if (!s.project) return s;
        const racks = (s.project.racks ?? []).filter((r) => r.id !== id);
        const newActive =
          s.activeRackId === id ? (racks[0]?.id ?? null) : s.activeRackId;
        return {
          project: { ...s.project, racks, updatedAt: Date.now() },
          activeRackId: newActive,
        };
      }),

    setActiveRack: (id) => set({ activeRackId: id }),

    updateRack: (id, patch) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            racks: (s.project.racks ?? []).map((r) =>
              r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    addPlacement: (rackId, p) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            racks: (s.project.racks ?? []).map((r) =>
              r.id === rackId
                ? { ...r, placements: [...r.placements, p], updatedAt: Date.now() }
                : r,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    updatePlacement: (rackId, placementId, patch) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            racks: (s.project.racks ?? []).map((r) =>
              r.id === rackId
                ? {
                    ...r,
                    placements: r.placements.map((p) =>
                      p.id === placementId ? { ...p, ...patch } : p,
                    ),
                    updatedAt: Date.now(),
                  }
                : r,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    removePlacement: (rackId, placementId) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            racks: (s.project.racks ?? []).map((r) =>
              r.id === rackId
                ? {
                    ...r,
                    placements: r.placements.filter((p) => p.id !== placementId),
                    updatedAt: Date.now(),
                  }
                : r,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    setActiveTool: (t) =>
      set((s) => ({
        activeTool: t,
        // Leaving the freehand tool turns the eraser sub-mode off so it
        // doesn't surprise the user the next time they switch back.
        freehandErasing: t === "freehand" ? s.freehandErasing : false,
      })),
    setActiveDevice: (id) =>
      set({ activeDeviceId: id, activeTool: id ? "device" : "select" }),
    setActiveCable: (id) => set({ activeCableId: id }),
    setFreehandColor: (color) => set({ freehandColor: color }),
    setFreehandThickness: (n) =>
      set({ freehandThickness: Math.max(0.5, Math.min(20, n)) }),
    toggleFreehandErasing: () =>
      set((s) => ({ freehandErasing: !s.freehandErasing })),
    toggleBrandPreview: () =>
      set((s) => ({ brandPreviewEnabled: !s.brandPreviewEnabled })),

    openPagePreview: (which) => set({ pagePreview: which }),
    closePagePreview: () => set({ pagePreview: null }),

    addMarkup: (m) =>
      set((s) => {
        if (!s.project || !s.activeSheetId) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) =>
              sh.id === s.activeSheetId
                ? { ...sh, markups: [...sh.markups, m] }
                : sh,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    updateMarkup: (id, patch) =>
      set((s) => {
        if (!s.project || !s.activeSheetId) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) =>
              sh.id === s.activeSheetId
                ? {
                    ...sh,
                    markups: sh.markups.map((m) =>
                      m.id === id ? ({ ...m, ...patch } as Markup) : m,
                    ),
                  }
                : sh,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    deleteMarkup: (id) =>
      set((s) => {
        if (!s.project || !s.activeSheetId) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) =>
              sh.id === s.activeSheetId
                ? { ...sh, markups: sh.markups.filter((m) => m.id !== id) }
                : sh,
            ),
            updatedAt: Date.now(),
          },
          selectedMarkupIds: s.selectedMarkupIds.filter((sid) => sid !== id),
        };
      }),

    deleteSelected: () =>
      set((s) => {
        if (!s.project || !s.activeSheetId) return s;
        const ids = new Set(s.selectedMarkupIds);
        // The selection set is a flat list of IDs that may refer to either
        // markups OR masks on the active sheet — delete from both so the
        // backspace / delete key reliably removes whatever is highlighted.
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) =>
              sh.id === s.activeSheetId
                ? {
                    ...sh,
                    markups: sh.markups.filter((m) => !ids.has(m.id)),
                    maskRegions: (sh.maskRegions ?? []).filter(
                      (m) => !ids.has(m.id),
                    ),
                  }
                : sh,
            ),
            updatedAt: Date.now(),
          },
          selectedMarkupIds: [],
        };
      }),

    setSelected: (ids) =>
      set((s) => ({
        selectedMarkupIds: ids,
        // Picking a markup clears the brand selection so the brand
        // transformer detaches and the user only sees one selection at a
        // time.
        selectedBrand: ids.length > 0 ? null : s.selectedBrand,
      })),

    toggleLayer: (id) =>
      set((s) => ({
        layers: s.layers.map((l) =>
          l.id === id ? { ...l, visible: !l.visible } : l,
        ),
      })),

    setLayerLocked: (id, locked) =>
      set((s) => ({
        layers: s.layers.map((l) => (l.id === id ? { ...l, locked } : l)),
      })),

    setCalibration: (sheetId, c) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) =>
              sh.id === sheetId ? { ...sh, calibration: c } : sh,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    setCursor: (p) => set({ cursor: p }),
    setViewport: (v) => set((s) => ({ viewport: { ...s.viewport, ...v } })),
    toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
    toggleOrtho: () => set((s) => ({ orthoEnabled: !s.orthoEnabled })),
    toggleCoverageVisible: () =>
      set((s) => ({ coverageVisible: !s.coverageVisible })),
    setQualityMode: (m) => set({ qualityMode: m }),
    setIngestProgress: (p) =>
      set((s) => ({ ingestProgress: { ...s.ingestProgress, ...p } })),
    resetIngestProgress: () =>
      set({ ingestProgress: { total: 0, done: 0, failed: 0 } }),

    toggleBidPanel: () => set((s) => ({ bidPanelOpen: !s.bidPanelOpen })),
    togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
    toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
    toggleCommandPalette: () =>
      set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),

    pushToast: (kind, message) =>
      set((s) => ({
        toasts: [...s.toasts, { id: uid(), kind, message }],
      })),
    dismissToast: (id) =>
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

    nextTag: (shortCode) => {
      const s = get();
      if (!s.project || !s.activeSheetId) return `${shortCode}-01`;
      const sheet = s.project.sheets.find((sh) => sh.id === s.activeSheetId);
      if (!sheet) return `${shortCode}-01`;
      const re = new RegExp(`^${shortCode}-(\\d+)$`);
      let max = 0;
      for (const m of sheet.markups) {
        if (m.kind === "device") {
          const match = m.tag?.match(re);
          if (match) max = Math.max(max, parseInt(match[1], 10));
        }
      }
      return `${shortCode}-${String(max + 1).padStart(2, "0")}`;
    },
  })),
);

// ───────── Selectors ─────────

export const selectActiveSheet = (s: State): Sheet | null => {
  if (!s.project || !s.activeSheetId) return null;
  return s.project.sheets.find((sh) => sh.id === s.activeSheetId) ?? null;
};

export const selectActiveRack = (s: State): Rack | null => {
  if (!s.project || !s.activeRackId) return null;
  return s.project.racks?.find((r) => r.id === s.activeRackId) ?? null;
};
