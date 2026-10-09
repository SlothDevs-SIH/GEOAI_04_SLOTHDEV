import { describe, expect, it } from "vitest";
import { MAX_SIDE_KM, PLACES, boxFromCorners, boxPolygon, boxProblem, dateProblem, parseBox, sizeKm, todayISO } from "./aoi";

describe("area box", () => {
  it("builds a west-south-east-north box from two corners in any order", () => {
    expect(boxFromCorners([77.2, 28.6], [77.1, 28.5])).toEqual([77.1, 28.5, 77.2, 28.6]);
    expect(boxFromCorners([77.1, 28.5], [77.2, 28.6])).toEqual([77.1, 28.5, 77.2, 28.6]);
  });

  it("measures kilometres, a little narrower than tall away from the equator", () => {
    const [w, h] = sizeKm([77, 28, 77.1, 28.1]);
    expect(w).toBeGreaterThan(9.5);
    expect(w).toBeLessThan(10);
    expect(h).toBeGreaterThan(10.9);
    expect(h).toBeLessThan(11.2);
  });

  it("explains every problem in plain words, and accepts a good box", () => {
    expect(boxProblem(undefined)).toMatch(/Click two opposite corners/);
    expect(boxProblem([77, 28, 77.5, 28.5])).toMatch(new RegExp(`limit is ${MAX_SIDE_KM}`));
    expect(boxProblem([77.1, 28.5, 77.101, 28.501])).toMatch(/at least/);
    expect(boxProblem([77.1, 28.5, 77.17, 28.56])).toBeUndefined();
  });

  it("draws the box as a closed polygon", () => {
    const ring = boxPolygon([1, 2, 3, 4]).geometry.coordinates[0];
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });

  it("offers shortcuts across different Indian regions, all with valid coordinates", () => {
    expect(PLACES.length).toBeGreaterThanOrEqual(10);
    for (const p of PLACES) {
      expect(p.lat).toBeGreaterThan(6);
      expect(p.lat).toBeLessThan(37);
      expect(p.lng).toBeGreaterThan(67);
      expect(p.lng).toBeLessThan(98);
    }
  });
});

describe("dates and typed corners", () => {
  it("accepts an ordered pair of past dates", () => {
    expect(dateProblem("2020-01-20", "2025-01-20", "2026-01-01")).toBeUndefined();
  });

  it("explains each date problem in plain words", () => {
    expect(dateProblem("", "2025-01-20")).toMatch(/both dates/);
    expect(dateProblem("2025-02-01", "2025-01-01")).toMatch(/before date must be earlier/);
    expect(dateProblem("2025-01-01", "2025-01-01")).toMatch(/before date must be earlier/);
    expect(dateProblem("2010-01-01", "2025-01-01")).toMatch(/2017/);
    expect(dateProblem("2020-01-01", "2030-01-01", "2026-01-01")).toMatch(/future/);
  });

  it("formats today as YYYY-MM-DD", () => {
    expect(todayISO(new Date("2026-03-04T10:00:00Z"))).toBe("2026-03-04");
  });

  it("parses typed corners to a box, or says what is wrong", () => {
    expect(parseBox("77.1", "28.5", "77.17", "28.56")).toEqual([77.1, 28.5, 77.17, 28.56]);
    expect(parseBox("77.1", "", "77.17", "28.56")).toMatch(/all four/);
    expect(parseBox("77.2", "28.5", "77.1", "28.56")).toMatch(/West must be smaller/);
    expect(parseBox("77.1", "28.6", "77.17", "28.5")).toMatch(/South must be smaller/);
    expect(parseBox("77.1", "28.5", "190", "28.56")).toMatch(/between -180 and 180/);
  });
});
