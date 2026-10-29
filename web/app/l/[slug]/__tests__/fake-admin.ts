/**
 * A recording stand-in for the service-role Supabase client. Each `from()`
 * starts a call; chained builder methods annotate it; awaiting the builder
 * (or `.single()` / `.maybeSingle()`) asks `respond` for the `data` and
 * resolves `{ data, error: null }` (or `{ data: null, error }` for a `PgError`). Tests inspect `calls` afterwards.
 */

export type FilterCall = { method: string; args: unknown[] };

export type Call = {
  table: string;
  op: "select" | "insert" | "update";
  columns?: string;
  returning?: string;
  payload?: unknown;
  filters: FilterCall[];
  single: boolean;
};

export type Responder = (call: Call) => unknown;

/** Return `pgError(code)` from a responder to resolve `{ data: null, error }` instead. */
export class PgError {
  constructor(
    readonly code: string,
    readonly message = `postgres error ${code}`,
  ) {}
}

export const pgError = (code: string) => new PgError(code);

type Result = { data: unknown; error: PgError | null };

export function fakeAdmin(respond: Responder) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      const call: Call = { table, op: "select", filters: [], single: false };
      calls.push(call);
      return builder(call, respond);
    },
  };
  const find = (table: string, op: Call["op"]) =>
    calls.filter((c) => c.table === table && c.op === op);
  return { client, calls, find };
}

type Builder = {
  select: (columns?: string) => Builder;
  insert: (payload: unknown) => Builder;
  update: (payload: unknown) => Builder;
  eq: (...args: unknown[]) => Builder;
  is: (...args: unknown[]) => Builder;
  gte: (...args: unknown[]) => Builder;
  order: (...args: unknown[]) => Builder;
  limit: (...args: unknown[]) => Builder;
  single: () => Promise<Result>;
  maybeSingle: () => Promise<Result>;
  then: Promise<Result>["then"];
};

function builder(call: Call, respond: Responder): Builder {
  const finish = (): Promise<Result> => {
    const data = respond(call);
    return Promise.resolve(
      data instanceof PgError ? { data: null, error: data } : { data, error: null },
    );
  };
  const filter = (method: string) => {
    return (...args: unknown[]) => {
      call.filters.push({ method, args });
      return b;
    };
  };
  const b: Builder = {
    select(columns = "*") {
      if (call.op === "select") call.columns = columns;
      else call.returning = columns;
      return b;
    },
    insert(payload) {
      call.op = "insert";
      call.payload = payload;
      return b;
    },
    update(payload) {
      call.op = "update";
      call.payload = payload;
      return b;
    },
    eq: filter("eq"),
    is: filter("is"),
    gte: filter("gte"),
    order: filter("order"),
    limit: filter("limit"),
    single() {
      call.single = true;
      return finish();
    },
    maybeSingle() {
      call.single = true;
      return finish();
    },
    then(onFulfilled, onRejected) {
      return finish().then(onFulfilled, onRejected);
    },
  };
  return b;
}

/** `eq` filter value for `column`, or undefined. */
export function eqValue(call: Call, column: string): unknown {
  return call.filters.find((f) => f.method === "eq" && f.args[0] === column)?.args[1];
}

// ---------------------------------------------------------------------------
// Seed-shaped fixtures (web/supabase/seed.sql)
// ---------------------------------------------------------------------------

export const CAMPUS_ID = "c0000000-0000-4000-8000-000000000001";
export const OTHER_CAMPUS_ID = "c0000000-0000-4000-8000-000000000002";
export const LOOP_ID = "10000000-0000-4000-8000-00000000000a";
export const DROP_TOKEN = "drop_donlon2f_groupme_seed";
export const DROP_ID = "d0000000-0000-4000-8000-000000000001";
export const DROP_LABEL = "Donlon 2F GroupMe";
export const OTHER_DROP_TOKEN = "drop_olin_pin_seed";
export const OTHER_DROP_ID = "d0000000-0000-4000-8000-000000000002";

export const SEED_LOOP = {
  id: LOOP_ID,
  slug: "cs2110-thursdays",
  title: "CS 2110 Thursday problem sets",
  weekday: 4,
  start_local: "19:00:00",
  single_occurrence_at: null,
  duration_min: 90,
  place: "Olin Library, 2nd floor group rooms",
  linked_url: "https://lu.ma/cs2110-default",
  campus_id: CAMPUS_ID,
};

export const ONE_OFF_LOOP = {
  id: "10000000-0000-4000-8000-00000000000b",
  slug: "halloween-skate",
  title: "Halloween skate",
  weekday: null,
  start_local: null,
  single_occurrence_at: "2030-10-31T23:30:00.000Z",
  duration_min: 120,
  place: "Lynah Rink",
  linked_url: null,
  campus_id: CAMPUS_ID,
};

/** Thursdays 7:00 PM America/New_York in late October 2030 (EDT, UTC-4). */
export const SEED_OCCURRENCES = [
  { id: "o1", starts_at: "2030-10-24T23:00:00.000Z", linked_url: null, cancelled: false },
  {
    id: "o2",
    starts_at: "2030-10-31T23:00:00.000Z",
    linked_url: "https://lu.ma/cs2110-week2",
    cancelled: false,
  },
];

export const ONE_OFF_OCCURRENCES = [
  { id: "o-once", starts_at: ONE_OFF_LOOP.single_occurrence_at, linked_url: null, cancelled: false },
];

export const PERSON_NAMES = ["Dana", "Sarah", "Josh", "Maya"];

/**
 * Rows a page must never read: other people and other memberships of the
 * loop, carrying every fixture first name, the drop label and token, an RSVP
 * source and intents, several of them so a count would render.
 */
export const LEAK_BAIT_ROWS = PERSON_NAMES.map((name, i) => ({
  id: `leak-${i}`,
  loop_id: LOOP_ID,
  person_id: `leak-person-${i}`,
  first_name: name,
  email: `${name.toLowerCase()}@cornell.edu`,
  campus_id: CAMPUS_ID,
  intent: (["crew_conditional", "going_want_crew", "watching"] as const)[i % 3],
  rsvp_source: "luma",
  drop_id: DROP_ID,
  label: DROP_LABEL,
  token: DROP_TOKEN,
  drop: { id: DROP_ID, label: DROP_LABEL, token: DROP_TOKEN },
  person: { first_name: name },
  crew_id: "crew-leak",
  left_at: null,
}));

/**
 * Answers any `person` select, and any `membership` select not filtered by
 * `eq("person_id", …)`, with leak bait; everything else goes to `respond`.
 * The privacy negatives pass only because the pages never make those reads.
 */
export function withLeakBait(respond: Responder): Responder {
  return (call) => {
    const bait =
      call.op === "select" &&
      (call.table === "person" ||
        (call.table === "membership" && eqValue(call, "person_id") === undefined));
    if (bait) return call.single ? LEAK_BAIT_ROWS[0] : LEAK_BAIT_ROWS;
    return respond(call);
  };
}

/**
 * Loop-side responder: answers loop, campus, occurrence and drop reads the way
 * the seed would, answers member reads a page must not make with leak bait
 * (`withLeakBait`), and defers everything else to `rest`.
 */
export function seedResponder(
  rest: Responder = () => null,
  opts: { loop?: typeof SEED_LOOP | typeof ONE_OFF_LOOP; occurrences?: unknown[] } = {},
): Responder {
  const loop = opts.loop ?? SEED_LOOP;
  const occurrences = opts.occurrences ?? SEED_OCCURRENCES;
  return withLeakBait((call) => {
    if (call.table === "loop" && call.op === "select") {
      const slug = eqValue(call, "slug");
      const id = eqValue(call, "id");
      if (slug !== undefined) return slug === loop.slug ? loop : null;
      if (id !== undefined) return id === loop.id ? loop : null;
      return null;
    }
    if (call.table === "campus") return { tz: "America/New_York" };
    if (call.table === "occurrence") return occurrences;
    if (call.table === "drop") {
      const token = eqValue(call, "token");
      if (eqValue(call, "loop_id") !== LOOP_ID) return null;
      if (token === DROP_TOKEN) return { id: DROP_ID };
      if (token === OTHER_DROP_TOKEN) return { id: OTHER_DROP_ID };
      return null;
    }
    return rest(call);
  });
}
