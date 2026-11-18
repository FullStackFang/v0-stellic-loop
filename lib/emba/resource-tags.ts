import { z } from 'zod';
import { singleLine } from './team-text';

// The tags of a link or a text (loop-resources-tab, design D4). An assistant works them out from what it read; a person is never asked
// for them. Every one is optional and one visible line, so each can be put into an assistant's result as a line of its own.
export const TAG_LIMITS = { kind: 40, about: 120, audience: 120, summary: 240 } as const;

const line = (most: number) => z.string().max(most * 8).transform(singleLine).transform(value => value === '' ? undefined : value).pipe(z.string().max(most).optional()).optional();
const day =z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)).optional();
export const resourceTags = z.strictObject({ kind: line(TAG_LIMITS.kind), about: line(TAG_LIMITS.about), audience: line(TAG_LIMITS.audience), foundOn: day, summary: line(TAG_LIMITS.summary) });

/** The tags as they are read back: every one present, null when not given. */
export type Tags = { kind: string | null; about: string | null; audience: string | null; foundOn: string | null; summary: string | null };
export const noTags: Tags = { kind: null, about: null, audience: null, foundOn: null, summary: null };
export type TagsInput = z.input<typeof resourceTags>;
/** True when at least one tag was given: the item then counts as described. */
export const anyTag = (tags: z.output<typeof resourceTags> | undefined) => Boolean(tags && (tags.kind || tags.about || tags.audience || tags.foundOn || tags.summary));
