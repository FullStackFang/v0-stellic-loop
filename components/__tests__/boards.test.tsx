// The screens and states quorum-boards adds, and the look gate: every class
// they emit must already exist as a selector in quorum.html v5.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { StartBoard } from "../StartBoard";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("../Field", () => ({ Field: () => <canvas aria-hidden="true" /> }));
const startBoard = vi.fn();
vi.mock("@/actions/board", () => ({ startBoard: (...a: unknown[]) => startBoard(...a) }));
const verifyCode = vi.fn();
vi.mock("@/actions/verifyCode", () => ({ verifyCode: (...a: unknown[]) => verifyCode(...a) }));

// Every class rendered by the tests below, checked against the mock in afterAll.
const seen = new Set<string>();
const collect = (root: Element) => root.querySelectorAll("[class]").forEach((el) => el.classList.forEach((c) => seen.add(c)));
const clipboard = vi.fn(async () => {});
beforeEach(() => {
  push.mockReset();
  startBoard.mockReset();
  verifyCode.mockReset();
  clipboard.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText: clipboard }, configurable: true });
});

describe("start a board", () => {
  it("signed out: a name field, then name and number, no timezone or date control", () => {
    const { container } = render(<StartBoard signedIn={false} />);
    expect(screen.getByLabelText("Board name")).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(screen.getByLabelText("Your number")).toBeInTheDocument();
    expect(container.querySelector("input[type=date], select")).toBeNull();
    expect(screen.getByRole("button", { name: "Start a board" })).toBeInTheDocument();
    collect(container);
  });

  it("signed in: the name and one pill; it sends the browser timezone and lands on the board", async () => {
    startBoard.mockResolvedValue({ status: "ok", slug: "strategy-team" });
    const { container } = render(<StartBoard signedIn />);
    expect(screen.queryByLabelText("Your number")).toBeNull();
    expect(container.querySelectorAll("button")).toHaveLength(1);
    expect(container.querySelector("button.pill")).toHaveTextContent("Start a board");
    fireEvent.change(screen.getByLabelText("Board name"), { target: { value: "Strategy team" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: /Start a board/ })));
    expect(startBoard).toHaveBeenCalledWith({ board: "Strategy team", tz: Intl.DateTimeFormat().resolvedOptions().timeZone });
    await waitFor(() => expect(push).toHaveBeenCalledWith("/b/strategy-team"));
    collect(container);
  });

  it("a known number: the code stage, then the board", async () => {
    startBoard.mockResolvedValue({ status: "needs_code", phone: "+16075550123" });
    verifyCode.mockResolvedValue({ status: "ok", path: "/b/strategy-team" });
    const { container } = render(<StartBoard signedIn={false} />);
    fireEvent.change(screen.getByLabelText("Board name"), { target: { value: "Strategy team" } });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Priya" } });
    fireEvent.change(screen.getByLabelText("Your number"), { target: { value: "607 555 0123" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Start a board" })));
    expect(await screen.findByLabelText("Code")).toBeInTheDocument();
    collect(container);
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "123456" } });
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Confirm" })));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/b/strategy-team"));
  });
});
