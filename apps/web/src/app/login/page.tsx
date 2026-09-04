"use client";

/**
 * The sign-in form (AISE-015). Client component: POSTs
 * credentials to the server-side auth route; on success the
 * server sets the HttpOnly session cookie and the client
 * navigates to the workspace.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [user, setUser] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ user, passphrase }),
      });
      if (response.ok) {
        router.push("/models");
        router.refresh();
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      setError(body.error === "invalid_credentials" ? "Invalid user or passphrase." : "Sign-in failed.");
    } catch {
      setError("Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-main">
      <section className="login-card" aria-labelledby="login-title">
        <h1 id="login-title">AISE</h1>
        <p className="login-sub">AI Site Engineer — engineering workspace</p>
        <form onSubmit={submit}>
          <label htmlFor="login-user">User</label>
          <input
            id="login-user"
            name="user"
            type="text"
            autoComplete="username"
            value={user}
            onChange={(event) => setUser(event.target.value)}
            required
            minLength={1}
          />
          <label htmlFor="login-passphrase">Passphrase</label>
          <input
            id="login-passphrase"
            name="passphrase"
            type="password"
            autoComplete="current-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            required
            minLength={1}
          />
          {error !== undefined ? (
            <p className="login-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="login-note">
          Read-only engineering workspace. Sessions are server-signed; the browser holds no
          canonical state.
        </p>
      </section>
    </main>
  );
}
