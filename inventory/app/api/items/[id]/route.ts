import { NextResponse } from "next/server";
import { deleteItem, getItem, updateItem } from "@/lib/db";
import { jsonError, readJson, withAuth } from "@/lib/http";
import { parseItemInput } from "@/lib/validation";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withAuth<Ctx>(async (_req, { params }) => {
  const item = getItem((await params).id);
  if (!item) return jsonError("Item not found.", 404);
  return NextResponse.json(item);
});

export const PUT = withAuth<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const input = parseItemInput(await readJson(req));
  return NextResponse.json(updateItem(id, input));
});

export const DELETE = withAuth<Ctx>(async (_req, { params }) => {
  if (!deleteItem((await params).id)) return jsonError("Item not found.", 404);
  return NextResponse.json({ message: "Item deleted." });
});
