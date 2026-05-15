/**
 * Ready-to-run report templates that every new project gets seeded
 * with. Lets the user generate a useful report on day one without
 * understanding the field catalog. They can duplicate any starter to
 * customize it without losing the original.
 */

import type { ReportTemplate } from "../store/projectStore";

const uid = () => Math.random().toString(36).slice(2, 10);

function t(template: Omit<ReportTemplate, "id">): ReportTemplate {
  return { id: uid(), ...template };
}

export function buildStarterTemplates(): ReportTemplate[] {
  return [
    t({
      name: "Camera Commissioning Sheet",
      description:
        "Every camera with its IP, MAC, switch port, PoE class, RTSP URI, NVR channel, and mount type — perfect for handing off to the install crew.",
      scope: "devices",
      filters: [{ field: "category", op: "eq", value: "cameras" }],
      columns: [
        { field: "tag" },
        { field: "labelOverride", header: "Location" },
        { field: "systemConfig.manufacturer" },
        { field: "systemConfig.model" },
        { field: "systemConfig.network.ipAddress" },
        { field: "systemConfig.network.macAddress" },
        { field: "systemConfig.network.vlan" },
        { field: "systemConfig.poeClass" },
        { field: "systemConfig.switchPort" },
        { field: "systemConfig.streams.primaryRtsp" },
        { field: "systemConfig.streams.nvrTag", header: "NVR" },
        { field: "systemConfig.streams.nvrChannel", header: "Ch" },
        { field: "systemConfig.mountType" },
        { field: "sheetName", header: "Sheet" },
      ],
      sortBy: [{ field: "tag", dir: "asc" }],
      formats: ["xlsx", "pdf"],
    }),

    t({
      name: "Access Point IP Plan",
      description: "SSID, band, channel, IP, VLAN, controller, and switch port for every AP.",
      scope: "devices",
      filters: [{ field: "shortCode", op: "eq", value: "AP" }],
      columns: [
        { field: "tag" },
        { field: "systemConfig.model" },
        { field: "systemConfig.wireless.ssid", header: "SSID" },
        { field: "systemConfig.wireless.band", header: "Band" },
        { field: "systemConfig.wireless.channel", header: "Ch" },
        { field: "systemConfig.wireless.security", header: "Security" },
        { field: "systemConfig.network.ipAddress" },
        { field: "systemConfig.network.vlan" },
        { field: "systemConfig.wireless.controllerTag", header: "Controller" },
        { field: "systemConfig.switchPort" },
        { field: "sheetName", header: "Sheet" },
      ],
      sortBy: [{ field: "tag", dir: "asc" }],
      formats: ["xlsx", "csv"],
    }),

    t({
      name: "Cable Schedule",
      description: "Every cable run with type, length (post-slack), endpoints, and the sheet it lives on.",
      scope: "cables",
      filters: [],
      columns: [
        { field: "label", header: "Tag" },
        { field: "cableLabel", header: "Cable" },
        { field: "endpointA", header: "From" },
        { field: "endpointB", header: "To" },
        { field: "lengthFt", header: "Length (ft)" },
        { field: "lengthFtWithSlack", header: "Length w/ Slack" },
        { field: "connector" },
        { field: "sheetName", header: "Sheet" },
        { field: "notes" },
      ],
      sortBy: [{ field: "cableLabel", dir: "asc" }],
      formats: ["xlsx", "csv", "pdf"],
    }),

    t({
      name: "Switch Port Map",
      description:
        "Every device connected to a switch — grouped by the destination switch tag, perfect for cable techs.",
      scope: "connections",
      filters: [],
      columns: [
        { field: "fromTag", header: "Device" },
        { field: "fromPort", header: "Device Port" },
        { field: "toPort", header: "Switch Port" },
        { field: "medium" },
        { field: "label", header: "Label" },
      ],
      groupBy: ["toTag"],
      sortBy: [{ field: "toPort", dir: "asc" }],
      formats: ["xlsx", "pdf"],
    }),

    t({
      name: "VLAN Report",
      description: "All IP devices grouped by VLAN — keeps tabs on subnet planning.",
      scope: "devices",
      filters: [{ field: "systemConfig.network.ipAddress", op: "exists" }],
      columns: [
        { field: "tag" },
        { field: "category" },
        { field: "deviceLabel" },
        { field: "systemConfig.network.ipAddress", header: "IP" },
        { field: "systemConfig.network.hostname" },
        { field: "systemConfig.switchPort" },
        { field: "sheetName" },
      ],
      groupBy: ["systemConfig.network.vlan"],
      sortBy: [{ field: "systemConfig.network.ipAddress", dir: "asc" }],
      formats: ["xlsx", "csv"],
    }),

    t({
      name: "Door Schedule",
      description: "Every access-control device: door, reader, lock, REX, controller, credentials.",
      scope: "devices",
      filters: [{ field: "category", op: "eq", value: "access" }],
      columns: [
        { field: "tag" },
        { field: "systemConfig.accessControl.doorName", header: "Door" },
        { field: "systemConfig.accessControl.zone", header: "Zone" },
        { field: "systemConfig.model" },
        { field: "systemConfig.accessControl.protocol", header: "Protocol" },
        { field: "systemConfig.accessControl.relayType", header: "Relay" },
        { field: "systemConfig.accessControl.controllerTag", header: "Controller" },
        { field: "systemConfig.network.ipAddress" },
        { field: "sheetName" },
      ],
      sortBy: [{ field: "systemConfig.accessControl.doorName", dir: "asc" }],
      formats: ["xlsx", "pdf"],
    }),

    t({
      name: "All Devices by Manufacturer",
      description: "Every placed device grouped by manufacturer — quick view for procurement.",
      scope: "devices",
      filters: [],
      columns: [
        { field: "tag" },
        { field: "deviceLabel" },
        { field: "systemConfig.model" },
        { field: "systemConfig.serialNumber" },
        { field: "systemConfig.firmwareVersion" },
        { field: "systemConfig.assetTag" },
        { field: "sheetName" },
      ],
      groupBy: ["systemConfig.manufacturer"],
      sortBy: [{ field: "tag", dir: "asc" }],
      formats: ["xlsx", "csv", "pdf"],
    }),

    t({
      name: "Network Master",
      description: "Flat list of every IP device with full network config — sortable in Excel.",
      scope: "devices",
      filters: [{ field: "systemConfig.network.ipAddress", op: "exists" }],
      columns: [
        { field: "tag" },
        { field: "deviceLabel" },
        { field: "category" },
        { field: "systemConfig.network.ipAddress" },
        { field: "systemConfig.network.macAddress" },
        { field: "systemConfig.network.hostname" },
        { field: "systemConfig.network.subnetMask" },
        { field: "systemConfig.network.gateway" },
        { field: "systemConfig.network.vlan" },
        { field: "systemConfig.network.dhcp", format: "bool" },
        { field: "systemConfig.managementUrl", format: "link" },
        { field: "systemConfig.switchPort" },
      ],
      sortBy: [{ field: "systemConfig.network.ipAddress", dir: "asc" }],
      formats: ["xlsx", "csv", "json"],
    }),

    t({
      name: "Rack Loadout",
      description: "Every U slot in every rack — devices, power, weight totals.",
      scope: "rackPlacements",
      filters: [],
      columns: [
        { field: "rackName", header: "Rack" },
        { field: "uSlot", header: "U" },
        { field: "uHeight", header: "U Height" },
        { field: "deviceLabel", header: "Device" },
        { field: "manufacturer" },
        { field: "model" },
        { field: "powerWatts", header: "Watts" },
        { field: "weightLbs", header: "Lbs" },
        { field: "label", header: "Label Override" },
      ],
      groupBy: ["rackName"],
      sortBy: [{ field: "uSlot", dir: "desc" }],
      formats: ["xlsx", "pdf"],
    }),

    t({
      name: "Port Inventory",
      description: "Every physical port on every device — connected ports show their partner.",
      scope: "ports",
      filters: [],
      columns: [
        { field: "deviceTag", header: "Device" },
        { field: "category" },
        { field: "port.id", header: "Port ID" },
        { field: "port.label", header: "Port" },
        { field: "port.kind", header: "Kind" },
        { field: "port.poe", header: "PoE" },
        { field: "port.speed", header: "Speed" },
        { field: "isConnected", header: "Connected", format: "bool" },
        { field: "connectedTo", header: "To" },
      ],
      groupBy: ["deviceTag"],
      sortBy: [{ field: "deviceTag", dir: "asc" }],
      formats: ["xlsx", "csv"],
    }),
  ];
}
