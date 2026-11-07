# Independent implementation-spec review

Date: 2026-11-07. Reviewer: separate subagent `portable_memory_spec_review`. Scope: proposal, design, all four capability specs and tasks, compared with existing access/consent/confirmation services and the intended Claude/ChatGPT group-memory demo. This is specification review, not implementation or host acceptance.

## Findings and revisions

1. **Decision authority after promotion.** Original wording allowed members to withdraw their own records after an organizer promoted them to decisions. Revised design/spec/tasks require current management authority for every mutation of a current decision, including withdrawal and demotion, regardless of original authorship. Added original-author/demoted-organizer denial scenario.
2. **Retry after withdrawal.** Returning an unspecified original result could resurface withdrawn content. Revised receipts contain only operation ID, record ID, committed version and current lifecycle status, with current authorization; never old text, snippets or source metadata. Added retry-after-correction/invalidation/withdrawal scenario.
3. **Trusted client in review.** Copy/pasted candidate data cannot supply its own trusted assistant identity. Revised review contract displays configured client identity and validates current scoped consent, rejecting unknown/disallowed/revoked/expired/wrong-scope connections. Added forged-label/client substitution scenario.
4. **Bounded dependency work.** Eight direct references alone did not bound transitive validation. Added eight-level/64-unique-source limits per record and rejection of over-budget publication/correction without dropping required checks.

## Scope assessment

The reviewer found the additive architecture aligned with portable group memory and the existing foundation. The proposal does not claim universal native mentions, host audience attestation, real OAuth acceptance, raw-chat compilation or vector retrieval. Existing provider/account and enrollment-policy gates remain explicit. Local implementation tasks can proceed independently of those external decisions; a live demo cannot be claimed complete until the actual host tasks pass.

## Validation

OpenSpec strict validation passes and apply instructions recognize 28 unchecked implementation tasks. No product code was changed and no production build is warranted for this documentation-only change.

Final focused rereview: the separate reviewer confirmed all three substantive findings resolved consistently across design, requirements, scenarios and tasks; dependency work is explicitly bounded. No blocking specification findings remain. Ready for local implementation, not a claim of real-host or production readiness.
