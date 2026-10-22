# ADR-0000: <Title>

- Date: YYYY-MM-DD
- Status: proposed | accepted | superseded by ADR-XXXX

## Context

What is the problem or decision being made, and why now? Reference the relevant
seam (`docs/12-CHANGE-PLAYBOOK.md`) and any interview decision (`docs/10`).

## Decision

What we will do, stated precisely.

## Consequences

Positive and negative effects; what this makes easier and harder.

## Impact checklist

- [ ] sim systems/behaviors/registries touched
- [ ] content schemas (`docs/04`) — bump `schemaVersion` + migration?
- [ ] snapshot schema / network protocol — bump `PROTOCOL_VERSION`
- [ ] save data — add a migration in `client/save/migrations`
- [ ] UI components
- [ ] tests (new + updated), determinism test still green
- [ ] docs updated (02/03/04/11 as needed)

## Alternatives

Other options considered and why they were rejected.

## Migration

How existing data/saves/content transition to the new shape.
