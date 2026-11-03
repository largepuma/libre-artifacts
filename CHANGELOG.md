# Changelog

English | [中文](./CHANGELOG.zh.md)

## 1.3.0 - 2026-11-03

Brings in the upstream project's releases 2.7.2 to 2.8.2 (the details: [CHANGELOG.upstream.md](./CHANGELOG.upstream.md)). `libre-motion` is now upstream's Motion skill, which has gone further than this repo's own port of the player.

### Features
- `libre-motion`: comments on a moment of the film, sent to the agent like in the other editors; a voice track for long narrated films (up to 15 minutes), with captions that follow it; recorded music beds; `export` to MP4 from the command line, `stills`, `score`, and `record` for filming a page of your own product. Films made with 1.2.0 still open.
- `motion-director`, a new skill that directs a film with something to say: it finds the point, writes the narration, has it voiced, times the scenes to the words and reviews the frames. It needs `libre-motion` beside it.
- All the open artifacts of a kind share one server and port, each at its own `/<kind>/<id>/` address. Share links from earlier versions stop working.
- Slides and design: an installed design system says when it has fallen behind its source, and **Sync** (or `ds-sync <root>`) copies it again.

### Fixes
- `libre-slides`: Chinese, Japanese and Korean text in a PowerPoint export no longer shows as boxes when the reader's computer lacks its font.
- `share <root> --disable`, `--enable`, `--reset` and `--role` no longer open the page to the network.

### Documentation
- The README opens with a 22-second demo film and a 30-second quick start, describes the project as a local tool, and has a new screenshot of the Motion player.

## 1.2.0 - 2026-11-02

### Features
- `libre-motion`: the player now shares on your local network like the other editors: `share <root>` (or `open <root> --lan`) prints a link per role, and the **Share** button at the top right of the film manages who is in. It has no comments, so the commenter role only watches.
- `libre-motion`: version history. Every change, the agent's included, is kept in the film's `history/` folder; the **History** button lists versions by person, previews the film as it was, and restores a version or one document.
- `libre-motion`: who's-here avatars (the agent shows up while it writes), and the whole folder as a zip from the Share panel's Export tab or `archive <root>`.
- `libre-motion`: the player now has a fixed default port, 4760, and a stable page address, `/motion/<id>/`. A new film folder gets a default `.gitignore`.

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
