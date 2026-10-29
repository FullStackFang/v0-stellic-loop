# Loop — Business Model Canvas Stress Test

*2026-09-21 · evaluated as a VC would, not as a fan. Companion to `PITCH.md`.*

Numbers come from three research passes (competitors, higher-ed buyer economics,
privacy/liability/cost). Primary-source figures are marked ✓; vendor- or
aggregator-sourced figures are marked ~ and should be spot-checked before they
go in a deck.

## The brief I evaluated (filled in for you)

- **Concept:** Loop is a campus app where a student states a plain-language
  intent ("lock in for CS 2110"); intents pool anonymously into an anchor, and
  at quorum the anchor *fires* into a small, ownerless group that meets weekly
  at a set time and place. The output is always a recurring loop, never a match.
- **Core problem:** Logistical fatigue. Campus apps help you meet someone once;
  the second meeting never happens, and the first 2–6 weeks decide whether a
  first-year lands anywhere.
- **Target audience:** Users = first-year residential undergrads, entering
  through a hard gateway course or their dorm floor. Buyer = the university
  (student success / advising / res life). RAs and TAs are the seeders.
- **Monetization:** Students free. University pays an annual per-FTE license
  for the staff lenses (advisor / RA / TA) and the first-50-days participation
  signal; Stellic as channel.

---

## 1. Customer Segments

**Current status.** A sharp user persona (first-year, residential, gateway
course) and three staff personas with built lenses. It is a two-sided model:
students create the value, the institution pays for it.

**Blind spots.**
- **The design campus is not the customer.** First-year retention by
  selectivity ✓ (NCES 326.30): <25% admit = 96.4%; 75–90% admit = 79.9%; open
  admission = 62.3%. Cornell has no retention headroom to sell against. It is a
  logo and a lab. The paying segment is regional publics and mid-tier privates —
  whose students are more commuter, more part-time, more employed, and for whom
  "Donlon 2F" density does not exist.
- "The university" is not a buyer. Student success, res life, and a gateway
  course dean each have different budgets and different definitions of success.
  Nobody has been named as the signer.
- Community colleges have the most pain and the least money (~$2.7K net
  tuition/FTE ✓ SHEF) and the worst fit for a weekly in-person ritual.

**Stress test question.** Name the title and budget line of the person at an
80%-retention regional public who signs a $30K PO for this — and does the
product still work when half of their first-years live off campus?

## 2. Value Propositions

**Current status.** The student prop is genuinely differentiated: repetition,
not discovery; ownerless so it never dies with a host; no feed, no profiles, no
visible rejection. The buyer prop is a *leading* indicator (week 3) instead of a
lagging one (week-8 midterm).

**Blind spots.**
- **Showing up is the product, and it's untested.** Free events run ~40–50%
  show-up vs 70–85% paid ~ (Meetup's own blog — industry lore, no primary
  source found; treat as a hypothesis to measure). A loop that fires at quorum 3
  into 4–6 seats should expect **2–3 bodies at meeting one**. Pie reports >70%
  retention *after a user's third group event* ~ — the cliff is before three,
  and Loop has no commitment device (hype meter is an easter egg, not a stake).
  Fiveable made study rooms its core bet and then shut them.
- **The evidence supports the structure, not the app.** Effect sizes exist for
  *structured, academically anchored* recurring groups (Supplemental Instruction
  d≈0.29–0.60; PLTL ~0.5 SD — both quasi-experimental). Treisman had no control
  group. The 27K-student belonging RCT (*Science* 2023) found persistence gains
  only where real opportunities to belong already existed. PITCH.md's "single
  best predictor a student stays enrolled" overclaims; a sharp provost will say so.
- **"Joined a loop" is a vanity signal.** It measures a tap. "Reached three
  occurrences" is both the honest predictor and the harder-to-copy metric.
- Stellic Care already ships caseloads, early alerts and referral routing. The
  buyer prop is one *field* in someone else's console.

**Stress test question.** Of loops that fire, what percentage hold a third
meeting with at least three of the same people — and what is that number
without an RA or TA in the room?

## 3. Channels

**Current status.** Implicit: Stellic relationship (Pathfinders Challenge;
finalists present at Stellic Summit Sept 23), RA/TA seeding, .edu verification.

**Blind spots.**
- RA/TA seeding is the right cold-start — it is Tinder's Greek-house move
  (seed an existing graph with a built-in convener), not Fizz's paid-ambassador
  grind (~$3–10K/campus ~, and currently being litigated). But RAs work for the
  institution: **you cannot use the channel until you've closed the buyer.**
  Bottoms-up and top-down are sequenced, not parallel, and the sequence starts
  with a 6–18 month sale.
- The acquisition window is ~10 days in late August. Miss orientation and the
  first-50-days thesis is dead until next fall. One shot per campus per year.
- Stellic's E&I cooperative contract ✓ is a procurement shortcut you cannot buy
  — and a dependency on a company that can ship your indicator in a sprint.
- Cornell already pays for CampusGroups (Ready Education, 700+ institutions ~).
  "We have an engagement app" is the first objection everywhere.

**Stress test question.** Can you get 30% of one course section or one dorm
floor active within 14 days of move-in, with no paid ambassadors and no
institutional email blast?

## 4. Customer Relationships

**Current status.** Students: automated, low-touch, deliberately quiet (silent
ranking, no public decline, facts-only cards). Staff: role shown only as a
byline, never announced. Institution: undefined.

**Blind spots.**
- **The covert advising signal is the fastest way to kill the company, and it
  is an unforced error.** The *sharing* is lawful under FERPA's school-official
  exception once there is a contract. The *concealment* is the problem:
  - The advisor's list is an education record; students have inspection rights.
    "Invisible to students" is not achievable for identified records.
  - Undisclosed sharing of a sensitive inference is the FTC's fact pattern
    (BetterHelp $7.8M, Cerebral $7M); Washington's My Health My Data Act covers
    ML-derived mental-health inferences and has a private right of action.
  - Every campus-monitoring blow-up follows one script — covert + individual +
    routed to an authority + a student quoted saying "we were never told."
    Mount St. Mary's president was gone in 41 days; GW killed its WiFi pilot the
    same day the student paper ran it. At public universities your contract is
    a public record and student journalists file for it.
  - Commercially: the model depends on students typing honest intents. The
    disclosure event doesn't just create liability, it destroys the data asset.
    No general counsel signs a DPA whose design requires students not to know.
- This reverses a standing founder decision. The fix is cheap: one onboarding
  sentence (*"Your advisor can see whether you've joined a recurring group. Not
  what you wrote, not who you met."*), opt-in, a binary fact never a score, no
  "wellbeing/at-risk" language anywhere, aggregates suppressed below n=10 (an RA
  who knows all 30 residents can re-identify "3 unattached"). The student pitch
  can stay about grades; the sentence just has to exist.
- No customer-success motion is defined for the institution, and renewals in
  this category are won by a named human, not a dashboard.

**Stress test question.** If the campus newspaper printed your advisor
dashboard and your data-sharing agreement tomorrow, would sign-ups go up or down?

## 5. Revenue Streams

**Current status.** Undefined in the docs. My fill-in: annual per-FTE SaaS.

**Blind spots.**
- **You will be priced as a point solution.** Comparable "belonging platform"
  Nearpeer: ~$10–80K/yr ~, and it has raised ~$2.5M total with ~13 staff even
  after a vendor-reported 12,000-student RCT (press release only; not found in
  public literature — do not cite). Raftr has lived on $4.9M since 2019. Full advising
  suites clear more — EAB Navigate at SUNY campuses runs **$53–165K/yr, $23–38
  per student ✓** (NY Comptroller) — but that is the suite's budget line, and
  buyers are actively consolidating point tools into suites.
- Realistic: **$8–15/FTE, $25K floor; $25–60K land, $60–120K expand.**
- Buyer climate is hostile: public net tuition/FTE fell 3.5% in 2025 ✓, private
  discount rates hit 57% ✓, the enrollment cliff has started.
- Attribution is weak. Students who join study groups were always more likely
  to persist; every buyer knows this. Without a randomized or staggered rollout
  you cannot make the ROI claim the price depends on.
- Best funding hack: Title III/V grants (avg ~$430–550K/yr, fund student
  services explicitly) at exactly the regional-public ICP. Avoid ads and
  parent-pay — every consumer-monetized campus app has been absorbed or died.
- The cleaner wedge is **gateway-course DFW rates**, not belonging: a provost's
  course-success initiative has a budget, a metric (pass rate in CHEM 2070), and
  one-semester attribution. SI programs already spend ~$1,100/section ~.

**Stress test question.** Would a provost pay $30K for the *course pass-rate*
result alone, with the belonging signal deleted from the deck?

## 6. Key Resources

**Current status.** A strong interaction model (intent → anchor → fire → loop,
presence-as-authority, the call countdown), a polished demo, a research
narrative, Cornell texture, and an in with Stellic.

**Blind spots.**
- None of it is proprietary. The mechanic is copyable in a quarter; the only
  defensible assets are **per-campus density** and an **outcomes dataset** tying
  third-occurrence attendance to persistence. You have neither yet.
- The product is a single `index.html` on localStorage. Zero of the enterprise
  resources exist: SSO, SIS roster feed, SOC 2, HECVAT, a WCAG 2.1 AA
  conformance report.
- Several signature mechanics hit accessibility criteria procurement now gates
  on: the timed quorum countdown, colour-only status, geo-only check-in.
- Team: no evident higher-ed enterprise seller. In this market that is the
  scarcest resource.

**Stress test question.** After two years, what do you own that Stellic, EAB or
Ready Education cannot rebuild in one quarter?

## 7. Key Activities

**Current status.** Product and interaction design, done unusually well.

**Blind spots.**
- The activities that decide the outcome haven't started: a live pilot with
  real attendance data, campus launch operations, enterprise sales, compliance,
  trust & safety.
- Arranging in-person meetups among 17–19-year-olds makes T&S a core activity,
  not a support function. The free-text intent box *will* receive crisis
  disclosures; the parser's output is your own content (no §230 shield). The
  "report a concern" route can create Title IX notice for the institution and
  needs per-campus routing decided by function, not title.
- The curated allowlist is right for safety but puts a human in the loop of
  every new activity — a throughput limit on the long tail that makes the app
  feel alive.

**Stress test question.** What is your written protocol when a student types a
crisis statement into the intent box at 2 a.m. — and who is awake?

## 8. Key Partnerships

**Current status.** Stellic (implicit), Cornell as design partner.

**Blind spots.**
- **Stellic is channel, competitor and acquirer at once.** $14.1M raised ~,
  Care module already live, no peer-connection feature — that gap is your seam
  and their next roadmap item. At their stage they buy teams, not $10M outcomes.
  Winning a hackathon is not a partnership; nothing is signed.
- Missing partners who matter more than they look: **res life** (owns the RAs =
  owns your channel), **SI / learning centers** (own the evidence and a budget
  line you complement rather than displace), **registrar/IT** (roster feed),
  calendar providers, and a research partner for the outcome study.
- Student press and student government are either your early validators or your
  eventual exposé. There is no neutral.

**Stress test question.** What does Stellic sign this quarter — a dated
integration and referral agreement — that makes it cheaper for them to resell
you than to build you?

## 9. Cost Structure

**Current status.** Near zero. A demo and founder time.

**Blind spots.**
- **The cost base is people and compliance, not tech.** LLM parsing is a
  rounding error (~$0.07–0.17 per student per year at Haiku-class pricing); tech
  COGS is ~$1.50–3/MAU/yr. SMS would cost ~10× the LLM line — stay push-first.
- A fixed compliance floor of roughly **$40–90K/yr** (SOC 2 Type II, pen test,
  HECVAT, insurance, accessibility audit) lands *before the first dollar*.
- Estimated cost to serve, excluding founders, R&D and sales ~: **$95–230K at
  one campus, $65–125K per campus at five, $41–78K per campus at twenty-five.**
  Integration alone is ~$290–425K going from 1 to 25 campuses (use nightly flat
  files, not Banner/Workday partner programs, for the first ten).
- Against $25–60K land ACV, **contribution margin is negative until roughly
  campus 15–25** unless ACV clears ~$50K, deals are system-level (SUNY/CSU), or
  the institution's own RAs replace your ambassadors and CS headcount.

**Stress test question.** At $30K ACV and a 12-month cycle, how many campuses
to break even, and how much capital burns before you get there?

---

## Canvas Cohesion Score: **4 / 10**

The right side of the canvas is two different products. The student side is a
9 — a real insight, carefully designed. The paying side is a point-solution
price ($25–60K) with a 6–18 month cycle, sold into a consolidating, shrinking
budget. The left side carries enterprise-grade costs: a compliance floor before
revenue, per-campus launch labour, T&S for in-person meetups, integration per
SIS. And the two sides are wired backwards: the thing the buyer pays for (the
signal) only exists if free users build density, but the best density channel
(RAs/TAs) only opens after the buyer signs — at a class of institution that is
not the one the product was designed on.

This gets to **~6.5** with four moves, none of which require new product:
1. **Re-aim the ICP** — regional publics / mid-tier privates; Cornell as lab.
2. **Lead with gateway-course pass rates**; belonging is the expand story.
3. **Disclose the signal** in one sentence, opt-in, binary, n≥10 aggregates.
4. **Sell "third occurrence," not "joined,"** and let the institution's own
   RAs/TAs/SI leaders be the launch labour so cost-to-serve falls under ACV.

## The single biggest risk

**Loops don't survive to the third meeting.** Everything on the canvas is
downstream of one unproven behaviour: that strangers placed in a free,
ownerless, no-stakes group will physically show up three weeks running. Base
rates say a 5-seat loop meets as 2–3 people the first time and quietly dies.
If that happens there is no belonging, no signal, nothing to sell, and no
dataset to defend — and no amount of dashboard polish fixes it.

It is also the cheapest risk to retire: **one section of one gateway course, one
semester, one TA, ~100 students, instrumented for show-up and third-occurrence
rate.** Run that before writing a line of the Next.js rebuild. If third-occurrence
clears ~40% you have a company and the first page of every sales deck. If it
doesn't, the thing to redesign is the commitment mechanic, not the business model.

*(The covert advising signal is the biggest **unforced** risk — it is fatal and
costs one sentence to remove. Fix it this week regardless.)*
