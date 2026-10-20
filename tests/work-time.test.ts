import { describe, expect, it } from "vitest";
import {
  BREAK_MINUTES,
  breakOffsets,
  splitIntoParts,
  totalWorkedMinutes,
  workBlocks,
  workedIntervals,
} from "@/lib/work-time";

const h = (hours: number) => hours * 60;

describe("breaks", () => {
  it("gives no break up to 6 hours", () => {
    expect(breakOffsets(h(6))).toEqual([]);
  });

  it("puts one 30-minute break between 4h and 6h into longer shifts", () => {
    expect(breakOffsets(h(6.5))).toEqual([h(4)]);
    expect(breakOffsets(h(8))).toEqual([h(4)]);
    expect(breakOffsets(h(12))).toEqual([h(5.75)]); // 5h45 work, break, 5h45 work
    expect(breakOffsets(h(12.5))).toEqual([h(6)]); // 6h, break, 6h — the most one break allows
  });

  it("adds a second break when one isn't enough", () => {
    expect(breakOffsets(h(13))).toEqual([h(4), h(8.5)]);
  });

  it("never leaves more than 6 hours of work in a row, and never a stretch under 4h before a break", () => {
    for (let span = h(6) + 1; span <= h(24); span++) {
      const offsets = breakOffsets(span);
      const starts = [0, ...offsets.map((o) => o + BREAK_MINUTES)];
      const ends = [...offsets, span];
      const stretches = starts.map((s, i) => ends[i] - s);
      expect(Math.max(...stretches)).toBeLessThanOrEqual(h(6));
      expect(Math.min(...stretches.slice(0, -1))).toBeGreaterThanOrEqual(h(4));
    }
  });
});

describe("work blocks", () => {
  it("counts overlapping shifts once and takes the break out", () => {
    // Great Room 07:00–14:00 and Studio 1 11:00–15:00 at the same time.
    const blocks = workBlocks([
      [h(7), h(14)],
      [h(11), h(15)],
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ start: h(7), end: h(15), workedMinutes: h(7.5) });
    expect(workedIntervals(blocks[0])).toEqual([
      [h(7), h(11)],
      [h(11.5), h(15)],
    ]);
  });

  it("keeps separate shifts separate", () => {
    expect(totalWorkedMinutes([[h(6), h(10)], [h(18), h(23)]])).toBe(h(9));
  });
});

describe("splitting long shifts", () => {
  it("leaves a shift one person can work as it is", () => {
    expect(splitIntoParts(h(9), h(21.5))).toEqual([[h(9), h(21.5)]]);
  });

  it("splits a 14-hour function into an early and a late shift", () => {
    expect(splitIntoParts(h(7), h(21))).toEqual([
      [h(7), h(14)],
      [h(14), h(21)],
    ]);
  });
});
