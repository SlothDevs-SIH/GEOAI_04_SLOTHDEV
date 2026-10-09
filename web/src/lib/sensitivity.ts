// The live sensitivity slider: the same algorithm as engine/sensitivity.py `apply`, so a user can drag the change
// threshold and the minimum area and watch detections appear and vanish without waiting for the server.
// tests: src/lib/sensitivity.test.ts reproduces counts computed by the Python engine (fixture from scripts/make_sens_fixture.py).

export const VALID_BIT = 128;

/** What sens.json describes about sens.bin (3 bytes per pixel: magnitude as uint16 little endian, then type | 128 if usable). */
export interface SensInfo {
  width: number;
  height: number;
  pixel_m: number;
  default_threshold: number;
  default_min_area_px: number;
  min_area_m2: number;
  keep_codes: number[];
  type_names: Record<string, string>;
  server_after_filter: number;
}

export interface SensResult {
  mask: Uint8Array; // 1 where a change survives
  count: number; // number of changes (4-connected blobs)
  pixels: number;
}

// scipy's binary_opening and binary_closing treat everything outside the image as empty, so we do too.
function erode(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (
        src[i] && src[i - 1] && src[i + 1] && src[i - w] && src[i + w] &&
        src[i - w - 1] && src[i - w + 1] && src[i + w - 1] && src[i + w + 1]
      ) out[i] = 1;
    }
  }
  return out;
}

function dilate(src: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!src[y * w + x]) continue;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx >= 0 && xx < w) out[yy * w + xx] = 1;
        }
      }
    }
  }
  return out;
}

/** Label 4-connected blobs; returns the label of each pixel (0 = background) and the size of each blob. */
function label(mask: Uint8Array, w: number, h: number): { labels: Int32Array; sizes: number[] } {
  const labels = new Int32Array(w * h);
  const sizes: number[] = [0];
  const stack = new Int32Array(w * h);
  let next = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    next += 1;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    labels[start] = next;
    while (top) {
      const i = stack[--top];
      size += 1;
      const x = i % w;
      if (x > 0 && mask[i - 1] && !labels[i - 1]) { labels[i - 1] = next; stack[top++] = i - 1; }
      if (x < w - 1 && mask[i + 1] && !labels[i + 1]) { labels[i + 1] = next; stack[top++] = i + 1; }
      if (i >= w && mask[i - w] && !labels[i - w]) { labels[i - w] = next; stack[top++] = i - w; }
      if (i < mask.length - w && mask[i + w] && !labels[i + w]) { labels[i + w] = next; stack[top++] = i + w; }
    }
    sizes.push(size);
  }
  return { labels, sizes };
}

/**
 * candidate = usable and magnitude above the threshold and a wanted type; open then close with a 3 x 3 square
 * (removes specks); drop blobs smaller than the minimum area (in pixels).
 */
export function applySensitivity(bytes: Uint8Array, w: number, h: number, threshold: number, minAreaPx: number, keepCodes: number[]): SensResult {
  const n = w * h;
  const keep = new Set(keepCodes);
  const cand = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const kind = bytes[3 * i + 2];
    const mag = (bytes[3 * i] | (bytes[3 * i + 1] << 8)) / 65535;
    if ((kind & VALID_BIT) && mag > threshold && keep.has(kind & 7)) cand[i] = 1;
  }
  const opened = dilate(erode(cand, w, h), w, h);
  const closed = erode(dilate(opened, w, h), w, h);
  const cleaned = new Uint8Array(n);
  for (let i = 0; i < n; i++) cleaned[i] = closed[i] && (opened[i] || cand[i]) ? 1 : 0;

  const { labels, sizes } = label(cleaned, w, h);
  const min = Math.max(1, minAreaPx);
  const kept = sizes.map((s, k) => k > 0 && s >= min);
  const mask = new Uint8Array(n);
  let pixels = 0;
  for (let i = 0; i < n; i++) {
    if (labels[i] && kept[labels[i]]) { mask[i] = 1; pixels += 1; }
  }
  return { mask, count: kept.filter(Boolean).length, pixels };
}
