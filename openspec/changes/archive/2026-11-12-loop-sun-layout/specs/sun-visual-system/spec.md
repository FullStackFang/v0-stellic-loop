## ADDED Requirements

### Requirement: One typeface, ink on paper
Every app page SHALL use Archivo only, as a variable font with the width axis, from `next/font/google` or a self-hosted file. Body text SHALL be ink `#1a1612` on paper `#fffdf7`; the count SHALL be set at width 62 weight 900, titles at width 96 weight 900 uppercase, the wordmark at width 125. Pure `#000` and `#fff` SHALL NOT appear. No emoji SHALL appear anywhere.

#### Scenario: Count at condensed width
- **WHEN** the plan page renders a count of 3
- **THEN** the numeral is Archivo at `font-variation-settings: 'wdth' 62`, weight 900, tabular, with no other font family loaded on the page

### Requirement: Light comes from the plan, not the viewer
A page or row SHALL be lit from the plan's hour and that day's sky, computed by `lib/solar.ts`: a tint for the surface, a foreground (ink or paper, whichever has the better WCAG contrast against the tint), a hard shadow offset and colour, and the sun and moon positions. The sun SHALL sit at the top centre at noon and the moon opposite; both SHALL move on one wheel that turns once a day and leave through the page edges; a disc SHALL fade out just below the horizon. Whichever of the two is higher SHALL cast the shadows: longest and faint at the horizon, shortest at the top, never longer than twelve pixels. The lighting SHALL be rendered as inline CSS custom properties so the page is lit without JavaScript.

#### Scenario: Noon
- **WHEN** a plan is at 12:00 with a clear sky
- **THEN** the tint is `#ffe14a`, the foreground is ink, the sun disc is at the top centre, the moon is below the page, and the shadow is 0px across and about 5px down

#### Scenario: Evening
- **WHEN** a plan is at 18:00 with a clear sky
- **THEN** the tint is `#ff8a66`, the foreground is ink, a sliver of the sun shows at the right edge and a sliver of the moon at the left edge, and the shadow points left

#### Scenario: Night
- **WHEN** a plan is at 22:00 with a clear sky
- **THEN** the tint is near `#1b1e38`, the foreground is paper, the moon is a crescent on the upper left, the sun is not visible, stars are visible, and body text carries a thin tint knockout where the moon can pass behind it

#### Scenario: No JavaScript
- **WHEN** the plan page is fetched with JavaScript disabled
- **THEN** the surface tint, count shadow and sun position are correct in the server HTML

### Requirement: Weather changes the light
A sky of `cloudy` SHALL halve the shadow length, grey the shadow, mix the tint half way toward `#d8d1c2` (toward `#2a2d3d` at night) and show a flat cloud with the same hard shadow in front of the light. A sky of `rain` SHALL shorten the shadow to two pixels, mix the tint toward `#9fb0c2` (toward `#273243` at night), dim the disc, and draw falling drops only when JavaScript runs and motion is not reduced. Stars SHALL NOT show under cloud or rain.

#### Scenario: Rain at eleven
- **WHEN** a plan is at 11:00 with rain
- **THEN** the tint is cool grey-blue, the cloud is grey, the shadow offset is 2px, and the drops animate

#### Scenario: Reduced motion
- **WHEN** the viewer prefers reduced motion
- **THEN** no drops fall, the cloud does not drift, and no transition runs on the wheel

### Requirement: Flat shadows everywhere
Every raised element (count numeral, faces, bars, forecast chip, cloud, the primary button, the opt-in box) SHALL use the page's hard shadow: offset by `--sx --sy`, no blur, colour `--shade`. There SHALL be no blurred shadow, gradient text, glass effect or side stripe on any app page. The primary button SHALL press into its own shadow on `:active`.

#### Scenario: Button press
- **WHEN** a person presses I'm in
- **THEN** the button translates by `(--sx, --sy)` and its shadow is removed for the duration of the press

### Requirement: Formed and didn't-form treatments
A formed plan SHALL show an ink button with the tint as its text colour, reading "You're in · <day>", with "Add to calendar" below. A plan that didn't form SHALL be flat `#dcd7cc`, SHALL show no sun, moon, cloud or shadow, and SHALL use a ghost button.

#### Scenario: Didn't form page
- **WHEN** a plan idled at 2 of 4
- **THEN** the page background is `#dcd7cc`, no disc is rendered, the count reads "2 of 4 · closed", and the only button is the ghost "Post it again"

### Requirement: Phone width first
Pages SHALL lay out for a 390px phone with 16px side gutters, with no horizontal scroll at any width from 320px, and SHALL keep the laptop phone-frame shell and the SiteNav menu beside it.

#### Scenario: Narrow phone
- **WHEN** the plan page renders at 320px wide
- **THEN** the title wraps, the count stays unclipped, and the page does not scroll horizontally
