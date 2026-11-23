import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { SiteNav } from "@/components/SiteNav";
import "./globals.css";
import "./loop.css";
import "@/components/loading/seats.css";
// The error page is drawn where no page of its own has loaded its styles, so the root layout brings them.
import "@/app/c/campus.css";
import "@/components/errors/spill.css";
import { PressWait } from "@/components/loading/press-wait";
import { FreshWait } from "@/components/loading/fresh-wait";
import { SeatsEnding } from "@/components/loading/seats-ending";
import { Seen } from "@/components/seen";
import { SiteAnalytics } from "@/components/analytics";

const archivo = localFont({ src: "../public/fonts/Archivo.woff2", variable: "--font-archivo", weight: "100 900", declarations: [{ prop: "font-stretch", value: "62% 125%" }] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "Loopd",
  description: "Loopd connects the AI you already use to the groups you are already in. Tell the plan once; everyone can ask their own AI what it is.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fffdf7" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The campus pages set data-kit on <html> before React loads (components/campus/shell.tsx), so it differs from what the server sent.
    // Pages opened are counted on the live site only (components/seen.tsx), so work on a developer's machine is not traffic.
    <html lang="en" className={archivo.variable} suppressHydrationWarning>
      <body>{children}<SiteNav /><FreshWait /><PressWait /><SeatsEnding />{process.env.NODE_ENV === "production" && <Seen />}<SiteAnalytics /></body>
    </html>
  );
}
