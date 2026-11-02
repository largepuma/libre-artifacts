# Notices

libre-artifacts holds material under three different sets of terms. The MIT License in [LICENSE](LICENSE) covers only the first.

[中文说明](#中文说明)

## 1. The maintainers' own work: MIT

Copyright (c) 2026 Jim Liu 宝玉 and Copyright (c) 2026 largepuma, under the MIT License in [LICENSE](LICENSE). Jim Liu 宝玉 wrote this work in [JimLiu/baoyu-design](https://github.com/JimLiu/baoyu-design), of which libre-artifacts is a fork; largepuma's changes since are under the same license.

- The local tooling: each skill's `scripts/artifact.mjs` and, where there is one, `scripts/server.mjs` (the command line and the local editor server), the local comments, and what lets the editors run on a local machine instead of claude.ai, including each editor's `local-host.js`.
- The parts of the skills' text written for local agents: how to open and run the editors, local paths and files, comments.
- The READMEs, the changelogs, the images in `assets/`, the files in `.github/`, `tests/` and `examples/`.

## 2. Material from Anthropic: not MIT

libre-artifacts brings claude.ai's Artifact types to local agents, so much of what it ships comes from Anthropic, PBC. That material stays Anthropic's. Anthropic has published no license for it, and this project grants none: the MIT License does not apply to it. It is included so the skills work as they do on claude.ai. This project is independent and is not affiliated with or endorsed by Anthropic.

- **Skill instructions.** Each `skills/libre-*/SKILL.md` adapts the SKILL.md of a claude.ai Artifact type (Slides, Design, Design System, Dashboard, Motion). The local-agent changes are described in section 1.
- **Reference docs.** `skills/*/artifact-type/reference/`, and the copies under `scripts/editor/artifact-type/`: the craft, format, layout, motion and sound guides, font lists and other references of the Artifact types.
- **The `dataviz` skill.** `skills/dataviz/` is Anthropic's dataviz skill. Its palette validators include code from Color.js (MIT, Lea Verou and Chris Lilley), credited in the files.
- **The editors.** `skills/libre-*/scripts/editor/` holds the editors and the Motion player from the claude.ai Artifact-type runtimes: their interface, wording and behaviour are Anthropic's. The built files mix that with the local additions (section 1) and with open-source packages (section 3).
- **Icon fonts.** The Anthropicons icon fonts: the `anthropicons-*.woff2` files in the editors' `assets/` folders, and the Anthropicons font faces embedded as data URIs in the editors' CSS.

## 3. Third-party open-source code

The editors bundle open-source packages, such as React, Base UI, d3, pptxgenjs and Mediabunny. Each keeps its own license, which this project's license does not replace. The licenses are in each editor's `scripts/editor/third-party-licenses.txt`, and for the slides compiler in `scripts/editor/node/third-party-licenses.txt`. The fonts built into the Motion player are under the SIL Open Font License 1.1, listed in the player's `index.html`.

## Questions and removal

If you hold rights in anything here and want it credited differently, changed or removed, open an issue at <https://github.com/largepuma/libre-artifacts/issues>.

## 中文说明

本仓库里的内容分三类，许可各不相同。[LICENSE](LICENSE) 里的 MIT 许可只管第一类。

1. **维护者自己写的部分，MIT。** 版权归 Jim Liu 宝玉（写于 libre-artifacts 所 fork 的 [JimLiu/baoyu-design](https://github.com/JimLiu/baoyu-design)）和 largepuma（此后的改动，许可相同）。包括：本地命令行和编辑器服务器（各技能的 `scripts/artifact.mjs`，以及有的技能带的 `scripts/server.mjs`）、本地评论、让编辑器离开 claude.ai 在本机运行的那部分代码（含各编辑器的 `local-host.js`）；技能说明里为本地 Agent 写的部分；README、更新日志、`assets/` 里的图片、`.github/`、`tests/` 和 `examples/`。
2. **取自 Anthropic 的部分，不适用 MIT。** 权利归 Anthropic。Anthropic 没有为这些内容公开许可，本项目也不授予任何许可。包括：
   - 各 `skills/libre-*/SKILL.md` 所改编的 Artifact 类型（Slides、Design、Design System、Dashboard、Motion）技能说明；
   - `artifact-type/reference/` 里的参考文档；
   - `skills/dataviz/`（Anthropic 的 dataviz 技能）；
   - `scripts/editor/` 里取自 claude.ai 运行时的编辑器和 Motion 播放器（界面、文案和行为）；
   - Anthropicons 图标字体（`anthropicons-*.woff2` 文件，以及编辑器 CSS 里内嵌的字体）。
3. **第三方开源代码，各按原许可。** 编辑器打进去的开源包（React、Base UI、d3、pptxgenjs、Mediabunny 等）的许可见各编辑器的 `scripts/editor/third-party-licenses.txt`；Motion 播放器内置的字体为 SIL Open Font License 1.1，列在播放器的 `index.html` 里。

本项目是独立的社区项目，与 Anthropic 无隶属或背书关系。权利人希望调整署名、修改或移除某部分内容，请在 <https://github.com/largepuma/libre-artifacts/issues> 提 issue。
