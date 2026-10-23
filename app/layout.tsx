import type { Metadata, Viewport } from "next";
import { Geist, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const serif = Source_Serif_4({ variable: "--font-source-serif", subsets: ["latin"], style: ["normal", "italic"], axes: ["opsz"] });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"),
  title: "Quorum",
  description: "Post an intent. Tap in. When enough of you overlap on a day, it asks you to lock it.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f9f4ec" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`fonts ${geist.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
