import { describe, expect, it } from 'vitest';
import { emptyTripDraft, mergeExtraction, setDraftField } from '../trip-draft';

describe('trip draft precedence', () => {
  it('keeps manual values over inferred text and documents, but yields to explicit mentions', () => {
    const current = emptyTripDraft();
    current.name = 'EMBA trip';
    current.documents = [{ id: 'doc-1', name: 'Syllabus.pdf', pages: 2 }];
    const extracted = emptyTripDraft();
    extracted.start = '2027-03-01';
    extracted.end = '2027-03-05';
    extracted.sources.start = { kind: 'doc', docId: 'doc-1', page: 1 };
    const merged = mergeExtraction(current, extracted, { start: '2027-02-27', end: '2027-03-06' });
    expect(merged.start).toBe('2027-02-27');
    expect(merged.end).toBe('2027-03-06');
    expect(merged.name).toBe('EMBA trip');
    expect(merged.documents).toHaveLength(1);
    extracted.explicit = ['start'];
    expect(mergeExtraction(current, extracted, { start: '2027-02-27' }).start).toBe('2027-03-01');
  });

  it('edits a draft field without rewriting its source text', () => {
    const draft = emptyTripDraft();
    draft.start = '2027-02-27';
    draft.sources.start = { kind: 'text', range: [0, 6] };
    const edited = setDraftField(draft, 'start', '2027-02-28');
    expect(edited.start).toBe('2027-02-28');
    expect(edited.sources.start).toBeUndefined();
    expect(draft.start).toBe('2027-02-27');
  });

  it('keeps manually added rows when extraction finds no matching row', () => {
    const current = emptyTripDraft();
    current.places = [{ id: 'manual', name: 'London', from: '', to: '', hotel: 'The Langham' }];
    const merged = mergeExtraction(current, emptyTripDraft(), { 'places.0.hotel': 'The Langham' });
    expect(merged.places).toEqual(current.places);
  });
});
