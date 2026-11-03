import { describe, expect, it } from "vitest";
import { hourOf } from "../hour";

describe("plan time", () => {
  it.each([
    ["6pm", 18], ["6:30 pm", 18.5], ["18:00", 18], ["6.30pm", 18.5],
    ["noon", 12], ["midnight", 0], ["after class", 12], ["", 12],
    ["12am", 0], ["12 PM", 12], ["7:15am", 7.25], ["25:00", 12],
    ["6:70pm", 12], [null, 12],
  ])("parses %s as %s", (text, expected) => expect(hourOf(text)).toBe(expected));
});
