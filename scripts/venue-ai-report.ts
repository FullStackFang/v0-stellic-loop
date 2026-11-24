// The venue report: how often three AI assistants name one venue when a group asks where to go, and who they name
// instead. Real spend only with --yes; without it the run prints the calls and a rough cost and stops.
//   node --import tsx scripts/venue-ai-report.ts --venue "Nisi Bistro" --also "Nisi" --area "Roosevelt Island" --campus "Cornell Tech"
// Then the same with --yes (and --check to print each answer beside the names read from it). --record 41,33,12 puts
// the venue's Loopd numbers (said, showed, came back) in the offer. Output goes beside the repo, in loopd-reports/.
import { gateway, generateText, Output, stepCountIs } from 'ai';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { READER, parseArgs, runReport, type GatewayModel } from '../lib/report/run';

const repo = path.resolve(import.meta.dirname, '..');

async function main() {
  const args = parseArgs(process.argv.slice(2), repo);
  const templates: string[] = JSON.parse(readFileSync(path.join(repo, 'scripts/venue-questions.json'), 'utf8'));
  if (args.yes) {
    try { process.loadEnvFile(path.join(repo, '.env.local')); } catch { /* the key can come from the shell */ }
    if (!process.env.AI_GATEWAY_API_KEY) throw new Error('Set AI_GATEWAY_API_KEY in .env.local');
  }
  await runReport(args, templates, {
    // The public model list: free, and no key needed.
    models: async () => {
      const res = await fetch('https://ai-gateway.vercel.sh/v1/models');
      if (!res.ok) throw new Error(`The gateway model list answered ${res.status}`);
      return ((await res.json()) as { data: GatewayModel[] }).data;
    },
    // A plain user message, no system text, with the gateway's own web search (the same tool for every assistant).
    ask: async (model, question) => {
      const r = await generateText({
        model,
        prompt: question,
        tools: { perplexity_search: gateway.tools.perplexitySearch({ maxResults: 8, maxTokens: 8000 }) },
        stopWhen: stepCountIs(4),
      });
      return { text: r.text, usage: r.totalUsage };
    },
    read: async (question, answer) => {
      const { output } = await generateText({
        model: READER,
        output: Output.object({ schema: z.object({ places: z.array(z.string()) }) }),
        prompt: `Below is an answer someone got when they asked: "${question}"

List the names of the places (restaurants, bars, cafes, venues) the answer recommends going to, spelt exactly as in the answer, each once. Leave out places named only as landmarks, directions or neighbourhoods. If it recommends none, give an empty list.

Answer:
${answer}`,
      });
      return output.places;
    },
    write: (file, content) => { mkdirSync(path.dirname(file), { recursive: true }); writeFileSync(file, content); },
    log: (line) => console.log(line),
    today: () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
  });
}

main().catch((e: Error) => { console.error(e.message); process.exit(1); });
