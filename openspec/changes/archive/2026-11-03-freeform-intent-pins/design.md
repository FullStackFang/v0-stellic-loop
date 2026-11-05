## Context

The app has real proposals, four-person default quorum, optional slot fields, phone verification with pending-action replay, and owner-only open-plan editing. Stellic's demo has rich intent inputs, but its compatibility counts are simulated. The approved visual reference is `public/demo/intent-rhythm.html`; the next iteration specifically requires freeform @ input.

## Goals / Non-Goals

**Goals:** A compact freeform composer with full manual correction, arbitrary multiword preferences, durable metadata, accessible controls and truthful state. Preserve identity, slot validation and quorum behavior.

**Non-Goals:** Automated semantic matching, demand counts, automatically scheduled recurring occurrences, recurring RSVPs, calendar synchronization, changing a shared plan's activity after people join. Rhythm records what the poster would like; a new occurrence still requires posting again and a fresh quorum.

## Decisions

1. Use a native textarea plus an interpretation row of editable/removable pins. This supports mobile keyboards, paste, undo and screen readers without a custom contenteditable editor. Tapping a pin opens a labeled inline editor. Editing the interpreted result rewrites the input into explicit @ syntax so there is one source of truth.
2. Deterministic parsing, not an LLM: untagged text is the activity; a trailing weekday can resolve to the next matching date in the board window, and explicit `@day:`, `@time:`, `@place:` and rhythm tags map to fields. Generic `@ramen`, `@after 7`, `@Hoi An` remain preferences. Multiword tags end at the next @ or newline. No guess that a cuisine is a location or that a preference is a commitment. Unrecognized language stays intact. Show resolved dates; reject invalid explicit days rather than silently dropping them.
3. Store `{rhythm, preferences}` in a version-independent additive `proposal.intent` JSONB column with a safe default. Slot fields remain authoritative for dates, lighting and calendar exports. Shared TypeScript validation bounds pins to 12, 60 characters each, and rhythm to once/weekly/fortnightly. Deduplicate pins case-insensitively. No new dependencies, tables or public API grants.
4. The post action includes normalized metadata in the OTP pending payload; replay validates it again. Read models expose it on plan detail. The owner may edit metadata on open plans under the existing row lock and authorization. Existing title immutability remains. Posting again carries metadata, but an expired slot date is cleared.
5. Pins are publicly visible on the posted plan, not private profile constraints. Composer copy says so. Custom pins are displayed as preferences, not enforced matching filters. Rhythm copy explicitly says each future plan needs a fresh count.
6. Existing creation and response actions keep their quorum transactions and notifications. No invented matching numbers or “on your calendar” confirmation. Existing leave/close actions remain the way to withdraw from a plan.

## Risks / Trade-offs

- Ambiguous free text → conservative recognition, visible interpretation, manual editors, deterministic round-trip tests.
- A typed @ might be part of an email → only @ at start or after whitespace starts a pin.
- Multiword pins can contain prose → delimiter helper text; no automatic loss of custom text.
- Rhythm could imply a recurring calendar event → clear preference label and no calendar RRULE or automatic future joins.
- OTP replay could lose edits → freeze the reviewed composer during verification; send all metadata into pending state.
- Many pins/large text/keyboard → scroll naturally; baseline composer fits 320×667 and 390×844, no clipped controls or fixed overlay.
- Existing spec conflict → this change explicitly supersedes the prior posting-form layout while retaining Sun visual language and fixed-title semantics.

## Migration Plan

Apply additive migration 0009 before deploying code that writes `intent`. Test all migrations and real action paths on isolated PGlite. No production test fixtures or resets. Old code ignores the extra column, so rollback can retain data safely. Production deployment is a separate operational step if database access is unavailable.

## Open Questions

None blocking. Automatic occurrence generation and compatibility matching are future capabilities requiring their own semantics and acceptance criteria.
