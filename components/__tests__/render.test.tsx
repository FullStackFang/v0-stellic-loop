import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOARD, D, NOW, prop, resp } from "@/lib/__tests__/fixtures";
import type { BoardData } from "@/lib/load";
import { conflictsFor, sortBoard } from "@/lib/quorum";
import type { Proposal, Response } from "@/lib/types";
import { cardModel, countLine, peopleLists } from "@/lib/view";
import { Ask } from "../Ask";
import { BoardView } from "../BoardView";
import { IdentityFields } from "../IdentityFields";
import { ProposalView } from "../ProposalView";
import { ToastProvider } from "../Toast";
import { YouView } from "../YouView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
// Canvas is not drawn in jsdom; the hero shell is what's under test.
vi.mock("../Field", () => ({ Field: () => <canvas aria-hidden="true" /> }));

const people = (names: [string, string, boolean?][]): BoardData["people"] =>
  new Map(names.map(([id, name, show]) => [id, { id, name, show_name: show ?? true }]));

function data(proposals: Proposal[], responses: Response[], ppl = people([])): BoardData {
  return { board: BOARD, proposals, responses, people: ppl, conflicts: conflictsFor(proposals, responses) };
}

const ident = { name: "", phone: "", code: "" };

describe("IdentityFields", () => {
  it("shows nothing with a cookie", () => {
    const { container } = render(<IdentityFields signedIn stage="identity" value={ident} onChange={() => {}} onSubmit={() => {}} cta="I'm in" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("shows name and number without a cookie", () => {
    render(<IdentityFields signedIn={false} stage="identity" value={ident} onChange={() => {}} onSubmit={() => {}} cta="I'm in" />);
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(screen.getByLabelText("Your number")).toBeInTheDocument();
  });

  it("shows the code field when the number is known", () => {
    render(<IdentityFields signedIn={false} stage="code" value={ident} onChange={() => {}} onSubmit={() => {}} cta="I'm in" />);
    expect(screen.getByLabelText("Code")).toBeInTheDocument();
    expect(screen.queryByLabelText("Your name")).toBeNull();
  });
});

describe("Ask", () => {
  beforeEach(() => localStorage.clear());

  it("needs-a-day copy", () => {
    render(<ToastProvider><Ask proposalId="p1" ask={{ count: 6, of: 8, dayLong: "Tuesday 16", cta: "Lock it in" }} /></ToastProvider>);
    expect(screen.getByText(/6 of 8 can do/)).toHaveTextContent("6 of 8 can do Tuesday 16. Lock it in?");
    expect(screen.getByRole("button", { name: /Lock it in/ })).toBeInTheDocument();
  });

  it("no-day copy", () => {
    render(<ToastProvider><Ask proposalId="p2" ask={{ count: 5, of: 5, dayLong: null, cta: "It's on" }} /></ToastProvider>);
    expect(screen.getByText(/of you want this/)).toHaveTextContent("5 of you want this. Make it happen?");
    expect(screen.getByRole("button", { name: /It's on/ })).toBeInTheDocument();
  });

  it("Not yet hides it for this viewer only", () => {
    const { unmount } = render(<ToastProvider><Ask proposalId="p3" ask={{ count: 4, of: 4, dayLong: null, cta: "It's on" }} /></ToastProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Not yet" }));
    expect(screen.queryByText(/want this/)).toBeNull();
    unmount();
    render(<ToastProvider><Ask proposalId="p3" ask={{ count: 4, of: 4, dayLong: null, cta: "It's on" }} /></ToastProvider>);
    expect(screen.queryByText(/want this/)).toBeNull();
  });
});

describe("board", () => {
  it("orders B (ready), A, E, then C (ON), then D (idled), with live hero counts", () => {
    const A = prop({ title: "A" });
    const B = prop({ title: "B" });
    const C = prop({ title: "C", status: "on", on_day: D.thu, on_at: "x" });
    const Dp = prop({ title: "D", deadline: "2027-01-01" });
    const E = prop({ title: "E", min_count: 5 });
    const rs = [
      ...["a1", "a2"].map((id) => resp(A.id, id, "in", [D.tue])),
      ...["b1", "b2", "b3", "b4"].map((id) => resp(B.id, id, "in", [D.tue])),
      ...["c1", "c2"].map((id) => resp(C.id, id, "in", [D.thu])),
      resp(E.id, "e1", "in", [D.tue]),
    ];
    const all = [A, B, C, Dp, E];
    const d = data(all, rs);
    const items = all.map((p) => ({ proposal: p, responses: rs.filter((r) => r.proposal_id === p.id) }));
    const s = sortBoard(items, BOARD, d.conflicts, NOW);
    const m = (it: (typeof items)[number]) => cardModel(it.proposal, d, null, NOW);
    render(<ToastProvider><BoardView board={BOARD} open={s.open.map(m)} on={s.on.map(m)} past={s.past.map(m)} signedIn={false} /></ToastProvider>);
    expect(screen.getAllByRole("article").map((a) => within(a).getByRole("link").textContent)).toEqual(["B", "A", "E", "C", "D"]);
    expect(screen.getByText(/open · /)).toHaveTextContent("· 3 open · 1 on");
    expect(screen.getByRole("heading", { name: "What we could do" })).toBeInTheDocument();
  });

  it("a ready card: carnelian date block, Ready chip, count, heat, ask", () => {
    const S = prop({ title: "Suits in Hoi An", min_count: 6, cost_text: "~$250" });
    const rs = [
      ...Array.from({ length: 6 }, (_, i) => resp(S.id, `y${i}`, "in", [D.tue])),
      resp(S.id, "n1", "in", [D.wed]),
      resp(S.id, "n2", "in", [D.mon]),
    ];
    const c = cardModel(S, data([S], rs), null, NOW);
    render(<ToastProvider><BoardView board={BOARD} open={[c]} on={[]} past={[]} signedIn={false} /></ToastProvider>);
    const card = screen.getByRole("article");
    expect(card.querySelector(".date.ready")).toHaveTextContent("Feb16Tue");
    expect(within(card).getByText("Ready")).toBeInTheDocument();
    expect(within(card).getByText("6 of 8")).toBeInTheDocument();
    expect(within(card).getByText(/can do Tue/)).toBeInTheDocument();
    expect(card.querySelector(".mini .best")).toHaveTextContent("6");
    expect(within(card).getByText(/Lock it in\?/)).toBeInTheDocument();
  });

  it("an ON card: moss, filled date block, On chip, who locked it, In / Out", () => {
    const F = prop({ title: "5am flight", status: "on", on_day: D.thu, on_at: "x", locked_by: "maya", time_text: "5:10am", cost_text: "$90" });
    const rs = ["josh", "maya", "dana"].map((id) => resp(F.id, id, "in", [D.thu]));
    const c = cardModel(F, data([F], rs, people([["maya", "Maya"], ["josh", "Josh"], ["dana", "Dana"]])), null, NOW);
    render(<ToastProvider><BoardView board={BOARD} open={[]} on={[c]} past={[]} signedIn={false} /></ToastProvider>);
    const card = screen.getByRole("article");
    expect(card).toHaveClass("on");
    expect(card.querySelector(".date.on")).toHaveTextContent("Feb18Thu");
    expect(within(card).getByText("On")).toBeInTheDocument();
    expect(within(card).getByText("5:10am · $90 · Maya locked it")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "I'm in" })).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Out" })).toBeInTheDocument();
    expect(within(card).queryByRole("button", { name: "Maybe" })).toBeNull();
  });

  it("maybes show as their own count and never lift", () => {
    const P = prop({ needs_day: false });
    const rs = [...["a", "b", "c"].map((id) => resp(P.id, id, "in")), ...["m1", "m2", "m3", "m4", "m5"].map((id) => resp(P.id, id, "maybe"))];
    const c = cardModel(P, data([P], rs), null, NOW);
    expect(c.state).toBe("open");
    expect(c.who).toBe("3 in · 5 maybe");
  });

  it("a conflict is explained on the card", () => {
    const suits = prop({ title: "Suits in Hoi An", status: "on", on_day: D.tue, on_at: "x" });
    const boat = prop({ title: "Overnight boat" });
    const rs = [resp(suits.id, "me", "in", [D.tue]), resp(boat.id, "me", "in", [D.mon, D.tue])];
    const c = cardModel(boat, data([suits, boat], rs), { id: "me", show_name: true }, NOW);
    expect(c.conflict).toBe("Suits in Hoi An Tue 16");
    expect(c.myDays).toEqual([D.mon]);
  });

  it("the conflict is still explained after tap-in removed the day", () => {
    const suits = prop({ title: "Suits in Hoi An", status: "on", on_day: D.tue, on_at: "x" });
    const boat = prop({ title: "Overnight boat" });
    const rs = [resp(suits.id, "me", "in", [D.tue]), resp(boat.id, "me", "in", [D.mon])];
    const c = cardModel(boat, data([suits, boat], rs), { id: "me", show_name: true, free: [D.mon, D.tue] }, NOW);
    expect(c.conflict).toBe("Suits in Hoi An Tue 16");
  });
});

describe("proposal page", () => {
  const S = prop({ title: "Suits in Hoi An", min_count: 8, cost_text: "~$250", poster_id: "priya" });
  const rs = [
    resp(S.id, "priya", "in", [D.tue]),
    resp(S.id, "marcus", "in", [D.tue, D.wed]),
    resp(S.id, "anon", "in", [D.tue]),
    resp(S.id, "hana", "maybe"),
  ];
  const ppl = people([["priya", "Priya"], ["marcus", "Marcus"], ["anon", "Secret", false], ["hana", "Hana"]]);

  it("lists In and Maybe honouring the name switch; heat shows counts only", () => {
    const d = data([S], rs, ppl);
    const c = cardModel(S, d, null, NOW);
    render(
      <ToastProvider>
        <ProposalView board={BOARD} c={c} details={[{ k: "link", text: "yalycouture.com", url: "https://yalycouture.com", by: "Priya" }]} people={peopleLists(S, rs, ppl, null, d.conflicts, BOARD, NOW)} signedIn={false} isPoster={false} />
      </ToastProvider>,
    );
    const names = [...document.querySelectorAll(".person")].map((el) => el.textContent);
    expect(names).toEqual(["PPriyaTue", "MMarcusTue Wed", "++1 anonymousTue", "HHanamaybe"]);
    expect(document.body.textContent).not.toContain("Secret");
    expect(document.querySelector(".mini")?.textContent).toBe("3" + "1");
    expect(screen.getByText("Tap in to add details.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Post a version" })).toHaveAttribute("href", `/b/emba27/new?from=${S.id}`);
  });

  it("og:title is the count line", () => {
    const c = cardModel(S, data([S], rs, ppl), null, NOW);
    expect(countLine(c)).toBe("3 of 8 in · Suits in Hoi An · Tue 16");
  });

  it("the poster sees their controls", () => {
    const d = data([S], rs, ppl);
    const me = { id: "priya", show_name: true };
    const c = cardModel(S, d, me, NOW);
    render(<ToastProvider><ProposalView board={BOARD} c={c} details={[]} people={peopleLists(S, rs, ppl, me, d.conflicts, BOARD, NOW)} signedIn isPoster /></ToastProvider>);
    expect(screen.getByLabelText("One line")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close it" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add a link, a place, a note")).toBeInTheDocument();
  });
});

describe("you page", () => {
  it("shows the free strip, the name switch and what you're in", () => {
    const boat = prop({ title: "Overnight boat" });
    const shirts = prop({ title: "Cohort shirts", needs_day: false });
    const rs = [resp(boat.id, "me", "in", [D.mon, D.tue]), resp(shirts.id, "me", "in")];
    const me = { id: "me", show_name: false };
    const d = data([boat, shirts], rs);
    const mine = [boat, shirts].map((p) => cardModel(p, d, me, NOW));
    render(<ToastProvider><YouView board={BOARD} me={me} free={[D.mon, D.tue]} mine={mine} /></ToastProvider>);
    const strip = screen.getByRole("group", { name: "Your free days" });
    expect(within(strip).getAllByRole("button")).toHaveLength(7);
    expect(within(strip).getAllByRole("button", { pressed: true })).toHaveLength(2);
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByText("Your days: Mon · Tue")).toBeInTheDocument();
    expect(screen.getByText("No day needed")).toBeInTheDocument();
  });

  it("asks a stranger to tap in first", () => {
    render(<YouView board={BOARD} me={null} free={[]} mine={[]} />);
    expect(screen.getByText(/Tap in on something/)).toBeInTheDocument();
  });
});
