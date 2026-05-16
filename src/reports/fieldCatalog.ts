/**
 * Declarative catalog of every queryable field on each report scope.
 * Drives the column-picker autocomplete in the report builder UI and
 * the default column header in reports that don't explicitly set one.
 *
 * Add a field here as soon as it lands on a domain type — the engine
 * picks it up automatically via `getByPath`, so the catalog is the
 * only place that needs updating for the picker to show new options.
 */

import type { ReportScope } from "../store/projectStore";
import { CONDUIT_TYPES } from "../lib/conduit";

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "ip"
  | "mac"
  | "url"
  | "enum";

export interface FieldDef {
  /** Dotted-path identifier (matches `getByPath`). */
  path: string;
  /** Human label shown in the picker + as the default column header. */
  label: string;
  type: FieldType;
  /** Enumerated values (for the filter dropdown), if applicable. */
  enumValues?: string[];
  /** Help text for the picker tooltip. */
  help?: string;
}

// ───────── Per-scope field definitions ─────────

const DEVICE_FIELDS: FieldDef[] = [
  // Identity
  { path: "tag", label: "Tag", type: "string", help: "Auto-numbered identifier (CAM-01, AP-04, …)" },
  { path: "labelOverride", label: "Display Label", type: "string" },
  { path: "deviceId", label: "Catalog ID", type: "string" },
  { path: "deviceLabel", label: "Catalog Label", type: "string", help: "Human name from the device library" },
  { path: "category", label: "Category", type: "enum" },
  { path: "shortCode", label: "Short Code", type: "string" },
  { path: "sheetName", label: "Sheet", type: "string", help: "Sheet this device lives on" },
  { path: "sheetId", label: "Sheet ID", type: "string" },
  { path: "parentTag", label: "Contained In", type: "string", help: "Tag of the parent Rack, Enclosure, Head End, or container" },
  { path: "parentLabel", label: "Container Label", type: "string" },
  { path: "nestedDeviceCount", label: "Racked Device Count", type: "number" },
  { path: "nestedDevices", label: "Racked Devices", type: "string" },
  { path: "x", label: "X (drawing units)", type: "number" },
  { path: "y", label: "Y (drawing units)", type: "number" },
  { path: "rotation", label: "Rotation (deg)", type: "number" },

  // Asset / commissioning
  { path: "systemConfig.manufacturer", label: "Manufacturer", type: "string" },
  { path: "systemConfig.model", label: "Model", type: "string" },
  { path: "systemConfig.serialNumber", label: "Serial No.", type: "string" },
  { path: "systemConfig.firmwareVersion", label: "Firmware", type: "string" },
  { path: "systemConfig.assetTag", label: "Asset Tag", type: "string" },
  { path: "systemConfig.managementUrl", label: "Management URL", type: "url" },
  { path: "systemConfig.installedBy", label: "Installed By", type: "string" },
  { path: "systemConfig.installedAt", label: "Install Date", type: "date" },
  { path: "systemConfig.warrantyExpiry", label: "Warranty Expiry", type: "date" },

  // Network
  { path: "systemConfig.network.ipAddress", label: "IP Address", type: "ip" },
  { path: "systemConfig.network.subnetMask", label: "Subnet Mask", type: "string" },
  { path: "systemConfig.network.gateway", label: "Gateway", type: "ip" },
  { path: "systemConfig.network.dns1", label: "DNS 1", type: "ip" },
  { path: "systemConfig.network.dns2", label: "DNS 2", type: "ip" },
  { path: "systemConfig.network.hostname", label: "Hostname", type: "string" },
  { path: "systemConfig.network.macAddress", label: "MAC", type: "mac" },
  { path: "systemConfig.network.vlan", label: "VLAN", type: "number" },
  { path: "systemConfig.network.dhcp", label: "DHCP", type: "boolean" },
  { path: "systemConfig.network.httpPort", label: "HTTP Port", type: "number" },
  { path: "systemConfig.network.httpsPort", label: "HTTPS Port", type: "number" },

  // Physical install
  { path: "systemConfig.mountType", label: "Mount", type: "string" },
  { path: "systemConfig.poeClass", label: "PoE Class", type: "number" },
  { path: "systemConfig.switchPort", label: "Switch Port (text)", type: "string" },
  { path: "systemConfig.cableTag", label: "Cable Tag", type: "string" },

  // Camera-specific
  { path: "systemConfig.streams.primaryRtsp", label: "Primary RTSP", type: "url" },
  { path: "systemConfig.streams.secondaryRtsp", label: "Secondary RTSP", type: "url" },
  { path: "systemConfig.streams.username", label: "Stream User", type: "string" },
  { path: "systemConfig.streams.codec", label: "Codec", type: "string" },
  { path: "systemConfig.streams.resolution", label: "Resolution", type: "string" },
  { path: "systemConfig.streams.bitrateKbps", label: "Bitrate (kbps)", type: "number" },
  { path: "systemConfig.streams.fps", label: "FPS", type: "number" },
  { path: "systemConfig.streams.nvrTag", label: "NVR Tag", type: "string" },
  { path: "systemConfig.streams.nvrChannel", label: "NVR Channel", type: "number" },
  { path: "systemConfig.streams.nvrChannelName", label: "Channel Name", type: "string" },
  { path: "systemConfig.streams.onvifEnabled", label: "ONVIF Enabled", type: "boolean" },
  { path: "systemConfig.streams.onvifPort", label: "ONVIF Port", type: "number" },

  // PTZ
  { path: "systemConfig.ptz.enabled", label: "PTZ Enabled", type: "boolean" },
  { path: "systemConfig.ptz.protocol", label: "PTZ Protocol", type: "string" },
  { path: "systemConfig.ptz.address", label: "PTZ Address", type: "number" },

  // Wireless
  { path: "systemConfig.wireless.ssid", label: "SSID", type: "string" },
  { path: "systemConfig.wireless.band", label: "Band", type: "string" },
  { path: "systemConfig.wireless.channel", label: "Channel", type: "number" },
  { path: "systemConfig.wireless.security", label: "Wi-Fi Security", type: "string" },
  { path: "systemConfig.wireless.controllerTag", label: "Wireless Controller", type: "string" },
  { path: "systemConfig.wireless.maxClients", label: "Max Clients", type: "number" },

  // Switch
  { path: "systemConfig.switchConfig.portCount", label: "Port Count", type: "number" },
  { path: "systemConfig.switchConfig.poeBudgetW", label: "PoE Budget (W)", type: "number" },
  { path: "systemConfig.switchConfig.vlans", label: "Active VLANs", type: "string" },
  { path: "systemConfig.switchConfig.managementVlan", label: "Mgmt VLAN", type: "number" },
  { path: "systemConfig.switchConfig.uplinkPort", label: "Uplink Port", type: "string" },
  { path: "systemConfig.switchConfig.controllerTag", label: "Switch Controller", type: "string" },

  // Access control
  { path: "systemConfig.accessControl.doorName", label: "Door", type: "string" },
  { path: "systemConfig.accessControl.zone", label: "Zone", type: "string" },
  { path: "systemConfig.accessControl.protocol", label: "ACS Protocol", type: "string" },
  { path: "systemConfig.accessControl.relayType", label: "Relay Type", type: "string" },
  { path: "systemConfig.accessControl.holdTimeMs", label: "Hold Time (ms)", type: "number" },
  { path: "systemConfig.accessControl.controllerTag", label: "ACS Controller", type: "string" },
  { path: "systemConfig.accessControl.osdpAddress", label: "OSDP Address", type: "number" },

  // Computed
  { path: "connectionCount", label: "Connection Count", type: "number" },
  { path: "validationWarnings", label: "Validation Warnings", type: "string" },
  { path: "notes", label: "Notes", type: "string" },
];

const CABLE_FIELDS: FieldDef[] = [
  { path: "id", label: "ID", type: "string" },
  { path: "cableId", label: "Cable Type", type: "string" },
  { path: "cableLabel", label: "Cable Label", type: "string" },
  {
    path: "physicalLabel",
    label: "Physical Label",
    type: "string",
    help: "Real-world cable/fiber/conduit label to print or apply in the field",
  },
  {
    path: "conduitType",
    label: "Conduit Type",
    type: "enum",
    enumValues: [...CONDUIT_TYPES],
  },
  { path: "conduitSize", label: "Conduit Size", type: "string" },
  { path: "sheetName", label: "Sheet", type: "string" },
  { path: "sheetId", label: "Sheet ID", type: "string" },
  { path: "runCount", label: "Run Count", type: "number" },
  { path: "fiberStrandCount", label: "Fiber Strand Count", type: "number" },
  { path: "lengthFt", label: "Length (ft)", type: "number" },
  { path: "serviceLoopFt", label: "Service Loop (ft)", type: "number" },
  { path: "lengthFtWithSlack", label: "Length w/ Slack (ft)", type: "number" },
  { path: "carriedByConduit", label: "Carried By Conduit", type: "string" },
  { path: "servedDevices", label: "Served Devices", type: "string" },
  { path: "connector", label: "Connector", type: "string" },
  { path: "endpointA", label: "Endpoint A", type: "string" },
  { path: "endpointB", label: "Endpoint B", type: "string" },
  { path: "slackPercent", label: "Slack %", type: "number" },
  { path: "validationWarnings", label: "Validation Warnings", type: "string" },
  { path: "label", label: "Label", type: "string" },
  { path: "notes", label: "Notes", type: "string" },
];

const CONNECTION_FIELDS: FieldDef[] = [
  { path: "id", label: "ID", type: "string" },
  { path: "fromTag", label: "From Device", type: "string" },
  { path: "fromPort", label: "From Port", type: "string" },
  { path: "fromPortId", label: "From Port ID", type: "string" },
  { path: "fromPortResolved", label: "From Port (resolved)", type: "string" },
  { path: "toTag", label: "To Device", type: "string" },
  { path: "toPort", label: "To Port", type: "string" },
  { path: "toPortId", label: "To Port ID", type: "string" },
  { path: "toPortResolved", label: "To Port (resolved)", type: "string" },
  { path: "internalContainerTag", label: "Internal Container", type: "string" },
  { path: "internalDeviceTag", label: "Internal Device", type: "string" },
  { path: "internalDeviceId", label: "Internal Device ID", type: "string" },
  { path: "internalPort", label: "Internal Port", type: "string" },
  { path: "internalPortId", label: "Internal Port ID", type: "string" },
  { path: "medium", label: "Medium", type: "string" },
  { path: "validationWarnings", label: "Validation Warnings", type: "string" },
  { path: "label", label: "Label", type: "string" },
  { path: "notes", label: "Notes", type: "string" },
];

const AREA_SCHEDULE_FIELDS: FieldDef[] = [
  { path: "areaTag", label: "Area Tag", type: "string" },
  { path: "areaName", label: "Area Schedule", type: "string" },
  { path: "areaLabel", label: "Area Label", type: "string" },
  { path: "deviceTag", label: "Device Tag", type: "string" },
  { path: "deviceName", label: "Device", type: "string" },
  { path: "deviceLabel", label: "Catalog Label", type: "string" },
  { path: "category", label: "Category", type: "string" },
  { path: "connections", label: "Connections", type: "string" },
  { path: "connectionCount", label: "Connection Count", type: "number" },
  { path: "sheetName", label: "Sheet", type: "string" },
];

const RACK_FIELDS: FieldDef[] = [
  { path: "id", label: "ID", type: "string" },
  { path: "name", label: "Name", type: "string" },
  { path: "location", label: "Location", type: "string" },
  { path: "uHeight", label: "U Height", type: "number" },
  { path: "placementCount", label: "Placement Count", type: "number" },
  { path: "validationWarnings", label: "Validation Warnings", type: "string" },
  { path: "associatedSheetId", label: "Associated Sheet", type: "string" },
];

const RACK_PLACEMENT_FIELDS: FieldDef[] = [
  { path: "rackName", label: "Rack", type: "string" },
  { path: "uSlot", label: "U Slot", type: "number" },
  { path: "uHeight", label: "U Height", type: "number" },
  { path: "deviceId", label: "Catalog ID", type: "string" },
  { path: "deviceLabel", label: "Device", type: "string" },
  { path: "manufacturer", label: "Manufacturer", type: "string" },
  { path: "model", label: "Model", type: "string" },
  { path: "powerWatts", label: "Power (W)", type: "number" },
  { path: "weightLbs", label: "Weight (lbs)", type: "number" },
  { path: "label", label: "Label Override", type: "string" },
  { path: "validationWarnings", label: "Validation Warnings", type: "string" },
  { path: "notes", label: "Notes", type: "string" },
];

const SHEET_FIELDS: FieldDef[] = [
  { path: "id", label: "ID", type: "string" },
  { path: "name", label: "Name", type: "string" },
  { path: "fileName", label: "Source File", type: "string" },
  { path: "sheetNumber", label: "Sheet No.", type: "string" },
  { path: "sheetTitle", label: "Title", type: "string" },
  { path: "revision", label: "Revision", type: "string" },
  { path: "scaleNote", label: "Scale Note", type: "string" },
  { path: "pageWidth", label: "Width", type: "number" },
  { path: "pageHeight", label: "Height", type: "number" },
  { path: "sourceKind", label: "Source Kind", type: "enum" },
  { path: "markupCount", label: "Markup Count", type: "number" },
  { path: "deviceCount", label: "Device Count", type: "number" },
  { path: "isCalibrated", label: "Calibrated", type: "boolean" },
];

const PORT_FIELDS: FieldDef[] = [
  { path: "deviceTag", label: "Device", type: "string" },
  { path: "deviceLabel", label: "Device Label", type: "string" },
  { path: "category", label: "Category", type: "string" },
  { path: "sheetName", label: "Sheet", type: "string" },
  { path: "port.id", label: "Port ID", type: "string" },
  { path: "port.label", label: "Port Label", type: "string" },
  { path: "port.kind", label: "Port Kind", type: "string" },
  { path: "port.poe", label: "PoE Direction", type: "string" },
  { path: "port.speed", label: "Speed", type: "string" },
  { path: "port.pluggable", label: "Pluggable", type: "boolean" },
  { path: "isConnected", label: "Connected", type: "boolean" },
  { path: "connectedTo", label: "Connected To", type: "string" },
  { path: "validationWarnings", label: "Validation Warnings", type: "string" },
];

export const FIELD_CATALOG: Record<ReportScope, FieldDef[]> = {
  devices: DEVICE_FIELDS,
  cables: CABLE_FIELDS,
  connections: CONNECTION_FIELDS,
  areaSchedules: AREA_SCHEDULE_FIELDS,
  racks: RACK_FIELDS,
  rackPlacements: RACK_PLACEMENT_FIELDS,
  sheets: SHEET_FIELDS,
  ports: PORT_FIELDS,
};

export const SCOPE_LABEL: Record<ReportScope, string> = {
  devices: "Devices",
  cables: "Cable Runs",
  connections: "Connections",
  areaSchedules: "Area Schedules",
  racks: "Racks",
  rackPlacements: "Rack Placements",
  sheets: "Sheets",
  ports: "Device Ports",
};

/** Resolve the canonical label for a dotted-path field — used in
 *  reports when the user didn't supply an explicit header. */
export function fieldLabel(scope: ReportScope, path: string): string {
  const def = FIELD_CATALOG[scope].find((f) => f.path === path);
  if (def) return def.label;
  // Fall back to the last path segment, title-cased.
  const last = path.split(".").pop() ?? path;
  return last.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}
