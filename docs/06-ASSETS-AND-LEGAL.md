# 06 — Assets & Legal

Read this before touching art, audio, names or text.

## Context
This is a **private, non-commercial fan project** for a small group of friends, inspired by League of
Legends (© Riot Games). Riot publishes a policy for fan projects ("Legal Jibber Jabber") that, in short,
permits non-commercial fan content that is clearly unofficial, uses no ripped client assets, and does not
imply endorsement. Re-read the current policy before sharing the game beyond close friends. This doc is
engineering guidance, not legal advice.

## Vampire Survivors as the feel reference
The game follows the *genre structure and feel* of Vampire Survivors (© poncle). Game mechanics and genre
conventions are free to reuse, but its **art, characters, names, item/weapon names, text, music, sound effects
and code are not**. Do not recreate its sprites, UI art, logos or soundtrack, and don't reuse its distinctive
proper names. Use generic behavior ids (`sweep`, `orbit`, `aura`…) and original or League-themed content.
Don't present the game as affiliated with it.

## Rules for the agent
1. **Never commit copyrighted or ripped assets** — no splash art, champion models/icons, sounds, or music
   extracted from the League client or scraped from the web. Not even "temporarily".
2. **Use placeholders by default.** `client/src/assets/placeholder.ts` generates **pixel-art sprites**
   procedurally (16×16-grid silhouettes by enemy size/behavior, palette swaps per stage, initial-letter
   portraits, a bitmap pixel font) so the game looks classic and is fully playable with zero external art.
3. **Real art is the user's responsibility and stays local.** The user may drop their own files in
   `assets/local/` (gitignored). The loader prefers a file from `assets/local/` if the manifest key exists
   there, else falls back to the placeholder. Nothing in `assets/local/` is ever committed or deployed
   to a public host.
4. **Content names are data.** Champion/enemy/item names and flavour text live only in
   `packages/content` (League names in the `lol-pack` content pack; i18n locale files hold display strings).
   Keep the engine and file/package names generic ("marksman", "dragon-boss"). Synergies and effects match by
   tags, never by champion names.
5. **No in-game monetization of any kind**, no ads, no paid tiers, no donation links.
6. **Include a disclaimer** in the main menu footer and README: "Unofficial fan project. Not affiliated
   with or endorsed by Riot Games. League of Legends and related names are trademarks of Riot Games, Inc."
7. **Do not draw or generate artwork of existing champions.** Placeholder art is abstract/generic.
8. **Audio**: only CC0/public-domain or self-generated (WebAudio synthesis). Record the source and licence
   of every audio/art file in `ASSETS.md` (`file | source | licence`).

## Manifest (how art is referenced)
```ts
// assets/manifest.json — keys only, no paths to committed copyrighted files
{ "champion/marksman-01/sprite": { "placeholder": "gen:marksman", "local": "local/marksman-01.png" } }
```
Loader order: `assets/local/<file>` → placeholder generator → magenta debug square (and a console warning).

## If the project becomes public later
Replace League names/art with original ones using the same data schema. That is exactly why content is
data-only: swapping the roster should require zero engine changes.

## Open-source licence of this repo
Choose deliberately; for a private friends project leave the repo **private**. If you ever publish it,
add a non-commercial licence (e.g., PolyForm Noncommercial) and keep `assets/local/` out of it.

## Reference project note
The inspiration (a Pokémon survivor game on GitHub) uses a non-commercial licence and third-party sprite
licences with attribution. Do **not** copy its code or assets; build from these docs. Take only ideas
(genre conventions), which are not protected.
