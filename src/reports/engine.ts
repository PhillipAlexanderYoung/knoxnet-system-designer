/**
 * Pure report engine. Given a Project and a ReportTemplate, produces
 * a ReportResult — columns + grouped rows ready to feed into any
 * format module (CSV, XLSX, PDF, etc.).
 *
 * Pipeline:
 *   1. selectEntities(project, scope) — flatten the scope's domain
 *      objects into a list of "row records" with all queryable fields
 *      surfaced as dotted-path readable values.
 *   2. applyFilters(rows, filters) — keep rows that pass every filter
 *      predicate (AND across filters).
 *   3. sortRows(rows, sortBy) — stable multi-key sort.
 *   4. groupRows(rows, groupBy) — bucket into groups, one bucket per
 *      unique groupBy-tuple. Single ungrouped bucket when groupBy is
 *      empty so format code can treat both shapes uniformly.
 *   5. resolveColumns(template, scope) — fill in default headers from
 *      the field catalog.
 *
 * The engine is dependency-free (TypeScript only). Tests live in
 * tests/reports.engine.test.ts.
 */

import type {
  CableMarkup,
  DeviceConnection,
  DeviceMarkup,
  Project,
  Rack,
  ReportColumn,
  ReportFilter,
  ReportScope,
  ReportTemplate,
  Sheet,
} from "../store/projectStore";
import { devicesById, effectiveDevicePorts } from "../data/devices";
import { cablesById } from "../data/cables";
import { cableDisplayLabel } from "../lib/conduit";
import { cableLengthBreakdown, carriedByConduits, runCountFor } from "../lib/cableRuns";
import { fiberStrandCountFor } from "../lib/fiber";
import {
  deviceDisplayName,
  isContainerDevice,
  nestedChildren,
  nestedConnectionSummary,
  nestedScheduleTitle,
} from "../lib/nesting";
import { rackDevicesById } from "../data/rackDevices";
import { fieldLabel } from "./fieldCatalog";
import { coerceCell, getByPath } from "./paths";

// ───────── Row + result types ─────────

export type Row = Record<string, unknown>;

export interface ReportGroup {
  /** Composite group key, e.g. `["SW-01", "VLAN 10"]`. Empty for the
   *  single ungrouped bucket. */
  key: string[];
  rows: Row[];
}

export interface ReportColumnResolved {
  field: string;
  header: string;
  width?: number;
  format?: ReportColumn["format"];
}

export interface ReportResult {
  scope: ReportScope;
  columns: ReportColumnResolved[];
  groups: ReportGroup[];
  /** Flat row count across every group — handy for headers. */
  rowCount: number;
  /** Filter / scope-related context for non-tabular outputs. */
  meta: {
    template: ReportTemplate;
    projectName: string;
    generatedAt: string;
  };
}

// ───────── 1. Scope flatteners ─────────

function deviceCountForTag(project: Project, tag: string): number {
  return (project.connections ?? []).filter(
    (c) => c.fromTag === tag || c.toTag === tag,
  ).length;
}

function selectDevices(project: Project): Row[] {
  const rows: Row[] = [];
  for (const sheet of project.sheets) {
    for (const m of sheet.markups) {
      if (m.kind !== "device") continue;
      const dev = m as DeviceMarkup;
      const catalog = devicesById[dev.deviceId];
      const parent = dev.parentId
        ? sheet.markups.find(
            (candidate): candidate is DeviceMarkup =>
              candidate.kind === "device" && candidate.id === dev.parentId,
          )
        : null;
      const children = nestedChildren(sheet.markups, dev.id);
      rows.push({
        ...dev,
        deviceLabel: catalog?.label ?? dev.deviceId,
        shortCode: catalog?.shortCode ?? "",
        sheetName: sheet.name,
        sheetId: sheet.id,
        connectionCount: deviceCountForTag(project, dev.tag),
        parentTag: parent?.tag ?? "",
        parentLabel: parent ? deviceDisplayName(parent) : "",
        nestedDeviceCount: children.length,
        nestedDevices: children.map(deviceDisplayName).join(", "),
      });
    }
  }
  return rows;
}

function selectCables(project: Project): Row[] {
  const rows: Row[] = [];
  for (const sheet of project.sheets) {
    for (const m of sheet.markups) {
      if (m.kind !== "cable") continue;
      const cab = m as CableMarkup;
      const cat = cablesById[cab.cableId];
      const pxPerFt = sheet.calibration?.pixelsPerFoot ?? 0;
      // Approximate polyline length — sums segment lengths in PDF user
      // units, converted to feet via calibration. Matches the cable
      // schedule's costing math.
      let pxLen = 0;
      for (let i = 0; i + 3 < cab.points.length; i += 2) {
        const dx = cab.points[i + 2] - cab.points[i];
        const dy = cab.points[i + 3] - cab.points[i + 1];
        pxLen += Math.hypot(dx, dy);
      }
      const ft = pxPerFt > 0 ? pxLen / pxPerFt : 0;
      const slack = cab.slackPercent ?? project.bidDefaults?.slackPercent ?? 0;
      const runCount = runCountFor(cab);
      const fiberStrandCount = fiberStrandCountFor(cab, cab.cableId);
      const length = cableLengthBreakdown(cab, sheet.calibration, slack);
      const carriedBy = carriedByConduits(sheet, cab);
      rows.push({
        ...cab,
        physicalLabel: cab.physicalLabel ?? "",
        runCount,
        fiberStrandCount,
        cableLabel: cat ? cableDisplayLabel(cab.cableId, cat.label, cab) : cab.cableId,
        sheetName: sheet.name,
        sheetId: sheet.id,
        serviceLoopFt: length ? +length.totalServiceLoopFt.toFixed(2) : 0,
        lengthFt: length ? +length.totalRawFt.toFixed(2) : +(ft * runCount).toFixed(2),
        lengthFtWithSlack: length
          ? +length.totalWithSlackFt.toFixed(2)
          : +(ft * (1 + slack / 100) * runCount).toFixed(2),
        carriedByConduit: carriedBy.map((c) => c.endpointA || c.endpointB || c.id).join(", "),
      });
    }
  }
  return rows;
}

function selectConnections(project: Project): Row[] {
  const rows: Row[] = [];
  for (const c of project.connections ?? []) {
    rows.push({ ...c });
  }
  return rows;
}

function selectAreaSchedules(project: Project): Row[] {
  const rows: Row[] = [];
  const connections = project.connections ?? [];
  for (const sheet of project.sheets) {
    for (const m of sheet.markups) {
      if (m.kind !== "device" || !isContainerDevice(m)) continue;
      const children = nestedChildren(sheet.markups, m.id);
      for (const child of children) {
        const catalog = devicesById[child.deviceId];
        rows.push({
          areaId: m.id,
          areaTag: m.tag,
          areaName: nestedScheduleTitle(m),
          areaLabel: deviceDisplayName(m),
          sheetName: sheet.name,
          sheetId: sheet.id,
          deviceTag: child.tag,
          deviceLabel: catalog?.label ?? child.deviceId,
          deviceName: deviceDisplayName(child),
          category: child.category,
          connectionCount: deviceCountForTag(project, child.tag),
          connections: nestedConnectionSummary(connections, child.tag),
        });
      }
    }
  }
  return rows;
}

function selectRacks(project: Project): Row[] {
  const rows: Row[] = [];
  for (const r of project.racks ?? []) {
    rows.push({ ...r, placementCount: r.placements.length });
  }
  return rows;
}

function selectRackPlacements(project: Project): Row[] {
  const rows: Row[] = [];
  for (const r of project.racks ?? []) {
    for (const p of r.placements) {
      const cat = rackDevicesById[p.deviceId];
      rows.push({
        ...p,
        rackName: r.name,
        rackId: r.id,
        deviceLabel: cat?.label ?? p.deviceId,
        manufacturer: cat?.manufacturer,
        model: cat?.model,
        powerWatts: cat?.powerWatts,
        weightLbs: cat?.weightLbs,
        uHeight: cat?.uHeight,
      });
    }
  }
  return rows;
}

function selectSheets(project: Project): Row[] {
  const rows: Row[] = [];
  for (const sh of project.sheets as Sheet[]) {
    rows.push({
      ...sh,
      markupCount: sh.markups.length,
      deviceCount: sh.markups.filter((m) => m.kind === "device").length,
      sourceKind: sh.source?.kind ?? (sh.pdfBytes ? "pdf" : "unknown"),
      isCalibrated: !!sh.calibration,
    });
  }
  return rows;
}

function selectPorts(project: Project): Row[] {
  // Flatten every device-port pairing. Each device produces N rows,
  // one per declared port. Useful for "every port on every switch /
  // controller" style reports.
  const rows: Row[] = [];
  const conns = project.connections ?? [];
  for (const sheet of project.sheets) {
    for (const m of sheet.markups) {
      if (m.kind !== "device") continue;
      const dev = m as DeviceMarkup;
      const ports = effectiveDevicePorts(dev.deviceId, dev.instancePorts);
      if (!ports || ports.length === 0) continue;
      const catalog = devicesById[dev.deviceId];
      for (const port of ports) {
        const link = conns.find(
          (c) =>
            (c.fromTag === dev.tag && c.fromPortId === port.id) ||
            (c.toTag === dev.tag && c.toPortId === port.id),
        );
        const other = link
          ? link.fromTag === dev.tag
            ? link.toTag
            : link.fromTag
          : "";
        rows.push({
          deviceTag: dev.tag,
          deviceLabel: catalog?.label ?? dev.deviceId,
          category: dev.category,
          sheetName: sheet.name,
          port,
          isConnected: !!link,
          connectedTo: other,
        });
      }
    }
  }
  return rows;
}

export function selectEntities(project: Project, scope: ReportScope): Row[] {
  switch (scope) {
    case "devices":
      return selectDevices(project);
    case "cables":
      return selectCables(project);
    case "connections":
      return selectConnections(project);
    case "areaSchedules":
      return selectAreaSchedules(project);
    case "racks":
      return selectRacks(project);
    case "rackPlacements":
      return selectRackPlacements(project);
    case "sheets":
      return selectSheets(project);
    case "ports":
      return selectPorts(project);
  }
}

// ───────── 2. Filter predicates ─────────

function applyFilter(row: Row, filter: ReportFilter): boolean {
  const v = getByPath(row, filter.field);
  switch (filter.op) {
    case "eq":
      return v === filter.value;
    case "neq":
      return v !== filter.value;
    case "in": {
      const list = Array.isArray(filter.value) ? filter.value : [filter.value];
      return list.includes(v as unknown);
    }
    case "contains": {
      const s = coerceCell(v).toLowerCase();
      return s.includes(coerceCell(filter.value).toLowerCase());
    }
    case "startsWith": {
      const s = coerceCell(v).toLowerCase();
      return s.startsWith(coerceCell(filter.value).toLowerCase());
    }
    case "gte":
      return typeof v === "number" && v >= Number(filter.value);
    case "lte":
      return typeof v === "number" && v <= Number(filter.value);
    case "exists":
      return v != null && v !== "";
    case "missing":
      return v == null || v === "";
    case "regex": {
      try {
        const re = new RegExp(String(filter.value));
        return re.test(coerceCell(v));
      } catch {
        return false;
      }
    }
  }
}

export function applyFilters(rows: Row[], filters: ReportFilter[]): Row[] {
  if (!filters.length) return rows;
  return rows.filter((row) => filters.every((f) => applyFilter(row, f)));
}

// ───────── 3. Sort ─────────

export function sortRows(
  rows: Row[],
  sortBy: Array<{ field: string; dir: "asc" | "desc" }> | undefined,
): Row[] {
  if (!sortBy || sortBy.length === 0) return rows;
  // Wrap the array so we don't mutate the caller's reference; stable
  // sort across keys.
  const copy = rows.slice();
  copy.sort((a, b) => {
    for (const { field, dir } of sortBy) {
      const av = getByPath(a, field);
      const bv = getByPath(b, field);
      const cmp = compareValues(av, bv);
      if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
    }
    return 0;
  });
  return copy;
}

function compareValues(a: unknown, b: unknown): number {
  // null/undefined sort last so empty rows don't crowd the top.
  const aNil = a == null || a === "";
  const bNil = b == null || b === "";
  if (aNil && bNil) return 0;
  if (aNil) return 1;
  if (bNil) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

// ───────── 4. Grouping ─────────

export function groupRows(rows: Row[], groupBy: string[] | undefined): ReportGroup[] {
  if (!groupBy || groupBy.length === 0) {
    return [{ key: [], rows }];
  }
  const bucket = new Map<string, ReportGroup>();
  for (const row of rows) {
    const keyParts = groupBy.map((g) => coerceCell(getByPath(row, g)));
    const k = keyParts.join("\u0001"); // unprintable separator
    const existing = bucket.get(k);
    if (existing) {
      existing.rows.push(row);
    } else {
      bucket.set(k, { key: keyParts, rows: [row] });
    }
  }
  // Sort groups by key for stable output across runs.
  return Array.from(bucket.values()).sort((a, b) =>
    a.key.join("\u0001").localeCompare(b.key.join("\u0001"), undefined, {
      numeric: true,
    }),
  );
}

// ───────── 5. Columns ─────────

export function resolveColumns(
  template: ReportTemplate,
): ReportColumnResolved[] {
  return template.columns.map((c) => ({
    field: c.field,
    header: c.header ?? fieldLabel(template.scope, c.field),
    width: c.width,
    format: c.format,
  }));
}

// ───────── Top-level run ─────────

export function runReport(project: Project, template: ReportTemplate): ReportResult {
  const rawRows = selectEntities(project, template.scope);
  const filtered = applyFilters(rawRows, template.filters);
  const sorted = sortRows(filtered, template.sortBy);
  const groups = groupRows(sorted, template.groupBy);
  const columns = resolveColumns(template);
  const rowCount = groups.reduce((s, g) => s + g.rows.length, 0);
  return {
    scope: template.scope,
    columns,
    groups,
    rowCount,
    meta: {
      template,
      projectName: project.meta.projectName,
      generatedAt: new Date().toISOString(),
    },
  };
}

/** Format a cell value for tabular outputs. Driven by the column's
 *  `format` hint, falling back to `coerceCell` for anything generic. */
export function formatCell(value: unknown, format: ReportColumn["format"]): string {
  if (value == null) return "";
  switch (format) {
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? String(value)
        : coerceCell(value);
    case "bool":
      return value ? "Yes" : "No";
    case "date": {
      const d = value instanceof Date ? value : new Date(String(value));
      if (Number.isNaN(d.getTime())) return coerceCell(value);
      return d.toISOString().slice(0, 10);
    }
    case "ip":
    case "mac":
    case "link":
    case "text":
    default:
      return coerceCell(value);
  }
}
