// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const select = vi.fn();
  const is = vi.fn(() => ({ select }));
  const eq = vi.fn(() => ({ is }));
  const update = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ update }));
  const createAdminClient = vi.fn(() => ({ from }));
  const getSession = vi.fn();
  const redirect = vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  });
  return { select, is, eq, update, from, createAdminClient, getSession, redirect };
});

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  getSession: mocks.getSession,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { saveFirstName } from "@/app/welcome/actions";

const USER_ID = "6f1c2d3e-4a5b-4c6d-8e9f-0a1b2c3d4e5f";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

beforeEach(() => {
  mocks.getSession.mockResolvedValue({ userId: USER_ID, email: "sarah@cornell.edu" });
  mocks.select.mockResolvedValue({ data: [{ id: USER_ID }], error: null });
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("saveFirstName", () => {
  it("writes the collapsed name to the session's own unnamed row, then redirects to next", async () => {
    await expect(
      saveFirstName({ status: "idle" }, form({ first_name: "  Sarah \n ", next: "/l/x" })),
    ).rejects.toThrow("REDIRECT:/l/x");

    expect(mocks.createAdminClient).toHaveBeenCalledTimes(1);
    expect(mocks.from).toHaveBeenCalledWith("person");
    expect(mocks.update).toHaveBeenCalledWith({ first_name: "Sarah" });
    expect(mocks.eq).toHaveBeenCalledWith("id", USER_ID);
    expect(mocks.is).toHaveBeenCalledWith("first_name", null);
    expect(mocks.select).toHaveBeenCalledWith("id");
    expect(mocks.redirect).toHaveBeenCalledWith("/l/x");
  });

  it("collapses inner whitespace", async () => {
    await expect(
      saveFirstName({ status: "idle" }, form({ first_name: "Mary   Jane", next: "/l/x" })),
    ).rejects.toThrow("REDIRECT:/l/x");
    expect(mocks.update).toHaveBeenCalledWith({ first_name: "Mary Jane" });
  });

  it("redirects to sign-in when signed out, without creating the admin client", async () => {
    mocks.getSession.mockResolvedValueOnce(null);
    await expect(
      saveFirstName({ status: "idle" }, form({ first_name: "Sarah", next: "/l/x" })),
    ).rejects.toThrow("REDIRECT:/signin?next=%2Fl%2Fx");
    expect(mocks.redirect).toHaveBeenCalledWith("/signin?next=%2Fl%2Fx");
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it("rejects a blank or over-long name before touching the session or database", async () => {
    expect(await saveFirstName({ status: "idle" }, form({ first_name: "   ", next: "/l/x" }))).toEqual({
      status: "error",
      message: "Enter your first name.",
    });
    expect(
      await saveFirstName({ status: "idle" }, form({ first_name: "a".repeat(41), next: "/l/x" })),
    ).toEqual({ status: "error", message: "Keep it under 40 characters." });
    expect(mocks.getSession).not.toHaveBeenCalled();
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("still redirects to next when no row was updated because the person is already named", async () => {
    mocks.select.mockResolvedValueOnce({ data: [], error: null });
    await expect(
      saveFirstName({ status: "idle" }, form({ first_name: "Sarah", next: "/l/x" })),
    ).rejects.toThrow("REDIRECT:/l/x");
    expect(mocks.is).toHaveBeenCalledWith("first_name", null);
  });

  it("returns an error state when the write fails", async () => {
    mocks.select.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await saveFirstName({ status: "idle" }, form({ first_name: "Sarah", next: "/l/x" }))).toEqual(
      { status: "error", message: "We couldn't save that just now. Try again." },
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("sanitizes next", async () => {
    await expect(
      saveFirstName({ status: "idle" }, form({ first_name: "Sarah", next: "https://evil" })),
    ).rejects.toThrow("REDIRECT:/");
  });
});
