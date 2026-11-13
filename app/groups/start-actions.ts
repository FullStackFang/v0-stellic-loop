'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import { EmbaError } from '@/lib/emba/errors';
import { groupHandle, groupHref } from '@/lib/emba/group-path';
import { startGroup, type StartReport } from '@/lib/emba/group-start';
import { getPortalPrincipal } from '@/lib/emba/portal-session';

/** What the start form shows after a submit. A made group comes back whole, join link included, and is never stored for a later visit. */
export type StartState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'ready'; name: string; handle: string; href: string; joinToken: string | null; added: StartReport['added']; failed: StartReport['failed'] };

const text = (data: FormData, key: string) => String(data.get(key) ?? '');
const texts = (data: FormData, key: string) => data.getAll(key).filter((value): value is string => typeof value === 'string');

export async function startGroupAction(_previous: StartState, data: FormData): Promise<StartState> {
  const principal = await getPortalPrincipal();
  if (!principal) return { status: 'error', message: 'Sign in to continue.' };
  try {
    const report = await startGroup(db(), principal, {
      name: text(data, 'name'), slug: text(data, 'slug'), parent: text(data, 'parent') || null,
      links: texts(data, 'link'), people: texts(data, 'person'), note: text(data, 'note'),
      files: data.getAll('file').filter((value): value is File => value instanceof File && value.size > 0),
    });
    revalidatePath('/groups', 'layout');
    return { status: 'ready', name: report.group.orgName, handle: groupHandle(report.group), href: groupHref(report.group), joinToken: report.joinToken, added: report.added, failed: report.failed };
  } catch (error) {
    if (error instanceof EmbaError && error.code === 'conflict') return { status: 'error', message: 'That handle is taken. Change it and try again. Nothing was saved.' };
    if (error instanceof EmbaError && error.code === 'forbidden') return { status: 'error', message: 'You cannot start a group there. Choose another place for it.' };
    if (error instanceof ZodError) return { status: 'error', message: 'Check the name and the handle. A handle is 2 to 48 lowercase letters, digits and single hyphens.' };
    return { status: 'error', message: 'The group could not be made. Nothing was saved. Try again.' };
  }
}
