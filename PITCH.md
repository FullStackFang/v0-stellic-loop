# Loop — Pitch & Overview

*Your people, on repeat.*

A campus belonging app that turns a student's plain-language intent into a
*recurring group with an owner* — not a one-off match — and surfaces that
participation as a wellbeing signal for advising (Stellic tie-in).

> This doc reflects the current `index.html` demo (renamed **Loop**, with the
> Stellic advising/wellbeing surfaces and "The Floor" momentum feed). It
> supersedes the older `SPEC.md`, which still refers to the app as "Pulse."

---

## 30-second elevator pitch

> Every campus app helps you *meet* someone once. Then the group chat spirals,
> plans fizzle, and you never see them again.
>
> **Loop is different. It operates on plain-language intent** — *"I need to lock in
> for CS 2110"* — and instead of a match, you get **folded into a recurring
> loop**: a real study crew with a time, a place, that meets on its
> own rhythm with people that have the *same intent* every week.
>
> It starts with the people closest to you — your floor, your building — intentionally
> keeps these groups small, and drafts the next session for you and removes fatigue and 
> friction. And because being in a loop is the single best predictor a student stays
> enrolled, **Loop quietly shares belonging signal with advising** — so a
> counselor can reach the freshman who hasn't landed anywhere yet, before they
> fall through the cracks.
>
> Loop turns "freshman fatigue and a source of anxiety" into "these are my people" and 
> a place of belonging.

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

The output is **always a loop, never a match.**

| | Every other campus feed | **Loop** |
|---|---|---|
| Output | a match (name + email, go DIY) | a **loop** — recurring session with time, place, owner |
| Job | discovery (meet someone new) | repetition (see the same people again) |
| After the intro | up to you (this is where it fizzles) | the app drafts the next session; owner taps send |
| Declining | a visible going/maybe/no grid | never shown — "can't this week" silently reshapes the draft |

**Judge sentence:** *"Every other campus app helps you meet someone once. Loop
makes sure you see them again."*

## Why it works (the evidence)

Loop isn't a hunch — every mechanic maps to an established finding in higher-ed
retention research. The originality is not the research; it's that Loop makes
these forces **operational and measurable** in real time.

| Research finding | What it says | How Loop operationalizes it |
|---|---|---|
| **Belonging drives retention** — Tinto (1993); Strayhorn (2012) [¹] | Social + academic integration is the strongest predictor of persistence; belonging is a precondition for academic success, not a nice-to-have | Loop's *only* output is a recurring group you belong to — it manufactures integration instead of hoping for it |
| **The first 2–6 weeks are the danger zone** — Woosley (2003) [²] | Initial social adjustment in the opening weeks statistically predicts long-term degree completion | Loop front-loads belonging in onboarding (drop an intent → land in a loop *now*) and treats the **first ~50 days** as the window that matters |
| **Recurring peer study groups rescue hard courses** — Treisman / Emerging Scholars (1985) [³] | Students who failed calculus studied *alone*; those who succeeded formed informal, recurring peer groups. Engineering those groups made failure rates collapse | Loop *is* the engineered recurring peer group — same faces, weekly cadence, built around a hard course (CS 2110), owner drafts the next session so it never dissolves |

**The synthesis:** research proves belonging matters, that it's fragile early,
and that recurring academic peer groups are the fix. Loop is the delivery
mechanism for all three — and, critically, the **sensor** that reports whether
it's working, per student, in time to act.

## How it works (the demo flow)

1. **Onboard** — verify a Cornell email, a few taps (name, class year, dorm,
   major). A short narrative frames the idea: stop networking, start *doing* —
   friendships grow around a shared task (an **Activity Anchor**), in small
   **Micro-Tribes** capped at 4–6 so nobody's left out.
2. **Drop an intent** in plain language — *"lock in for CS 2110 before HW2."*
3. **Get folded into a loop** — Loop returns a short set of cards: an existing
   crew to **join**, a session to **spin up**, or one that's **forming**. No feed
   of strangers, no browsable profiles, no match list.
4. **Spin-up is natural** — free text → an editable, confident draft
   (*CS 2110 · HW2 grind · Thu 7pm · Mann Library · repeats weekly*) → one tap to
   send. Classmates fold in.
5. **The payoff** — two weeks later, *"HW3 session Thursday? Same crew"* brings
   back the **same avatars.** Repetition, not re-discovery.
6. **The fold-in** — a latecomer (*"Maya just joined your Sunday HW Crew"*) is
   seated into a running loop, no cold start.

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
already meeting. Any screen that violates these is treated as a bug, not a
missing feature.

## Status

A single self-contained `index.html` (React + Tailwind via CDN, in-memory state)
— a throwaway demo built to prove the use case on camera. The real app gets
rebuilt *from* it later (likely Next.js + shadcn/ui to match the other projects).
Aggregate signals are shown; the Claude-powered intent parse is a documented
later upgrade, kept out of the live demo so it never fails on stage.

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
