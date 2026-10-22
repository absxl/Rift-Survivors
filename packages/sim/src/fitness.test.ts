import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, createWorld } from "./index";

const SIM_SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function collectTs(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectTs(full));
    // Skip test files: they legitimately reference content ids in the forbidden list.
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("fitness: registry-complete", () => {
  it("every pipeline system id resolves in the registries", () => {
    const world = createWorld(DEFAULT_RULESET, { playerCount: 1 }, 1);
    for (const id of DEFAULT_RULESET.pipeline) {
      expect(world.registries.systems.has(id)).toBe(true);
    }
  });
});

describe("fitness: no-content-in-engine", () => {
  it("sim never imports the content package", () => {
    for (const file of collectTs(SIM_SRC)) {
      const text = readFileSync(file, "utf8");
      expect(text).not.toMatch(/from\s+["']@rift\/content["']/);
    }
  });

  it("sim source contains no champion/enemy/item content ids", () => {
    // Content ids live only in the lol-pack. Add new forbidden ids here as the
    // content pack grows; the engine must never reference them by name.
    const forbidden = ["garen", "lux", "jinx", "darius", "baron", "herald", "dragon"];
    for (const file of collectTs(SIM_SRC)) {
      const text = readFileSync(file, "utf8");
      for (const id of forbidden) {
        expect(text).not.toContain(id);
      }
    }
  });
});
