# zz-douyin-auto-edit-hook

## 使用场景

适用于口播视频、知识类视频、工具类视频、广告素材开头，尤其是需要在前 3-5 秒建立强钩子的中文短视频。

## 输入要求

1. 原始视频：优先放在 `assets/raw/main.mp4`。
2. SRT 字幕：必须带时间戳，优先放在 `captions/sample.srt` 或由 `edit.config.json` 指定。
3. 自然语言需求：写在 `prompts/edit-request.md`。
4. 第二版以后反馈：写在 `prompts/feedback.md`。

## 剪辑风格

中文短视频、高质量开头、强钩子、信息清晰、节奏快但不乱。画面应服务信息表达，不为炫技堆叠元素。

## 字幕规则

- 字幕语言为中文。
- 字幕放在底部安全区域。
- 最多两行。
- 字幕必须与 SRT 时间戳对齐。
- 字幕优先保证可读性：高对比、字号足够、背景适度遮罩。

## 大字规则

- 只强调重点句。
- 一次只表达一个核心信息。
- 大字应放在 titleRegion 或其他安全区域。
- 不遮挡人物脸部、身体主体和关键产品画面。
- 大字入场要清晰克制，避免过多弹跳和闪烁。

## 镜头规则

- 只做轻微推近或拉远。
- 不要过度放大，scale 不超过配置里的 `rules.maxScale`。
- 不要频繁晃动。
- 每 3 秒以内最多一个主要镜头运动方向。

## 叠加素材规则

- 叠加素材必须服务内容理解。
- 不为炫技添加无意义贴图。
- 不挡人物。
- 图形层级、出现时间和位置必须写入 edit-plan。

## 反馈迭代规则

第二版以后只做局部微调，不推翻整体风格。优先按时间段处理反馈，例如 `0:03-0:06 镜头拉远`，每次修改都要保留旧版本。

## 输出规则

每一版必须包含：

1. composition：`compositions/version-XXX.html`。
2. 当前工作版：`compositions/current.html`。
3. edit-notes：`edit-notes/version-XXX.md`。
4. changelog：`changelog/version-XXX.md`。
5. 可导出结果：`output/version-XXX.mp4`，但导出文件不提交 Git。
