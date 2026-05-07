// Pricing resolver — single source of truth for "what is THIS catalog item
// priced at given the project's overrides?". Used by the bid engine, the
// pricing UI, and the exporters.

import { devicesById, type DeviceType } from "../data/devices";
import { cablesById, type CableType } from "../data/cables";
import { rackDevicesById, type RackDeviceType } from "../data/rackDevices";
import type { CatalogOverrides, Project } from "../store/projectStore";

export function resolveDeviceCost(d: DeviceType, overrides?: CatalogOverrides) {
  return overrides?.devices?.[d.id]?.cost ?? d.defaultCost;
}
export function resolveDeviceLabor(d: DeviceType, overrides?: CatalogOverrides) {
  return overrides?.devices?.[d.id]?.labor ?? d.laborHours;
}

export function resolveCableCost(c: CableType, overrides?: CatalogOverrides) {
  return overrides?.cables?.[c.id]?.costPerFoot ?? c.costPerFoot;
}
export function resolveCableLabor(c: CableType, overrides?: CatalogOverrides) {
  return overrides?.cables?.[c.id]?.laborPerFoot ?? c.laborPerFoot;
}

export function resolveRackCost(d: RackDeviceType, overrides?: CatalogOverrides) {
  return overrides?.rackDevices?.[d.id]?.cost ?? d.defaultCost;
}
export function resolveRackLabor(d: RackDeviceType, overrides?: CatalogOverrides) {
  return overrides?.rackDevices?.[d.id]?.labor ?? d.laborHours;
}

/** Convenience: compute the per-instance cost of a placed device markup */
export function deviceInstanceCost(
  deviceId: string,
  costOverride: number | undefined,
  overrides?: CatalogOverrides,
): number {
  const dev = devicesById[deviceId];
  if (!dev) return costOverride ?? 0;
  return costOverride ?? resolveDeviceCost(dev, overrides);
}

/** Convenience: compute the per-foot cost of a cable run */
export function cableLineCost(
  cableId: string,
  feet: number,
  overrides?: CatalogOverrides,
): number {
  const cab = cablesById[cableId];
  if (!cab) return 0;
  return feet * resolveCableCost(cab, overrides);
}

/** Convenience: compute the cost of a rack placement */
export function rackPlacementCost(
  rackDeviceId: string,
  costOverride: number | undefined,
  overrides?: CatalogOverrides,
): number {
  const dev = rackDevicesById[rackDeviceId];
  if (!dev) return costOverride ?? 0;
  return costOverride ?? resolveRackCost(dev, overrides);
}

/** Quick stat: # of items in the catalog the user has re-priced */
export function overrideStats(p: Project | null) {
  if (!p?.catalogOverrides) return { devices: 0, cables: 0, rackDevices: 0, total: 0 };
  const o = p.catalogOverrides;
  const d = Object.keys(o.devices).length;
  const c = Object.keys(o.cables).length;
  const r = Object.keys(o.rackDevices).length;
  return { devices: d, cables: c, rackDevices: r, total: d + c + r };
}
