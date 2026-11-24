// @vitest-environment node
import { expect, it } from 'vitest';
import { countReport, sameName, type Answer } from '@/lib/report/count';

// Saved sample answers, already read into the places each one recommends.
const a = (assistant: string, places: string[], question = 'Where can six of us get dinner on Roosevelt Island tonight?'): Answer =>
  ({ assistant, question, text: places.join(', '), places });

it('counts an answer that names the venue by another given name', () => {
  const r = countReport('Nisi Bistro', ['Nisi'], [a('ChatGPT', ['Nisi', 'Tramway Tavern'])]);
  expect(r.named).toBe(1);
  expect(r.instead).toEqual([{ name: 'Tramway Tavern', count: 1 }]);
});

it('does not count an answer that names three other places, and each of them gains one', () => {
  const r = countReport('Nisi Bistro', [], [a('Claude', ['Tramway Tavern', 'Eastside Social', "Blackwell's"])]);
  expect(r.named).toBe(0);
  expect(r.asked).toBe(1);
  expect(r.instead.map((p) => p.count)).toEqual([1, 1, 1]);
});

it('counts the venue once when an answer names it twice', () => {
  const r = countReport('Nisi Bistro', ['Nisi'], [a('Gemini', ['Nisi Bistro', 'Nisi', 'Tramway Tavern', 'Tramway Tavern'])]);
  expect(r.named).toBe(1);
  expect(r.instead).toEqual([{ name: 'Tramway Tavern', count: 1 }]);
});

it('compares names without case, punctuation or a leading "the"', () => {
  expect(sameName('The Tramway Tavern', 'tramway tavern')).toBe(true);
  expect(sameName('Blackwell’s', "blackwell's")).toBe(true);
  expect(sameName('Nisi Bistro!', 'nisi-bistro')).toBe(true);
  expect(sameName('Theatre Bar', 'atre bar')).toBe(false);
  const r = countReport('Nisi Bistro', [], [a('ChatGPT', ['THE NISI BISTRO.'])]);
  expect(r.named).toBe(1);
});

it('splits the count by assistant, adding up to the headline', () => {
  const answers = [
    a('ChatGPT', ['Nisi']), a('ChatGPT', ['Nisi Bistro']), a('ChatGPT', ['Tramway Tavern']),
    a('Claude', ['Nisi']), a('Claude', ['Eastside Social']),
    a('Gemini', ['Nisi Bistro']), a('Gemini', []),
  ];
  const r = countReport('Nisi Bistro', ['Nisi'], answers);
  expect(r.named).toBe(4);
  expect(r.asked).toBe(7);
  expect(r.byAssistant).toEqual([
    { assistant: 'ChatGPT', named: 2, asked: 3 },
    { assistant: 'Claude', named: 1, asked: 2 },
    { assistant: 'Gemini', named: 1, asked: 2 },
  ]);
  expect(r.byAssistant.reduce((n, b) => n + b.named, 0)).toBe(r.named);
});

it('shows the three places named most instead, most first, spelt as first seen', () => {
  const answers = [
    a('ChatGPT', ['Tramway Tavern', 'Eastside Social', 'Riverwalk Bar']),
    a('Claude', ['The Tramway Tavern', 'Eastside Social', "Blackwell's"]),
    a('Gemini', ['tramway tavern', "Blackwell's", 'Nisi']),
    a('Gemini', ['Eastside Social', 'Tramway Tavern']),
  ];
  const r = countReport('Nisi Bistro', ['Nisi'], answers);
  expect(r.instead).toEqual([
    { name: 'Tramway Tavern', count: 4 },
    { name: 'Eastside Social', count: 3 },
    { name: "Blackwell's", count: 2 },
  ]);
});
