import {db} from '@/lib/db';
import {canAccessLoop,type Principal} from '@/lib/emba/access';
import {audit,authorize} from '@/lib/emba/consent';
import {readAnnouncement} from '@/lib/emba/announcements';
import {getAnnouncementSigner} from '@/lib/emba/announcement-signer';
import {ActionForm} from '@/components/emba/portal-forms';
import {publishNotice,changeAnnouncementKeyStatus} from './announcement-actions';

type Scope={orgId:string;loopId:string};
function NoticeForm({scope,notice}:{scope:Scope;notice?:{id:string;version:number;text:string}}) {
  return <ActionForm action={publishNotice} label={notice?'Publish correction':'Publish announcement'}>
    <input type="hidden" name="orgId" value={scope.orgId}/><input type="hidden" name="loopId" value={scope.loopId}/>
    {notice&&<><input type="hidden" name="announcementId" value={notice.id}/><input type="hidden" name="expectedVersion" value={notice.version}/></>}
    <label>Announcement text<textarea name="text" required maxLength={16000} defaultValue={notice?.text}/></label>
    <p>This notice will be visible to this loop. A signature attests its origin and integrity, not the truth of the content. Corrections preserve earlier versions.</p>
    <label className="lt-check"><input type="checkbox" name="reviewed" value="yes" required/>I reviewed this exact text and its trip context for publication.</label>
  </ActionForm>;
}
type Notice=Awaited<ReturnType<typeof readAnnouncement>>;
function Evidence({notice}:{notice:Notice}) {
  return <><p style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{notice.text}</p><p className="emba-meta">Version {notice.envelope.version} · {notice.envelope.timestamp} (UTC) · {notice.verified?'Verified service attestation':'Unverified signature — do not rely on this as an official notice'} · Key {notice.keyStatus}</p><p className="emba-meta">Attestation verifies origin and integrity, not the truth of the content.</p></>;
}
export async function AnnouncementPanel({principal,orgId,loopId}:{principal:Principal}&Scope) {
  const scope={orgId,loopId};
  let context,announcements,canPublish;
  try {
    context=await db().tx(async q=>{
      await authorize(q,principal,'plan:read',scope);
      const manages=principal.clientId===null&&await canAccessLoop(q,principal,orgId,loopId,'manage');
      const {rows:ids}=await q.query<{id:string;versions:number[]}>(`select a.id,array(select v.version from emba_announcement_version v where v.announcement_id=a.id order by v.version desc limit 10) versions from emba_announcement a where org_id=$1 and loop_id=$2 order by id limit 20`,[orgId,loopId]);
      const keys=manages?(await q.query<{id:string;status:string}>('select id,status from emba_announcement_key where org_id=$1 and loop_id=$2 order by registered_at desc limit 20',[orgId,loopId])).rows:[];
      await audit(q,principal,'plan:read',loopId);return {ids,keys,manages};
    });
    announcements=await Promise.all(context.ids.map(async row=>({id:row.id,versions:await Promise.all(row.versions.map(version=>readAnnouncement(db(),principal,row.id,version)))})));
    const signer=context.manages?await getAnnouncementSigner(scope):null;
    // Async source reads and signer resolution may outlive the original grant.
    // Recheck before output; discard organizer-only metadata after a demotion.
    const current=await db().tx(async q=>{
      await authorize(q,principal,'plan:read',scope);
      const manages=principal.clientId===null&&await canAccessLoop(q,principal,orgId,loopId,'manage');
      const keys=manages?(await q.query<{id:string;status:string}>('select id,status from emba_announcement_key where org_id=$1 and loop_id=$2 order by registered_at desc limit 20',[orgId,loopId])).rows:[];
      await audit(q,principal,'plan:read',loopId);return {manages,keys};
    });
    context={...context,...current};
    canPublish=!!signer&&context.keys.some(key=>key.id===signer.keyId&&key.status==='active');
  } catch {return <section id="announcements" className="lt-editor"><h2>Announcements</h2><p role="alert">Announcement evidence is unavailable. Please retry later.</p></section>;}
    return <section id="announcements" className="lt-editor"><h2>Announcements</h2>
      {!announcements.length&&<p>No announcements in this scope.</p>}
      {announcements.map(({id,versions})=>{const current=versions[0];return current&&<article key={id}>
        <Evidence notice={current}/>
        {versions.length>1&&<details><summary>Earlier immutable versions</summary>{versions.slice(1).map(notice=><div key={notice.envelope.version}><Evidence notice={notice}/></div>)}</details>}
        {versions.length===10&&<p>Showing the latest 10 versions.</p>}
        {canPublish&&<details><summary>Correct this announcement</summary><NoticeForm scope={scope} notice={{id,version:current.envelope.version,text:current.text}}/></details>}
      </article>;})}
      {announcements.length===20&&<p>Showing up to 20 announcements.</p>}
      {context.manages&&(canPublish?<details><summary>Publish an announcement</summary><NoticeForm scope={scope}/></details>:<p>Publishing and correcting signed announcements is unavailable until an active trusted signing service is configured.</p>)}
      {context.manages&&context.keys.length>0&&<details><summary>Announcement key status</summary><p>Retiring a key stops new signing and preserves verification of earlier notices. Revoked or compromised keys make their notices unverified. These changes cannot reactivate a key.</p>{context.keys.map(key=><div key={key.id}><p>Key {key.id} · {key.status}</p>{key.status!=='compromised'&&<ActionForm action={changeAnnouncementKeyStatus} label="Update key status"><input type="hidden" name="keyId" value={key.id}/><label>New status<select name="status">{key.status==='active'&&<option value="retired">Retired</option>}{key.status!=='revoked'&&<option value="revoked">Revoked</option>}<option value="compromised">Compromised</option></select></label><label className="lt-check"><input name="reviewed" type="checkbox" value="yes" required/>I reviewed the effect on existing announcements.</label></ActionForm>}</div>)}</details>}
    </section>;
}
