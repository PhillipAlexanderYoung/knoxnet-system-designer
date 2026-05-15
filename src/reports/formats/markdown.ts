/**
 * GitHub-flavored Markdown table output. Renders one table per group;
 * when ungrouped, a single table with the report title + meta line up
 * top. Cell content has the pipe character escaped as `\|` so cells
 * with pipes survive the round-trip.
 */

import type { ReportResult } from "../engine";
import { formatCell } from "../engine";
import { getByPath } from "../paths";
import { SCOPE_LABEL } from "../fieldCatalog";

function escapeCell(s: string): string {
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

export function reportToMarkdown(result: ReportResult): string {
  const title = result.meta.template.name || "Report";
  const lines: string[] = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push(
    `_Scope: ${SCOPE_LABEL[result.scope]} · ${result.rowCount} row${result.rowCount === 1 ? "" : "s"} · generated ${result.meta.generatedAt.slice(0, 19).replace("T", " ")}_`,
  );
  if (result.meta.template.description) {
    lines.push("");
    lines.push(result.meta.template.description);
  }
  lines.push("");

  for (const group of result.groups) {
    if (group.key.length > 0) {
      lines.push(`## ${group.key.join(" · ")}`);
      lines.push("");
    }
    const header = `| ${result.columns.map((c) => escapeCell(c.header)).join(" | ")} |`;
    const sep = `| ${result.columns.map(() => "---").join(" | ")} |`;
    lines.push(header, sep);
    for (const row of group.rows) {
      const cells = result.columns.map((c) =>
        escapeCell(formatCell(getByPath(row, c.field), c.format)),
      );
      lines.push(`| ${cells.join(" | ")} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
