"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { plan, convert, verifyTrack, verdict, hash, bytesHash, validationEntries } = require("./autotune-validation");

function row(version = "1.0.0", ids = ["baseline"]) {
  const result = { file: `models/demo/demo-${version}.yaml`, doc: {
    apiVersion: "catalog.swiss/v1", name: "demo", version,
    variants: ids.map(id => ({ id, engine: "sglang", chart: { name: "sglang", version: "0.7.1" },
      image: { repository: "registry/sglang", tag: "v1" },
      requires: { gpus: 2, gpuProduct: ["NVIDIA-H100-80GB-HBM3"] },
      values: { extraArgs: ["--tp=2", "--trust-remote-code"], model: { contextLength: "8192" } },
    })),
  } };
  result.catalog_sha256 = bytesHash(JSON.stringify(result.doc));
  return result;
}
function manifest(row) {
  return { schema_version: 1, catalog_file: row.file.split('/').at(-1),
    catalog_sha256: row.catalog_sha256, variants: row.doc.variants.map((v, i) => ({
      variant_id: v.id, track_slug: 'demo-h100', source_run_id: 100 + i,
      role: v.id === 'baseline' ? 'baseline' : 'optimized',
    })) };
}
const mapping = row => () => manifest(row);
const item = () => { const r = row("1.1.0", ["optimized"]); return { ...r, variant: r.doc.variants[0], track: "demo-h100" }; };
const track = body => ({ id: 7, status: "open", served_model_name: "demo", gpu_type: "H100",
  images: [{ image: body.image, engine: "sglang" }], benchmark_config_hash: "b1" });

test("new version copies baseline but submits only its new variant", () => {
  const old = row(), next = row("1.1.0", ["baseline", "optimized"]);
  const result = plan([old], [old, next], mapping(next));
  assert.deepEqual(result.map(r => r.variant.id), ["optimized"]);
});
test("same ID with different launch configuration cannot bypass validation", () => {
  const old = row(), next = row("1.1.0");
  next.doc.variants[0].image.tag = "v2";
  assert.throws(() => plan([old], [next], mapping(next)), /assign a new id/);
});
test("explicit exported baseline is skipped even for a newly cataloged model", () => {
  const next = row("1.0.0", ["baseline", "optimized"]);
  const m = mapping(next);
  assert.deepEqual(plan([], [next], m).map(r => r.variant.id), ["optimized"]);
});
test("published files are immutable and new variants require sidecar entries", () => {
  const old = row(), edited = structuredClone(old); edited.doc.variants[0].default = true;
  assert.throws(() => plan([old], [edited], mapping(old)), /immutable/);
  const next = row("1.1.0", ["optimized"]);
  assert.throws(() => plan([old], [next], () => ({ ...manifest(next), variants: [] })), /Missing validation entry/);
});
test("cosmetic changes on copied variants do not schedule GPU work", () => {
  const old = row(), next = row("1.1.0"); next.doc.variants[0].description = "New description";
  assert.equal(plan([old], [next], mapping(next)).length, 0);
});
test("conversion preserves context, flags, env, image digest and mounted files", () => {
  const i = item(); i.variant.image.digest = `sha256:${"a".repeat(64)}`;
  i.variant.values.env = [{ name: "NCCL_DEBUG", value: "WARN" }];
  i.variant.values.volumes = [{ name: "draft", hostPath: { path: "/weights/draft" } }];
  i.variant.values.volumeMounts = [{ name: "draft", mountPath: "/draft", readOnly: true }];
  const body = convert(i);
  assert.ok(body.image.endsWith(i.variant.image.digest));
  assert.match(body.command, /--context-length=8192/);
  assert.match(body.command, /--tp=2/);
  assert.deepEqual(body.extra_env, { NCCL_DEBUG: "WARN" });
  assert.deepEqual(body.extra_volumes, { "/weights/draft": "/draft:ro" });
});
test("unrepresentable engine configuration fails rather than silently dropping fields", () => {
  const i = item(); i.variant.values.env = [{ name: "SECRET", valueFrom: { secretKeyRef: {} } }];
  assert.throws(() => convert(i), /valueFrom/);
  delete i.variant.values.env; i.variant.values.command = ["custom"];
  assert.throws(() => convert(i), /Unsupported chart value/);
});
test("track must match model, exact image (digest included), and GPU", () => {
  const i = item(), body = convert(i), t = track(body);
  verifyTrack(i, body, t);
  assert.throws(() => verifyTrack(i, body, { ...t, gpu_type: "A100" }), /GPU/);
  assert.throws(() => verifyTrack(i, body, { ...t, served_model_name: "other" }), /different model/);
  assert.throws(() => verifyTrack(i, { ...body, image: `${body.image}@sha256:abc` }, t), /Exact image/);
});
test("measured is not synonymous with passed", () => {
  for (const status of ["queued", "running"]) assert.equal(verdict({ status }), "pending");
  for (const status of ["failed", "aborted", "unknown", "measured"]) assert.equal(verdict({ status }), "failed");
  assert.equal(verdict({ status: "measured", latest_measurement: { passed: true, feasible: false } }), "failed");
  assert.equal(verdict({ status: "measured", latest_measurement: { passed: true, feasible: true } }), "passed");
});
test("identity hashing is stable across JSON key order", () => {
  assert.equal(hash({ b: 2, a: 1 }), hash({ a: 1, b: 2 }));
});
test("sidecar binds exact YAML bytes and rejects mismatches and ambiguous records", () => {
  const r = row("1.1.0", ["optimized"]), m = manifest(r);
  assert.equal(validationEntries(r, m).get("optimized").source_run_id, 100);
  assert.throws(() => validationEntries(r, { ...m, catalog_sha256: "a".repeat(64) }), /digest/);
  assert.throws(() => validationEntries(r, { ...m, catalog_file: "other.yaml" }), /different catalog/);
  assert.throws(() => validationEntries(r, { ...m, variants: [...m.variants, ...m.variants] }), /duplicate/);
  assert.throws(() => validationEntries(r, { ...m, schema_version: 2 }), /schema/);
  assert.throws(() => validationEntries(r, { ...m, variants: [{ ...m.variants[0], source_run_id: 0 }] }), /source run/);
});

test("CI uses existing track endpoints, polls verdict and reuses matching submission", async () => {
  const { main } = require("../validate-autotune");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-ci-test-"));
  const cwd = process.cwd();
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  try {
    git("init", "-q"); git("config", "user.email", "test@example.com"); git("config", "user.name", "Test");
    fs.mkdirSync(path.join(dir, "models/demo"), { recursive: true });
    const old = row(); fs.writeFileSync(path.join(dir, old.file), JSON.stringify(old.doc));
    git("add", "."); git("commit", "-qm", "base"); const base = git("rev-parse", "HEAD");
    const next = row("1.1.0", ["baseline", "optimized"]);
    fs.writeFileSync(path.join(dir, next.file), JSON.stringify(next.doc));
    fs.writeFileSync(path.join(dir, next.file.replace(/\.yaml$/, ".validation.json")), JSON.stringify(manifest(next)));
    git("add", "."); git("commit", "-qm", "head"); const head = git("rev-parse", "HEAD");
    process.chdir(dir);
    const env = { BASE_SHA: base, HEAD_SHA: head, GITHUB_REPOSITORY: "owner/catalog", PR_NUMBER: "3",
      GITHUB_RUN_ID: "4", GITHUB_TOKEN: "github-test", AUTOTUNE_API_KEY: "service-test", AUTOTUNE_API_URL: "https://autotune.test/api" };
    const statuses = [], submitted = []; let existing = [];
    let pass = true, boardFailure = false, pending = false, closed = false, aborts = 0;
    const fetcher = async (url, options) => {
      const p = new URL(url).pathname, body = options.body && JSON.parse(options.body);
      let result;
      if (p.endsWith(`/statuses/${head}`)) { statuses.push(body.state); result = {}; }
      else if (p.endsWith("/pulls/3")) result = { state: closed ? "closed" : "open", head: { sha: head } };
      else {
        assert.equal(options.headers["X-API-Key"], "service-test");
        if (p.endsWith("/tracks/demo-h100")) result = { ...track(convert(item())),
          board: [{ submission_id: 10, measurement_id: 30, unranked_reason: boardFailure ? "below floor" : "" }] };
        else if (p.endsWith("/parse")) result = { engine: "sglang", cards: 2, warnings: [], engine_args: { tp: 2, context_length: 8192 } };
        else if (p.endsWith("/tracks/demo-h100/submissions")) {
          submitted.push(body); result = { ...body, id: 10, track_id: 7, status: "queued" };
          existing = [result];
        } else if (p.endsWith("/submissions/10/abort")) { aborts++; result = { id: 10, status: "aborted" }; }
        else if (p.endsWith("/submissions/10")) result = { id: 10, status: pending ? "queued" : "measured", run_id: 20, latest_measurement: { id: 30, passed: pass, feasible: pass } };
        else if (p.endsWith("/submissions")) result = existing;
        else throw Error(`Unexpected endpoint ${p}`);
      }
      return { ok: true, status: 200, json: async () => result };
    };
    await main(env, fetcher);
    await main(env, fetcher);
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0].engine_args.context_length, 8192);
    assert.equal(submitted[0].contest_api_token, undefined);
    assert.equal(statuses.at(-1), "success");
    pass = false;
    await assert.rejects(main(env, fetcher), /failed the track/);
    assert.equal(statuses.at(-1), "failure");
    pass = true; boardFailure = true;
    await assert.rejects(main(env, fetcher), /failed the track/);
    boardFailure = false; pending = true;
    await assert.rejects(main({ ...env, AUTOTUNE_TIMEOUT_MINUTES: "0.000000001" }, fetcher), /deadline exceeded/);
    assert.equal(aborts, 1);
    pending = false; closed = true;
    await assert.rejects(main(env, fetcher), /PR closed/);
    assert.equal(submitted.length, 1);
    closed = false;
    await main({ ...env, GITHUB_RUN_ATTEMPT: "2" }, fetcher);
    assert.equal(submitted.length, 2, "Explicit rerun starts a fresh attempt");
  } finally { process.chdir(cwd); fs.rmSync(dir, { recursive: true, force: true }); }
});
