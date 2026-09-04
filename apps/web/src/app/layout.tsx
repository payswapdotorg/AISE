import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AISE — Engineering Workspace",
  description:
    "AI Site Engineer engineering workspace — authenticated, read-only model browsing over authoritative backend reads (AISE-015).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <main>{children}</main>
      </body>
    </html>
  );
}
