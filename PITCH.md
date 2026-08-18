# Loop — Pitch & Overview

*Your people, on repeat.*

A campus belonging app that turns a student's plain-language intent into a
*recurring, intent-anchored loop* — not a one-off match, and with **no owner** —
and surfaces that participation as a wellbeing signal for advising (Stellic
tie-in). The activity is what repeats; your people accrete over time.

> This doc reflects the current `index.html` demo (renamed **Loop**, with the
> Stellic advising/wellbeing surfaces and "The Floor" momentum feed). It
> supersedes the older `SPEC.md`, which still refers to the app as "Pulse."

---

## 30-second elevator pitch

> Every campus app helps you *meet* someone once. Then the group chat spirals,
> plans fizzle, and you never see them again.
>
> **Loop is different. It runs on plain-language intent** — *"I want to box 2–3×
> a week," "I need to lock in for CS 2110"* — and instead of a match, you get
> **folded into a recurring loop**: a standing activity with a time and a place
> that keeps coming back on its own rhythm. **No owner to flake, no roster to
> maintain** — the *intent* is what holds it together, so it never dies when one
> person gets busy.
>
> It starts with the people closest to you — your floor, your building — keeps
> every group small, and handles the reminders and the next session so you don't
> have to. The same faces aren't forced; they **accrete** — box with someone a
> few times, like it, and Loop quietly keeps looping you together. And because
> being in a loop is the single best predictor a student stays enrolled, **Loop
> shares that one belonging signal with advising** — so a counselor can reach the
> freshman who hasn't landed anywhere yet, before they fall through the cracks.
>
> Loop turns freshman fatigue into "these are my people" — a place to belong.

*Trim to the first two paragraphs for a true 30-second cut.*

### Buyer-facing cut (for advising / retention audiences)

> Every university knows a student's sense of belonging decides whether they stay
> enrolled — decades of research make social integration the single strongest
> predictor of retention. But timing is everything: the danger zone is the first
> **two to six weeks**, and the students who slip away are the ones no one flagged
> until the week-eight midterm.
>
> Loop turns belonging from a fuzzy concept into a **leading indicator.** It asks
> one binary question — *is this student in a recurring peer loop during their
> first 50 days?* — and hands that signal to advising. A counselor can reach the
> freshman who hasn't landed anywhere in **week three**, long before they become a
> retention statistic. We capture the silent middle before they fall.

---

## The problem

Making friends in college is exhausting. Group chats spiral, plans fizzle, and
"matching" apps hand you a name and an email, then leave the hard part — actually
meeting, and meeting *again* — up to you. That's where connection dies. The demo
names this **Logistical Fatigue**.

## The core bet (the one thing that can't be lost)

The output is **always a loop, never a match** — and the loop is anchored to an
**activity, not a person.**

| | Every other campus feed | **Loop** |
|---|---|---|
| Output | a match (name + email, go DIY) | a **loop** — a standing activity with time + place |
| Anchor | a person you should message | an **intent/activity** that recurs on its own |
| Job | discovery (meet someone new) | repetition (the activity comes back; your people accrete) |
| Who runs it | you, until you stop (this is where it fizzles) | **no one owns it** — the intent sustains the cadence; Loop handles reminders |
| Declining | a visible going/maybe/no grid | never shown — "can't this week" just means you catch the next one |

**Judge sentence:** *"Every other campus app helps you meet someone once. Loop
gives you a standing reason to keep showing up — until 'someone' becomes 'your
people.'"*

### Activity Anchor, not an owner

The one distinction that can't be lost: **you commit to the activity, not to a
group.** Committing to "the same five people every Thursday" is fragile — one
flake and it collapses. Committing to "boxing exists, 2–3× a week, drop in when
you can" is durable. So Loop anchors on the **intent**, keeps membership fluid,
and lets belonging *emerge*:

- **No owner.** No coordinator whose absence kills the loop. The intent is the
  organizer.
- **People accrete, they aren't locked.** It may be the same faces this week, or
  not. Train with someone you click with, and a lightweight, **private** affinity
  signal loops you together more often — never a public score, never a roster you
  can reject.
- **Frictionless by design.** Showing up should cost nothing: a one-tap check-in
  (or a tap-to-confirm geo-prompt — *"you're at Noyes, log this session?"* — never
  passive tracking) is the whole commitment.
- **Facilitators, not owners.** Campus roles — an RA or a social coordinator — can
  *seed* an anchor and be a warm first contact, then fade. The loop outlives them.

### How an ownerless loop actually runs

"No owner" only works if the mechanics are boring and obvious. Three rules —
each borrowed from something that already works without a boss (pickup
basketball, Parkrun, a Doodle poll):

1. **The anchor is soft; the occurrence locks.** The *anchor* is the recurring
   template ("CS 2110 study · Thursdays ~7pm · somewhere on campus") and stays
   editable forever. An *occurrence* is *this* Thursday. Only occurrences ever
   lock, so the ritual is stable while the details stay concrete.
2. **Blanks snap, they're never forced.** Nobody is made to fill in "where."
   The first concrete answer becomes the prefilled default; everyone after sees
   it and one-taps to accept or counter-proposes. If a blank survives to lock
   time, Loop fills it with the nearest / most-used spot for that activity —
   *no answer = default room.* An intent becomes a live loop at **quorum**
   (~3 people converged on a slot + place); until then it's a proposal, "waiting
   for a crew."
3. **Presence is authority.** Inside the lock window (~24h out) the occurrence
   freezes so nothing drifts silently. If it has to move — room's taken, group
   relocates — *the people who are already there decide*: before lock, anyone
   with intent can edit (wiki-style, with a change feed); after lock, only
   **checked-in** people can move it, and every move is pushed to everyone
   confirmed. Optionally, first check-in "holds the pin" — a captain-for-the-day,
   self-assigned, gone by next week. No chair, no vote: electing a leader just
   rebuilds the single point of failure we're removing.

Guardrails on top: change history and undo, rate-limited moves, and a move is
never silent — broadcast is the whole point of locking.

*In one line: intents propose → quorum forms → lock freezes tonight → whoever's
present steers.*

## Why it works (the evidence)

Loop isn't a hunch — every mechanic maps to an established finding in higher-ed
retention research. The originality is not the research; it's that Loop makes
these forces **operational and measurable** in real time.

| Research finding | What it says | How Loop operationalizes it |
|---|---|---|
| **Belonging drives retention** — Tinto (1993); Strayhorn (2012) [¹] | Social + academic integration is the strongest predictor of persistence; belonging is a precondition for academic success, not a nice-to-have | Loop's *only* output is a recurring group you belong to — it manufactures integration instead of hoping for it |
| **The first 2–6 weeks are the danger zone** — Woosley (2003) [²] | Initial social adjustment in the opening weeks statistically predicts long-term degree completion | Loop front-loads belonging in onboarding (drop an intent → land in a loop *now*) and treats the **first ~50 days** as the window that matters |
| **Recurring peer study groups rescue hard courses** — Treisman / Emerging Scholars (1985) [³] | Students who failed calculus studied *alone*; those who succeeded formed **informal, ownerless** recurring peer groups. Engineering those groups made failure rates collapse | Loop *is* the engineered recurring peer group — anchored to the activity (not a coordinator), weekly cadence, built around a hard course (CS 2110). Ownerless is a feature: Treisman's groups had no boss either |
| **Small-group work is worth about a letter grade** — UT Emerging Scholars (1988–97) [⁴]; Freeman et al., PNAS (2014) [⁵] | ESP students in freshman calculus earned grades **one-half to one full letter grade higher** than non-ESP peers; across 225 STEM studies, active/collaborative learning raised average grades by **half a letter** and cut failure rates (lecture failure rates were 55% higher) | This is the claim behind the onboarding line *"students who meet in a small group every week land about a letter grade higher."* Loop's study loops are the weekly small-group habit these studies measured |

**The synthesis:** research proves belonging matters, that it's fragile early,
and that recurring academic peer groups are the fix. Loop is the delivery
mechanism for all three — and, critically, the **sensor** that reports whether
it's working, per student, in time to act.

## How it works (the demo flow)

1. **Onboard** — verify a Cornell email, a few taps (name, class year, dorm,
   major). A short narrative frames the idea: stop networking, start *doing* —
   friendships grow around a shared task (an **Activity Anchor**), in small
   **Micro-Tribes** capped at 4–6 so nobody's left out.
2. **Drop an intent** in plain language — *"box 2–3× a week," "lock in for CS 2110
   before HW2."*
3. **Get folded into a loop** — Loop returns a short set of cards: an existing
   anchor to **join**, one to **spin up**, or one that's **forming**. No feed of
   strangers, no browsable profiles, no match list.
4. **The loop just runs** — the intent sets the cadence (*Thu 7pm · Mann Library ·
   weekly*) and Loop handles the reminders. No one has to host it; there's no
   "send" button waiting on an owner. Details snap to whatever the first person
   answered; this week's session locks ~24h out; if it moves, whoever's
   checked in taps the new spot and everyone confirmed gets the push.
5. **Show up, frictionless** — a one-tap check-in (or a tap-to-confirm geo prompt)
   logs the session. That's the entire commitment.
6. **The payoff — accretion** — over a few weeks the people you keep clicking with
   surface *("you've boxed with Marcus 6 times")* and Loop quietly loops you
   together more often. Your people build up from the activity — repetition, not
   re-discovery, and never a forced roster.
7. **The fold-in** — a latecomer folds into a running loop with no cold start, and
   an RA or social coordinator can seed a fresh anchor for a floor that has none.

## The Stellic / advising tie-in (what makes it more than social)

Loop positions itself as *"the connective tissue that makes hard courses
survivable"* — it touches degree progress **and** belonging. The strategic wedge:
it converts belonging into a **leading indicator** advising can act on, instead of
the lagging one (a failed midterm, a dropped course) they get today.

- **The leading indicator:** one binary signal — *is this student in a recurring
  peer loop during their first ~50 days?* — passed to an advising dashboard (e.g.
  Stellic's Care module). It flips the intervention from **week eight** (midterm
  failure, a lagging signal) to **week three** (still unattached, a leading one).
- **Belonging signal, not surveillance:** Loop shares *one number* — a sign to
  reach out — never anyone's conversations or their loop's contents. Students in
  at least one loop stay enrolled and see an advisor earlier.
- **Advisor surface:** a counselor (Dana, Advising & Wellbeing) sees a
  confidential caseload view — *how many advisees are in a loop yet* and a short
  "reach out" list of students who haven't landed anywhere — a human nudge, not
  an algorithm.
- **Safety route:** any student can privately report a concern; it goes straight
  to the assigned counselor, confidential, never shown to the loop.
- **The Floor:** an aggregate momentum feed and house/loop leaderboards — *counts
  and streaks only, never names* — so campus energy is visible without turning
  anyone into a browsable profile.

## The guardrails (these *are* the product)

No scrollable intent feed. No browsable stranger profiles. No going/declined
grid. No match list. No stranger DMs — contact happens *inside* a loop that's
already meeting. **No owner and no public rating** — affinity is private and
additive (it can only loop you *together* more, never rank or reject anyone), and
check-in is tap-to-confirm, never passive tracking. Any screen that violates
these is treated as a bug, not a missing feature.

## Status

A single self-contained `index.html` (React + Tailwind via CDN, in-memory state)
— a throwaway demo built to prove the use case on camera. The real app gets
rebuilt *from* it later (likely Next.js + shadcn/ui to match the other projects).
Aggregate signals are shown; the Claude-powered intent parse is a documented
later upgrade, kept out of the live demo so it never fails on stage.

**Known model-vs-demo gap:** the current `index.html` still renders a loop
coordinator/host (e.g. Josh as "runs a loop," a `coordinatorId`, an "owner taps
send" step). Under the ownerless model above, that role should be recast — Josh
becomes an **RA / social coordinator** who *seeds* anchors and greets newcomers
but doesn't own any loop — and the "send" step should read as the intent's own
cadence, not an owner's action.

---

## References

Evidence backing the retention claims above. Cite as an appendix if a judge or
enterprise buyer asks Loop to defend the data.

1. **Belonging → retention (the foundation).**
   - Tinto, V. (1993). *Leaving College: Rethinking the Causes and Cures of
     Student Attrition* (2nd ed.). University of Chicago Press. — The gold-standard
     model: student departure is driven primarily by failure to integrate into the
     academic and social communities of the institution.
   - Strayhorn, T. L. (2012). *College Students' Sense of Belonging: A Key to
     Educational Success.* Routledge. — Establishes belonging as a fundamental
     need that directly governs academic adjustment and persistence.
2. **The first 2–6 weeks are decisive.**
   - Woosley, S. A. (2003). "How Important Are the First Few Weeks of College? The
     Long-Term Effects of Initial College Experiences." *College Student Journal.*
     — Initial social adjustment in the opening 2–6 weeks is a direct statistical
     indicator of long-term degree completion.
3. **Recurring academic peer groups (the "Loop" model).**
   - Treisman, U. (1985 / 1992). *Emerging Scholars Program*, UC Berkeley. —
     Failing calculus students studied alone; succeeding students formed informal,
     recurring peer study groups. Engineering those communities — merging students'
     social and academic lives around hard collaborative work — collapsed failure
     rates.
4. **The grade effect of recurring peer study (backs "a letter grade higher").**
   - *Opportunity Without Preference.* (1998). Hoover Institution, Stanford
     University. — Detailing Dr. Uri Treisman's foundational peer-study model as
     scaled at UT Austin: *"From 1988 through 1997, nearly 800 University of Texas
     students participated in UT's Emerging Scholars Program (ESP) for freshman
     calculus... These grades were, on average, one-half to one whole letter grade
     higher than those students not in ESP."*
5. **The same effect at meta-analytic scale (STEM-wide).**
   - Freeman, S., Eddy, S. L., McDonough, M., Smith, M. K., Okoroafor, N., Jordt,
     H., & Wenderoth, M. P. (2014). "Active learning increases student performance
     in science, engineering, and mathematics." *Proceedings of the National
     Academy of Sciences*, 111(23), 8410–8415. — *"The studies analyzed here
     document that active learning leads to increases in examination performance
     that would raise average grades by a half a letter, and that failure rates
     under traditional lecturing increase by 55% over the rates observed under
     active learning."*

> **How to phrase it on stage:** the honest range is *half a letter to a full
> letter grade* (ESP: ½–1; Freeman: ½). "About a letter grade higher" is the
> upper end of a real, replicated effect — if pressed, say "half to a full letter
> grade" and point to references 4 and 5.
