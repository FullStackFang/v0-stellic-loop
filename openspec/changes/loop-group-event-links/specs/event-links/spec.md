## ADDED Requirements

### Requirement: A member adds an event by pasting a link
A member with the right to post SHALL be able to add an event to a group by giving one https link, on the site or through an assistant that holds a read-and-write grant for that group. When the link is on a site Loop reads and the page yields a name and a start time, the event SHALL be saved with the name, start, end, place and host read from the page and the link as its link. The member SHALL be marked interested in the same act. No approval SHALL be required. A follower, who can read and cannot post, SHALL NOT be able to add one.

#### Scenario: Luma link
- **WHEN** a member pastes a Luma event link whose page names "Founders dinner" starting Thursday 18:00 at "40 E 1st St"
- **THEN** the group gains an event "Founders dinner" with that start, place and link, the member is interested in it, and `whats_new` reports a new event

#### Scenario: Posh link through an assistant
- **WHEN** a member's assistant with a read-and-write grant calls the link tool with a Posh event link
- **THEN** the event is saved from the page's facts, the reply returns it in full, and the change log names the assistant

#### Scenario: Follower is refused
- **WHEN** a follower pastes an event link
- **THEN** nothing is saved and the reply says why

### Requirement: Loop reads only a fixed list of event sites
Loop SHALL fetch a pasted link only when its host is on a fixed list of event sites, and SHALL follow a redirect only to a host on that list. The request SHALL carry no cookies, no credentials and nothing that identifies the member or the group. Text read from a page SHALL be stored within the event's existing length and character limits and SHALL be returned to an assistant marked as untrusted.

#### Scenario: Link on another site is not fetched
- **WHEN** a member pastes a link to a host that is not on the list
- **THEN** Loop makes no request to that host

#### Scenario: Redirect off the list
- **WHEN** a listed site answers with a redirect to a host that is not on the list
- **THEN** Loop does not follow it and treats the link as one it cannot read

### Requirement: A link Loop cannot read is kept with the member's own facts
When a link is on a site Loop does not read, or the page yields no name or no start time, nothing SHALL be saved until the member gives a name and a start time. With those, the event SHALL be saved with the link as its link.

#### Scenario: Partiful link
- **WHEN** a member pastes a Partiful link
- **THEN** the reply says Loop cannot read that page and asks for a name and a start time, and nothing is saved

#### Scenario: Member supplies the facts
- **WHEN** the member then gives "Rooftop birthday" and a start time with the same link
- **THEN** the event is saved with that name, start and link, and the member is interested in it

### Requirement: One event per link in a group
A group SHALL hold at most one event that is not archived for a given link. Giving a link the group already holds SHALL save no new event, SHALL mark the caller interested in the existing one, and SHALL say so. Links that differ only in a query string or fragment on a listed site SHALL count as the same link.

#### Scenario: Second member pastes the same link
- **WHEN** a second member pastes a link the group already holds
- **THEN** no event is added, that member becomes interested in the existing event, and the count rises by one

#### Scenario: Tracking parameters
- **WHEN** a member pastes a Luma link with `?utm_source=whatsapp` and the group holds the same link without it
- **THEN** it resolves to the existing event

### Requirement: Limits on linked events
A member SHALL have at most 10 upcoming linked events they added in one group. A linked event SHALL count toward the group's limit of 50 upcoming events. At a limit, nothing SHALL be saved and the reply SHALL name the limit.

#### Scenario: Member at their limit
- **WHEN** a member with 10 upcoming linked events in a group pastes another link
- **THEN** nothing is saved and the reply says they have reached the number of events they can add

### Requirement: The member who added a linked event can take it back
The member who added a linked event SHALL be able to remove it while no other member is interested in it. Once another member is interested, only an owner or organizer SHALL be able to archive it. A link that was removed SHALL be addable again.

#### Scenario: Nobody else is interested
- **WHEN** the member who added a linked event removes it and they are the only one interested
- **THEN** the event leaves the upcoming list

#### Scenario: Someone else is interested
- **WHEN** the member who added a linked event tries to remove it after a second member marked interest
- **THEN** nothing changes and the reply says others are interested

### Requirement: Linked events follow their source once a day
Loop SHALL read each upcoming linked event's page again once a day until the event has passed. A changed start, end or place SHALL be applied to the event, SHALL enter the change sequence, and SHALL move calendar invites already sent. When the page is gone or says the event is cancelled, the event SHALL be labelled as no longer listed at the source and SHALL be kept with its interest. Loop SHALL NOT archive an event because of what its source says. A page that cannot be parsed SHALL change nothing.

#### Scenario: The source moves the time
- **WHEN** the source page of a linked event shows a start one hour later at the daily read
- **THEN** the event's start changes, and members' next `whats_new` reports the change

#### Scenario: The source page is gone
- **WHEN** the source page answers that it does not exist
- **THEN** the event stays in the group with its interested members and is labelled "No longer listed at the source"

#### Scenario: Unparseable page
- **WHEN** the source page loads and yields no event facts
- **THEN** the event is unchanged and carries no label

### Requirement: A hand change stops the follow
When an owner or organizer changes a linked event's name, start, end or place, the daily read SHALL leave that event as they set it from then on.

#### Scenario: Organizer corrects the place
- **WHEN** an organizer changes a linked event's place and the source later shows a different place
- **THEN** the event keeps the organizer's place
