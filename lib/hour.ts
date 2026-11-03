/** Free-text slot times; an unknown time uses neutral midday lighting. */
export function hourOf(text: string | null | undefined): number {
  const value = text?.trim().toLowerCase() ?? "";
  if (value === "noon") return 12;
  if (value === "midnight") return 0;
  const match = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/.exec(value);
  if (!match) return 12;
  const hour = Number(match[1]), minute = Number(match[2] ?? 0), period = match[3];
  if (minute > 59 || (period ? hour < 1 || hour > 12 : hour > 23)) return 12;
  return (period ? hour % 12 + (period === "pm" ? 12 : 0) : hour) + minute / 60;
}
