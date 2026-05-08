# version-001 剪辑说明

## 当前模式

- 当前仓库默认配置为 `demo` 模式。
- `demo` 模式使用内置占位画面，不要求提交或存在真实视频。
- 真实素材模式通过 `EDIT_MODE=real npm run build:real` 或把 `edit.config.json` 的 `mode` 改为 `real` 后运行相关命令启用。

## 素材来源

- demo 字幕：`captions/sample.srt`
- real 视频：`assets/raw/main.mp4`
- real 字幕：`captions/main.srt`
- 真实视频、音频、图片和导出成片均被 `.gitignore` 忽略，不进入 Git。

## 自动生成效果

- `scripts/parse-srt.js` 根据当前模式解析 demo/real SRT。
- `scripts/build-edit-plan.js` 根据字幕生成底部中文字幕、重点大字、轻微推拉参数和装饰元素。
- `scripts/generate-composition.js` 根据 `captions/edit-plan.json` 生成 `compositions/version-001.html`、`compositions/current.html` 和根目录 `index.html`。
- real 模式下，`scripts/probe-video.js` 会用 ffprobe 生成 `metadata/video-metadata.json`，并用真实视频时长覆盖 composition 时长。

## 安全区说明

- 重点大字默认放在顶部标题安全区。
- 中文字幕固定在底部字幕安全区。
- 主视频默认 `object-fit: contain`，优先避免人物被裁切；缩放上限由 `edit.config.json` 的 `rules.maxScale` 控制。
