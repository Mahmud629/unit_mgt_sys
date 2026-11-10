import { NextResponse } from "next/server";
import { getDashboard } from "@/lib/db";
import { withAuth } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Totals and the 10 latest transactions, computed in SQL so the dashboard
// does not have to download the whole register.
export const GET = withAuth(async () => NextResponse.json(getDashboard()));
