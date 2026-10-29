import { afterEach, describe, expect, it } from "vitest";
import { isAuthorizedCron } from "@/lib/cron";

describe("isAuthorizedCron", () => {
  const original = process.env.CRON_SECRET;
  afterEach(() => {
    process.env.CRON_SECRET = original;
  });

  it("accepts the bearer token from CRON_SECRET", () => {
    process.env.CRON_SECRET = "s3cret";
    const request = new Request("http://localhost/api/cron/occurrences", {
      headers: { authorization: "Bearer s3cret" },
    });
    expect(isAuthorizedCron(request)).toBe(true);
  });

  it("rejects a missing or wrong token, and fails closed when unset", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isAuthorizedCron(new Request("http://localhost/"))).toBe(false);
    expect(
      isAuthorizedCron(
        new Request("http://localhost/", { headers: { authorization: "Bearer nope" } }),
      ),
    ).toBe(false);

    delete process.env.CRON_SECRET;
    expect(
      isAuthorizedCron(
        new Request("http://localhost/", { headers: { authorization: "Bearer undefined" } }),
      ),
    ).toBe(false);
  });
});
