# Synthetic browser rehearsal

The local harness exercises the actual `MemoryForm`, `MemoryProposalReview`, `ConnectionForm`, `AssistantReview`, `PrivacyControls` and `ActionForm` components, actual portal server actions, and the real EMBA services/migrations against disposable in-memory PGlite. It uses the application's root, trip and portal styles and bundled Archivo font. It does not connect a real identity provider, emulate OAuth, add test routes to Next.js, or claim to test Next.js Server Action transport.

## Run

Start with no application/test database URLs configured:

```powershell
npm run emba:browser
```

Open `http://127.0.0.1:4319`. Each restart creates a fresh synthetic Vietnam/Estonia fixture. The actor selector is explicitly a test harness control, not sign-in. Stop with Ctrl+C; the disposable database disappears.

`test/emba-browser/rehearse.mjs` exports a Playwright function accepting an existing `page`. A Playwright runner can import and call it. With the connected Playwright tool, read the source as UTF-8, replace `export default async function run(page)` with `async (page) =>`, and pass that function text to `browser_run_code_unsafe`. Start a fresh fixture before each complete run. No additional browser test framework or dependency was installed; the session used the existing connected Chromium browser.

The test-only preload sets `NODE_ENV=test` and replaces the `server-only` marker plus `next/cache` with a no-op `revalidatePath`. Every action reloads actual database-backed view data instead. The existing `withPortalTestSession` AsyncLocalStorage supplies the synthetic identity to unchanged application actions. This preload is not imported by the app or deployment entrypoints. It refuses `NODE_ENV=production`; the server refuses remote database mode and configured database URLs, binds only `127.0.0.1`, and rejects mutations without the exact Origin, JSON content type and a random per-process capability. The capability is not logged. All fixture endpoints contain synthetic data only.

## Observed coverage

The browser run on November 6, 2026 used Chrome 156 on Windows and passed 18 interaction/boundary checks. A follow-up with the full application global styles and bundled Archivo font repeated keyboard persistence and all three viewport checks:

- Keyboard-only preference entry through Tab/Enter persisted a real private row; correction produced version 2.
- Member B and organizer views excluded Member A's private preference.
- Delegated reads failed before consent, succeeded after a browser-granted lease, and failed after browser revocation.
- An activity changed after browser review caused stale approval to fail; fresh review and explicit approval produced a confirmation that executed through the real service, while replay failed.
- The current-revision commitment persisted and browser withdrawal changed it to withdrawn without an assistant.
- A nonmember received no trip evidence/activity and could not review/approve the copied consequential action.
- The exercised harness had no horizontal overflow at 320, 390 and 1440 px; fields, labels and focusable controls were present. This is targeted responsive/keyboard verification, not a full accessibility audit.
- Missing capability/Origin and foreign-Origin mutation requests were denied.

The driver checks database-backed state after user actions, not merely success copy. Local visual evidence is `.playwright-mcp/emba-browser-mobile.png` for the interaction run and `.playwright-mcp/emba-browser-mobile-styled.png` for the final global-style/font pass. These ignored screenshots contain only synthetic fixture data. Production-mode startup and remote-database mode were also explicitly attempted and correctly refused before database use.

The separate `test/emba-browser/proposal-privacy.mjs` driver passed 17 additional checks on a fresh fixture at a 390 px viewport. Run it using the same Playwright procedure above, restarting the fixture first. It verified that reviewing a structured want does not save it, acceptance requires the review checkbox, conflicts show the current want, concurrent explicit corrections defeat stale acceptance, stale review removes acceptance, and archived want reactivation requires explicit review. Another member could not retrieve the target owner's current want through proposal review.

The same run exercised the actual privacy controls and downloaded the actual export: authentication without a fresh timestamp offered no download; fresh authentication produced an export containing the owner's data and excluding another member's private preference. Expired authentication blocked deletion. Successful deletion immediately denied the previous principal's portal read, export and attempt to recreate memory, while the other member retained their own data. Fresh/expired authentication uses a clearly marked synthetic fixture control with the real trusted authentication service; it does not demonstrate provider reauthentication. Local screenshot evidence is `.playwright-mcp/emba-browser-proposal-privacy.png`. The harness was stopped after verification.

The separate `test/emba-browser/organizer.mjs` driver passed 17 further checks at a 390 px viewport, in addition to the earlier 18 and 17 checks. It imports the same `InvitationForm`, `InvitationAcceptance`, `InvitationRevoke`, `ResourceForm` and `ResourceControls` used by the portal. It verified organizer invitation creation, wrong-recipient rejection, revocation, expiration, matching-recipient enrollment and consumed-token replay rejection. Synthetic verifier claims use fixed `example.test` addresses; an explicit fixture control moves invitation timestamps into the past while preserving database constraints. No email was sent and no real identity account was used.

The resource checks verified malformed structured-content rejection before persistence; accepted sources remaining unavailable as evidence until processing; the real retry action recovering a simulated failed-worker state; correction producing a new version requiring processing; member denial of organizer processing; member-visible current citations and timezone; absence of organizer mutation controls in member views; browser deletion confirmation; and removal of both current and historical source access after deletion. Failure injection changes only the disposable fixture's processing state, so this does not demonstrate recovery from an actual worker outage. Screenshot evidence is `.playwright-mcp/emba-browser-organizer.png`. This run also checks database-backed state, and its server was stopped afterwards. TypeScript and focused ESLint passed.

The separate `test/emba-browser/roles.mjs` driver passed 16 membership checks on a fresh fixture at 390 px, using the actual `RolesPanel` with injected real server actions. A fixture-only owner and root/child context selector enable the authority checks. The run verified organizer member/follower grants, preservation of inherited membership after a child follower grant and direct-role revocation, denial of copied organizer escalation and ordinary-member mutations, and absence of unauthorized administration controls. It also verified last-root-owner leave rejection, owner removal immediately hiding trip activities/documents/passages while retaining the removed member's private Want, explicit assignment of a second root owner, and the prior owner's successful departure with administration retained by the new owner. The exercised panel had no horizontal overflow. Screenshot evidence is `.playwright-mcp/emba-browser-roles.png`; TypeScript and focused ESLint passed, and the server was stopped. These 16 checks are additional to the earlier 18 base, 17 proposal/privacy and 17 invitation/resource checks.

The separate `test/emba-browser/announcements.mjs` driver passed 15 announcement checks at 390 px. It uses the actual extracted `AnnouncementView`, unchanged publication/key-status actions, and real Ed25519 services with a disposable fixture key supplied through the existing test-only signer resolver. The browser verified review-checkbox gating, verified service attestation, HTML-like/instruction content displayed as text, member/nonmember access limits, rejection of unauthorized publication and key changes, correction to version 2 with immutable history, stale-correction rejection, key retirement preserving historical verification while blocking new signing, and revocation making current and historical member evidence unverified with a visible warning. Long source content fit the mobile viewport. Evidence is `.playwright-mcp/emba-browser-announcements.png`; the server was stopped after verification. These 15 checks are additional to the prior four drivers, for 83 recorded browser checks across five drivers.

The same slice's independent service/panel review reproduced a signer-resolution race: a key compromised while signer lookup was pending could leave earlier notice reads rendered as verified. The panel now resolves the signer before reading announcement signatures. A second regression covers a key changing after an individual notice read; the final output check locks and refreshes every displayed notice key for member and organizer views, preserving valid retirement history and invalidating revoked or compromised signatures. The browser fixture does not exercise a real remote signer delay or production key custody.

## Remaining acceptance boundaries

Real provider sign-in, invitation-to-provider linking, deployed session cookies, Next.js request/CSRF integration, real Claude/ChatGPT accounts and authenticated full-page browser routing remain unverified. The harness composes real components in a fixture page; it is not the full `/emba` route. The selected browser flows are targeted acceptance coverage, not an exhaustive mobile or accessibility audit. No source-generated instructions are executed; dedicated knowledge/announcement tests cover that boundary.

Tasks 2.5 and 8.2 therefore gain actual keyboard/mobile component-to-action-to-database evidence but remain partial until the real authenticated portal and remaining acceptance flows are exercised. No real-member enrollment is authorized by this rehearsal.
