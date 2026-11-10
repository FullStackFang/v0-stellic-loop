import { ActionForm } from './portal-forms';
import type { PortalAction } from './portal-types';

export function PrivacyControls({exportAction,deleteAction}:{exportAction:PortalAction;deleteAction:PortalAction}) {
  return <section id="privacy" className="lt-editor">
    <h2>Your pilot data</h2>
    <p>Export and deletion require a verified sign-in within the last five minutes. If your session is older, sign in again when the provider is available.</p>
    <ActionForm action={exportAction} label="Prepare my data export"><p>Export your personal pilot data as a JSON file. It excludes other members’ private preferences and dependency identities. Keep the downloaded file somewhere private.</p></ActionForm>
    <details><summary>Delete my pilot data</summary>
      <ActionForm action={deleteAction} label="Delete pilot data">
        <p>Deletion removes your pilot preferences and feedback, revokes assistant access and membership, and withdraws your commitments. Plans that depend on you may change.</p>
        <p>Your shared public-board name and phone remain. Organization documents, activity descriptions and signed announcements remain; their text may still name you. Signed announcement history retains its original authorship record.</p>
        <p>Deletion cannot recall exports or information already delivered to an assistant. Backup retention and deletion timing are not finalized; this does not promise immediate erasure from backups.</p>
        <label className="lt-check"><input name="confirmDeletion" type="checkbox" value="delete-pilot-data" required/>I understand the retained data and want to delete my pilot personal data.</label>
      </ActionForm>
    </details>
  </section>;
}
