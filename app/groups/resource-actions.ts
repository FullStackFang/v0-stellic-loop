'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { uploadDocument, processDocument, deleteDocument } from '@/lib/emba/knowledge';
import { parseResourceFile, ResourceInputError } from '@/lib/emba/resource-input';
import { embeddingsEnabled, indexDocumentEmbeddings } from '@/lib/emba/embeddings';
import { addLink, removeLink, saveText } from '@/lib/emba/team-resources';
import { singleLine } from '@/lib/emba/team-text';
import type { PortalResult } from '@/components/emba/portal-types';

const value = (data: FormData, key: string) => String(data.get(key) ?? '');
async function mutate(run: (principal: NonNullable<Awaited<ReturnType<typeof getPortalPrincipal>>>) => Promise<Partial<PortalResult> | void>): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return { status: 'error', message: 'Sign in to continue.' };
  try {
    const result = await run(principal);
    revalidatePath('/groups');
    return { status: 'success', message: 'Saved.', ...result };
  } catch (error) {
    return { status: 'error', message: error instanceof ResourceInputError ? error.message : 'Resource unavailable. Check the file, group access, and current version.' };
  }
}
export async function publishResource(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => {
    const file = data.get('file');
    const pasted = value(data, 'body');
    if (file instanceof File && file.size && pasted.trim()) throw new ResourceInputError('Choose a file or paste text, not both.');
    const content = file instanceof File && file.size ? await parseResourceFile(file) : { title: value(data, 'title'), mediaType: 'text/plain' as const, body: pasted };
    const document = await uploadDocument(db(), principal, {
      orgId: value(data, 'orgId'), loopId: value(data, 'loopId'), operationId: value(data, 'operationId'),
      ...(data.has('documentId') ? { documentId: value(data, 'documentId'), expectedVersion: Number(value(data, 'expectedVersion')) } : {}),
      ...content,
    });
    try {
      await processDocument(db(), principal, document.id, document.version);
      if (embeddingsEnabled()) await indexDocumentEmbeddings(db(), principal, { documentId: document.id, version: document.version });
      return { message: 'Resource indexed and ready.' };
    } catch {
      return { message: 'Resource accepted. Processing is pending or failed; check its status and retry if needed.' };
    }
  });
}
export async function retryResource(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => {
    await processDocument(db(), principal, value(data, 'documentId'), Number(value(data, 'version')));
    if (embeddingsEnabled()) await indexDocumentEmbeddings(db(), principal, { documentId: value(data, 'documentId'), version: Number(value(data, 'version')) });
    return { message: 'Resource indexed and ready.' };
  });
}
export async function removeResource(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(principal => deleteDocument(db(), principal, value(data, 'documentId'), Number(value(data, 'version'))));
}

const linkProblems = { not_https: 'Links need to start with https.', has_login: 'Loopd does not keep a link that holds a user name or password.', has_port: 'Loopd does not keep a link that names a port.', host_not_a_name: 'The link’s host must be a normal domain name.', too_long: 'That link is too long. Use a shorter share link.', not_a_link: 'That is not a link Loopd can keep.' } as const;
const refusals = { busy: 'Loopd was busy. Try again in a moment.', cap: 'Too many changes this hour. Try again later.', members_only: 'Only members of the group can add to Resources.', organizers_only: 'Only owners and organizers of the group can do this.', not_found: 'This is no longer there.', texts_full: 'This group keeps 100 texts. Remove one first.' } as const;
const failed = (message: string): Partial<PortalResult> => ({ status: 'error', message });
/** A text's name when none was given: its first words. */
const firstWords = (words: string) => singleLine(words).slice(0, 80) || 'Text';

/**
 * The one box. A file is read for its words and not kept; an https address is a link; other words are a text. The server
 * decides this again from what was sent, so the box's preview and what is saved cannot differ.
 */
export async function addResource(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => {
    const file = data.get('file'), words = value(data, 'body').trim(), name = value(data, 'name');
    const scope = { orgId: value(data, 'orgId'), loopId: value(data, 'loopId') };
    if (file instanceof File && file.size && words) throw new ResourceInputError('Choose a file or paste text, not both.');
    if (file instanceof File && file.size) {
      const content = await parseResourceFile(file);
      const result = await saveText(db(), principal, { ...scope, name: name.trim() || content.title.replace(/\.[a-z0-9]+$/i, ''), body: content.body, mediaType: content.mediaType });
      return result.saved ? { message: result.indexed ? 'Text added and ready to search.' : 'Text added. Reading it is pending; retry from its row if it does not finish.' } : failed(refusals[result.reason]);
    }
    if (!words) throw new ResourceInputError('Paste a link or some text, or choose a file.');
    if (/^(http:\/\/|www\.)\S+$/i.test(words)) return failed(linkProblems.not_https);
    if (/^https:\/\/\S+$/i.test(words)) {
      const result = await addLink(db(), principal, { ...scope, url: words, name: name.trim() || undefined });
      if (!result.saved) return failed(result.reason === 'link_refused' ? linkProblems[result.problem] : result.reason === 'cap' && result.cap === 'links' ? 'This group keeps 100 links. Remove one first.' : refusals[result.reason as keyof typeof refusals] ?? refusals.busy);
      return { message: result.existed ? 'That link is already listed.' : 'Link added.' };
    }
    const result = await saveText(db(), principal, { ...scope, name: name.trim() || firstWords(words), body: words });
    return result.saved ? { message: result.indexed ? 'Text added and ready to search.' : 'Text added. Reading it is pending; retry from its row if it does not finish.' } : failed(refusals[result.reason]);
  });
}
/** Removes a link: the person who added it, or an organizer. */
export async function removeTeamLink(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return mutate(async principal => {
    const result = await removeLink(db(), principal, { orgId: value(data, 'orgId'), loopId: value(data, 'loopId'), id: value(data, 'id') });
    return result.saved ? { message: 'Link removed.' } : failed(refusals[result.reason as keyof typeof refusals] ?? refusals.busy);
  });
}
