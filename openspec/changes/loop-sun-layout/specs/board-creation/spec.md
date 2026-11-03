## MODIFIED Requirements

### Requirement: New screens use only the v5 system
The start-a-board form, the empty space state and every other screen or state in the app SHALL be built only from the Sun system in `app/globals.css` as defined by `sun-visual-system`, using class names that exist in `public/demo/mockups-sun.html` or `public/demo/mockups-sun-pages.html` wherever the mockup has the element. No emoji. Native date pickers SHALL NOT appear; the day is chosen from window-day chips.

#### Scenario: Only mockup classes
- **WHEN** the rendering tests render the start-a-board form, the empty space, a plan row and the plan page
- **THEN** every class name they emit for an element the mockups contain appears as a selector in one of the two Sun mockups

#### Scenario: Empty space
- **WHEN** a person opens a space with no proposals
- **THEN** the page shows the space name, the line "Nothing posted yet. Post the first intent and paste the link in the group.", and the pinned "Post an intent", lit on paper with no sun
