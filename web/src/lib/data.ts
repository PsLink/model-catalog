import type { Catalog, Model } from "@/types";
import { encodePath, latestVersion } from "./catalog";

const ROOT = import.meta.env.BASE_URL;

// catalog.json, fetched once for the whole visit: it changes only with a
// new build.
let catalog: Promise<Catalog> | null = null;

export function loadCatalog(): Promise<Catalog> {
  catalog ??= fetch(`${ROOT}catalog.json`).then((res) => {
    if (!res.ok) {
      catalog = null;
      throw new Error(`catalog.json: ${res.status}`);
    }
    return res.json();
  });
  return catalog;
}

// The published version file a model page cuts each variant's configuration
// from; null when it cannot be had.
export async function loadVersionText(m: Model): Promise<string | null> {
  const res = await fetch(ROOT + encodePath(latestVersion(m).path));
  return res.ok ? res.text() : null;
}
