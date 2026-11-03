import type { Sky } from "@/lib/solar";
export function WeatherGlyph({ sky }: { sky: Sky }) {
  return <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{sky === "clear" ? <><circle cx="12" cy="12" r="4" /><path d="M12 1v3m0 16v3M1 12h3m16 0h3M4 4l2 2m12 12 2 2M4 20l2-2M18 6l2-2" /></> : <><path d="M5 17a4 4 0 0 1 0-8 6 6 0 0 1 12-1 4.5 4.5 0 0 1 1 9Z" />{sky === "rain" ? <path d="m7 19-1 3m6-3-1 3m6-3-1 3" /> : null}</>}</svg>;
}
export function ForecastChip({ sky, temperature, time }: { sky: Sky; temperature?: number; time: string | null }) {
  return <div className="wx"><WeatherGlyph sky={sky} /><span>{temperature !== undefined ? `${temperature}°, ${sky === "cloudy" ? "overcast" : sky === "rain" ? "rain, bring a shell" : "clear"}` : ""}{time ? ` at ${time}` : temperature === undefined ? "Time to be decided" : ""}</span></div>;
}
