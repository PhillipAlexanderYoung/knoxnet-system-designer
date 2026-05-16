import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import {
  devices as deviceCatalog,
  effectiveDevicePorts,
  type DeviceCategory,
} from "../data/devices";
import { cables as cableCatalog } from "../data/cables";
import { rackDevices as rackCatalog } from "../data/rackDevices";
import { defaultBidDefaults, type BidDefaults } from "../data/defaults";
import {
  loadStickyBranding,
  saveStickyBranding,
  type BrandingConfig,
} from "../lib/branding";
import type { SheetSource } from "../lib/sheetSource";
import { buildStarterTemplates } from "../reports/starterTemplates";
import {
  buildCableRunConnection,
  buildCableRunMarkup,
  endpointFromMarkup,
  isRouteInfrastructureMarkup,
  nearestCableRunEndpoint,
  routeInfrastructureLabel,
  type CableRunEndpointKey,
} from "../lib/cableRuns";
import {
  deviceDisplayName,
  isRackDevice,
  nearestContainerForDevice,
  nestedChildren,
  nestedSlotPoint,
  rackDeviceIdForNestedDevice,
} from "../lib/nesting";
import {
  findDeviceById,
  findDeviceByTag,
  findPort,
  nextAvailableInternalPort,
} from "../lib/connections";
import { DEFAULT_CONDUIT_SIZE, DEFAULT_CONDUIT_TYPE } from "../lib/conduit";
import {
  DEFAULT_FIBER_STRAND_COUNT,
  isFiberCableId,
  normalizeFiberStrandCount,
} from "../lib/fiber";
import {
  assignGeneratedCableLabels,
  projectWithGeneratedCableLabels,
  type CableLabelScheme,
} from "../lib/cableLabels";
import {
  DEFAULT_CANVAS_VIEWPORT,
  loadCanvasViewport,
  normalizeCanvasViewport,
  type CanvasViewport,
} from "../lib/canvasViewport";

// ───────── Types ─────────

export type QualityMode = "speed" | "balanced" | "quality";

export type ViewMode = "sheets" | "racks" | "diagrams";

// ───────── Diagram types ─────────
//
// Phase 4 scaffold: a "Diagram" is a node-link view over the project's
// devices + connections, parallel to the floor-plan sheets and rack
// elevations. Topology is read from `Project.connections` so the same
// graph stays in sync across the sheet editor and the diagram builder;
// the diagram only owns layout/styling.
//
// Auto-routing (Manhattan / orthogonal) is deferred — when we wire
// elkjs in, it'll populate `routedEdges[connId]` with computed polyline
// points; until then, edges render as straight lines between node
// centers.

export interface DiagramNodePosition {
  x: number;
  y: number;
}

export interface DiagramNodeStyle {
  color?: string;
  collapsed?: boolean;
}

export type DiagramKind = "signal-flow" | "block" | "network";

export type DiagramAutoLayout = "manual" | "layered" | "force";

export interface Diagram {
  id: string;
  name: string;
  kind: DiagramKind;
  /** Per-device-tag XY position. New device tags added after the
   *  diagram exists get auto-laid-out on the next open. */
  nodePositions: Record<string, DiagramNodePosition>;
  /** Optional per-node visual overrides. */
  nodeStyles?: Record<string, DiagramNodeStyle>;
  /** When set to "layered" or "force", an autoroute pass populates
   *  `routedEdges` on save. "manual" (default) means edges stay
   *  straight lines anchored to node centers. */
  autoLayout?: DiagramAutoLayout;
  /** Cached routed polylines from the last autoroute run, keyed by
   *  connection id. Stored on the diagram (not the connection itself)
   *  so two diagrams can route the same connection differently. */
  routedEdges?: Record<string, { points: number[] }>;
  createdAt: number;
  updatedAt: number;
}

// ───────── Rack types ─────────

export interface RackPlacement {
  id: string;
  /** Optional source device markup that generated this placement from a nested Rack bubble. */
  sourceMarkupId?: string;
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
  /** Optional source Rack device markup that generated this rack from the plan. */
  sourceMarkupId?: string;
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
  /** Object URL for this drawing's blob (created on ingest, lives for
   *  session). Used by SVG / raster backgrounds via <img src=…> and by
   *  PDFs as a download fallback. */
  objectUrl?: string;
  /**
   * Canonical drawing source — discriminated union covering PDF, DXF,
   * SVG, raster, and (future) IFC. Optional for backwards-compat with
   * v1.x projects loaded from disk before the migrator has run; the
   * editor + persistence layer normalise pre-v2 sheets to a `pdf`
   * source on load.
   */
  source?: SheetSource;
  /**
   * Legacy alias for `source.bytes` when `source.kind === "pdf"`. New
   * code should prefer reading PDF bytes via `getPdfBytes(sheet)` from
   * `lib/sheetSource.ts`; this field is kept populated for compat with
   * existing pdf.js / pdf-lib call sites.
   * @deprecated Use `source` instead — will be removed in a future
   *             version once every consumer is migrated.
   */
  pdfBytes?: Uint8Array;
  /** Intrinsic page dimensions in source units (PDF points, DXF user
   *  units, SVG viewBox units, or raster pixels — the calibration tool
   *  maps to real-world feet downstream). */
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

// ───────── System / Network configuration ─────────
// All fields are optional — fill in what you know during design,
// commission the rest during install. Everything flows through the
// .knoxnet project file so the full system topology is portable.

/** IP-layer network identity shared by every networked device. */
export interface NetworkConfig {
  dhcp?: boolean;
  ipAddress?: string;
  subnetMask?: string;
  gateway?: string;
  dns1?: string;
  dns2?: string;
  hostname?: string;
  macAddress?: string;
  vlan?: number;
  /** HTTP management port (default 80) */
  httpPort?: number;
  /** HTTPS management port (default 443) */
  httpsPort?: number;
}

/** Camera / encoder streaming and recording configuration. */
export interface CameraStreamConfig {
  /** Primary RTSP URI — e.g. rtsp://user:pass@192.168.1.10:554/stream1 */
  primaryRtsp?: string;
  /** Sub-stream / secondary RTSP URI */
  secondaryRtsp?: string;
  username?: string;
  password?: string;
  onvifEnabled?: boolean;
  onvifPort?: number;
  /** e.g. "4K", "1080p", "720p", "D1" */
  resolution?: string;
  /** e.g. "H.265", "H.264", "MJPEG" */
  codec?: string;
  bitrateKbps?: number;
  fps?: number;
  /** Tag of the NVR/DVR device this camera streams to (e.g. "NVR-01") */
  nvrTag?: string;
  nvrChannel?: number;
  /** Channel name on the recorder (e.g. "Lobby East") */
  nvrChannelName?: string;
}

/** PTZ (pan–tilt–zoom) controller parameters. */
export interface PtzConfig {
  enabled?: boolean;
  /**
   * "pelco-d" | "pelco-p" | "visca" → serial RS-485.
   * "onvif" → control over IP (no separate port/address needed).
   */
  protocol?: "pelco-d" | "pelco-p" | "visca" | "onvif" | string;
  /** TCP port for IP-PTZ or serial baud rate for RS-485 */
  port?: number;
  /** RS-485 unit address 1–255 */
  address?: number;
}

/** Wireless AP configuration (network / wireless category). */
export interface WirelessConfig {
  ssid?: string;
  /** Pre-shared key / WPA password */
  password?: string;
  /** Radio band */
  band?: "2.4GHz" | "5GHz" | "6GHz" | "dual-band" | "tri-band" | string;
  /** Wi-Fi security mode */
  security?: "WPA2" | "WPA3" | "WPA2/WPA3" | "Open" | string;
  /** SSID broadcast hidden */
  hiddenSsid?: boolean;
  /** Channel number (0 = auto) */
  channel?: number;
  /** Max associated clients */
  maxClients?: number;
  /** Tag of the controller / cloud managing this AP (e.g. "CTRL-01") */
  controllerTag?: string;
}

/** Managed switch / router configuration (network category). */
export interface SwitchConfig {
  /** Number of ports */
  portCount?: number;
  /** Comma-separated list of active VLANs, e.g. "1, 10, 20, 100" */
  vlans?: string;
  /** Management / native VLAN */
  managementVlan?: number;
  /** Total PoE power budget in watts */
  poeBudgetW?: number;
  /** Uplink port label, e.g. "Port 49 (SFP)" */
  uplinkPort?: string;
  /** Spanning-tree protocol role */
  stpRole?: "root" | "switch" | "disabled" | string;
  /** Controller or cloud tag managing this switch */
  controllerTag?: string;
}

/** Access control device configuration (access category). */
export interface AccessControlConfig {
  /** Reader/controller protocol */
  protocol?: "wiegand-26" | "wiegand-34" | "osdp-v1" | "osdp-v2" | "f2f" | string;
  /** Door / opening this device controls or monitors */
  doorName?: string;
  /** Security zone or partition */
  zone?: string;
  /** Door relay normally-open or normally-closed */
  relayType?: "NO" | "NC" | string;
  /** Strike / lock hold time in milliseconds */
  holdTimeMs?: number;
  /** Tag of the access controller panel this reader reports to */
  controllerTag?: string;
  /** Reader address on OSDP bus (0–126) */
  osdpAddress?: number;
  /** Wiegand bit format if not standard 26 or 34 */
  wiegandFormat?: string;
}

/**
 * Full commissioning / system-design record for a single placed device.
 *
 * Category guidance:
 *   cameras            → network + streams + ptz + physical
 *   network (APs)      → network + wireless + physical
 *   network (switches) → network + switchConfig + physical
 *   access             → network + accessControl + physical
 *   av / broadcast     → network + streams + physical
 *   detection / audio /
 *   lighting / site    → network (if IP-based) + physical
 */
export interface DeviceSystemConfig {
  // ── Network (every IP device) ─────────────────────────────
  network?: NetworkConfig;

  // ── Cameras / encoders / NVRs / AV decoders ───────────────
  streams?: CameraStreamConfig;
  /** PTZ — cameras only */
  ptz?: PtzConfig;

  // ── Wireless APs ──────────────────────────────────────────
  wireless?: WirelessConfig;

  // ── Managed switches, routers, NIDs ───────────────────────
  switchConfig?: SwitchConfig;

  // ── Card readers, door controllers, locks ─────────────────
  accessControl?: AccessControlConfig;

  // ── Physical / install (all devices) ─────────────────────
  mountType?: string;
  switchPort?: string;
  poeClass?: number;
  cableTag?: string;

  // ── Asset tracking (all devices) ─────────────────────────
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  managementUrl?: string;
  assetTag?: string;
  installedBy?: string;
  installedAt?: string;
  warrantyExpiry?: string;
}

/**
 * Structured port description for a device type or per-instance
 * override. Every device with physical interfaces should expose a
 * `ports` array on its `DeviceType` so the properties panel, the
 * report engine, and (future) signal-flow autoroute can reason about
 * connections in terms of real ports instead of free-text strings.
 *
 * Examples:
 *   { id: "eth0", label: "ETH 0 (PoE)", kind: "ethernet", poe: "in", speed: "1G" }
 *   { id: "sfp1", label: "SFP+ 1",      kind: "fiber",    speed: "10G", pluggable: true }
 *   { id: "rs485-a", label: "RS-485 A", kind: "serial" }
 */
export type PortKind =
  | "ethernet"
  | "fiber"
  | "serial"
  | "coax"
  | "audio"
  | "video"
  | "power"
  | "wireless"
  | "other";

export interface PortSpec {
  /** Stable id used in DeviceConnection.fromPortId / toPortId. */
  id: string;
  /** Human label shown in dropdowns and reports (e.g. "ETH 0 (PoE+)"). */
  label: string;
  kind: PortKind;
  /** PoE direction — `in` = port accepts power, `out` = port sources
   *  power, `passthrough` = port loops PoE through (powered injector). */
  poe?: "in" | "out" | "passthrough";
  /** Negotiated speed shorthand (e.g. "100M", "1G", "2.5G", "10G"). */
  speed?: string;
  /** True for pluggable transceivers / removable modules (SFP, QSFP). */
  pluggable?: boolean;
  /** Free-form notes — surfaced in the panel tooltip. */
  notes?: string;
}

/**
 * A directed logical connection between two device instances placed
 * on any sheet in the project.
 *
 * Devices are identified by their canvas `tag` (e.g. "CAM-01", "SW-01")
 * so connections survive device moves between sheets.
 *
 * v2.0: structured port ids land alongside the existing free-text
 * labels. When `fromPortId` / `toPortId` is present, the report engine
 * + autoroute can resolve the actual port; the string labels stay so
 * legacy projects render identically and devices without a `ports`
 * spec still allow ad-hoc text.
 *
 * Examples:
 *   CAM-01 ETH0   → SW-01 Port 4    (camera to switch port)
 *   AP-03  LAN    → POE-01 OUT      (AP to PoE injector)
 *   POE-01 IN     → SW-02 Port 18   (PoE injector uplink)
 *   CAM-07 RS-485 → PTZ-01 RS-485   (serial PTZ bus)
 */
export interface DeviceConnection {
  id: string;
  /** Tag of the source device, e.g. "CAM-01" */
  fromTag: string;
  /** Structured port id on the source (resolves against the device's
   *  `ports` spec). Falls back to `fromPort` string when undefined. */
  fromPortId?: string;
  /** Interface / port label on the source, e.g. "ETH0", "LAN", "RS-485" */
  fromPort?: string;
  /** Tag of the destination device, e.g. "SW-01" */
  toTag: string;
  /** Structured port id on the destination. */
  toPortId?: string;
  /** Interface / port label on the destination, e.g. "Port 12", "GE 1/0/1" */
  toPort?: string;
  /**
   * Physical transmission medium.
   * Use standard shorthand: "cat6", "cat6a", "fiber-sm", "fiber-mm",
   * "coax", "rs485", "rs232", "wireless", or any custom string.
   */
  medium?: string;
  /** ID of the CableMarkup on canvas representing this physical run */
  cableMarkupId?: string;
  /** Optional internal termination when a physical run lands on a container. */
  internalEndpoint?: InternalConnectionEndpoint;
  label?: string;
  notes?: string;
}

export interface InternalConnectionEndpoint {
  containerId: string;
  containerTag: string;
  deviceId: string;
  deviceTag: string;
  portId?: string;
  port?: string;
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
  /** Full network / commissioning record for this device instance */
  systemConfig?: DeviceSystemConfig;
  /**
   * Per-instance port overrides. When set, these REPLACE the device
   * type's bundled `ports` spec — handy for one-off devices that have
   * SFP modules inserted, custom port labels, or unusual configurations
   * the bundled spec can't anticipate. Most devices won't need this.
   */
  instancePorts?: PortSpec[];
  /**
   * Tag pill offset from the device center, in PDF user units. When
   * undefined, the editor + export default to the top-right of the
   * device disc. Set by dragging the pill on the canvas or via the
   * properties panel — survives sheet reshuffling so a carefully
   * placed tag never snaps back.
   */
  tagOffsetX?: number;
  tagOffsetY?: number;
  /**
   * Tag font size override in PDF user units. When undefined, the
   * editor scales font with icon size and the export clamps to a
   * readable range. Set to take exact control of label size
   * regardless of icon size.
   */
  tagFontSize?: number;
  /** Logical container this device is nested inside (rack, enclosure, Head End, etc.). */
  parentId?: string;
  /** Show a compact on-canvas schedule of devices nested in this container. */
  showNestedDevices?: boolean;
  /** Optional title for the nested/area schedule shown on this container. */
  nestedScheduleName?: string;
  /** Optional snap/association to a cable or conduit run endpoint. */
  attachedRunEndpoint?: {
    cableMarkupId: string;
    endpoint: CableRunEndpointKey;
  };
}

export interface CableMarkup extends BaseMarkup {
  kind: "cable";
  cableId: string;
  /** Conduit metadata for conduit cable runs. Defaults to EMT 1" when unset. */
  conduitType?: string;
  conduitSize?: string;
  /** Fiber strand count for fiber cable runs. Defaults to the catalog family. */
  fiberStrandCount?: number;
  /** Number of parallel physical runs represented by this drawn route. */
  runCount?: number;
  /** Real-world label/name printed on the cable, fiber, or conduit jacket/tag. */
  physicalLabel?: string;
  /** flat array [x1,y1,x2,y2,...] in PDF user units */
  points: number[];
  /** Optional per-point device anchors, aligned to `points` pairs. */
  pointAttachments?: Array<CableRunPointAttachment | null>;
  slackPercent?: number; // overrides project default
  /** Fixed service-loop allowance added before percent slack, in feet. */
  serviceLoopFt?: number;
  /** Visual treatment for camera drops from route infrastructure. */
  routeStyle?: "archedDrop";
  /** Optional terminations / endpoint labels, surfaced in the on-canvas
   *  pill and the export so a glance at the run tells the install crew
   *  what plugs into what. */
  connector?: string; // e.g. "RJ45", "LC-LC", "F-Type", "BNC"
  endpointA?: string; // e.g. "MDF Patch 12"
  endpointB?: string; // e.g. "AP-04"
  /** Compact metadata for branch targets served by this route. */
  servedDevices?: string[];
  /** Run label offset from the path midpoint, in PDF user units. When unset,
   *  the canvas/export use an automatic lane so conduit and carried fiber
   *  labels do not sit on top of each other. */
  labelOffsetX?: number;
  labelOffsetY?: number;
  /** Per-run label visibility override. */
  showLabel?: boolean;
}

export interface CableRunPointAttachment {
  deviceMarkupId?: string;
  deviceTag?: string;
  label?: string;
  deviceId?: string;
  category?: string;
  routeWaypoint?: boolean;
}

export interface CableRunEndpoint {
  x: number;
  y: number;
  /** Human-readable endpoint label shown on the cable run. */
  label?: string;
  /** Stable markup id when the point came from placed equipment. */
  deviceMarkupId?: string;
  /** Device tag when the endpoint came from placed equipment. */
  deviceTag?: string;
  /** Device catalog id/category when the endpoint came from placed equipment. */
  deviceId?: string;
  category?: string;
  /** Route infrastructure devices behave as pass-through path nodes. */
  routeWaypoint?: boolean;
}

export interface CableRunDraft {
  /** Ordered route points. First/last may carry device endpoint metadata. */
  points: CableRunEndpoint[];
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

export type BidLineLaborOverrides = Record<string, { laborHours: number }>;

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

// ───────── Custom report templates ─────────
//
// A report template is a saved "view" over the project — pick a scope
// (devices / cables / connections / racks / sheets / ports), filter to
// the subset you care about, choose columns + grouping + sort, and
// pick one or more output formats. The same template can be re-run any
// time the design changes; the engine is pure so results never go stale.

export type ReportScope =
  | "devices"
  | "cables"
  | "connections"
  | "areaSchedules"
  | "racks"
  | "rackPlacements"
  | "sheets"
  | "ports";

export type ReportFilterOp =
  | "eq"
  | "neq"
  | "in"
  | "contains"
  | "startsWith"
  | "gte"
  | "lte"
  | "exists"
  | "missing"
  | "regex";

export interface ReportFilter {
  /** Dotted field path, e.g. `"systemConfig.network.ipAddress"`. */
  field: string;
  op: ReportFilterOp;
  value?: unknown;
}

export type ReportColumnFormat =
  | "text"
  | "number"
  | "date"
  | "ip"
  | "mac"
  | "link"
  | "bool";

export interface ReportColumn {
  /** Dotted field path — same syntax as filters. */
  field: string;
  /** Display header (defaults to the field catalog label). */
  header?: string;
  /** Optional width hint in pixels — passed through to XLSX/PDF
   *  exporters, ignored by JSON/CSV. */
  width?: number;
  /** Render hint — controls how the cell is formatted in non-tabular
   *  exports (PDF/HTML/Markdown). */
  format?: ReportColumnFormat;
}

export type ReportFormat = "pdf" | "xlsx" | "csv" | "json" | "md" | "html";

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  scope: ReportScope;
  filters: ReportFilter[];
  columns: ReportColumn[];
  /** Dotted-path group fields (multi-level grouping). Empty / undefined
   *  means a single ungrouped row set. */
  groupBy?: string[];
  /** Stable sort key list. */
  sortBy?: Array<{ field: string; dir: "asc" | "desc" }>;
  /** Output formats to generate when the user clicks "Generate". */
  formats: ReportFormat[];
  /** Branding overrides for non-tabular outputs (PDF, HTML). */
  branding?: {
    useProjectBranding?: boolean;
    title?: string;
    footer?: string;
  };
}

export interface Project {
  id: string;
  meta: ProjectMeta;
  sheets: Sheet[];
  racks: Rack[];
  bidDefaults: BidDefaults;
  /** Top-to-bottom editor/export layer stack. */
  layers?: Layer[];
  catalogOverrides?: CatalogOverrides;
  /**
   * Per-project estimate labor overrides keyed by deterministic bid line IDs
   * (for example `device:cam-dome` or `cable:cat6`). These affect the current
   * bid only and never mutate catalog/unit labor defaults.
   */
  bidLaborOverrides?: BidLineLaborOverrides;
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
  /**
   * Logical connections between device instances across all sheets.
   * Models camera→switch, AP→PoE injector, controller→reader, etc.
   * Keyed by device tag so connections survive sheet reassignment.
   */
  connections?: DeviceConnection[];
  /**
   * Saved custom report templates. Driven by the Reports tab in the
   * left rail; each template carries its own scope + filter + column
   * choices and one or more output formats.
   */
  reports?: ReportTemplate[];
  /**
   * Saved signal-flow / block / network diagrams. Topology is read
   * from `connections`; this array only owns layout + per-diagram
   * styling. Phase 4 ships with manual layout; future phases wire in
   * elkjs for auto-routing.
   */
  diagrams?: Diagram[];
  /**
   * Project-wide defaults for the device tag pill. Per-device
   * `tagFontSize` and `tagOffsetX/Y` overrides on `DeviceMarkup`
   * always win; this is the fallback that drives both the editor
   * canvas and the markup PDF export when the user hasn't pinned a
   * value on the device.
   */
  tagDefaults?: {
    /** Default font size in PDF units. When undefined the editor
     *  scales font with icon size: `max(10, size * 0.35)`. */
    fontSize?: number;
    /** Device/run tag chip fill. Defaults to Knox midnight. */
    fillColor?: string;
    /** Device/run tag text color. Defaults to white, or auto-contrast for custom fills. */
    textColor?: string;
    /** Use the project's brand accent as the tag chip fill. */
    brandTags?: boolean;
  };
  /** Global view/export toggle for compact cable/conduit run labels. */
  runLabelsVisible?: boolean;
  /** Optional physical-label numbering scheme for generated cable labels.
   *  Missing values fall back to C-001, F-001, and CN-001 sequences. */
  cableLabelScheme?: CableLabelScheme;
  createdAt: number;
  updatedAt: number;
}

// ───────── Default layers ─────────

export const DEFAULT_LAYERS: Layer[] = [
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

export function normalizeLayers(layers: Layer[] | undefined): Layer[] {
  if (!layers) return DEFAULT_LAYERS.map((layer) => ({ ...layer }));

  const defaultsById = new Map(DEFAULT_LAYERS.map((layer) => [layer.id, layer]));
  const seen = new Set<string>();
  const normalized: Layer[] = [];

  for (const layer of layers) {
    const fallback = defaultsById.get(layer.id);
    normalized.push({ ...(fallback ?? layer), ...layer });
    seen.add(layer.id);
  }

  for (const fallback of DEFAULT_LAYERS) {
    if (!seen.has(fallback.id)) normalized.push({ ...fallback });
  }

  return normalized;
}

// ───────── Store shape ─────────

interface HistoryState {
  past: Project[];
  future: Project[];
  transactionDepth: number;
  transactionBase: Project | null;
}

interface CableRunBulkBranchState {
  route: CableRunEndpoint[] | null;
  targetEndpoints: CableRunEndpoint[];
  sourceCableMarkupId?: string;
  baseProject: Project;
  previewCableMarkupIds: string[];
}

export interface LockMoveHintState {
  message: string;
  shownAt: number;
  pulseKey: number;
}

interface State {
  project: Project | null;
  history: HistoryState;
  view: ViewMode;
  activeSheetId: string | null;
  activeRackId: string | null;
  activeDiagramId: string | null;
  activeTool: ToolId;
  activeDeviceId: string | null;
  activeCableId: string | null;
  activeConduitType: string;
  activeConduitSize: string;
  activeFiberStrandCount: number;
  selectedMarkupIds: string[];
  /** Which branding element (if any) is currently selected for drag/resize
   *  on the canvas. Mutually exclusive with `selectedMarkupIds` — selecting
   *  a markup clears this and vice versa. */
  selectedBrand: BrandSelection;
  layers: Layer[];
  /** ephemeral cursor position in sheet (pdf-user) units, for status bar */
  cursor: { x: number; y: number } | null;
  /** zoom level (multiplied by renderScale to derive bg DPR) */
  viewport: CanvasViewport;
  /** Per-sheet editor view state, intentionally kept out of Project export data. */
  sheetViewports: Record<string, CanvasViewport>;
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
  /** In-progress routed Cable Run draft. */
  cableRunDraft: CableRunDraft | null;
  /** Shift-held multi-device cable drop preview. */
  cableRunBulkBranch: CableRunBulkBranchState | null;
  /** Global editor/export toggle for cable/conduit run labels. */
  runLabelsVisible: boolean;
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
  /** Transient nudge shown when a locked device blocks movement. */
  lockMoveHint: LockMoveHintState | null;

  // actions
  newProject: (meta?: Partial<ProjectMeta>) => void;
  loadProject: (p: Project) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  beginHistoryTransaction: () => void;
  endHistoryTransaction: () => void;
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
  setBidLineLaborOverride: (lineId: string, laborHours: number | null) => void;
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
  setActiveConduitType: (value: string) => void;
  setActiveConduitSize: (value: string) => void;
  setActiveFiberStrandCount: (value: number) => void;
  setFreehandColor: (color: string) => void;
  setFreehandThickness: (n: number) => void;
  toggleFreehandErasing: () => void;
  setCableRunDraft: (draft: CableRunDraft | null) => void;
  clearCableRunDraft: () => void;
  placeCableRunEndpoint: (endpoint: CableRunEndpoint) => "started" | "routed" | "completed" | null;
  branchCableRunEndpoint: (endpoint: CableRunEndpoint) => "completed" | null;
  branchCableRunToEndpoints: (endpoints: CableRunEndpoint[]) => number;
  beginCableRunBulkBranch: (
    route?: CableRunEndpoint[] | null,
    sourceCableMarkupId?: string,
  ) => void;
  toggleCableRunBulkBranchTarget: (endpoint: CableRunEndpoint) => number;
  commitCableRunBulkBranch: () => number;
  cancelCableRunBulkBranch: () => void;
  appendCableRunPath: (points: number[]) => "started" | "routed" | null;
  finishCableRunDraft: () => "completed" | null;
  toggleRunLabelsVisible: () => void;
  toggleBrandPreview: () => void;
  openPagePreview: (which: "cover" | "bom") => void;
  closePagePreview: () => void;

  addMarkup: (m: Markup) => void;
  updateMarkup: (id: string, patch: Partial<Markup>) => void;
  moveDeviceMarkup: (id: string, x: number, y: number) => void;
  setAllDeviceMarkupsLocked: (locked: boolean) => number;
  attachRouteInfrastructureToRun: (
    deviceId: string,
    cableMarkupId: string,
    endpoint: CableRunEndpointKey,
  ) => void;
  disconnectRouteInfrastructure: (deviceId: string) => void;
  deleteMarkup: (id: string) => void;
  deleteSelected: () => void;
  setSelected: (ids: string[]) => void;

  toggleLayer: (id: LayerId) => void;
  setLayerLocked: (id: LayerId, locked: boolean) => void;
  moveLayer: (id: LayerId, dir: "up" | "down") => void;

  /** Update (or clear) the full system/commissioning config for a device markup */
  setDeviceSystemConfig: (markupId: string, config: DeviceSystemConfig | undefined) => void;

  /** Project-level device connections */
  addConnection: (conn: DeviceConnection) => void;
  updateConnection: (id: string, patch: Partial<DeviceConnection>) => void;
  removeConnection: (id: string) => void;
  autoAssignContainerInternalConnections: (containerId: string) => number;

  /** Custom report templates */
  addReport: (template: ReportTemplate) => void;
  updateReport: (id: string, patch: Partial<ReportTemplate>) => void;
  removeReport: (id: string) => void;
  duplicateReport: (id: string) => string | null;

  /** Signal-flow / block diagrams */
  addDiagram: (diagram?: Partial<Diagram>) => string;
  updateDiagram: (id: string, patch: Partial<Diagram>) => void;
  removeDiagram: (id: string) => void;
  setActiveDiagram: (id: string | null) => void;
  setDiagramNodePosition: (
    diagramId: string,
    tag: string,
    pos: DiagramNodePosition,
  ) => void;

  /** Project-level tag defaults + bulk tag operations. The bulk ops
   *  scope to a single sheet by id, or every sheet when sheetId is
   *  undefined. */
  setTagDefaults: (patch: Partial<NonNullable<Project["tagDefaults"]>>) => void;
  resetAllTagPositions: (sheetId?: string) => number;
  applyTagFontSizeToAll: (fontSize: number, sheetId?: string) => number;

  setCalibration: (sheetId: string, c: Calibration | undefined) => void;
  setCursor: (p: { x: number; y: number } | null) => void;
  setViewport: (v: Partial<CanvasViewport>) => void;
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
  notifyLockedDeviceMoveAttempt: () => void;
  clearLockMoveHint: (pulseKey?: number) => void;

  /** Auto-numbering helper: returns next free tag for a shortCode on active sheet */
  nextTag: (shortCode: string) => string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const emptyHistory = (): HistoryState => ({
  past: [],
  future: [],
  transactionDepth: 0,
  transactionBase: null,
});

function normalizeProject(p: Project): Project {
  return projectWithGeneratedCableLabels({
    ...p,
    meta: {
      projectName: p.meta?.projectName ?? "Untitled Project",
      projectNumber: p.meta?.projectNumber ?? "",
      client: p.meta?.client ?? "",
      location: p.meta?.location ?? "",
      drawnBy: p.meta?.drawnBy ?? "",
      date: p.meta?.date ?? new Date().toISOString(),
      revision: p.meta?.revision ?? "0",
      summary: p.meta?.summary,
    },
    sheets: (p.sheets ?? []).map(normalizeSheet),
    racks: p.racks ?? [],
    bidDefaults: { ...defaultBidDefaults, ...(p.bidDefaults ?? {}) },
    reports: p.reports && p.reports.length > 0 ? p.reports : buildStarterTemplates(),
    diagrams: p.diagrams ?? [],
    connections: p.connections && p.connections.length > 0 ? p.connections : undefined,
    layers: normalizeLayers(p.layers),
    bidExportVisibility: p.bidExportVisibility ?? defaultBidExportVisibility,
    bidLaborOverrides: normalizeBidLineLaborOverrides(p.bidLaborOverrides),
    runLabelsVisible: p.runLabelsVisible === true,
  });
}

function normalizeBidLineLaborOverrides(
  overrides: BidLineLaborOverrides | undefined,
): BidLineLaborOverrides | undefined {
  if (!overrides) return undefined;
  const next: BidLineLaborOverrides = {};
  for (const [lineId, value] of Object.entries(overrides)) {
    const laborHours = Number(value?.laborHours);
    if (lineId && Number.isFinite(laborHours) && laborHours >= 0) {
      next[lineId] = { laborHours };
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function normalizeSheet(sheet: Sheet): Sheet {
  const pageWidth = Number(sheet.pageWidth);
  const pageHeight = Number(sheet.pageHeight);
  const renderScale = Number(sheet.renderScale);
  return {
    ...sheet,
    id: sheet.id || uid(),
    name: sheet.name || sheet.fileName || "Sheet",
    fileName: sheet.fileName || sheet.name || "sheet",
    pageWidth: Number.isFinite(pageWidth) && pageWidth > 0 ? pageWidth : 1000,
    pageHeight: Number.isFinite(pageHeight) && pageHeight > 0 ? pageHeight : 1000,
    renderScale: Number.isFinite(renderScale) && renderScale > 0 ? renderScale : 1,
    markups: Array.isArray(sheet.markups) ? sheet.markups : [],
    maskRegions: Array.isArray(sheet.maskRegions) ? sheet.maskRegions : undefined,
  };
}

function historyAfterProjectChange(
  history: HistoryState,
  previousProject: Project | null,
): HistoryState {
  if (!previousProject) return history;
  if (history.transactionDepth > 0) {
    return {
      ...history,
      transactionBase: history.transactionBase ?? previousProject,
    };
  }
  return {
    ...history,
    past: [...history.past, previousProject],
    future: [],
    transactionBase: null,
  };
}

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
    reports: buildStarterTemplates(),
    layers: normalizeLayers(undefined),
    bidExportVisibility: defaultBidExportVisibility,
    runLabelsVisible: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
};

export const useProjectStore = create<State>()(
  subscribeWithSelector((set, get) => ({
    project: null,
    history: emptyHistory(),
    view: "sheets",
    activeSheetId: null,
    activeRackId: null,
    activeDiagramId: null,
    activeTool: "select",
    activeDeviceId: null,
    activeCableId: "cat6",
    activeConduitType: DEFAULT_CONDUIT_TYPE,
    activeConduitSize: DEFAULT_CONDUIT_SIZE,
    activeFiberStrandCount: DEFAULT_FIBER_STRAND_COUNT,
    selectedMarkupIds: [],
    selectedBrand: null,
    layers: DEFAULT_LAYERS.map((l) => ({ ...l })),
    cursor: null,
    viewport: DEFAULT_CANVAS_VIEWPORT,
    sheetViewports: {},
    snapEnabled: true,
    orthoEnabled: false,
    coverageVisible: true,
    brandPreviewEnabled: true,
    pagePreview: null,
    freehandColor: "#F4B740",
    freehandThickness: 2,
    freehandErasing: false,
    cableRunDraft: null,
    cableRunBulkBranch: null,
    runLabelsVisible: false,
    qualityMode: "balanced",
    ingestProgress: { total: 0, done: 0, failed: 0 },
    bidPanelOpen: false,
    paletteOpen: true,
    settingsOpen: false,
    commandPaletteOpen: false,
    toasts: [],
    lockMoveHint: null,

    newProject: (meta) =>
      set(() => {
        const project = normalizeProject(blankProject(meta));
        return {
        project,
        activeSheetId: null,
        activeRackId: null,
        activeDiagramId: null,
        viewport: DEFAULT_CANVAS_VIEWPORT,
        sheetViewports: {},
        layers: normalizeLayers(project.layers),
        runLabelsVisible: project.runLabelsVisible === true,
        selectedMarkupIds: [],
        cableRunDraft: null,
        cableRunBulkBranch: null,
        lockMoveHint: null,
        history: emptyHistory(),
      };
      }),

    loadProject: (p) =>
      set(() => {
        // Backfill arrays and non-persisted UI state for projects saved
        // before each feature landed, so old records keep opening cleanly.
        const project = normalizeProject(p);
        const activeSheetId = project.sheets[0]?.id ?? null;
        const restoredViewport = activeSheetId
          ? loadCanvasViewport(project.id, activeSheetId)
          : null;
        return {
        project,
        activeSheetId,
        activeRackId: (project.racks?.[0]?.id) ?? null,
        activeDiagramId: project.diagrams?.[0]?.id ?? null,
        viewport: restoredViewport ?? DEFAULT_CANVAS_VIEWPORT,
        sheetViewports: restoredViewport && activeSheetId ? { [activeSheetId]: restoredViewport } : {},
        layers: normalizeLayers(project.layers),
        runLabelsVisible: project.runLabelsVisible === true,
        selectedMarkupIds: [],
        cableRunDraft: null,
        cableRunBulkBranch: null,
        lockMoveHint: null,
        history: emptyHistory(),
      };
      }),

    undo: () =>
      set((s) => {
        const previous = s.history.past.at(-1);
        if (!previous || !s.project) return s;
        return {
          project: previous,
          runLabelsVisible: previous.runLabelsVisible === true,
          history: {
            ...s.history,
            past: s.history.past.slice(0, -1),
            future: [s.project, ...s.history.future],
            transactionBase: null,
            transactionDepth: 0,
          },
          cableRunDraft: null,
          cableRunBulkBranch: null,
          lockMoveHint: null,
          selectedMarkupIds: [],
        };
      }),

    redo: () =>
      set((s) => {
        const next = s.history.future[0];
        if (!next || !s.project) return s;
        return {
          project: next,
          runLabelsVisible: next.runLabelsVisible === true,
          history: {
            ...s.history,
            past: [...s.history.past, s.project],
            future: s.history.future.slice(1),
            transactionBase: null,
            transactionDepth: 0,
          },
          cableRunDraft: null,
          cableRunBulkBranch: null,
          lockMoveHint: null,
          selectedMarkupIds: [],
        };
      }),

    clearHistory: () => set({ history: emptyHistory() }),

    beginHistoryTransaction: () =>
      set((s) => ({
        history: {
          ...s.history,
          transactionDepth: s.history.transactionDepth + 1,
          transactionBase: s.history.transactionBase ?? s.project,
        },
      })),

    endHistoryTransaction: () =>
      set((s) => {
        const depth = Math.max(0, s.history.transactionDepth - 1);
        if (depth > 0) {
          return { history: { ...s.history, transactionDepth: depth } };
        }
        const base = s.history.transactionBase;
        if (!base || base === s.project) {
          return {
            history: { ...s.history, transactionDepth: 0, transactionBase: null },
          };
        }
        return {
          history: {
            ...s.history,
            past: [...s.history.past, base],
            future: [],
            transactionDepth: 0,
            transactionBase: null,
          },
        };
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

    setBidLineLaborOverride: (lineId, laborHours) =>
      set((s) => {
        if (!s.project) return s;
        const overrides = { ...(s.project.bidLaborOverrides ?? {}) };
        if (laborHours === null) {
          delete overrides[lineId];
        } else if (Number.isFinite(laborHours) && laborHours >= 0) {
          overrides[lineId] = { laborHours };
        }
        return {
          project: {
            ...s.project,
            bidLaborOverrides:
              Object.keys(overrides).length > 0 ? overrides : undefined,
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
        const project = { ...s.project, sheets, updatedAt: Date.now() };
        return {
          project,
          history: historyAfterProjectChange(s.history, s.project),
          activeSheetId: s.activeSheetId ?? sheet.id,
        };
      }),

    removeSheet: (id) =>
      set((s) => {
        if (!s.project) return s;
        const sheets = s.project.sheets.filter((sh) => sh.id !== id);
        const newActive =
          s.activeSheetId === id ? (sheets[0]?.id ?? null) : s.activeSheetId;
        const restoredViewport =
          newActive && s.project
            ? (s.sheetViewports[newActive] ?? loadCanvasViewport(s.project.id, newActive))
            : null;
        return {
          project: { ...s.project, sheets, updatedAt: Date.now() },
          activeSheetId: newActive,
          viewport: restoredViewport ?? DEFAULT_CANVAS_VIEWPORT,
          sheetViewports:
            restoredViewport && newActive
              ? { ...s.sheetViewports, [newActive]: restoredViewport }
              : s.sheetViewports,
        };
      }),

    setActiveSheet: (id) =>
      set((s) => {
        const restoredViewport =
          id && s.project
            ? (s.sheetViewports[id] ?? loadCanvasViewport(s.project.id, id))
            : null;
        return {
          activeSheetId: id,
          selectedMarkupIds: [],
          cableRunDraft: null,
          viewport: restoredViewport ?? DEFAULT_CANVAS_VIEWPORT,
          sheetViewports:
            restoredViewport && id
              ? { ...s.sheetViewports, [id]: restoredViewport }
              : s.sheetViewports,
        };
      }),

    updateSheet: (id, patch) =>
      set((s) => {
        if (!s.project) return s;
        return {
          history: historyAfterProjectChange(s.history, s.project),
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
        cableRunDraft: t === "cable" ? s.cableRunDraft : null,
      })),
    setActiveDevice: (id) =>
      set({
        activeDeviceId: id,
        activeTool: id ? "device" : "select",
        cableRunDraft: null,
      }),
    setActiveCable: (id) => set({ activeCableId: id }),
    setActiveConduitType: (value) =>
      set({ activeConduitType: value.trim() || DEFAULT_CONDUIT_TYPE }),
    setActiveConduitSize: (value) =>
      set({ activeConduitSize: value.trim() || DEFAULT_CONDUIT_SIZE }),
    setActiveFiberStrandCount: (value) =>
      set({ activeFiberStrandCount: normalizeFiberStrandCount(value) }),
    setFreehandColor: (color) => set({ freehandColor: color }),
    setFreehandThickness: (n) =>
      set({ freehandThickness: Math.max(0.5, Math.min(20, n)) }),
    toggleFreehandErasing: () =>
      set((s) => ({ freehandErasing: !s.freehandErasing })),
    setCableRunDraft: (draft) => set({ cableRunDraft: draft }),
    clearCableRunDraft: () => set({ cableRunDraft: null }),
    placeCableRunEndpoint: (endpoint) => {
      const s = get();
      if (!s.activeCableId || !s.project || !s.activeSheetId) return null;
      const route = s.cableRunDraft?.points ?? [];
      if (route.length === 0) {
        set({
          cableRunDraft: { points: [endpoint] },
          selectedMarkupIds: [],
          selectedBrand: null,
        });
        get().pushToast(
          "info",
          `${endpoint.label ?? "Cable origin"} set — click route turns or a device`,
        );
        return "started";
      }

      const last = route[route.length - 1];
      const sameDevice =
        last.deviceTag !== undefined && last.deviceTag === endpoint.deviceTag;
      const samePoint = Math.hypot(last.x - endpoint.x, last.y - endpoint.y) < 1;
      if (sameDevice || (samePoint && !endpoint.deviceTag)) {
        get().pushToast("error", "Pick a different Cable Run point");
        return null;
      }

      if (!endpoint.deviceTag || endpoint.routeWaypoint) {
        set({
          cableRunDraft: { points: [...route, endpoint] },
          selectedMarkupIds: [],
          selectedBrand: null,
        });
        get().pushToast("info", "Route point added — click another turn or endpoint device");
        return "routed";
      }

      const finalRoute = [...route, endpoint];
      const cableMarkupId = uid();
      const cableMarkup = assignGeneratedCableLabels(
        [
          buildCableRunMarkup(
            cableMarkupId,
            s.activeCableId,
            finalRoute,
            s.activeCableId === "conduit"
              ? {
                  conduitType: s.activeConduitType,
                  conduitSize: s.activeConduitSize,
                }
              : isFiberCableId(s.activeCableId)
                ? { fiberStrandCount: s.activeFiberStrandCount }
              : undefined,
          ),
        ],
        s.project,
      )[0];
      const connection = buildCableRunConnection(
        uid(),
        cableMarkupId,
        s.activeCableId,
        finalRoute,
      );

      set((cur) => {
        if (!cur.project || !cur.activeSheetId) return cur;
        return {
          project: {
            ...cur.project,
            sheets: cur.project.sheets.map((sh) =>
              sh.id === cur.activeSheetId
                ? { ...sh, markups: [...sh.markups, cableMarkup] }
                : sh,
            ),
            connections: connection
              ? [...(cur.project.connections ?? []), connection]
              : cur.project.connections,
            updatedAt: Date.now(),
          },
          cableRunDraft: null,
          selectedMarkupIds: [cableMarkupId],
          selectedBrand: null,
        };
      });
      get().pushToast(
        "success",
        connection ? "Cable run and connection added" : "Cable run added",
      );
      return "completed";
    },
    branchCableRunEndpoint: (endpoint) => {
      const s = get();
      if (!s.activeCableId || !s.project || !s.activeSheetId) return null;
      const route = s.cableRunDraft?.points ?? [];
      if (route.length === 0) {
        get().pushToast("error", "Start a Cable Run before branching to devices");
        return null;
      }
      const last = route[route.length - 1];
      const sameDevice =
        last.deviceTag !== undefined && last.deviceTag === endpoint.deviceTag;
      const samePoint = Math.hypot(last.x - endpoint.x, last.y - endpoint.y) < 1;
      if (sameDevice || samePoint) {
        get().pushToast("error", "Pick a different Cable Run endpoint");
        return null;
      }

      const finalRoute = [...route, endpoint];
      const cableMarkupId = uid();
      const cableMarkup = assignGeneratedCableLabels(
        [
          buildCableRunMarkup(
            cableMarkupId,
            s.activeCableId,
            finalRoute,
            s.activeCableId === "conduit"
              ? {
                  conduitType: s.activeConduitType,
                  conduitSize: s.activeConduitSize,
                }
              : isFiberCableId(s.activeCableId)
                ? { fiberStrandCount: s.activeFiberStrandCount }
              : undefined,
          ),
        ],
        s.project,
      )[0];
      const connection = buildCableRunConnection(
        uid(),
        cableMarkupId,
        s.activeCableId,
        finalRoute,
      );

      set((cur) => {
        if (!cur.project || !cur.activeSheetId) return cur;
        return {
          project: {
            ...cur.project,
            sheets: cur.project.sheets.map((sh) =>
              sh.id === cur.activeSheetId
                ? { ...sh, markups: [...sh.markups, cableMarkup] }
                : sh,
            ),
            connections: connection
              ? [...(cur.project.connections ?? []), connection]
              : cur.project.connections,
            updatedAt: Date.now(),
          },
          selectedMarkupIds: [cableMarkupId],
          selectedBrand: null,
        };
      });
      get().pushToast(
        "success",
        connection ? "Cable branch and connection added" : "Cable branch added",
      );
      return "completed";
    },
    branchCableRunToEndpoints: (endpoints) => {
      let created = 0;
      for (const endpoint of endpoints) {
        if (get().branchCableRunEndpoint(endpoint) === "completed") created += 1;
      }
      if (created > 0) {
        get().pushToast(
          "success",
          `${created} cable drop${created === 1 ? "" : "s"} added`,
        );
      }
      return created;
    },
    beginCableRunBulkBranch: (route, sourceCableMarkupId) =>
      set((s) => {
        if (!s.project || !s.activeSheetId) return s;
        const activeRoute = route === undefined ? (s.cableRunDraft?.points ?? null) : route;
        return {
          cableRunBulkBranch: {
            route: activeRoute ? [...activeRoute] : null,
            targetEndpoints: [],
            sourceCableMarkupId,
            baseProject: s.project,
            previewCableMarkupIds: [],
          },
        };
      }),
    toggleCableRunBulkBranchTarget: (endpoint) => {
      const s = get();
      const bulk = s.cableRunBulkBranch;
      if (!s.project || !s.activeSheetId || !s.activeCableId || !bulk) return 0;
      const route = bulk.route ?? [];
      if (route.length === 0) {
        set({
          cableRunBulkBranch: {
            ...bulk,
            route: [endpoint],
          },
        });
        return 0;
      }
      const exists = bulk.targetEndpoints.some((target) =>
        cableRunEndpointKey(target) === cableRunEndpointKey(endpoint),
      );
      if (exists) return bulk.targetEndpoints.length;

      const finalRoute = [...route, endpoint];
      const cableMarkupId = uid();
      const cableMarkup = assignGeneratedCableLabels(
        [
          buildCableRunMarkup(
            cableMarkupId,
            s.activeCableId,
            finalRoute,
            s.activeCableId === "conduit"
              ? {
                  conduitType: s.activeConduitType,
                  conduitSize: s.activeConduitSize,
                }
              : isFiberCableId(s.activeCableId)
                ? { fiberStrandCount: s.activeFiberStrandCount }
              : undefined,
          ),
        ],
        s.project,
      )[0];
      const connection = buildCableRunConnection(
        uid(),
        cableMarkupId,
        s.activeCableId,
        finalRoute,
      );
      const targetLabel = endpoint.label ?? endpoint.deviceTag;

      set((cur) => {
        if (!cur.project || !cur.activeSheetId || !cur.cableRunBulkBranch) return cur;
        return {
          project: {
            ...cur.project,
            sheets: cur.project.sheets.map((sh) =>
              sh.id === cur.activeSheetId
                ? {
                    ...sh,
                    markups: sh.markups.map((m) =>
                      m.kind === "cable" &&
                      m.id === cur.cableRunBulkBranch?.sourceCableMarkupId &&
                      targetLabel
                        ? {
                            ...m,
                            servedDevices: Array.from(
                              new Set([...(m.servedDevices ?? []), targetLabel]),
                            ),
                          }
                        : m,
                    ).concat(cableMarkup),
                  }
                : sh,
            ),
            connections: connection
              ? [...(cur.project.connections ?? []), connection]
              : cur.project.connections,
            updatedAt: Date.now(),
          },
          cableRunBulkBranch: {
            ...cur.cableRunBulkBranch,
            targetEndpoints: [...cur.cableRunBulkBranch.targetEndpoints, endpoint],
            previewCableMarkupIds: [
              ...cur.cableRunBulkBranch.previewCableMarkupIds,
              cableMarkupId,
            ],
          },
        };
      });
      return get().cableRunBulkBranch?.targetEndpoints.length ?? bulk.targetEndpoints.length;
    },
    commitCableRunBulkBranch: () => {
      const bulk = get().cableRunBulkBranch;
      if (!bulk) return 0;
      const count = bulk.targetEndpoints.length;
      set((s) => {
        if (!s.cableRunBulkBranch) return s;
        return {
          cableRunBulkBranch: null,
          history:
            count > 0
              ? historyAfterProjectChange(s.history, s.cableRunBulkBranch.baseProject)
              : s.history,
        };
      });
      return count;
    },
    cancelCableRunBulkBranch: () =>
      set((s) =>
        s.cableRunBulkBranch
          ? {
              project: s.cableRunBulkBranch.baseProject,
              cableRunBulkBranch: null,
            }
          : s,
      ),
    appendCableRunPath: (points) => {
      const s = get();
      if (!s.activeCableId || !s.project || !s.activeSheetId) return null;
      if (points.length < 4) return null;
      const path: CableRunEndpoint[] = [];
      for (let i = 0; i + 1 < points.length; i += 2) {
        path.push({ x: points[i], y: points[i + 1] });
      }
      const route = s.cableRunDraft?.points ?? [];
      if (route.length === 0) {
        set({
          cableRunDraft: { points: path },
          selectedMarkupIds: [],
          selectedBrand: null,
        });
        get().pushToast("info", "Conduit path copied — click a device to finish");
        return "started";
      }

      const last = route[route.length - 1];
      const first = path[0];
      const final = path[path.length - 1];
      const distToFirst = Math.hypot(last.x - first.x, last.y - first.y);
      const distToFinal = Math.hypot(last.x - final.x, last.y - final.y);
      const oriented = distToFinal < distToFirst ? [...path].reverse() : path;
      const next = [...route];
      for (const p of oriented) {
        const prev = next[next.length - 1];
        if (!prev || Math.hypot(prev.x - p.x, prev.y - p.y) >= 1) {
          next.push(p);
        }
      }
      set({
        cableRunDraft: { points: next },
        selectedMarkupIds: [],
        selectedBrand: null,
      });
      get().pushToast("info", "Conduit path added — continue routing or click a device");
      return "routed";
    },
    finishCableRunDraft: () => {
      const s = get();
      if (!s.activeCableId || !s.project || !s.activeSheetId) return null;
      const route = s.cableRunDraft?.points ?? [];
      if (route.length < 2) {
        get().pushToast("error", "Add at least two Cable Run points");
        return null;
      }

      const cableMarkupId = uid();
      const cableMarkup = assignGeneratedCableLabels(
        [
          buildCableRunMarkup(
            cableMarkupId,
            s.activeCableId,
            route,
            s.activeCableId === "conduit"
              ? {
                  conduitType: s.activeConduitType,
                  conduitSize: s.activeConduitSize,
                }
              : isFiberCableId(s.activeCableId)
                ? { fiberStrandCount: s.activeFiberStrandCount }
              : undefined,
          ),
        ],
        s.project,
      )[0];
      const connection = buildCableRunConnection(
        uid(),
        cableMarkupId,
        s.activeCableId,
        route,
      );

      set((cur) => {
        if (!cur.project || !cur.activeSheetId) return cur;
        return {
          project: {
            ...cur.project,
            sheets: cur.project.sheets.map((sh) =>
              sh.id === cur.activeSheetId
                ? { ...sh, markups: [...sh.markups, cableMarkup] }
                : sh,
            ),
            connections: connection
              ? [...(cur.project.connections ?? []), connection]
              : cur.project.connections,
            updatedAt: Date.now(),
          },
          cableRunDraft: null,
          selectedMarkupIds: [cableMarkupId],
          selectedBrand: null,
        };
      });
      get().pushToast(
        "success",
        connection ? "Cable run and connection added" : "Cable run added",
      );
      return "completed";
    },
    toggleBrandPreview: () =>
      set((s) => ({ brandPreviewEnabled: !s.brandPreviewEnabled })),

    openPagePreview: (which) => set({ pagePreview: which }),
    closePagePreview: () => set({ pagePreview: null }),

    addMarkup: (m) =>
      set((s) => {
        if (!s.project || !s.activeSheetId) return s;
        const markup =
          m.kind === "cable" && !m.physicalLabel?.trim()
            ? assignGeneratedCableLabels([m], s.project)[0]
            : m;
        return {
          history: historyAfterProjectChange(s.history, s.project),
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) =>
              sh.id === s.activeSheetId
                ? { ...sh, markups: [...sh.markups, markup] }
                : sh,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    updateMarkup: (id, patch) =>
      set((s) => {
        if (!s.project || !s.activeSheetId) return s;
        const project = syncRackSystems({
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
        });
        return {
          history: historyAfterProjectChange(s.history, s.project),
          project,
        };
      }),

    moveDeviceMarkup: (id, x, y) =>
      set((s) => {
        if (!s.project || !s.activeSheetId) return s;
        const sheet = s.project.sheets.find((sh) => sh.id === s.activeSheetId);
        const device = sheet?.markups.find(
          (m): m is DeviceMarkup => m.id === id && m.kind === "device",
        );
        if (!sheet || !device) return s;
        const parent = device.parentId
          ? sheet.markups.find(
              (m): m is DeviceMarkup => m.kind === "device" && m.id === device.parentId,
            )
          : null;
        if (device.locked || parent?.locked) {
          const now = Date.now();
          const lockMoveHint =
            s.lockMoveHint && now - s.lockMoveHint.shownAt < 1400
              ? s.lockMoveHint
              : {
                  message: "Devices are locked. Unlock to move.",
                  shownAt: now,
                  pulseKey: now,
                };
          return { ...s, lockMoveHint };
        }

        const attachedRunIndexes = deviceAttachedRunIndexes(sheet.markups, device);
        const lockedAttachment = attachedRunIndexes.some(({ cable }) => cable.locked);
        if (lockedAttachment) {
          get().pushToast("error", "Unlock attached cable runs before moving this device");
          return s;
        }

        const nestingParent = nearestContainerForDevice(sheet.markups, device, { x, y });
        const nestedTarget = nestingParent
          ? nestedSlotPoint(sheet.markups, nestingParent, {
              ...device,
              x,
              y,
              parentId: nestingParent.id,
            })
          : null;
        const hasCableAttachments = attachedRunIndexes.length > 0;
        const snap =
          isRouteInfrastructureMarkup(device) && !hasCableAttachments
            ? nearestCableRunEndpoint(sheet.markups, { x, y })
            : null;
        const target = snap ? { x: snap.x, y: snap.y } : (nestedTarget ?? { x, y });
        const nextAttachment = snap
          ? { cableMarkupId: snap.cable.id, endpoint: snap.endpoint }
          : undefined;
        const movingParent = { ...device, x: target.x, y: target.y };
        const movedChildren = nestedChildren(sheet.markups, id).map((child) => ({
          child,
          target: nestedSlotPoint(sheet.markups, movingParent, child),
        }));
        const movedDeviceTargets = new Map<string, { x: number; y: number; device: DeviceMarkup }>();
        movedDeviceTargets.set(id, { x: target.x, y: target.y, device });
        for (const { child, target: childTarget } of movedChildren) {
          movedDeviceTargets.set(child.id, { ...childTarget, device: child });
        }

        const nextProject = syncRackSystems({
          ...s.project,
          sheets: s.project.sheets.map((sh) => {
            if (sh.id !== s.activeSheetId) return sh;
            return {
              ...sh,
              markups: sh.markups.map((m) => {
                if (m.kind === "device") {
                  const moved = movedDeviceTargets.get(m.id);
                  if (!moved) return m;
                  if (m.id === id) {
                    return {
                      ...m,
                      x: moved.x,
                      y: moved.y,
                      parentId: nestingParent?.id,
                      attachedRunEndpoint: nextAttachment,
                    };
                  }
                  return { ...m, x: moved.x, y: moved.y };
                }
                if (m.kind !== "cable") return m;
                let nextCable = m;
                for (const [deviceId, moved] of movedDeviceTargets) {
                  nextCable = cableWithMovedAttachment(
                    nextCable,
                    deviceId,
                    moved.device.tag,
                    moved.x,
                    moved.y,
                  );
                }
                if (snap && m.id === snap.cable.id) {
                  nextCable = cableWithEndpoint(
                    nextCable,
                    snap.endpoint,
                    target.x,
                    target.y,
                    routeInfrastructureLabel(device),
                  );
                }
                return nextCable;
              }),
            };
          }),
          updatedAt: Date.now(),
        });
        const withAssignments = nestingParent
          ? autoAssignContainerProject(nextProject, nestingParent.id)
          : nextProject;
        return {
          history: historyAfterProjectChange(s.history, s.project),
          project: withAssignments,
        };
      }),

    setAllDeviceMarkupsLocked: (locked) => {
      let changed = 0;
      set((s) => {
        if (!s.project) return s;
        const project = {
          ...s.project,
          sheets: s.project.sheets.map((sh) => ({
            ...sh,
            markups: sh.markups.map((m) => {
              if (m.kind !== "device" || m.locked === locked) return m;
              changed += 1;
              return { ...m, locked };
            }),
          })),
          updatedAt: Date.now(),
        };
        if (changed === 0) return s;
        return {
          history: historyAfterProjectChange(s.history, s.project),
          project,
        };
      });
      return changed;
    },

    attachRouteInfrastructureToRun: (deviceId, cableMarkupId, endpoint) =>
      set((s) => {
        if (!s.project || !s.activeSheetId) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) => {
              if (sh.id !== s.activeSheetId) return sh;
              const cable = sh.markups.find(
                (m): m is CableMarkup => m.kind === "cable" && m.id === cableMarkupId,
              );
              const device = sh.markups.find(
                (m): m is DeviceMarkup => m.kind === "device" && m.id === deviceId,
              );
              if (!cable || !device || !isRouteInfrastructureMarkup(device)) return sh;
              const p = endpointPoint(cable, endpoint);
              const label = routeInfrastructureLabel(device);
              return {
                ...sh,
                markups: sh.markups.map((m) => {
                  if (m.id === deviceId && m.kind === "device") {
                    return {
                      ...m,
                      x: p.x,
                      y: p.y,
                      attachedRunEndpoint: { cableMarkupId, endpoint },
                    };
                  }
                  if (m.id === cableMarkupId && m.kind === "cable") {
                    return cableWithEndpoint(m, endpoint, p.x, p.y, label);
                  }
                  return m;
                }),
              };
            }),
            updatedAt: Date.now(),
          },
        };
      }),

    disconnectRouteInfrastructure: (deviceId) =>
      set((s) => {
        if (!s.project || !s.activeSheetId) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) => {
              if (sh.id !== s.activeSheetId) return sh;
              const device = sh.markups.find(
                (m): m is DeviceMarkup => m.kind === "device" && m.id === deviceId,
              );
              const attachment = device?.attachedRunEndpoint;
              const label = device ? routeInfrastructureLabel(device) : undefined;
              return {
                ...sh,
                markups: sh.markups.map((m) => {
                  if (m.id === deviceId && m.kind === "device") {
                    const { attachedRunEndpoint: _attached, ...rest } = m;
                    return rest as DeviceMarkup;
                  }
                  if (
                    attachment &&
                    label &&
                    m.kind === "cable" &&
                    m.id === attachment.cableMarkupId
                  ) {
                    return {
                      ...m,
                      ...(attachment.endpoint === "A" && m.endpointA === label
                        ? { endpointA: undefined }
                        : {}),
                      ...(attachment.endpoint === "B" && m.endpointB === label
                        ? { endpointB: undefined }
                        : {}),
                    };
                  }
                  return m;
                }),
              };
            }),
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
      set((s) => {
        const layers = s.layers.map((l) =>
          l.id === id ? { ...l, visible: !l.visible } : l,
        );
        return {
          layers,
          project: s.project
            ? { ...s.project, layers, updatedAt: Date.now() }
            : s.project,
        };
      }),

    setLayerLocked: (id, locked) =>
      set((s) => {
        const layers = s.layers.map((l) => (l.id === id ? { ...l, locked } : l));
        return {
          layers,
          project: s.project
            ? { ...s.project, layers, updatedAt: Date.now() }
            : s.project,
        };
      }),

    moveLayer: (id, dir) =>
      set((s) => {
        const layers = [...s.layers];
        const index = layers.findIndex((l) => l.id === id);
        if (index < 0) return s;
        const nextIndex = dir === "up" ? index - 1 : index + 1;
        if (nextIndex < 0 || nextIndex >= layers.length) return s;
        const [layer] = layers.splice(index, 1);
        layers.splice(nextIndex, 0, layer);
        return {
          layers,
          project: s.project
            ? { ...s.project, layers, updatedAt: Date.now() }
            : s.project,
        };
      }),

    setDeviceSystemConfig: (markupId, config) =>
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
                      m.id === markupId && m.kind === "device"
                        ? { ...m, systemConfig: config }
                        : m,
                    ),
                  }
                : sh,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    addConnection: (conn) =>
      set((s) => {
        if (!s.project) return s;
        return {
          history: historyAfterProjectChange(s.history, s.project),
          project: {
            ...s.project,
            connections: [...(s.project.connections ?? []), conn],
            updatedAt: Date.now(),
          },
        };
      }),

    updateConnection: (id, patch) =>
      set((s) => {
        if (!s.project) return s;
        const previousConn = (s.project.connections ?? []).find((c) => c.id === id);
        if (!previousConn) return s;
        const nextConn = completeInternalEndpoint(s.project, {
          ...previousConn,
          ...patch,
        });
        const projectWithConnection = {
          ...s.project,
          connections: (s.project.connections ?? []).map((c) =>
            c.id === id ? nextConn : c,
          ),
          updatedAt: Date.now(),
        };
        return {
          history: historyAfterProjectChange(s.history, s.project),
          project: reanchorConnectionCable(projectWithConnection, previousConn, nextConn),
        };
      }),

    removeConnection: (id) =>
      set((s) => {
        if (!s.project) return s;
        return {
          history: historyAfterProjectChange(s.history, s.project),
          project: {
            ...s.project,
            connections: (s.project.connections ?? []).filter((c) => c.id !== id),
            updatedAt: Date.now(),
          },
        };
      }),

    autoAssignContainerInternalConnections: (containerId) => {
      let assigned = 0;
      set((s) => {
        if (!s.project) return s;
        const project = autoAssignContainerProject(s.project, containerId);
        assigned = countInternalAssignments(project, s.project);
        if (assigned === 0) return s;
        return {
          history: historyAfterProjectChange(s.history, s.project),
          project,
        };
      });
      return assigned;
    },

    addReport: (template) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            reports: [...(s.project.reports ?? []), template],
            updatedAt: Date.now(),
          },
        };
      }),

    updateReport: (id, patch) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            reports: (s.project.reports ?? []).map((r) =>
              r.id === id ? { ...r, ...patch } : r,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    removeReport: (id) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            reports: (s.project.reports ?? []).filter((r) => r.id !== id),
            updatedAt: Date.now(),
          },
        };
      }),

    duplicateReport: (id) => {
      const s = get();
      if (!s.project) return null;
      const orig = s.project.reports?.find((r) => r.id === id);
      if (!orig) return null;
      const newId = uid();
      const copy: ReportTemplate = {
        ...orig,
        id: newId,
        name: `${orig.name} (copy)`,
      };
      set({
        project: {
          ...s.project,
          reports: [...(s.project.reports ?? []), copy],
          updatedAt: Date.now(),
        },
      });
      return newId;
    },

    addDiagram: (diagram) => {
      const id = uid();
      set((s) => {
        if (!s.project) return s;
        const existing = s.project.diagrams ?? [];
        const n = existing.length + 1;
        const newDiagram: Diagram = {
          id,
          name: diagram?.name ?? `Diagram ${n}`,
          kind: diagram?.kind ?? "signal-flow",
          nodePositions: diagram?.nodePositions ?? {},
          nodeStyles: diagram?.nodeStyles,
          autoLayout: diagram?.autoLayout ?? "manual",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        return {
          project: {
            ...s.project,
            diagrams: [...existing, newDiagram],
            updatedAt: Date.now(),
          },
          activeDiagramId: id,
          view: "diagrams",
        };
      });
      return id;
    },

    updateDiagram: (id, patch) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            diagrams: (s.project.diagrams ?? []).map((d) =>
              d.id === id ? { ...d, ...patch, updatedAt: Date.now() } : d,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    removeDiagram: (id) =>
      set((s) => {
        if (!s.project) return s;
        const diagrams = (s.project.diagrams ?? []).filter((d) => d.id !== id);
        const newActive =
          s.activeDiagramId === id ? (diagrams[0]?.id ?? null) : s.activeDiagramId;
        return {
          project: { ...s.project, diagrams, updatedAt: Date.now() },
          activeDiagramId: newActive,
        };
      }),

    setActiveDiagram: (id) => set({ activeDiagramId: id }),

    setDiagramNodePosition: (diagramId, tag, pos) =>
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            diagrams: (s.project.diagrams ?? []).map((d) =>
              d.id === diagramId
                ? {
                    ...d,
                    nodePositions: { ...d.nodePositions, [tag]: pos },
                    updatedAt: Date.now(),
                  }
                : d,
            ),
            updatedAt: Date.now(),
          },
        };
      }),

    setTagDefaults: (patch) =>
      set((s) => {
        if (!s.project) return s;
        const cur = s.project.tagDefaults ?? {};
        const next = { ...cur, ...patch };
        // Drop empty values so the persisted record stays minimal and
        // future migrators don't need to special-case undefined keys.
        for (const k of Object.keys(next) as Array<keyof typeof next>) {
          if (next[k] === undefined || (next[k] as unknown) === "") {
            delete next[k];
          }
        }
        return {
          project: {
            ...s.project,
            tagDefaults: Object.keys(next).length === 0 ? undefined : next,
            updatedAt: Date.now(),
          },
        };
      }),

    resetAllTagPositions: (sheetId) => {
      let cleared = 0;
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) => {
              if (sheetId !== undefined && sh.id !== sheetId) return sh;
              return {
                ...sh,
                markups: sh.markups.map((m) => {
                  if (m.kind !== "device") return m;
                  if (m.tagOffsetX === undefined && m.tagOffsetY === undefined) {
                    return m;
                  }
                  cleared++;
                  const { tagOffsetX: _x, tagOffsetY: _y, ...rest } = m;
                  return rest as typeof m;
                }),
              };
            }),
            updatedAt: Date.now(),
          },
        };
      });
      return cleared;
    },

    applyTagFontSizeToAll: (fontSize, sheetId) => {
      let touched = 0;
      const clamped = Math.max(4, Math.min(64, fontSize));
      set((s) => {
        if (!s.project) return s;
        return {
          project: {
            ...s.project,
            sheets: s.project.sheets.map((sh) => {
              if (sheetId !== undefined && sh.id !== sheetId) return sh;
              return {
                ...sh,
                markups: sh.markups.map((m) => {
                  if (m.kind !== "device") return m;
                  touched++;
                  return { ...m, tagFontSize: clamped };
                }),
              };
            }),
            updatedAt: Date.now(),
          },
        };
      });
      return touched;
    },

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
    setViewport: (v) =>
      set((s) => {
        const viewport = normalizeCanvasViewport(v, s.viewport);
        return {
          viewport,
          sheetViewports:
            s.activeSheetId && s.project
              ? { ...s.sheetViewports, [s.activeSheetId]: viewport }
              : s.sheetViewports,
        };
      }),
    toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
    toggleOrtho: () => set((s) => ({ orthoEnabled: !s.orthoEnabled })),
    toggleCoverageVisible: () =>
      set((s) => ({ coverageVisible: !s.coverageVisible })),
    toggleRunLabelsVisible: () =>
      set((s) => {
        const next = !s.runLabelsVisible;
        return {
          runLabelsVisible: next,
          project: s.project
            ? { ...s.project, runLabelsVisible: next, updatedAt: Date.now() }
            : s.project,
          history: s.project
            ? historyAfterProjectChange(s.history, s.project)
            : s.history,
        };
      }),
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
    notifyLockedDeviceMoveAttempt: () =>
      set((s) => {
        const now = Date.now();
        if (s.lockMoveHint && now - s.lockMoveHint.shownAt < 1400) return s;
        return {
          lockMoveHint: {
            message: "Devices are locked. Unlock to move.",
            shownAt: now,
            pulseKey: now,
          },
        };
      }),
    clearLockMoveHint: (pulseKey) =>
      set((s) => {
        if (!s.lockMoveHint) return s;
        if (pulseKey !== undefined && s.lockMoveHint.pulseKey !== pulseKey) return s;
        return { lockMoveHint: null };
      }),

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

function cableRunEndpointKey(endpoint: CableRunEndpoint): string {
  return endpoint.deviceMarkupId ?? endpoint.deviceTag ?? `${endpoint.x}:${endpoint.y}`;
}

function deviceAttachedRunIndexes(markups: Markup[], device: DeviceMarkup) {
  const hits: Array<{ cable: CableMarkup; pointIndex: number }> = [];
  for (const markup of markups) {
    if (markup.kind !== "cable") continue;
    markup.pointAttachments?.forEach((attachment, pointIndex) => {
      if (
        attachment &&
        (attachment.deviceMarkupId === device.id ||
          (device.tag && attachment.deviceTag === device.tag))
      ) {
        hits.push({ cable: markup, pointIndex });
      }
    });
  }
  return hits;
}

function cableWithMovedAttachment(
  cable: CableMarkup,
  deviceId: string,
  deviceTag: string | undefined,
  x: number,
  y: number,
): CableMarkup {
  if (!cable.pointAttachments?.length) return cable;
  let changed = false;
  const points = [...cable.points];
  for (const [index, attachment] of cable.pointAttachments.entries()) {
    if (
      attachment &&
      (attachment.deviceMarkupId === deviceId ||
        (deviceTag && attachment.deviceTag === deviceTag))
    ) {
      points[index * 2] = x;
      points[index * 2 + 1] = y;
      changed = true;
    }
  }
  return changed ? { ...cable, points } : cable;
}

function completeInternalEndpoint(project: Project, conn: DeviceConnection): DeviceConnection {
  const endpoint = conn.internalEndpoint;
  if (!endpoint) return conn;
  const device =
    findDeviceById(project, endpoint.deviceId) ??
    findDeviceByTag(project, endpoint.deviceTag);
  if (!device) return conn;
  const ports = effectiveDevicePorts(device.deviceId, device.instancePorts);
  const port = endpoint.portId
    ? findPort(ports, endpoint.portId)
    : nextAvailableInternalPort(project, conn, device);
  return {
    ...conn,
    internalEndpoint: {
      ...endpoint,
      deviceId: device.id,
      deviceTag: device.tag,
      ...(port ? { portId: port.id, port: port.label } : {}),
    },
  };
}

function reanchorConnectionCable(
  project: Project,
  previousConn: DeviceConnection,
  nextConn: DeviceConnection,
): Project {
  if (!nextConn.cableMarkupId) return project;
  const endpoint = nextConn.internalEndpoint ?? previousConn.internalEndpoint;
  if (!endpoint) return project;
  const isClearing = !nextConn.internalEndpoint && !!previousConn.internalEndpoint;
  const containerTag = endpoint.containerTag;
  const target = isClearing
    ? findDeviceById(project, endpoint.containerId) ??
      findDeviceByTag(project, containerTag)
    : findDeviceById(project, endpoint.deviceId) ??
      findDeviceByTag(project, endpoint.deviceTag);
  if (!target) return project;
  const pointIndex =
    nextConn.fromTag === containerTag
      ? 0
      : nextConn.toTag === containerTag
        ? -1
        : null;
  if (pointIndex === null) return project;
  const allMarkups = project.sheets.flatMap((sheet) => sheet.markups);
  const targetEndpoint = endpointFromMarkup(target, { markups: allMarkups });
  const targetPoint = targetEndpoint ?? target;
  return {
    ...project,
    sheets: project.sheets.map((sheet) => ({
      ...sheet,
      markups: sheet.markups.map((markup) => {
        if (markup.kind !== "cable" || markup.id !== nextConn.cableMarkupId) return markup;
        const index = pointIndex === -1 ? Math.floor(markup.points.length / 2) - 1 : pointIndex;
        const points = [...markup.points];
        points[index * 2] = targetPoint.x;
        points[index * 2 + 1] = targetPoint.y;
        const pointAttachments = [...(markup.pointAttachments ?? [])];
        pointAttachments[index] = targetEndpoint
          ? {
              deviceMarkupId: targetEndpoint.deviceMarkupId,
              deviceTag: targetEndpoint.deviceTag,
              label: targetEndpoint.label,
              deviceId: targetEndpoint.deviceId,
              category: targetEndpoint.category,
              routeWaypoint: targetEndpoint.routeWaypoint,
            }
          : null;
        return { ...markup, points, pointAttachments };
      }),
    })),
  };
}

function syncRackSystems(project: Project): Project {
  const now = Date.now();
  const sourceSheets = new Map<string, string>();
  const devices = project.sheets.flatMap((sheet) => {
    const sheetDevices = sheet.markups.filter(
      (markup): markup is DeviceMarkup => markup.kind === "device",
    );
    for (const device of sheetDevices) sourceSheets.set(device.id, sheet.id);
    return sheetDevices;
  });
  const rackMarkups = devices.filter(isRackDevice);
  const existingAutoRacks = new Map(
    (project.racks ?? [])
      .filter((rack) => rack.sourceMarkupId)
      .map((rack) => [rack.sourceMarkupId!, rack]),
  );
  const manualRacks = (project.racks ?? []).filter((rack) => !rack.sourceMarkupId);

  const autoRacks = rackMarkups.map((rackMarkup) => {
    const existing = existingAutoRacks.get(rackMarkup.id);
    let nextSlot = 1;
    const placements = devices
      .filter((device) => device.parentId === rackMarkup.id)
      .map((device) => {
        const rackDeviceId = rackDeviceIdForNestedDevice(device);
        if (!rackDeviceId) return null;
        const previousPlacement = existing?.placements.find(
          (placement) => placement.sourceMarkupId === device.id,
        );
        const catalog = rackCatalog.find((candidate) => candidate.id === rackDeviceId);
        const placement: RackPlacement = {
          id: previousPlacement?.id ?? uid(),
          sourceMarkupId: device.id,
          deviceId: rackDeviceId,
          uSlot: previousPlacement?.uSlot ?? nextSlot,
          label: deviceDisplayName(device),
          costOverride: previousPlacement?.costOverride,
          notes: previousPlacement?.notes,
        };
        nextSlot = Math.max(nextSlot, placement.uSlot + (catalog?.uHeight ?? 1));
        return placement;
      })
      .filter((placement): placement is RackPlacement => placement !== null);

    return {
      id: existing?.id ?? uid(),
      sourceMarkupId: rackMarkup.id,
      name: existing?.name ?? deviceDisplayName(rackMarkup),
      uHeight: existing?.uHeight ?? 42,
      location: existing?.location ?? rackMarkup.labelOverride,
      associatedSheetId: existing?.associatedSheetId ?? sourceSheets.get(rackMarkup.id),
      placements,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies Rack;
  });

  return { ...project, racks: [...manualRacks, ...autoRacks] };
}

function autoAssignContainerProject(project: Project, containerId: string): Project {
  let nextProject = project;
  const container = findDeviceById(nextProject, containerId);
  if (!container?.tag) return nextProject;
  const children = nextProject.sheets
    .flatMap((sheet) => sheet.markups)
    .filter(
      (markup): markup is DeviceMarkup =>
        markup.kind === "device" && markup.parentId === container.id,
    );
  if (children.length === 0) return nextProject;

  for (const conn of nextProject.connections ?? []) {
    if (conn.internalEndpoint) continue;
    if (conn.fromTag !== container.tag && conn.toTag !== container.tag) continue;
    const child = children.find((candidate) =>
      nextAvailableInternalPort(nextProject, conn, candidate),
    );
    if (!child) continue;
    const port = nextAvailableInternalPort(nextProject, conn, child);
    const nextConn = completeInternalEndpoint(nextProject, {
      ...conn,
      internalEndpoint: {
        containerId: container.id,
        containerTag: container.tag,
        deviceId: child.id,
        deviceTag: child.tag,
        ...(port ? { portId: port.id, port: port.label } : {}),
      },
    });
    const projectWithConnection = {
      ...nextProject,
      connections: (nextProject.connections ?? []).map((existing) =>
        existing.id === conn.id ? nextConn : existing,
      ),
      updatedAt: Date.now(),
    };
    nextProject = reanchorConnectionCable(projectWithConnection, conn, nextConn);
  }
  return nextProject;
}

function countInternalAssignments(nextProject: Project, previousProject: Project): number {
  let count = 0;
  for (const conn of nextProject.connections ?? []) {
    const previous = previousProject.connections?.find((c) => c.id === conn.id);
    if (!previous?.internalEndpoint && conn.internalEndpoint) count += 1;
  }
  return count;
}

function endpointPoint(cable: CableMarkup, endpoint: CableRunEndpointKey) {
  if (endpoint === "A") return { x: cable.points[0], y: cable.points[1] };
  return {
    x: cable.points[cable.points.length - 2],
    y: cable.points[cable.points.length - 1],
  };
}

function cableWithEndpoint(
  cable: CableMarkup,
  endpoint: CableRunEndpointKey,
  x: number,
  y: number,
  label: string | undefined,
): CableMarkup {
  const points = [...cable.points];
  if (endpoint === "A") {
    points[0] = x;
    points[1] = y;
    return { ...cable, points, endpointA: label ?? cable.endpointA };
  }
  points[points.length - 2] = x;
  points[points.length - 1] = y;
  return { ...cable, points, endpointB: label ?? cable.endpointB };
}

// ───────── Selectors ─────────

export const selectActiveSheet = (s: State): Sheet | null => {
  if (!s.project || !s.activeSheetId) return null;
  return s.project.sheets.find((sh) => sh.id === s.activeSheetId) ?? null;
};

export const selectActiveRack = (s: State): Rack | null => {
  if (!s.project || !s.activeRackId) return null;
  return s.project.racks?.find((r) => r.id === s.activeRackId) ?? null;
};

export const selectActiveDiagram = (s: State): Diagram | null => {
  if (!s.project || !s.activeDiagramId) return null;
  return (
    s.project.diagrams?.find((d) => d.id === s.activeDiagramId) ?? null
  );
};

type HotStateSnapshot = Pick<
  State,
  | "project"
  | "history"
  | "view"
  | "activeSheetId"
  | "activeRackId"
  | "activeDiagramId"
  | "activeTool"
  | "activeDeviceId"
  | "activeCableId"
  | "activeConduitType"
  | "activeConduitSize"
  | "activeFiberStrandCount"
  | "selectedMarkupIds"
  | "selectedBrand"
  | "layers"
  | "cursor"
  | "viewport"
  | "sheetViewports"
  | "snapEnabled"
  | "orthoEnabled"
  | "coverageVisible"
  | "brandPreviewEnabled"
  | "pagePreview"
  | "freehandColor"
  | "freehandThickness"
  | "freehandErasing"
  | "cableRunDraft"
  | "cableRunBulkBranch"
  | "runLabelsVisible"
  | "qualityMode"
  | "ingestProgress"
  | "bidPanelOpen"
  | "paletteOpen"
  | "settingsOpen"
  | "commandPaletteOpen"
  | "toasts"
>;

function hotSnapshot(s: State): HotStateSnapshot {
  return {
    project: s.project,
    history: s.history,
    view: s.view,
    activeSheetId: s.activeSheetId,
    activeRackId: s.activeRackId,
    activeDiagramId: s.activeDiagramId,
    activeTool: s.activeTool,
    activeDeviceId: s.activeDeviceId,
    activeCableId: s.activeCableId,
    activeConduitType: s.activeConduitType,
    activeConduitSize: s.activeConduitSize,
    activeFiberStrandCount: s.activeFiberStrandCount,
    selectedMarkupIds: s.selectedMarkupIds,
    selectedBrand: s.selectedBrand,
    layers: s.layers,
    cursor: s.cursor,
    viewport: s.viewport,
    sheetViewports: s.sheetViewports,
    snapEnabled: s.snapEnabled,
    orthoEnabled: s.orthoEnabled,
    coverageVisible: s.coverageVisible,
    brandPreviewEnabled: s.brandPreviewEnabled,
    pagePreview: s.pagePreview,
    freehandColor: s.freehandColor,
    freehandThickness: s.freehandThickness,
    freehandErasing: s.freehandErasing,
    cableRunDraft: s.cableRunDraft,
    cableRunBulkBranch: s.cableRunBulkBranch,
    runLabelsVisible: s.runLabelsVisible,
    qualityMode: s.qualityMode,
    ingestProgress: s.ingestProgress,
    bidPanelOpen: s.bidPanelOpen,
    paletteOpen: s.paletteOpen,
    settingsOpen: s.settingsOpen,
    commandPaletteOpen: s.commandPaletteOpen,
    toasts: s.toasts,
  };
}

type ViteHotContext = {
  data: { state?: HotStateSnapshot };
  dispose: (callback: (data: { state?: HotStateSnapshot }) => void) => void;
};

const viteHot = (import.meta as ImportMeta & { hot?: ViteHotContext }).hot;

if (viteHot) {
  const hotData = viteHot.data;
  if (hotData.state) {
    useProjectStore.setState({
      ...hotData.state,
      project: hotData.state.project
        ? normalizeProject(hotData.state.project)
        : null,
      history: hotData.state.history ?? emptyHistory(),
      layers: normalizeLayers(hotData.state.layers),
      runLabelsVisible: hotData.state.project?.runLabelsVisible === true,
      cableRunBulkBranch: null,
    });
  }
  viteHot.dispose((data) => {
    data.state = hotSnapshot(useProjectStore.getState());
  });
}
