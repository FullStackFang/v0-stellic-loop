import { describe, expect, it } from "vitest";
import { databaseUrl, poolConfig } from "../db";

describe("database connection", () => {
  it("prefers DATABASE_URL, else the Supabase integration's POSTGRES_URL", () => {
    expect(databaseUrl({ DATABASE_URL: "postgres://a", POSTGRES_URL: "postgres://b" })).toBe("postgres://a");
    expect(databaseUrl({ POSTGRES_URL: "postgres://b" })).toBe("postgres://b");
    expect(databaseUrl({})).toBeUndefined();
  });

  it("encrypts to Supabase without verifying its private CA", () => {
    const c = poolConfig("postgres://postgres.ref:pw@aws-0-us-west-2.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x");
    expect(c.ssl).toEqual({ rejectUnauthorized: false });
    expect(c.connectionString).not.toContain("sslmode");
    expect(c.connectionString).toContain("pooler.supabase.com:6543/postgres");
  });

  it("uses no TLS for a local database", () => {
    expect(poolConfig("postgres://postgres@127.0.0.1:54329/postgres").ssl).toBe(false);
    expect(poolConfig("postgres://postgres@localhost:5432/postgres").ssl).toBe(false);
  });
});
