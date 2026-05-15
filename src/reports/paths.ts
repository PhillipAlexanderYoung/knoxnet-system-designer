/**
 * Dotted-path getter for nested entity fields.
 *
 * Report templates address fields by string path (e.g.
 * "systemConfig.network.ipAddress") so the column picker UI and saved
 * templates can name any field without TS types leaking into the
 * persistence format. This module is the single place that converts
 * "a.b.c" → entity.a.b.c so behavior is consistent across the engine,
 * filters, and formatters.
 *
 * Conventions:
 *   - Missing/empty intermediate segments return `undefined` (never throw).
 *   - Array segments are dereferenced via numeric indexes: "ports.0.id".
 *   - Returned values are passed through `as-is`; format helpers
 *     coerce to strings on display.
 */

export type EntityRecord = Record<string, unknown>;

export function getByPath(obj: unknown, path: string): unknown {
  if (obj == null) return undefined;
  if (!path) return obj;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/** Best-effort cell value coercion for tabular output. Dates become ISO
 *  strings, booleans become "true"/"false", null/undefined become
 *  empty string, objects fall back to JSON. */
export function coerceCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value.map((v) => coerceCell(v)).filter(Boolean).join(", ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
}
