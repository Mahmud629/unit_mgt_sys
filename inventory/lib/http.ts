import { NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ message }, { status });
}

export class HttpError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response> | Response;

// Wraps a route handler: rejects requests without a valid session and turns
// thrown HttpErrors (or unexpected errors) into JSON responses.
export function withAuth<C>(handler: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    if (!(await isAuthenticated(req))) {
      return jsonError("Please log in again.", 401);
    }

    try {
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) return jsonError(err.message, err.status);

      console.error(err);
      return jsonError("Something went wrong on the server.", 500);
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) return body;
  } catch {
    // fall through
  }

  throw new HttpError("Invalid request body.");
}
