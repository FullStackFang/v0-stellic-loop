import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createPrivateKey, sign } from 'node:crypto';
import { z } from 'zod';
import type { AnnouncementSigner } from './announcements';

type Scope={orgId:string;loopId:string};
type Resolver=(scope:Scope)=>Promise<AnnouncementSigner|null>;
const fixture=new AsyncLocalStorage<Resolver>();
const keysSchema=z.array(z.strictObject({orgId:z.uuid(),loopId:z.uuid(),keyId:z.uuid(),privateKey:z.string().min(1).max(2048)})).max(16);

// Service-held Ed25519 custody: deploy this JSON only as a server secret. The
// registered public key, current key status and organizer authority are still
// checked by publishAnnouncement. Never accept signing material from a request.
export async function getAnnouncementSigner(scope:Scope):Promise<AnnouncementSigner|null> {
  const resolve=process.env.NODE_ENV==='test'?fixture.getStore():undefined;
  if(resolve)return resolve(scope);
  const raw=process.env.LOOP_ANNOUNCEMENT_KEYS;
  if(!raw||Buffer.byteLength(raw,'utf8')>16384)return null;
  try {
    const scopes=new Set<string>(),ids=new Set<string>();
    const keys=keysSchema.parse(JSON.parse(raw)).map(entry=>{
      const context=`${entry.orgId}:${entry.loopId}`;
      if(scopes.has(context)||ids.has(entry.keyId))throw new Error('Duplicate key configuration');
      scopes.add(context);ids.add(entry.keyId);
      const privateKey=createPrivateKey(entry.privateKey);
      if(privateKey.asymmetricKeyType!=='ed25519')throw new Error('Unsupported signing key');
      return {orgId:entry.orgId,loopId:entry.loopId,keyId:entry.keyId,privateKey};
    });
    const key=keys.find(entry=>entry.orgId===scope.orgId&&entry.loopId===scope.loopId);
    return key?{keyId:key.keyId,sign:async bytes=>sign(null,bytes,key.privateKey)}:null;
  } catch {
    // Parsing/OpenSSL errors may contain configuration material. Do not log or
    // return them, and do not retain a previous key after a bad configuration.
    return null;
  }
}
export function withAnnouncementTestSigner<T>(resolve:Resolver,run:()=>T):T {
  if(process.env.NODE_ENV!=='test')throw new Error('Test signers are disabled');
  return fixture.run(resolve,run);
}
