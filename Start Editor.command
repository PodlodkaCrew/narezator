#!/bin/zsh
cd "$(dirname "$0")/recording-editor" || exit 1
exec python3 launch.py
