import type { AdminClient } from "@/lib/loops";

/**
 * In-memory stand-in for the service-role Supabase client, for tests that
 * assert database outcomes without a database. Supports the query shapes
 * lib/rsvp.ts and lib/reminders.ts use: select with eq / neq / is / not-is /
 * gte / lte / lt / in / order / range / maybeSingle, upsert with onConflict (+
 * ignoreDuplicates) optionally followed by select, and delete with eq.
 *
 * Rows live in `tables` as plain objects; tests read and seed them directly.
 */

type Row = Record<string, unknown>;
type Result<T> = { data: T; error: null };
type Filter = (row: Row) => boolean;

export type FakeTables = Record<string, Row[]>;

class FakeQuery<T = unknown> implements PromiseLike<Result<T>> {
  private op: "select" | "upsert" | "delete" = "select";
  private columns: string | null = null;
  private filters: Filter[] = [];
  private ordering: { column: string; ascending: boolean } | null = null;
  private payload: Row[] = [];
  private conflictKeys: string[] = [];
  private ignoreDuplicates = false;
  private singleMode: "maybe" | null = null;
  private window: { from: number; to: number } | null = null;

  constructor(
    private readonly tables: FakeTables,
    private readonly table: string,
  ) {}

  /** On a read, the projection; after a write, asks for the affected rows back. */
  select(columns = "*"): FakeQuery<T> {
    this.columns = columns;
    return this;
  }

  upsert(
    rows: Row | Row[],
    opts: { onConflict?: string; ignoreDuplicates?: boolean } = {},
  ): FakeQuery<T> {
    this.op = "upsert";
    this.payload = Array.isArray(rows) ? rows : [rows];
    this.conflictKeys = (opts.onConflict ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
    this.ignoreDuplicates = opts.ignoreDuplicates ?? false;
    return this;
  }

  delete(): FakeQuery<T> {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: unknown): FakeQuery<T> {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown): FakeQuery<T> {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  is(column: string, value: null | boolean): FakeQuery<T> {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  not(column: string, operator: string, value: unknown): FakeQuery<T> {
    if (operator !== "is") throw new Error(`fakeAdmin: not() supports only 'is', got ${operator}`);
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  gte(column: string, value: string | number): FakeQuery<T> {
    this.filters.push((row) => (row[column] as string | number) >= value);
    return this;
  }

  lte(column: string, value: string | number): FakeQuery<T> {
    this.filters.push((row) => (row[column] as string | number) <= value);
    return this;
  }

  lt(column: string, value: string | number): FakeQuery<T> {
    this.filters.push((row) => (row[column] as string | number) < value);
    return this;
  }

  in(column: string, values: unknown[]): FakeQuery<T> {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  order(column: string, opts: { ascending?: boolean } = {}): FakeQuery<T> {
    this.ordering = { column, ascending: opts.ascending ?? true };
    return this;
  }

  /** Inclusive row window, applied after ordering (PostgREST `Range`). */
  range(from: number, to: number): FakeQuery<T> {
    this.window = { from, to };
    return this;
  }

  maybeSingle<U = T>(): Promise<Result<U | null>> {
    this.singleMode = "maybe";
    return Promise.resolve(this.run() as Result<U | null>);
  }

  then<R1 = Result<T>, R2 = never>(
    onfulfilled?: ((value: Result<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run() as Result<T>).then(onfulfilled, onrejected);
  }

  private rows(): Row[] {
    const list = this.tables[this.table] ?? (this.tables[this.table] = []);
    return list;
  }

  private matching(): Row[] {
    return this.rows().filter((row) => this.filters.every((f) => f(row)));
  }

  private project(row: Row): Row {
    if (this.columns === null || this.columns === "*") return { ...row };
    const out: Row = {};
    for (const col of this.columns.split(",").map((s) => s.trim())) {
      if (col !== "") out[col] = row[col];
    }
    return out;
  }

  private run(): Result<unknown> {
    let affected: Row[];
    if (this.op === "select") {
      affected = this.matching();
      if (this.ordering) {
        const { column, ascending } = this.ordering;
        affected = [...affected].sort((a, b) => {
          const x = a[column] as string | number;
          const y = b[column] as string | number;
          return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
        });
      }
      if (this.window) affected = affected.slice(this.window.from, this.window.to + 1);
    } else if (this.op === "upsert") {
      affected = [];
      for (const incoming of this.payload) {
        const existing =
          this.conflictKeys.length === 0
            ? undefined
            : this.rows().find((row) => this.conflictKeys.every((k) => row[k] === incoming[k]));
        if (existing) {
          if (this.ignoreDuplicates) continue;
          Object.assign(existing, incoming);
          affected.push(existing);
        } else {
          const row = { ...incoming };
          this.rows().push(row);
          affected.push(row);
        }
      }
    } else {
      affected = this.matching();
      const keep = this.rows().filter((row) => !affected.includes(row));
      this.tables[this.table] = keep;
    }

    const projected = affected.map((row) => this.project(row));
    if (this.singleMode === "maybe") {
      if (projected.length > 1) throw new Error(`fakeAdmin: maybeSingle on ${projected.length} rows`);
      return { data: projected[0] ?? null, error: null };
    }
    if (this.op !== "select" && this.columns === null) return { data: null, error: null };
    return { data: projected, error: null };
  }
}

/** What an `rpc` handler returns, shaped like PostgREST's `{ data, error }`. */
export type FakeRpcResult = {
  data: unknown;
  error: { message: string; code?: string; details?: string | null; hint?: string | null } | null;
};
export type FakeRpcHandler = (fn: string, args: Record<string, unknown>, tables: FakeTables) => FakeRpcResult;

export interface FakeAdmin {
  client: AdminClient;
  tables: FakeTables;
  /** Every `rpc(fn, args)` call, in order. */
  rpcCalls: { fn: string; args: Record<string, unknown> }[];
}

/** `opts.rpc` answers `client.rpc(...)`; without it an rpc call throws. */
export function createFakeAdmin(seed: FakeTables = {}, opts: { rpc?: FakeRpcHandler } = {}): FakeAdmin {
  const tables: FakeTables = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map((r) => ({ ...r }));
  const rpcCalls: FakeAdmin["rpcCalls"] = [];
  const client = {
    from(table: string) {
      return new FakeQuery(tables, table);
    },
    rpc(fn: string, args: Record<string, unknown> = {}) {
      rpcCalls.push({ fn, args });
      if (!opts.rpc) throw new Error(`fakeAdmin: rpc(${fn}) called without an rpc handler`);
      return Promise.resolve(opts.rpc(fn, args, tables));
    },
  } as unknown as AdminClient;
  return { client, tables, rpcCalls };
}
