## REMOVED Requirements

### Requirement: Free days per person per board window
**Reason**: Intents carry a slot (`intent-slot`); the spec has no per-person free days and no day grid on any page.
**Migration**: The free-days strip leaves the plans page and `actions/days.ts` is removed from the UI. The `free_day` table and `response.days` stay in the schema; legacy needs-a-day proposals keep forming from stored days until they close.

### Requirement: Tapping in attaches your days
**Reason**: New proposals have `needs_day = false`; an answer is a yes to the slot.
**Migration**: The response action no longer copies free days; for legacy needs-a-day rows it keeps attaching the person's stored free days so those plans can still form.

### Requirement: Conflict days are removed and explained
**Reason**: No day grid, no conflict line.
**Migration**: Conflicts are no longer computed for display; `lib/quorum.ts` keeps the pure functions for legacy formation only.

### Requirement: Day heat shows counts, never who
**Reason**: No heat is shown on any page.
**Migration**: `components/DayStrip.tsx` and the card heat are deleted; `heat` and `best` stay in `lib/quorum.ts` for legacy formation.

### Requirement: Proposals that need no day ignore days
**Reason**: Every new proposal ignores days; the requirement is now the default and is covered by `intent-slot`.
**Migration**: None.
