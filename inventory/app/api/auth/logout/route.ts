import { NextResponse } from "next/server";
import { SESSION_COOKIE, isSecureRequest } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const res = NextResponse.json({ message: "Logged out successfully." });

  res.cookies.set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: 0,
  });

  return res;
}
