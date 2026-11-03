# 更新日志

[English](./CHANGELOG.md) | 中文

## 1.3.0 - 2026-11-03

引入上游项目 2.7.2 至 2.8.2 的版本（详见 [CHANGELOG.upstream.zh.md](./CHANGELOG.upstream.zh.md)）。`libre-motion` 现在就是上游的 Motion 技能：上游做得比本仓库自己移植的播放器更完整。

### 新功能
- `libre-motion`：可以对影片的某个时刻留评论并交给 Agent，和其他编辑器一样；长片（最长 15 分钟）可以带配音轨，字幕跟着配音走；能铺录好的配乐；命令行里可以用 `export` 导出 MP4，还有 `stills`、`score`，以及拍自己产品页面的 `record`。用 1.2.0 做的影片照样能打开。
- 新技能 `motion-director`：给有话要说的影片当导演，找准要说的那一点，写旁白、配音，让每一场对上台词，再检查画面。需要和 `libre-motion` 装在一起。
- 同一类打开的作品共用一个服务器和端口，各自在 `/<kind>/<id>/` 地址下。旧版本的分享链接会失效。
- 幻灯片和设计：装进来的设计系统落后于源头时会提示，点 **Sync**（或运行 `ds-sync <root>`）重新复制。

### 修复
- `libre-slides`：导出的 PowerPoint 里，中日韩文字在缺少对应字体的电脑上不再显示成方框。
- `share <root> --disable`、`--enable`、`--reset` 和 `--role` 不再把页面开放到局域网。

### 文档
- README 开头加了 22 秒的演示片和 30 秒上手说明，把项目描述成本地工具，并换了一张新 Motion 播放器的截图。

## 1.2.0 - 2026-11-02

### 新功能
- `libre-motion`：播放器也能像其他编辑器一样在局域网分享了：`share <root>`（或 `open <root> --lan`）为每种角色打印一个链接，画面右上角的 **Share** 按钮管理谁能进来。播放器没有评论功能，所以评论角色只能观看。
- `libre-motion`：版本历史。每次修改（包括 Agent 的）都存进动画的 `history/` 文件夹；**History** 按钮按人列出各个版本，可以预览当时的动画，也能恢复整个版本或其中一份文档。
- `libre-motion`：显示"谁在这里"的头像（Agent 写入时也会出现）；可以在 Share 面板的 Export 标签里把整个文件夹下载成 zip，命令行是 `archive <root>`。
- `libre-motion`：播放器有了固定的默认端口 4760 和不变的页面地址 `/motion/<id>/`；新的动画文件夹会写入默认的 `.gitignore`。

## 1.1.0 - 2026-11-02

为四个编辑器引入上游项目 2.4.0 至 2.7.1 的版本（详见 [CHANGELOG.upstream.zh.md](./CHANGELOG.upstream.zh.md)）。`libre-motion` 暂时还没有这些功能。

### 新功能
- 局域网分享：`share <root>`（或 `open <root> --lan`）为每种角色（编辑、评论、查看）打印一个链接；主人可在 **Share** 面板里管理谁能进来。每个技能有固定端口：幻灯片 4710、设计 4720、设计系统 4730、仪表盘 4740。
- 版本历史：每次修改都存进项目的 `history/` 文件夹，记着是谁改的；**History** 按钮可以对比、预览和恢复版本。两人改同一页幻灯片、同一个画板或同一个文件时会先合并；一次保存覆盖了别人的修改时，对方会收到带 **Compare** 和 **Bring back** 的提示。
- 谁在这里：显示头像；在幻灯片和画布里还能看到每个人所在的页面或画板、光标和选区。
- Share 里新增 **Export** 标签，列出所有可下载格式（幻灯片：PDF、HTML、PNG、PPTX）；每个编辑器都能把整个文件夹下载成 zip，命令行是 `archive <root>`。幻灯片和设计的导出文件会带上所用字体。
- `libre-dashboard`：和其他编辑器一样支持评论。
- 幻灯片和设计：**Theme** 标签链接到所用设计系统的只读页面。
- 编辑器第一次打开新项目时会写入默认的 `.gitignore`；每个 `SKILL.md` 增加了「Keeping it in git」一节。

### 修复
- `libre-slides`：在下载对话框里选 **PDF** 不再导致页面崩溃。
- `open` 在 TUN 模式代理旁也能正常工作；缺少起始版本的保存遇到冲突时会被拒绝，而不是直接覆盖。

### 维护
- 新增 `tools/rename-from-upstream.mjs`，把本仓库的改名应用到取自上游版本的技能上。上游的 DeepSeek Harness 插件及其发布流程没有带过来。

## 1.0.1 - 2026-11-02

### 文档
- 新增 `NOTICE.md`，参照上游项目写明各部分的许可：MIT 只管维护者自己写的部分（本地工具、文档、测试和示例）；取自 Anthropic 的部分（改编自 Artifact 类型的技能说明和参考文档、`dataviz`、编辑器和 Motion 播放器、Anthropicons 图标字体）权利归 Anthropic，不适用 MIT；打包进来的开源代码各按原许可。1.0.0 的 README 误称除编辑器外都是 MIT。`LICENSE`、README 和每个 `SKILL.md`（新增 `license` 一行）现在都指向 `NOTICE.md`。
- `libre-dashboard` 和其他编辑器一样，在 `scripts/editor/third-party-licenses.txt` 里附上所用开源包的许可。

## 1.0.0 - 2026-11-02

以 **libre-artifacts** 之名首次发布，承接 [JimLiu/baoyu-design](https://github.com/JimLiu/baoyu-design) v2.3.0（此前的历史见 [CHANGELOG.upstream.zh.md](./CHANGELOG.upstream.zh.md)）。

### 新功能
- `libre-motion`：Motion artifact 格式的动画短片，在本机自带的 Motion 播放器里播放、拖动，并导出 MP4、GIF。

### 调整
- 技能改名：`claude-slides` → `libre-slides`、`claude-design` → `libre-design`、`claude-design-system` → `libre-design-system`、`claude-dashboard` → `libre-dashboard`。`dataviz` 名字不变。
- 用 `LIBRE_DESIGN_SYSTEMS` 指定额外的设计系统目录；未设置时仍会读取 `CLAUDE_DESIGN_SYSTEMS`。
- 已归档的 `baoyu-design` 技能不再放在仓库里（git 历史和上游仍保留）。
- 测试改为对每个技能的脚本做冒烟测试，并检查示例项目（`examples/night-market`，一部 Motion 影片）。
