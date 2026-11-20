# seats-crowd Specification

## Purpose
TBD - created by archiving change loop-foot-crowd-to-seats. Update Purpose after archive.
## Requirements
### Requirement: An animal out of its seat can be poked
On Seats, a press on an animal that is out of its seat and is let go without a pull SHALL flip it, and the animals near it on the floor SHALL hop. A seated animal SHALL NOT move when pressed.

#### Scenario: Poking one on the floor
- **WHEN** a round is on and the player presses and lets go of an animal on the floor without moving
- **THEN** it flips and the ones beside it hop, and no seat changes

#### Scenario: Pressing a seated one
- **WHEN** the player presses an animal that is in a seat
- **THEN** it stays in its seat, still

### Requirement: The animals look toward the pointer
On Seats, while the pointer is over the ticket, each animal SHALL turn toward it, and one on the floor near it SHALL rise on tiptoe. A seated animal SHALL turn only, and stay in its seat.

#### Scenario: Pointer over the ticket
- **WHEN** the pointer moves over the ticket
- **THEN** the animals turn toward it

### Requirement: The ticket can be tipped
On Seats, the ticket SHALL be picked up with a mouse or pen on its paper, follow the hand and tip; animals on the floor SHALL slide toward the low end and pile up, and on letting go the ticket SHALL swing back and they SHALL hop. Seated animals SHALL stay in their seats. With touch, the page SHALL scroll as usual and the ticket SHALL NOT be picked up.

#### Scenario: Tipping with animals out
- **WHEN** a round is on and the player drags the ticket's paper with a mouse
- **THEN** the ticket tips, the animals on the floor slide to its low end, and seated ones do not move

#### Scenario: Touch
- **WHEN** the player drags the ticket on a phone
- **THEN** the page scrolls and the ticket does not move

### Requirement: Left alone, one gets restless
On Seats, while the page is visible and nobody is touching it, an animal on the floor SHALL hop now and then. Seated animals SHALL NOT.

#### Scenario: Idle during a round
- **WHEN** a round is on and the player does nothing for a few seconds
- **THEN** one of the animals on the floor hops

### Requirement: The round is unchanged
The crowd's behaviours SHALL NOT change the Seats round: picking an animal up only while the clock runs, an animal seated only in its own seat, the charge for a wrong seat, and the best kept in the browser.

#### Scenario: Winning a round
- **WHEN** every animal is back in its own seat
- **THEN** the clock stops, the ticket says "All in" with the time, and a new best is kept

### Requirement: Reduced motion
With reduced motion asked for, Seats SHALL NOT hop, slide, flip or tip anything, and the round SHALL still be playable.

#### Scenario: Reduced motion
- **WHEN** reduced motion is on and the player kicks them out
- **THEN** the animals are on the floor at once, nothing moves on its own, and each can still be put back in its seat

