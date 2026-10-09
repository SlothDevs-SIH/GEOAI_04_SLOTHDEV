/** Copies text; falls back to a hidden textarea where the async clipboard API is missing (http, old browsers). */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* permission denied: try the fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = typeof document.execCommand === "function" && document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

/** "lat,lon" as used by Google Maps and most GIS tools. */
export const centroidText = (p: { centroid_lat: number; centroid_lon: number }) => `${p.centroid_lat},${p.centroid_lon}`;
