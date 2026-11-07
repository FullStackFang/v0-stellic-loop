# EMBA membership and role controls

The pilot portal now lists trip contexts that the verified first-party member can access. Organizers can view the current scoped role directory, set or revoke a direct role, and root owners can remove an organization membership. Members can leave their organization. The portal uses names in selectors; person IDs remain form values only.

`lib/emba/roles.ts` checks the live identity, active membership, and the actor's scoped inherited role inside a serializable transaction. Only owners can set or remove owner or organizer roles. Organizers can manage member and follower roles in their authorized subtree. A role grant requires an existing active membership and a current pilot identity; it never enrolls a person. Role removal preserves any access still inherited from another active grant. Membership removal revokes all organization access, while a guard preserves at least one active verified owner for each root loop. Context leases for the affected organization are revoked, and activity eligibility is reconciled in the same transaction. No provider or legacy session is accepted.

The operation locks actor and target person rows in ID order before authorization, then the organization and hierarchy, and finally updates the target grant or membership before reconciling activities. This matches the personal-to-hierarchy-to-activity order used by the parallel access hardening work. Concurrent conflicting transactions can raise a serializable conflict; callers should retry the complete operation after refreshing state.

The existing `activity:write` audit action records these changes because the audit constraint has no membership-specific action. The directory is for membership administration and contains no attendance, commitments, or private memory.

Verification: focused role and portal tests passed (31 tests), TypeScript `--noEmit` passed, and ESLint passed on changed files. The root agent is running the broader native PostgreSQL sweep. No full build was run here.
