export type DraftSource = { kind: 'text'; range: [number, number] } | { kind: 'doc'; docId: string; page: number };
export type PlaceDraft = { id: string; name: string; from: string; to: string; hotel: string };
export type OptionalDraft = { id: string; label: string; date: string; cost: string; min: string; deadline: string };
export type DraftDocument = { id: string; name: string; pages: number };
export type TripDraft = {
  name: string; start: string; end: string; startTime: string; endTime: string; timezone: string;
  cover: string; places: PlaceDraft[]; optional: OptionalDraft[];
  joinRule: { domain: string; label: string }; documents: DraftDocument[];
  screening: { questions: string[]; confirmMessage: string };
  sources: Record<string, DraftSource>; explicit: string[];
};
export type TripWorkspace = { id: string; slug: string | null; writer: string; draft: TripDraft; pins: Record<string, string>; revision: number };
export const emptyTripDraft = (): TripDraft => ({
  name: '', start: '', end: '', startTime: '', endTime: '', timezone: '', cover: '', places: [], optional: [],
  joinRule: { domain: '', label: '' }, documents: [],
  screening: { questions: ['Are you part of the group?', 'Can you make the trip dates?'], confirmMessage: 'Let’s rock on' },
  sources: {}, explicit: [],
});
export const MENTIONS = ['start', 'end', 'date', 'dates', 'place', 'hotel', 'cost', 'min', 'deadline', 'doc'] as const;

export function setDraftField(draft: TripDraft, path: string, value: string): TripDraft {
  const next = structuredClone(draft);
  const parts = path.split('.');
  let target: Record<string, unknown> = next as unknown as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const child = target[part];
    if (!child || typeof child !== 'object') return draft;
    target = child as Record<string, unknown>;
  }
  if (typeof target[parts.at(-1)!] !== 'string') return draft;
  target[parts.at(-1)!] = value;
  delete next.sources[path];
  return next;
}

export function mergeExtraction(current: TripDraft, extracted: TripDraft, pins: Record<string, string>): TripDraft {
  const next = structuredClone(extracted);
  next.name = current.name;
  next.cover = current.cover;
  next.documents = current.documents;
  next.screening = current.screening;
  for (const kind of ['places', 'optional'] as const) {
    for (const [index, old] of current[kind].entries()) {
      if (next[kind][index]) next[kind][index].id = old.id;
      else if (Object.keys(pins).some(path => path.startsWith(`${kind}.${index}.`))) {
        (next[kind] as (PlaceDraft | OptionalDraft)[])[index] = old;
      }
    }
  }
  for (const [path, value] of Object.entries(pins)) {
    // An explicit mention outranks a manual edit; all other extraction leaves it pinned.
    if (!next.explicit.includes(path)) Object.assign(next, setDraftField(next, path, value));
  }
  return next;
}
