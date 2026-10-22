// Registries: the extension points. Content references modules by string id;
// startup validation fails fast if an id is missing. New behaviour = register a
// module, reference it by id from data. Engine code never hard-codes ids.

import type { World } from "./world";

/** A system run once per tick, in the order given by the ruleset pipeline. */
export type SystemFn = (world: World) => void;

/** Placeholder signatures refined in later milestones (behaviors, effects, etc.). */
export type GenericFn = (...args: unknown[]) => unknown;

export class Registry<T> {
  private readonly entries = new Map<string, T>();

  register(id: string, impl: T): void {
    if (this.entries.has(id)) throw new Error(`registry: duplicate id "${id}"`);
    this.entries.set(id, impl);
  }

  get(id: string): T {
    const impl = this.entries.get(id);
    if (impl === undefined) throw new Error(`registry: unknown id "${id}"`);
    return impl;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  ids(): string[] {
    return [...this.entries.keys()];
  }
}

export interface StatDef {
  defaultValue: number;
}

export interface RuleDef {
  defaultValue: number | boolean | string;
}

export interface Registries {
  systems: Registry<SystemFn>;
  weaponBehaviors: Registry<GenericFn>;
  enemyBehaviors: Registry<GenericFn>;
  progression: Registry<GenericFn>;
  triggers: Registry<GenericFn>;
  conditions: Registry<GenericFn>;
  actions: Registry<GenericFn>;
  stats: Registry<StatDef>;
  ruleKeys: Registry<RuleDef>;
}

export function createRegistries(): Registries {
  return {
    systems: new Registry<SystemFn>(),
    weaponBehaviors: new Registry<GenericFn>(),
    enemyBehaviors: new Registry<GenericFn>(),
    progression: new Registry<GenericFn>(),
    triggers: new Registry<GenericFn>(),
    conditions: new Registry<GenericFn>(),
    actions: new Registry<GenericFn>(),
    stats: new Registry<StatDef>(),
    ruleKeys: new Registry<RuleDef>(),
  };
}
