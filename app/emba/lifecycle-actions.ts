'use server';

import { revalidatePath } from 'next/cache';
import { ZodError } from 'zod';
import { db } from '@/lib/db';
import type { Principal } from '@/lib/emba/access';
import { getPortalPrincipal } from '@/lib/emba/portal-session';
import { requireFirstParty } from '@/lib/emba/consent';
import { reviseActivity } from '@/lib/emba/activities';
import { acknowledgeInbox } from '@/lib/emba/delivery';
import { EmbaError } from '@/lib/emba/errors';
import type { PortalResult } from '@/components/emba/portal-types';

const value = (data: FormData, key: string) => String(data.get(key) ?? '');
async function mutate(run: (principal: Principal) => Promise<void>, message: string): Promise<PortalResult> {
  const principal = await getPortalPrincipal();
  if (!principal) return {status:'error',message:'Sign-in is not configured. No changes were saved.'};
  try {
    await requireFirstParty(db(),principal);
    await run(principal);
    revalidatePath('/emba');
    return {status:'success',message};
  } catch (error) {
    return {status:'error',message:error instanceof EmbaError && error.code==='conflict'
      ? 'This activity changed. Reload and review its latest revision before submitting again.'
      : error instanceof ZodError
        ? 'Check the activity fields, timezone and date offsets.'
        : 'This action is unavailable. Access or the update may have changed. Reload and try again.'};
  }
}

export async function acknowledgeUpdate(_previous: PortalResult, data: FormData) {
  return mutate(async principal => {
    if (value(data,'acknowledged')!=='yes') throw new EmbaError('forbidden');
    await acknowledgeInbox(db(),principal,value(data,'id'));
  },'Update acknowledged. This does not change your commitment or record attendance.');
}

export async function revisePublishedActivity(_previous: PortalResult, data: FormData) {
  return mutate(async principal => {
    if (value(data,'reviewed')!=='yes') throw new EmbaError('forbidden');
    await reviseActivity(db(),principal,value(data,'activityId'),Number(value(data,'revision')),
      Object.fromEntries(['orgId','loopId','title','place','timezone','startsAt','endsAt','deadline'].map(key=>[key,value(data,key)])));
  },'New revision published. Everyone must review and commit again; earlier commitments and disclosure consent were not carried forward.');
}
