import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const signInWithOtp = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(async () => ({ auth: { verifyOtp, signInWithOtp } })),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { ConfirmGate } from "@/app/auth/confirm/confirm-gate";

const params = (q: Record<string, string>) => Promise.resolve(q);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("/auth/confirm", () => {
  it("renders a Continue button and does not consume the token on render", async () => {
    render(
      await ConfirmGate({
        searchParams: params({ token_hash: "abc123", type: "email", next: "/l/x?intent=watching" }),
      }),
    );

    expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("carries the token and a sanitized next through hidden fields", async () => {
    const { container } = render(
      await ConfirmGate({
        searchParams: params({ token_hash: "abc123", type: "email", next: "https://evil" }),
      }),
    );

    const hidden = (name: string) =>
      container.querySelector<HTMLInputElement>(`input[name="${name}"]`)?.value;
    expect(hidden("token_hash")).toBe("abc123");
    expect(hidden("next")).toBe("/");
  });

  it("shows the expired state with a resend form when no token is present", async () => {
    render(await ConfirmGate({ searchParams: params({ next: "/l/x" }) }));

    expect(screen.getByRole("alert").textContent).toMatch(/expired or was already used/);
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
    expect(screen.getByRole("button", { name: "Send sign-in link" })).toBeTruthy();
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
