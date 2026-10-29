// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyOtp: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { verifyOtp: mocks.verifyOtp } })),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { confirmSignIn } from "@/app/auth/confirm/actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("confirmSignIn", () => {
  it("verifies the token hash as an email OTP, then redirects to next", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ data: {}, error: null });

    await expect(
      confirmSignIn({ status: "idle" }, form({ token_hash: "abc", next: "/l/x?intent=watching" })),
    ).rejects.toThrow("REDIRECT:/l/x?intent=watching");

    expect(mocks.verifyOtp).toHaveBeenCalledTimes(1);
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "abc" });
    expect(mocks.redirect).toHaveBeenCalledWith("/l/x?intent=watching");
  });

  it("returns the error state and does not redirect when the token is expired or used", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({
      data: {},
      error: { message: "Token has expired or is invalid", status: 403, code: "otp_expired" },
    });

    expect(await confirmSignIn({ status: "idle" }, form({ token_hash: "abc", next: "/l/x" }))).toEqual({
      status: "error",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("drops an external next and redirects to the root", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ data: {}, error: null });
    await expect(
      confirmSignIn({ status: "idle" }, form({ token_hash: "abc", next: "https://evil" })),
    ).rejects.toThrow("REDIRECT:/");
    expect(mocks.redirect).toHaveBeenCalledWith("/");
  });

  it("returns the error state without calling verifyOtp when the token is empty", async () => {
    expect(await confirmSignIn({ status: "idle" }, form({ token_hash: "", next: "/l/x" }))).toEqual({
      status: "error",
    });
    expect(await confirmSignIn({ status: "idle" }, form({ next: "/l/x" }))).toEqual({
      status: "error",
    });
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
