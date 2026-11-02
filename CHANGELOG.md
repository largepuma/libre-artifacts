# Changelog

English | [中文](./CHANGELOG.zh.md)

## 1.1.0 - 2026-11-02

Brings in the upstream project's releases 2.4.0 to 2.7.1 for the four editors (the details: [CHANGELOG.upstream.md](./CHANGELOG.upstream.md)). `libre-motion` does not have these yet.

### Features
- Share on your local network: `share <root>` (or `open <root> --lan`) prints a link per role (editor, commenter, viewer); the owner gets a **Share** panel to manage who is in. Each skill has its own port: slides 4710, design 4720, design system 4730, dashboard 4740.
- Version history: every change is kept in the project's `history/` folder with who made it; the **History** button compares, previews and restores versions. Two people's edits to one slide, artboard or file are merged, and a notice offers **Compare** and **Bring back** when one save replaced another's change.
- Who is here: avatars, and in slides and canvas, each person's slide or artboard, cursor and selection.
- An **Export** tab in Share lists every download (slides: PDF, HTML, PNG, PPTX); every editor can download the whole folder as a zip, also as `archive <root>`. Slides and design exports carry their fonts.
- `libre-dashboard`: comments, like the other editors.
- Slides and design: the **Theme** tab links to a read-only page for the design system in use.
- A new project gets a default `.gitignore` the first time an editor opens it; each `SKILL.md` has a "Keeping it in git" section.

### Fixes
- `libre-slides`: choosing **PDF** in the Download dialog no longer crashes the page.
- `open` works beside a TUN-mode proxy; a save that omits its base version is refused on conflict instead of overwriting.

### Maintenance
- `tools/rename-from-upstream.mjs` applies this repo's renames to skills taken from an upstream release. Upstream's DeepSeek Harness plugins and their publishing are not carried over.

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
