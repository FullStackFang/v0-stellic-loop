import { expect, it } from "vitest";
import { parseIntent, serializeIntent, validateIntent } from "../intent";

const days = ["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
it("reads a trailing weekday and keeps generic multiword pins as preferences", () => {
  expect(parseIntent("Dinner Thursdays @after 7 @ramen @Hoi An", days)).toMatchObject({
    title: "Dinner", day: "2026-11-05", time: "", place: "",
    intent: { rhythm: "once", preferences: ["after 7", "ramen", "Hoi An"] }, errors: [],
  });
});
it("keeps unfamiliar activity text and emails intact", () => {
  expect(parseIntent("Suits in Hoi An", days).title).toBe("Suits in Hoi An");
  expect(parseIntent("Email sam@example.com", days).title).toBe("Email sam@example.com");
});
it("round trips explicit slots, rhythm and custom preferences", () => {
  const parsed = parseIntent("Dinner @day:2026-11-05 @time:7:30pm @place:Hoi An @weekly @quiet place", days);
  expect(parsed.errors).toEqual([]);
  expect(parseIntent(serializeIntent(parsed), days)).toEqual(parsed);
});
it("rejects invalid dates, conflicting tags and oversize preferences", () => {
  for (const text of ["Dinner @day:2099-99-99", "Dinner @day:Sunday", "Dinner @weekly @once", "Dinner @" + "a".repeat(61)]) {
    expect(parseIntent(text, days).errors.length).toBeGreaterThan(0);
  }
});
it("deduplicates preferences without losing custom capitalization", () => {
  expect(parseIntent("Dinner @Ramen @ramen", days).intent.preferences).toEqual(["Ramen"]);
});
it("rejects malformed server metadata", () => {
  for (const input of [{ preferences: "ramen", rhythm: "once" }, { preferences: [], rhythm: "daily" }, { preferences: [3], rhythm: "once" }, { preferences: Array.from({length:13},(_,i)=>String(i)), rhythm:"once" }]) {
    expect(validateIntent(input)).toBeNull();
  }
  expect(validateIntent(undefined)).toEqual({ rhythm: "once", preferences: [] });
});
