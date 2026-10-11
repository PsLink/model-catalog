#!/usr/bin/env node
// The catalog server: this checkout as a catalog, live from models/, at the
// paths the published site has them.
//
//   GET /index.json                    the index swiss reads, built per request
//   GET /models/<name>/<file>.yaml     the version files it names
//   GET /models/<name>/<report>.html   perf reports
//   GET /catalog.json                  what the web app renders from
//
//   npm run serve                      # http://127.0.0.1:8000
//   npm run serve -- 9000
//   swiss catalog list --catalog http://127.0.0.1:8000
//
// npm run dev:site starts one too, as the backend its pages fetch from.
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { root, modelsDir } = require("../hack/lib/catalog");
const { loadCatalog, buildIndex, serializeIndex } = require("./data");

const TYPES = { ".json": "application/json", ".yaml": "text/yaml; charset=utf-8", ".html": "text/html; charset=utf-8" };

// A catalog server. catalog.json is built once and again after an edit under
// models/: it reads git for every version file, which takes a few seconds.
// index.json is cheap, so it is always built fresh.
function createServer() {
  let catalog = null;
  const watcher = fs.watch(modelsDir, { recursive: true }, () => (catalog = null));

  const server = http.createServer((req, res) => {
    const send = (status, type, body) => {
      res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        // A public catalog: any page may read it.
        "Access-Control-Allow-Origin": "*",
      });
      res.end(req.method === "HEAD" ? undefined : body);
    };
    if (req.method !== "GET" && req.method !== "HEAD") return send(405, "text/plain", "GET only\n");
    let url;
    try {
      url = decodeURIComponent(new URL(req.url, "http://catalog").pathname);
    } catch {
      return send(400, "text/plain", "bad path\n");
    }
    try {
      if (url === "/index.json") return send(200, TYPES[".json"], serializeIndex(buildIndex()));
      if (url === "/catalog.json") return send(200, TYPES[".json"], JSON.stringify((catalog ??= loadCatalog())));
      const file = path.join(root, url);
      if (/^\/models\/[^/]+\/[^/]+\.(yaml|html)$/.test(url) && file.startsWith(modelsDir + path.sep) && fs.existsSync(file)) {
        return send(200, TYPES[path.extname(file)], fs.readFileSync(file));
      }
      return send(404, "text/plain", "not in this catalog\n");
    } catch (err) {
      return send(500, "text/plain", `${err.message}\n`);
    }
  });
  server.on("close", () => watcher.close());
  return server;
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.argv[2] || process.env.PORT || 8000);
  // Every interface, so a swiss elsewhere on the network can read it.
  createServer().listen(port, "0.0.0.0", () => console.log(`catalog server: http://127.0.0.1:${port}/index.json`));
}
