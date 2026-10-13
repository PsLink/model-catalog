"use strict";
// What the pre-commit hook runs on the staged files, before validate:schema:
// each is formatted, then must parse (JavaScript) or type-check (the site's
// TypeScript). A failure stops the commit; lint-staged restores what it
// changed. Steps in a list run in order, so a check sees the formatted file.
module.exports = {
  "*.{js,cjs,mjs}": ["prettier --write", (files) => files.map((f) => `node --check ${JSON.stringify(f)}`)],
  // tsc checks the site as one project, not a file at a time: web/tsconfig.json
  // gives it the paths and types.
  "*.{ts,tsx,mts}": ["prettier --write", () => "tsc -p web"],
  "*.css": "prettier --write",
};
