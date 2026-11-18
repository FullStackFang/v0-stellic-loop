## ADDED Requirements

### Requirement: Owners and organizers give a group calendar feeds
An owner or organizer SHALL be able to add a calendar feed to a group on the site by giving a name and an https address, to turn a feed off and on, and to read one at once. A group SHALL hold at most 10 feeds. A `webcal:` address SHALL be taken as the same https address. An assistant SHALL NOT be able to add, change or read a feed. A member who is not an owner or organizer SHALL NOT be able to manage feeds.

#### Scenario: Organizer adds a club feed
- **WHEN** an organizer adds the feed "Entrepreneurship Club" with a CampusGroups calendar address
- **THEN** the feed is saved, read at once, and the page shows how many events it held

#### Scenario: Assistant cannot add a feed
- **WHEN** an organizer's assistant tries to add a feed
- **THEN** no such tool exists and nothing is saved

#### Scenario: Eleventh feed
- **WHEN** an organizer adds a feed to a group that has 10
- **THEN** nothing is saved and the reply names the limit

### Requirement: Feed addresses are fetched with care
Loop SHALL fetch a feed only over https, without cookies or credentials, and SHALL refuse a host that resolves to a loopback, private, link-local or unique-local address, on the first request and on every redirect. A response that is not a calendar SHALL add nothing, and none of its text SHALL be shown.

#### Scenario: Internal address
- **WHEN** an organizer adds a feed whose host resolves to a private address
- **THEN** no request is made to it and the feed's last result says it could not be read

#### Scenario: A web page instead of a calendar
- **WHEN** a feed address returns a sign-in page
- **THEN** the feed's last result says it is not a calendar feed and the nearby list is unchanged

### Requirement: Feeds are read every hour into a Nearby list
Loop SHALL read every feed that is on once an hour. An item that starts within the next 14 days SHALL become a nearby item of the group, matched to its feed by the item's id. A changed item SHALL update its nearby item. An item gone from the feed SHALL leave the Nearby list. A cancelled item SHALL NOT be listed. A feed that fails SHALL leave its nearby items as they were, record the failure on the feed, and not stop other feeds.

#### Scenario: First read
- **WHEN** a feed holding three events in the next 14 days and one in six weeks is read
- **THEN** the group's Nearby list shows the three

#### Scenario: Item removed at the source
- **WHEN** an item that was listed is absent from the next read
- **THEN** it is no longer in the Nearby list

#### Scenario: One feed fails
- **WHEN** one of a group's two feeds answers with an error
- **THEN** the other feed's items are updated, the failed feed's items are unchanged, and the failed feed shows the error as its last result

### Requirement: Nearby items are listed quietly
Members and followers of a group SHALL see its Nearby list on the group page and through `whats_on`: the soonest 30 items that have not ended, each with title, time, place when the feed gives one, host, and the feed's name. A nearby item SHALL NOT enter the change sequence, SHALL NOT appear in `waiting`, and SHALL NOT count toward the group's limit of upcoming events. A person who is not in the group SHALL NOT see the Nearby list.

#### Scenario: Seeded group with no events
- **WHEN** a member opens a group that has one feed and no events
- **THEN** the page shows the feed's items under "Nearby" and an empty upcoming list

#### Scenario: Nothing waits
- **WHEN** a feed read adds 20 nearby items
- **THEN** no member's `waiting` or `whats_new` reports any of them

### Requirement: First interest makes a nearby item the group's event
A member with the right to post SHALL be able to mark interest in a nearby item, on the site or through an assistant with a read-and-write grant. Doing so SHALL create a group event from the item's facts, mark that member interested, enter the change sequence as a new event, and remove the item from the Nearby list. The limits on linked events SHALL apply.

#### Scenario: First member is interested
- **WHEN** a member marks interest in the nearby item "Pitch night"
- **THEN** the group has an event "Pitch night" with that member interested, the item is no longer under Nearby, and other members' `whats_new` reports the new event

#### Scenario: Two members at once
- **WHEN** two members mark interest in the same nearby item at the same moment
- **THEN** one event exists and both are interested in it

### Requirement: An event made from a feed follows its feed
After a nearby item has become a group event, each hourly read SHALL apply the item's changed start, end or place to the event, as a change that enters the change sequence. When the item leaves the feed or is cancelled, the event SHALL be labelled as no longer listed at the source and SHALL be kept. A hand change by an owner or organizer SHALL stop the follow.

#### Scenario: Feed moves the event
- **WHEN** a feed item that became a group event moves to another room
- **THEN** the event's place changes and `whats_new` reports it

#### Scenario: Item leaves the feed
- **WHEN** the feed no longer holds the item
- **THEN** the event stays with its interested members and is labelled "No longer listed at the source"

### Requirement: The same event from two sources is listed once
When a link is added or a feed item arrives, and the group already holds an upcoming event or nearby item with the same start instant and the same name ignoring case, spacing and punctuation, Loop SHALL treat them as one and SHALL NOT list both.

#### Scenario: Link matches a nearby item
- **WHEN** a member pastes a Posh link for "Harvard vs Yale Day Party" at Saturday 14:00 and the Nearby list holds an item with that name and start
- **THEN** one group event exists with the Posh link, and the nearby item is no longer listed

#### Scenario: Feed item matches a linked event
- **WHEN** a feed read brings an item whose name and start match an event a member already linked
- **THEN** no nearby item is listed for it

### Requirement: Turning a feed off or removing it
Turning a feed off SHALL stop its reads and remove its items from the Nearby list. Group events already made from it SHALL be kept.

#### Scenario: Feed turned off
- **WHEN** an organizer turns off a feed with five nearby items, one of which became a group event
- **THEN** the Nearby list loses the four remaining items and the group event stays
