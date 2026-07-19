# 图片生成 AI 视频工作流

这个仓库提供一套可直接落地到 ComfyUI 的「图片生成 AI 视频」方案：先用文生图/图生图得到关键视觉，再用图片转视频节点生成短片，最后保存为 MP4。

## 适用场景

- 将一张产品图、人物图、海报图扩展成 5～8 秒动态视频。
- 批量制作社媒短视频封面动效、走秀展示、商品展示和角色短镜头。
- 在 ComfyUI 中快速复用统一的提示词、参数和输出规范。

## 目录结构

```text
.
├── README.md
├── ai剪辑工作流程
├── prompts/
│   └── image_to_video_prompt.md
├── scripts/
│   └── prepare_inputs.sh
└── workflows/
    └── image_to_video_comfyui.json
```

## 快速开始

1. 准备一张参考图片，推荐尺寸为 `1024x1024` 或 `768x1024`。
2. 运行脚本创建输入目录并复制图片：

   ```bash
   ./scripts/prepare_inputs.sh /path/to/your/image.png
   ```

3. 打开 ComfyUI，导入 `workflows/image_to_video_comfyui.json`。
4. 确认 `LoadImage` 节点中的图片名为 `image_to_video_reference.png`。
5. 按需修改正向提示词、负向提示词、视频帧数和动作强度。
6. 点击运行，输出视频会保存到 ComfyUI 的 `output` 目录。

## 推荐参数

| 参数 | 建议值 | 说明 |
| --- | --- | --- |
| 分辨率 | `768x1024` 或 `1024x1024` | 竖屏短视频优先使用 `768x1024`。 |
| 帧数 | `81` | 约 3～4 秒，适合测试。 |
| FPS | `24` | 社媒视频常用帧率。 |
| Motion Strength | `0.55` | 保留原图主体，同时产生轻微镜头运动。 |
| CFG | `6.5` | 在提示词服从和画面稳定之间折中。 |
| Seed | 固定整数 | 方便复现；需要变化时再改为随机。 |

## 提示词模板

详细模板在 `prompts/image_to_video_prompt.md` 中。默认方向是「电影感产品/人物展示」，包含镜头运动、光线、质感、动态范围和负向约束。

## 注意事项

- 请确保已在 ComfyUI 中安装可用的图片转视频节点，例如 WanVideo、Seedance、LTX-Video 或同类 I2V 插件。
- 不同插件的节点名可能不同；如果导入后节点缺失，请保留提示词和参数，替换为本地已安装的 I2V 节点。
- 为了降低闪烁，建议参考图主体清晰、背景简单、不要包含过多文字。
