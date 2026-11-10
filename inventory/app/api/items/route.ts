import { NextResponse } from "next/server";
import { createItem, readItems } from "@/lib/db";
import { readJson, withAuth } from "@/lib/http";
import { parseItemInput } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async () => NextResponse.json(readItems()));

export const POST = withAuth(async (req) => {
  const input = parseItemInput(await readJson(req));
  return NextResponse.json(createItem(input), { status: 201 });
});
