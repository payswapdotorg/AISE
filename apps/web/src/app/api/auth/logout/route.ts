/**
 * `POST /api/auth/logout` — clears the session cookie.
 */
import { NextResponse } from "next/server";
import { SESSION_COOKIE, clearSessionCookie } from "@/server/session";

export async function POST(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.headers.append("set-cookie", clearSessionCookie());
  void SESSION_COOKIE;
  return response;
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
