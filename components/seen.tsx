"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Tells the app each page that is opened, for the admin's Activity section (app/c/seen/route.ts): once when the site
 * loads and once for every page moved to. Only the path is sent. It draws nothing, and a count that fails is dropped.
 */
export function Seen() {
  const path = usePathname();
  useEffect(() => {
    if (!path) return;
    fetch("/c/seen", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ path }) }).catch(() => {});
  }, [path]);
  return null;
}
