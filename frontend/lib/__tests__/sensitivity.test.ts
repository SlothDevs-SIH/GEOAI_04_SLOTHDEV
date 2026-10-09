import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import fixture from "./fixtures/sens_fixture.json";
import { VALID_BIT, applySensitivity } from "../sensitivity";

const bytes = Uint8Array.from(atob(fixture.data_base64), (c) => c.charCodeAt(0));

describe("sensitivity slider algorithm", () => {
  it("reproduces the counts and pixels computed by the Python engine at every tested setting", () => {
    expect(bytes.length).toBe(fixture.width * fixture.height * 3);
    for (const c of fixture.cases) {
      const r = applySensitivity(bytes, fixture.width, fixture.height, c.threshold, c.min_area_px, c.keep_codes);
      expect({ count: r.count, pixels: r.pixels }).toEqual({ count: c.count, pixels: c.pixels });
    }
  });

  it("at the default settings gives the number of changes the server reported", () => {
    const c = fixture.cases[0];
    const r = applySensitivity(bytes, fixture.width, fixture.height, fixture.default_threshold, c.min_area_px, c.keep_codes);
    expect(r.count).toBe(fixture.server_after_filter);
  });

  it("a stricter threshold or a bigger minimum area never finds more", () => {
    const keep = fixture.cases[0].keep_codes;
    const find = (t: number, m: number) => applySensitivity(bytes, fixture.width, fixture.height, t, m, keep).count;
    expect(find(0.9, 3)).toBeLessThanOrEqual(find(fixture.default_threshold, 3));
    expect(find(fixture.default_threshold, 2000)).toBe(0);
    expect(find(0.05, 3)).toBeGreaterThanOrEqual(find(fixture.default_threshold, 3));
  });

  it("ignores pixels that are not usable (cloud or no data) and types that are not wanted", () => {
    const w = 8;
    const h = 8;
    const data = new Uint8Array(w * h * 3);
    for (let i = 0; i < w * h; i++) {
      data[3 * i] = 255;
      data[3 * i + 1] = 255; // magnitude 1.0
      data[3 * i + 2] = 3 | VALID_BIT; // built-up gain, usable
    }
    expect(applySensitivity(data, w, h, 0.5, 1, [3]).count).toBe(1);
    expect(applySensitivity(data, w, h, 0.5, 1, [1]).count).toBe(0); // type not wanted
    for (let i = 0; i < w * h; i++) data[3 * i + 2] = 3; // same type, but unusable
    expect(applySensitivity(data, w, h, 0.5, 1, [3]).count).toBe(0);
  });

  it("removes specks thinner than 3 pixels and keeps solid blobs", () => {
    const w = 20;
    const h = 20;
    const data = new Uint8Array(w * h * 3);
    const set = (x: number, y: number) => { const i = 3 * (y * w + x); data[i] = 255; data[i + 1] = 255; data[i + 2] = 3 | VALID_BIT; };
    for (let x = 2; x < 18; x++) set(x, 3); // a 1-pixel-wide line: a speck
    for (let y = 8; y < 14; y++) for (let x = 8; x < 14; x++) set(x, y); // a 6 x 6 block
    const r = applySensitivity(data, w, h, 0.5, 1, [3]);
    expect(r.count).toBe(1);
    expect(r.pixels).toBe(36);
  });
});

describe("sensitivity slider on the published scenes", () => {
  it("gives exactly the server count at the default settings, for every scene that ships slider data", async () => {
    const root = resolve(__dirname, "../../public/demos");
    const scenes = readdirSync(root).filter((d) => existsSync(resolve(root, d, "sens.json")));
    expect(scenes.length).toBeGreaterThanOrEqual(3);
    for (const id of scenes) {
      const info = JSON.parse(readFileSync(resolve(root, id, "sens.json"), "utf8"));
      const data = new Uint8Array(readFileSync(resolve(root, id, "sens.bin")));
      expect(data.length).toBe(info.width * info.height * 3);
      const r = applySensitivity(data, info.width, info.height, info.default_threshold, info.default_min_area_px, info.keep_codes);
      expect(r.count).toBe(info.server_after_filter);
    }
  });
});
