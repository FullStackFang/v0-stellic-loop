import { describe, expect, it } from "vitest";
import { slugify } from "../slug";

describe("slugify", () => {
  it("folds a name to lowercase ASCII and single hyphens", () => {
    expect(slugify("Ski Club '26!")).toBe("ski-club-26");
    expect(slugify("Strategy team")).toBe("strategy-team");
    expect(slugify("  --Café Société--  ")).toBe("cafe-societe");
    expect(slugify("Ñandú & Zürich")).toBe("nandu-zurich");
  });

  it("cuts the base at 28 characters without a trailing hyphen", () => {
    const s = slugify("The Very Long Name Of A Board That Goes On And On For Sixty!");
    expect(s.length).toBeLessThanOrEqual(28);
    expect(s).toBe("the-very-long-name-of-a-boar");
    expect(slugify("abcdefghijklmnopqrstuvwxyz a b")).toBe("abcdefghijklmnopqrstuvwxyz-a");
    expect(slugify("abcdefghijklmnopqrstuvwxyz1 b")).not.toMatch(/-$/);
  });

  it("a name with no letters or digits gets a random 6-character slug", () => {
    const a = slugify("🎿🏂 !!! ✨");
    expect(a).toMatch(/^[a-z0-9]{6}$/);
    expect(slugify("✨✨")).not.toBe(a);
  });
});
