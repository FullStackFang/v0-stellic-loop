// The venue report as one self-contained page (public/demo/mockups-six-adds.html, section 6): nothing loaded from
// outside, so it shows in full when opened from an email with no connection.
import type { Count } from './count';

export type Report = Count & {
  date: string; // the day of the run, YYYY-MM-DD
  models: { label: string; id: string }[];
  search: boolean;
  questions: string[]; // the three shown
  questionCount: number;
};
export type VenueRecord = { said: number; showed: number; cameBack: number };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const day = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
const list = (xs: string[]) => xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`;
const bar = (label: string, n: number, of: number, hot = false) =>
  `<div>${esc(label)}<i${hot ? ' class="hot"' : ''} style="width:${of ? Math.round((n / of) * 100) : 0}%"></i><b>${n}</b></div>`;

const CSS = `:root{--ink:oklch(25% 0.07 252);--card:oklch(99% 0.008 100);--page:#fbf7ec;--hot:#ff5a43;--field:oklch(96.4% 0.19 117);--second:oklch(88% 0.19 118);--action:oklch(47.6% 0.13 250);--bg:oklch(96.5% 0.012 250);--soft:color-mix(in oklab,var(--ink) 22%,transparent);--mute:color-mix(in oklab,var(--ink) 68%,var(--card))}
*{box-sizing:border-box;margin:0}
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;padding:28px 16px 60px}
.sheet{max-width:560px;margin:0 auto;overflow:hidden;border-radius:6px;background:#fff;box-shadow:0 0 0 1.5px var(--ink),10px 10px 0 var(--soft)}
.top{display:grid;gap:12px;padding:22px 22px 24px;background:var(--ink);color:var(--card)}
.mark{display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:800;letter-spacing:-0.02em}.mark svg{width:22px;height:14px}
h1{font-size:26px;font-weight:800;letter-spacing:-0.025em;line-height:1.08}
.score{display:flex;align-items:center;gap:14px}.score strong{font-size:76px;font-weight:900;letter-spacing:-0.05em;line-height:.9;color:var(--field)}.score span{font-size:15px;font-weight:700;line-height:1.25}
.dots{display:grid;grid-template-columns:repeat(15,1fr);gap:5px}.dots i{aspect-ratio:1;border-radius:50%;box-shadow:inset 0 0 0 1.5px color-mix(in oklab,var(--field) 55%,var(--ink))}.dots i.y{background:var(--field);box-shadow:none}
.rest{display:grid;gap:22px;padding:28px 22px 22px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
@media (max-width:520px){.two{grid-template-columns:1fr;gap:22px}}
.panel{position:relative;display:grid;gap:10px;padding:22px 14px 14px;border-radius:18px 18px 18px 5px;background:var(--card);box-shadow:0 0 0 1.5px var(--ink),5px 5px 0 var(--second)}
.tab{position:absolute;left:12px;top:-12px;display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:99px;font-size:12px;font-weight:800;color:var(--field);background:var(--ink)}
.bars{display:grid;gap:7px;font-size:12.5px;font-weight:700}.bars div{display:grid;grid-template-columns:96px 1fr 30px;align-items:center;gap:8px}
.bars i{display:block;height:14px;border-radius:99px;background:var(--action);box-shadow:inset 0 0 0 1.5px var(--ink)}.bars i.hot{background:var(--hot)}.bars b{text-align:right;font-variant-numeric:tabular-nums}
.q{display:grid;gap:6px;font-size:12.5px}.q span{padding:6px 11px;border-radius:10px 10px 10px 3px;background:var(--page);box-shadow:inset 0 0 0 1px var(--soft)}
.pitch{display:flex;align-items:center;gap:12px;padding:12px 12px 12px 14px;border-radius:18px 18px 18px 5px;background:var(--field);box-shadow:0 0 0 1.5px var(--ink),5px 5px 0 var(--ink);font-size:13px;line-height:1.3}.pitch div{flex:1}.pitch b{display:block;font-size:16px;font-weight:800;letter-spacing:-0.02em}
.btn{display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 14px;border-radius:99px;font-size:14px;font-weight:760;white-space:nowrap;text-decoration:none;color:var(--card);background:var(--action);box-shadow:inset 0 0 0 1.5px var(--ink),2px 2px 0 var(--ink)}
.how{padding:12px 14px;border-radius:12px 12px 12px 4px;background:var(--page);box-shadow:inset 0 0 0 1px var(--soft);font-size:11.5px;line-height:1.4;color:var(--mute)}`;

const RINGS = '<svg viewBox="0 0 22 14" aria-hidden="true"><circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" stroke-width="2.2"/><circle cx="15" cy="7" r="5.6" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';

export function sheetHtml(report: Report, { record }: { record?: VenueRecord } = {}): string {
  const venue = esc(report.venue);
  const month = day(report.date, { month: 'long', year: 'numeric' });
  const perAssistant = Math.max(0, ...report.byAssistant.map((b) => b.asked));
  const top = report.instead[0]?.count ?? 0;
  const offer = record
    ? `<b>${record.showed} student groups showed up at your door.</b>${record.said} said they were coming and ${record.cameBack} came back. Assistants can’t see that today. A Loopd page puts it where they can read it.`
    : '<b>Loopd can show assistants who comes to your door.</b>Loopd counts the student groups who say they are coming, who show up and who come back. Assistants can’t see that today. A Loopd page puts it where they can read it.';
  const how = `Asked on ${day(report.date, { day: 'numeric', month: 'long', year: 'numeric' })} through each maker’s API, not the chat apps: `
    + `${esc(list(report.models.map((m) => `${m.label} (${m.id})`)))}, `
    + (report.search ? 'with web search' : 'without web search, so from what the assistant already knew')
    + '. Answers vary from one asking to the next: try three of the questions yourself.';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Loopd · ${venue} · ${month}</title>
<style>${CSS}</style>
</head>
<body>
<main class="sheet">
  <div class="top"><span class="mark">${RINGS}Loopd · for ${venue} · ${month}</span>
    <h1>How often do AI assistants recommend you to a group?</h1>
    <div class="score"><strong>${report.named}</strong><span>of ${report.asked} answers named ${venue}.<br>We asked ${report.models.length} assistants ${report.questionCount} questions each.</span></div>
    <div class="dots">${Array.from({ length: report.asked }, (_, i) => i < report.named ? '<i class="y"></i>' : '<i></i>').join('')}</div></div>
  <div class="rest">
    <div class="two">
      <div class="panel"><span class="tab">By assistant</span><div class="bars">${report.byAssistant.map((b) => bar(b.assistant, b.named, perAssistant)).join('')}</div></div>
      <div class="panel"><span class="tab">Who they named instead</span><div class="bars">${report.instead.map((p) => bar(p.name, p.count, top, true)).join('')}</div></div>
    </div>
    <div class="panel"><span class="tab">Three of the ${report.questionCount} questions</span><div class="q">${report.questions.map((q) => `<span>${esc(q)}</span>`).join('')}</div></div>
    <div class="pitch"><div>${offer}</div><a class="btn" href="https://www.getloopdin.social">${record ? 'See your record' : 'Get your page'}</a></div>
    <p class="how">${how}</p>
  </div>
</main>
</body>
</html>
`;
}
