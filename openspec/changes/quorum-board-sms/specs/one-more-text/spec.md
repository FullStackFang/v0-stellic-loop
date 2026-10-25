# Spec Delta

## Purpose

The once-per-intent text that turns being close into a reason to share.

## ADDED Requirements

### Requirement: One-more fires once, within two of the minimum
When a response with answer `in` commits on an open intent, the system SHALL send the one-more text if all of these hold:
- the count of `in` is at least the minimum minus two;
- the count is below the minimum;
- the count is at least two;
- the intent has not had a one-more text before.

Once per intent SHALL be enforced by the database with a `one_more_sent` event and a partial unique index. A response that does not meet the condition, and every response after the text has fired, SHALL send nothing.

#### Scenario: Six of eight
- **WHEN** minimum is 8 and the sixth `in` arrives
- **THEN** one `one_more_sent` event exists and the one-more text goes out

#### Scenario: Seventh yes after it fired
- **WHEN** the seventh `in` arrives on the same intent
- **THEN** no further one-more text is sent

#### Scenario: Fresh post with the default minimum
- **WHEN** an intent with no number is posted (the poster is the only `in`, minimum 4)
- **THEN** no one-more text is sent; the second `in` sends it

#### Scenario: Two at once
- **WHEN** two `in` responses that both meet the condition commit at the same moment
- **THEN** exactly one `one_more_sent` event exists and the text goes out once

### Requirement: One-more goes to the poster and every yes with a share link
The one-more text SHALL go to the poster and every person `in` at that moment. It SHALL read "{n} of {min} for {title}. {k} more and it's on. Send it to someone: {link}", with "One more" when k is 1. It SHALL carry a share link minted for that recipient (`/p/<id>?s=<token>`), with a `share_minted` event naming them as the sharer. It SHALL NOT carry a sign-in token.

#### Scenario: Recipient forwards it
- **WHEN** Marcus forwards his one-more text and a stranger answers through the link
- **THEN** the stranger's response is attributed to Marcus's share and nobody is signed in as Marcus
