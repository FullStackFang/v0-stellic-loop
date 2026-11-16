'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import type { Principal } from '@/lib/emba/access';
import { EmbaError } from '@/lib/emba/errors';
import { archiveGroup, renameGroup, restoreGroup } from '@/lib/emba/group-tree';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { OrganizeRefused } from '@/lib/emba/team-core';
import type { PortalResult } from '@/components/emba/portal-types';

// Renaming, archiving and restoring a group (loop-organize-and-fix, design D2 to D4). Each service checks who may.
const scope = (data: FormData) => ({ orgId: String(data.get('orgId') ?? ''), loopId: String(data.get('loopId') ?? '') });
const also = (inside: number) => inside ? ` and the ${inside} ${inside === 1 ? 'group' : 'groups'} inside it` : '';

async function organize(run: (principal: Principal) => Promise<string>): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return { status: 'error', message: 'Sign in to continue.' };
  try {
    const message = await run(principal);
    // The side menu lists the groups too.
    revalidatePath('/groups', 'layout');
    return { status: 'success', message };
  } catch (error) {
    const message = error instanceof OrganizeRefused ? 'Only the people who run this group can do that. A top-level group is archived and restored by its owner.'
      : error instanceof ZodError ? 'A name is 1 to 200 characters on one line.'
      : error instanceof EmbaError && error.code === 'conflict' ? 'This group sits inside an archived group. Restore that one first.'
      : error instanceof EmbaError && error.code === 'not_found' ? 'That already happened, or the group is gone. Reload the page.'
      : 'This change could not be saved. Check your access and try again.';
    return { status: 'error', message };
  }
}

export async function renameGroupAction(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return organize(async principal => { const group = await renameGroup(db(), principal, { ...scope(data), name: String(data.get('name') ?? '') }); return `Renamed to ${group.name}. Its tag ${group.handle} stays.`; });
}
export async function archiveGroupAction(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return organize(async principal => { const group = await archiveGroup(db(), principal, scope(data)); return `Archived ${group.name}${also(group.inside)}. Restore it from the Archived list below.`; });
}
export async function restoreGroupAction(_previous: PortalResult, data: FormData): Promise<PortalResult> {
  return organize(async principal => { const group = await restoreGroup(db(), principal, scope(data)); return `Restored ${group.name}${also(group.inside)}. Assistant access that ended has to be given again.`; });
}
