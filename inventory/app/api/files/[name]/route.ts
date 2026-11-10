import fs from "fs/promises";
import path from "path";
import { jsonError, withAuth } from "@/lib/http";
import { MIME_BY_EXT, UPLOADS_DIR, isSafeFileName } from "@/lib/uploads";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ name: string }> };

// Serves files uploaded after `next build`. A production server only serves
// files that were already in public/ at build time, so /uploads/* falls back
// here (see the rewrite in next.config.ts).
export const GET = withAuth<Ctx>(async (_req, { params }) => {
  const { name } = await params;
  const type = MIME_BY_EXT[path.extname(name).toLowerCase()];

  if (!isSafeFileName(name) || !type) return jsonError("File not found.", 404);

  try {
    const data = await fs.readFile(path.join(UPLOADS_DIR, name));

    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": type,
        "Content-Length": String(data.length),
        "Content-Disposition": "inline",
        "X-Content-Type-Options": "nosniff",
        // Upload names are unique and never change.
        "Cache-Control": "private, max-age=604800, immutable",
      },
    });
  } catch {
    return jsonError("File not found.", 404);
  }
});
