// Progression: XP → level-up → offer (3 cards), and applying the chosen card.
// Passives grant stat bonuses through the modifier stack; weapons level via data.
import type { Registries } from "../registry";
import type { Offer, OfferOption } from "../types";
import type { World } from "../world";
import { refreshSynergies } from "./synergies";

export function registerProgression(reg: Registries): void {
  reg.systems.register("progression", progression);
}

function xpToNext(world: World, level: number): number {
  const curve = world.ruleset.xpCurve;
  if (level <= curve.length) return curve[level - 1];
  const last = curve[curve.length - 1];
  return Math.round(last * 1.2 ** (level - curve.length));
}

function progression(world: World): void {
  const needed = xpToNext(world, world.partyLevel);
  if (world.partyXp < needed) return;

  world.partyXp -= needed;
  world.partyLevel += 1;
  world.partyXpToNext = xpToNext(world, world.partyLevel);

  const players = world.stores.players;
  players.forEachAlive((slot) => {
    players.field("level")[slot] = world.partyLevel;
    players.field("xp")[slot] = world.partyXp;
    players.field("xpToNext")[slot] = world.partyXpToNext;
  });
  refreshGrowth(world);

  // Every player levels up together and picks their own cards.
  players.forEachAlive((slot) => {
    world.emit({ type: "level-up", playerId: slot, level: world.partyLevel });
    world.queueOffer(buildLevelUpOffer(world, slot));
  });
}

function buildLevelUpOffer(world: World, playerId: number): Offer {
  const weapons = world.stores.weapons;
  const passives = world.stores.passives;

  const ownedWeapons = new Map<number, number>(); // defIndex -> level
  const ownedPassives = new Map<number, number>();
  weapons.forEachAlive((slot) => {
    if (weapons.field("owner")[slot] === playerId) {
      ownedWeapons.set(weapons.field("defIndex")[slot], weapons.field("level")[slot]);
    }
  });
  passives.forEachAlive((slot) => {
    if (passives.field("owner")[slot] === playerId) {
      ownedPassives.set(passives.field("defIndex")[slot], passives.field("level")[slot]);
    }
  });

  const options: OfferOption[] = [];
  const banished = world.banishedOptions[playerId] ?? new Set<string>();
  const consider = (option: OfferOption): void => {
    if (!banished.has(option.optionId)) options.push(option);
  };

  if (ownedWeapons.size < world.num("loadout.weaponSlots")) {
    for (let i = 0; i < world.content.weapons.length; i++) {
      if (ownedWeapons.has(i)) continue;
      if (world.content.weapons[i].isEvolved) continue;
      consider({
        optionId: `new-w:${i}`,
        ref: { type: "weapon", id: world.content.weapons[i].id },
      });
    }
  }
  if (ownedPassives.size < world.num("loadout.passiveSlots")) {
    for (let i = 0; i < world.content.passives.length; i++) {
      if (ownedPassives.has(i)) continue;
      consider({
        optionId: `new-p:${i}`,
        ref: { type: "passive", id: world.content.passives[i].id },
      });
    }
  }
  for (const [defIndex, level] of ownedWeapons) {
    const def = world.content.weapons[defIndex];
    if (def && level < def.maxLevel) {
      consider({
        optionId: `up-w:${defIndex}`,
        ref: { type: "weapon", id: def.id },
        level: level + 1,
      });
    }
  }
  for (const [defIndex, level] of ownedPassives) {
    const def = world.content.passives[defIndex];
    if (def && level < def.maxLevel) {
      consider({
        optionId: `up-p:${defIndex}`,
        ref: { type: "passive", id: def.id },
        level: level + 1,
      });
    }
  }

  // Fallback so a level-up never produces an empty offer (docs/13 §6).
  if (options.length === 0) {
    options.push({ optionId: "fallback-heal", ref: { type: "heal", id: "heal" } });
  }

  const chosen = world.rng.shuffle(options).slice(0, world.num("levelUp.choices"));
  const tokens = world.offerTokens(playerId);

  return {
    id: `offer-${world.tick}`,
    playerId,
    kind: "levelUp",
    options: chosen,
    rerolls: tokens.rerolls,
    skips: tokens.skips,
    banishes: tokens.banishes,
  };
}

/** Chest offer: evolutions (if available) + item upgrades, 1/3/5 items by luck. */
export function buildChestOffer(world: World, playerId: number): Offer {
  const weapons = world.stores.weapons;
  const passives = world.stores.passives;

  const ownedWeapons = new Map<number, number>();
  const ownedPassives = new Map<number, number>();
  const ownedPassiveIds = new Set<string>();
  weapons.forEachAlive((slot) => {
    if (weapons.field("owner")[slot] === playerId) {
      ownedWeapons.set(weapons.field("defIndex")[slot], weapons.field("level")[slot]);
    }
  });
  passives.forEachAlive((slot) => {
    if (passives.field("owner")[slot] === playerId) {
      ownedPassives.set(passives.field("defIndex")[slot], passives.field("level")[slot]);
      const def = world.content.passives[passives.field("defIndex")[slot]];
      if (def) ownedPassiveIds.add(def.id);
    }
  });

  const options: OfferOption[] = [];
  const banished = world.banishedOptions[playerId] ?? new Set<string>();
  const consider = (option: OfferOption): void => {
    if (!banished.has(option.optionId)) options.push(option);
  };

  for (const [defIndex, level] of ownedWeapons) {
    const def = world.content.weapons[defIndex];
    if (!def?.evolution) continue;
    if (level < def.maxLevel) continue;
    if (!ownedPassiveIds.has(def.evolution.requiresPassive)) continue;
    consider({
      optionId: `evolve:${defIndex}`,
      ref: { type: "weapon", id: def.evolution.evolvesTo },
      isEvolution: true,
    });
  }
  for (const [defIndex, level] of ownedWeapons) {
    const def = world.content.weapons[defIndex];
    if (def && level < def.maxLevel) {
      consider({
        optionId: `up-w:${defIndex}`,
        ref: { type: "weapon", id: def.id },
        level: level + 1,
      });
    }
  }
  for (const [defIndex, level] of ownedPassives) {
    const def = world.content.passives[defIndex];
    if (def && level < def.maxLevel) {
      consider({
        optionId: `up-p:${defIndex}`,
        ref: { type: "passive", id: def.id },
        level: level + 1,
      });
    }
  }

  const luck = world.playerStat(playerId, "luck", 0);
  const itemCount = luck >= 0.3 ? 5 : luck >= 0.1 ? 3 : 1;
  if (options.length === 0) {
    options.push({ optionId: "fallback-gold", ref: { type: "gold", id: "gold" } });
  }
  const chosen = world.rng.shuffle(options).slice(0, itemCount);
  const tokens = world.offerTokens(playerId);

  return {
    id: `chest-${world.tick}`,
    playerId,
    kind: "chest",
    options: chosen,
    rerolls: tokens.rerolls,
    skips: tokens.skips,
    banishes: tokens.banishes,
  };
}

function evolveWeapon(world: World, playerId: number, evolvedId: string): void {
  const evolvedIndex = world.content.weapons.findIndex((w) => w.id === evolvedId);
  if (evolvedIndex < 0) return;
  const weapons = world.stores.weapons;
  let sourceSlot = -1;
  weapons.forEachAlive((slot) => {
    if (weapons.field("owner")[slot] !== playerId) return;
    const def = world.content.weapons[weapons.field("defIndex")[slot]];
    if (def?.evolution?.evolvesTo === evolvedId) sourceSlot = slot;
  });
  if (sourceSlot < 0) return;
  weapons.field("defIndex")[sourceSlot] = evolvedIndex;
  weapons.field("level")[sourceSlot] = 1;
  weapons.field("cooldown")[sourceSlot] = 0;
}

/** Apply the chosen offer option, then refresh passive-derived modifiers. */
export function applyOfferOption(world: World, playerId: number, choiceIndex: number): void {
  const offer = world.pendingOffers().find((o) => o.playerId === playerId);
  if (!offer) return;
  const option = offer.options[choiceIndex];

  try {
    if (!option) return;
    const ref = option.ref;
    if (ref.type === "weapon") {
      if (option.isEvolution) {
        evolveWeapon(world, playerId, ref.id);
      } else {
        const defIndex = world.content.weapons.findIndex((w) => w.id === ref.id);
        if (defIndex >= 0) {
          if (option.level === undefined) addWeapon(world, playerId, defIndex);
          else upgradeWeapon(world, playerId, defIndex, option.level);
        }
      }
    } else if (ref.type === "passive") {
      const defIndex = world.content.passives.findIndex((p) => p.id === ref.id);
      if (defIndex >= 0) {
        if (option.level === undefined) addPassive(world, playerId, defIndex);
        else upgradePassive(world, playerId, defIndex, option.level);
        refreshPassiveModifiers(world);
      }
    } else if (ref.type === "heal") {
      const players = world.stores.players;
      const max = players.field("maxHp")[playerId];
      players.field("hp")[playerId] = Math.min(max, players.field("hp")[playerId] + max * 0.25);
    } else if (ref.type === "gold") {
      world.stores.players.field("gold")[playerId] += 10;
    }

    refreshSynergies(world);
  } finally {
    // Always resolve the offer so a bad choice can never wedge the pause.
    world.clearOffer(playerId);
  }
}

/** Spend one reroll token to redraw the current offer. */
export function rerollOffer(world: World, playerId: number): boolean {
  const offer = world.pendingOffers().find((o) => o.playerId === playerId);
  if (!offer) return false;
  if ((world.rerolls[playerId] ?? 0) <= 0) return false;
  world.rerolls[playerId] -= 1;
  const rebuilt =
    offer.kind === "chest" ? buildChestOffer(world, playerId) : buildLevelUpOffer(world, playerId);
  offer.options = rebuilt.options;
  offer.rerolls = rebuilt.rerolls;
  offer.skips = rebuilt.skips;
  offer.banishes = rebuilt.banishes;
  return true;
}

/** Spend one skip token to dismiss the current offer without picking. */
export function skipOffer(world: World, playerId: number): boolean {
  const offer = world.pendingOffers().find((o) => o.playerId === playerId);
  if (!offer) return false;
  if ((world.skips[playerId] ?? 0) <= 0) return false;
  world.skips[playerId] -= 1;
  world.clearOffer(playerId);
  return true;
}

/** Spend one banish token to remove an option from this run's offers, then redraw. */
export function banishOfferOption(world: World, playerId: number, optionIndex: number): boolean {
  const offer = world.pendingOffers().find((o) => o.playerId === playerId);
  if (!offer) return false;
  if ((world.banishes[playerId] ?? 0) <= 0) return false;
  const option = offer.options[optionIndex];
  if (!option) return false;
  if (option.optionId.startsWith("fallback-")) return false;
  world.banishes[playerId] -= 1;
  world.banishedOptions[playerId]?.add(option.optionId);
  const rebuilt =
    offer.kind === "chest" ? buildChestOffer(world, playerId) : buildLevelUpOffer(world, playerId);
  offer.options = rebuilt.options;
  offer.rerolls = rebuilt.rerolls;
  offer.skips = rebuilt.skips;
  offer.banishes = rebuilt.banishes;
  return true;
}

function addWeapon(world: World, playerId: number, defIndex: number): void {
  const slot = world.stores.weapons.alloc();
  if (slot < 0) return;
  world.stores.weapons.field("owner")[slot] = playerId;
  world.stores.weapons.field("defIndex")[slot] = defIndex;
  world.stores.weapons.field("cooldown")[slot] = 0;
  world.stores.weapons.field("level")[slot] = 1;
}

function upgradeWeapon(world: World, playerId: number, defIndex: number, level: number): void {
  const weapons = world.stores.weapons;
  weapons.forEachAlive((slot) => {
    if (weapons.field("owner")[slot] === playerId && weapons.field("defIndex")[slot] === defIndex) {
      weapons.field("level")[slot] = level;
    }
  });
}

function addPassive(world: World, playerId: number, defIndex: number): void {
  const slot = world.stores.passives.alloc();
  if (slot < 0) return;
  world.stores.passives.field("owner")[slot] = playerId;
  world.stores.passives.field("defIndex")[slot] = defIndex;
  world.stores.passives.field("level")[slot] = 1;
}

function upgradePassive(world: World, playerId: number, defIndex: number, level: number): void {
  const passives = world.stores.passives;
  passives.forEachAlive((slot) => {
    if (
      passives.field("owner")[slot] === playerId &&
      passives.field("defIndex")[slot] === defIndex
    ) {
      passives.field("level")[slot] = level;
    }
  });
}

/** Re-apply each player's passive modifiers and sync their maxHp. */
function refreshPassiveModifiers(world: World): void {
  const passives = world.stores.passives;
  for (let p = 0; p < world.playerModifiers.length; p++) {
    const mods = world.playerModifiers[p];
    mods.removeSourcePrefix("passive:");
    passives.forEachAlive((slot) => {
      if (passives.field("owner")[slot] !== p) return;
      const def = world.content.passives[passives.field("defIndex")[slot]];
      if (!def) return;
      const level = passives.field("level")[slot];
      for (const [key, amount] of Object.entries(def.perLevel)) {
        mods.add(key, { op: "add", value: amount * level, source: `passive:${def.id}` });
      }
    });
    world.syncPlayerMaxHp(p);
  }
}

/** Re-apply each player's character growth bonuses (per-player stacks). */
function refreshGrowth(world: World): void {
  const players = world.stores.players;
  for (let p = 0; p < world.playerModifiers.length; p++) {
    const mods = world.playerModifiers[p];
    mods.removeSource("growth");
    const growth = world.playerCharacters[p]?.growth;
    if (growth) {
      const stacks = Math.floor(players.field("level")[p] / growth.everyLevels);
      if (stacks > 0) {
        for (const [key, amount] of Object.entries(growth.mods)) {
          mods.add(key, { op: "add", value: amount * stacks, source: "growth" });
        }
      }
    }
    world.syncPlayerMaxHp(p);
  }
}
