# Server API

[`openapi.yaml`](openapi.yaml) describes the HTTP API of the catalog's two servers (OpenAPI 3.1). Each
operation's `x-served-by` names the servers that have it.

| server            | run with                            | serves                                                                                                         |
| ----------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `server/`         | `npm run serve`                     | this checkout's catalog, read-only; the GitHub Pages site is a static snapshot of it                           |
| `catalog-server/` | `npm --prefix catalog-server start` | a catalog's git repository: the same reads, plus old revisions, `/healthz` and the `api/v2/` write API (token) |

Both serve the same reads at the same paths: `index-v2.json`, and each variant's file, `history.json` and perf
reports. `server/` also serves the v1 `index.json`.

A revision's file, commit and source are linked through the index's `raw` and `repo`, never the server's address:
`{raw}{commit}/{path}`, `{repo}/commit/{sha}`, `{repo}/blob/{commit}/{path}`. For `server/` these are GitHub's;
catalog-server serves them itself (`raw/`, `commit/`, `blob/`).

## HTML

From the repository root:

```sh
npx @redocly/cli build-docs docs/openapi.yaml -o api.html   # one self-contained page
npx @redocly/cli preview-docs docs/openapi.yaml             # a live preview, while editing
```
