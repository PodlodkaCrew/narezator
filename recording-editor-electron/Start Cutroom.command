#!/bin/zsh
set -e
APP_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGED="$APP_DIR/release/mac-arm64/Cutroom.app"
for CANDIDATE in "$APP_DIR/release/seek-fix/mac-arm64/Cutroom.app" "$APP_DIR/release/projects/mac-arm64/Cutroom.app"; do
  if [[ "$CANDIDATE/Contents/Resources/app.asar" -nt "$PACKAGED/Contents/Resources/app.asar" ]]; then
    PACKAGED="$CANDIDATE"
  fi
done
if [[ -d "$PACKAGED" ]]; then
  open "$PACKAGED"
else
  cd "$APP_DIR"
  npm start
fi
