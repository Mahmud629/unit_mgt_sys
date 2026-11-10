import fs from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { jsonError, withAuth } from "@/lib/http";
import { MAX_UPLOAD_BYTES, UPLOADS_DIR, detectExtension } from "@/lib/uploads";

export const runtime = "nodejs";

function baseName(name: string) {
  const stem = path.parse(name).name.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 60);
  return stem || "file";
}

export const POST = withAuth(async (req) => {
  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_UPLOAD_BYTES + 64 * 1024) {
    return jsonError("File is too large (max 10 MB).", 413);
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return jsonError("No file uploaded.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return jsonError("File is too large (max 10 MB).", 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = detectExtension(buffer);

  if (!ext) {
    return jsonError("Only PDF, JPG, PNG and WebP files are allowed.");
  }

  await fs.mkdir(UPLOADS_DIR, { recursive: true });

  const suffix = globalThis.crypto.randomUUID().slice(0, 8);
  const fileName = `${Date.now()}-${suffix}-${baseName(file.name)}${ext}`;

  await fs.writeFile(path.join(UPLOADS_DIR, fileName), buffer, { flag: "wx" });

  return NextResponse.json({ url: `/uploads/${fileName}`, fileName });
});
