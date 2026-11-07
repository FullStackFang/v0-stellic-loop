import 'server-only';
import { createHash, createPublicKey, randomUUID, verify } from 'node:crypto';
import { z } from 'zod';
import type { Db,Q } from '../db';
import { canAccessLoop,type Principal } from './access';
import { audit,authorize,requireFirstParty } from './consent';
import { EmbaError } from './errors';

const scopeSchema=z.object({orgId:z.uuid(),loopId:z.uuid()});
const envelopeSchema=z.strictObject({schema:z.literal('emba-announcement-v1'),attestation:z.literal('service-attested'),orgId:z.uuid(),loopId:z.uuid(),id:z.uuid(),version:z.number().int().positive(),authorId:z.uuid(),timestamp:z.iso.datetime(),keyId:z.uuid(),contentDigest:z.string().regex(/^[a-f0-9]{64}$/)});
export type AnnouncementEnvelope=z.infer<typeof envelopeSchema>;
// This interface is server-only and never constructed from HTTP input. Production
// secret custody/provisioning remains disabled; local tests inject ephemeral keys.
export type AnnouncementSigner={keyId:string;sign:(bytes:Buffer)=>Promise<Buffer>};
type Key={id:string;orgId:string;loopId:string;publicKey:string;status:'active'|'retired'|'revoked'|'compromised';statusAt:string|null;registeredAt:string};
function canonical(input:AnnouncementEnvelope):Buffer {
  const e=envelopeSchema.parse(input);
  return Buffer.from(JSON.stringify([e.schema,e.attestation,e.orgId,e.loopId,e.id,e.version,e.authorId,e.timestamp,e.keyId,e.contentDigest]),'utf8');
}
const digest=(text:string)=>createHash('sha256').update(text,'utf8').digest('hex');
export function verifyAnnouncement(envelope:AnnouncementEnvelope,text:string,signature:string,publicKey:string):boolean {
  try {
    const key=createPublicKey(publicKey);
    return key.asymmetricKeyType==='ed25519' && envelope.contentDigest===digest(text) && verify(null,canonical(envelope),key,Buffer.from(signature,'base64'));
  } catch {return false;}
}
async function manage(q:Q,p:Principal,scope:{orgId:string;loopId:string}) {
  await requireFirstParty(q,p);
  if(!await canAccessLoop(q,p,scope.orgId,scope.loopId,'manage')) throw new EmbaError('forbidden');
}
async function getKey(q:Q,id:string,lock=false):Promise<Key> {
  const {rows:[key]}=await q.query<Key>(`select id,org_id as "orgId",loop_id as "loopId",public_key as "publicKey",status,status_at as "statusAt",registered_at as "registeredAt" from emba_announcement_key where id=$1${lock?' for share':''}`,[id]);
  if(!key) throw new EmbaError('not_found');
  return key;
}
export async function registerAnnouncementKey(db:Db,p:Principal,input:unknown):Promise<{id:string}> {
  const data=scopeSchema.extend({publicKey:z.string().min(1).max(1000)}).parse(input);
  const publicKey=createPublicKey(data.publicKey);
  if(publicKey.asymmetricKeyType!=='ed25519') throw new EmbaError('forbidden');
  // createPublicKey also accepts private PEM input. Persist only its public
  // SPKI export, never the original supplied material.
  const publicPem=publicKey.export({type:'spki',format:'pem'}).toString();
  return db.tx(async q=>{
    await manage(q,p,data);
    const {rows:[key]}=await q.query<{id:string}>('insert into emba_announcement_key(org_id,loop_id,public_key,registered_by) values ($1,$2,$3,$4) returning id',[data.orgId,data.loopId,publicPem,p.personId]);
    await audit(q,p,'knowledge:write',key.id);
    return key;
  });
}
export async function retireAnnouncementKey(db:Db,p:Principal,id:string,status:'retired'|'revoked'|'compromised') {
  z.uuid().parse(id);z.enum(['retired','revoked','compromised']).parse(status);
  await db.tx(async q=>{
    await manage(q,p,await getKey(q,id));
    await q.query('select id from emba_announcement_key where id=$1 for update',[id]);
    const key=await getKey(q,id);
    if((key.status==='compromised' && status!=='compromised') || (key.status==='revoked' && status==='retired')) throw new EmbaError('conflict');
    await q.query('update emba_announcement_key set status=$2,status_at=case when status=$2 then status_at else clock_timestamp() end where id=$1',[id,status]);
    await audit(q,p,'knowledge:write',id);
  });
}
export async function publishAnnouncement(db:Db,p:Principal,input:unknown,signer:AnnouncementSigner):Promise<{id:string;version:number}> {
  const data=scopeSchema.extend({text:z.string().trim().min(1).max(16000),announcementId:z.uuid().optional(),expectedVersion:z.number().int().positive().optional()}).refine(v=>Boolean(v.announcementId)===Boolean(v.expectedVersion)).parse(input);
  z.uuid().parse(signer.keyId);
  return db.tx(async q=>{
    await manage(q,p,data);
    await q.query('select id from emba_announcement_key where id=$1 for share',[signer.keyId]);
    const key=await getKey(q,signer.keyId);
    if(key.status!=='active' || key.orgId!==data.orgId || key.loopId!==data.loopId) throw new EmbaError('forbidden');
    const id=data.announcementId??randomUUID();let version=1;
    if(data.announcementId) {
      const {rows:[prior]}=await q.query<{orgId:string;loopId:string;version:number}>('select org_id as "orgId",loop_id as "loopId",current_version as version from emba_announcement where id=$1 for update',[id]);
      if(!prior) throw new EmbaError('not_found');
      if(prior.orgId!==data.orgId || prior.loopId!==data.loopId) throw new EmbaError('forbidden');
      if(prior.version!==data.expectedVersion) throw new EmbaError('conflict');
      version=prior.version+1;
    }
    // Key registration/retirement use the database clock. Use that same clock
    // for signed timestamps so application-host skew cannot invalidate notices.
    const {rows:[clock]}=await q.query<{timestamp:string}>('select clock_timestamp() as timestamp');
    const envelope:AnnouncementEnvelope={schema:'emba-announcement-v1',attestation:'service-attested',orgId:data.orgId,loopId:data.loopId,id,version,authorId:p.personId,timestamp:clock.timestamp,keyId:key.id,contentDigest:digest(data.text)};
    const signature=(await signer.sign(canonical(envelope))).toString('base64');
    if(!verifyAnnouncement(envelope,data.text,signature,key.publicKey)) throw new EmbaError('forbidden');
    await manage(q,p,data);
    if((await getKey(q,key.id)).status!=='active') throw new EmbaError('forbidden');
    if(data.announcementId) await q.query('update emba_announcement set current_version=$2 where id=$1',[id,version]);
    else await q.query('insert into emba_announcement(id,org_id,loop_id,current_version) values ($1,$2,$3,$4)',[id,data.orgId,data.loopId,version]);
    await q.query('insert into emba_announcement_version(announcement_id,version,text,envelope,signature,key_id) values ($1,$2,$3,$4::jsonb,$5,$6)',[id,version,data.text,JSON.stringify(envelope),signature,key.id]);
    await audit(q,p,'knowledge:write',id);
    return {id,version};
  });
}
export async function readAnnouncement(db:Db,p:Principal,id:string,version?:number) {
  z.uuid().parse(id);if(version!==undefined) z.number().int().positive().parse(version);
  return db.tx(async q=>{
    const {rows:[row]}=await q.query<{orgId:string;loopId:string;version:number;text:string;envelope:AnnouncementEnvelope;signature:string;keyId:string}>(`select a.org_id as "orgId",a.loop_id as "loopId",v.version,v.text,v.envelope,v.signature,v.key_id as "keyId" from emba_announcement a join emba_announcement_version v on v.announcement_id=a.id and v.version=coalesce($2::integer,a.current_version) where a.id=$1`,[id,version??null]);
    if(!row) throw new EmbaError('not_found');
    const lease=await authorize(q,p,'plan:read',row);
    await audit(q,p,'plan:read',id,lease);
    await authorize(q,p,'plan:read',row);
    const key=await getKey(q,row.keyId,true), e=row.envelope;
    const historical=key.status==='active' || (key.status==='retired' && !!key.statusAt && Date.parse(e.timestamp)<=Date.parse(key.statusAt));
    const verified=historical && e.id===id && e.version===row.version && e.orgId===row.orgId && e.loopId===row.loopId && e.keyId===key.id && key.orgId===row.orgId && key.loopId===row.loopId && Date.parse(e.timestamp)>=Date.parse(key.registeredAt) && verifyAnnouncement(e,row.text,row.signature,key.publicKey);
    return {text:row.text,envelope:e,signature:row.signature,verified,keyStatus:key.status,attestation:'service-attested' as const,untrusted:true as const};
  });
}
