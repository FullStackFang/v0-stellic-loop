import { ActionForm } from './portal-forms';
import type { PortalAction } from './portal-types';

export function ResourceForm({action,operationId,orgId,loopId,documentId,version}:{action:PortalAction;operationId:string;orgId:string;loopId:string;documentId?:string;version?:number}) {
  return <ActionForm action={action} label={documentId?'Save corrected version':'Accept source'}>
    <input name="orgId" type="hidden" value={orgId}/><input name="loopId" type="hidden" value={loopId}/><input name="operationId" type="hidden" value={operationId}/>
    {documentId && <><input name="documentId" type="hidden" value={documentId}/><input name="expectedVersion" type="hidden" value={version}/></>}
    <label>Source title<input name="title" required maxLength={200}/></label>
    <label>Format<select name="mediaType"><option value="text/plain">Plain text</option><option value="application/json">Structured itinerary JSON</option></select></label>
    <label>Source content<textarea name="body" required maxLength={262144}/></label>
    <p>Upload trip documents only. Do not paste private conversations. Corrections create a new version that requires processing.</p>
  </ActionForm>;
}

export function ResourceControls({uploadAction,processAction,deleteAction,operationId,orgId,loopId,document}:{uploadAction:PortalAction;processAction:PortalAction;deleteAction:PortalAction;operationId:string;orgId:string;loopId:string;document:{id:string;version:number;state:string}}) {
  return <>
    <ActionForm action={processAction} label={document.state==='failed'?'Retry processing':'Process source'}><input name="documentId" type="hidden" value={document.id}/><input name="version" type="hidden" value={document.version}/><p className="emba-meta">Only the original uploader can process this version.</p></ActionForm>
    <details><summary>Correct this source</summary><ResourceForm action={uploadAction} operationId={operationId} orgId={orgId} loopId={loopId} documentId={document.id} version={document.version}/></details>
    <ActionForm action={deleteAction} label="Delete source"><input name="documentId" type="hidden" value={document.id}/><input name="version" type="hidden" value={document.version}/><label className="lt-check"><input type="checkbox" required/>I understand this removes current and historical source access.</label></ActionForm>
  </>;
}
