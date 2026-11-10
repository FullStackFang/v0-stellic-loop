# Superseded by loop-team-layer

Archived 2026-11-09 with 4 of 28 tasks done. Specs were not synced to `openspec/specs/`.

Kept, and now specified in `loop-team-layer`:
- group handles and exact-group assistant consent;
- shared notes with the portal review step, on the existing `/api/mcp` route;
- the shared-note store, which team records extend with new kinds.

Dropped:
- decision promotion by an organizer (decisions now supersede by topic);
- the source dependency graph and transitive invalidation;
- the portal review bridge for team records (team writes are one call).
