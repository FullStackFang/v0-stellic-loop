import { afterEach, expect, it, vi } from "vitest";
import { forecast, skyForCode } from "../forecast";
import { BOARD } from "./fixtures";
afterEach(() => vi.unstubAllGlobals());
it.each([[0,"clear"],[2,"clear"],[3,"cloudy"],[45,"cloudy"],[48,"cloudy"],[61,"rain"],[95,"rain"]] as const)("maps weather code %s",(code,sky)=>expect(skyForCode(code)).toBe(sky));
it("does not fetch without a location",async()=>{ const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect(await forecast(BOARD,'2026-11-05')).toEqual({sky:'clear'});expect(fetch).not.toHaveBeenCalled(); });
it("falls back on a network error",async()=>{vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('offline')));expect(await forecast({...BOARD,lat:40,lon:-74},'2026-11-05',new Date('2026-11-03T12:00:00Z'))).toEqual({sky:'clear'});});
