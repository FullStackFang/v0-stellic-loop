import 'server-only';
import { randomUUID } from 'node:crypto';
import { emptyTripDraft, type DraftSource, type TripDraft } from './trip-draft';

const str = { type: 'string' }, nullable = { type: ['string', 'null'] };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
const row = obj({ name: str, from: str, to: str, hotel: str });
const optional = obj({ label: str, date: str, cost: str, min: str, deadline: str });
const source = obj({ path: str, kind: { type: 'string', enum: ['text', 'doc'] }, start: { type: 'integer' }, end: { type: 'integer' }, docId: nullable, page: { type: 'integer' }, explicit: { type: 'boolean' } });
const schema = obj({
  start: str, end: str, startTime: str, endTime: str, timezone: str,
  places: { type: 'array', items: row }, optional: { type: 'array', items: optional },
  joinRule: obj({ domain: str, label: str }), sources: { type: 'array', items: source },
});

async function gateway(messages: unknown[], responseSchema: unknown, name: string): Promise<unknown | null> {
  const key = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!key) return null;
  try {
    const response = await fetch('https://ai-gateway.vercel.sh/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-4.1-mini', messages,
        response_format: { type: 'json_schema', json_schema: { name, strict: true, schema: responseSchema } } }),
      signal: AbortSignal.timeout(45000),
    });
    if (!response.ok) return null;
    const body = await response.json();
    return JSON.parse(body.choices?.[0]?.message?.content ?? 'null');
  } catch { return null; }
}

export async function transcribeDocument(bytes: Buffer, mime: string, name: string): Promise<{ text: string; pages: number } | null> {
  if (mime === 'text/plain') return { text: bytes.toString('utf8').slice(0, 100000), pages: 1 };
  const data = `data:${mime};base64,${bytes.toString('base64')}`;
  const part = mime === 'application/pdf' ? { type: 'file', file: { filename: name, file_data: data } } : { type: 'image_url', image_url: { url: data } };
  const result = await gateway([
    { role: 'system', content: 'Transcribe the document faithfully. Return page-numbered text; do not interpret or summarize. Images count as one page.' },
    { role: 'user', content: [{ type: 'text', text: `Transcribe ${name}.` }, part] },
  ], obj({ pages: { type: 'array', items: obj({ page: { type: 'integer' }, text: str }) } }), 'trip_document_text') as { pages?: { page: number; text: string }[] } | null;
  if (!Array.isArray(result?.pages)) return null;
  return { text: result.pages.map(p => `[Page ${p.page}]\n${p.text}`).join('\n').slice(0, 100000), pages: result.pages.length };
}

export async function extractTrip(writer: string, documents: { id: string; text: string }[]): Promise<TripDraft | null> {
  const result = await gateway([
    { role: 'system', content: `Extract a trip draft from the organizer's message and attached document text. Return empty strings or arrays for absent facts; never invent details. Explicit @start, @end, @date, @dates, @place, @hotel, @cost, @min, @deadline, @doc mentions in the message outrank everything else. Other message facts outrank documents. Dates must be YYYY-MM-DD when known; times HH:mm when known; timezone must be IANA and inferred from the first place. Places and optional items stay in mentioned order. Put source records for every found scalar: path examples start, places.0.name, optional.0.cost, joinRule.domain. For text, start/end are 0-based character offsets in the original writer. For docs, docId is the supplied ID and page is the 1-based page number. Mark explicit true only for values from an @mention. Do not include a name, cover, documents, or screening; those are edited separately.` },
    { role: 'user', content: JSON.stringify({ today: new Date().toISOString().slice(0, 10), writer, documents }) },
  ], schema, 'trip_draft') as Record<string, unknown> | null;
  if (!result || !Array.isArray(result.places) || !Array.isArray(result.optional)) return null;
  const draft = emptyTripDraft();
  for (const field of ['start', 'end', 'startTime', 'endTime', 'timezone'] as const) if (typeof result[field] === 'string') draft[field] = (result[field] as string).slice(0, 100);
  draft.places = result.places.slice(0, 30).map((raw: unknown) => {
    const r = raw as Record<string, unknown>;
    return { id: randomUUID(), name: String(r.name ?? '').slice(0, 200), from: String(r.from ?? '').slice(0, 40), to: String(r.to ?? '').slice(0, 40), hotel: String(r.hotel ?? '').slice(0, 200) };
  });
  draft.optional = result.optional.slice(0, 40).map((raw: unknown) => {
    const r = raw as Record<string, unknown>;
    return { id: randomUUID(), label: String(r.label ?? '').slice(0, 200), date: String(r.date ?? '').slice(0, 40), cost: String(r.cost ?? '').slice(0, 80), min: String(r.min ?? '').slice(0, 80), deadline: String(r.deadline ?? '').slice(0, 40) };
  });
  const rule = result.joinRule as Record<string, unknown> | null;
  if (rule) draft.joinRule = { domain: String(rule.domain ?? '').slice(0, 200), label: String(rule.label ?? '').slice(0, 200) };
  if (Array.isArray(result.sources)) for (const raw of result.sources) {
    const s = raw as Record<string, unknown>, path = String(s.path ?? '');
    if (!/^(start|end|startTime|endTime|timezone|joinRule\.(domain|label)|places\.\d+\.(name|from|to|hotel)|optional\.\d+\.(label|date|cost|min|deadline))$/.test(path)) continue;
    let value: DraftSource | null = null;
    if (s.kind === 'text' && Number.isInteger(s.start) && Number.isInteger(s.end) && Number(s.start) >= 0 && Number(s.end) <= writer.length) value = { kind: 'text', range: [Number(s.start), Number(s.end)] };
    if (s.kind === 'doc' && documents.some(d => d.id === s.docId) && Number.isInteger(s.page)) value = { kind: 'doc', docId: String(s.docId), page: Number(s.page) };
    if (value) { draft.sources[path] = value; if (s.explicit && s.kind === 'text') draft.explicit.push(path); }
  }
  return draft;
}
