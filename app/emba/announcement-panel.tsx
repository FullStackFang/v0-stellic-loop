import {db} from '@/lib/db';
import {canAccessLoop,type Principal} from '@/lib/emba/access';
import {audit,authorize} from '@/lib/emba/consent';
import {readAnnouncement} from '@/lib/emba/announcements';
import {getAnnouncementSigner} from '@/lib/emba/announcement-signer';
import {AnnouncementView} from '@/components/emba/announcement-view';
import {publishNotice,changeAnnouncementKeyStatus} from './announcement-actions';

type Scope={orgId:string;loopId:string};
type Notice=Awaited<ReturnType<typeof readAnnouncement>>;
export async function AnnouncementPanel({principal,orgId,loopId}:{principal:Principal}&Scope) {
  const scope={orgId,loopId};
  let context,announcements:{id:string;versions:Notice[]}[],canPublish;
  try {
    context=await db().tx(async q=>{
      await authorize(q,principal,'plan:read',scope);
      const manages=principal.clientId===null&&await canAccessLoop(q,principal,orgId,loopId,'manage');
      const {rows:ids}=await q.query<{id:string;versions:number[]}>(`select a.id,array(select v.version from emba_announcement_version v where v.announcement_id=a.id order by v.version desc limit 10) versions from emba_announcement a where org_id=$1 and loop_id=$2 order by id limit 20`,[orgId,loopId]);
      const keys=manages?(await q.query<{id:string;status:string}>('select id,status from emba_announcement_key where org_id=$1 and loop_id=$2 order by registered_at desc limit 20',[orgId,loopId])).rows:[];
      await audit(q,principal,'plan:read',loopId);return {ids,keys,manages};
    });
    const signer=context.manages?await getAnnouncementSigner(scope):null;
    // Resolve the potentially remote signer before checking notice signatures:
    // a key may be retired or compromised while that resolution is pending.
    announcements=await Promise.all(context.ids.map(async row=>({id:row.id,versions:await Promise.all(row.versions.map(version=>readAnnouncement(db(),principal,row.id,version)))})));
    // Async source reads and signer resolution may outlive the original grant.
    // Recheck before output; discard organizer-only metadata after a demotion.
    const current=await db().tx(async q=>{
      await authorize(q,principal,'plan:read',scope);
      const manages=principal.clientId===null&&await canAccessLoop(q,principal,orgId,loopId,'manage');
      const keyIds=[...new Set(announcements.flatMap(row=>row.versions.map(notice=>notice.envelope.keyId)))];
      const {rows:noticeKeys}=await q.query<{id:string;status:'active'|'retired'|'revoked'|'compromised';statusAt:string|null}>(
        'select id,status,status_at as "statusAt" from emba_announcement_key where id=any($1::uuid[]) order by id for share',[keyIds]);
      if(noticeKeys.length!==keyIds.length)throw new Error('Announcement key unavailable');
      const keys=manages?(await q.query<{id:string;status:string}>('select id,status from emba_announcement_key where org_id=$1 and loop_id=$2 order by registered_at desc limit 20',[orgId,loopId])).rows:[];
      await audit(q,principal,'plan:read',loopId);return {manages,keys,noticeKeys};
    });
    const noticeKeys=new Map(current.noticeKeys.map(key=>[key.id,key]));
    announcements=announcements.map(row=>({...row,versions:row.versions.map(notice=>{
      const key=noticeKeys.get(notice.envelope.keyId)!;
      const historical=key.status==='active'||(key.status==='retired'&&!!key.statusAt&&Date.parse(notice.envelope.timestamp)<=Date.parse(key.statusAt));
      return {...notice,keyStatus:key.status,verified:notice.verified&&historical};
    })}));
    context={...context,...current};
    canPublish=!!signer&&context.keys.some(key=>key.id===signer.keyId&&key.status==='active');
  } catch {return <section id="announcements" className="lt-editor"><h2>Announcements</h2><p role="alert">Announcement evidence is unavailable. Please retry later.</p></section>;}
  return <AnnouncementView scope={scope} announcements={announcements} manages={context.manages} keys={context.keys} canPublish={canPublish} publishAction={publishNotice} keyStatusAction={changeAnnouncementKeyStatus}/>;
}
