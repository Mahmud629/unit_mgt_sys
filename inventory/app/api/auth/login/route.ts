import { NextResponse } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  getCredentials,
  isSecureRequest,
  safeEqual,
} from "@/lib/auth";
import { jsonError } from "@/lib/http";

export const runtime = "nodejs";

// Simple in-memory brute-force guard: 10 failed attempts per IP per 15 min.
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; first: number }>();

function clientKey(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "local"
  );
}

function isLocked(key: string) {
  const entry = failures.get(key);
  if (!entry) return false;

  if (Date.now() - entry.first > WINDOW_MS) {
    failures.delete(key);
    return false;
  }

  return entry.count >= MAX_FAILURES;
}

function recordFailure(key: string) {
  const entry = failures.get(key);

  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    failures.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
}

let warnedDefaults = false;

export async function POST(req: Request) {
  const key = clientKey(req);

  if (isLocked(key)) {
    return jsonError("Too many failed attempts. Try again in 15 minutes.", 429);
  }

  let body: Record<string, unknown> = {};

  try {
    body = await req.json();
  } catch {
    return jsonError("Invalid request.");
  }

  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  const valid = getCredentials();

  if (valid.usingDefaults && !warnedDefaults) {
    warnedDefaults = true;
    console.warn(
      "[auth] Using the default password. Set INVENTORY_USERNAME and INVENTORY_PASSWORD in .env.local."
    );
  }

  const [userOk, passOk] = await Promise.all([
    safeEqual(username, valid.username),
    safeEqual(password, valid.password),
  ]);

  if (!userOk || !passOk) {
    recordFailure(key);
    return jsonError("Invalid username or password.", 401);
  }

  failures.delete(key);

  const res = NextResponse.json({ message: "Login successful." });

  res.cookies.set({
    name: SESSION_COOKIE,
    value: await createSessionToken(username),
    httpOnly: true,
    sameSite: "strict",
    secure: isSecureRequest(req),
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });

  return res;
}
