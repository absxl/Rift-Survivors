// Progression: XP → level-up → offer (3 cards), and applying the chosen card.
// Passives grant stat bonuses through the modifier stack; abilities level via data.
import type { Registries } from "../registry";
import type { Offer, OfferOption } from "../types";
import type { World } from "../world";
import { refreshSynergies } from "./synergies";

/** Repeatable direct stat training cards (one is guaranteed in every level-up). */
const TRAININGS: { key: string; amount: number }[] = [
  { key: "growth", amount: 0.05 },
  { key: "maxHp", amount: 0.1 },
  { key: "regen", amount: 0.1 },
  { key: "greed", amount: 0.05 },
  { key: "resist", amount: 0.03 },
  { key: "might", amount: 0.05 },
  { key: "cooldown", amount: 0.04 },
  { key: "area", amount: 0.05 },
  { key: "moveSpeed", amount: 0.05 },
  { key: "magnet", amount: 0.1 },
  { key: "armor", amount: 1 },
  { key: "luck", amount: 0.05 },
  { key: "projectileSpeed", amount: 0.05 },
  { key: "duration", amount: 0.05 },
  { key: "pierce", amount: 1 },
  { key: "knockback", amount: 0.1 },
  { key: "lifesteal", amount: 0.01 },
];

export function registerProgression(reg: Registries): void {
  reg.systems.register("progression", progression);
}

function xpToNext(world: World, level: number): number {
  const curve = world.ruleset.xpCurve;
  if (level <= curve.length) return curve[level - 1];
  const last = curve[curve.length - 1];
  // After the explicit table, grow linearly (much gentler than the old x1.2).
  return last + world.num("xp.growthPerLevel") * (level - curve.length);
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
  const abilities = world.stores.abilities;
  const passives = world.stores.passives;

  const ownedAbilities = new Map<number, number>(); // defIndex -> level
  const ownedPassives = new Map<number, number>();
  const ownedPassiveIds = new Set<string>();
  abilities.forEachAlive((slot) => {
    if (abilities.field("owner")[slot] === playerId) {
      const defIndex = abilities.field("defIndex")[slot];
      ownedAbilities.set(defIndex, abilities.field("level")[slot]);
    }
  });
  passives.forEachAlive((slot) => {
    if (passives.field("owner")[slot] === playerId) {
      const defIndex = passives.field("defIndex")[slot];
      ownedPassives.set(defIndex, passives.field("level")[slot]);
      const def = world.content.passives[defIndex];
      if (def) ownedPassiveIds.add(def.id);
    }
  });

  const options: OfferOption[] = [];
  const banished = world.banishedOptions[playerId] ?? new Set<string>();
  const consider = (option: OfferOption): void => {
    if (!banished.has(option.optionId)) options.push(option);
  };

  // One unified pool: any non-evolved ability can be learned or upgraded while
  // the player has free slots (champion kits and class fillers alike).
  if (ownedAbilities.size < world.num("loadout.abilitySlots")) {
    for (let i = 0; i < world.content.abilities.length; i++) {
      const def = world.content.abilities[i];
      if (ownedAbilities.has(i)) continue;
      if (def.isEvolved) continue;
      consider({
        optionId: `new-a:${i}`,
        ref: { type: "ability", id: def.id },
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
  for (const [defIndex, level] of ownedAbilities) {
    const def = world.content.abilities[defIndex];
    if (def && level < def.maxLevel) {
      consider({
        optionId: `up-a:${defIndex}`,
        ref: { type: "ability", id: def.id },
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

  // Evolutions are level-up cards; region chests are meta rewards.
  for (const option of evolutionOptions(world, ownedAbilities, ownedPassiveIds)) {
    consider(option);
  }

  // Fallback so a level-up never produces an empty offer (docs/13 §6).
  if (options.length === 0) {
    options.push({ optionId: "fallback-heal", ref: { type: "heal", id: "heal" } });
  }

  // A completed evolution recipe is always visible: pin it alongside the
  // guaranteed training card instead of letting the shuffle hide it.
  const maxChoices = world.num("levelUp.choices");
  const pinned = options.filter((o) => o.isEvolution).slice(0, maxChoices);
  const regular = options.filter((o) => !o.isEvolution);
  const chosen = world.rng.shuffle(regular).slice(0, Math.max(0, maxChoices - pinned.length));
  chosen.push(...pinned);
  chosen.push(trainingOption(world, playerId));
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

/** Build the guaranteed training card for a level-up. */
function trainingOption(world: World, playerId: number): OfferOption {
  const training = TRAININGS[world.rng.int(0, TRAININGS.length - 1)];
  return {
    optionId: `training:${training.key}:${playerId}`,
    ref: { type: "training", id: training.key },
    statKey: training.key,
    statAmount: training.amount,
  };
}

/** Evolution cards available when a ability is maxed and its passive is owned. */
function evolutionOptions(
  world: World,
  ownedAbilities: Map<number, number>,
  ownedPassiveIds: Set<string>,
): OfferOption[] {
  const options: OfferOption[] = [];
  for (const [defIndex, level] of ownedAbilities) {
    const def = world.content.abilities[defIndex];
    if (!def?.evolution) continue;
    if (level < def.maxLevel) continue;
    if (!ownedPassiveIds.has(def.evolution.requiresPassive)) continue;
    options.push({
      optionId: `evolve:${defIndex}`,
      ref: { type: "ability", id: def.evolution.evolvesTo },
      isEvolution: true,
    });
  }
  return options;
}

/** Chest offer: evolutions (if available) + item upgrades, 1/3/5 items by luck. */
export function buildChestOffer(world: World, playerId: number): Offer {
  const abilities = world.stores.abilities;
  const passives = world.stores.passives;

  const ownedAbilities = new Map<number, number>();
  const ownedPassives = new Map<number, number>();
  const ownedPassiveIds = new Set<string>();
  abilities.forEachAlive((slot) => {
    if (abilities.field("owner")[slot] === playerId) {
      ownedAbilities.set(abilities.field("defIndex")[slot], abilities.field("level")[slot]);
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

  for (const option of evolutionOptions(world, ownedAbilities, ownedPassiveIds)) {
    consider(option);
  }
  for (const [defIndex, level] of ownedAbilities) {
    const def = world.content.abilities[defIndex];
    if (def && level < def.maxLevel) {
      consider({
        optionId: `up-a:${defIndex}`,
        ref: { type: "ability", id: def.id },
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

function evolveAbility(world: World, playerId: number, evolvedId: string): void {
  const evolvedIndex = world.content.abilities.findIndex((w) => w.id === evolvedId);
  if (evolvedIndex < 0) return;
  const abilities = world.stores.abilities;
  let sourceSlot = -1;
  abilities.forEachAlive((slot) => {
    if (abilities.field("owner")[slot] !== playerId) return;
    const def = world.content.abilities[abilities.field("defIndex")[slot]];
    if (def?.evolution?.evolvesTo === evolvedId) sourceSlot = slot;
  });
  if (sourceSlot < 0) return;
  abilities.field("defIndex")[sourceSlot] = evolvedIndex;
  abilities.field("level")[sourceSlot] = 1;
  abilities.field("cooldown")[sourceSlot] = 0;
}

/** Apply the chosen offer option, then refresh passive-derived modifiers. */
export function applyOfferOption(world: World, playerId: number, choiceIndex: number): void {
  const offer = world.pendingOffers().find((o) => o.playerId === playerId);
  if (!offer) return;
  // An out-of-range choice is ignored, not consumed: only a real pick may
  // resolve the offer, or malformed input would dismiss it for free.
  if (!Number.isInteger(choiceIndex) || choiceIndex < 0) return;
  const option = offer.options[choiceIndex];
  if (!option) return;

  try {
    const ref = option.ref;
    if (ref.type === "ability") {
      if (option.isEvolution) {
        evolveAbility(world, playerId, ref.id);
      } else {
        const defIndex = world.content.abilities.findIndex((w) => w.id === ref.id);
        if (defIndex >= 0) {
          if (option.level === undefined) addAbility(world, playerId, defIndex);
          else upgradeAbility(world, playerId, defIndex, option.level);
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
    } else if (ref.type === "training") {
      const key = option.statKey;
      const amount = option.statAmount;
      if (key && amount !== undefined) {
        world.playerModifiers[playerId]?.add(key, {
          op: "add",
          value: amount,
          source: `training:${key}`,
        });
      }
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
  if (option.ref.type === "training") return false;
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

function addAbility(world: World, playerId: number, defIndex: number): void {
  const slot = world.stores.abilities.alloc();
  if (slot < 0) return;
  world.stores.abilities.field("owner")[slot] = playerId;
  world.stores.abilities.field("defIndex")[slot] = defIndex;
  world.stores.abilities.field("cooldown")[slot] = 0;
  world.stores.abilities.field("level")[slot] = 1;
}

function upgradeAbility(world: World, playerId: number, defIndex: number, level: number): void {
  const abilities = world.stores.abilities;
  abilities.forEachAlive((slot) => {
    if (
      abilities.field("owner")[slot] === playerId &&
      abilities.field("defIndex")[slot] === defIndex
    ) {
      abilities.field("level")[slot] = level;
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
