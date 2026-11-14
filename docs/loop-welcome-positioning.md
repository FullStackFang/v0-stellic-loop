# Loop welcome: carry intent into what comes next

2026-11-08. Positioning for a review prototype, not a claim of shipped functionality.

## The promise

**Keep what matters. Bring it to what comes next.**

What you want should have a life beyond one chat. Loop carries the preferences and intentions you choose to save into future conversations, alongside the resources and opportunities in groups you belong to. You control access. A useful suggestion can become a plan with other people, and feedback can inform the next suggestion.

The practical unit of value is **personal intent + current, authorized group context + an opportunity to act**. For example, a preference for hands-on learning in small groups can inform a cooking activity on a trip, a course practice session, or a workshop at a conference. A relevant preference transfers; a specific itinerary and a past commitment do not become permanent preferences.

## What the reference gets right

The supplied three-page Living Brain workspace PDF gives a new visitor an understandable problem (re-explaining context), a short personal introduction, specific benefits, evidence, an explanation of the mechanism, and candid limitations. Its illustrations make an abstract memory layer tangible. The useful pattern is that sequence, not its benchmark numbers.

Living Brain's current [homepage](https://livingbrain.com/) describes shared memory across compatible assistants and retrieval of relevant context. Its accuracy, token and latency figures are internal evaluations with different benchmark conditions, not evidence about Loop. Its [sign-in documentation](https://docs.livingbrain.com/mcp/sign-in) already describes OAuth scopes for reading, searching and capturing. Cross-assistant memory or scoped access alone is therefore an insufficient distinction. Do not reuse the deck's categorical competitor claim that other memory products have no sharing or access control without a current feature review.

Loop's proposed distinction is making owned intent useful in the communities, courses, trips and events a person participates in, including conditional group commitments and feedback on what happened. The deck itself says to compete on plans kept rather than memory storage (slides 12 and 17).

## Reasons a person might care

| Reason | Concrete convenience | What the pilot must establish |
| --- | --- | --- |
| Explain yourself less | Relevant saved preferences are available to the next connected assistant | Fewer repeated facts and corrections than the same assistant with its native memory |
| Get more from existing memberships | An answer combines personal fit with the actual itinerary, course material or event program | Less manual searching and copying; better accepted recommendations |
| Give latent interest a next step | An interest can persist until a relevant opportunity arises; users can express conditions for joining | More accepted and attended plans than ordinary invitations or RSVPs |
| Start without recruiting friends | Solo recommendations and authorized resources can be useful before anyone shares an interest | A successful first use before a social network forms |
| Carry learning forward | Feedback and explicit corrections update reusable preferences | Better fit on later uses, without overgeneralizing a single experience |
| Choose what travels | Scope and expiry separate assistant access from group disclosure | Users understand and can successfully inspect, restrict and revoke future reads |

These are design hypotheses, not established product outcomes. Avoid unsupported time savings, attendance lifts, retention improvements, or claims that Loop reaches every chat automatically.

## Page choices

- Keep the warm ivory, terracotta, navy and typography requested earlier; use only Loop branding.
- Lead with the portable intent benefit. Use the EMBA trip as one worked example rather than the product definition.
- Show one preference being reused in three situations with a working selector. Label generated suggestions as illustrative.
- Make permission control tangible with a clearly simulated revoke action. Explain that revocation blocks future reads and cannot erase data already received by another system.
- Put research in expandable explanations. Separate benchmark findings, the inference motivating Loop, and the test still required.
- Avoid importing the deck's loneliness, surveys and retention statistics into this first-user page: they address a different buyer and need their own source verification.

## Evidence and limits

See [the research notes](loop-intent-value-research.md) for PrefEval, LongMemEval, planning prompts, and common ground. A counterexample is important: [Carrera et al. (2018)](https://pmc.ncbi.nlm.nih.gov/articles/PMC7872013/) found no positive gym-attendance effect from planning prompts in a randomized study of 877 members. An intention layer cannot be presented as proven to cause follow-through merely because some planning interventions work.

The welcome page cites [Milkman et al. (2011)](https://pmc.ncbi.nlm.nih.gov/articles/PMC3127912/): the date-and-time intervention produced a covariate-adjusted 4.2 percentage-point increase in vaccination in a specific employee population. It is not evidence for conditional group commitments or recurring crews.

## User-provided references reviewed

- `C:/Users/Stephen.Fang/Downloads/Loop-vIntentLayer.pptx`: all 24 slides extracted and read; especially slides 8, 12–13, 15–20 and 23. No claim of visual PowerPoint inspection.
- `C:/Users/Stephen.Fang/OneDrive/Desktop/Workspace _ Living Brain.pdf`: all three pages' text reviewed in this conversation; page 1 rendered and inspected. The live workspace route exposes no substantive content to the web reader, so the supplied PDF is the workspace reference.

## Review artifact

`public/demo/loop-welcome-prototype/intent-layer.html`, also served as the prototype's `index.html`. This is a local, static concept with no user data, sign-in, real connector or persistence.
