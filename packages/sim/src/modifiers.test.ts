import { describe, expect, it } from "vitest";
import { ModifierStack } from "./modifiers";

describe("ModifierStack", () => {
  it("returns base when no modifiers are present", () => {
    const m = new ModifierStack();
    expect(m.evaluate("might", 10)).toBe(10);
  });

  it("applies add then mult", () => {
    const m = new ModifierStack();
    m.add("might", { op: "add", value: 5, source: "a" });
    m.add("might", { op: "mult", value: 2, source: "b" });
    expect(m.evaluate("might", 10)).toBe(30);
  });

  it("override wins over add/mult", () => {
    const m = new ModifierStack();
    m.add("x", { op: "add", value: 5, source: "a" });
    m.add("x", { op: "override", value: 42, source: "b" });
    expect(m.evaluate("x", 10)).toBe(42);
  });

  it("min/max clamp the final value", () => {
    const m = new ModifierStack();
    m.add("x", { op: "override", value: 100, source: "a" });
    m.add("x", { op: "min", value: 50, source: "b" });
    m.add("x", { op: "max", value: 80, source: "c" });
    expect(m.evaluate("x", 0)).toBe(80);
  });

  it("removeSource() removes all modifiers from that source", () => {
    const m = new ModifierStack();
    m.add("x", { op: "add", value: 5, source: "a" });
    m.add("x", { op: "add", value: 7, source: "b" });
    m.removeSource("a");
    expect(m.evaluate("x", 10)).toBe(17);
  });
});
