# Pulse — Demo Spec

*A fictional, self-contained webapp demo. Purpose: prove the use case and utility on camera. We rebuild the real app **from** this demo later.*

**Status:** demo / throwaway (rebuild-from)
**Target:** working link + 2-min video by Aug 21
**One file:** `index.html`

---

## 1. What Pulse is (and the one distinction we cannot lose)

Pulse is a campus app where a student drops a standing intent in plain language
("lock in for CS 2110," "find a dinner crew") and, instead of a **match**, gets
folded into a **recurring loop with an owner** — a study session, a squad, a
standing table that meets on its own rhythm with the same faces.

**The whole originality bet, stated once:**

| | Every other campus feed | **Pulse** |
|---|---|---|
| Output | a **match** (a name + email, go DIY) | a **loop** (recurring session: time, place, owner) |
| Job | discovery (find someone new) | repetition (see the same people again) |
| After | up to you (this is where it fizzles) | the app drafts the next one; coordinator taps send |
| Rejection | invisible | never shown — declining changes the draft, never a visible grid |

> **Judge-facing sentence:** *"Every other campus app helps you meet someone once. Pulse makes sure you see them again."*

If any screen ever shows "here are 5 people who also like X, go message them,"
the demo has failed. **The output is always a loop.**

Hero use case for this demo: **recurring study sessions** — they spin up on a
natural pretext ("HW2 is due Thursday") and are recurring by nature.

---

## 2. Scope of THIS demo

**In:** an interactive click-path that runs the §5 arc live — type an intent,
see parsed suggestions, join a loop, spin one up, watch the same faces return,
see a latecomer fold in.

**Out (deliberately, "cut if behind" in the source spec):**
- Drop event screen (S10) — flourish only.
- Claude API intent parse (Layer B) — demo uses deterministic Layer A so it
  never fails on camera. Layer B is a documented later upgrade.
- Real auth, real backend, persistence across reload.

**Non-goals / guardrails (baked in — these ARE the product):**
- No intent feed (no scrollable wall of everyone's intents).
- No browsable stranger profiles. Avatars are display-only, no tap-through.
- No going/maybe/declined grid. "Can't this week" changes the draft silently.
- No match list. Every intent's output is a loop.
- No stranger DMs. Contact happens inside a loop that's already meeting.

---

## 3. Tech shape

- **Single self-contained `index.html`.** React + Tailwind + Lucide icons via
  CDN (Lucide glyphs are also embedded inline as an SVG-path fallback so a
  blocked CDN never yields empty icons on camera). All mock data and logic
  inline. Zero install; double-click to open.
- **Framing:** centered ~390px phone column on a neutral backdrop, so it reads
  as a phone app when the judge opens it on a laptop.
- **State:** in-memory React state only. Reset on reload is fine (and useful for
  re-recording takes).
- Chosen for speed, portability, and easy recording. The real rebuild will
  re-express this as a proper componentized project (likely Next.js + Tailwind +
  shadcn/ui to match the other `v0-*` apps).

---

## 4. Design system

- **Primary:** coral `#FF5C3A`. Text near-black `#1A1A1A`, soft grey `#6B7280`,
  background `#FFFFFF` / `#FAFAFA`, hairline borders `#EEEEEE`.
- **Flat.** No gradients, no drop-shadows. Depth from spacing + 1px hairlines.
- **Cards:** `rounded-2xl`, generous padding, hairline border.
- **Type:** Inter / system. Big friendly headers, comfortable line height.
- **Buttons:** coral fill, white text, `rounded-xl`, full-width on mobile.
  Secondary = ghost/outline.
- **Icons:** Tabler.
- **Voice:** warm, plain, a little playful — never corporate.

---

## 5. The click-path (this is the build target)

Build to make *this exact sequence* flawless; everything else is polish.
Tightest video cut: **1 → 2 → 3 → 5 → 6**.

1. **Onboarding.** Sarah verifies Cornell email → 3 taps (name, Class of 2029,
   Donlon Hall, CS major) → intent box: *"what are you trying to make happen
   this semester?"* → types **"I need to lock in for CS 2110, the psets are
   killing me."**
2. **Intent → suggestions.** Pulse parses it → a short card list: an **existing
   loop to join**, a **loop to spin up**, and a **forming** one. No profiles, no
   feed.
3. **Sign up for regularity.** She taps *Count me in* on the Sunday HW Crew.
   Recurring. Same people every week.
4. **Natural spin-up.** Josh types **"set up a study session for HW2 this week
   for 2110."** Pulse drafts a full session — *Thu 7pm, Mann Library, recurring
   weekly?* — he taps *Send it*. It becomes a loop; classmates fold in.
5. **The recurrence (payoff shot).** Two weeks later: *"HW3 session Thursday?
   Same crew."* → tap → the **same avatars** come back. This frame *is* the
   thesis.
6. **The fold-in.** Notification: *"Maya (Donlon · CS 2110) just joined your
   Sunday HW Crew."* A latecomer seated into a running loop — no cold start.
7. **(Optional flourish)** *"Thursday 6pm — Pulse Drop: 3 new study crews formed
   on North Campus tonight."*

---

## 6. Screens (with copy)

- **S1 · Splash.** Flame logo, coral. Tagline *"Your people, on repeat."*
  Button *Get started.*
- **S2 · Email verify.** *"What's your Cornell email?"* → `sarah.chen@cornell.edu`.
  Subtext *"Only used to confirm you're a Cornellian. Nobody in your crews ever
  sees it."* (Accept any `@cornell.edu`; skip real verification.) Button *Verify.*
- **S3 · Basics.** Chips/dropdowns: **Name**, **Class year** (2029), **Where you
  live** (Donlon ▾), **Major** (Computer Science ▾). Button *Next.* This is the
  entire questionnaire — deliberately lighter than a 10-minute form.
- **S4 · First intent.** *"Last thing — what are you trying to make happen this
  semester?"* Big text box. Placeholder *"e.g. lock in for CS 2110 · get into
  bouldering · find a dinner crew"* + mic icon. Button *See my Pulse.*
- **S5 · Home ("Your Pulse").** Persistent **Drop an intent** bar at top (intent
  is ongoing). Below: **your loops** as cards. New user empty-state header
  *"You're in. Here's what's forming around you,"* leading into suggestions.
- **S6 · Suggestions.** From *"lock in for CS 2110"*, 2–3 cards:
  - **Join:** `CS 2110 · Sunday HW Crew` — 4 going · Sundays 4pm · Uris Cocktail
    Lounge · *[Count me in]*
  - **Spin up:** `Start a CS 2110 study session` — *11 others on your floor
    dropped this* · *[Spin one up]*
  - **Forming:** `CS 2110 · Prelim 1 review` — forming · *[Notify me when it's set]*
- **S7 · Loop detail.** Title, cadence (*Sundays 4pm, weekly*), **next session**
  (date · time · place), member avatars (display only), coordinator badge,
  actions *Count me in* / *Can't this week*. Footer *"Pulse handles the reminders
  and the next one."* **No going/declined grid.**
- **S8 · Spin-up flow.** Text in: *"set up a study session for HW2 this week for
  2110."* Returns an **editable confident draft**: `CS 2110 · HW2 grind · Thu 7pm
  · Mann Library · repeat weekly ✓`. One tap *Send it.* Confirmation *"Sent. 3
  classmates already in."*
- **S9 · Fold-in notification.** *"Maya (Donlon · CS 2110) just joined your
  Sunday HW Crew."* Optional *"Say hi 👋"* (opens the loop, not a DM).
- **S10 · Drop event (optional).** *"Thursday 6pm · Pulse Drop"* → *"3 new study
  crews formed on North Campus tonight"* with the crystallized loops listed.

---

## 7. Data model + seed data

In-memory only. Four entities:

```
User    { id, name, avatarUrl, classYear, dorm, major, courses[] }
Intent  { id, userId, rawText, type, target, createdAt }
        // type: "study" | "activity" | "social"
        // target: course code ("CS 2110") or activity ("bouldering")
Loop    { id, type, title, target, cadence, nextSession,
          location, memberIds[], coordinatorId, status }
        // status: "forming" | "active" | "dormant"
Session { id, loopId, date, attendeeIds[] }
```

**Seed (real Cornell texture):**
- **Courses:** `CS 2110` (Object-Oriented Data Structures — big, hard, perfect),
  `CHEM 2070`, `ECON 1110`, `MATH 1920`, `PSYCH 1101`.
- **Dorms (North / freshmen):** Donlon, Balch, Dickson, Court-Kay-Bauer (CKB),
  Mews, Toni Morrison, Ganędago, Jameson.
- **Study spots:** Uris (Cocktail Lounge), Olin, Mann, Duffield atrium, Libe
  Café, Klarman atrium.
- **Seed loops:** one **active** (`CS 2110 Sunday HW Crew`, 4 members incl. Josh
  as coordinator), one **forming** (`CHEM 2070 review`). So Home isn't empty and
  the "same faces" recurrence has real avatars to reuse.
- **Cast:** swap the demo crew for real teammates — **Josh, Sarah, Lydia** — so
  "try with Cornell students" is literally true on camera. Sarah = the onboarding
  persona; Josh = the spin-up persona / coordinator; Maya = the fold-in latecomer.

---

## 8. Intent parsing (Layer A only, for the demo)

Deterministic, never fails on stage.

- **Course codes:** regex `/\b([A-Z]{2,5})\s?(\d{4})\b/` → `CS 2110`,
  `CHEM 2070`. Also match a bare 4-digit code (`2110`) against seeded courses.
- **Activity/social keywords:** `box|boxing → boxing`, `climb|boulder →
  bouldering`, `dinner|eat → dinner crew`, `run → running`.
- **Resolution:** code match → look up existing loops for that course → return
  join / spin-up / forming cards. Nothing seeded → return "spin one up."

**Layer B (Claude API parse) — documented, NOT in the demo build.** Later
upgrade: one `claude-sonnet-4-6` call, `max_tokens: 300`, free text → structured
JSON `{ type, target, cadence_hint }`, with **fallback to Layer A on any error or
for the scripted demo courses.** Never let the live demo depend on a network call.

---

## 9. Success criteria (how we know the demo is done)

The demo is done when a person can, in one sitting, without any code error or
dead end:

1. Onboard as Sarah and reach Home.
2. Type an intent naming CS 2110 and get the 3 suggestion cards (join / spin-up /
   forming) — no feed, no profiles.
3. Tap *Count me in* and see the loop appear in her Home with her as a member.
4. Run the spin-up flow: free text → editable draft card → *Send it* →
   confirmation.
5. Trigger the recurrence view and see the **same avatars** return.
6. See the fold-in notification for Maya.

And, throughout: **no screen ever shows a match list, an intent feed, a
browsable profile, or a going/declined grid.** Violating any of those is a bug,
not a polish item.

---

## 10. Submission tie-in (context, not build work)

- **Category:** enter **01 · Degree Planning & Discovery** (study sessions live
  there; less crowded than Campus Connection — a structural edge on originality).
- **Framing:** "the connective tissue that makes hard courses survivable" —
  touches degree progress *and* belonging.
- **Video beats:** fizzle problem (10s) → intent drop (20s) → the loop, *not a
  match* (20s) → same faces two weeks later (30s) → latecomer folds in (20s) →
  Pulse Drop flourish + one line on scale (20s).

---

## 11. Build order (single file, iterate in place)

1. Design system + phone frame + splash (S1).
2. Onboarding S2 → S3 → S4 (state accumulates the Sarah user).
3. Home S5 with seeded loops + persistent intent bar.
4. Layer-A parser + Suggestions S6.
5. Loop detail S7 + *Count me in* mutates state.
6. Spin-up S8 (draft → Send it → confirmation) + fold-in notification S9.
7. Recurrence view (same avatars) — the payoff frame.
8. Polish: copy, teammate avatars, mobile framing. (S10 / Layer B only if time.)
