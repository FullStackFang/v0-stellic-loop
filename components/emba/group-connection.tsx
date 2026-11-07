import {ActionForm} from './portal-forms';
import type {PortalAction} from './portal-types';
export function GroupConnection({clients,endpoint,orgId,loopId,action}:{clients:string[];endpoint:string;orgId:string;loopId:string;action:PortalAction}){
 return <section aria-label="Connect your assistant"><h3>Use this group in your assistant</h3><p>First grant access to this group. Then add the Loop connector in your assistant using the address below and sign in with the same Loop account.</p>
 <ActionForm action={action} label="Allow access to this group for 7 days"><input type="hidden" name="orgId" value={orgId}/><input type="hidden" name="loopId" value={loopId}/><label>Assistant<select name="clientId">{clients.map(client=><option key={client} value={client}>{client.startsWith('https://claude.ai/')?'Claude':client}</option>)}</select></label><p>Read this group’s shared notes and trip resources. Private preferences are not included in this grant.</p><label><input type="checkbox" name="allowWrites" value="yes"/>Also allow requests to change shared notes. Every change still needs my review in Loop.</label></ActionForm>
 <label>Loop connector address<input readOnly value={endpoint}/></label><p>Use a one-to-one assistant conversation. Loop cannot recall earlier responses or verify who can see a shared chat.</p></section>;
}
