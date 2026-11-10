// One colour per meaning, used by charts, badges, tiles and table rows,
// so "Leave" or "Fail" always looks the same everywhere.

export const COLORS: Record<string, string> = {
  // Parade state
  Posted: "#1c3d57",
  Present: "#3f8f55",
  "On Parade": "#3f8f55",
  Employed: "#2f78b7",
  Absent: "#c4483f",
  Leave: "#2c9fb9",
  Course: "#7a5bc7",
  Hospital: "#d6455d",
  "Temp Atts": "#e58b2a",
  "Perm Atts": "#b36a1d",
  AWOL: "#8f1d1d",
  Detention: "#5a2d2d",
  Other: "#8a96a0",
  // Training results
  Pass: "#2e8b57",
  Completed: "#2e8b57",
  Partial: "#2f78b7",
  Fail: "#d64541",
  Failed: "#d64541",
  "Not Started": "#b9c4cc",
  "Yet to appear": "#b9c4cc",
  "Yet to complete": "#e8a33d",
  Exempted: "#7a5bc7",
  "Not completed": "#d64541",
  Absent_trg: "#8a6d3b",
  // Leave / workflow
  Applied: "#e0a133",
  Recommended: "#2f78b7",
  Approved: "#3f8f55",
  Rejected: "#c4483f",
  Cancelled: "#9aa5ad",
  Pending: "#e0a133",
  // Training calendar event types (same colours as the calendar bars)
  Training: "#2f78b7",
  Test: "#e08a1e",
  Cadre: "#2e8b57",
  Exercise: "#c8423b",
  Range: "#8a5a2b",
  Lecture: "#138a8a",
  Sports: "#7a5bc7",
  Inspection: "#3d4b59",
  // Categories
  Offr: "#1c3d57",
  JCO: "#4f6f52",
  OR: "#8a6d3b",
};

/** Distinct shades for open-ended lists (employment types, companies, trades…). */
export const PALETTE = ["#2f78b7", "#3f8f55", "#e58b2a", "#7a5bc7", "#2c9fb9", "#d6455d", "#8a6d3b", "#4f6f52", "#c27ba0", "#5b7083", "#a3a83a", "#b36a1d"];

export function colorFor(key: string, index = 0): string {
  return COLORS[key] ?? PALETTE[Math.abs(hash(key) + index) % PALETTE.length];
}
function hash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
/** Light tint of a colour for backgrounds. */
export function tint(hex: string, alpha = 0.12): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
