# Changelog

English | [中文](./CHANGELOG.zh.md)

## 1.0.1 - 2026-11-02

### Documentation
- New `NOTICE.md` sets out the license of each part, after the upstream project's. The MIT License covers only the maintainers' own work (the local tooling, the docs, tests and examples). The material from Anthropic (the skill text and references adapted from the Artifact types, `dataviz`, the editors and the Motion player, the Anthropicons icon fonts) stays Anthropic's and is not under MIT; bundled open-source code keeps its own licenses. 1.0.0's README said wrongly that everything but the editors was MIT. `LICENSE`, the READMEs and every `SKILL.md` (a `license` line) now point to `NOTICE.md`.
- `libre-dashboard` ships the licenses of its open-source packages in `scripts/editor/third-party-licenses.txt`, like the other editors.

## 1.0.0 - 2026-11-02

First release as **libre-artifacts**, continuing from [JimLiu/baoyu-design](https://github.com/JimLiu/baoyu-design) v2.3.0 (its history: [CHANGELOG.upstream.md](./CHANGELOG.upstream.md)).

### Features
- `libre-motion`: short animated films in the Motion artifact format, played, scrubbed and exported (MP4, GIF) in the bundled Motion player on this machine.

### Changes
- Skills renamed: `claude-slides` → `libre-slides`, `claude-design` → `libre-design`, `claude-design-system` → `libre-design-system`, `claude-dashboard` → `libre-dashboard`. `dataviz` keeps its name.
- `LIBRE_DESIGN_SYSTEMS` names extra design-system folders; `CLAUDE_DESIGN_SYSTEMS` is still read when it is unset.
- The archived `baoyu-design` skill is no longer in the repo (it remains in the git history and upstream).
- Tests now smoke-test every skill's scripts and check the sample projects (`examples/night-market`, a Motion film).
