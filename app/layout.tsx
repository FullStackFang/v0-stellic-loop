import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";

const archivo = localFont({ src: "../public/fonts/Archivo.ttf", variable: "--font-archivo", weight: "100 900", declarations: [{ prop: "font-stretch", value: "62% 125%" }] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "Loop",
  description: "Post an intent. Tap in. When enough of you join, it forms.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fffdf7" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={archivo.variable}>
      <body>{children}<SiteNav /></body>
    </html>
  );
}
