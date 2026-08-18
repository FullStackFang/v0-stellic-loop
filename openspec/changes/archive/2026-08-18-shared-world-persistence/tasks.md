## 1. Persistence layer (add first, wire nothing yet)

- [x] 1.1 Add `WORLD_VERSION` constant and `seedWorld()` (returns `{ version, loops: seedLoops(), intents: seedIntents(), wrapped: WRAPPED_LOOPS, notifs: {}, feedback: {}, profiles: {} }`) above `App` in index.html
- [x] 1.2 Add `worldStore` module above `App` with `load()` (lazy seed when empty; try/catch; version-gate → reseed on mismatch/corrupt), `save(world)` (try/catch), `reset()` (remove key, return `seedWorld()`)
- [x] 1.3 If no `seedIntents()` exists yet, add one returning `[]` (or the current seeded `myIntents`, now each carrying a `userId`)

## 2. Collapse App state into the world

- [x] 2.1 Add `const [world, setWorld] = useState(worldStore.load)` in `App`
- [x] 2.2 Add `useEffect(() => { worldStore.save(world); }, [world])`
- [x] 2.3 Add the `setLoops` shim: `const setLoops = up => setWorld(w => ({ ...w, loops: typeof up==='function' ? up(w.loops) : up }))`
- [x] 2.4 Derive read slices: `const { loops, wrapped } = world`, `const myNotifs = world.notifs[viewerId] || []`, `const feedback = world.feedback[viewerId] || {}`, `const myIntents = world.intents.filter(i => i.userId===viewerId)`
- [x] 2.5 Delete the now-redundant `useState` hooks: `loops`, `notifs`, `wrapped`, `feedback`, `myIntents`
- [x] 2.6 Delete the `foldedIn`/`setFoldedIn` hook and every reference to it

## 3. Per-recipient notifications & per-user feedback

- [x] 3.1 Add `setNotifsFor(recipientId, updater)` and `setFeedbackFor` writers that update `world.notifs[recipientId]` / `world.feedback[viewerId]` immutably
- [x] 3.2 Repoint notification writers (`openLoop` mark-read, `armWrap`, fold-in) to address an explicit recipient rather than "current viewer"
- [x] 3.3 Repoint `wrapped` mutations (`armWrap` "just now") to `world.wrapped`; confirm `unrated`/`feedbackCount` derive from the viewer's feedback slice

## 4. Persona viewpoint & de-scripting

- [x] 4.1 Derive `user` from persona attrs: `const user = { ...PERSONA_BY_ID[viewerId], ...(USERS[viewerId]||{}), ...(world.profiles[viewerId]||{}) }`; remove the standalone `user`/`setUser` where it only mirrored persona attrs (keep onboarding writes via `world.profiles`)
- [x] 4.2 Shrink `switchPersona` to: set `viewerId`, clear ephemerals, set landing screen — no `seedLoops()`, no world writes
- [x] 4.3 Delete from `switchPersona`: the Maya force-seat block, the Josh RA-notif block, the Sarah scripted-suggestions block, the `armWrap` call, and all `setWrapped/setFeedback/setMyIntents([])` resets
- [x] 4.4 Remove Josh's `role:'RA'`/"seeded a loop" tag and Maya's `role:'latecomer'`/tag from `PERSONAS` so the three students are attribute-only (keep `dana` untouched)
- [x] 4.5 Delete line 3737's `if (loopId==='sunday-hw' && viewerId==='sarah' ...) armFoldIn()` trigger

## 5. Rewrite mutations against the shared world

- [x] 5.1 Verify `foldIn`, `leaveLoop`, `wantThis`, `floorSeat`, `floorUnseat`, `checkIn`, `moveTonight`, `undoMove` run through the `setLoops` shim with bodies unchanged
- [x] 5.2 In `sendDraft`, rename `streakLeaderId:viewerId` → `createdBy:viewerId` (provenance); keep behavior otherwise
- [x] 5.3 Rewrite `saveIntent(it, replaceId)` to honor the two-arg edit-replace: upsert `it` into `world.intents` with `userId:viewerId`, and remove `replaceId` when it differs from `it.id`
- [x] 5.4 Rewrite `removeIntent(id)` to filter `world.intents`
- [x] 5.5 Confirm `YouScreen` reads (`myLoops`, `myIntents`, `wrapped`, `feedback`, segment default, "to rate" dot) all resolve from the world slices and survive a persona toggle

## 6. Director control for live fold-in

- [x] 6.1 Add a `directorFoldIn(memberId, loopId)` action: add member to `loop.memberIds`, create an addressed notification for the relevant recipient, mutate through `setWorld`
- [x] 6.2 Add an out-of-frame button next to the persona switcher that invokes `directorFoldIn` (default to a sensible member+loop for the demo, or let the operator pick)
- [x] 6.3 Remove or repurpose the old `armFoldIn`; ensure no `'sunday-hw'`/`'maya'` magic strings remain in mutation logic (grep to confirm)

## 7. Audience-driven visibility

- [x] 7.1 Add `courses[]` to the three student entries in `USERS`
- [x] 7.2 Add `NORTH` set, `building()` helper, `inferAudience(loop)`, `isVisibleTo(loop, viewer)`, and `visibleLoops(world, viewer)` near the old `loopBand`
- [x] 7.3 Add explicit `audience` to the `seedLoops()` entries (or rely on `inferAudience`); delete `BAND_BY_ID` and retire `loopBand`
- [x] 7.4 Repoint `PulseFeed` candidate pool to `visibleLoops(world, viewer)` and derive the scope dial labels from the viewer's dorm/building (not hardcoded "Donlon")
- [x] 7.5 Apply the same audience logic to intents where the feed surfaces them

## 8. Reset & narrative timing

- [x] 8.1 Rewrite `reset` to `setWorld(worldStore.reset())` + clear ephemerals + `setViewerId('sarah')` + `setScreen('splash')`
- [x] 8.2 Fire `armWrap` once on first entry to Home (e.g. end of onboarding `firstIntent`), not on persona switch
- [x] 8.3 Wire the existing "restart demo" control (index.html ~4028) to `reset`

## 9. Verify

- [x] 9.1 Load the app; confirm no console errors and the seeded world renders for Sarah
- [x] 9.2 As Sarah, spin up an event, then leave it; toggle to Josh and confirm the event reflects the change per visibility (visible if in-scope or member)
- [x] 9.3 Toggle Sarah → Maya → Josh; confirm loops/intents/ratings persist across toggles (no reseed) and notifications are per-recipient
- [x] 9.4 Confirm attribute-driven visibility: a Donlon-2F loop shows for Sarah/Maya but not Josh; a CS-2110 loop shows for all three
- [x] 9.5 Add and then edit an intent in the You tab (pencil → Save changes) and confirm it replaces rather than duplicates; toggle away and back to confirm it persists
- [x] 9.6 Trigger the director fold-in and confirm the live animation + addressed notification appear and persist
- [x] 9.7 Reload the page and confirm the world (created events, memberships, intents, ratings) is restored from localStorage; trigger reset and confirm a clean seeded demo
- [x] 9.8 Grep index.html for `sunday-hw`, `maya`, `foldedIn`, `BAND_BY_ID` to confirm no asymmetric scripting remains in logic
