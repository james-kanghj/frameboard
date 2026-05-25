/apps/web/src/app/layout.tsx

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Frameboard — Prioritization workspace for product teams",
  description:
    "Run RICE, ICE, MoSCoW, and Kano prioritization with your team. Open source, self-hostable, export-first.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
