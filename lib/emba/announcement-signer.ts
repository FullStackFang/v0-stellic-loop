import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { AnnouncementSigner } from './announcements';

type Scope={orgId:string;loopId:string};
type Resolver=(scope:Scope)=>Promise<AnnouncementSigner|null>;
const fixture=new AsyncLocalStorage<Resolver>();

// Production custody and provider selection remain a release gate. Never load
// signing material or key IDs from a browser form, cookie, or announcement text.
export async function getAnnouncementSigner(scope:Scope):Promise<AnnouncementSigner|null> {
  return process.env.NODE_ENV==='test' ? await fixture.getStore()?.(scope)??null : null;
}
export function withAnnouncementTestSigner<T>(resolve:Resolver,run:()=>T):T {
  if(process.env.NODE_ENV!=='test')throw new Error('Test signers are disabled');
  return fixture.run(resolve,run);
}
