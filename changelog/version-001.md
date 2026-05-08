# version-001 Changelog

## 初始化能力

- 创建项目基础目录：assets、captions、prompts、compositions、scripts、edit-notes、changelog、output、Skill 目录。
- 添加 `edit.config.json`，统一管理分辨率、时长、字幕路径、安全区和剪辑规则。
- 添加中文示例 SRT 字幕和字幕解析脚本。
- 添加基础剪辑计划生成脚本，输出 subtitles、callouts、cameraMoves、overlays。
- 添加 HyperFrames HTML composition：`compositions/version-001.html` 与 `compositions/current.html`。
- 添加版本创建脚本，后续可以从 current 生成 version-002、edit-notes 和 changelog。
- 添加项目校验脚本，检查目录、关键文件、Node.js、FFmpeg 和真实视频素材状态。

## 可运行命令

- `npm run parse`
- `npm run plan`
- `npm run validate`
- `npm run build:demo`
- `npm run preview`
- `npm run render`
- `npm run version:new`

## 当前已知限制

- 当前环境未安装 FFmpeg，`validate` 会给出 warning，`render` 会因此无法完成 MP4 编码。
- npm registry 对 `hyperframes` 包返回 403，当前环境无法实际拉取 HyperFrames CLI；需要在可访问 npm 的环境中验证 preview/render。
- 第一阶段不接真实视频素材，composition 使用占位画面。
- 自然语言需求尚未接入 LLM，只预留 prompt 文件和 edit-plan 结构。

## 下一版建议

- 解决 FFmpeg 与 npm registry 访问问题后，补充 HyperFrames lint/snapshot/render 验证。
- 将 `captions/edit-plan.json` 动态注入 composition，减少手写重复。
- 接入真实 `assets/raw/main.mp4`，让 composition 在有素材时使用真实视频、无素材时保留占位。
- 基于 `prompts/feedback.md` 实现局部微调脚本。
