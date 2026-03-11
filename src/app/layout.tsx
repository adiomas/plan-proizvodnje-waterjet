import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plan Proizvodnje - Waterjet",
  description: "Planiranje proizvodnje za waterjet rezanje",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="hr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
