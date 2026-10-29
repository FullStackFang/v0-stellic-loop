// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { isAuthorizedCron } from "@/lib/cron";

const original = process.env.CRON_SECRET;

function request(authorization?: string): Request {
  return new Request("https://loop.example/api/cron/x", {
    headers: authorization === undefined ? {} : { authorization },
  });
}

afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = original;
});

describe("isAuthorizedCron", () => {
  it("accepts the correct bearer", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isAuthorizedCron(request("Bearer s3cret"))).toBe(true);
  });

  it("rejects a wrong bearer, including one of the same length", () => {
    process.env.CRON_SECRET = "s3cret";
    expect(isAuthorizedCron(request("Bearer s3creX"))).toBe(false);
    expect(isAuthorizedCron(request("Bearer nope"))).toBe(false);
    expect(isAuthorizedCron(request())).toBe(false);
  });

  it('rejects "Bearer " when the secret is unset or empty', () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCron(request("Bearer "))).toBe(false);
    process.env.CRON_SECRET = "";
    expect(isAuthorizedCron(request("Bearer "))).toBe(false);
  });

  it('rejects "Bearer undefined" when the secret is unset', () => {
    delete process.env.CRON_SECRET;
    expect(isAuthorizedCron(request("Bearer undefined"))).toBe(false);
  });
});
