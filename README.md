# zz-auto-edit

基于 HyperFrames 的自动剪辑 MVP。第一阶段已经跑通 demo 的字幕解析、剪辑计划、HTML composition、预览和导出骨架；第二阶段在不推翻重写的基础上，补齐 HyperFrames 规范性 warning 修复和真实视频素材接入能力。

## 当前能力

- demo 模式：使用 `captions/sample.srt` 和内置占位画面生成 `version-001`。
- real 模式：用户放入 `assets/raw/main.mp4` 和 `captions/main.srt` 后，自动探测视频信息、解析真实字幕、生成剪辑计划，并渲染到 `output/version-001.mp4`。
- 保留版本化结构：`compositions/version-001.html`、`compositions/current.html`、`scripts/create-version.js`、`edit-notes/`、`changelog/`。
- 真实素材和导出视频不提交 Git。

## 环境要求

- Node.js `>=22`
- FFmpeg / ffprobe：real 模式探测视频和 render 导出需要
- 可访问 HyperFrames CLI 的 npm 环境：`preview` / `render` 会通过 `npx hyperframes ...` 执行

检查命令：

```bash
node -v
ffmpeg -version
ffprobe -version
```

## edit.config.json 关键字段

```json
{
  "mode": "demo",
  "rawVideoPath": "assets/raw/main.mp4",
  "captionPath": "captions/main.srt",
  "demoCaptionPath": "captions/sample.srt",
  "outputName": "version-001.mp4",
  "autoDetectDuration": true,
  "fallbackDuration": 15
}
```

说明：

- `mode: "demo"`：读取 `demoCaptionPath`，使用占位画面，不要求 `main.mp4` 存在。
- `mode: "real"`：读取 `rawVideoPath` 和 `captionPath`，缺少 `main.mp4` 或 `main.srt` 会清晰失败。
- `autoDetectDuration: true`：real 模式用 ffprobe 读取真实视频时长，覆盖默认 15 秒。
- `fallbackDuration`：无法自动探测或 demo 模式下的兜底时长。

## Demo 模式怎么跑

适合第一次验证项目是否正常：

```bash
npm install
npm run build:demo
npm run preview
npm run render
```

`npm run build:demo` 会依次执行：

1. 解析 `captions/sample.srt`
2. 生成 `captions/edit-plan.json`
3. 生成/同步 `compositions/version-001.html`、`compositions/current.html`、`index.html`
4. 校验项目结构和 HyperFrames composition 规范

导出结果在：

```text
output/version-001.mp4
```

## 真实素材接入

### 1. 放视频

把你的主视频放到：

```text
assets/raw/main.mp4
```

### 2. 放字幕

把同一条视频对应的 SRT 字幕放到：

```text
captions/main.srt
```

SRT 示例：

```srt
1
00:00:00,000 --> 00:00:03,000
这个视频开头所有的剪辑和动画效果，都是 AI 完成的
```

### 3. 选择模式

方式 A：直接运行 real 命令，不需要改文件：

```bash
npm run build:real
```

方式 B：把 `edit.config.json` 改成：

```json
"mode": "real"
```

然后运行：

```bash
npm run build:real
```

### 4. 预览和导出

```bash
npm run preview
npm run render:real
```

也可以先构建再普通导出：

```bash
npm run build:real
npm run render
```

导出视频仍然在：

```text
output/version-001.mp4
```


## 真实素材一键构建

这一节是给不熟悉命令行的用户看的。只要文件放对位置，就不需要手动设置 `$env:EDIT_MODE="real"`。

### 1. 放入主视频

请把视频放到：

```text
assets/raw/main.mp4
```

注意：

- `main.mp4` 必须是一个视频文件，不是文件夹。
- 不要命名成 `main.mp4.mp4`。如果 Windows 隐藏了扩展名，请先打开资源管理器里的“文件扩展名”显示。

### 2. 放入字幕

请把字幕放到：

```text
captions/main.srt
```

注意：

- `main.srt` 必须是一个 SRT 文件，不是文件夹。
- Windows 用户用记事本保存字幕时，文件名请写成 `"main.srt"`，保存类型选择“所有文件”，编码选择 UTF-8。
- 不要保存成 `main.srt.txt`。

### 3. 一键构建真实视频

运行：

```bash
npm run build:real
```

成功时你应该看到类似日志：

```text
[build:real] 1/5 probe
✓ probe completed
[build:real] 2/5 parse
✓ parse completed
[build:real] 3/5 plan
✓ plan completed
[build:real] 4/5 compose
✓ compose completed
[build:real] 5/5 validate
✓ validate completed
[build:real] post-build check
✓ current.html contains <video id="main-video"> and no demo placeholder
```

`build:real` 结束前会做 post-build 校验：

- `compositions/current.html` 必须存在。
- `current.html` 必须包含真实视频 `<video id="main-video">`。
- `current.html` 不应该再出现“主视频占位区域”。
- `metadata/video-metadata.json`、`captions/parsed-captions.json`、`captions/edit-plan.json` 必须存在。
- duration 必须来自真实视频 metadata 或真实字幕，不应该误用 demo 的固定 15 秒，除非真实视频本身就是 15 秒。

如果 `build:real` 显示成功但预览还是占位画面，说明构建没有真正切到真实素材；现在 post-build 校验会直接报错，请先按报错修复，不要继续 render。

### 4. 预览

```bash
npm run preview
```

### 5. 导出

```bash
npm run render:real
```

`npm run render:real` 会串联三个已经验证过的命令：

```bash
npm run build:real
npm run render
npm run assert:render
```

也就是说，它会先重新构建真实素材 composition，再使用普通 `npm run render` 导出，最后检查导出文件是否存在且文件大小大于 0。最终文件在：

```text
output/version-001.mp4
```

如果 `npm run render:real` 失败，请先分别执行下面两个命令定位问题：

```bash
npm run build:real
npm run render
```

- 如果 `npm run build:real` 失败，说明是真实素材、字幕、ffprobe 或 composition 构建问题。
- 如果 `npm run build:real` 成功但 `npm run render` 失败，说明是 HyperFrames 导出环境问题。
- 如果前两步都成功但 `npm run assert:render` 失败，请检查 `output/version-001.mp4` 是否被占用、被删除，或文件大小是否为 0。

最终推荐仍然使用：

```bash
npm run render:real
```

## 自然语言反馈微调

这一流程适合在 `version-001` 已经能预览或导出后，基于中文修改意见做局部微调。它不会重新设计整条视频，也不会调用外部 LLM API；MVP 只解析常见中文反馈，更新剪辑计划，生成 `version-002` composition、说明和 changelog。

### 1. 先生成真实视频

请先确认真实素材已经放好：

```text
assets/raw/main.mp4
captions/main.srt
```

然后运行：

```bash
npm run build:real
```

### 2. 编辑反馈文件

打开并编辑：

```text
prompts/feedback.md
```

示例：

```text
请基于 version-001 做局部微调，不要推翻整条视频：

1. 0:03-0:05 镜头拉远一点，人物不要太满。
2. 0:05-0:07 大字往左上移动，避免挡住人物。
3. 0:06-0:09 字幕字号加大一点。
4. 0:07-0:09 减少装饰元素，让画面更干净。
5. 全片画面稍微提亮一点。
```

当前支持的中文反馈包括：

- 时间范围：`0:03-0:05`、`00:03-00:05`、`3秒-5秒`、`3-5秒`。
- 目标：镜头/画面/人物太满、大字/标题、字幕/底部字幕、装饰/元素/贴图、全片/整体。
- 动作：拉远、推近、往左上/右上、上移/下移、字号加大/变小、删除/去掉/减少、提亮/暗一点。

### 3. 生成反馈版

运行：

```bash
npm run build:feedback
```

它会串联：

1. `npm run build:real`：重新基于真实素材生成当前 `version-001` 计划。
2. `npm run feedback:parse`：把 `prompts/feedback.md` 解析到 `prompts/feedback-plan.json`。
3. `npm run feedback:apply`：生成 `version-002`，并把 `compositions/current.html` 更新为反馈版。

成功后会生成或更新：

```text
prompts/feedback-plan.json
captions/edit-plan.version-002.json
captions/edit-plan.json
compositions/version-002.html
compositions/current.html
edit-notes/version-002.md
changelog/version-002.md
```

`compositions/version-001.html`、`edit-notes/version-001.md`、`changelog/version-001.md` 会保留，不会被反馈流程覆盖。

### 4. 预览

运行：

```bash
npm run preview
```

浏览器会预览当前的 `compositions/current.html`，也就是反馈后的 `version-002`。

### 5. 导出

运行：

```bash
npm run render:feedback
```

输出位置：

```text
output/version-002.mp4
```

### 常见问题

#### 时间格式写错

请优先使用 `0:03-0:05` 或 `3秒-5秒`。如果某条无法识别，`feedback:parse` 会在终端给出 warning，并把它写入 `prompts/feedback-plan.json` 的 `unresolvedItems`。

#### 反馈没有被识别

当前是规则 MVP，不理解复杂自然语言。请把反馈拆成短句，并明确写出时间、目标和动作，例如“0:06-0:09 字幕字号加大一点”。无法识别的反馈不会阻断构建，但会写入 `edit-notes/version-002.md`。

#### 预览还是旧版本

请确认已经成功运行 `npm run build:feedback`，并检查 `compositions/current.html` 是否包含 `zz-auto-edit-version-002`。如果浏览器缓存了旧页面，请刷新预览页面。

#### 字幕太大超出画面

反馈流程会限制字幕最多两行，并把字号控制在安全范围内。如果本地素材字幕特别长，请缩短 SRT 单句长度，或把反馈改成“字幕字号变小”。

#### 大字仍然挡人

请使用更明确的反馈，例如“0:05-0:07 大字往左上移动”。当前规则会把大字移到更靠左上并缩小可用宽度，尽量避开 `safeArea.personRegion`，但不会做真实人物检测。

#### render:feedback 失败怎么定位

请拆开执行：

```bash
npm run build:feedback
npx hyperframes render -c compositions/current.html -o output/version-002.mp4 --fps 30 --quality standard
npm run assert:feedback-render
```

- 如果 `build:feedback` 失败，优先检查真实素材、SRT、ffprobe、反馈格式和 `version-002` 后置校验。
- 如果 render 命令失败，优先检查 HyperFrames、FFmpeg 和本机导出环境。
- 如果只有 `assert:feedback-render` 失败，请检查 `output/version-002.mp4` 是否存在、是否被占用、文件大小是否为 0。

### Windows 本地最终验收命令

```powershell
npm run build:real
npm run render:real
npm run feedback:parse
npm run build:feedback
npm run preview
npm run render:feedback
```


## 新增命令

- `npm run parse`：按当前模式解析 SRT。
- `npm run probe`：real 模式下用 ffprobe 读取 `main.mp4` 的 `duration`、`width`、`height`、`fps`、`hasAudio`，写入 `metadata/video-metadata.json`。
- `npm run plan`：根据解析后的字幕生成 subtitles、callouts、cameraMoves、overlays。
- `npm run compose`：根据 config 和 edit plan 生成 HyperFrames HTML composition。
- `npm run build:demo`：demo 模式完整构建和校验。
- `npm run build:real`：检查真实素材、probe video、parse real srt、build edit plan、生成 composition、validate。
- `npm run preview`：预览 current composition。
- `npm run render`：导出 `output/version-001.mp4`。
- `npm run assert:render`：检查 `output/version-001.mp4` 是否存在且文件大小大于 0。
- `npm run render:real`：一键串联 `build:real`、`render`、`assert:render`，基于真实素材构建并导出。
- `npm run feedback:parse`：解析 `prompts/feedback.md`，生成 `prompts/feedback-plan.json`。
- `npm run feedback:apply`：基于反馈计划生成 `version-002` 剪辑计划、composition、notes 和 changelog。
- `npm run build:feedback`：串联 `build:real`、`feedback:parse`、`feedback:apply`，生成反馈版。
- `npm run render:feedback`：构建反馈版并导出 `output/version-002.mp4`。
- `npm run assert:feedback-render`：检查 `output/version-002.mp4` 是否存在且文件大小大于 0。

## 已修复的 HyperFrames warning

### timed_element_missing_clip_class

所有带 `data-start` / `data-duration` 的可见 HTML 元素都补齐了 `class="clip"`。真实 `<video>` 元素遵循 HyperFrames 文档：video/audio 由框架管理，不加 `class="clip"`；其外层可见容器仍是 `clip`。

### timeline_track_too_dense

字幕、重点大字、装饰元素被拆到更明确的 `caption-layer`、`callout-layer`、`decor-layer`，并对字幕/大字使用交错 track，避免所有 timed elements 堆在同一个 track 上。

### Missing window.__timelines registration

composition 现在在脚本中注册：

```js
window.__timelines["zz-auto-edit-version-001"] = tl;
```

如果运行环境已经提供 `window.gsap`，会注册 paused GSAP timeline；如果没有，也会注册有限 duration 的兼容 timeline，保证 StaticGuard 能看到 composition timeline。

### 字体 warning

CSS 不再依赖单一系统中文字体，改为通用 fallback 栈：

```css
system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei UI", "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Noto Sans SC", Arial, sans-serif
```

如需完全一致的跨机器字体效果，可以自行添加 `@font-face` 并在本地引用字体文件；本仓库不提交字体文件。

### AudioContext warning

当前 demo 是无音频占位画面，浏览器或 HyperFrames 在初始化媒体管线时可能出现 AudioContext 相关 warning。这类 warning 不影响当前无音频 demo 的 preview/render。real 模式如果 `main.mp4` 带音频，则由 HyperFrames 管理 `<video>` 音频播放和渲染。

## 常见问题

### main.mp4 找不到

现象：`npm run build:real` 提示 `真实视频不存在：assets/raw/main.mp4`。

解决：把视频放到 `assets/raw/main.mp4`，或修改 `edit.config.json` 的 `rawVideoPath`。

### main.srt 找不到

现象：`npm run build:real` 提示 `真实字幕不存在：captions/main.srt`。

解决：把字幕放到 `captions/main.srt`，或修改 `edit.config.json` 的 `captionPath`。

### ffprobe 失败

现象：`npm run probe` 或 `npm run build:real` 提示 ffprobe 执行失败。

解决：安装 FFmpeg，并确认：

```bash
ffprobe -version
```

### 字幕时间轴解析失败

脚本会提示具体行号。请检查时间轴格式是否为：

```text
00:00:03,000 --> 00:00:06,000
```

结束时间必须晚于开始时间。

### 视频比例不对

real 模式主视频默认使用 `object-fit: contain`，优先避免人物被裁切。如果你明确想铺满画布，可以把 `edit.config.json` 中 `rules.videoFit` 改成 `cover`，但可能裁掉边缘内容。

### 字体 warning

如果 render 环境没有某些中文字体，会自动回退到字体栈里的其他字体。中文字幕和大字仍能显示。若要品牌级一致，可在本地加字体并写 `@font-face`，不要把字体文件提交到仓库。

### preview 能看但 render 失败

优先检查：

1. `ffmpeg -version` 是否可用。
2. npm 是否能拉取 HyperFrames CLI。
3. 是否能先跑通 `npm run build:demo` 或 `npm run build:real`。
4. `compositions/current.html` 是否存在。
5. 真实素材是否被放在 `.gitignore` 指定的本地路径，而不是误提交到 Git。

## Git 忽略规则

以下内容必须保留忽略：

```text
assets/raw/*
assets/audio/*
assets/images/*
output/*
*.mp4
*.mov
*.mkv
*.avi
*.webm
```

目录通过 `.gitkeep` 保留。

## 后续自然语言微调

当前已提供 `feedback:parse`、`build:feedback` 和 `render:feedback` 的本地规则 MVP。后续如果继续增强，可以扩展 `scripts/parse-feedback.js` 的规则或 `scripts/apply-feedback.js` 的局部调整策略，但仍应保留当前 `edit-plan.json`、`edit-notes/`、`changelog/` 的版本化结构。
