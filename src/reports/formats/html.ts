/**
 * Standalone print-ready HTML output. A single self-contained file
 * with inline CSS so the user can open it in any browser, print to
 * PDF, or share without worrying about external stylesheets. The
 * layout matches the brand chrome roughly so the output reads as
 * "a KnoxNet report" rather than a raw table.
 */

import type { ReportResult } from "../engine";
import { formatCell } from "../engine";
import { getByPath } from "../paths";
import { SCOPE_LABEL } from "../fieldCatalog";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const STYLES = `
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    margin: 0;
    background: #fafafa;
    color: #0B1220;
  }
  .page { max-width: 1100px; margin: 0 auto; padding: 48px 32px; }
  header { border-bottom: 2px solid #F4B740; padding-bottom: 16px; margin-bottom: 24px; }
  h1 { margin: 0 0 4px; font-size: 28px; font-weight: 600; letter-spacing: -0.01em; }
  .meta { color: #5E6B85; font-size: 13px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
  .desc { margin: 12px 0 0; color: #1B2433; max-width: 700px; }
  h2 { font-size: 16px; margin: 32px 0 12px; color: #1B2433; letter-spacing: -0.005em; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 13px; background: #ffffff; border: 1px solid #e5e7eb; }
  th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid #e5e7eb; vertical-align: top; }
  th { background: #f5f7fa; font-weight: 600; color: #1B2433; font-size: 12px; letter-spacing: 0.02em; text-transform: uppercase; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #fafbfc; }
  footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #5E6B85; font-size: 12px; font-family: ui-monospace, monospace; display: flex; justify-content: space-between; }
  @media print { body { background: #ffffff; } .page { padding: 16px; } header { page-break-after: avoid; } h2 { page-break-after: avoid; } tr { page-break-inside: avoid; } }
`;

export function reportToHtml(result: ReportResult): string {
  const title = result.meta.template.name || "Report";
  const headerCells = result.columns
    .map((c) => `<th>${escapeHtml(c.header)}</th>`)
    .join("");

  const groupSections: string[] = [];
  for (const group of result.groups) {
    let section = "";
    if (group.key.length > 0) {
      section += `<h2>${escapeHtml(group.key.join(" · "))}</h2>`;
    }
    section += `<table><thead><tr>${headerCells}</tr></thead><tbody>`;
    for (const row of group.rows) {
      const cells = result.columns
        .map((c) => {
          const v = formatCell(getByPath(row, c.field), c.format);
          if (c.format === "link" && v.startsWith("http")) {
            return `<td><a href="${escapeHtml(v)}">${escapeHtml(v)}</a></td>`;
          }
          return `<td>${escapeHtml(v)}</td>`;
        })
        .join("");
      section += `<tr>${cells}</tr>`;
    }
    section += "</tbody></table>";
    groupSections.push(section);
  }

  const desc = result.meta.template.description
    ? `<p class="desc">${escapeHtml(result.meta.template.description)}</p>`
    : "";
  const footer = result.meta.template.branding?.footer ?? "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — ${escapeHtml(result.meta.projectName)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <div class="page">
    <header>
      <h1>${escapeHtml(title)}</h1>
      <div class="meta">
        ${escapeHtml(result.meta.projectName)} · ${escapeHtml(SCOPE_LABEL[result.scope])} ·
        ${result.rowCount} row${result.rowCount === 1 ? "" : "s"} ·
        generated ${escapeHtml(result.meta.generatedAt.slice(0, 19).replace("T", " "))}
      </div>
      ${desc}
    </header>
    ${groupSections.join("\n")}
    <footer>
      <span>${escapeHtml(footer)}</span>
      <span>KnoxNet System Designer · Custom Report</span>
    </footer>
  </div>
</body>
</html>
`;
}
