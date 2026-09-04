/**
 * `POST /api/auth/login` — mints a signed session cookie.
 *
 * Fail-closed: wrong credentials → 401 (same envelope shape as
 * the API service's errors); non-POST → 405. The session cookie
 * is HttpOnly + SameSite=Lax (no script access, no cross-site
 * POST carries it).
 */
import { NextResponse } from "next/server";
import { loadWebConfig } from "@/server/config";
import { SESSION_COOKIE, credentialsMatch, mintSessionToken, sessionCookieAttributes } from "@/server/session";

export async function POST(request: Request): Promise<NextResponse> {
  let user = "";
  let passphrase = "";
  try {
    const body = (await request.json()) as { user?: unknown; passphrase?: unknown };
    if (typeof body.user === "string") {
      user = body.user;
    }
    if (typeof body.passphrase === "string") {
      passphrase = body.passphrase;
    }
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  if (user.length === 0 || passphrase.length === 0) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const config = loadWebConfig();
  if (config.sessionSecret.length === 0) {
    // Production without AISE_WEB_SESSION_SECRET: fail honestly
    // at sign-in (never issue a cookie that can never verify).
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }
  if (!credentialsMatch(config, user, passphrase)) {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 401 });
  }
  const nowSec = Math.floor(Date.now() / 1000);
  const token = mintSessionToken(config, user, nowSec);
  const response = NextResponse.json({ ok: true, user });
  response.headers.append(
    "set-cookie",
    `${SESSION_COOKIE}=${token}; ${sessionCookieAttributes(config)}`,
  );
  return response;
}

/** Read-only surface: any non-POST is refused (405). */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
