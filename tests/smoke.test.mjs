// Smoke tests: every skill script parses and prints its help, and the sample projects pass check.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const skills = readdirSync(join(repo, "skills")).filter((s) => s.startsWith("libre-"));
const script = (skill) => join(repo, "skills", skill, "scripts", "artifact.mjs");
const run = (skill, args, cwd = repo) => spawnSync(process.execPath, [script(skill), ...args], { cwd, encoding: "utf8" });

for (const skill of skills) {
  test(`${skill}: scripts parse and help runs`, () => {
    for (const file of readdirSync(join(repo, "skills", skill, "scripts")).filter((f) => f.endsWith(".mjs"))) {
      execFileSync(process.execPath, ["--check", join(repo, "skills", skill, "scripts", file)]);
    }
    const help = run(skill, ["help"]);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, new RegExp(skill));
  });
}

test("libre-slides: the smoke deck passes check", () => {
  const root = mkdtempSync(join(tmpdir(), "libre-slides-"));
  try {
    cpSync(join(repo, "tests", "fixtures", "smoke-deck"), root, { recursive: true });
    const res = run("libre-slides", ["check", root]);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.equal(JSON.parse(res.stdout).problems, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("libre-motion: the Night Market example writes and passes check", () => {
  const root = mkdtempSync(join(tmpdir(), "libre-motion-"));
  try {
    const cwd = join(repo, "examples", "night-market");
    const write = run("libre-motion", ["write-db", root, "batch.json"], cwd);
    assert.equal(write.status, 0, write.stderr);
    const res = run("libre-motion", ["check", root]);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    const out = JSON.parse(res.stdout);
    assert.equal(out.problems, 0);
    assert.equal(out.stage, "final");
    assert.deepEqual(out.scenes.map((s) => s.module), ["written", "written", "written"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("libre-motion: check reports a scene that does not parse", () => {
  const root = mkdtempSync(join(tmpdir(), "libre-motion-"));
  try {
    const cwd = join(repo, "examples", "night-market");
    assert.equal(run("libre-motion", ["write-db", root, "batch.json"], cwd).status, 0);
    const bad = spawnSync(process.execPath, [script("libre-motion"), "write-db", root, "-"], {
      input: JSON.stringify([{ op: "set", path: "modules/scene-come.js", data: { kind: "js", text: "kit.scene('come', { render(t) { if ( } });" } }]),
      encoding: "utf8",
    });
    assert.equal(bad.status, 0, bad.stderr);
    const res = run("libre-motion", ["check", root]);
    assert.equal(res.status, 1);
    assert.match(JSON.stringify(JSON.parse(res.stdout).issues), /scene-come\.js.*does not parse/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
