/**
 * Minimal stand-in for the PostgREST query builder. `from(table)` returns a
 * chain; awaiting it records the operation in `calls` (selects included,
 * with every filter in call order) and resolves:
 *
 * - select: the rows configured for that table, narrowed by the `eq`, `is`,
 *   and `in` filters (a row lacking the filtered column does not match);
 * - insert: the payload, or `{ id: "<table>-new" }` with `.single()`;
 * - upsert: the payload (the call also records its `options`, e.g. `onConflict`);
 * - update / delete: one placeholder row, or none for a table listed in
 *   `zeroRowUpdates`.
 *
 * `gt` / `lt` filters are recorded and, on selects, compare with `>` / `<`.
 */

export type Filter =
  | ["eq" | "is" | "gt" | "lt", string, unknown]
  | ["in", string, unknown[]];

export type Call = {
  table: string;
  op: "select" | "insert" | "upsert" | "update" | "delete";
  payload?: unknown;
  options?: unknown;
  filters: Filter[];
};

type DbError = { code: string; message: string };

export type FakeOptions = {
  tables?: Record<string, unknown[]>;
  /** Error to return for an insert into the named table (e.g. a unique violation). */
  insertErrors?: Record<string, DbError>;
  /** Error to return for a delete from the named table. */
  deleteErrors?: Record<string, DbError>;
  /** Tables whose updates match no row (data `[]`, no error). */
  zeroRowUpdates?: string[];
};

type Result = { data: unknown; error: unknown };

function matches(row: unknown, filter: Filter): boolean {
  const record = row as Record<string, unknown>;
  const [kind, column, value] = filter;
  if (!(column in record)) return false;
  if (kind === "in") return (value as unknown[]).includes(record[column]);
  if (kind === "gt") return (record[column] as string | number) > (value as string | number);
  if (kind === "lt") return (record[column] as string | number) < (value as string | number);
  return record[column] === value;
}

export function fakeSupabase(options: FakeOptions = {}) {
  const calls: Call[] = [];
  const tables = options.tables ?? {};
  const insertErrors = options.insertErrors ?? {};
  const deleteErrors = options.deleteErrors ?? {};
  const zeroRowUpdates = new Set(options.zeroRowUpdates ?? []);

  function from(table: string) {
    let op: Call["op"] = "select";
    let payload: unknown;
    let upsertOptions: unknown;
    let single = false;
    const filters: Filter[] = [];

    const resolve = (): Result => {
      const call: Call = { table, op, filters };
      if (op === "insert" || op === "update" || op === "upsert") call.payload = payload;
      if (op === "upsert") call.options = upsertOptions;
      calls.push(call);

      if (op === "upsert") return { data: payload, error: null };
      if (op === "insert") {
        const error = insertErrors[table];
        if (error) return { data: null, error };
        return { data: single ? { id: `${table}-new` } : payload, error: null };
      }
      if (op === "delete") {
        const error = deleteErrors[table];
        if (error) return { data: null, error };
        return { data: [{ id: `${table}-row` }], error: null };
      }
      if (op === "update") {
        return { data: zeroRowUpdates.has(table) ? [] : [{ id: `${table}-row` }], error: null };
      }
      const rows = (tables[table] ?? []).filter((row) => filters.every((f) => matches(row, f)));
      return { data: single ? (rows[0] ?? null) : rows, error: null };
    };

    const chain = {
      // A select after a write (`.insert(...).select("id")`) keeps the write op.
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters.push(["eq", column, value]);
        return chain;
      },
      is: (column: string, value: unknown) => {
        filters.push(["is", column, value]);
        return chain;
      },
      in: (column: string, values: unknown[]) => {
        filters.push(["in", column, values]);
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      insert: (rows: unknown) => {
        op = "insert";
        payload = rows;
        return chain;
      },
      upsert: (rows: unknown, opts?: unknown) => {
        op = "upsert";
        payload = rows;
        upsertOptions = opts;
        return chain;
      },
      gt: (column: string, value: unknown) => {
        filters.push(["gt", column, value]);
        return chain;
      },
      lt: (column: string, value: unknown) => {
        filters.push(["lt", column, value]);
        return chain;
      },
      update: (values: unknown) => {
        op = "update";
        payload = values;
        return chain;
      },
      delete: () => {
        op = "delete";
        return chain;
      },
      single: () => {
        single = true;
        return chain;
      },
      maybeSingle: () => {
        single = true;
        return chain;
      },
      then: (onFulfilled: (r: Result) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled, onRejected),
    };
    return chain;
  }

  return { client: { from }, calls };
}
