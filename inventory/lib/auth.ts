// Session helpers shared by proxy.ts and the API routes.
// Uses only Web Crypto so it runs anywhere Next.js runs.

export const SESSION_COOKIE = "inventory_session";
export const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours

const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "5sig@123";

const encoder = new TextEncoder();

export function getCredentials() {
  const username = process.env.INVENTORY_USERNAME || DEFAULT_USERNAME;
  const password = process.env.INVENTORY_PASSWORD || DEFAULT_PASSWORD;

  return {
    username,
    password,
    usingDefaults: !process.env.INVENTORY_PASSWORD,
  };
}

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

// The signing secret comes from SESSION_SECRET. If that is not set it is
// derived from the login credentials, so changing the password also logs
// everyone out.
async function getKey() {
  const { username, password } = getCredentials();
  const secret =
    process.env.SESSION_SECRET || `unit-inventory:${username}:${password}`;

  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

export async function createSessionToken(username: string) {
  const payload = base64UrlEncode(
    encoder.encode(
      JSON.stringify({
        u: username,
        exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
      })
    )
  );

  const signature = await crypto.subtle.sign(
    "HMAC",
    await getKey(),
    encoder.encode(payload)
  );

  return `${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string | undefined | null) {
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  try {
    const valid = await crypto.subtle.verify(
      "HMAC",
      await getKey(),
      base64UrlDecode(signature),
      encoder.encode(payload)
    );

    if (!valid) return null;

    const data = JSON.parse(new TextDecoder().decode(base64UrlDecode(payload)));

    if (typeof data.exp !== "number" || data.exp < Date.now() / 1000) {
      return null;
    }

    return { username: String(data.u || "") };
  } catch {
    return null;
  }
}

// Constant-time string comparison, so response timing does not reveal
// how much of a guessed password was right.
export async function safeEqual(a: string, b: string) {
  const [hashA, hashB] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);

  const viewA = new Uint8Array(hashA);
  const viewB = new Uint8Array(hashB);
  let diff = 0;

  for (let i = 0; i < viewA.length; i++) diff |= viewA[i] ^ viewB[i];

  return diff === 0;
}

function readCookie(header: string | null, name: string) {
  if (!header) return undefined;

  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }

  return undefined;
}

// Second line of defence inside API routes (proxy.ts is the first).
export async function isAuthenticated(req: Request) {
  const token = readCookie(req.headers.get("cookie"), SESSION_COOKIE);
  return (await verifySessionToken(token)) !== null;
}

export function isSecureRequest(req: Request) {
  const forwarded = req.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim() === "https";
  return new URL(req.url).protocol === "https:";
}
