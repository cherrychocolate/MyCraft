# Lego OS 更新日志

## 2026-11-27

- 上线 GlassTube 应用界面，搜索结果自动聚焦首条，确认播放并在返回时恢复列表焦点。
- 播放器支持前后跳 10 秒、当前列表下一条、字幕请求、声音与画面放大。嵌入播放受限时提供重试、下一条和 YouTube 官方入口。
- Kai 对话内先显示真实搜索结果，确认观看后进入应用。横竖屏的控制器路径和实际开播已在本地模拟器验收。

## 2026-11-26

- 统一看板 Small 卡片的外框高度（260 逻辑像素），覆盖已有内容与等待读取两种状态。
- 镜片内的系统文字使用白色。看板采用 19% 浅色合成和局部高斯模糊，保留街景细节。
- Kai 新增挥手、跃起和落地帧，保留观察、坐姿和转身。待机及唤醒的角色运动在内缩的安全区内进行。
- 个人助手只展示当前气泡。YouTube 结果可在对话内选择，确认观看后进入应用播放。机票行程可在对话内核对，出票需要供应商授权。

Kai 新姿态由内置图像生成工具制作，素材保存在 `static/assistant/kai-gestures.webp`。生成提示如下。

> Create one transparent 2 by 2 sprite atlas of Kai from the supplied reference. Match the indigo eyes, magenta forehead and belly, periwinkle body, four ears and tiny paws exactly. Keep poses full body with generous equal clear margins, exactly one sprite centered within each quadrant of the square atlas, no text/box/props/shadow. Upper left Kai raises the right paw to wave beside the face; upper right Kai waves the same paw farther out, body stays put; lower left Kai mid-jump with both paws raised, full head and feet visible; lower right Kai crouches gently on landing, feet close together, full body. Consistent camera framing, lighting, same size. True transparent alpha, clean edges. Sprites never touch the cell edges.
