# libre-artifacts

**可编辑的幻灯片、设计画布、设计系统、仪表盘和动画短片，运行在你自己的本地 Agent 上 —— Cursor、Claude Code、Codex，或任何能读写文件的编码 Agent。**

[English](README.md) · [简体中文](README.zh-CN.md) · [更新日志](CHANGELOG.zh.md)

[![License: MIT for own code, see NOTICE](https://img.shields.io/badge/License-MIT%20for%20own%20code%20%C2%B7%20see%20NOTICE-blue.svg)](NOTICE.md) ![Best with Opus 5.5](https://img.shields.io/badge/Best%20with-Opus%205.5-d97757) ![Harness](https://img.shields.io/badge/Cursor%20%C2%B7%20Claude%20Code%20%C2%B7%20Codex-supported-1f6feb)

本仓库把 claude.ai 的 **Artifact 类型**搬到本地 Agent 上：可编辑的幻灯片、设计画布、设计系统、数据仪表盘和动画短片，每一种都用它自己的编辑器打开，编辑器就运行在你的电脑上。还有一个技能 `dataviz` 是一份图表指南：Agent 在画任何图表之前先读它，不管是在这几个技能里还是别处。

> **非官方项目。** libre-artifacts 是社区项目，与 Anthropic 无隶属或背书关系。各技能沿用 claude.ai Artifact 类型的文件格式。

不依赖网站，不需要额外订阅，也不用上传。活儿由你机器上已有的 Agent 完成，所有产物都留在你自己的仓库里。

---

## 仓库里的技能

| 技能 | 产出 | 在哪里修改 |
|---|---|---|
| [`libre-slides`](skills/libre-slides/) | 幻灯片：`project/deck.json` 加上每页一个 HTML 文件 | 幻灯片编辑器：放映、改字、拖动；导出 PDF、HTML 或 PowerPoint |
| [`libre-design`](skills/libre-design/) | 一块画布上的多个画板：`project/canvas.json` 加上 `.dc.html` 设计组件 | 画布编辑器：并排查看画板、播放原型、改文案、调 tweaks；导出 HTML、PDF 或 PNG |
| [`libre-design-system`](skills/libre-design-system/) | 设计系统：tokens、README 品牌手册、组件预览、字体、素材分组 | 设计系统编辑器：浏览和编辑颜色、字体、组件和素材 |
| [`libre-dashboard`](skills/libre-dashboard/) | 数据驱动的仪表盘：数据集（CSV、TSV、JSON）加上基于它们的图表、数字和表格页面 | 仪表盘页面：实时图表、筛选，以及能把每个数字追溯到原始行的 Sources 面板 |
| [`libre-motion`](skills/libre-motion/) | 动画短片：若干场景模块，每一帧都是时间 t 的纯函数，外加一段用代码写的配乐 | Motion 播放器：播放、拖动、试听；在浏览器里导出 MP4 或 GIF |
| [`dataviz`](skills/dataviz/) | 在任何载体里（HTML、SVG、d3、matplotlib、plotly…）把图表做好：选图表形式、在浅色和深色下以及色弱读者都看得清的配色、图形标记、图例和提示框，附带配色校验脚本 | 不需要打开：Agent 写图表代码前先读它；把 [`palette.md`](skills/dataviz/references/palette.md) 换成你自己品牌的颜色即可 |

---

## Artifact 技能：可编辑的幻灯片、画布、设计系统与仪表盘

这四个技能按该 Artifact 类型自己的文件格式把内容写进一个文件夹，再用这个类型的编辑器页面打开它，编辑器就在你自己的电脑上运行。Agent 写文件，编辑器立刻显示每一次写入；你在编辑器里的修改也会存回同一批文件，所以你和 Agent 可以轮流改。

在幻灯片、画布、设计系统编辑器和仪表盘页面里，点击 **Comment**（或按 **C**）就能对元素或区域留下评论。评论保存在项目本地的 `comments.json`，Agent 通过 `artifact.mjs` 读取和回复。Agent 用 `comments <root> --wait` 等待评论时，编辑器会显示 **Send to Agent**，让你把评论交给它处理。

要和别人一起做，`share <root>`（或 `open <root> --lan`）把幻灯片、画布、设计系统或仪表盘开放到局域网（同一个 Wi‑Fi 或内网），每种角色打印一个链接：**editor** 能改也能评论，**commenter** 只能评论，**viewer** 只能看。拿到链接的人输个名字就进来了，他改的内容会出现在每个人的页面上，评论也写进同一份 `comments.json`。坐在这台电脑前的人是主人：**Share** 按钮里能看到谁加入了、谁在线，能改某个人的角色或把他移出去，能关掉、重新打开或重置每个链接。访客也有 Share 按钮，里面是他可以转发的链接：自己这一级和更低的角色。不用注册账号，内容不出你的网络；走的是局域网里的明文 http，网络里拿到链接的人都进得来。

每一次修改都存成一个版本，记着是谁改的：访客按他加入时填的名字，主人，或者 **Agent**（直接改这台电脑上的文件）。**History** 按钮（Share 旁边的时钟）按天列出所有版本；点开一个版本能看到它改了哪几页、哪块画板或哪份文档，逐行对比改动，也能预览当时的整体样子，或者把整个版本（也可以只挑其中一处）恢复回来，恢复本身也是一个新版本，什么都不会丢。两个人同时保存同一页时，后存的不会再悄悄盖掉先存的：这个版本会记下它覆盖了谁的修改，两个人都会收到提醒，可以**看看差别**、一键**找回**，找回的只是被盖掉的那部分，对方别处的修改照样留着。在幻灯片、设计稿和设计系统编辑器里，别人保存后你的页面就地更新，不再整页刷新；要是他存的正好是你还没保存的那一页、那块画板或那个文件，顶上会出一条提示，让你选用他的、保留你的，还是两份都留（你的另存成后面一页、旁边一块画板，或文件的一份副本）。两边会先合并：画布按元素，幻灯片和设计系统的文件按行（token 文件按 token）。两人改的是不同的元素或不同的行，两边的修改都留着，不用选；合不了（比如改到同一行）才出这条提示。历史存在项目的 `history/` 文件夹里。

别人开着同一个页面时，他们的头像排在 History 旁边。在幻灯片和画布编辑器里，点开能看到每个人在第几页、哪块画板、是不是正在改，页面上也有他们的光标和选中框；有人开始改你正在看的地方，会弹一句提醒，但什么都不会锁住。Claude 改文件的时候，也会出现在这一排里。

要备份、换电脑或者把项目交给别人时，主人在 Share 面板的 Export 标签里（只有主人有；访客可以转发链接，不能导出）选最后一项 **Whole folder (.zip)**，整个文件夹（连同版本历史和评论）打成一个 zip 下载下来；命令行里用 `artifact.mjs archive <root>` 也一样。解压到哪里都行，用同一个 skill `open` 就能接着做。这台电脑上的服务器状态和分享链接不在里面，所以发出去的副本不会自动分享，要它的新主人自己再分享。

`libre-motion` 的播放器也能这样分享，同样有版本历史、Agent 头像和 Whole folder (.zip) 导出（Share 和 History 按钮在画面右上角）。它没有评论功能，所以 `commenter` 角色在这里只能看；要改哪里，直接在对话里告诉 Agent 是第几秒、哪个元素。

### `libre-slides`：幻灯片

<img src="assets/screenshots/libre-slides-editor.webp" alt="libre-slides 编辑器里打开的一份讲睡眠的 5 页健康课幻灯片" width="880">

一套幻灯片就是 `project/deck.json` 加上每页一个 HTML 文件。在编辑器里可以全屏放映、直接改字、拖动元素，插入文字、图片、表格和形状，并导出成 PDF、HTML 或 PowerPoint。*上图：一份讲睡眠的 5 页健康课幻灯片，用的是一套示例设计系统。*

### `libre-design`：多画板画布

<img src="assets/screenshots/libre-design-canvas.webp" alt="libre-design 画布上并排的咖啡订阅落地页和它的手机版注册表单" width="880">

一块画布上并排放着多个画板：`project/canvas.json` 加上每个画板一个 `.dc.html` 设计组件。画板可以当成能交互的原型来播放，在画布上播或者全屏播；也可以改文案、调 tweaks、贴便签；整份设计能导出成独立的 HTML 页面、PDF 或 PNG 图片（1× 或 2×，多个画板打包成 .zip）。*上图：一个咖啡订阅服务的落地页首屏，旁边是它的手机版注册表单。*

### `libre-design-system`：设计系统

<img src="assets/screenshots/libre-design-system-editor.webp" alt="libre-design-system 编辑器里 Nimbus 设计系统的概览页" width="880">

一套设计系统包括 tokens、README 品牌手册、组件预览、字体和素材分组。在编辑器里可以浏览和编辑颜色、字体、间距、圆角、阴影、组件和素材。从组件库导入的设计系统，组件预览用的就是真组件，可以直接交互。幻灯片和画布可以安装它，之后编辑器的主题和颜色菜单就会列出它的颜色和文字样式。*上图：Nimbus，一套给天气应用做的小型设计系统。*

### `libre-dashboard`：数据仪表盘

<img src="assets/screenshots/libre-dashboard.webp" alt="libre-dashboard 页面里用示例数据做的 X 账号数据仪表盘" width="880">

一个仪表盘就是数据集（CSV、TSV 或 JSON）加上一页基于它们算出来的图表、数字和表格。图表是实时的，Sources 面板能把每个数字追溯到原始数据行。拿到新导出的数据交给 Agent，它会把文件换上，页面上的数字全部重算。数字、日期和说明文字都跟着你的语言走。*上图：一年的 X 账号每日数据，用的是示例数据。*

### `libre-motion`：动画短片

<img src="assets/screenshots/libre-motion.webp" alt="libre-motion 播放器里播放的一部 12 秒短片，内容是一个虚构的夜市，时间线上是它的三个场景" width="880">

一部影片由几个场景组成，每个场景是一小段 JavaScript 模块，按时间 `t` 画出当前帧；配乐由播放器在浏览器里实时合成。Agent 先问三个问题（风格、配色、时长），立即写出可以播放的粗剪，再一个场景一个场景地补全，你可以边看边等。拖动进度条、打开声音，在播放器里导出 MP4 或 GIF，全程不离开本机。*上图：一部 12 秒的虚构夜市预告片。*

### 运行编辑器

每个 `SKILL.md` 都基本原样保留了该类型的英文原版说明，只把 Artifact 工具的调用换成了本地的等价操作。这个工具就放在每个技能里，是 `scripts/artifact.mjs`（Node 20+，仪表盘需 Node 22+；无需安装依赖）。平时 Agent 会替你运行；手动运行的话：

```bash
node skills/libre-slides/scripts/artifact.mjs open designs/q3-review             # 启动编辑器，打印网址
node skills/libre-slides/scripts/artifact.mjs check designs/q3-review            # 校验文件
node skills/libre-slides/scripts/artifact.mjs upload designs/q3-review hero.jpg  # 存入图片，打印它的 /_blob/ 地址
node skills/libre-slides/scripts/artifact.mjs list                                 # 查找磁盘上的设计系统
node skills/libre-slides/scripts/artifact.mjs share designs/q3-review           # 开放到局域网，每种角色打印一个链接
```

仪表盘和影片也用同一个脚本（`write-db`、`read-db`、`upload`、`check`、`open`）写入它自己在 `<root>/db/` 下的存储。每个技能都运行自己的本地服务器，`scripts/` 里的文件都是预先构建好的 JavaScript，只要有 Node 就能运行，不用安装依赖，也不用构建。

---

## 为什么在本地跑

- **摆脱对网站的依赖。** 不必离开编辑器，就能用上 `claude.ai/design` 绝大部分的功能 —— 同一套方法论、同样的工艺标准、同样的产出格式。
- **搭配 Opus 5.5 效果最佳。** 这个技能本身是一份冗长且要求很高的设计指令，模型越强、效果越好。建议搭配 **Claude Opus 5.5** 获得最佳结果；在其他能力足够的模型上也能良好运行。
- **和 Agent 轮流改。** 每个编辑器都跑在 `localhost` 上，你在编辑器里的修改会存回 Agent 写的同一批文件。
- **在局域网里协作，不经过云。** 编辑器可以分享到局域网，每种角色一个链接；别人可以改、评论或旁观，谁能留下由你决定。版本历史能看出谁改了什么，任何一个版本都能恢复。
- **一切都归你所有。** 产物落在 `designs/<slug>/` 下，是可以纳入版本控制、二次分叉、导出或直接上线的普通文件。

---

## 快速开始

### 前置条件

- 一个本地 Agent —— **[Cursor](https://cursor.com)**、**[Claude Code](https://claude.com/claude-code)**、**[Codex](https://developers.openai.com/codex/)**，或安装器支持的其余 70+ 个 Agent（Cline、Roo Code、GitHub Copilot……）。其中 Cursor、Claude Code 与 Codex 在技能里内置了一等的工具参考文档。
- 模型选择 **Claude Opus 5.5**，效果最佳。
- **Node.js**，用于运行下面的 `npx` 安装器，以及 Artifact 技能的编辑器（Node 20+，仪表盘需 Node 22+）。

### 安装

**推荐方式 —— `skills` CLI。** [`npx skills`](https://github.com/vercel-labs/skills)（来自 Vercel Labs）会读取本仓库，找到 `skills/` 下的技能，并把它们放进所检测到的 Agent 对应的目录里：

```bash
# 安装到当前项目（自动检测你的 Agent）
npx skills add largepuma/libre-artifacts

# …或全局安装，对所有项目生效
npx skills add largepuma/libre-artifacts -g

# 指定某个具体的 Agent
npx skills add largepuma/libre-artifacts --agent claude-code
npx skills add largepuma/libre-artifacts --agent cursor
npx skills add largepuma/libre-artifacts --agent codex

# 先列出仓库里有哪些技能
npx skills add largepuma/libre-artifacts --list

# 只安装其中几个技能
npx skills add largepuma/libre-artifacts --skill libre-slides --skill libre-dashboard
```

它会把技能装到 Claude Code 的 `.claude/skills/`，以及 Cursor/Codex 风格 Agent 的 `.agents/skills/`（加上 `-g` 则装到 `~/` 级别的用户目录）。

### 更新

如果你是通过 `skills` CLI 安装的，可以在终端里更新：

```bash
# 更新某个技能（CLI 会提示选择安装范围）
npx skills update libre-slides

# 更新项目级或全局安装
npx skills update libre-slides -p -y
npx skills update libre-slides -g -y
```

`upgrade` 也可以作为别名使用。

也可以直接运行 `npx skills update` 来更新所有已安装的技能。更新后，请重启 Claude Code（或开启一个新的 Agent 会话），让新的技能文件被重新加载。

**备选方式 —— 直接把仓库 URL 发给 Agent。** 不想安装任何东西？把链接贴进对话，让 Agent 自己去拉取技能：

> 阅读 https://github.com/largepuma/libre-artifacts 并按照其中的 `skills/libre-slides/SKILL.md`，根据这份 PRD 做一套 10 页的幻灯片。

Agent 会 clone 或抓取该仓库、加载 `SKILL.md` 然后开干 —— 临时用一次特别合适。

### 开始使用

技能装好（或被抓取）之后，直接说你要什么（*「根据这份 PRD 做一套 12 页的幻灯片」*、*「把这个 CSV 做成仪表盘」*），或者点名调用：Claude Code 里用 `/libre-slides`、`/libre-design`、`/libre-design-system`、`/libre-dashboard` 或 `/libre-motion`，Codex 里用 `$libre-slides` 等。Agent 会把文件写到 `designs/<slug>/` 下，启动编辑器，再把它的 `http://127.0.0.1` 地址给你。

---

## 示例 Prompt

- *「用 libre-slides 做一套 Q3 复盘的幻灯片，然后导出成 PowerPoint。」*
- *「在 libre-design 画布上并排放一个落地页和它的手机版。」*
- *「把 Chakra UI 组件库做成一套设计系统，组件预览要能直接交互。」*
- *「把这份数据分析 CSV 做成仪表盘，对比最近 28 天和再往前 28 天。」*
- *「用这几张截图，给我们的 App 上线做一部 20 秒的 libre-motion 预告片。」*

想要最好的效果，**请给它设计上下文** —— 截图、设计系统或代码库。从真实上下文出发，是对质量影响最大的一个杠杆；如果你不提供，技能也会主动向你索要。

---

## 致谢与许可

libre-artifacts 由 Jim Liu 宝玉的 **[JimLiu/baoyu-design](https://github.com/JimLiu/baoyu-design)** fork 而来，经上游作者同意后改名独立发布，并新增了 `libre-motion`。上游截至 v2.7.1 的版本已合并进来，其历史保留在本仓库的 git 历史和 [CHANGELOG.upstream.zh.md](CHANGELOG.upstream.zh.md) 里。

libre-artifacts 是独立的社区项目，与 Anthropic 无隶属或背书关系，由 **[largepuma](https://github.com/largepuma)** 维护。仓库里的内容分三类，许可各不相同，详见 [NOTICE.md](NOTICE.md)：

- **维护者自己写的部分**（本地命令行和编辑器服务器、本地评论、文档、测试和示例）以 [MIT 许可证](LICENSE) 发布。
- **取自 Anthropic 的部分**权利归 Anthropic，不适用 MIT，本项目也不授予任何许可：包括改编自 Artifact 类型的技能说明和参考文档、`dataviz` 技能、取自 claude.ai 的编辑器和 Motion 播放器，以及 Anthropicons 图标字体。
- **第三方开源代码**各按原许可，列在各编辑器的 `scripts/editor/third-party-licenses.txt` 里。
