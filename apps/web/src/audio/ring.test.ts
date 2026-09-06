import { describe, expect, test } from "bun:test";
import { Ring } from "./ring";

const ramp = (from: number, count: number) => Float32Array.from({ length: count }, (_, i) => from + i);

describe("Ring", () => {
  test("returns the most recent samples in order", () => {
    const ring = new Ring(8);
    ring.write(ramp(0, 5));
    expect([...ring.last(3)]).toEqual([2, 3, 4]);
  });

  test("clamps to what has actually been written", () => {
    const ring = new Ring(8);
    ring.write(ramp(0, 3));
    expect([...ring.last(6)]).toEqual([0, 1, 2]);
  });

  test("keeps the window contiguous across the wrap", () => {
    const ring = new Ring(8);
    ring.write(ramp(0, 6));
    ring.write(ramp(6, 6));
    expect(ring.written).toBe(12);
    expect([...ring.last(8)]).toEqual([4, 5, 6, 7, 8, 9, 10, 11]);
  });

  test("never returns more than it can hold", () => {
    const ring = new Ring(4);
    ring.write(ramp(0, 100));
    expect([...ring.last(50)]).toEqual([96, 97, 98, 99]);
  });

  test("survives a chunk longer than the whole buffer", () => {
    const ring = new Ring(4);
    ring.write(ramp(0, 10));
    expect([...ring.last(4)]).toEqual([6, 7, 8, 9]);
  });
});
