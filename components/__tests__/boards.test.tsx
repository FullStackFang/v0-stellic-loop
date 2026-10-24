// The screens and states quorum-boards adds, and the look gate: every class
// they emit must already exist as a selector in quorum.html v5.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { BOARD, D, prop, resp } from "@/lib/__tests__/fixtures";
import type { BoardData } from "@/lib/load";
import { conflictsFor } from "@/lib/quorum";
import type { Board, Proposal, Response } from "@/lib/types";
import { cardModel, peopleLists } from "@/lib/view";
import { BoardView } from "../BoardView";
import { Card } from "../Card";
import { CopyNames } from "../CopyNames";
import { DayStrip } from "../DayStrip";
import { ProposalView } from "../ProposalView";
import { StartBoard } from "../StartBoard";
import { ToastProvider } from "../Toast";
import { YouView } from "../YouView";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("../Field", () => ({ Field: () => <canvas aria-hidden="true" /> }));
const startBoard = vi.fn();
vi.mock("@/actions/board", () => ({ startBoard: (...a: unknown[]) => startBoard(...a) }));
const verifyCode = vi.fn();
vi.mock("@/actions/verifyCode", () => ({ verifyCode: (...a: unknown[]) => verifyCode(...a) }));

const ROLLING: Board = { id: "r", slug: "strategy-team", name: "Strategy team", tz: "America/New_York", window_kind: "rolling", window_start: null, window_end: null };
const at = (day: string) => new Date(`${day}T17:00:00Z`);
const data = (board: Board, proposals: Proposal[], responses: Response[], ppl: [string, string, boolean?][] = []): BoardData => ({
  board, proposals, responses,
  people: new Map(ppl.map(([id, name, show]) => [id, { id, name, show_name: show ?? true }])),
  conflicts: conflictsFor(proposals, responses),
});

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

describe("the empty board", () => {
  it("the hero, the empty line and Copy the link; no second post button", async () => {
    const { container } = render(<ToastProvider><BoardView board={ROLLING} open={[]} on={[]} past={[]} signedIn /></ToastProvider>);
    expect(screen.getByText(/open · /)).toHaveTextContent("· 0 open · 0 on");
    expect(screen.getByText("Nothing posted yet. Post the first thing you could do.")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Post an intent/ })).toHaveLength(1);
    expect(container.querySelector(".acts .ghost")).toHaveTextContent("Copy the link");
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Copy the link" })));
    expect(clipboard).toHaveBeenCalledWith(`${location.origin}/b/strategy-team`);
    expect(container.querySelector(".toast.show")).toHaveTextContent("Link copied");
    collect(container);
  });

  it("a rolling hero reads Next two weeks", () => {
    render(<ToastProvider><BoardView board={ROLLING} open={[]} on={[]} past={[]} signedIn /></ToastProvider>);
    expect(document.querySelector(".hero .k")).toHaveTextContent("§ 01 · Next two weeks· 0 open · 0 on");
  });
});

describe("strips", () => {
  it("a rolling 14-day strip in rows of seven, every day markable", () => {
    const days = Array.from({ length: 14 }, (_, i) => `2026-11-${String(3 + i).padStart(2, "0")}`);
    const { container } = render(<ToastProvider><DayStrip days={days} selected={["2026-11-05"]} today="2026-11-03" boardId="r" /></ToastProvider>);
    expect(container.querySelector(".days")!.children).toHaveLength(14);
    expect(container.querySelectorAll(".day.busy")).toHaveLength(0);
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
    collect(container);
  });

  it("a fixed strip mid-trip: past days struck, no label, inert", () => {
    const days = Object.values(D);
    const { container } = render(<ToastProvider><DayStrip days={days} selected={[D.mon, D.thu]} today={D.wed} boardId="b" /></ToastProvider>);
    const busy = [...container.querySelectorAll(".day.busy")];
    expect(busy.map((b) => b.querySelector(".num")!.textContent)).toEqual(["14", "15", "16"]);
    for (const b of busy) {
      expect(b).toHaveAttribute("aria-disabled", "true");
      expect(b.querySelector(".src")!.textContent).toBe("");
      expect(b).not.toHaveAttribute("aria-pressed");
    }
    collect(container);
  });

  it("a fixed card mid-trip: past cells blank, best on Thu", () => {
    const p = prop({ min_count: 4 });
    const rs = [...Array.from({ length: 6 }, (_, i) => resp(p.id, `a${i}`, "in", [D.mon, ...(i < 4 ? [D.thu] : [])]))];
    const c = cardModel(p, data(BOARD, [p], rs), null, at(D.wed));
    const { container } = render(<ToastProvider><Card c={c} signedIn={false} /></ToastProvider>);
    expect([...container.querySelectorAll(".mini div")].map((d) => d.textContent)).toEqual(["", "", "", "", "4", "", ""]);
    expect(container.querySelector(".mini .best")).toHaveTextContent("4");
  });

  it("a rolling proposal page: 14 heat cells in rows of seven, the dates in the label, your strip", () => {
    const p = prop({ title: "Case prep Sunday", deadline: "2026-12-06" });
    const rs = [resp(p.id, "me", "in", ["2026-11-29"]), resp(p.id, "marcus", "in", ["2026-11-29"])];
    const d = data(ROLLING, [p], rs, [["marcus", "Marcus"]]);
    const me = { id: "me", show_name: true };
    const c = cardModel(p, d, me, at("2026-11-23"));
    const { container } = render(
      <ToastProvider>
        <ProposalView board={ROLLING} c={c} details={[]} people={peopleLists(p, rs, d.people, me, d.conflicts, ROLLING, at("2026-11-23"))} signedIn isPoster={false} viewerName="Priya" today="2026-11-23" />
      </ToastProvider>,
    );
    expect(container.querySelectorAll(".mini div")).toHaveLength(14);
    expect(screen.getByText(/Nov 23 – Dec 6/)).toHaveTextContent("Nov 23 – Dec 6 · 2 on Sun");
    expect(screen.getByRole("group", { name: "Your days for this one" }).children).toHaveLength(14);
    collect(container);
  });

  it("the You page on a rolling board: two weeks, the dates over the strip", () => {
    render(<ToastProvider><YouView board={ROLLING} me={{ show_name: true }} free={["2026-11-05"]} mine={[]} today="2026-11-03" /></ToastProvider>);
    expect(screen.getByRole("group", { name: "Your free days" }).children).toHaveLength(14);
    expect(screen.getByText("Nov 3 – 16")).toBeInTheDocument();
  });
});

describe("copy names", () => {
  const p = prop({ title: "Ski trip", needs_day: false });
  const rs = [
    ...["priya", "marcus", "dana", "h1", "h2"].map((id) => resp(p.id, id, "in")),
    resp(p.id, "hana", "maybe"),
  ];
  const ppl: [string, string, boolean?][] = [["priya", "Priya"], ["marcus", "Marcus"], ["dana", "Dana"], ["h1", "Secret", false], ["h2", "Hidden", false], ["hana", "Hana"]];

  it("on the proposal page, copies the list and toasts the count; numbers never copied", async () => {
    const d = data(BOARD, [p], rs, ppl);
    const c = cardModel(p, d, null);
    const { container } = render(
      <ToastProvider><ProposalView board={BOARD} c={c} details={[]} people={peopleLists(p, rs, d.people, null, d.conflicts, BOARD)} signedIn={false} isPoster={false} /></ToastProvider>,
    );
    const row = container.querySelector(".page > .acts")!;
    expect([...row.children].map((b) => b.textContent)).toEqual(["Share ↗", "Post a version", "Copy names"]);
    await act(async () => void fireEvent.click(screen.getByRole("button", { name: "Copy names" })));
    expect(clipboard).toHaveBeenCalledWith("Ski trip · 5 in\nPriya, Marcus, Dana and 2 more · Maybe: Hana");
    expect(container.querySelector(".toast.show")).toHaveTextContent("Copied the list · 5 in");
    collect(container);
  });

  it("is not shown when nobody is in", () => {
    const q = prop({ title: "Empty" });
    const d = data(BOARD, [q], []);
    render(<ToastProvider><ProposalView board={BOARD} c={cardModel(q, d, null)} details={[]} people={{ in: [], maybe: [] }} signedIn={false} isPoster={false} /></ToastProvider>);
    expect(screen.queryByRole("button", { name: "Copy names" })).toBeNull();
  });

  it("the button alone", () => {
    const { container } = render(<ToastProvider><CopyNames title="Boat" people={{ in: [{ name: "You", me: true, anon: false, days: "" }], maybe: [] }} viewerName="Priya" /></ToastProvider>);
    collect(container);
  });
});

// Classes from components that predate this change and are not in the mock
// (the inline identity form, its error line, the page wrapper). Nothing new may be added here.
const PREEXISTING = new Set(["idf", "err", "page"]);

afterAll(() => {
  const mock = readFileSync(join(__dirname, "..", "..", "public", "demo", "quorum.html"), "utf8");
  // a class is the mock's if it styles a selector there, or the mock's own markup uses it (".ghost.in" is drawn as class="ghost in")
  const inMock = (c: string) => new RegExp(`\\.${c}(?![\\w-])`).test(mock) || new RegExp(`class="[^"]*(?<![\\w-])${c}(?![\\w-])`).test(mock);
  const missing = [...seen].filter((c) => !PREEXISTING.has(c) && !inMock(c));
  expect(seen.size).toBeGreaterThan(20);
  expect(missing).toEqual([]);
});
