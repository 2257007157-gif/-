#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/reference-image" >&2
  exit 1
fi

SOURCE_IMAGE="$1"
COMFYUI_INPUT_DIR="${COMFYUI_INPUT_DIR:-./ComfyUI/input}"
TARGET_IMAGE="${COMFYUI_INPUT_DIR}/image_to_video_reference.png"

if [[ ! -f "$SOURCE_IMAGE" ]]; then
  echo "Reference image not found: $SOURCE_IMAGE" >&2
  exit 1
fi

mkdir -p "$COMFYUI_INPUT_DIR"
cp "$SOURCE_IMAGE" "$TARGET_IMAGE"
echo "Prepared reference image: $TARGET_IMAGE"
