import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Live Translate",
  description:
    "Real-time broadcast translation powered by the Gemini Live API.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: some mobile browsers/extensions inject
    // attributes (e.g. __gcrremoteframetoken) onto <html>/<body> before React
    // hydrates, which otherwise triggers a harmless hydration mismatch warning.
    <html lang="tr" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
