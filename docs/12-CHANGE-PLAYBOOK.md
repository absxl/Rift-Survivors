# 12 — Change Playbook (how to survive radical redesigns)

The user expects to change the game fundamentally over time (new level-up system, different item model,
new resources, new modes). The architecture is built around **seams** so that such changes are local.

## The seams (where change is supposed to happen)
| Seam | Lives in | Change by |
|---|---|---|
| Ruleset (which systems run, in what order, with what config) | `content/rulesets` | new/edited `RulesetDef` |
| Systems pipeline (progression, spawning, economy, combat…) | `sim/systems` + registry | swap/add a `System` |
| Behaviors (weapon, enemy, boss) | `sim/behaviors` + registry | register a behavior |
| Effects (trigger/condition/action) | `sim/effects` + registries | register an entry |
| Modifiers & rule overrides | `sim/modifiers` | data + rule key |
| Synergies & reactions | `content/synergies` | data |
| Content packs | `content/packs/*` | add/override a pack |
| Stores & snapshot codec | `sim/schema` | edit schema (codec is generated) |
| UI views (cards, HUD, tooltips) | `client/ui` | data-driven components keyed by event/offer type |
| Persistence | `client/save`, migrations | versioned + migrations |
| Network protocol | `shared/protocol` | versioned handshake |

If a requested change does not fit a seam, **do not hack around it**: write an ADR proposing a new seam,
ask the user, then implement.

## Process for any non-trivial change
1. **Restate** the requested change in one paragraph and map it to seams (table above).
2. **Interview** the user using the relevant round in `09-DESIGN-INTERVIEW.md` if the design is unclear.
3. **ADR**: add `docs/adr/NNNN-title.md` (Context, Decision, Consequences, Alternatives, Migration).
   Update `10-DESIGN-DECISIONS.md` (mark old decisions `superseded`).
4. **Impact checklist** (write it in the ADR):
   - [ ] sim systems/behaviors/registries touched
   - [ ] content schemas (`04`) — bump `schemaVersion`, write a content migration if old data must still load
   - [ ] snapshot schema / network protocol — bump `PROTOCOL_VERSION`
   - [ ] save data — add a migration in `client/save/migrations`
   - [ ] UI components
   - [ ] tests (new + updated), determinism test still passes
   - [ ] docs updated (02/03/04/11 as needed)
5. **Implement behind a flag** when large: `RulesetDef.features.<name>` so the old and new behavior can
   coexist until the new one is proven, then delete the old path in a follow-up commit.
6. **Run**: typecheck, lint, tests, determinism test, manual playtest. Record notes in the roadmap.

## Worked examples (recipes the agent can follow)

### A0. "Make it less classic: add a manual dash / aimed weapon"
- Input is data-driven: add a new `input` system variant and a rule `controls.dash` in the ruleset; weapon
  behaviors read an `aimDirection` from the player store (classic = facing direction). Existing weapons are
  untouched. Log the deviation from the baseline in `10` as a new decision that supersedes D-003.

### A. "Replace instant level-up cards with a shop between waves (Brotato-style)"
- Add `progression/wave-shop` system implementing the `ProgressionSystem` interface
  (`onXp`, `onLevelUp`, `offerChoices`, `applyChoice`).
- Change `ruleset.progression` from `"xp-cards"` to `"wave-shop"`; waves get explicit end events.
- UI: the existing "choice offer" modal is data-driven by `Offer` objects, so only a new offer layout is needed.
- Content: items already carry `cost` and tags — no change. Old system stays selectable for A/B playtests.

### B. "Add a mana/energy resource to champions"
- Add `resources` to the champion schema (optional field, default none) + `Stats` entries via the stat
  registry; add an `onWeaponFire` cost action and a `resource-regen` system to the ruleset pipeline.
- Existing champions are unaffected (field optional) → no content migration.

### C. "Switch from endless field to room-by-room dungeon"
- New `world/dungeon` generator registered under `ruleset.world`; spawn director consumes a `RoomScript`
  instead of a timeline. Snapshot adds `roomId` via schema (codec regenerated).

### D. "Make player leveling per-weapon instead of per-character"
- Swap the `ProgressionSystem`; modifiers/effects are unaffected because they key on tags and sources.

### E. "Ship with original characters instead of League ones"
- Replace/disable the `lol-pack` content pack, enable `original-pack`. Zero engine changes
  (this is why names live only in content; see `06-ASSETS-AND-LEGAL.md`).

### F. "Add PvP or competitive mode"
- New `RulesetDef` (`pvp-arena`) with its own pipeline (no spawner; `damage.friendlyFire` rule override
  off→on; scoring system). Needs a decision on netcode fairness → interview R7 + ADR.

## Rules that keep change cheap
1. **Engine knows no content.** Ids/names appear only in `packages/content`.
2. **Everything numeric is a stat or a param** reachable by the modifier stack; avoid magic constants —
   put tunables in the ruleset or content with a name.
3. **Interfaces before implementations** for each swappable system (`ProgressionSystem`, `SpawnDirector`,
   `EconomySystem`, `World`), with a contract test suite that every implementation must pass.
4. **Schemas are versioned** (`schemaVersion` in content packs, `version` in saves, `PROTOCOL_VERSION`
   on the wire). Loading older data runs migrations; incompatible protocol is rejected with a clear message.
5. **Snapshot codec is generated from the schema** (`sim/schema`), so adding an entity field is a one-line
   change, not a manual edit in encoder, decoder and renderer.
6. **UI never contains rules.** It renders `Offer`, `Snapshot` and `SimEvent` data. Rules are in the sim.
7. **Small deletions are good.** When a mechanic is replaced, delete the old code after one release;
   don't let dead rulesets accumulate (keep at most 2 selectable progression systems).
8. **i18n from day one**: all player-visible strings come from `locales/<lang>.json` keyed by id
   (content `name`/`description` fields are keys). Decide languages in interview R9.
9. **Every change leaves the game playable** and the determinism test green.

## Fitness checks (run in CI)
- `no-content-in-engine`: grep test failing if any content id/name appears in `packages/sim/src`.
- `registry-complete`: every id referenced by content exists in a registry.
- `determinism`: 5k-tick double run equality, per ruleset.
- `save-migration`: fixtures of every old save version load and migrate.
- `protocol-compat`: encoded fixture messages of the previous protocol version are rejected cleanly.
