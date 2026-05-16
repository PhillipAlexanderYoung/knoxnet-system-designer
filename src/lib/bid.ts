import type {
  Project,
  Sheet,
  Markup,
  CableMarkup,
  Rack,
  CatalogOverrides,
  BidLineLaborOverrides,
} from "../store/projectStore";
import { devicesById } from "../data/devices";
import { cablesById } from "../data/cables";
import { rackDevicesById } from "../data/rackDevices";
import { polylineLengthPts, ptsToFeet } from "./geometry";
import { cableDisplayLabel, conduitLabelFor } from "./conduit";
import { cableLengthBreakdown } from "./cableRuns";
import { fiberCompactLabel, fiberStrandCountFor } from "./fiber";
import {
  resolveDeviceCost,
  resolveDeviceLabor,
  resolveCableCost,
  resolveCableLabor,
  resolveRackCost,
  resolveRackLabor,
} from "./pricing";

export interface DeviceLine {
  lineId: string;
  deviceId: string;
  label: string;
  shortCode: string;
  category: string;
  qty: number;
  unitCost: number;
  unitLabor: number;
  extCost: number;
  calculatedLabor: number;
  extLabor: number;
  laborOverridden: boolean;
  laborOverrideHours?: number;
  perSheetCounts: { sheetName: string; qty: number }[];
}

export interface CableLine {
  lineId: string;
  lineKey: string;
  cableId: string;
  label: string;
  shortCode: string;
  fiberStrandCount?: number;
  totalFeet: number; // post-slack
  rawFeet: number; // pre-slack
  costPerFoot: number;
  laborPerFoot: number;
  extCost: number;
  calculatedLabor: number;
  extLabor: number;
  laborOverridden: boolean;
  laborOverrideHours?: number;
  perSheetFeet: { sheetName: string; ft: number; rawFt: number }[];
}

export interface RackLine {
  lineId: string;
  deviceId: string;
  label: string;
  manufacturer: string;
  model: string;
  qty: number;
  uHeight: number;
  unitCost: number;
  unitLabor: number;
  extCost: number;
  calculatedLabor: number;
  extLabor: number;
  laborOverridden: boolean;
  laborOverrideHours?: number;
  perRackCounts: { rackName: string; qty: number }[];
}

export interface BidResult {
  devices: DeviceLine[];
  cables: CableLine[];
  rackDevices: RackLine[];
  totals: {
    materialCost: number;
    laborHours: number;
    laborCost: number;
    overhead: number;
    tax: number;
    margin: number;
    grandTotal: number;
  };
  warnings: string[];
}

export const bidDeviceLineId = (deviceId: string) => `device:${deviceId}`;
export const bidRackDeviceLineId = (deviceId: string) => `rackDevice:${deviceId}`;
export const bidCableLineId = (lineKey: string) => `cable:${lineKey}`;

export function bidCableLineKeyFromMarkup(
  m: Pick<CableMarkup, "cableId" | "conduitType" | "conduitSize" | "fiberStrandCount">,
) {
  const strandCount = fiberStrandCountFor(m, m.cableId);
  return m.cableId === "conduit"
    ? `conduit:${conduitLabelFor(m)}`
    : strandCount
      ? `${m.cableId}:${strandCount}`
      : m.cableId;
}

export function computeBid(project: Project): BidResult {
  const { laborRate, slackPercent, taxRate, overheadPercent, marginPercent } =
    project.bidDefaults;

  const deviceMap = new Map<string, DeviceLine>();
  const cableMap = new Map<string, CableLine>();
  const rackMap = new Map<string, RackLine>();
  const warnings: string[] = [];
  const overrides = project.catalogOverrides;

  for (const sheet of project.sheets) {
    for (const m of sheet.markups) {
      tally(m, sheet, deviceMap, cableMap, slackPercent, warnings, overrides);
    }
  }
  for (const rack of project.racks ?? []) {
    tallyRack(rack, rackMap, overrides);
  }

  const devices = Array.from(deviceMap.values()).sort((a, b) =>
    a.category.localeCompare(b.category) || a.label.localeCompare(b.label),
  );
  const cables = Array.from(cableMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
  const rackDevicesList = Array.from(rackMap.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );

  applyLineLaborOverrides(devices, project.bidLaborOverrides);
  applyLineLaborOverrides(cables, project.bidLaborOverrides);
  applyLineLaborOverrides(rackDevicesList, project.bidLaborOverrides);

  const materialCost =
    devices.reduce((s, l) => s + l.extCost, 0) +
    cables.reduce((s, l) => s + l.extCost, 0) +
    rackDevicesList.reduce((s, l) => s + l.extCost, 0);
  const laborHours =
    devices.reduce((s, l) => s + l.extLabor, 0) +
    cables.reduce((s, l) => s + l.extLabor, 0) +
    rackDevicesList.reduce((s, l) => s + l.extLabor, 0);
  const laborCost = laborHours * laborRate;
  const subtotal = materialCost + laborCost;
  const overhead = subtotal * (overheadPercent / 100);
  const withOverhead = subtotal + overhead;
  const margin = withOverhead * (marginPercent / 100);
  const tax = materialCost * (taxRate / 100);
  const grandTotal = withOverhead + margin + tax;

  return {
    devices,
    cables,
    rackDevices: rackDevicesList,
    totals: {
      materialCost,
      laborHours,
      laborCost,
      overhead,
      tax,
      margin,
      grandTotal,
    },
    warnings,
  };
}

function tallyRack(
  rack: Rack,
  map: Map<string, RackLine>,
  overrides?: CatalogOverrides,
) {
  for (const p of rack.placements) {
    const dev = rackDevicesById[p.deviceId];
    if (!dev) continue;
    const unitCost = resolveRackCost(dev, overrides);
    const unitLabor = resolveRackLabor(dev, overrides);
    const existing = map.get(dev.id) ?? {
      lineId: bidRackDeviceLineId(dev.id),
      deviceId: dev.id,
      label: dev.label,
      manufacturer: dev.manufacturer,
      model: dev.model,
      qty: 0,
      uHeight: dev.uHeight,
      unitCost,
      unitLabor,
      extCost: 0,
      calculatedLabor: 0,
      extLabor: 0,
      laborOverridden: false,
      perRackCounts: [],
    };
    const cost = p.costOverride ?? unitCost;
    existing.qty += 1;
    existing.extCost += cost;
    existing.calculatedLabor += unitLabor;
    existing.extLabor += unitLabor;
    const re = existing.perRackCounts.find((r) => r.rackName === rack.name);
    if (re) re.qty += 1;
    else existing.perRackCounts.push({ rackName: rack.name, qty: 1 });
    map.set(dev.id, existing);
  }
}

function tally(
  m: Markup,
  sheet: Sheet,
  deviceMap: Map<string, DeviceLine>,
  cableMap: Map<string, CableLine>,
  defaultSlack: number,
  warnings: string[],
  overrides?: CatalogOverrides,
) {
  if (m.kind === "device") {
    const dev = devicesById[m.deviceId];
    if (!dev) return;
    const unitCost = resolveDeviceCost(dev, overrides);
    const unitLabor = resolveDeviceLabor(dev, overrides);
    const existing = deviceMap.get(m.deviceId) ?? {
      lineId: bidDeviceLineId(m.deviceId),
      deviceId: m.deviceId,
      label: dev.label,
      shortCode: dev.shortCode,
      category: dev.category,
      qty: 0,
      unitCost,
      unitLabor,
      extCost: 0,
      calculatedLabor: 0,
      extLabor: 0,
      laborOverridden: false,
      perSheetCounts: [],
    };
    const cost = m.costOverride ?? unitCost;
    existing.qty += 1;
    existing.extCost += cost;
    existing.calculatedLabor += unitLabor;
    existing.extLabor += unitLabor;
    const sheetEntry = existing.perSheetCounts.find((p) => p.sheetName === sheetLabel(sheet));
    if (sheetEntry) sheetEntry.qty += 1;
    else existing.perSheetCounts.push({ sheetName: sheetLabel(sheet), qty: 1 });
    deviceMap.set(m.deviceId, existing);
    return;
  }

  if (m.kind === "cable") {
    const cab = cablesById[m.cableId];
    if (!cab) return;
    const lenPts = polylineLengthPts(m.points);
    const ft = ptsToFeet(lenPts, sheet.calibration);
    if (ft === null) {
      warnings.push(
        `Cable run on sheet "${sheetLabel(sheet)}" has no length — sheet is not calibrated.`,
      );
      return;
    }
    const length = cableLengthBreakdown(m, sheet.calibration, defaultSlack);
    if (!length) return;
    const rawFt = length.totalRawFt;
    const adjusted = length.totalWithSlackFt;
    const cpf = resolveCableCost(cab, overrides);
    const lpf = resolveCableLabor(cab, overrides);
    const strandCount = fiberStrandCountFor(m, m.cableId);
    const cableKey = bidCableLineKeyFromMarkup(m);
    const label = cableDisplayLabel(m.cableId, cab.label, m);
    const existing = cableMap.get(cableKey) ?? {
      lineId: bidCableLineId(cableKey),
      lineKey: cableKey,
      cableId: m.cableId,
      label,
      shortCode: m.cableId === "conduit" ? label : fiberCompactLabel(m.cableId, cab.shortCode, m),
      fiberStrandCount: strandCount,
      totalFeet: 0,
      rawFeet: 0,
      costPerFoot: cpf,
      laborPerFoot: lpf,
      extCost: 0,
      calculatedLabor: 0,
      extLabor: 0,
      laborOverridden: false,
      perSheetFeet: [],
    };
    existing.totalFeet += adjusted;
    existing.rawFeet += rawFt;
    existing.extCost += adjusted * cpf;
    existing.calculatedLabor += adjusted * lpf;
    existing.extLabor += adjusted * lpf;
    const sheetEntry = existing.perSheetFeet.find((p) => p.sheetName === sheetLabel(sheet));
    if (sheetEntry) {
      sheetEntry.ft += adjusted;
      sheetEntry.rawFt += rawFt;
    } else {
      existing.perSheetFeet.push({ sheetName: sheetLabel(sheet), ft: adjusted, rawFt });
    }
    cableMap.set(cableKey, existing);
  }
}

function applyLineLaborOverrides<
  T extends {
    lineId: string;
    extLabor: number;
    calculatedLabor: number;
    laborOverridden: boolean;
    laborOverrideHours?: number;
  },
>(lines: T[], overrides?: BidLineLaborOverrides) {
  if (!overrides) return;
  for (const line of lines) {
    const override = overrides[line.lineId]?.laborHours;
    if (!Number.isFinite(override) || override < 0) continue;
    line.extLabor = override;
    line.laborOverrideHours = override;
    line.laborOverridden = true;
  }
}

function sheetLabel(s: Sheet) {
  return s.sheetNumber ? `${s.sheetNumber} ${s.sheetTitle ?? s.name}` : s.name;
}

export const usd = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
