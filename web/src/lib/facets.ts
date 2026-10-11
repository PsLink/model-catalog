import type { Model, Variant } from "../types";
import { variantBest } from "./catalog";

// What a list page filters, sorts and summarizes on: one entry per model, or
// per variant. Variant entries take their model's name, family and tags.
export interface Facet {
  name: string;
  // How the best-improvement stat names the entry; the name when unset.
  label?: string;
  // A variant's place on its model page.
  rank?: number;
  family: string | null;
  tags: string[];
  // One per variant, so the summary counts variants per engine.
  engines: string[];
  hardware: string[];
  // Every GPU a variant takes, across its nodes; null when it names none.
  gpus?: number | null;
  hasCmp: boolean;
  uplift: number | null;
  deprecated: boolean;
  text: string;
}

function searchText(parts: Array<string | null | undefined | false>): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

export function facetsOf(m: Model): Facet {
  const latest = m.versions[0];
  return {
    name: m.name,
    family: m.family,
    tags: m.tags,
    engines: latest.variants.map((v) => v.engine),
    hardware: [...new Set(latest.variants.flatMap((v) => v.hardware))].sort(),
    hasCmp: !!m.comparison,
    uplift: m.comparison ? m.comparison.bestPct : null,
    deprecated: m.deprecated,
    text: searchText([
      m.name,
      m.displayName,
      m.description,
      m.family,
      m.source && m.source.hf,
      ...m.tags,
      ...latest.variants.flatMap((v) => [v.id, v.engine, v.description, ...v.hardware]),
    ]),
  };
}

// uplift is an optimized variant's own best result.
export function variantFacetsOf(m: Model, v: Variant, rank: number): Facet {
  const best = v.isOptimized ? variantBest(m, v.id) : null;
  const req = v.requires || {};
  const image = v.image && v.image.repository ? `${v.image.repository}:${v.image.tag || "latest"}` : null;
  return {
    name: m.name,
    label: `${m.name} · ${v.id}`,
    rank,
    family: m.family,
    tags: m.tags,
    engines: [v.engine],
    hardware: [...new Set(v.hardware)].sort(),
    gpus: req.gpus == null ? null : req.gpus * (req.nodes || 1),
    hasCmp: !!m.comparison,
    uplift: best ? best.upliftPct : null,
    deprecated: m.deprecated,
    text: searchText([
      m.name,
      m.displayName,
      m.family,
      m.source && m.source.hf,
      ...m.tags,
      v.id,
      v.engine,
      v.description,
      image,
      v.chart && v.chart.name,
      ...v.hardware,
    ]),
  };
}

// The default order: best improvement first, the rest by model, and a model's
// variants in their model page's order.
export function byUplift(a: Facet, b: Facet): number {
  return (
    (b.uplift == null ? -Infinity : b.uplift) - (a.uplift == null ? -Infinity : a.uplift) ||
    a.name.localeCompare(b.name) ||
    (a.rank || 0) - (b.rank || 0)
  );
}

const byName = (a: Facet, b: Facet) => a.name.localeCompare(b.name) || (a.rank || 0) - (b.rank || 0);

export const sorters: Record<string, (a: Facet, b: Facet) => number> = {
  name: byName,
  uplift: byUplift,
  // Models without a family sort last.
  family: (a, b) => Number(!a.family) - Number(!b.family) || (a.family || "").localeCompare(b.family || "") || byName(a, b),
  // Fewest GPUs first; a variant that names no count last.
  gpus: (a, b) => Number(a.gpus == null) - Number(b.gpus == null) || (a.gpus ?? 0) - (b.gpus ?? 0) || byName(a, b),
};

export const sortDir: Record<string, "ascending" | "descending"> = {
  name: "ascending",
  family: "ascending",
  uplift: "descending",
  gpus: "ascending",
};

export interface Summary {
  models: number;
  deprecated: number;
  variants: number;
  engines: Record<string, number>;
  pairs: number;
  median: number | null;
  worst: { name: string; pct: number } | null;
  best: { name: string; pct: number } | null;
}

// Over either page's entries. Models count once however many variants they
// show; the improvements are each entry's own, so a model's best on one page,
// each tuned variant's on the other.
export function computeSummary(items: Facet[]): Summary {
  const engines: Record<string, number> = {};
  const uplifts: { name: string; pct: number }[] = [];
  const models = new Set<string>();
  const deprecated = new Set<string>();
  const pairs = new Set<string>();
  let variants = 0;
  for (const m of items) {
    models.add(m.name);
    variants += m.engines.length;
    if (m.deprecated) deprecated.add(m.name);
    if (m.hasCmp) pairs.add(m.name);
    if (m.uplift != null) uplifts.push({ name: m.label || m.name, pct: m.uplift });
    for (const e of m.engines) engines[e] = (engines[e] || 0) + 1;
  }
  uplifts.sort((a, b) => a.pct - b.pct);
  const n = uplifts.length;
  const median = n === 0 ? null : n % 2 ? uplifts[(n - 1) / 2].pct : (uplifts[n / 2 - 1].pct + uplifts[n / 2].pct) / 2;
  return {
    models: models.size,
    deprecated: deprecated.size,
    variants,
    engines,
    pairs: pairs.size,
    median,
    worst: n ? uplifts[0] : null,
    best: n ? uplifts[n - 1] : null,
  };
}

export function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  return counts;
}
