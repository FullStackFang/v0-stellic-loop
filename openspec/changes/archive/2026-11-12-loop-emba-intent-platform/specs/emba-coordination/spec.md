## ADDED Requirements

### Requirement: Versioned conditional opt-in
An activity SHALL specify place, timezone-aware interval, signup deadline and immutable published revision. A commitment SHALL explicitly authorize inclusion for that revision at its deadline. Only eligible active opt-ins SHALL enter the candidate set. Members SHALL post where authorized; followers SHALL not commit. New joins SHALL close at the deadline.

#### Scenario: Material change
- **WHEN** time, place or another material activity term changes
- **THEN** the system opens a new revision requiring fresh commitments instead of carrying old authorization forward

### Requirement: Validated monotone resolver
The resolver SHALL repeatedly remove candidates whose nonnegative integer `min_others` exceeds the number of other remaining people or whose distinct `requires` people are missing. Both predicates SHALL combine with AND. Self-dependency, malformed thresholds, cross-context references and duplicate-count inflation SHALL be rejected. The result SHALL be the greatest feasible subset of the input snapshot; empty and singleton results SHALL be valid. Capacity/negative predicates SHALL not be accepted.

#### Scenario: Cycle and cascade
- **WHEN** A requires B and B requires A and both opted in
- **THEN** both survive if other conditions hold, while removing either cascades to the other

#### Scenario: Largest feasible set
- **WHEN** all subsets of a small candidate fixture are independently evaluated
- **THEN** every feasible subset is contained in the resolver output regardless of input order

### Requirement: Named dependency consent
A named dependency SHALL require the target's activity-specific permission for the requester to learn participation. The target need not have opted in yet. Denials SHALL not reveal participation. Revoking consent SHALL suspend affected dependent commitments until fresh explicit choice, without silently dropping constraints.

#### Scenario: Consent revoked
- **WHEN** B revokes A's permission for an existing requirement on B
- **THEN** A's commitment is suspended and never becomes an easier unconditional commitment

### Requirement: Transactional finalization and delivery
Finalization SHALL serialize against concurrent commitments/withdrawals, create one resolution for the activity revision and atomically persist recipient notifications. Retries SHALL not duplicate commitments, resolutions or logical inbox items. Finalized SHALL mean a social plan, not a reservation. Assistant polling SHALL not mark human acknowledgement.

#### Scenario: Concurrent deadline and withdrawal
- **WHEN** finalization races with a member withdrawal
- **THEN** the resulting state reflects a serial order with no stale active commitment or duplicate resolution

### Requirement: Withdrawal and revision lifecycle
Activities SHALL move through draft, open, finalized and completed/cancelled, with degradation tracked for finalized plans. Withdrawal, account deletion or lost eligibility SHALL recompute remaining feasibility and notify affected people without private dependency explanations. Reopening/reconfirmation SHALL use a fresh revision. Creator or scoped organizer SHALL cancel; participants SHALL withdraw only themselves. Completion SHALL not assert attendance.

#### Scenario: Required member leaves
- **WHEN** a required participant withdraws after finalization
- **THEN** affected commitments cease to be represented as satisfied, the plan is degraded and authorized members receive a versioned update
