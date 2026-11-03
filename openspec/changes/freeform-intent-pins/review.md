# Spec review

Reviewed against PostForm, post/verifyCode, parsePost/postAs, editProposal, SlotEditor, PlanView, proposal loading, existing Sun specs and the Stellic demo.

## Findings resolved before implementation

1. **Critical — recurrence could imply future consent.** Rhythm is an expressed preference. No future RSVP/calendar series is created. New dates require a fresh plan and count.
2. **High — prototype match counts are simulated.** Removed compatibility scores from production scope; show only real quorum information.
3. **High — metadata could disappear after OTP.** Require the normalized intent payload in pending post state and a replay integration test.
4. **High — ambiguous @ values could become false constraints.** Generic tags remain preferences. Exact slots use explicit typed pins and visible resolved dates.
5. **High — preference privacy was ambiguous.** Pins belong to the posted plan and are visibly disclosed to the space; no private-person matching model is implied.
6. **Medium — owner edits could rewrite agreed activity.** Preserve fixed title and row-locked open-plan authorization; only slot and metadata changes are allowed.
7. **Medium — pending Sun spec mandated the rejected field layout.** Added an explicit intent-posting delta superseding that layout while preserving its visual/quorum contracts.
8. **Medium — rich input could break mobile/keyboard use.** Native textarea, labeled inline editors, focus return, conservative parsing and narrow-screen browser checks.

## Verdict

Ready to implement this bounded composer-and-persistence change. Automated matching and recurring occurrence generation are explicitly outside this change, not partially implemented or implied by the interface.
