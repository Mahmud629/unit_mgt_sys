// Coloured A4 PDF downloads: sorted lists and the one-page personal information sheet.
// jsPDF's built-in fonts cover English only, so any Bangla text (names, addresses) is
// drawn through the browser (canvas, Hind Siliguri) and placed as a sharp image.
import type { jsPDF as JsPDF } from "jspdf";

type RGB = [number, number, number];
const hex = (h: string): RGB => {
  let x = h.replace("#", "");
  if (x.length === 3) x = x.split("").map((c) => c + c).join("");
  const n = parseInt(x.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const NAVY: RGB = hex("#0d2233");
const NAVY3: RGB = hex("#1c3d57");
const GREEN: RGB = hex("#4f6f52");
const INK: RGB = hex("#18222d");
const MUTED: RGB = hex("#6b7a86");
const LINE: RGB = hex("#dfe6ea");
const ZEBRA: RGB = hex("#f3f6f8");
const NON_LATIN = /[^\u0000-ÿ–—‘’“”•…]/;

let logoCache: string | null | undefined;
async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => { const fr = new FileReader(); fr.onload = () => resolve(String(fr.result)); fr.onerror = () => resolve(null); fr.readAsDataURL(blob); });
  } catch {
    return null;
  }
}
/** Unit crest, scaled down so every PDF stays small. */
async function logo() {
  if (logoCache !== undefined) return logoCache;
  const src = await toDataUrl("/brand/logo-512.webp");
  logoCache = !src ? null : await new Promise<string | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 220;
      const g = c.getContext("2d")!;
      const r = Math.min(220 / img.width, 220 / img.height);
      g.drawImage(img, (220 - img.width * r) / 2, (220 - img.height * r) / 2, img.width * r, img.height * r);
      resolve(c.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
  return logoCache;
}
/** Image (photo) as a JPEG data URL, cropped to the given aspect ratio. */
async function photoData(url: string, aspect = 5 / 6): Promise<string | null> {
  const src = url.startsWith("data:") ? url : await toDataUrl(url);
  if (!src) return null;
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = 300, h = Math.round(w / aspect);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const g = c.getContext("2d")!;
      g.fillStyle = "#fff"; g.fillRect(0, 0, w, h);
      const r = Math.max(w / img.width, h / img.height);
      g.drawImage(img, (w - img.width * r) / 2, (h - img.height * r) / 2, img.width * r, img.height * r);
      resolve(c.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

const PT = 0.3528; // mm per point
/** Draws text; Bangla / other scripts are rendered by the browser and placed as an image. */
function text(doc: JsPDF, value: string, x: number, y: number, o: { size?: number; color?: RGB; bold?: boolean; maxWidth?: number; align?: "left" | "right" | "center"; lines?: number } = {}) {
  const size = o.size ?? 9;
  const s = String(value ?? "");
  if (!NON_LATIN.test(s)) {
    doc.setFont("helvetica", o.bold ? "bold" : "normal");
    doc.setFontSize(size);
    doc.setTextColor(...(o.color ?? INK));
    let lines: string[] = o.maxWidth ? doc.splitTextToSize(s, o.maxWidth) : [s];
    if (o.lines && lines.length > o.lines) {
      lines = lines.slice(0, o.lines);
      lines[lines.length - 1] = lines[lines.length - 1].replace(/.{0,2}$/, "") + "…";
    }
    doc.text(lines, x, y, { align: o.align ?? "left", baseline: "alphabetic" });
    return lines.length * size * PT * 1.25;
  }
  // canvas route (3x for sharpness)
  const scale = 4;
  const px = size * PT * scale * 3.78; // mm -> px at 96dpi
  const c = document.createElement("canvas");
  const g = c.getContext("2d")!;
  const font = `${o.bold ? "700" : "400"} ${px}px "Hind Siliguri", "Noto Sans Bengali", "Nirmala UI", "Vrinda", sans-serif`;
  g.font = font;
  const maxPx = o.maxWidth ? o.maxWidth * scale * 3.78 : Infinity;
  const words = s.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (g.measureText(t).width > maxPx && cur) { lines.push(cur); cur = w; } else cur = t;
  }
  if (cur) lines.push(cur);
  const shown = o.lines ? lines.slice(0, o.lines) : lines;
  const lh = px * 1.35;
  c.width = Math.ceil(Math.min(maxPx, Math.max(...shown.map((l) => g.measureText(l).width))) + 4);
  c.height = Math.ceil(lh * shown.length + px * 0.35);
  g.font = font;
  g.fillStyle = `rgb(${(o.color ?? INK).join(",")})`;
  g.textBaseline = "alphabetic";
  shown.forEach((l, i) => g.fillText(l, 2, px * 1.05 + i * lh));
  const wmm = c.width / scale / 3.78, hmm = c.height / scale / 3.78;
  const left = o.align === "right" ? x - wmm : o.align === "center" ? x - wmm / 2 : x;
  doc.addImage(c.toDataURL("image/png"), "PNG", left, y - size * PT * 1.0, wmm, hmm);
  return shown.length * size * PT * 1.35;
}

function bdNow() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
}

async function header(doc: JsPDF, unit: string, title: string, subtitle?: string) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY); doc.rect(0, 0, W, 24, "F");
  doc.setFillColor(...GREEN); doc.rect(0, 24, W, 1.2, "F");
  doc.setFillColor(...NAVY3); doc.triangle(W - 70, 0, W, 0, W, 24, "F");
  const lg = await logo();
  if (lg) { doc.setFillColor(255, 255, 255); doc.circle(17, 12, 9, "F"); doc.addImage(lg, "PNG", 9.5, 4.5, 15, 15); }
  text(doc, unit.toUpperCase(), 30, 10.5, { size: 12.5, bold: true, color: [255, 255, 255] });
  text(doc, title, 30, 16.5, { size: 10, color: hex("#c9d7e1") });
  if (subtitle) text(doc, subtitle, 30, 21.2, { size: 7.5, color: hex("#9fb5c3"), maxWidth: W - 110 });
  text(doc, "Generated", W - 10, 10.5, { size: 7, color: hex("#9fb5c3"), align: "right" });
  text(doc, bdNow(), W - 10, 15.5, { size: 8.5, bold: true, color: [255, 255, 255], align: "right" });
}
function footers(doc: JsPDF, unit: string) {
  const n = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(10, H - 10, W - 10, H - 10);
    text(doc, `${unit} · Unit Management System · For official use only`, 10, H - 5.5, { size: 7, color: MUTED });
    text(doc, `Page ${i} of ${n}`, W - 10, H - 5.5, { size: 7, color: MUTED, align: "right" });
  }
}
function chipRow(doc: JsPDF, chips: Array<{ label: string; value: string; color?: string }>, y: number) {
  const W = doc.internal.pageSize.getWidth();
  let x = 10;
  for (const c of chips) {
    const col = hex(c.color ?? "#2f78b7");
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5);
    const lw = doc.getTextWidth(c.label.toUpperCase());
    doc.setFont("helvetica", "bold"); doc.setFontSize(8.5);
    const vw = NON_LATIN.test(c.value) ? 30 : doc.getTextWidth(c.value);
    const w = Math.max(lw, vw) + 7;
    if (x + w > W - 10) { x = 10; y += 12; }
    doc.setFillColor(col[0], col[1], col[2]); doc.roundedRect(x, y, 1.4, 10, 0.7, 0.7, "F");
    doc.setFillColor(Math.round(col[0] * 0.1 + 229.5), Math.round(col[1] * 0.1 + 229.5), Math.round(col[2] * 0.1 + 229.5));
    doc.roundedRect(x + 1.4, y, w - 1.4, 10, 1.2, 1.2, "F");
    text(doc, c.label.toUpperCase(), x + 4, y + 3.8, { size: 6.5, color: MUTED });
    text(doc, c.value, x + 4, y + 8.2, { size: 8.5, bold: true, color: col });
    x += w + 3;
  }
  return y + 13;
}

export interface PdfColumn { header: string; key: string; align?: "left" | "right" | "center"; width?: number }

/** A merged cell: spans several columns (a continuous entry) and / or rows; optional coloured fill. */
export type PdfCell = { content: string; colSpan?: number; rowSpan?: number; fill?: string };
type PdfRow = Record<string, string | number | null | undefined | PdfCell>;
/** One block of a report: a coloured heading and a table. */
export interface PdfSection {
  title?: string;
  color?: string;
  columns: PdfColumn[];
  rows: PdfRow[];
  /** show a running serial number (default true) */
  serial?: boolean;
  /** text when there are no rows (the section is skipped when not given) */
  empty?: string;
  /** Optional text colour per cell, e.g. red for "Absent" */
  colorize?: (key: string, value: string) => string | null | undefined;
  /** Optional coloured band on the left of a row */
  rowAccent?: (row: PdfRow) => string | null | undefined;
  /** bold, shaded last row (totals) */
  totalRow?: boolean;
  /** half width: two half sections in a row sit side by side */
  half?: boolean;
}

// Every PDF of the system uses this one layout: crest header, coloured chips, sections, page footer.
async function drawSections(doc: JsPDF, o: { unit: string; title: string; sections: PdfSection[]; compact?: boolean; scale?: number }, startY: number) {
  const k = o.scale ?? 1;
  const { default: autoTable } = await import("jspdf-autotable");
  const H = doc.internal.pageSize.getHeight();
  const W = doc.internal.pageSize.getWidth();
  const shown = o.sections.filter((sec) => sec.rows.length || sec.empty);

  // draws one section between x = left and x = W - right, starting at y; returns the end y
  const one = (sec: PdfSection, y: number, left: number, right: number) => {
    const c = hex(sec.color ?? "#1c3d57");
    const fs = (o.compact ? 6.6 : sec.columns.length > 10 ? 6.6 : 7.6) * k;
    if (sec.title) {
      if (y > H - 30) { doc.addPage(); y = 14; }
      doc.setFillColor(...c); doc.rect(left, y, 1.6, 5.2, "F");
      text(doc, sec.title.toUpperCase(), left + 3.5, y + 4, { size: o.compact ? 7.2 : 8.2, bold: true, color: c, maxWidth: W - left - right - 4, lines: 1 });
      y += o.compact ? 6.2 : 6.6;
    }
    const serial = sec.serial !== false;
    const cols = serial ? [{ header: "#", key: "__ser", align: "right" as const, width: 7 }, ...sec.columns] : sec.columns;
    const rows = sec.rows.length ? sec.rows : [Object.fromEntries(sec.columns.map((col, k) => [col.key, k === 0 ? sec.empty : ""]))];
    const occupied = cols.map(() => 0); // columns still covered by a cell with rowSpan from a row above
    const body = rows.map((r, i) => {
      const out: Array<string | { content: string; colSpan: number; rowSpan: number; styles: Record<string, unknown> }> = [];
      for (let ci = 0; ci < cols.length; ci++) {
        if (occupied[ci] > 0) { occupied[ci]--; continue; }
        const col = cols[ci];
        if (col.key === "__ser") { out.push(sec.rows.length ? String(i + 1) : ""); continue; }
        const v = r[col.key];
        if (v && typeof v === "object") {
          const cs = Math.max(1, v.colSpan ?? 1), rs = Math.max(1, v.rowSpan ?? 1);
          out.push({ content: v.content, colSpan: cs, rowSpan: rs, styles: v.fill ? { fillColor: hex(v.fill), textColor: [255, 255, 255], fontStyle: "bold" } : { fontStyle: "bold" } });
          if (rs > 1) for (let x = ci; x < ci + cs; x++) occupied[x] = rs - 1;
          ci += cs - 1;
        } else out.push(v === null || v === undefined ? "" : String(v));
      }
      return out;
    });
    const bangla = new Map<string, string>();
    // a row that continues on the next page comes back with index -1; find the original row by its data
    const rawIdx = new Map<unknown, number>(body.map((b, i) => [b, i]));
    const idxOf = (row: { index: number; raw: unknown }) => (row.index >= 0 ? row.index : rawIdx.get(row.raw) ?? -1);
    autoTable(doc, {
      startY: y,
      margin: { left, right, bottom: 14, top: 14 },
      head: [cols.map((col) => col.header)],
      body,
      theme: "grid",
      rowPageBreak: "avoid",
      styles: { font: "helvetica", fontSize: fs, cellPadding: o.compact ? { top: 0.8 * k * k, bottom: 0.8 * k * k, left: 1.3, right: 1.3 } : { top: 1.6, bottom: 1.6, left: 1.8, right: 1.8 }, lineColor: LINE, lineWidth: 0.15, textColor: INK, overflow: "linebreak", valign: "middle" },
      headStyles: { fillColor: c, textColor: [255, 255, 255], fontStyle: "bold", fontSize: fs + 0.2, valign: "middle" },
      alternateRowStyles: { fillColor: ZEBRA },
      columnStyles: Object.fromEntries(cols.map((col, k) => [k, { halign: col.align ?? "left", ...(col.width ? { cellWidth: col.width } : {}) }])),
      didParseCell: (d) => {
        if (d.section !== "body") return;
        if (!sec.rows.length) { d.cell.styles.textColor = MUTED; d.cell.styles.fontStyle = "italic"; return; }
        const cellRaw = d.cell.raw as unknown;
        const raw = cellRaw && typeof cellRaw === "object" && "content" in cellRaw ? String((cellRaw as { content: unknown }).content ?? "") : String(cellRaw ?? "");
        if (NON_LATIN.test(raw)) { bangla.set(`${idxOf(d.row)}:${d.column.index}`, raw); d.cell.text = [" "]; d.cell.styles.minCellHeight = o.compact ? 5 : 6.2; }
        const key = cols[d.column.index]?.key;
        const col = key && sec.colorize?.(key, raw);
        if (col) { d.cell.styles.textColor = hex(col); d.cell.styles.fontStyle = "bold"; }
        if (serial && d.column.index === 0) d.cell.styles.textColor = MUTED;
        if (sec.totalRow && idxOf(d.row) === rows.length - 1) { d.cell.styles.fontStyle = "bold"; d.cell.styles.fillColor = hex("#e6edf2"); }
      },
      didDrawCell: (d) => {
        if (d.section !== "body") return;
        const ri = idxOf(d.row);
        const raw = bangla.get(`${ri}:${d.column.index}`);
        if (raw) text(doc, raw, d.cell.x + 1.6, d.cell.y + d.cell.height / 2 + 1.2, { size: fs - 0.2, maxWidth: d.cell.width - 3.2, lines: 1 });
        if (d.column.index === 0 && sec.rowAccent && sec.rows[ri]) {
          const a = sec.rowAccent(sec.rows[ri]);
          if (a) { doc.setFillColor(...hex(a)); doc.rect(d.cell.x, d.cell.y, 1, d.cell.height, "F"); }
        }
      },
      didDrawPage: () => {
        if (doc.getCurrentPageInfo().pageNumber > 1) {
          doc.setFillColor(...NAVY); doc.rect(0, 0, W, 9, "F");
          text(doc, `${o.unit} — ${o.title}`, 10, 6, { size: 7.5, color: [255, 255, 255], bold: true });
        }
      },
    });
    return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  };

  let y = startY;
  const gap = o.compact ? 3.5 : 6;
  for (let i = 0; i < shown.length; i++) {
    const sec = shown[i];
    const next = shown[i + 1];
    if (sec.half && next?.half) {
      // two sections side by side
      if (y > H - 40) { doc.addPage(); y = 14; }
      const mid = W / 2;
      const page = doc.getCurrentPageInfo().pageNumber;
      const y1 = one(sec, y, 10, W - mid + 2);
      const p1 = doc.getCurrentPageInfo().pageNumber;
      doc.setPage(page);
      const y2 = one(next, y, mid + 2, 10);
      const p2 = doc.getCurrentPageInfo().pageNumber;
      const last = Math.max(p1, p2);
      doc.setPage(last);
      y = (p1 === p2 ? Math.max(y1, y2) : p1 > p2 ? y1 : y2) + gap;
      i++;
      continue;
    }
    y = one(sec, y, 10, 10) + gap;
  }
  return y;
}

/** A report made of several sections (parade state, morning brief, registers). */
export async function exportReportPdf(o: {
  filename: string;
  unit: string;
  title: string;
  subtitle?: string;
  chips?: Array<{ label: string; value: string; color?: string }>;
  sections: PdfSection[];
  orientation?: "portrait" | "landscape";
  /** smaller type so a brief fits one page */
  compact?: boolean;
  /** text block under the title (e.g. notes) */
  note?: string;
  /** shrink the type (a little, up to 3 times) until everything fits on one page */
  onePage?: boolean;
}) {
  const { jsPDF } = await import("jspdf");
  await (document as Document & { fonts?: FontFaceSet }).fonts?.load('16px "Hind Siliguri"', "অ").catch(() => undefined);
  let doc!: JsPDF;
  for (const scale of o.onePage ? [1, 0.92, 0.85, 0.78] : [1]) {
    doc = new jsPDF({ orientation: o.orientation ?? "portrait", unit: "mm", format: "a4", compress: true });
    await header(doc, o.unit, o.title, o.subtitle);
    let y = 30;
    if (o.chips?.length) y = chipRow(doc, o.chips, y);
    if (o.note) y += text(doc, o.note, 10, y + 2, { size: 7.6, color: MUTED, maxWidth: doc.internal.pageSize.getWidth() - 20 }) + 2;
    await drawSections(doc, { ...o, scale }, y);
    if (doc.getNumberOfPages() === 1) break;
  }
  footers(doc, o.unit);
  doc.save(`${o.filename.replace(/[^\w.-]+/g, "_")}.pdf`);
}

/** A sorted / filtered list as a coloured A4 PDF (landscape when it has many columns). */
export async function exportTablePdf(o: {
  filename: string;
  unit: string;
  title: string;
  subtitle?: string;
  chips?: Array<{ label: string; value: string; color?: string }>;
  columns: PdfColumn[];
  rows: PdfRow[];
  orientation?: "portrait" | "landscape";
  colorize?: (key: string, value: string) => string | null | undefined;
  rowAccent?: (row: PdfRow) => string | null | undefined;
}) {
  await exportReportPdf({
    filename: o.filename, unit: o.unit, title: o.title, subtitle: o.subtitle, chips: o.chips,
    orientation: o.orientation ?? (o.columns.length > 7 ? "landscape" : "portrait"),
    sections: [{ columns: o.columns, rows: o.rows, colorize: o.colorize, rowAccent: o.rowAccent, color: "#1c3d57", empty: "Nothing to show" }],
  });
}

export interface SoldierSheet {
  unit: string;
  photo?: string | null;
  name: string;
  nameBn?: string | null;
  line1: string; // rank · personal no
  line2: string; // coy · trade · appointment
  status: string;
  facts: Array<{ label: string; value: string; color: string }>;
  groups: Array<{ title: string; color: string; rows: Array<[string, string]> }>;
  /** first: drawn right after the sections (before training / leave); always: shown even when empty */
  tables: Array<{ title: string; color: string; columns: string[]; rows: string[][]; first?: boolean; always?: boolean; empty?: string; max?: number; colorCol?: number }>;
  chips: Array<{ title: string; items: Array<{ label: string; color: string; ink?: string }> }>;
}

/** One-page coloured "Personal Information Sheet" for a soldier. */
export async function exportSoldierPdf(sheet: SoldierSheet, filename: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  await (document as Document & { fonts?: FontFaceSet }).fonts?.load('16px "Hind Siliguri"', "অ").catch(() => undefined);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const W = 210, M = 10;
  await header(doc, sheet.unit, "Personal Information Sheet");

  // ---- identity block
  const top = 30;
  doc.setFillColor(...hex("#eef3f7")); doc.roundedRect(M, top, W - 2 * M, 40, 2.5, 2.5, "F");
  const ph = sheet.photo ? await photoData(sheet.photo) : null;
  doc.setFillColor(255, 255, 255); doc.setDrawColor(...LINE); doc.roundedRect(M + 3, top + 3, 28, 34, 1.5, 1.5, "FD");
  if (ph) doc.addImage(ph, "JPEG", M + 3.6, top + 3.6, 26.8, 32.8);
  else { text(doc, "PHOTO", M + 17, top + 21, { size: 8, color: MUTED, align: "center" }); }
  const tx = M + 36;
  text(doc, sheet.name, tx, top + 9, { size: 15, bold: true, color: NAVY, maxWidth: 110 });
  if (sheet.nameBn) text(doc, sheet.nameBn, tx, top + 15.5, { size: 10, color: NAVY3, maxWidth: 110 });
  text(doc, sheet.line1, tx, top + (sheet.nameBn ? 22 : 16), { size: 9.5, bold: true, color: GREEN });
  text(doc, sheet.line2, tx, top + (sheet.nameBn ? 27.5 : 21.5), { size: 8.5, color: MUTED, maxWidth: 120 });
  const stCol = sheet.status === "Serving" ? hex("#3f8f55") : hex("#8a96a0");
  doc.setFillColor(...stCol); doc.roundedRect(W - M - 26, top + 4, 22, 6.5, 3.2, 3.2, "F");
  text(doc, sheet.status.toUpperCase(), W - M - 15, top + 8.6, { size: 7, bold: true, color: [255, 255, 255], align: "center" });

  // facts strip
  const fy = top + 31;
  const fw = (W - 2 * M - 36 - 3) / sheet.facts.length;
  sheet.facts.forEach((f, i) => {
    const x = tx + i * fw;
    const c = hex(f.color);
    doc.setFillColor(255, 255, 255); doc.roundedRect(x, fy - 2.5, fw - 1.5, 9.5, 1.2, 1.2, "F");
    doc.setFillColor(...c); doc.rect(x, fy - 2.5, fw - 1.5, 0.9, "F");
    text(doc, f.label.toUpperCase(), x + 1.5, fy + 1.4, { size: 5.6, color: MUTED });
    text(doc, f.value || "—", x + 1.5, fy + 5.4, { size: 7.6, bold: true, color: c, maxWidth: fw - 3, lines: 1 });
  });

  // ---- two-column key/value sections
  let y = top + 45;
  const colW = (W - 2 * M - 5) / 2;
  const colY = [y, y];
  const rowH = 4.3;
  for (const g of sheet.groups) {
    const rows = g.rows.filter(([, v]) => v !== undefined);
    // estimate height with wrapping
    doc.setFontSize(7.6);
    const heights = rows.map(([, v]) => Math.min(2, (NON_LATIN.test(v) ? 1 : doc.splitTextToSize(v || "—", colW * 0.54).length)) * 3.3 + 1);
    const h = 7 + heights.reduce((a, b) => a + Math.max(b, rowH), 0) + 1;
    const ci = colY[0] <= colY[1] ? 0 : 1;
    const x = M + ci * (colW + 5);
    let yy = colY[ci];
    const c = hex(g.color);
    doc.setFillColor(255, 255, 255); doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.roundedRect(x, yy, colW, h, 1.8, 1.8, "FD");
    doc.setFillColor(...c); doc.roundedRect(x, yy, colW, 6, 1.8, 1.8, "F"); doc.rect(x, yy + 3, colW, 3, "F");
    text(doc, g.title.toUpperCase(), x + 3, yy + 4.2, { size: 7.4, bold: true, color: [255, 255, 255] });
    yy += 7;
    rows.forEach(([k, v], i) => {
      const hh = Math.max(heights[i], rowH);
      if (i % 2 === 1) { doc.setFillColor(...hex("#f6f8fa")); doc.rect(x + 0.4, yy - 0.2, colW - 0.8, hh, "F"); }
      text(doc, k, x + 3, yy + 3, { size: 6.8, color: MUTED, maxWidth: colW * 0.41, lines: 1 });
      text(doc, v || "—", x + colW * 0.44, yy + 3, { size: 7.6, color: INK, maxWidth: colW * 0.54, lines: 2, bold: false });
      yy += hh;
    });
    colY[ci] += h + 3;
  }
  y = Math.max(...colY);

  // ---- small tables (military courses first, then family / education after the chips)
  const drawTable = (tb: SoldierSheet["tables"][number]) => {
    if ((!tb.rows.length && !tb.always) || y > 262) return;
    const c = hex(tb.color);
    text(doc, tb.title.toUpperCase(), M, y + 3, { size: 7.6, bold: true, color: c });
    const rows = tb.rows.length ? tb.rows.slice(0, tb.max ?? 6) : [[tb.empty ?? "None recorded", ...tb.columns.slice(1).map(() => "")]];
    autoTable(doc, {
      startY: y + 4.5,
      margin: { left: M, right: M, bottom: 14 },
      head: [tb.columns],
      body: rows,
      theme: "grid",
      styles: { font: "helvetica", fontSize: 7, cellPadding: 1.1, lineColor: LINE, lineWidth: 0.15, textColor: INK },
      headStyles: { fillColor: c, textColor: [255, 255, 255], fontStyle: "bold", fontSize: 7 },
      alternateRowStyles: { fillColor: ZEBRA },
      didParseCell: (d) => {
        if (d.section !== "body") return;
        if (!tb.rows.length) { d.cell.styles.textColor = MUTED; d.cell.styles.fontStyle = "italic"; return; }
        if (NON_LATIN.test(String(d.cell.raw ?? ""))) { (d.cell as unknown as { _bn: string })._bn = String(d.cell.raw); d.cell.text = [" "]; }
        if (tb.colorCol === d.column.index) { const col = statusColour("", String(d.cell.raw ?? "")); if (col) { d.cell.styles.textColor = hex(col); d.cell.styles.fontStyle = "bold"; } }
      },
      didDrawCell: (d) => { const bn = (d.cell as unknown as { _bn?: string })._bn; if (bn) text(doc, bn, d.cell.x + 1.2, d.cell.y + d.cell.height / 2 + 1.2, { size: 7, maxWidth: d.cell.width - 2.4, lines: 1 }); },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3.5;
  };
  for (const tb of sheet.tables.filter((x) => x.first)) drawTable(tb);

  // ---- chip rows (training, leave)
  for (const row of sheet.chips) {
    if (!row.items.length || y > 262) continue;
    text(doc, row.title.toUpperCase(), M, y + 3, { size: 7.6, bold: true, color: NAVY3 });
    let x = M;
    y += 5;
    for (const it of row.items) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7);
      const w = doc.getTextWidth(it.label) + 6;
      if (x + w > W - M) { x = M; y += 6.5; }
      doc.setFillColor(...hex(it.color)); doc.roundedRect(x, y, w, 5.2, 2.6, 2.6, "F");
      text(doc, it.label, x + 3, y + 3.7, { size: 7, bold: true, color: hex(it.ink ?? "#ffffff") });
      x += w + 2;
    }
    y += 8;
  }

  for (const tb of sheet.tables.filter((x) => !x.first)) drawTable(tb);

  footers(doc, sheet.unit);
  doc.save(`${filename.replace(/[^\w.-]+/g, "_")}.pdf`);
}

const STATUS_COLOURS: Array<[RegExp, string]> = [
  [/^(pass|passed|completed|approved|present|serving|accepted|on parade|attending|all 4 done|qualified|[ab] grade)\b/i, "#2f7a45"],
  [/^(fail|failed|rejected|absent|awol|not completed|not qualified|deserted|overstayed|rtu)\b/i, "#b23b33"],
  [/^(exempted)\b/i, "#6a4cb5"],
  [/^(yet to complete|applied|pending|recommended|nominated|submitted)\b/i, "#b07812"],
  [/^(partial|on going|ongoing)\b/i, "#2f66a0"],
  [/^(yet to appear|cancelled|draft)\b/i, "#6b7a86"],
  [/^(perm atts)\b/i, "#3d4b59"],
  [/^(leave|on leave)\b/i, "#1f8aa3"],
  [/^(course|hospital|temp atts)\b/i, "#8a5a2b"],
];
export const statusColour = (_key: string, v: string) => STATUS_COLOURS.find(([re]) => re.test(v.trim()))?.[1] ?? null;

/** Same rows as the Excel export (an array of objects), as a coloured PDF. */
export async function exportObjectsPdf(o: {
  filename: string;
  unit: string;
  title: string;
  subtitle?: string;
  chips?: Array<{ label: string; value: string; color?: string }>;
  rows: Array<Record<string, unknown>>;
  orientation?: "portrait" | "landscape";
  skip?: string[];
}) {
  const keys = Object.keys(o.rows[0] ?? {}).filter((k) => k !== "Ser" && !(o.skip ?? []).includes(k));
  const isNum = (k: string) => o.rows.every((r) => r[k] === null || r[k] === undefined || r[k] === "" || typeof r[k] === "number");
  await exportTablePdf({
    filename: o.filename, unit: o.unit, title: o.title, subtitle: o.subtitle, chips: o.chips, orientation: o.orientation,
    columns: keys.map((k) => ({ header: k, key: k, align: isNum(k) ? "right" : "left" })),
    rows: o.rows.map((r) => Object.fromEntries(keys.map((k) => [k, r[k] === null || r[k] === undefined ? "" : (r[k] as string | number)]))),
    colorize: statusColour,
  });
}
