/**
 * XLSX serializer. When the report has no groupBy, output is a single
 * worksheet named after the report. When grouped, output is one
 * worksheet per group key (sheet names limited to 31 chars per the
 * XLSX spec); the first sheet "Summary" carries a group-size rollup.
 */

import * as XLSX from "xlsx";
import type { ReportResult } from "../engine";
import { formatCell } from "../engine";
import { getByPath } from "../paths";

function safeSheetName(name: string): string {
  // XLSX disallows several characters and caps at 31 chars.
  return (
    name
      .replace(/[\\\/?*\[\]:]/g, "_")
      .slice(0, 31) || "Sheet"
  );
}

export function reportToXlsxBuffer(result: ReportResult): Uint8Array {
  const wb = XLSX.utils.book_new();
  const headers = result.columns.map((c) => c.header);

  if (result.meta.template.groupBy && result.meta.template.groupBy.length > 0) {
    // Summary sheet — group key + row count
    const sumRows: Array<Array<string | number>> = [
      [...result.meta.template.groupBy, "Rows"],
    ];
    for (const g of result.groups) {
      sumRows.push([...g.key, g.rows.length]);
    }
    const sumWs = XLSX.utils.aoa_to_sheet(sumRows);
    XLSX.utils.book_append_sheet(wb, sumWs, "Summary");

    for (const g of result.groups) {
      const sheetName = safeSheetName(g.key.join(" - ") || "All");
      const rows: Array<Array<string>> = [headers];
      for (const row of g.rows) {
        rows.push(
          result.columns.map((c) =>
            formatCell(getByPath(row, c.field), c.format),
          ),
        );
      }
      const ws = XLSX.utils.aoa_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    }
  } else {
    const rows: Array<Array<string>> = [headers];
    for (const g of result.groups) {
      for (const row of g.rows) {
        rows.push(
          result.columns.map((c) =>
            formatCell(getByPath(row, c.field), c.format),
          ),
        );
      }
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(
      wb,
      ws,
      safeSheetName(result.meta.template.name || "Report"),
    );
  }

  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  return new Uint8Array(buf);
}
