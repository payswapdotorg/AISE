import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AISE — Web Foundation",
  description:
    "AI Site Engineer web workspace foundation. The engineering workspace is implemented in AISE-015.",
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
