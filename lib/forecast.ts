import "server-only";
import { cache } from "react";
import type { Board } from "./types";
import type { Sky } from "./solar";
import { todayIn } from "./days";
export type Forecast = { sky: Sky; temperature?: number };
export function skyForCode(code: number): Sky {
  return code >= 51 ? "rain" : code === 3 || code >= 45 && code <= 48 ? "cloudy" : "clear";
}
const lookup = cache(async (id: string, lat: number, lon: number, tz: string, day: string): Promise<Forecast> => {
  try {
    const query = new URLSearchParams({ latitude: String(lat), longitude: String(lon), timezone: tz, start_date: day, end_date: day, daily: "weather_code,temperature_2m_max" });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { signal: AbortSignal.timeout(2000), next: { revalidate: 21600, tags: [`forecast:${id}:${day}`] } });
    if (!response.ok) return { sky: "clear" };
    const data = await response.json();
    const code = data.daily?.weather_code?.[0], temperature = data.daily?.temperature_2m_max?.[0];
    if (typeof code !== "number" || typeof temperature !== "number" || !Number.isFinite(temperature)) return { sky: "clear" };
    return { sky: skyForCode(code), temperature: Math.round(temperature) };
  } catch { return { sky: "clear" }; }
});
export async function forecast(board: Board, day: string | null, now = new Date()): Promise<Forecast> {
  if (board.lat == null || board.lon == null || !day) return { sky: "clear" };
  const offset = (Date.parse(day) - Date.parse(todayIn(board.tz, now))) / 86400e3;
  if (!Number.isFinite(offset) || offset < 0 || offset >= 16) return { sky: "clear" };
  return lookup(board.id, board.lat, board.lon, board.tz, day);
}
