# 更新日志

[English](./CHANGELOG.md) | 中文

## 1.0.0 - 2026-11-02

以 **libre-artifacts** 之名首次发布，承接 [JimLiu/baoyu-design](https://github.com/JimLiu/baoyu-design) v2.3.0（此前的历史见 [CHANGELOG.upstream.zh.md](./CHANGELOG.upstream.zh.md)）。

### 新功能
- `libre-motion`：Motion artifact 格式的动画短片，在本机自带的 Motion 播放器里播放、拖动，并导出 MP4、GIF。

### 调整
- 技能改名：`claude-slides` → `libre-slides`、`claude-design` → `libre-design`、`claude-design-system` → `libre-design-system`、`claude-dashboard` → `libre-dashboard`。`dataviz` 名字不变。
- 用 `LIBRE_DESIGN_SYSTEMS` 指定额外的设计系统目录；未设置时仍会读取 `CLAUDE_DESIGN_SYSTEMS`。
- 已归档的 `baoyu-design` 技能不再放在仓库里（git 历史和上游仍保留）。
- 测试改为对每个技能的脚本做冒烟测试，并检查示例项目（`examples/night-market`，一部 Motion 影片）。
