// Barrel for the 173 authored real champion kits (346 abilities).
import type { AbilityDef } from "@rift/sim";
import { BATCH_1 } from "./batch-1";
import { BATCH_2 } from "./batch-2";
import { BATCH_3 } from "./batch-3";
import { BATCH_4 } from "./batch-4";
import { BATCH_5 } from "./batch-5";
import { BATCH_6 } from "./batch-6";
import { BATCH_7 } from "./batch-7";
import { BATCH_8 } from "./batch-8";
import type { buildKit } from "./factory";

type Kit = ReturnType<typeof buildKit>;

export const AUTHORED_KIT_MAP: Record<string, Kit> = {
  ...BATCH_1,
  ...BATCH_2,
  ...BATCH_3,
  ...BATCH_4,
  ...BATCH_5,
  ...BATCH_6,
  ...BATCH_7,
  ...BATCH_8,
};

export const AUTHORED_ABILITIES: AbilityDef[] = Object.values(AUTHORED_KIT_MAP).flatMap(
  (kit) => kit.abilities,
);

export const AUTHORED_KITS: Record<string, { startingAbility: string; startingAbility2: string }> =
  Object.fromEntries(
    Object.entries(AUTHORED_KIT_MAP).map(([id, kit]) => [
      id,
      { startingAbility: kit.startingAbility, startingAbility2: kit.startingAbility2 },
    ]),
  );
