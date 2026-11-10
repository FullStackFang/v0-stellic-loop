'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { uploadDocument, processDocument, deleteDocument } from '@/lib/emba/knowledge';
import { parseResourceFile, ResourceInputError } from '@/lib/emba/resource-input';
import { embeddingsEnabled, indexDocumentEmbeddings } from '@/lib/emba/embeddings';
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
