// catalog.json, as the catalog server (server/data.js) serves it.

export interface Workload {
  name: string;
  upliftPct: number;
  upliftLabel: string;
}

// A recorded optimized-vs-baseline pair.
export interface Tuning {
  version: string;
  baselineId: string;
  optimizedId: string;
  upliftPct: number | null;
  upliftLabel: string | null;
  report: string | null;
  reportFile: string | null;
  workloads: Workload[];
}

// The pair a model's latest version shows, with its best workload.
export interface Comparison extends Tuning {
  bestPct: number | null;
  bestLabel: string | null;
  bestWorkload: string | null;
}

export interface Report {
  file: string;
  path: string;
  title: string;
}

export interface Requires {
  gpus?: number;
  nodes?: number;
  vendor?: string;
  gpuProduct?: string[];
  topology?: string;
}

export interface Variant {
  id: string;
  engine: string;
  default: boolean;
  description: string | null;
  link: string | null;
  // The variant on GitHub, pinned to a commit.
  source: string | null;
  chart: { name?: string; version?: string } | null;
  image: { repository?: string; tag?: string; digest?: string } | null;
  // Where the variant sits in its version file: first and last line, and the
  // column its fields start at.
  lines: { from: number; to: number; indent: number } | null;
  requires: Requires | null;
  requiresSummary: string;
  hardware: string[];
  hardwareShort: string;
  isBaseline: boolean;
  isOptimized: boolean;
}

export interface Version {
  version: string;
  path: string;
  source: string | null;
  servedName: string | null;
  variantCount: number;
  variants: Variant[];
}

export interface Model {
  name: string;
  dir: string;
  displayName: string;
  description: string | null;
  family: string | null;
  tags: string[];
  deprecated: boolean;
  deprecatedReason: string | null;
  source: { hf?: string; revision?: string } | null;
  latest: string;
  // Newest first.
  versions: Version[];
  reports: Report[];
  comparison: Comparison | null;
  tuning: Tuning[];
}

export interface Catalog {
  apiVersion: string;
  generatedBy: string;
  count: number;
  models: Model[];
}
