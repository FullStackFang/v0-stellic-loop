import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Principal } from './access';
import {db} from '../db';
import {clerkPortalConfigured,getClerkPortalPrincipal} from './clerk-identity';

const fixture = new AsyncLocalStorage<Principal>();

// Never fall back to legacy cookies, request identities, or assistant tokens.
export async function getPortalPrincipal(): Promise<Principal | null> {
  if(process.env.NODE_ENV==='test') return fixture.getStore()??null;
  return clerkPortalConfigured()?getClerkPortalPrincipal(db()):null;
}

export function withPortalTestSession<T>(principal: Principal, run: () => T): T {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test sessions are disabled');
  return fixture.run(principal, run);
}
