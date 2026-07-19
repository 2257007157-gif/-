#!/usr/bin/env python3
"""CLI helper for the ComfyUI automated video workflow agent."""

from __future__ import annotations

import argparse
from pathlib import Path

REQUIRED_IMAGES = [
    "sd_outfit_1.png",
    "sd_outfit_2.png",
    "sd_outfit_3.png",
    "selfie_cartoon_style.png",
]

DEFAULT_PROMPT = (
    "第一人称自拍视角的时尚走秀短视频，人物身份和脸部特征始终保持一致。"
    "视频依次展示三套服装：第一套参考 sd_outfit_1.png，第二套参考 sd_outfit_2.png，"
    "第三套参考 sd_outfit_3.png；人物自拍形象参考 selfie_cartoon_style.png。"
    "镜头自然前进，姿态自信，背景为高级时装秀氛围。"
    "每套服装之间使用短暂 glitch 故障转场，画面清晰、节奏流畅、"
    "服装细节突出、无多余人物、无明显变形。"
)


def check_assets(input_dir: Path) -> list[str]:
    """Return the required images that are missing from the input directory."""
    return [name for name in REQUIRED_IMAGES if not (input_dir / name).is_file()]


def build_runbook(input_dir: Path, output_dir: Path, theme: str) -> str:
    """Build a human-readable runbook for the automated agent."""
    missing = check_assets(input_dir)
    status = "素材齐全，可以运行工作流。" if not missing else "缺少素材：" + ", ".join(missing)
    theme_line = f"主题补充：{theme}" if theme else "主题补充：使用默认高级时装秀风格。"

    return "\n".join(
        [
            "# ComfyUI 自动化视频智能体执行清单",
            "",
            f"输入目录：{input_dir}",
            f"输出目录：{output_dir}",
            status,
            theme_line,
            "",
            "## 1. 素材准备",
            "将以下文件放入 ComfyUI/input：",
            *[f"- {name}" for name in REQUIRED_IMAGES],
            "",
            "## 2. 生成 Prompt",
            DEFAULT_PROMPT if not theme else f"{DEFAULT_PROMPT} 额外风格要求：{theme}",
            "",
            "## 3. ComfyUI 运行步骤",
            "1. 打开 ComfyUI 并加载 Seedance 2.0 R2V 工作流。",
            "2. 确认 4 个 LoadImage 节点分别选择所需参考图。",
            "3. 将 Prompt 写入 ByteDance2ReferenceNode。",
            "4. 运行队列并等待 SaveVideo 节点写出视频。",
            "5. 检查输出视频是否完整展示三套服装，并记录最终文件路径。",
        ]
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate an automation runbook for the ComfyUI video agent.")
    parser.add_argument("--input-dir", default="ComfyUI/input", help="Directory containing the four reference images.")
    parser.add_argument("--output-dir", default="ComfyUI/output", help="Directory where ComfyUI saves videos.")
    parser.add_argument("--theme", default="", help="Optional style or campaign theme to append to the prompt.")
    args = parser.parse_args()

    print(build_runbook(Path(args.input_dir), Path(args.output_dir), args.theme))


if __name__ == "__main__":
    main()
