// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInWithOtp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { signInWithOtp } })),
}));

import { sendSignInLink } from "@/app/signin/actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const original = process.env.NEXT_PUBLIC_APP_URL;
beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = "https://loop.example";
  signInWithOtp.mockResolvedValue({ data: {}, error: null });
});
afterEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = original;
  vi.clearAllMocks();
});

describe("sendSignInLink", () => {
  it("sends the final destination as emailRedirectTo and reports sent", async () => {
    const state = await sendSignInLink(
      { status: "idle" },
      form({ email: " Sarah@Cornell.edu ", next: "/l/x?intent=watching&d=abc" }),
    );

    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "sarah@cornell.edu",
      options: {
        emailRedirectTo: "https://loop.example/l/x?intent=watching&d=abc",
        shouldCreateUser: true,
      },
    });
    expect(state).toEqual({ status: "sent", email: "sarah@cornell.edu" });
  });

  it("falls back to the app root for a bad next", async () => {
    await sendSignInLink({ status: "idle" }, form({ email: "a@cornell.edu", next: "https://evil" }));
    expect(signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toBe("https://loop.example/");
  });

  it("tolerates a trailing slash on NEXT_PUBLIC_APP_URL", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://loop.example/";
    await sendSignInLink({ status: "idle" }, form({ email: "a@cornell.edu", next: "/org/new" }));
    expect(signInWithOtp.mock.calls[0][0].options.emailRedirectTo).toBe(
      "https://loop.example/org/new",
    );
  });

  it("maps the campus hook rejection and other errors without calling Supabase for junk", async () => {
    signInWithOtp.mockResolvedValueOnce({
      data: {},
      error: { message: "A campus email is required", status: 403 },
    });
    expect(await sendSignInLink({ status: "idle" }, form({ email: "a@gmail.com" }))).toEqual({
      status: "error",
      message: "A campus email is required. Use your university address.",
    });

    signInWithOtp.mockResolvedValueOnce({
      data: {},
      error: { message: "rate limit", status: 429, code: "over_email_send_rate_limit" },
    });
    const generic = await sendSignInLink({ status: "idle" }, form({ email: "a@cornell.edu" }));
    expect(generic.status).toBe("error");
    expect(generic).not.toHaveProperty("message", "A campus email is required. Use your university address.");

    signInWithOtp.mockResolvedValueOnce({
      data: {},
      error: { message: "Signups not allowed for otp", status: 422, code: "otp_disabled" },
    });
    expect(await sendSignInLink({ status: "idle" }, form({ email: "a@cornell.edu" }))).toEqual({
      status: "error",
      message: "We couldn't send the link just now. Try again in a minute.",
    });

    signInWithOtp.mockClear();
    expect(await sendSignInLink({ status: "idle" }, form({ email: "nope" }))).toEqual({
      status: "error",
      message: "Enter your email address.",
    });
    expect(signInWithOtp).not.toHaveBeenCalled();
  });
});
