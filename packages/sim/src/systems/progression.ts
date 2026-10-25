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

  if (ownedWeapons.size < world.num("loadout.weaponSlots")) {
    for (let i = 0; i < world.content.weapons.length; i++) {
      if (ownedWeapons.has(i)) continue;
      if (world.content.weapons[i].isEvolved) continue;
      options.push({
        optionId: `new-w:${i}`,
        ref: { type: "weapon", id: world.content.weapons[i].id },
      });
    }
  }
  if (ownedPassives.size < world.num("loadout.passiveSlots")) {
    for (let i = 0; i < world.content.passives.length; i++) {
      if (ownedPassives.has(i)) continue;
      options.push({
        optionId: `new-p:${i}`,
        ref: { type: "passive", id: world.content.passives[i].id },
      });
    }
  }
  for (const [defIndex, level] of ownedWeapons) {
    const def = world.content.weapons[defIndex];
    if (def && level < def.maxLevel) {
      options.push({
        optionId: `up-w:${defIndex}`,
        ref: { type: "weapon", id: def.id },
        level: level + 1,
      });
    }
  }
  for (const [defIndex, level] of ownedPassives) {
    const def = world.content.passives[defIndex];
    if (def && level < def.maxLevel) {
      options.push({
        optionId: `up-p:${defIndex}`,
        ref: { type: "passive", id: def.id },
        level: level + 1,
      });
    }
  }

  const chosen = world.rng.shuffle(options).slice(0, world.num("levelUp.choices"));

  return {
    id: `offer-${world.tick}`,
    playerId,
    kind: "levelUp",
    options: chosen,
    rerolls: 0,
    skips: 0,
    banishes: 0,
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

  for (const [defIndex, level] of ownedWeapons) {
    const def = world.content.weapons[defIndex];
    if (!def?.evolution) continue;
    if (level < def.maxLevel) continue;
    if (!ownedPassiveIds.has(def.evolution.requiresPassive)) continue;
    options.push({
      optionId: `evolve:${defIndex}`,
      ref: { type: "weapon", id: def.evolution.evolvesTo },
      isEvolution: true,
    });
  }
  for (const [defIndex, level] of ownedWeapons) {
    const def = world.content.weapons[defIndex];
    if (def && level < def.maxLevel) {
      options.push({
        optionId: `up-w:${defIndex}`,
        ref: { type: "weapon", id: def.id },
        level: level + 1,
      });
    }
  }
  for (const [defIndex, level] of ownedPassives) {
    const def = world.content.passives[defIndex];
    if (def && level < def.maxLevel) {
      options.push({
        optionId: `up-p:${defIndex}`,
        ref: { type: "passive", id: def.id },
        level: level + 1,
      });
    }
  }

  const luck = world.stat("luck", 0);
  const itemCount = luck >= 0.3 ? 5 : luck >= 0.1 ? 3 : 1;
  const chosen = world.rng.shuffle(options).slice(0, itemCount);

  return {
    id: `chest-${world.tick}`,
    playerId,
    kind: "chest",
    options: chosen,
    rerolls: 0,
    skips: 0,
    banishes: 0,
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
  if (!option) return;

  const ref = option.ref;
  if (ref.type === "weapon") {
    if (option.isEvolution) {
      evolveWeapon(world, playerId, ref.id);
    } else {
      const defIndex = world.content.weapons.findIndex((w) => w.id === ref.id);
      if (defIndex < 0) return;
      if (option.level === undefined) addWeapon(world, playerId, defIndex);
      else upgradeWeapon(world, playerId, defIndex, option.level);
    }
  } else if (ref.type === "passive") {
    const defIndex = world.content.passives.findIndex((p) => p.id === ref.id);
    if (defIndex < 0) return;
    if (option.level === undefined) addPassive(world, playerId, defIndex);
    else upgradePassive(world, playerId, defIndex, option.level);
    refreshPassiveModifiers(world);
  }

  refreshSynergies(world);
  world.clearOffer(playerId);
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

/** Re-apply passive modifiers and sync derived player stats (maxHp). */
function refreshPassiveModifiers(world: World): void {
  world.modifiers.removeSourcePrefix("passive:");
  const passives = world.stores.passives;
  passives.forEachAlive((slot) => {
    const def = world.content.passives[passives.field("defIndex")[slot]];
    if (!def) return;
    const level = passives.field("level")[slot];
    for (const [key, amount] of Object.entries(def.perLevel)) {
      world.modifiers.add(key, { op: "add", value: amount * level, source: `passive:${def.id}` });
    }
  });

  const players = world.stores.players;
  players.forEachAlive((slot) => {
    const oldMax = players.field("maxHp")[slot];
    const newMax = 100 * world.stat("maxHp", 1);
    players.field("maxHp")[slot] = newMax;
    if (newMax > oldMax) {
      players.field("hp")[slot] = Math.min(newMax, players.field("hp")[slot] + (newMax - oldMax));
    }
  });
}

/** Re-apply the character's level-based growth bonuses (stacks every N levels). */
function refreshGrowth(world: World): void {
  const growth = world.character?.growth;
  world.modifiers.removeSource("growth");
  if (!growth) return;

  const players = world.stores.players;
  players.forEachAlive((slot) => {
    const stacks = Math.floor(players.field("level")[slot] / growth.everyLevels);
    if (stacks > 0) {
      for (const [key, amount] of Object.entries(growth.mods)) {
        world.modifiers.add(key, { op: "add", value: amount * stacks, source: "growth" });
      }
    }
  });

  players.forEachAlive((slot) => {
    const oldMax = players.field("maxHp")[slot];
    const newMax = 100 * world.stat("maxHp", 1);
    players.field("maxHp")[slot] = newMax;
    if (newMax > oldMax) {
      players.field("hp")[slot] = Math.min(newMax, players.field("hp")[slot] + (newMax - oldMax));
    }
  });
}
