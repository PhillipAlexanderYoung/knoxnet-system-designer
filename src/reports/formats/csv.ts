/**
 * RFC 4180 CSV serializer. Handles quoting + escaping for commas,
 * quotes, and newlines. When the report has groups, group keys are
 * emitted as a leading column so the user sees grouping in the file
 * even when their spreadsheet tool ignores blank-row separators.
 */

import type { ReportResult } from "../engine";
import { formatCell } from "../engine";
import { getByPath } from "../paths";

function csvCell(value: string): string {
  if (value === "") return "";
  // Quote if the value contains any of the special chars, doubling
  // any embedded quotes per the RFC.
  if (/[",\r\n]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

export function reportToCsv(result: ReportResult): string {
  const groupHeaders = result.meta.template.groupBy ?? [];
  const groupCols = groupHeaders.map((g) => `Group: ${g}`);
  const headers = [...groupCols, ...result.columns.map((c) => c.header)];
  const lines: string[] = [headers.map(csvCell).join(",")];
  for (const group of result.groups) {
    for (const row of group.rows) {
      const cells: string[] = [];
      for (const key of group.key) cells.push(csvCell(key));
      for (const col of result.columns) {
        cells.push(csvCell(formatCell(getByPath(row, col.field), col.format)));
      }
      lines.push(cells.join(","));
    }
  }
  return lines.join("\r\n");
}
