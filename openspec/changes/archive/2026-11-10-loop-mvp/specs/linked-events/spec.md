# Spec Delta

## Purpose

Lets a loop sit beside an existing event page (Luma, Partiful, CampusGroups, anything) by storing a plain link and showing a cached preview of it, without ever depending on that page being reachable.

## ADDED Requirements

### Requirement: Loop and occurrence carry a linked URL
A loop SHALL have an optional default linked URL and each occurrence SHALL be able to override it. The effective URL for an occurrence is its own URL if set, else the loop's.

#### Scenario: Override this week
- **WHEN** the organizer sets a URL on this Thursday's occurrence only
- **THEN** this Thursday previews that URL and next Thursday previews the loop default

### Requirement: Preview fetched and cached on save
When a URL is saved or "Refresh preview" is pressed, the system SHALL fetch its Open Graph title, image, and description, plus start time and location from schema.org Event data when present, and cache them by URL with a fetch time.

#### Scenario: Luma page
- **WHEN** the organizer saves a Luma event URL
- **THEN** the cached preview holds the event's title and image, and time and location if the page exposes Event data

#### Scenario: Page without metadata
- **WHEN** the URL returns a page with no Open Graph tags
- **THEN** the preview falls back to the page's `<title>` and host name, and no error is shown to members

#### Scenario: Fetch fails
- **WHEN** the fetch times out or errors
- **THEN** any previous cache for that URL is kept, the error is recorded, and the organizer sees "preview unavailable"

### Requirement: Preview never blocks render
Tap-in and member pages SHALL render from the cache only and SHALL never fetch the linked URL during a page request.

#### Scenario: Linked site down
- **WHEN** the linked site is unreachable and a member opens their page
- **THEN** the page renders immediately with the last cached preview, or the raw link if nothing was ever cached

### Requirement: Fetch limits and network safety
Preview fetches SHALL accept only `http` and `https`, time out after 8 seconds, follow at most 3 redirects, read at most 1 MB, and SHALL refuse any URL or redirect target whose host resolves to a loopback, private, or link-local address.

#### Scenario: Non-http URL
- **WHEN** the organizer saves `javascript:alert(1)`
- **THEN** the save is rejected with a validation message

#### Scenario: Private address
- **WHEN** the organizer saves a URL whose host resolves to `10.0.0.5`
- **THEN** no fetch is made and the save is rejected
