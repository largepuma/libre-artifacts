#!/usr/bin/env node
// Apply libre-artifacts' renames to skill folders taken from upstream JimLiu/baoyu-design.
//
// Usage: node tools/rename-from-upstream.mjs [skills/<name> …]   (default: the four editor skills and dataviz)
//
// Port an upstream release: merge its tag (upstream tags are fetched to refs/upstream-tags/*), replace
// skills/libre-{slides,design,design-system,dashboard} and skills/dataviz with upstream's
// skills/claude-* and skills/dataviz of that tag, run this script, then `npm test` and open each editor.
// It is idempotent: a second run changes nothing.
import fs from "node:fs";
import path from "node:path";

const repo = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["skills/libre-slides", "skills/libre-design", "skills/libre-design-system", "skills/libre-dashboard", "skills/dataviz"];

const NOTICE_URL = "https://github.com/largepuma/libre-artifacts/blob/main/NOTICE.md";
const SKILL = /claude-(slides|design-system|design|dashboard|motion)\b/g;

// Text files: skill names, the env var, the .gitignore header, NOTICE links, pointers to the archived skill.
const TEXT_RULES = [
  [SKILL, "libre-$1"],
  [/\$CLAUDE_DESIGN_SYSTEMS\b/g, "$LIBRE_DESIGN_SYSTEMS"],
  [/(?<!LIBRE_DESIGN_SYSTEMS \?\? )process\.env\.CLAUDE_DESIGN_SYSTEMS \?\? ""/g, 'process.env.LIBRE_DESIGN_SYSTEMS ?? process.env.CLAUDE_DESIGN_SYSTEMS ?? ""'],
  [/# Written by baoyu-design when/g, "# Written by libre-artifacts when"],
  [/https:\/\/github\.com\/JimLiu\/baoyu-design\/blob\/main\/NOTICE\.md/g, NOTICE_URL],
  [/ A free-form HTML style guide, UI kit or token page is baoyu-design's\./g, " Not for a free-form HTML style guide, UI kit or token page."],
  [/ A one-off HTML prototype\n(\s*)or design exploration outside this format is baoyu-design's\./g, " Not for a one-off HTML prototype\n$1or design exploration outside this format."],
  [/ A one-off single-file HTML deck or prototype is baoyu-design's\./g, " Not for a one-off single-file HTML deck or prototype."],
  [/Not for a static HTML mockup or a picture of a dashboard: that is the baoyu-design skill\./g, "Not for a static HTML mockup or a picture of a dashboard."],
];
// Built bundles: only the one sentence that names a skill. Their "claude-design" app ids and
// "claude-motion-source" format are data written into files, and stay.
const BUNDLE_RULES = [[/the claude-design-system skill/g, "the libre-design-system skill"]];

const isBundle = (rel) => /\/scripts\/editor\/(assets|artifact-type)\/[^/]+\.js$/.test(rel) || rel.endsWith(".cjs");
const isText = (rel) => /\.(md|mjs|js|html|txt|json|css)$/.test(rel);

let changed = 0;
const walk = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full);
    else if (e.isFile()) {
      const rel = path.relative(repo, full);
      if (!isText(rel)) continue;
      const rules = isBundle(rel) ? BUNDLE_RULES : TEXT_RULES;
      const before = fs.readFileSync(full, "utf8");
      let after = before;
      for (const [re, to] of rules) after = after.replace(re, to);
      if (after !== before) {
        fs.writeFileSync(full, after);
        changed++;
        console.log(`renamed in ${rel}`);
      }
    }
  }
};
for (const t of targets) walk(path.resolve(repo, t));
console.log(`${changed} file(s) changed`);
