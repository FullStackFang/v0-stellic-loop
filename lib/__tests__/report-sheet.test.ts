// @vitest-environment node
import { expect, it } from 'vitest';
import { sheetHtml, type Report } from '@/lib/report/sheet';

const report: Report = {
  venue: 'Nisi Bistro', asked: 30, named: 4,
  byAssistant: [
    { assistant: 'ChatGPT', named: 2, asked: 10 },
    { assistant: 'Claude', named: 1, asked: 10 },
    { assistant: 'Gemini', named: 1, asked: 10 },
  ],
  instead: [{ name: 'Tramway Tavern', count: 17 }, { name: 'Eastside Social', count: 11 }, { name: 'Blackwell’s', count: 7 }],
  date: '2026-11-24',
  models: [
    { label: 'ChatGPT', id: 'openai/gpt-6.1-sol' },
    { label: 'Claude', id: 'anthropic/claude-sonnet-5.5' },
    { label: 'Gemini', id: 'google/gemini-4-argon' },
  ],
  search: true,
  questions: [
    'Where can six of us get dinner on Roosevelt Island tonight?',
    'A bar near Cornell Tech that takes a group without a booking?',
    'Somewhere for a birthday for eight, not too loud?',
  ],
  questionCount: 10,
};

// What a reader sees: the style block and the tab title are left out.
const text = (html: string) => html.replace(/<(style|title)>[\s\S]*?<\/\1>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

it('states the count as N of M, never as a percentage', () => {
  const t = text(sheetHtml(report));
  expect(t).toContain('4 of 30 answers named Nisi Bistro');
  expect(t).toContain('We asked 3 assistants 10 questions each');
  expect(t).not.toContain('%');
  expect(t).toContain('Loopd · for Nisi Bistro · November 2026');
});

it('shows the split by assistant, who was named instead and three questions', () => {
  const t = text(sheetHtml(report));
  expect(t).toMatch(/ChatGPT 2 .*Claude 1 .*Gemini 1/);
  expect(t).toMatch(/Tramway Tavern 17 .*Eastside Social 11 .*Blackwell’s 7/);
  for (const q of report.questions) expect(t).toContain(q);
  expect(sheetHtml(report).match(/<i class="y">/g)).toHaveLength(4);
  expect(sheetHtml(report).match(/<i( class="y")?><\/i>/g)).toHaveLength(30);
});

it('says how and when it was measured', () => {
  const t = text(sheetHtml(report));
  expect(t).toContain('24 November 2026');
  for (const m of report.models) expect(t).toContain(`${m.label} (${m.id})`);
  expect(t).toContain('with web search');
  expect(t).toContain('Answers vary from one asking to the next');
  expect(text(sheetHtml({ ...report, search: false }))).toContain('without web search, so from what the assistant already knew');
});

it('shows Loopd record numbers only when given', () => {
  const given = text(sheetHtml(report, { record: { said: 41, showed: 33, cameBack: 12 } }));
  expect(given).toContain('33 student groups showed up at your door');
  expect(given).toContain('41');
  expect(given).toContain('12 came back');
  const none = text(sheetHtml(report));
  expect(none).not.toMatch(/\b(33|41|12)\b/);
  expect(none).toContain('Loopd counts the student groups who say they are coming, who show up and who come back');
});

it('loads nothing from outside, so it shows in full with no connection', () => {
  const html = sheetHtml(report);
  expect(html).not.toMatch(/(src|srcset)\s*=\s*["']?https?:/i);
  expect(html).not.toMatch(/url\(\s*["']?https?:/i);
  expect(html).not.toMatch(/<link\b|<script\b|@import/i);
  expect(html).toMatch(/^<!doctype html>/);
});

it('escapes names that come from the answers', () => {
  const html = sheetHtml({ ...report, instead: [{ name: '<b>Bad & Co</b>', count: 3 }] });
  expect(html).toContain('&lt;b&gt;Bad &amp; Co&lt;/b&gt;');
});
