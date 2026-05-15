/**
 * Top-level "run report and download" helper. Picks the right format
 * module for each requested format, triggers a browser download per
 * format. Centralised here so the UI doesn't have to know about
 * per-format mime types / extensions / blob assembly.
 */

import type { Project, ReportFormat, ReportTemplate } from "../store/projectStore";
import { runReport, type ReportResult } from "./engine";
import { reportToCsv } from "./formats/csv";
import { reportToJson } from "./formats/json";
import { reportToMarkdown } from "./formats/markdown";
import { reportToHtml } from "./formats/html";
import { reportToXlsxBuffer } from "./formats/xlsx";
import { reportToPdfBytes } from "./formats/pdf";

function safeName(name: string): string {
  return (name || "report").replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 60);
}

function downloadBlob(content: Blob, filename: string) {
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface RunReportOptions {
  /** Override the template's `formats` for a one-shot export. */
  formats?: ReportFormat[];
}

/**
 * Run the template against the project, then download one file per
 * requested format. Returns the in-memory `ReportResult` so callers
 * that want to render a preview don't have to run the engine twice.
 */
export async function runAndDownload(
  project: Project,
  template: ReportTemplate,
  options: RunReportOptions = {},
): Promise<ReportResult> {
  const result = runReport(project, template);
  const formats = options.formats ?? template.formats;
  const base = safeName(template.name);
  for (const fmt of formats) {
    try {
      await emitFormat(result, fmt, base);
    } catch (e) {
      console.error(`[reports] failed to emit ${fmt}:`, e);
    }
  }
  return result;
}

async function emitFormat(result: ReportResult, fmt: ReportFormat, base: string) {
  switch (fmt) {
    case "csv":
      downloadBlob(new Blob([reportToCsv(result)], { type: "text/csv" }), `${base}.csv`);
      return;
    case "json":
      downloadBlob(
        new Blob([reportToJson(result)], { type: "application/json" }),
        `${base}.json`,
      );
      return;
    case "md":
      downloadBlob(
        new Blob([reportToMarkdown(result)], { type: "text/markdown" }),
        `${base}.md`,
      );
      return;
    case "html":
      downloadBlob(new Blob([reportToHtml(result)], { type: "text/html" }), `${base}.html`);
      return;
    case "xlsx": {
      const buf = reportToXlsxBuffer(result);
      // Re-wrap as a fresh Uint8Array so the Blob constructor's typed
      // signature is happy across TS lib targets (the SharedArrayBuffer
      // vs ArrayBuffer distinction trips the strict overload).
      downloadBlob(
        new Blob([new Uint8Array(buf)], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
        `${base}.xlsx`,
      );
      return;
    }
    case "pdf": {
      const bytes = await reportToPdfBytes(result);
      downloadBlob(
        new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
        `${base}.pdf`,
      );
      return;
    }
  }
}

export { runReport };
