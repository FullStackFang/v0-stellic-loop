# share-unfurl Specification

## Purpose
TBD - created by archiving change quorum-board. Update Purpose after archive.
## Requirements
### Requirement: Every share mints a fresh URL
The share action SHALL create a share token, record who shared and when, write a `share_minted` event, and return `/p/<id>?s=<token>`. Tokens SHALL be unguessable and unique.

#### Scenario: Share twice
- **WHEN** Priya taps Share twice
- **THEN** two different URLs are produced and two `share` rows name her

### Requirement: The preview is exact at the moment of sharing
The proposal page SHALL set `og:title` to the count line and title, `og:image` to `/p/<id>/og?v=<response count>`, and `rel=canonical` to the bare `/p/<id>`. The OG image route SHALL render the title, the count line, the best or locked day and the board name, never a person's name, and SHALL send `Cache-Control: no-store`.

#### Scenario: Preview content
- **WHEN** a chat app fetches a share URL of "Suits" at 5 of 8
- **THEN** the image shows "5 of 8 in · Suits in Hoi An · Tue 16" and no names

#### Scenario: Count changes
- **WHEN** one more person taps in and a new share is minted
- **THEN** the new URL's image reads 6 of 8 while the old URL's cached preview is unchanged

### Requirement: Shared-link responses are attributed
A first response from a visitor who arrived through `?s=<token>` SHALL write its `response` event with `source=proposal_link` and the share id. A visitor who arrived at the bare URL or the board SHALL be attributed `group_link`.

#### Scenario: Attribution
- **WHEN** a stranger opens Priya's share URL and taps in
- **THEN** their `response` and `person_added` events carry `proposal_link` and Priya's share id

### Requirement: The board link has a static preview
`/b/<slug>` SHALL have an OG image with the board name and no counts, so a stale cache is harmless.

#### Scenario: Board unfurl
- **WHEN** the board link is pasted into a chat
- **THEN** the preview shows the board name only

