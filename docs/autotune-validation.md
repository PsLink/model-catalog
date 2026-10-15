# Validate exported variants on their original tracks

The `Original track validation` workflow replays **new variant IDs** through
the existing autotune track submission flow. It uses an ordinary internal
validation user's service key. No new API endpoint, database migration or worker
change is required. The existing export endpoint and UI need the sidecar-enabled
release. Results appear as ordinary entries on the original track and participate
in its existing board rules.

## Export and submit

1. Export the selected runs from the original track. Download the version YAML
   and its generated `<name>-<version>.validation.json`, plus metadata/report
   when needed. Commit the files together under `models/<name>/` in the PR.
2. No manually maintained track mapping is needed. The exporter resolves the original track
   through the platform's existing run overlay and writes this sidecar:

   ```json
   {
     "schema_version": 1,
     "catalog_file": "demo-1.1.0.yaml",
     "catalog_sha256": "<SHA-256 of the exact YAML bytes>",
     "variants": [
       {
         "variant_id": "sglang-tp2-h100-optimized",
         "track_slug": "demo-h100-sweep",
         "source_run_id": 123,
         "role": "optimized"
       }
     ]
   }
   ```

   The JSON contains routing/provenance, not a second copy of the engine config.
   CI validates the filename, digest, unique variant IDs, track slugs and source
   run IDs before submission. Missing entries, unsupported schema versions or
   edited YAML with a stale digest fail. Regenerate the pair after editing the
   exported configuration; do not hand-maintain a separate mapping file.
3. CI compares against all published versions of each model. Unchanged variants
   copied into a new version are skipped. Exported `role: baseline` entries are
   also skipped, including a newly cataloged baseline. New optimized variants
   require a matching sidecar entry. Changing an existing configuration under
   its old variant ID is rejected; give the new configuration a new ID.
   Extending an existing version only needs entries for the newly exported runs.
4. CI parses the exported engine arguments, checks the original track and
   submits the configuration as the validation account. The original track
   supplies weights, benchmark, GPU type and maximum run time. The variant
   supplies the exact engine image, flags, context length, environment, host
   mounts and node count. Neither the source run nor baseline is rerun.
5. The `autotune/track-validation` commit status reports the outcome. Workflow
   summary and `results.json` artifact contain submission/run IDs and track
   slugs; open that original track to inspect the ordinary evaluation report.
   Submission notes link back to the exact workflow, commit and variant.

## One-time GitHub setup

The workflow and scripts must first be merged to the catalog's default branch:
`pull_request_target` deliberately runs the trusted base branch implementation.
The PR head is fetched as Git objects and its version YAML and validation JSON read as data; no PR
scripts, dependencies or checkout are executed with service credentials.

Create the GitHub Environment **autotune-validation**:

| Setting | Value |
| --- | --- |
| Environment secret `AUTOTUNE_API_URL` | Service URL ending in `/api`, reachable from the runner |
| Environment secret `AUTOTUNE_API_KEY` | Dedicated ordinary validation account's service key (`X-API-Key`) |
| Repository variable `AUTOTUNE_RUNNER` | A runner label with network access; default `ubuntu-latest` |
| Environment variable `AUTOTUNE_TIMEOUT_MINUTES` | Overall queue + execution budget, default 240, maximum 300 |

Use environment required reviewers for this public repository: PR data can
request execution of model code and host mounts on private GPU infrastructure.
Review the exact commit's variants and validation sidecar before releasing the key.
Do not save a contest token on the validation account unless forwarding these
ordinary submissions to that contest is intended.

Configure branch protection to require `autotune/track-validation` and retain
the existing schema/Helm checks. A schema or Helm pass alone is not a runtime
pass. PRs without new variants get a successful no-work status. Missing API
configuration for a PR with new variants fails; it never silently skips GPU
validation. No secrets are needed locally to run the tests.

## Existing API contract used unchanged

All requests below use `X-API-Key`; URLs are relative to `/api`.

| Method and path | Purpose |
| --- | --- |
| `GET /baseline-hub/tracks/{slug}` | Verify model, accepted image, hardware, benchmark and board verdict |
| `POST /baseline-hub/parse` | Normalize catalog CLI flags using the same parser as the submission UI |
| `POST /baseline-hub/tracks/{slug}/submissions` | Submit `name`, `image`, `engine_args`, `extra_env`, `extra_volumes`, `machine_count`, `notes` |
| `GET /baseline-hub/submissions` | Recover existing submissions by a deterministic marker in notes |
| `GET /baseline-hub/submissions/{id}` | Poll existing queued/running/measured/failed/aborted states |
| `POST /baseline-hub/submissions/{id}/abort` | Stop superseded or timed-out work through existing cleanup |

Only `measured` with `latest_measurement.passed == true`, `feasible != false`
and an eligible matching board row is a pass. The board adds existing quality
floors, benchmark comparability and scenario gates. There is no additional
performance-regression threshold and no comparison run against baseline.
Changing the benchmark during validation requires a rerun.

## Scope and operational behavior

- This validates engine replay on autotune, **not Swiss deployment**. Chart
  probes, lifecycle, scratch/shm sizing and Kubernetes/RDMA placement are not
  reproduced; keep the independent Helm check. Unknown chart/model settings,
  secret-backed env and unrepresentable mounts fail explicitly.
- The catalog's exact image reference (including digest, when present) must be
  registered in the track's image list. An administrator can add that reference
  using the existing track settings. CI never strips a digest or swaps a mirror.
- GPU product checking uses the exporter's current A100/H100/H800/B300 mapping.
  Extend the adapter and its tests for other hardware. The original track fixes
  weights; the replay does not independently attest the Hugging Face revision.
- Configuration IDs are scoped to a model across published versions. PR head,
  variant configuration, track benchmark and workflow attempt identify a run.
  Repeated invocation of the same attempt recovers its existing submission;
  GitHub **Re-run jobs** increments the attempt and intentionally runs again.
- GitHub concurrency serializes this workflow per PR. The existing create API
  has no atomic idempotency key: POST is not automatically retried after an
  ambiguous network failure. Check the track entry before rerunning. This is
  best-effort deduplication, not an exactly-once delivery guarantee.
- CI watches for PR closure or a new head while waiting, handles cancellation
  signals, and requests abort for active work in `finally`. The next invocation
  cancels older active submissions bearing this PR's marker. Forced runner loss
  can prevent cleanup; use the ordinary submission abort action and configured
  track run limit. API/runner outages and GPU queue timeout fail the check.
- Public artifacts contain only references and verdicts, not internal API keys,
  raw benchmark data, host paths or private report URLs.

Run the contract tests with:

```bash
node --test hack/lib/autotune-validation.test.js
```

Before enabling the merge requirement, use one real export PR to confirm runner
connectivity, service-account permissions, exact image registration, successful
measurement, failing measurement and cancellation. Unit/HTTP-double tests do
not replace that GPU smoke test.

## Exporter rollout

Deploy the platform API and frontend containing the export changes. The existing
`POST /api/catalog-export/preview` response adds `validation_path` and
`validation_text`; its request and YAML output are unchanged. The frontend adds
an explicit validation-file download and reminds users to submit both files.
No worker update or database migration is needed. Campaign-only runs without
an original track keep their existing YAML export, with no sidecar and an
explanatory warning. Old exports intended for this CI must be exported again.

The public platform changes live in the llm-autotune repository; publish that
revision and update the internal distribution's upstream pin during rollout.
