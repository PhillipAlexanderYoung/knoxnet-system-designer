/**
 * Branded PDF report. Uses pdf-lib (already in tree) to lay out a
 * cover header + tables grouped per page. Stays deliberately
 * minimal — focus is "readable rows" not "pixel-perfect art". The
 * existing markup PDF exporter still handles brand-heavy outputs.
 *
 * Layout:
 *   - Page size: Letter landscape (792×612 PDF points). Plenty of
 *     horizontal room for wide column lists.
 *   - Header band on every page: report title + project name + page #.
 *   - Tables flow naturally; new page when the current y dips below
 *     the bottom margin.
 *   - Group keys render as a sub-heading at the start of each group.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { ReportResult } from "../engine";
import { formatCell } from "../engine";
import { getByPath } from "../paths";
import { SCOPE_LABEL } from "../fieldCatalog";

const PAGE_W = 792; // Letter landscape
const PAGE_H = 612;
const MARGIN_X = 36;
const HEADER_Y = PAGE_H - 36;
const FOOTER_Y = 24;
const ROW_H = 16;
const HEADER_ROW_H = 18;
const FONT_SIZE = 9;
const HEADER_FONT_SIZE = 9;

interface DrawState {
  doc: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  y: number;
  pageNumber: number;
  totalPagesEstimate: number;
}

function safeAsciiText(s: string): string {
  // pdf-lib's StandardFonts only encode WinAnsi; strip the rest so
  // the renderer doesn't throw on tag glyphs (e.g. em-dashes).
  return s.replace(/[^\x20-\x7E]/g, "?");
}

function clipCell(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}

function colWidths(result: ReportResult, totalWidth: number): number[] {
  // Distribute column widths: respect explicit `width`, divvy up the
  // rest by remaining column count.
  const explicit = result.columns.map((c) => c.width ?? 0);
  const explicitSum = explicit.reduce((s, w) => s + w, 0);
  const remaining = Math.max(0, totalWidth - explicitSum);
  const unspec = explicit.filter((w) => w === 0).length;
  const auto = unspec > 0 ? Math.floor(remaining / unspec) : 0;
  return explicit.map((w) => (w > 0 ? w : auto || Math.floor(totalWidth / result.columns.length)));
}

export async function reportToPdfBytes(result: ReportResult): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const widths = colWidths(result, PAGE_W - MARGIN_X * 2);
  const charWidthAt9 = font.widthOfTextAtSize("M", FONT_SIZE);

  const state: DrawState = {
    doc,
    page: doc.addPage([PAGE_W, PAGE_H]),
    y: HEADER_Y,
    pageNumber: 1,
    totalPagesEstimate: Math.max(
      1,
      Math.ceil(result.rowCount / Math.max(1, Math.floor((HEADER_Y - FOOTER_Y - 80) / ROW_H))),
    ),
  };

  const title = result.meta.template.name || "Report";
  const projectName = result.meta.projectName;

  drawHeader(state, title, projectName, bold, font);
  drawMeta(state, result, font);
  state.y -= 18;

  const drawColumnHeader = () => {
    let x = MARGIN_X;
    state.page.drawRectangle({
      x: MARGIN_X,
      y: state.y - HEADER_ROW_H + 4,
      width: PAGE_W - MARGIN_X * 2,
      height: HEADER_ROW_H,
      color: rgb(0.945, 0.969, 0.98),
    });
    result.columns.forEach((c, i) => {
      const text = clipCell(safeAsciiText(c.header), Math.max(1, Math.floor(widths[i] / charWidthAt9) - 1));
      state.page.drawText(text, {
        x: x + 4,
        y: state.y - HEADER_ROW_H + 8,
        size: HEADER_FONT_SIZE,
        font: bold,
        color: rgb(0.106, 0.141, 0.2),
      });
      x += widths[i];
    });
    state.y -= HEADER_ROW_H + 2;
  };

  const newPageIfNeeded = () => {
    if (state.y - ROW_H < FOOTER_Y + 24) {
      state.page = doc.addPage([PAGE_W, PAGE_H]);
      state.y = HEADER_Y;
      state.pageNumber++;
      drawHeader(state, title, projectName, bold, font);
      state.y -= 12;
      drawColumnHeader();
    }
  };

  drawColumnHeader();

  for (const group of result.groups) {
    if (group.key.length > 0) {
      newPageIfNeeded();
      state.page.drawText(safeAsciiText(group.key.join("  ·  ")), {
        x: MARGIN_X,
        y: state.y - 4,
        size: 11,
        font: bold,
        color: rgb(0.957, 0.718, 0.251),
      });
      state.y -= 14;
      drawColumnHeader();
    }
    let alt = false;
    for (const row of group.rows) {
      newPageIfNeeded();
      if (alt) {
        state.page.drawRectangle({
          x: MARGIN_X,
          y: state.y - ROW_H + 4,
          width: PAGE_W - MARGIN_X * 2,
          height: ROW_H,
          color: rgb(0.98, 0.98, 0.99),
        });
      }
      alt = !alt;
      let x = MARGIN_X;
      result.columns.forEach((col, i) => {
        const value = formatCell(getByPath(row, col.field), col.format);
        const maxChars = Math.max(1, Math.floor(widths[i] / charWidthAt9) - 1);
        const text = clipCell(safeAsciiText(value), maxChars);
        state.page.drawText(text, {
          x: x + 4,
          y: state.y - ROW_H + 8,
          size: FONT_SIZE,
          font,
          color: rgb(0.106, 0.141, 0.2),
        });
        x += widths[i];
      });
      state.y -= ROW_H;
    }
    state.y -= 6;
  }

  drawFooterAllPages(doc, font, projectName, title);

  return doc.save();
}

function drawHeader(
  state: DrawState,
  title: string,
  projectName: string,
  bold: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
) {
  state.page.drawRectangle({
    x: 0,
    y: HEADER_Y + 2,
    width: PAGE_W,
    height: 4,
    color: rgb(0.957, 0.718, 0.251),
  });
  state.page.drawText(safeAsciiText(title), {
    x: MARGIN_X,
    y: HEADER_Y - 10,
    size: 16,
    font: bold,
    color: rgb(0.106, 0.141, 0.2),
  });
  state.page.drawText(safeAsciiText(projectName), {
    x: MARGIN_X,
    y: HEADER_Y - 26,
    size: 9,
    font,
    color: rgb(0.369, 0.42, 0.522),
  });
  state.y = HEADER_Y - 38;
}

function drawMeta(
  state: DrawState,
  result: ReportResult,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
) {
  const meta = `Scope: ${SCOPE_LABEL[result.scope]}  ·  ${result.rowCount} row${result.rowCount === 1 ? "" : "s"}  ·  ${result.meta.generatedAt.slice(0, 19).replace("T", " ")}`;
  state.page.drawText(safeAsciiText(meta), {
    x: MARGIN_X,
    y: state.y,
    size: 8,
    font,
    color: rgb(0.369, 0.42, 0.522),
  });
}

function drawFooterAllPages(
  doc: PDFDocument,
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  projectName: string,
  title: string,
) {
  const pages = doc.getPages();
  const total = pages.length;
  pages.forEach((page, i) => {
    page.drawText(
      safeAsciiText(`${projectName} · ${title} · page ${i + 1} of ${total}`),
      {
        x: MARGIN_X,
        y: FOOTER_Y,
        size: 8,
        font,
        color: rgb(0.5, 0.55, 0.65),
      },
    );
  });
}
