import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Telekonferans — Canlı Çeviri",
  description:
    "Gerçek zamanlı, çok dilli yayın çevirisi. Herkes kendi dilinde dinler.",
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
