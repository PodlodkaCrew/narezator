# Cutroom Electron

Standalone Electron version of the Cutroom recording editor. It does not start an HTTP server and does not use Python. React runs in Electron's sandboxed renderer; filesystem access, atomic saves, media selection, and FFmpeg exports run through a narrow preload/IPC bridge.

## Use the packaged app

The local unsigned macOS build is at `release/mac-arm64/Cutroom.app`. Open it directly or run `Start Cutroom.command`.

On first launch, choose the original `video.mp4`. Choose **Import edits** and open the latest `../edits/recording.edits.json` to transfer the complete main timeline, reels, edit histories, and undo/redo stacks. Cutroom copies that file into Electron's application-data directory. The browser editor and Electron never write to the same project file.

You can transfer newer browser work later from **Main cut → Edits → Import project**. This replaces the Electron project with the selected snapshot, including reels and history, then saves it in Electron storage.

## Development

```bash
npm install
npm run dev
```

Useful checks:

```bash
npm test
npm run build
npm run package
```

`npm run package` creates an unpacked macOS application under `release/mac-arm64/`. `npm run dist` additionally creates distributable DMG and ZIP files. Signing and notarization require an Apple Developer ID certificate and are intentionally outside the local build.

## Data and exports

Electron keeps its project, previous revision, recovery draft, and exports under Electron's Cutroom user-data directory. Saves use revision checks and atomic file replacement. Export uses the bundled `ffmpeg-static` executable and produces:

- `edited-video.mp4`
- `cut-report.md`
- `edit-list.json`
- `project.json`
- `transcript.txt`
- `subtitles.srt`

The edit project schema remains compatible with the browser editor's `recording.edits.json` format.
