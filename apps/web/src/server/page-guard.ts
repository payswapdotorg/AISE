/**
 * Page-level session guard (AISE-015): server components read
 * the session cookie directly and redirect unauthenticated
 * visitors to the sign-in page. (No middleware dependency —
 * the guard is explicit, version-proof, and fail-closed.)
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { loadWebConfig } from "./config";
import { SESSION_COOKIE, verifySessionToken } from "./session";

/** Reads the current page session (undefined when unauthenticated). */
export async function pageSession(): Promise<{ user: string } | undefined> {
  const config = loadWebConfig();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = verifySessionToken(config, token, Math.floor(Date.now() / 1000));
  return session !== undefined ? { user: session.user } : undefined;
}

/** Requires a session or redirects to the sign-in page. */
export async function requireSession(): Promise<{ user: string }> {
  const session = await pageSession();
  if (session === undefined) {
    redirect("/login");
  }
  return session;
}
