#!/bin/zsh
set -e
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGED="$APP_DIR/release/mac-arm64/Narezator.app"
if [[ -d "$PACKAGED" ]]; then
  open "$PACKAGED"
else
  cd "$APP_DIR"
  npm start
fi
