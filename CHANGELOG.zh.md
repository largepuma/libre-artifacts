# 更新日志

[English](./CHANGELOG.md) | 中文

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
