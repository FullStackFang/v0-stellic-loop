import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { Principal } from './access';

const fixture = new AsyncLocalStorage<Principal>();

// Provider selection is a release gate. Never fall back to legacy cookies,
// request-supplied identities, or assistant bearer tokens here.
export async function getPortalPrincipal(): Promise<Principal | null> {
  return process.env.NODE_ENV === 'test' ? fixture.getStore() ?? null : null;
}

export function withPortalTestSession<T>(principal: Principal, run: () => T): T {
  if (process.env.NODE_ENV !== 'test') throw new Error('Test sessions are disabled');
  return fixture.run(principal, run);
}
