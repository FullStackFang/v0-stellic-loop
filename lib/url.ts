export function appUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  return `${base}${path}`;
}
