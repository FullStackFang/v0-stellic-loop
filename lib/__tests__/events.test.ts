import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { entryFromUrl, resolveSource, writeEvent } from "../events";
import { LogNotifier } from "../notify";
import { makeBoard, makePerson, openTestDb, type TestDb } from "@/test/db";

let t: TestDb;
beforeAll(async () => void (t = await openTestDb()));
afterAll(() => t.close());
beforeEach(() => t.reset());

describe("entry source", () => {
  it("a share token wins, then a magic src, else the group link", () => {
    expect(entryFromUrl(new URLSearchParams("s=abcDEF1234"))).toBe("proposal_link:abcDEF1234");
    expect(entryFromUrl(new URLSearchParams("src=on_text"))).toBe("on_text");
    expect(entryFromUrl(new URLSearchParams("src=bogus"))).toBe("group_link");
    expect(entryFromUrl(new URLSearchParams("s=short"))).toBe("group_link");
    expect(entryFromUrl(new URLSearchParams(""))).toBe("group_link");
  });
});

describe("writeEvent + resolveSource", () => {
  it("writes and reads an event attributed to a share", async () => {
    const b = await makeBoard(t.db);
    const p = await makePerson(t.db, "Priya");
    const { rows: [prop] } = await t.db.query<{ id: string }>(
      "insert into proposal (board_id, poster_id, title) values ($1, $2, 'Suits') returning id", [b.id, p.id]);
    const { rows: [share] } = await t.db.query<{ id: string }>(
      "insert into share (proposal_id, token, sharer_id) values ($1, 'abcDEF1234', $2) returning id", [prop.id, p.id]);

    const attr = await resolveSource(t.db, "proposal_link:abcDEF1234");
    expect(attr).toEqual({ source: "proposal_link", shareId: share.id });
    await writeEvent(t.db, { boardId: b.id, proposalId: prop.id, personId: p.id, type: "response", ...attr, data: { prev: null, next: "in" } });

    const { rows } = await t.db.query<{ source: string; share_id: string; data: { next: string } }>(
      "select source, share_id, data from event where proposal_id = $1", [prop.id]);
    expect(rows).toEqual([{ source: "proposal_link", share_id: share.id, data: { prev: null, next: "in" } }]);
  });

  it("an unknown share token falls back to the group link", async () => {
    expect(await resolveSource(t.db, "proposal_link:zzzzzzzzzz")).toEqual({ source: "group_link", shareId: null });
    expect(await resolveSource(t.db, undefined)).toEqual({ source: "group_link", shareId: null });
    expect(await resolveSource(t.db, "on_text")).toEqual({ source: "on_text", shareId: null });
  });
});

describe("LogNotifier", () => {
  it("one log line with the body and one text_sent event (channel log) per recipient, never the code in an event", async () => {
    const b = await makeBoard(t.db);
    const p = await makePerson(t.db, "Priya");
    const { rows: [prop] } = await t.db.query<{ id: string }>(
      "insert into proposal (board_id, poster_id, title) values ($1, $2, 'Suits') returning id", [b.id, p.id]);
    const lines: string[] = [];
    const n = new LogNotifier(t.db, (l) => lines.push(l));
    const base = { boardId: b.id, proposalId: prop.id, title: "Suits", url: "https://x/p/1" };

    await n.onReached({ ...base, onDay: "2099-02-16", timeText: null, lockedBy: p.id, yeses: [p.id], cantMakeIt: [], maybes: [] });
    await n.oneMore({ ...base, to: [{ personId: p.id, url: "https://x/p/1?s=AbCdEf1234" }], count: 3, min: 4 });
    await n.maybeNudge({ ...base, to: [p.id], count: 4 });
    await n.dropped({ ...base, to: p.id, who: p.id, count: 3 });
    expect(await n.code({ boardId: b.id, personId: p.id, phone: p.phone, code: "123456" })).toEqual({ sent: true });

    expect(lines).toHaveLength(5);
    expect(JSON.parse(lines[0])).toMatchObject({ notify: "onReached", to: p.phone });
    expect(JSON.parse(lines[0]).body).toMatch(/^Suits is on: Mon 16\. 1 in\. https:\/\/board\.test\/m\/\S+ Got an idea/);
    expect(lines[4]).toContain("123456");
    const { rows } = await t.db.query<{ person_id: string; data: Record<string, unknown> }>(
      "select person_id, data from event where type = 'text_sent' order by at, id");
    expect(rows.map((r) => r.data.kind)).toEqual(["onReached", "oneMore", "maybeNudge", "dropped", "code"]);
    expect(rows.every((r) => r.data.channel === "log" && r.data.status === "sent" && r.person_id === p.id)).toBe(true);
    expect(JSON.stringify(rows)).not.toContain("123456");
    expect(JSON.stringify(rows)).not.toContain("/m/");
  });
});
