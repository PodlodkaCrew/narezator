#!/bin/zsh
set -e
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGED="$APP_DIR/release/mac-arm64/Narezator.app"
NEXT="$APP_DIR/release/next/mac-arm64/Narezator.app"
if [[ "$NEXT/Contents/Resources/app.asar" -nt "$PACKAGED/Contents/Resources/app.asar" ]]; then
  PACKAGED="$NEXT"
fi
if [[ -d "$PACKAGED" ]]; then
  open "$PACKAGED"
else
  cd "$APP_DIR"
  npm start
fi
