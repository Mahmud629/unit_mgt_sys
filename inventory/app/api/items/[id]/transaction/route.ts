import { NextResponse } from "next/server";
import { applyMovement } from "@/lib/db";
import { readJson, withAuth } from "@/lib/http";
import { parseMovementInput } from "@/lib/validation";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const POST = withAuth<Ctx>(async (req, { params }) => {
  const { id } = await params;
  const input = parseMovementInput(await readJson(req));
  return NextResponse.json(applyMovement(id, input));
});
