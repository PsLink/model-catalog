import type { Catalog, History, Index, Variant } from "@/types";
import { catalogOf, encodePath } from "./catalog";

const ROOT = import.meta.env.BASE_URL;

// index-v2.json, fetched once for the whole visit: it changes only with a
// new build.
let catalog: Promise<Catalog> | null = null;

export function loadCatalog(): Promise<Catalog> {
  catalog ??= fetch(`${ROOT}index-v2.json`).then(async (res) => {
    if (!res.ok) {
      catalog = null;
      throw new Error(`index-v2.json: ${res.status}`);
    }
    return catalogOf((await res.json()) as Index);
  });
  return catalog;
}

// A variant's published file, its configuration as a model page shows it;
// null when it cannot be had.
export async function loadVariantText(v: Variant): Promise<string | null> {
  const res = await fetch(ROOT + encodePath(v.path));
  return res.ok ? res.text() : null;
}

// A variant's history.json, fetched once per visit, when first asked for.
const histories = new Map<string, Promise<History>>();

export function loadHistory(v: Variant): Promise<History> {
  let h = histories.get(v.history);
  if (!h) {
    h = fetch(ROOT + encodePath(v.history)).then((res) => {
      if (!res.ok) {
        histories.delete(v.history);
        throw new Error(`${v.history}: ${res.status}`);
      }
      return res.json();
    });
    histories.set(v.history, h);
  }
  return h;
}
