import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld, step } from "./index";
import type { ContentPack } from "./index";
import { PICKUP_GOLD } from "./systems/pickups";

const COOP_PACK: ContentPack = {
  id: "coop",
  schemaVersion: 1,
  enemies: [
    {
      id: "chaser",
      category: "minion",
      hp: 10,
      damage: 5,
      moveSpeed: 0.6,
      radius: 6,
      xp: 1,
      behavior: "chase",
      params: {},
    },
  ],
  weapons: [
    {
      id: "blade",
      behavior: "sweep",
      params: { arc: 1.2 },
      maxLevel: 5,
      base: {
        damage: 10,
        cooldown: 60,
        area: 44,
        speed: 0,
        duration: 0,
        amount: 1,
        pierce: 99,
        hitCooldown: 12,
        knockback: 4,
        lifetime: 0,
      },
      levels: [{ delta: { damage: 4 } }],
      damageType: "physical",
    },
  ],
  passives: [],
  characters: [{ id: "champion", startingWeapon: "blade" }],
  powerUps: [],
  synergies: [],
};

describe("co-op sim", () => {
  // No enemies/weapons so allocated enemies are the only ones and auto-fire can't interfere.
  const CREDIT_PACK: ContentPack = { ...COOP_PACK, enemies: [], weapons: [] };

  it("credits each kill to the player who dealt the final hit", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 2, content: CREDIT_PACK }, 7);
    const players = world.stores.players;
    const enemies = world.stores.enemies;

    const kill = (owner: number, x: number, y: number): void => {
      const slot = enemies.alloc();
      enemies.field("x")[slot] = x;
      enemies.field("y")[slot] = y;
      enemies.field("hp")[slot] = 10;
      enemies.field("maxHp")[slot] = 10;
      enemies.field("kind")[slot] = 0;
      world.applyHit(slot, 999, 0, 0, 0, 0, owner);
    };

    kill(1, 100, 100);
    kill(0, 140, 100);
    step(world, []);

    expect(players.field("kills")[0]).toBe(1);
    expect(players.field("kills")[1]).toBe(1);
    expect(enemies.liveSlots().length).toBe(0);
  });

  it("gives gold to the player who touches a gold pickup", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 2, content: CREDIT_PACK }, 8);
    const players = world.stores.players;
    const pickups = world.stores.pickups;
    const slot = pickups.alloc();
    pickups.field("x")[slot] = players.field("x")[1];
    pickups.field("y")[slot] = players.field("y")[1];
    pickups.field("kind")[slot] = PICKUP_GOLD;
    pickups.field("value")[slot] = 10;

    step(world, []);

    expect(players.field("gold")[0]).toBe(0);
    expect(players.field("gold")[1]).toBe(10);
  });

  it("creates one starting weapon per player", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 2, content: COOP_PACK }, 1);
    const weapons = world.stores.weapons.liveSlots();
    expect(weapons.length).toBe(2);
    const owners = weapons.map((s) => world.stores.weapons.field("owner")[s]).sort();
    expect(owners).toEqual([0, 1]);
  });

  it("runs deterministically with two independent input streams", () => {
    const a = createWorld(DEFAULT_RULESET, { playerCount: 2, content: COOP_PACK }, 1);
    const b = createWorld(DEFAULT_RULESET, { playerCount: 2, content: COOP_PACK }, 1);
    for (let t = 0; t < 600; t++) {
      const inputs = [
        { playerId: 0, moveX: 1, moveY: 0 },
        { playerId: 1, moveX: 0, moveY: 1 },
      ];
      step(a, inputs);
      step(b, inputs);
    }
    expect(a.stores.players.field("x")[0]).toBe(b.stores.players.field("x")[0]);
    expect(a.stores.players.field("y")[1]).toBe(b.stores.players.field("y")[1]);
    // Player 0 moved +x, player 1 moved +y.
    expect(a.stores.players.field("x")[0]).toBeGreaterThan(a.stores.players.field("x")[1]);
    expect(a.stores.players.field("y")[1]).toBeGreaterThan(a.stores.players.field("y")[0]);
  });

  it("shared party XP levels every player together with their own offers", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 2, content: COOP_PACK }, 1);
    expect(world.partyLevel).toBe(1);

    world.partyXp = 100;
    step(world, []);

    expect(world.partyLevel).toBe(2);
    expect(world.stores.players.field("level")[0]).toBe(2);
    expect(world.stores.players.field("level")[1]).toBe(2);
    // One offer queued per player.
    expect(world.pendingOffers().length).toBe(2);
  });

  it("revives a downed player when an ally stands nearby", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 2, content: COOP_PACK }, 1);
    const players = world.stores.players;

    // Down player 1 and park player 0 next to it.
    players.field("downed")[1] = 1;
    players.field("hp")[1] = 0;
    players.field("x")[0] = players.field("x")[1];
    players.field("y")[0] = players.field("y")[1];

    for (let t = 0; t < 100 && !world.over; t++) step(world, []);

    expect(world.over).toBe(false);
    expect(players.field("downed")[1]).toBe(0);
    expect(players.field("hp")[1]).toBeGreaterThan(0);
  });
});
