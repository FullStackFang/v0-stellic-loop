"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

/** Pages whose address carries a share token: the token is cut before the address leaves the browser. */
const SHARED = /^\/(a|e|m|o|when)\/[^/]+/;
export function redact(event: BeforeSendEvent): BeforeSendEvent {
  const url = new URL(event.url);
  url.pathname = url.pathname.replace(SHARED, "/$1/shared");
  return { ...event, url: url.toString() };
}

/**
 * Vercel Web Analytics: visitors and pages opened, signed in or not, read in the Vercel dashboard. It sets no cookie
 * and sends nothing from a developer's machine. The Conga page is not inside the app and carries the script itself
 * (app/conga/route.ts).
 */
export function SiteAnalytics() {
  return <Analytics beforeSend={redact} />;
}
