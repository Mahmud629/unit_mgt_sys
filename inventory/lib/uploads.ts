import path from "path";

export const UPLOADS_DIR = path.join(process.cwd(), "public", "uploads");
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

// Detect the real file type from its first bytes rather than trusting the
// browser-supplied name or type.
export function detectExtension(bytes: Uint8Array): string | null {
  const starts = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);

  if (starts(0x25, 0x50, 0x44, 0x46)) return ".pdf"; // %PDF
  if (starts(0xff, 0xd8, 0xff)) return ".jpg";
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return ".png";
  if (
    starts(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return ".webp";
  }

  return null;
}

export function isSafeFileName(name: string) {
  return /^[\w.-]+$/.test(name) && !name.startsWith(".") && path.basename(name) === name;
}
