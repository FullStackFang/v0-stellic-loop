export type CoordinationContext = Readonly<{ orgId: string; loopId: string; activityId: string; revision: number }>;
export type CoordinationReference = CoordinationContext & Readonly<{ personId: string }>;
export type CoordinationCandidate = CoordinationReference & Readonly<{ minOthers: number; requires: readonly CoordinationReference[] }>;

const contextKeys = ['orgId', 'loopId', 'activityId', 'revision'];
const referenceKeys = [...contextKeys, 'personId'];
const candidateKeys = [...referenceKeys, 'minOthers', 'requires'];

function invalid(): never {
  // Keep validation failures independent of anyone's participation.
  throw new Error('Invalid coordination snapshot');
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || keys.some(key => !Object.hasOwn(row, key)) ||
      Object.keys(row).some(key => !keys.includes(key))) invalid();
  return row;
}

function identifier(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.trim() === value;
}

/**
 * Resolve an already-authorized, eligible active opt-in snapshot for one revision.
 * The transactional caller must enforce deadline, eligibility and dependency consent;
 * this pure function neither grants authority nor exposes a public participant list.
 * Missing same-context targets are valid constraints and remove their dependents.
 */
export function resolveCoordination(context: unknown, snapshot: unknown): string[] {
  const scope = record(context, contextKeys);
  if (!identifier(scope.orgId) || !identifier(scope.loopId) || !identifier(scope.activityId) ||
      !Number.isSafeInteger(scope.revision) || (scope.revision as number) < 1) invalid();
  if (!Array.isArray(snapshot)) invalid();

  function reference(value: unknown, keys: readonly string[]): Record<string, unknown> {
    const row = record(value, keys);
    if (contextKeys.some(key => row[key] !== scope[key]) || !identifier(row.personId)) invalid();
    return row;
  }

  const candidates = new Map<string, { minOthers: number; requires: Set<string> }>();
  for (const value of snapshot) {
    const row = reference(value, candidateKeys);
    const personId = row.personId as string;
    if (candidates.has(personId) || !Number.isSafeInteger(row.minOthers) ||
        (row.minOthers as number) < 0 || !Array.isArray(row.requires)) invalid();
    const requires = new Set<string>();
    for (const value of row.requires) {
      const target = reference(value, referenceKeys).personId as string;
      if (target === personId || requires.has(target)) invalid();
      requires.add(target);
    }
    candidates.set(personId, { minOthers: row.minOthers as number, requires });
  }

  // Each removal is impossible in any feasible subset of the remaining set.
  // Starting with all candidates therefore preserves the greatest feasible set.
  let remaining = new Set(candidates.keys());
  for (;;) {
    const next = new Set([...remaining].filter(personId => {
      const candidate = candidates.get(personId)!;
      return candidate.minOthers <= remaining.size - 1 &&
        [...candidate.requires].every(target => remaining.has(target));
    }));
    if (next.size === remaining.size) return [...next].sort();
    remaining = next;
  }
}
