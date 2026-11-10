import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { getPortalPrincipal, withPortalTestSession } from '@/lib/emba/portal-session';
import type { Principal } from '@/lib/emba/access';

const { database } = vi.hoisted(() => ({ database: vi.fn(() => { throw new Error('Unexpected database access'); }) }));
vi.mock('@/lib/db', () => ({ db: database }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import MemberPortal from './page';
import * as actions from './actions';
import * as memoryReviewActions from './memory-review-actions';
import { parseReview } from './review';

afterEach(() => { vi.unstubAllEnvs(); database.mockClear(); });

describe('portal authentication boundary', () => {
  it('shows an honest unconfigured state without touching the database', async () => {
    render(await MemberPortal({ searchParams: Promise.resolve({ personId:'somebody-else',orgId:'anything',loopId:'anything' }) }));
    expect(screen.getByRole('heading', { name:'Sign-in is not configured yet' })).toBeInTheDocument();
    expect(database).not.toHaveBeenCalled();
  });
  it.each(Object.values(actions))('denies unauthenticated action %s before database access', async action => {
    const data = new FormData(); data.set('personId','forged-member');
    expect(await action({status:'idle',message:''}, data)).toEqual({status:'error',message:'Sign-in is not configured. No changes were saved.'});
    expect(database).not.toHaveBeenCalled();
  });
  it.each(Object.values(memoryReviewActions))('denies unauthenticated proposal action %s before database access', async action => {
    expect((await action({status:'idle',message:''},new FormData())).status).toBe('error');
    expect(database).not.toHaveBeenCalled();
  });
  it('rejects unknown fields and target/revision substitution in assistant review', () => {
    const targetId='00000000-0000-4000-8000-000000000001';
    const binding={clientId:'assistant',action:'identity_disclosure',targetId,expectedVersion:1,payload:{activityId:targetId,revision:1,discloseName:true}};
    expect(parseReview(JSON.stringify(binding))).toEqual(binding);
    expect(()=>parseReview(JSON.stringify({...binding,expectedVersion:2}))).toThrow();
    expect(()=>parseReview(JSON.stringify({...binding,payload:{...binding.payload,personId:'someone-else'}}))).toThrow();
    expect(()=>parseReview(JSON.stringify({...binding,action:'publication'}))).toThrow();
  });
  it('cannot inject a test session in production', async () => {
    vi.stubEnv('NODE_ENV','production');
    expect(() => withPortalTestSession({} as Principal, () => undefined)).toThrow('Test sessions are disabled');
    expect(await getPortalPrincipal()).toBeNull();
  });
});
