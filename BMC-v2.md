# Loop — Business Model

*2026-09-22 · the current model, stated on its own. Research inputs:
competitor landscape, higher-ed buyer economics, privacy/liability/cost,
learning-center software market, commitment mechanics, go-to-market
structures, Stellic's history, Cornell's events/resources stack, and six
sized angles (`ANGLES.md`). ✓ = primary source, ~ = vendor/aggregator/
estimate. Companion: `PRESENTATION.md` (deck spine).*

## Positioning: not a social app. An instrument.

No campus social app has ever flipped to institution-paid revenue (Yik Yak,
Fizz, Sidechat — institutions engage them as adversaries). Institution-paid
engagement tools were top-down from day one. So Loop is sold as **the
operating layer for peer-learning programs the campus already funds** —
Supplemental Instruction, PLTL, tutoring centers — and the first-50-days
participation indicator is harvested from that workflow; the app is how it's
measured.

## Beachhead buyer: the academic-support / learning-center director

| | Learning-center director |
|---|---|
| ACV | **$6–15K** (WCONLINE $1,999 ✓; TracCloud $5,999–15,999 ✓) |
| Cycle | **1–3 mo** under $10K; 3–6 mo under $25K |
| Bid threshold | Under $10K clears the bid requirement essentially everywhere; under $25K most (Penn State $25K ✓, Ohio State $75K ✓, Pitt $15K ✓) |
| Compliance | Not asked at this tier |
| Seeders | **SI leaders / TAs — paid by this buyer** |
| Their metric | **session attendance** (weekly, theirs) and DFW in gateway courses |
| White space | No vendor forms recurring groups from demand; all schedule admin-created slots ~ |
| Replacement cycle | AccuTrack is being sunset ✓; TracCloud/WCONLINE are the incumbents — Loop carries their scheduling + attendance-of-record workflow and forms groups on top |

A small, fast, discretionary sale with far better capital efficiency and
learning rate than an enterprise sale. The larger number arrives as the
provost-level expand (below).

## The wedge inside the wedge: turnout

SI programs' first pain is low turnout — Georgia Gwinnett: ~10% of enrolled
students attend one or more sessions ✓. The spread is enormous and the driver
is known: **scheduling attachment and faculty voice, not credit.** Lund
(attached to course): 82% attend ≥1, median 5 ✓. Swarthmore (weekly + faculty
endorsement, no credit): 82%/77% ✓. Loop's quorum-fire mechanic *manufactures*
scheduling attachment; an SI leader seeding the section manufactures faculty
voice. That is the sales pitch to a learning-center director: not "software,"
but "the 10% becomes 40%."

Dose–response is the ROI slide: 10+ sessions vs 1–2 = **+29pp A/B rate,
−26pp DFW** ✓ (Anfuso 2022; self-selected, say so).

## Reporting target already exists

ICSI accreditation requires each program to submit enrollment, SI enrollment,
**GPA by attendance band (1–4 / 5–9 / 10+) and DFW counts** ✓. Campuses
assemble this from paper sign-in sheets. Loop's attendance → registrar join
is a pre-specified schema, not a custom integration — and it *is* the
upward-sold retention signal, in a form provosts already recognise.

## Commitment stack (no money, no host)

| Mechanism | Evidence | Loop implementation |
|---|---|---|
| Plan prompt at join | Milkman 2011 PNAS: date+time prompt +4.2pp; MCII meta g≈0.34 ✓ | On join, member types the route/time in their own words |
| Two-touch "seat held" reminder | Milkman 2021 megastudy N=47K: winner = 2 reminders, "reserved for you" frame ✓ | T-24h, T-2h; never more |
| Quorum-gated social proof | Cheng 2022 PNAS: corrected norms +12pp ✓ | Show "3 of 5 in" only at/above quorum |
| Rotating one-line role | Paluck 2016: public stance by seeds −25% ✓ (analogy) | "Brings the pset / books the table" — identifiability without a host |
| Guilt-free re-entry | Milkman 2021 Nature N=61K: best performer rewarded return after a miss ✓ | "Back this week?" — autonomy framing, never "your group is disappointed" |

**Group size.** Literature: groups die below 4–5, optimum 10–12 ✓
(Fredriksson 2020). Anchors run **~8 seats, quorum 4–5**, so a 45% show still
lands 3–4 bodies.

Note on evidence: the widely quoted "40–50% free vs 70–85% paid show-up"
figures are industry lore (Meetup's blog), not primary research — a hypothesis
the pilot measures, not a constraint. The Nearpeer CSUN RCT does not appear in
public literature; don't cite it.

## Go-to-market sequence (24 months)

| Months | Move | Cost to Loop | Yield |
|---|---|---|---|
| 0–6 | **Research pilot** at one Stellic campus (Cornell): IRB exempt/expedited, FERPA studies-exception DUA (34 CFR 99.31(a)(6) ✓) — through registrar, **not procurement**. $0 + LOI to buy at ~$40K if the indicator predicts term-2 persistence | ~$0 compliance; founders' time | The evidence asset; a Cornell logo; third-meeting baseline |
| 6–12 | **First paid deals under the bid line**: learning-center licences at $6–12K, or one dean-signed $35–45K micro-purchase (2 CFR 200.320 self-cert to $50K ✓) | HECVAT-Lite; SOC 2 *readiness* only | 3–5 campuses, revenue, attendance data |
| 6–18 | **IES SBIR** Phase I $250K / 9 mo ✓ (≤90 days to award); Title III-A in the next odd-year cycle via a partner campus's grant writer | Grant writing | Campuses 2–3 funded non-dilutively |
| 12–24 | **Create the Stellic OEM slot** — they have no partner programme ✓, which means first-mover rather than a queue. Arrive with two published campuses + a Care-module integration spec. Stellic's E&I contract carries the paper and the compliance | Integration engineering | Expand ACV; compliance borne by partner |

## Expansion: the campus-wide recurring-group layer (angle F)

The beachhead is deliberately small. What makes it a company is the direction
of expansion: **deeper into the same campus before wider across campuses.**

Four or five offices on every campus are each paid to get students into small
recurring groups — the tutoring center (SI sessions), housing (RA floor
programs), orientation (first-year cohorts), wellbeing (connectedness
programming). Each has its own small budget and tool; none can see the others.
Loop does the same job for all of them, so the account grows by adding
offices, not by finding new tutoring centers:

| Step | Buyer | ACV | What's proven |
|---|---|---|---|
| 1. Land | Academic-support director | $6–15K | Turnout; attendance-of-record; the evidence asset |
| 2. Second office | Director of Residential Life (auxiliary budget) | +$10–20K | Same mechanic, different room; the RA lens becomes product |
| 3. Third office | Director of New Student Programs | +$35–50K | First-50-days cohorts persist past week 3 |
| 4. Consolidate | Provost / VP Student Affairs | **$75–150K** | The cross-office indicator: "is this student in *any* recurring group?" |

Why the provost pays more than the sum: only the combined view answers the
question they care about. One office's view is a feature; the cross-office
view is the system of record for peer participation — which Stellic Care and
EAB Navigate cannot build because they have no groups. $75–150K is EAB's band,
money the campus already spends.

Sizing: ~1,300 institutions with ≥500 beds × ~$100K ≈ **$130M TAM**; publics
and mid-privates under 85% retention (~600) ≈ **$60M SAM**; 3-year SOM at
10–15 full accounts ≈ **$1–1.5M ARR** plus a long tail of step-1 land deals.

Price escape hatch: **outcome pricing.** InsideTrack charges $500/student/
semester ✓ because an NBER RCT proved +5.3pp retention. If the IV-designed
pilot shows a causal DFW/persistence effect, price per retained student.

Sequence: deep first (one campus, steps 1→4, proving the full account
exists), then wide (repeat the account playbook; the tutoring center stays
the front door everywhere). The cooperative contract and the Stellic OEM slot
are step-4 multipliers, not step-1 moves.

## Cost structure

- No SOC 2 Type II, no HECVAT-full, no ambassadors, no SMS until campus ~5.
  Tech COGS ~$2/MAU/yr; LLM ~$0.10/student/yr.
- Launch labour = the buyer's own SI leaders/TAs. Customer success = one
  person to ~10 campuses at this deal size.
- Cost-to-serve at 5 campuses ≈ **$8–15K/campus** ~ — inside a $6–15K ACV, at
  break-even, with grants covering the gap.

---

## The canvas

| Block | State | Why |
|---|---|---|
| Customer Segments | ok | One buyer, findable (ICSI/CRLA lists), has their own metric; next segments named in order |
| Value Propositions | strong / testable | "10% → 40% turnout" is measurable in one term; commitment stack has effect sizes |
| Channels | open | IRB/registrar entry; buyer owns the seeders; under-threshold purchase |
| Customer Relationships | sound | Signal disclosed, opt-in, binary, n≥10 aggregates; sits inside an SI programme students already know |
| Revenue Streams | small land, sized expand | $6–15K land → +offices → $75–150K provost consolidation; grants bridge; outcome pricing if the RCT lands |
| Key Resources | evidence + ICSI-shaped dataset | Mechanic is copyable — the de-identified dataset and cross-office view are the moat |
| Key Activities | sequenced | Pilot → sub-threshold → SBIR → OEM; build the operational floor (roles, timesheets, registrar export, SSO) |
| Key Partnerships | concrete | Learning center, SI coordinator (champion), IRB, IES, Stellic (as target, not assumption) |
| Cost Structure | matched to ACV | Compliance deferred; labour is the customer's |

### Canvas Cohesion Score: **7.5 / 10**

The two sides match: a small, fast, discretionary sale funds a cost base
that is mostly the customer's own staff, and the thing being sold (turnout,
then the ICSI-shaped indicator) is the thing the product naturally produces.
The dependency runs the right way — evidence first, then money, then channel.
The expansion path gives the beachhead a destination sized like a company,
and it uses the multi-office design (RA / TA / advisor lenses) as the product.

**What keeps it from 8+:**
1. **The expand is a plan, not a proof.** Nobody has yet sold two offices on
   one campus, and the provost consolidation depends on the indicator meaning
   something — which depends on the pilot.
2. **Still hostage to the third meeting.** Designed odds, same bet.
3. **Peer vs expert.** Students rate peer-led help below expert help ~ (UT
   Austin); paid SI-leader seeding answers it partly, not fully.

## What Stellic's B2B2C path actually was (and what transfers)

Stellic did not go "students love it → institution pays." Timeline ✓:
CMU seniors build a degree planner (~2014–15) → CMU's registrar was *already*
shopping to replace a dying DOS degree audit (2015) → a dean (Mark Stehlik)
walks them to the registrar (2016) → contract and go-live (2017) → Alchemist,
an *enterprise* accelerator (May 2017) → $11M Series A at 40 institutions,
zero churn (2022) → E&I single-award cooperative contract (May 2025) →
90–100+ institutions, 1M+ students, Progress/Care/Explore (2026).

**The playbook:** (1) walk into an open replacement cycle with a budget line,
not an unmet need; (2) a faculty champion carries you to the buyer — students
never cold-call; (3) layer on the SIS, push config to the customer (Duke did
~85% of implementation in the registrar's office); (4) adoption % (80/88/90%)
is the entire sales proof stack — quoted *to* administrators, never sold *to*
students; (5) reference-customer choreography by peer cohort; (6) remove
procurement friction with a cooperative vehicle once at scale.

**Does not transfer:** degree audit is a compliance system of record with a
named owner and an RFP cycle; nobody's study-group system is dying. Reach
Capital's stated thesis is that student-only tools fail. Stellic never had a
free tier, ambassadors, or a viral loop. Its 0% churn comes from switching
costs Loop cannot create. Bin Wasi: in 500+ demos, students were present
"only a handful of times."

**Transfers:**
- **Be the answer to a purchase that's already happening.** The learning
  center's replacement cycle is TracCloud/WCONLINE/AccuTrack. Loop carries
  the scheduling + attendance-of-record workflow those tools do, and forms
  the groups on top. Sell the workflow; the signal is harvested, not pitched.
- **Champion first.** An SI coordinator or TA-supervising faculty member walks
  Loop to the learning-center director. The research pilot is the pretext.
- **Adoption % is the only metric on the first slide.** Per-campus, per-cohort
  adoption and verified peer-study hours, instrumented from the pilot.
- **Design for coordinator self-launch with zero IT.** Nightly roster flat
  file, no SIS partner tier, until ~campus 10.
- **Cooperative contract is a growth multiplier at ~40 customers, not a
  starting move.** Stellic's E&I vehicle can still carry Loop earlier if the
  OEM slot is created.

## Aggregation: what exists at Cornell, what to build

**Claim: "nobody has a directory of resources and things open to students."**
Partly true. Cornell has a 1,527-org club directory (CampusGroups ✓) and a
central calendar with an open JSON API (events.cornell.edu = Localist ✓, ~244
events/week, departments only). What does *not* exist: any directory of
academic-support resources (LSC, ELI, Writing Centers, Math Support, CAPS,
ELSO — each its own island with its own booking system); any surface joining
department events (Localist) and club events (CampusGroups); anything
demand-side. Students check **10–15 sources routinely, 20+ with college
pages; exactly one has an open feed.**

Demand is real: campus events calendar was the #1 of 15 requested app
features (60%, n=3,000, 170 institutions, IHE/College Pulse 2023 ✓).

**Why it stays fragmented (ranked):** governance (each unit owns its tool —
no office has authority over "everything open to students"); data (four of
the highest-value sources are closed appointment systems; CampusGroups is
login-gated and JS-rendered); incentives (clubs post to Instagram/GroupMe
because that's where attendance comes from); product (the central calendar's
implicit category is "seminar," not "something to do tonight").

**Prior attempts:** Agnes (2017, Cornell alumni, 20 universities, 7,000+
events) — apparently defunct ~; Cornell AppDev pitched both an events
aggregator and a club finder in 2021 and built neither ✓ (shipped only
single-source, feed-available aggregators: Uplift, Volume); **Big Red Radar**
is live today on the club-event slice ~ — a free student project, which is
what a directory is worth.

**What this means for Loop:**
- **Don't build the aggregator.** Legally and cheaply reachable: ~1 of 15
  sources. The directory is a free student project's product, not a
  company's.
- **Do build the small thing nobody has:** a hand-curated academic-support
  map (10–20 entries per college, changes once a semester) — exactly the
  learning-center world Loop sells into, and every entry is a Loop anchor.
- **Ingest the one open feed** (Localist API) as event-seeded anchors —
  "Tuesday's talk, 4 want to go." Free supply, zero governance fight.
- **The sellable asset is the demand signal, not the listing.** "What
  students want to do that isn't offered" is data no office has, and SCL /
  Campus Activities — which signs the CampusGroups contract and is the only
  office measured on involvement — is the plausible buyer. Budget unverified.

## The single biggest risk

Loops don't reach a third meeting. The commitment stack gives it a designed
answer instead of a hope, but nobody has measured it. **The experiment:** one
semester, cluster-randomise *newly formed anchors* (not students) — control =
generic reminder; treatment = full commitment stack. ~200 groups / ~1,000
first-years powers a 10pp difference on a 45% base. Primary outcome: **share
of members physically present at occurrence #3**, measured by mutual check-in
(each attendee confirms who else was there), so no-shows can't self-certify.
Because the stack is randomly assigned, the attendance difference it creates
is exogenous — use it as an instrument to estimate the causal effect of
attendance on DFW, which is what turns "correlation" into "leading indicator"
on the provost slide. This single study is also the research pilot in month
0–6 — the same work buys the evidence, the baseline, and the first customer.
