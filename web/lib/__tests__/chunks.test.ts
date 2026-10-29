// @vitest-environment node
import { describe, expect, it } from "vitest";
import { chunks } from "@/lib/chunks";

describe("chunks", () => {
  it("yields nothing for an empty list", () => {
    expect(chunks([], 3)).toEqual([]);
  });

  it("splits into consecutive batches of at most size, keeping order", () => {
    expect(chunks([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(chunks(["a", "b"], 2)).toEqual([["a", "b"]]);
  });

  it("defaults to batches of 100", () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
    const batches = chunks(ids);
    expect(batches.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(batches.flat()).toEqual(ids);
  });
});
