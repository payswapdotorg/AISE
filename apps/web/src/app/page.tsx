import { redirect } from "next/navigation";

/**
 * The workspace root: authenticated visitors land on the model
 * list; the guard layer sends everyone else to sign-in first
 * (stable routing: / → /models).
 */
export default function RootPage() {
  redirect("/models");
}
