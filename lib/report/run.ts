// One venue report run (scripts/venue-ai-report.ts holds the real callers). Without --yes it only prints what the
// run would cost; nothing is asked of an assistant.
import path from 'node:path';
import { slugify } from '@/lib/slug';
import { countReport, type Answer } from './count';
import { sheetHtml, type VenueRecord } from './sheet';

// One each from three makers, at the same listed price. Checked against the gateway's live list on every run.
export const ASSISTANTS = [
  { label: 'ChatGPT', id: 'openai/gpt-6.1-sol' },
  { label: 'Claude', id: 'anthropic/claude-sonnet-5.5' },
  { label: 'Gemini', id: 'google/gemini-4-argon' },
];
// Reads every answer into the places it recommends: one of the three, the same for all answers.
export const READER = 'anthropic/claude-sonnet-5.5';

// For the rough cost: tokens per ask (with one capped search) and per reading, and the gateway's Perplexity price.
const ASK_IN = 12_000, ASK_OUT = 1_500, READ_IN = 2_500, READ_OUT = 200, SEARCH = 5 / 1000;

export type Args = {
  venue: string; also: string[]; area: string; campus: string;
  record?: VenueRecord; out: string; check: boolean; yes: boolean;
};
export type GatewayModel = { id: string; pricing?: { input?: string; output?: string } };
export type Asked = { text: string; usage?: { inputTokens?: number; outputTokens?: number } };
export type Deps = {
  models(): Promise<GatewayModel[]>;
  ask(model: string, question: string): Promise<Asked>;
  read(question: string, answer: string): Promise<string[]>;
  write(file: string, content: string): void;
  log(line: string): void;
  today(): string; // YYYY-MM-DD
};

const USAGE = 'node --import tsx scripts/venue-ai-report.ts --venue "Nisi Bistro" --also "Nisi" --area "Roosevelt Island" --campus "Cornell Tech" [--record 41,33,12] [--out <folder outside the repo>] [--check] [--yes]';

export function parseArgs(argv: string[], repo: string): Args {
  const flags = new Set(['--check', '--yes']);
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (flags.has(a)) { values.set(a, 'true'); continue; }
    if (!['--venue', '--also', '--area', '--campus', '--record', '--out'].includes(a)) throw new Error(`Unknown argument ${a}\n${USAGE}`);
    const v = argv[++i];
    if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value\n${USAGE}`);
    values.set(a, v);
  }
  const need = (k: string) => {
    const v = values.get(k)?.trim();
    if (!v) throw new Error(`Give ${k}\n${USAGE}`);
    return v;
  };
  const out = path.resolve(values.get('--out') ?? path.join(repo, '..', 'loopd-reports'));
  const rel = path.relative(path.resolve(repo), out);
  if (!rel.startsWith('..') && !path.isAbsolute(rel)) {
    throw new Error(`--out ${out} is inside the repository. Reports hold real business names and are not committed: give a folder outside it.`);
  }
  let record: VenueRecord | undefined;
  if (values.has('--record')) {
    const n = need('--record').split(',').map((s) => Number(s.trim()));
    if (n.length !== 3 || n.some((x) => !Number.isInteger(x) || x < 0)) throw new Error('--record takes three whole numbers: said, showed, came back (41,33,12)');
    record = { said: n[0], showed: n[1], cameBack: n[2] };
  }
  return {
    venue: need('--venue'), area: need('--area'), campus: need('--campus'),
    also: (values.get('--also') ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    record, out, check: values.has('--check'), yes: values.has('--yes'),
  };
}

export const fillQuestions = (templates: string[], area: string, campus: string) =>
  templates.map((q) => q.replaceAll('{area}', area).replaceAll('{campus}', campus));

const price = (m: GatewayModel | undefined, inTok: number, outTok: number) =>
  m?.pricing?.input && m.pricing.output ? inTok * Number(m.pricing.input) + outTok * Number(m.pricing.output) : NaN;

export async function runReport(args: Args, templates: string[], deps: Deps): Promise<'dry' | 'done'> {
  const questions = fillQuestions(templates, args.area, args.campus);
  // The live list is free to read and asks no assistant; a name it no longer holds stops the run before anything is asked.
  const listed = new Map((await deps.models()).map((m) => [m.id, m]));
  const stale = [...new Set([...ASSISTANTS.map((a) => a.id), READER])].filter((id) => !listed.has(id));
  if (stale.length) throw new Error(`No longer offered by the gateway: ${stale.join(', ')}. Pick a current model in lib/report/run.ts. Nothing was asked.`);

  const asks = questions.length * ASSISTANTS.length;
  const cost = ASSISTANTS.reduce((sum, a) => sum + questions.length * (price(listed.get(a.id), ASK_IN, ASK_OUT) + SEARCH), 0)
    + asks * price(listed.get(READER), READ_IN, READ_OUT);
  deps.log(`Venue: ${args.venue}${args.also.length ? ` (also ${args.also.join(', ')})` : ''}, ${args.area}, near ${args.campus}`);
  deps.log(`Assistants: ${ASSISTANTS.map((a) => `${a.label} (${a.id})`).join(', ')}, with web search`);
  deps.log(`Calls: ${asks + asks} (${questions.length} questions x ${ASSISTANTS.length} assistants, and ${asks} readings with ${READER})`);
  deps.log(`Rough cost: about $${Number.isNaN(cost) ? '? (a price is missing from the gateway list)' : cost.toFixed(2)}`);
  if (!args.yes) {
    deps.log('Nothing was asked. Run again with --yes to go ahead.');
    return 'dry';
  }

  const answers: (Answer & { model: string; usage?: Asked['usage'] })[] = [];
  for (const question of questions) {
    const round = await Promise.all(ASSISTANTS.map(async (a) => {
      const { text, usage } = await deps.ask(a.id, question);
      return { assistant: a.label, model: a.id, question, text, places: await deps.read(question, text), usage };
    }));
    answers.push(...round);
    deps.log(`Asked: ${question}`);
  }

  const date = deps.today();
  const count = countReport(args.venue, args.also, answers);
  const report = { ...count, date, models: ASSISTANTS, search: true, questions: questions.slice(0, 3), questionCount: questions.length };
  const base = path.join(args.out, `${slugify(args.venue)}-${date}`);
  deps.write(`${base}.json`, JSON.stringify({ venue: args.venue, also: args.also, area: args.area, campus: args.campus, date, models: ASSISTANTS, reader: READER, search: true, record: args.record ?? null, questions, answers, count }, null, 2));
  deps.write(`${base}.html`, sheetHtml(report, { record: args.record }));

  if (args.check) {
    for (const a of answers) deps.log(`\n--- ${a.assistant} · ${a.question}\n${a.text}\n>>> read as: ${a.places.join(' | ') || '(no places)'}`);
  }
  const tokens = answers.reduce((t, a) => [t[0] + (a.usage?.inputTokens ?? 0), t[1] + (a.usage?.outputTokens ?? 0)], [0, 0]);
  deps.log(`\n${count.named} of ${count.asked} answers named ${args.venue}. Asking used ${tokens[0]} tokens in, ${tokens[1]} out.`);
  deps.log(`Wrote ${base}.json and ${base}.html`);
  return 'done';
}
