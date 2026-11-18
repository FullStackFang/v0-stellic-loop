## ADDED Requirements

### Requirement: A person starts a campus plan from an event link
On the campus "Post a plan" page, a signed-in person on their own campus SHALL be able to paste the link of an event page and have the form filled from it. Loop SHALL read the page only on the sites it reads for groups (Luma, Posh event pages, Eventbrite), through the same guarded fetch, and SHALL fill the title, the start and end on the campus's clock, the place, and "Hosted by" the organizer as the line about it. Reading SHALL save nothing: the person checks the form and posts it. The stored link SHALL drop the query and fragment on those sites, and a link typed without "https://" SHALL get it.

#### Scenario: Luma link fills the form
- **WHEN** a Cornell student pastes a Luma link whose page names "Special Special 10 Year Celebration" on Thursday 23:00 UTC at "40 E 1st St"
- **THEN** the form holds that title, Thursday 18:00 as the start, the place, "Hosted by Special Special", and shows the link that will be kept, and nothing is on the list until they press "Post it"

#### Scenario: A site Loop does not read
- **WHEN** a person pastes a Partiful link
- **THEN** no request is made, the link is kept, what they had typed stays, and the form says to fill in the rest

#### Scenario: A page that cannot be used
- **WHEN** the page is gone or cancelled, has already started, or starts more than 14 days from now
- **THEN** nothing is filled and the form says which of those it is

#### Scenario: Signed out, or another school
- **WHEN** the read is asked for by nobody signed in, or for a campus the person may not use
- **THEN** it is refused and no page is requested

### Requirement: A posted plan keeps its link, and one link is one plan
A plan posted with a link SHALL be an ordinary posted plan (the three-plan and 14-day rules apply) that keeps the link, and the list SHALL show the event page's site as a link in the plan's details. When a plan that has not ended on the same campus already carries the link, posting it SHALL add nothing and count the person in on that plan; this SHALL NOT count against their three plans. A cancelled plan frees its link. A plan the admin hid SHALL NOT be replaced by posting its link again. Changing a plan SHALL leave its link as it is. The organizer named on the page SHALL NOT be stored as the plan's host, so a posted plan can never match a reward that rides on a host's events.

#### Scenario: Second person pastes the same link
- **WHEN** Ana has posted a plan from a Luma link and Ben posts the same link with other tracking on it
- **THEN** the list still has one plan, with Ana's wording, and both are counted in

#### Scenario: Hidden by the admin
- **WHEN** the admin hid a linked plan and someone posts its link again
- **THEN** it is refused with "This event was taken off the list."

#### Scenario: Event page on the list
- **WHEN** a signed-in person opens the details of a plan posted from a Luma link
- **THEN** the details carry a link named "lu.ma" that opens the event page in a new tab
