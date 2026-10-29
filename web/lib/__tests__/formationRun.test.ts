// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeAdmin, type FakeRpcHandler, type FakeTables } from "@/lib/__tests__/fakeAdmin";
import { formationInputHash } from "@/lib/formation";
import { confirmFormation, loadFormationInput, previewFormation } from "@/lib/formationRun";

const LOOP = "loop-a";
const OTHER = "loop-b";

/** PostgREST renders timestamptz with an offset and microseconds. */
const at = (minute: number) => `2026-10-17T09:${String(minute).padStart(2, "0")}:00.123456+00:00`;

function membership(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    loop_id: LOOP,
    person_id: `p-${id}`,
    intent: "crew_conditional",
    tapped_in_at: at(0),
    crew_id: null,
    crewed_at: null,
    left_at: null,
    ...extra,
  };
}

/** Nine eligible members m1..m9, one minute apart, no crews: 9 → 5 + 4. */
function ninePool(): FakeTables {
  return {
    membership: Array.from({ length: 9 }, (_, i) => membership(`m${i + 1}`, { tapped_in_at: at(i) })),
    crew: [],
  };
}

/** Applies placements to the fake tables the way apply_formation does. */
const applyOk: FakeRpcHandler = (_fn, args, tables) => {
  const p = args.p_placements as {
    fills: { crew_id: string; membership_id: string }[];
    new_crews: { membership_ids: string[] }[];
  };
  const place = (id: string, crewId: string) => {
    const m = tables.membership.find((r) => r.id === id)!;
    m.crew_id = crewId;
    m.crewed_at = "2026-10-17T12:00:00+00:00";
  };
  for (const f of p.fills) place(f.membership_id, f.crew_id);
  p.new_crews.forEach((c, i) => {
    const id = `new-${i + 1}`;
    tables.crew.push({ id, loop_id: args.p_loop_id, formed_at: "2026-10-17T12:00:00+00:00", anchored: false });
    for (const m of c.membership_ids) place(m, id);
  });
  return { data: { crews_created: p.new_crews.length, placed: 0, input_hash: args.p_input_hash }, error: null };
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("loadFormationInput", () => {
  it("maps rows to formCrews input with SQL formation_input_hash filters", async () => {
    const { client } = createFakeAdmin({
      membership: [
        membership("e1", { intent: "going_want_crew", tapped_in_at: at(5) }),
        membership("e2", { intent: "crew_conditional", tapped_in_at: at(1) }),
        membership("watch", { intent: "watching" }),
        membership("left", { left_at: "2026-10-16T00:00:00+00:00" }),
        membership("c1a", { crew_id: "c1", crewed_at: at(0) }),
        membership("c1b", { crew_id: "c1", crewed_at: at(0) }),
        membership("c1left", { crew_id: "c1", crewed_at: at(0), left_at: "2026-10-16T00:00:00+00:00" }),
        membership("other", { loop_id: OTHER }),
      ],
      crew: [
        { id: "c1", loop_id: LOOP, formed_at: "2026-10-10T19:00:00+00:00", anchored: true },
        { id: "c2", loop_id: LOOP, formed_at: "2026-10-11T19:00:00+00:00", anchored: false },
        { id: "cx", loop_id: OTHER, formed_at: "2026-10-10T19:00:00+00:00", anchored: false },
      ],
    });

    const input = await loadFormationInput(client, LOOP);

    expect(input.eligible).toEqual([
      { id: "e1", intent: "going_want_crew", tappedInAt: at(5) },
      { id: "e2", intent: "crew_conditional", tappedInAt: at(1) },
    ]);
    expect(input.crews).toEqual([
      { id: "c1", formedAt: "2026-10-10T19:00:00+00:00", activeSize: 2, anchored: true },
      { id: "c2", formedAt: "2026-10-11T19:00:00+00:00", activeSize: 0, anchored: false },
    ]);
    // zoned timestamps hash without throwing
    expect(formationInputHash(input.eligible, input.crews)).toMatch(/^[0-9a-f]{32}$/);
  });

  it("asks for up to 5000 membership rows, past PostgREST's default max_rows", async () => {
    const { client } = createFakeAdmin({
      membership: Array.from({ length: 5001 }, (_, i) => membership(`m${i}`)),
      crew: [],
    });
    const input = await loadFormationInput(client, LOOP);
    expect(input.eligible).toHaveLength(5000);
  });
});

describe("previewFormation", () => {
  it("previews a 9-member pool as new crews of 5 and 4 with name-free counts", async () => {
    const { client, rpcCalls } = createFakeAdmin(ninePool());
    const preview = await previewFormation(client, LOOP);

    expect(preview.counts).toEqual({ placedIntoExisting: 0, newCrewSizes: [5, 4], waiting: 0 });
    expect(preview.inputHash).toMatch(/^[0-9a-f]{32}$/);
    expect(rpcCalls).toHaveLength(0);
  });

  it("counts fills into an existing crew", async () => {
    const tables = ninePool();
    tables.membership = tables.membership.slice(0, 2);
    tables.membership.push(
      ...["x1", "x2", "x3", "x4"].map((id) => membership(id, { crew_id: "c1", crewed_at: at(0) })),
    );
    tables.crew = [{ id: "c1", loop_id: LOOP, formed_at: "2026-10-10T19:00:00+00:00", anchored: false }];
    const { client } = createFakeAdmin(tables);

    const preview = await previewFormation(client, LOOP);
    expect(preview.counts).toEqual({ placedIntoExisting: 1, newCrewSizes: [], waiting: 1 });
  });
});

describe("confirmFormation", () => {
  it("sends apply_formation the exact p_placements JSON and reports every placed member", async () => {
    const tables = ninePool();
    // an existing crew of 4 takes m1 (the oldest), leaving 8 → 4 + 4
    tables.membership.push(
      ...["x1", "x2", "x3", "x4"].map((id) => membership(id, { crew_id: "c1", crewed_at: at(0) })),
    );
    tables.crew = [{ id: "c1", loop_id: LOOP, formed_at: "2026-10-10T19:00:00+00:00", anchored: false }];
    const fake = createFakeAdmin(tables, { rpc: applyOk });
    const { inputHash } = await previewFormation(fake.client, LOOP);

    const res = await confirmFormation(fake.client, LOOP, inputHash);

    expect(fake.rpcCalls).toEqual([
      {
        fn: "apply_formation",
        args: {
          p_loop_id: LOOP,
          p_input_hash: inputHash,
          p_placements: {
            fills: [{ crew_id: "c1", membership_id: "m1" }],
            new_crews: [{ membership_ids: ["m2", "m4", "m6", "m8"] }, { membership_ids: ["m3", "m5", "m7", "m9"] }],
          },
        },
      },
    ]);
    expect(res).toEqual({
      ok: true,
      placedMembershipIds: ["m1", "m2", "m4", "m6", "m8", "m3", "m5", "m7", "m9"],
      crewIds: expect.arrayContaining(["c1", "new-1", "new-2"]),
    });
    if (res.ok) expect(res.crewIds).toHaveLength(3);
  });

  it("returns input_changed without calling rpc when the pool changed since the preview", async () => {
    const fake = createFakeAdmin(ninePool(), { rpc: applyOk });
    const { inputHash } = await previewFormation(fake.client, LOOP);
    fake.tables.membership.push(membership("late", { tapped_in_at: at(30) }));

    expect(await confirmFormation(fake.client, LOOP, inputHash)).toEqual({ ok: false, reason: "input_changed" });
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("maps the formation_input_changed exception to input_changed", async () => {
    const fake = createFakeAdmin(ninePool(), {
      rpc: () => ({
        data: null,
        error: { code: "P0001", message: "formation_input_changed", details: "current input hash …", hint: null },
      }),
    });
    const { inputHash } = await previewFormation(fake.client, LOOP);

    expect(await confirmFormation(fake.client, LOOP, inputHash)).toEqual({ ok: false, reason: "input_changed" });
    expect(fake.rpcCalls).toHaveLength(1);
  });

  it("does not treat the formation_input_changed message under another code as input_changed", async () => {
    const fake = createFakeAdmin(ninePool(), {
      rpc: () => ({ data: null, error: { code: "XX000", message: "formation_input_changed" } }),
    });
    const { inputHash } = await previewFormation(fake.client, LOOP);

    expect(await confirmFormation(fake.client, LOOP, inputHash)).toEqual({ ok: false, reason: "error" });
  });

  it("maps any other rpc error to error", async () => {
    const fake = createFakeAdmin(ninePool(), {
      rpc: () => ({
        data: null,
        error: { code: "P0001", message: "apply_formation: a new crew needs 4 to 6 members, got 3" },
      }),
    });
    const { inputHash } = await previewFormation(fake.client, LOOP);

    expect(await confirmFormation(fake.client, LOOP, inputHash)).toEqual({ ok: false, reason: "error" });
  });

  it("never throws: a thrown rpc becomes error", async () => {
    const fake = createFakeAdmin(ninePool(), {
      rpc: () => {
        throw new Error("network down");
      },
    });
    const { inputHash } = await previewFormation(fake.client, LOOP);

    expect(await confirmFormation(fake.client, LOOP, inputHash)).toEqual({ ok: false, reason: "error" });
  });
});
