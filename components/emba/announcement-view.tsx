import type {readAnnouncement} from '@/lib/emba/announcements';
import {ActionForm} from './portal-forms';
import type {PortalAction} from './portal-types';

type Scope={orgId:string;loopId:string};
function NoticeForm({scope,notice,action}:{scope:Scope;notice?:{id:string;version:number;text:string};action:PortalAction}) {
  return <ActionForm action={action} label={notice?'Publish correction':'Publish announcement'}>
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
export function AnnouncementView({scope,announcements,manages,keys,canPublish,publishAction,keyStatusAction}:{scope:Scope;announcements:{id:string;versions:Notice[]}[];manages:boolean;keys:{id:string;status:string}[];canPublish:boolean;publishAction:PortalAction;keyStatusAction:PortalAction}) {
    return <section id="announcements" className="lt-editor"><h2>Announcements</h2>
      {!announcements.length&&<p>No announcements in this scope.</p>}
      {announcements.map(({id,versions})=>{const current=versions[0];return current&&<article key={id}>
        <Evidence notice={current}/>
        {versions.length>1&&<details><summary>Earlier immutable versions</summary>{versions.slice(1).map(notice=><div key={notice.envelope.version}><Evidence notice={notice}/></div>)}</details>}
        {versions.length===10&&<p>Showing the latest 10 versions.</p>}
        {canPublish&&<details><summary>Correct this announcement</summary><NoticeForm action={publishAction} scope={scope} notice={{id,version:current.envelope.version,text:current.text}}/></details>}
      </article>;})}
      {announcements.length===20&&<p>Showing up to 20 announcements.</p>}
      {manages&&(canPublish?<details><summary>Publish an announcement</summary><NoticeForm action={publishAction} scope={scope}/></details>:<p>Publishing and correcting signed announcements is unavailable until an active trusted signing service is configured.</p>)}
      {manages&&keys.length>0&&<details><summary>Announcement key status</summary><p>Retiring a key stops new signing and preserves verification of earlier notices. Revoked or compromised keys make their notices unverified. These changes cannot reactivate a key.</p>{keys.map(key=><div key={key.id}><p>Key {key.id} · {key.status}</p>{key.status!=='compromised'&&<ActionForm action={keyStatusAction} label="Update key status"><input type="hidden" name="keyId" value={key.id}/><label>New status<select name="status">{key.status==='active'&&<option value="retired">Retired</option>}{key.status!=='revoked'&&<option value="revoked">Revoked</option>}<option value="compromised">Compromised</option></select></label><label className="lt-check"><input name="reviewed" type="checkbox" value="yes" required/>I reviewed the effect on existing announcements.</label></ActionForm>}</div>)}</details>}
    </section>;
}
