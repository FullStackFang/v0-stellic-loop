// @vitest-environment node
import path from 'node:path';
import { expect, it, vi } from 'vitest';
import { ASSISTANTS, READER, parseArgs, runReport, type Deps } from '@/lib/report/run';
import templates from '@/scripts/venue-questions.json';

// The venue report script (scripts/venue-ai-report.ts). No test calls an assistant: the callers are stubs.
const repo = path.resolve('/work/v0-stellic-loop');
const base = ['--venue', 'Nisi Bistro', '--also', 'Nisi, Nisi Estiatorio', '--area', 'Roosevelt Island', '--campus', 'Cornell Tech'];
const listed = [...ASSISTANTS.map((a) => a.id), READER].map((id) => ({ id, pricing: { input: '0.000002', output: '0.00001' } }));

function deps(over: Partial<Deps> = {}) {
  const lines: string[] = [];
  const files = new Map<string, string>();
  const d: Deps = {
    models: async () => listed,
    ask: vi.fn(async () => { throw new Error('an assistant was called'); }),
    read: vi.fn(async () => { throw new Error('an assistant was called'); }),
    write: (f, c) => { files.set(f, c); },
    log: (l) => { lines.push(l); },
    today: () => '2026-11-24',
    ...over,
  };
  return { d, lines, files };
}

it('has ten questions, each naming the area or the campus', () => {
  expect(templates).toHaveLength(10);
  for (const q of templates) expect(q).toMatch(/\{area\}|\{campus\}/);
});

it('reads the arguments', () => {
  const a = parseArgs([...base, '--record', '41,33,12', '--check'], repo);
  expect(a).toMatchObject({ venue: 'Nisi Bistro', also: ['Nisi', 'Nisi Estiatorio'], area: 'Roosevelt Island', campus: 'Cornell Tech', check: true, yes: false });
  expect(a.record).toEqual({ said: 41, showed: 33, cameBack: 12 });
  expect(a.out).toBe(path.resolve(repo, '..', 'loopd-reports'));
  expect(() => parseArgs(base.slice(2), repo)).toThrow(/--venue/);
  expect(() => parseArgs([...base, '--record', '41,33'], repo)).toThrow(/three whole numbers/);
});

it('refuses an output folder inside the repository and says why', () => {
  expect(() => parseArgs([...base, '--out', path.join(repo, 'tmp')], repo)).toThrow(/inside the repository/);
  expect(() => parseArgs([...base, '--out', repo], repo)).toThrow(/inside the repository/);
  expect(parseArgs([...base, '--out', path.join(repo, '..', 'reports')], repo).out).toBe(path.resolve(repo, '..', 'reports'));
});

it('without --yes prints the venue, assistants, calls and rough cost, and asks nothing', async () => {
  const { d, lines, files } = deps();
  expect(await runReport(parseArgs(base, repo), templates, d)).toBe('dry');
  const out = lines.join('\n');
  expect(out).toContain('Nisi Bistro');
  for (const a of ASSISTANTS) expect(out).toContain(a.id);
  expect(out).toContain('Calls: 60');
  expect(out).toMatch(/Rough cost: about \$\d+\.\d\d/);
  expect(d.ask).not.toHaveBeenCalled();
  expect(d.read).not.toHaveBeenCalled();
  expect(files.size).toBe(0);
});

it('stops and names a model the gateway no longer offers, asking nothing', async () => {
  const { d } = deps({ models: async () => listed.filter((m) => m.id !== 'google/gemini-4-argon') });
  await expect(runReport(parseArgs([...base, '--yes'], repo), templates, d)).rejects.toThrow(/google\/gemini-4-argon/);
  expect(d.ask).not.toHaveBeenCalled();
});

it('with --yes asks every question of every assistant, keeps them all and writes the sheet', async () => {
  const { d, lines, files } = deps({
    ask: vi.fn(async (model: string, q: string) => ({ text: model.startsWith('openai') && q.includes('dinner') ? 'Try Nisi, or Tramway Tavern.' : 'Tramway Tavern is good.' })),
    read: vi.fn(async (_q: string, text: string) => text.includes('Nisi') ? ['Nisi', 'Tramway Tavern'] : ['Tramway Tavern']),
  });
  expect(await runReport(parseArgs([...base, '--yes', '--check', '--out', '/work/reports'], repo), templates, d)).toBe('done');
  expect(d.ask).toHaveBeenCalledTimes(30);
  expect(d.read).toHaveBeenCalledTimes(30);
  const json = JSON.parse(files.get(path.join(path.resolve('/work/reports'), 'nisi-bistro-2026-11-24.json'))!);
  expect(json.questions).toHaveLength(10);
  expect(json.answers).toHaveLength(30);
  expect(json.answers[0]).toMatchObject({ assistant: 'ChatGPT', text: 'Try Nisi, or Tramway Tavern.' });
  expect(json.count.named).toBe(2); // two questions ask about dinner
  const html = files.get(path.join(path.resolve('/work/reports'), 'nisi-bistro-2026-11-24.html'))!;
  expect(html).toContain('of 30 answers named Nisi Bistro');
  // --check prints each answer beside the names read from it.
  expect(lines.join('\n')).toContain('Try Nisi, or Tramway Tavern.\n>>> read as: Nisi | Tramway Tavern');
});
