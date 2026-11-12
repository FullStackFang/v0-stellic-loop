# Loop: evidence for the value of an intent layer

Research checked 2026-11-08. These sources motivate a product hypothesis; none measures Loop, proves its privacy controls, or establishes a time saving for its users.

## Recommended promise

**Keep what matters. Bring it to what comes next.**

Loop gives the preferences and intentions you choose to save a life beyond one chat. Your next assistant can use relevant context from you and the groups you belong to, with access you control.

The distinctive value is the connection: personal context + current group context + a future occasion to use them. A stored preference alone is memory. An itinerary alone is information. Together, “I like quiet local places” and “I have two hours before our bus” can become a useful plan without assembling the background again.

This is proposed product copy, subject to actual implementation. Do not claim unrestricted interoperability, automatic capture of every chat, or that revocation erases information already read by a third-party agent.

## 1. Remembered context must also be applied

**Finding:** PrefEval evaluates 3,000 preference/query pairs across 20 topics and 10 models. In the paper's zero-shot setting, most evaluated models fell below 10% preference-following accuracy after 10 turns; longer contexts remained challenging even with prompting and retrieval.

**Safe takeaway:** Merely mentioning a preference earlier does not guarantee that an assistant will use it later. Explicit, relevant preference context is a sensible design target.

**Limitation:** This is an ICLR 2025 benchmark of specific models and tasks, not a claim about every current assistant, deployed memory feature, or everyday conversation. Do not put “AI forgets 90% of you” on the page.

**Page copy:** “Less explaining yourself. More starting from what matters.”

Source: Zhao et al., *Do LLMs Recognize Your Preferences? Evaluating Personalized Preference Following in LLMs*, ICLR 2025. https://arxiv.org/abs/2502.09597

## 2. Useful continuity includes changes, not just recall

**Finding:** LongMemEval separates five abilities: extraction, reasoning across sessions, temporal reasoning, updating knowledge, and abstaining when the answer is not known. Its 500-question benchmark found a reported 30% accuracy drop for the tested commercial assistants and long-context models across sustained interactions.

**Safe takeaway:** Personal context should be maintained and corrected, not accumulated indiscriminately. The relevant goal is remembering what is true and useful now.

**Limitation:** Results describe the paper's systems and benchmark setup. They do not prove Loop improves accuracy, and “30%” must not be represented as a universal failure rate or percentage-point change.

**Page copy:** “Your next conversation can start where you are now.” A preference card can visibly show “Prefer small groups · updated by you” to make correction concrete.

Source: Wu et al., *LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory*, ICLR 2025. https://arxiv.org/abs/2410.10813

## 3. Make an intention specific enough to act on

**Finding:** A randomized field study of 3,272 employees found that adding a prompt to write a vaccination date and time to a reminder increased workplace influenza vaccination by about four percentage points. The intervention made an existing intention more concrete.

**Safe takeaway:** Helping people specify when and how they will act can improve follow-through in some settings. This supports making a saved want actionable at a relevant opportunity.

**Limitation:** A vaccination planning prompt is not a group-trip conditional-commitment system. It does not establish that Loop increases attendance, or that “I'll go if three others go” has the same effect. Do not convert the result into a Loop conversion claim.

**Page copy:** “Give ‘I'd love to’ a next step.” Illustrate a saved interest becoming a proposed plan with a time and the member's chosen participation conditions.

Source: Milkman et al., *Using implementation intentions prompts to enhance influenza vaccination rates*, PNAS, 2011. https://doi.org/10.1073/pnas.1103170108

## 4. Coordination requires shared context

**Finding:** Clark and Brennan's foundational account describes common ground as shared knowledge, beliefs and assumptions that people continually establish and update to coordinate. Communication media impose different costs on that process.

**Safe takeaway:** A person's preferences are only part of a useful answer. The latest shared itinerary, location, timing and group commitments also matter. Providing authorized group context alongside personal context could reduce the effort of reconstructing the situation.

**Limitation:** This is a theoretical framework informed by communication research, not a measured claim that a context store reduces messages or organizing time. Stored documents are also not automatically mutual understanding.

**Page copy:** “Your assistant, in the loop.” Example: “What fits my free afternoon?” combines current trip timing with the member's own saved interests.

Source: Clark & Brennan, *Grounding in Communication*, 1991, author-hosted copy. https://web.stanford.edu/~clark/1990s/Clark%2C%20H.H.%20_%20Brennan%2C%20S.E.%20_Grounding%20in%20communication_%201991.pdf

## What to put on the welcome page

Lead with concrete reuse, then show control. Keep the research behind an expandable “Why this matters” section rather than presenting the whole experience as an academic argument.

1. **Carry your context forward.** Save the preferences and intentions you choose so future conversations can use them.
2. **Make your groups useful to you.** Bring authorized schedules, resources and opportunities into the assistant you use.
3. **Turn a possibility into a plan.** Match a saved interest to a relevant moment, and state what would make you join.
4. **Choose what travels.** Review the context, authorize scoped access, and revoke future access when it is no longer needed.

An illustrative sequence is stronger than four feature cards: save “I want more time exploring local neighborhoods”; later ask about a free afternoon; combine that intention with the current itinerary; choose a plan; confirm whether the preference still fits afterward. Clearly label simulated recommendations and conversations as examples.

The ease/utility hypothesis to validate in a pilot is less repeated briefing and less manual assembly of relevant context. Measure repeated facts users supply, time to an acceptable plan, corrections to stale preferences, and accepted versus declined suggestions. Do not invent those outcomes in marketing.
