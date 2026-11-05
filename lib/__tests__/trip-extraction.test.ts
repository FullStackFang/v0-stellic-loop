import { afterEach, expect, it, vi } from 'vitest';
import { extractTrip, transcribeDocument } from '../trip-extraction';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it('requests strict structured extraction on the server and records text provenance', async () => {
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key');
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
    start: '2027-02-27', end: '', startTime: '', endTime: '', timezone: 'Europe/London',
    places: [{ name: 'London', from: '', to: '', hotel: '' }], optional: [], joinRule: { domain: '', label: '' },
    sources: [{ path: 'start', kind: 'text', start: 0, end: 13, docId: null, page: 0, explicit: true }],
  }) } }] }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const result = await extractTrip('@start Feb 27', []);
  expect(result?.start).toBe('2027-02-27');
  expect(result?.explicit).toContain('start');
  expect(result?.sources.start).toEqual({ kind: 'text', range: [0, 13] });
  const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(sent.response_format).toMatchObject({ type: 'json_schema', json_schema: { strict: true } });
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer test-key');
});

it('leaves the draft untouched when extraction fails', async () => {
  vi.stubEnv('AI_GATEWAY_API_KEY', 'test-key');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
  expect(await extractTrip('London', [])).toBeNull();
});

it('extracts plain text documents without an LLM call', async () => {
  expect(await transcribeDocument(Buffer.from('Trip details'), 'text/plain', 'syllabus.txt')).toEqual({ text: 'Trip details', pages: 1 });
});
