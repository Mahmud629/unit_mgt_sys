// Excel import/export helpers (loaded on demand to keep pages light).
type Cell = string | number | boolean | null | undefined;

export async function exportXlsx(filename: string, sheets: Array<{ name: string; rows: Array<Record<string, Cell>>; widths?: number[] }>) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.json_to_sheet(s.rows.length ? s.rows : [{ "": "No data" }]);
    const headers = Object.keys(s.rows[0] ?? {});
    ws["!cols"] = headers.map((h, i) => ({ wch: s.widths?.[i] ?? Math.min(40, Math.max(h.length + 2, ...s.rows.slice(0, 200).map((r) => String(r[h] ?? "").length + 1))) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  XLSX.writeFile(wb, filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`);
}

/** Reads the first sheet of an .xlsx/.xls/.csv file into objects keyed by header row. */
export async function readSheet(file: File): Promise<Array<Record<string, string>>> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: true });
  return raw.map((r) => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) o[normalizeHeader(k)] = cellToString(v);
    return o;
  });
}

export function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    // Excel dates come back as local midnight; format as YYYY-MM-DD
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, "0"), d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(v).trim();
}

/** Accepts 2026-03-01, 01/03/2026, 1-Mar-2026, 01 Mar 26 → "2026-03-01" (or "" if not parseable). */
export function parseDateCell(s: string): string {
  const t = s.trim();
  if (!t) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  let m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = t.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[a-z]*[\s-](\d{2,4})$/);
  if (m) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const mi = months.indexOf(m[2].toLowerCase());
    if (mi >= 0) {
      const y = m[3].length === 2 ? (Number(m[3]) > 50 ? `19${m[3]}` : `20${m[3]}`) : m[3];
      return `${y}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }
  return "";
}
