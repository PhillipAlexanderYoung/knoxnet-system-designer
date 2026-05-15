/**
 * JSON output. Two shapes:
 *   - "flat" (default): a single array of row objects, with all
 *     requested columns projected into top-level keys. Best for
 *     piping into another tool.
 *   - "grouped": preserves the group structure as
 *     `{ key: [...], rows: [...] }[]`. Useful when you actually need
 *     the grouping downstream (e.g. a custom dashboard).
 */

import type { ReportResult } from "../engine";
import { getByPath } from "../paths";

export interface JsonOptions {
  shape?: "flat" | "grouped";
  pretty?: boolean;
}

export function reportToJson(
  result: ReportResult,
  opts: JsonOptions = {},
): string {
  const shape = opts.shape ?? "flat";
  const pretty = opts.pretty ?? true;
  const project = (row: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const col of result.columns) {
      out[col.header] = getByPath(row, col.field);
    }
    return out;
  };
  if (shape === "grouped") {
    const groups = result.groups.map((g) => ({
      key: g.key,
      rows: g.rows.map(project),
    }));
    return JSON.stringify(
      {
        scope: result.scope,
        rowCount: result.rowCount,
        generatedAt: result.meta.generatedAt,
        groupBy: result.meta.template.groupBy ?? [],
        groups,
      },
      null,
      pretty ? 2 : 0,
    );
  }
  const flat: Array<Record<string, unknown>> = [];
  for (const g of result.groups) {
    for (const row of g.rows) flat.push(project(row));
  }
  return JSON.stringify(flat, null, pretty ? 2 : 0);
}
