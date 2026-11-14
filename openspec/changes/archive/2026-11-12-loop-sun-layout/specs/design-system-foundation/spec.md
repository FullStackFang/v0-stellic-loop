## ADDED Requirements

### Requirement: Scope is the Quorum prototype only
The requirements of this capability SHALL apply only to `public/demo/quorum.html` and the other static demos under `public/demo/`. App pages under `app/` SHALL follow `sun-visual-system` and SHALL NOT load Source Serif 4, Geist or the v5 tokens.

#### Scenario: App fonts
- **WHEN** any app page under `/b/` or `/p/` loads
- **THEN** the only web font requested is Archivo and no `--carnelian` or `--paper-1` token is defined on the page
