# ComfyUI 自动化视频智能体

本仓库提供一个面向 ComfyUI Seedance 2.0 R2V 视频工作流的自动化智能体脚手架，帮助用户从素材检查、Prompt 生成到运行清单交付形成固定流程。

## 智能体能力

- 校验 4 张必要参考图是否已放入 ComfyUI 输入目录。
- 基于三套服装和一张自拍参考图生成中文视频 Prompt。
- 输出可执行的 ComfyUI 运行步骤，降低手动配置遗漏。
- 支持通过 `--theme` 追加品牌、风格或活动主题要求。

## 快速开始

```bash
python3 scripts/automation_agent.py --input-dir ComfyUI/input --output-dir ComfyUI/output
```

追加主题示例：

```bash
python3 scripts/automation_agent.py --theme "霓虹未来感，高级街头秀场"
```

## 必需素材

将以下文件放入 ComfyUI 的 `input` 目录：

- `sd_outfit_1.png`
- `sd_outfit_2.png`
- `sd_outfit_3.png`
- `selfie_cartoon_style.png`

## 智能体技能入口

Codex/插件运行时可以读取 `skills/automated-video-agent/SKILL.md`，按其中定义的默认流程自动完成素材检查、Prompt 生成、ComfyUI 操作清单和质量检查。
