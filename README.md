# zz-auto-edit：基于 HyperFrames 的自动剪辑 MVP

这是一个从 0 搭建的“自动剪辑工具”工程骨架。它的目标不是先做复杂 UI，而是先把一条短视频自动剪辑流程跑通：放入口播素材、放入带时间戳的中文字幕、写自然语言剪辑需求，然后生成可预览、可导出、可继续迭代的 HyperFrames composition。

> 当前环境检查结果：Node.js 为 v24.15.0，满足 `>=22`；当前容器没有 FFmpeg；当前 npm registry 对 `hyperframes` 包返回 403，因此本环境里 `preview/render` 不能完成实际 HyperFrames 拉取与 MP4 导出。代码仍按 HyperFrames 官方 CLI 方式配置：`npx hyperframes preview .` 与 `npx hyperframes render -c compositions/current.html -o output/version-001.mp4`。

## 1. 这个工具是干什么的

它面向中文口播短视频，例如知识类、工具类、广告素材开头。你提供：

1. 原始口播视频素材。
2. `.srt` 中文字幕。
3. 一段自然语言剪辑需求。

项目会先解析字幕，再生成基础剪辑计划，然后用 HyperFrames HTML composition 表达视频画面、字幕、大字、轻微镜头运动和占位叠加元素。

## 2. 当前 MVP 能做到什么

- 解析中文 SRT 字幕，输出结构化 JSON。
- 根据字幕和配置生成 `captions/edit-plan.json`。
- 提供 15 秒、1920x1080、16:9 的 HyperFrames HTML composition。
- 没有真实视频时，自动使用画面占位区模拟口播人物。
- 保留人物安全区，字幕和大字不会覆盖中间人物区域。
- 提供每一版的 edit-notes 和 changelog。
- 提供创建下一版的脚本，避免覆盖旧版本。
- 提供可沉淀为自动剪辑风格规则的 Skill 文件。

## 3. 现在还不能做到什么

- 还没有接入真实 LLM 理解自然语言需求。
- 还没有做复杂 UI 或批量处理。
- 当前 composition 暂未动态读取 `edit-plan.json`，第一版先保持一个可渲染、可审阅的静态 HTML composition。
- 当前环境缺少 FFmpeg，且 npm registry 拉取 HyperFrames CLI 受阻，所以本容器中不能完成 MP4 导出；在本机或 CI 中安装 FFmpeg 并能访问 npm 后即可验证。

## 4. 项目目录结构说明

```text
.
├── README.md
├── package.json
├── edit.config.json
├── assets/                 # 原始视频、音频、图片素材；真实素材不提交 Git
├── captions/               # SRT、解析后的字幕和剪辑计划
├── prompts/                # 自然语言剪辑需求和下一轮反馈
├── compositions/           # HyperFrames HTML composition
├── scripts/                # 字幕解析、计划生成、校验、版本创建脚本
├── edit-notes/             # 每版剪辑说明
├── changelog/              # 每版变更记录
├── output/                 # 导出 MP4；不提交 Git
└── .agents/skills/         # 后续可复用的自动剪辑 Skill
```

补充说明：仓库根目录还包含 `index.html`，内容与 `compositions/current.html` 同步，用于兼容 HyperFrames 默认从项目根目录预览 `index.html` 的工作方式。

## 5. 第一次怎么运行

请先确认本机环境：

```bash
node -v
ffmpeg -version
```

要求：

- Node.js：`>=22`
- FFmpeg：必须可用，导出 MP4 时需要

然后安装依赖并生成第一版数据：

```bash
npm install
npm run build:demo
```

`build:demo` 会依次执行：

1. `npm run parse`：解析 SRT。
2. `npm run plan`：生成剪辑计划。
3. `npm run validate`：检查项目结构和环境。

## 6. 如何替换成自己的视频

把你的口播视频放到：

```text
assets/raw/main.mp4
```

如果你想用别的路径，请修改 `edit.config.json`：

```json
"rawVideoPath": "assets/raw/main.mp4"
```

注意：`assets/raw/*` 已被 `.gitignore` 忽略，真实素材不会提交到 GitHub。

## 7. 如何放 SRT 字幕

默认字幕文件是：

```text
captions/sample.srt
```

格式示例：

```srt
1
00:00:00,000 --> 00:00:03,000
这个视频开头所有的剪辑和动画效果，都是 AI 完成的
```

替换后运行：

```bash
npm run parse
```

解析结果会写入：

```text
captions/parsed-captions.json
```

## 8. 如何写自然语言剪辑需求

把需求写在：

```text
prompts/edit-request.md
```

当前 MVP 已放入示例需求。第一阶段 `build-edit-plan.js` 还不会真正调用 LLM，但代码结构已经预留 `generatedFrom: [parsedCaptionPath, prompts/edit-request.md]`，后续可以把这里接入模型能力。

## 9. 如何生成第一版

运行：

```bash
npm run build:demo
```

它会生成或刷新：

- `captions/parsed-captions.json`
- `captions/edit-plan.json`

第一版 composition 已在：

- `compositions/version-001.html`
- `compositions/current.html`
- `index.html`

## 10. 如何预览

在能访问 npm registry 的环境中运行：

```bash
npm run preview
```

它会执行：

```bash
npx hyperframes preview . --port 3002
```

HyperFrames 会启动预览服务，并读取根目录 `index.html`。如果你只修改了 `compositions/current.html`，请同步复制到 `index.html`，或后续把项目改造成更自动的同步流程。

## 11. 如何导出

在 FFmpeg 可用、HyperFrames CLI 可拉取的环境中运行：

```bash
npm run render
```

它会执行：

```bash
npx hyperframes render -c compositions/current.html -o output/version-001.mp4 --fps 30 --quality standard
```

导出文件会写入 `output/`，并且不会提交 Git。

## 12. 如何做下一轮反馈

1. 把反馈写入 `prompts/feedback.md`。
2. 创建下一版：

```bash
npm run version:new
```

脚本会从 `compositions/current.html` 复制生成下一版，例如：

- `compositions/version-002.html`
- `edit-notes/version-002.md`
- `changelog/version-002.md`

然后只针对反馈里的时间段做局部微调，不要推翻整条视频。

## 13. 常见问题

### Node 版本不够

现象：`npm run validate` 报 Node.js 版本小于 22。

解决：安装 Node.js 22 或更高版本。推荐使用 nvm：

```bash
nvm install 22
nvm use 22
```

### FFmpeg 不可用

现象：`npm run validate` 出现 FFmpeg warning，或 `npm run render` 无法导出 MP4。

解决：安装 FFmpeg，并确保命令行可以执行：

```bash
ffmpeg -version
ffprobe -version
```

### 没放真实视频

现象：`npm run validate` 提示 `assets/raw/main.mp4` 不存在。

这是 warning，不会阻断 demo。当前 composition 会使用内置占位画面。要接真实视频，请把文件放到 `assets/raw/main.mp4`。

### 字幕没解析出来

请检查：

1. `edit.config.json` 的 `captionPath` 是否正确。
2. SRT 是否包含序号、时间轴、正文。
3. 时间格式是否类似 `00:00:03,000 --> 00:00:06,000`。

然后重新运行：

```bash
npm run parse
```

### 导出失败

优先检查：

1. FFmpeg 是否可用。
2. npm 是否能拉取 `hyperframes` CLI。
3. composition 是否存在：`compositions/current.html`。
4. 是否能先运行 `npm run validate`。

如果 npm registry 对 `hyperframes` 返回 403，需要换到可访问 npm 官方 registry 的网络或私有镜像，并重新运行 `npm run render`。

## 14. 下一阶段计划

- 让 composition 动态读取 `captions/edit-plan.json`，减少手写同步。
- 接入真实视频素材，有素材时用 `<video>`，无素材时自动回退占位画面。
- 接入 LLM，把 `prompts/edit-request.md` 转换成更智能的 callouts、cameraMoves 和 overlays。
- 根据 `prompts/feedback.md` 自动生成局部修改建议和新版 changelog。
- 增加 HyperFrames `lint`、`snapshot` 和视觉安全区检查。
- 把 `.agents/skills/zz-douyin-auto-edit-hook/SKILL.md` 扩展成可复用自动剪辑 Skill。
