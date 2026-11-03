import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { solar, type Sky } from "../solar";

// Execute only the pure reference functions, never the mockup's browser code.
const mockup = readFileSync("public/demo/mockups-sun.html", "utf8");
const reference = new Function(`${mockup.slice(mockup.indexOf("const STOPS ="), mockup.indexOf("const STARS ="))}; return solar;`)();

describe("approved Sun wheel", () => {
  for (const sky of ["clear", "cloudy", "rain"] as Sky[]) {
    it.each([6, 12, 18, 22])(`matches the mockup at %s with ${sky}`, (hour) => {
      expect(solar(hour, sky)).toEqual(reference(hour, sky));
    });
  }
  it("wraps midnight and places the sun at the top at noon", () => {
    expect(solar(24, "clear")).toEqual(solar(0, "clear"));
    expect(solar(12, "clear").sun).toEqual({ x: 195, y: 95, vis: 1 });
    expect(solar(22, "clear").fg).toBe("#fffdf7");
  });
});
