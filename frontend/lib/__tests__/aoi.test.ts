import { MAX_SIDE_KM, PLACES, boxFromCorners, boxPolygon, boxProblem, sizeKm } from "../aoi";

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
