// Semver precedence, as hack/lib/catalog.js orders versions: a prerelease
// sorts below its release; its identifiers compare numerically when numeric,
// numeric below alphanumeric, and a shorter list below a longer one it
// prefixes (alpha < alpha.1 < beta, rc.2 < rc.10).
function parseVersion(v: string) {
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(String(v));
  if (!m) return null;
  const pre = m[4] ? m[4].split(".").map((id) => (/^\d+$/.test(id) ? Number(id) : id)) : [];
  return { core: [Number(m[1]), Number(m[2]), Number(m[3])], pre };
}

export function compareVersions(a: string, b: string): number {
  const A = parseVersion(a);
  const B = parseVersion(b);
  if (!A || !B) return String(a).localeCompare(String(b));
  for (let i = 0; i < 3; i++) if (A.core[i] !== B.core[i]) return A.core[i] - B.core[i];
  if (!A.pre.length || !B.pre.length) return B.pre.length - A.pre.length;
  for (let i = 0; i < Math.min(A.pre.length, B.pre.length); i++) {
    const x = A.pre[i];
    const y = B.pre[i];
    if (x === y) continue;
    if (typeof x !== typeof y) return typeof x === "number" ? -1 : 1;
    return typeof x === "number" ? x - (y as number) : x < y ? -1 : 1;
  }
  return A.pre.length - B.pre.length;
}
