# Cutroom Electron

Standalone video editor using Electron, Node and bundled FFmpeg. It does not run Python or an HTTP service.

## Launch

Open `Start Cutroom.command`. The launcher selects the newest locally packaged build. Quit an older Cutroom window before opening the new build.

## Projects

Use the **Project** menu in the editor:

- **New Project**: choose a video, a project name, and optionally a transcript, chapters and an existing edit snapshot. Then choose where to save the `.cutroom` file.
- **Open Project…**: select an existing `.cutroom` file. If its video has moved, you can locate it again.
- **Import Web Project…**: choose the browser editor's `edits/recording.edits.json`, then save a new `.cutroom` project. Transcript, chapters, cuts, reels and undo/redo come across together.
- **Close Project**: saves pending edits and returns to the project screen.
- **Recent projects**: reopen previously used projects, including the original interview.

Each new project has a `.cutroom` manifest and an adjacent `.cutroom.data` folder containing its transcript, chapter metadata and edits. Keep these together when moving a project. Video is referenced rather than copied. Edits, reels, undo/redo and recovery drafts are isolated per project. Failed or cancelled opens leave the current project active.

Transcripts may be word-timed JSON (`words` containing `text`, `start` and `end` in seconds), an existing `recording.json`, SRT or VTT. Subtitle word timings are estimated evenly within each cue; JSON word timestamps retain their original precision. Chapters can be an existing chapter JSON array or a Markdown/text file with one chapter per line and optional `hh:mm:ss` timestamps. Questions without timestamps can be positioned using **Set start here**. With no transcript you can still edit the video using in/out marks. The app does not generate transcripts automatically.

## Existing progress

On upgrade, the existing Electron interview is registered as a project and appears in Recent Projects. Its edit file stays in place, including reels, history and undo/redo.

To import the browser project, choose **Project → Import Web Project…** (also available on the welcome screen). Select `../edits/recording.edits.json`, then choose where to save the new `.cutroom` project. Wait for the browser's save indicator before importing.

Cutroom finds `recording-editor/public/recording.json` and the original video beside the web project's `edits` folder. If you've moved the edit JSON, it asks you to locate the metadata and video. It copies the transcript, chapter metadata, cuts, reels, history, undo/redo, waveform and captions into the new project's data folder, retaining exact timestamps. The video is referenced in place. The browser files and existing Electron projects stay untouched; later browser changes are not automatically synchronized.

To replace only the edits in an already open matching project, use **Main cut → Edits → Import project** with the latest edit JSON. For a different recording, use the full **Import Web Project…** flow above.

## Visual identity

The Electron interface follows the Podlodka × Non-Objective identity guide: dark blue instrument panels, warm cream surfaces, the supplied muted palette, and circular connectors. Elma Mono Regular is used for interface text and Ease Geometric A Black for the Cutroom wordmark. Both fonts are bundled for offline use. The theme covers the editor, reels, project picker and export dialogs.

## Development and checks

```bash
npm install
npm run dev
npm test
npm run test:seek
npm run test:projects
npm run package
```

`test:seek` exercises real Electron word seeking and playback in main, source and reel views. `test:projects` exercises creating, closing and reopening projects while a save is in flight, in an isolated temporary profile. `npm run package` creates a local unsigned `.app`; signing and notarization require a Developer ID certificate.

Exports use bundled FFmpeg and include `edited-video.mp4`, `cut-report.md`, `edit-list.json`, `project.json`, `transcript.txt` and `subtitles.srt`. Export jobs keep the source recording they started with even when you switch projects.
