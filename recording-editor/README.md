# Cutroom

A local editor for the adjacent `video.mp4`. Double-click **Start Editor.command** in the parent folder, or run `python3 recording-editor/launch.py` from that folder. Open http://127.0.0.1:8766 if the browser does not open automatically. Keep the launcher window open while editing.

The packaged HTML, CSS, and JavaScript are in `local-dist`. Running the editor only needs Python 3; rendering a new video also needs FFmpeg. Everything stays on this Mac.

## Editing

- **Chapters:** questions from `chapters.md`, matched against the original word timestamps, listed in recording order. Original question numbers are retained. “In answer” means the subject was covered within another answer. The Agent Plugins question was not found as a distinct topic and has no invented timestamp. Click a question to seek. **Set start here** adjusts its navigation marker to the current source time without moving footage.
- **Transcript:** click or move the caret to a word to seek. Playback and scrubbing highlight and follow the current word. Select text and press Delete, or click **Cut selection**, to remove that time range. A selection pauses playback. Text is selectable and copyable; arbitrary typing is disabled because edits must remain tied to audio. Use the search box and Enter to navigate phrase matches.
- **In / out:** drag the waveform to select a range, or use **I** and **O**. Both time fields accept seconds or `HH:MM:SS.mmm`. Arrow buttons step one video frame. These controls can include silences that have no transcript words.
- **Rearrange:** select text or a time range, click **Make clip**, then drag its clip in the assembly. Alternatively split at the playhead with **S**. Shift/Command-click clips to move several together. The left/right buttons and Option+arrow shortcuts move selected clips. Rename the selected clip at the bottom.
- **Source / Your cut:** Source includes every original moment. Your cut plays only the retained clips, in their edited order. A chapter whose opening was removed opens in Source. Select a source range and choose **Append to cut** to bring it back or reuse it.
- **Undo / redo:** Command+Z and Shift+Command+Z. Up to 75 undo snapshots persist across restarts. The full event history remains in the edit project.
- **Earlier cuts:** in the empty Edits panel, **Apply 2 earlier transcript cuts** imports the opening-chat and Anthropic/Google-aside removals found in `.transcription/skills.editorial-cuts.json`. They are optional; the initial project retains the entire source.

## Files and export

The original video and transcripts are never rewritten.

- `../edits/recording.edits.json`: current ordered source intervals, chapter positions, undo/redo snapshots, and the complete edit-event list. Saved atomically after each change.
- `../edits/recording.edits.previous.json`: previous successful save.
- `../edits/history.jsonl`: append-only history of persisted edit events.
- A browser recovery copy protects edits if the local service stops. Multiple windows use revision checks to avoid silently overwriting each other's changes. On a revision conflict, download your current project, reload, then import the desired snapshot.
- **Edits → Save report** downloads `skills-interview-cut-report.md` for the human editor. Every final removed source range appears as two lines: the cut start with its first phrase and the cut end with its last phrase. Short cuts use their first and last word. **Import project** still restores a JSON project snapshot and is itself undoable.
- **Create reel** turns the current transcript, waveform, or in/out selection into an independent reel. Open the **Reels** workspace to cut, split, restore, rename, and rearrange that reel without changing the main cut. Each reel has its own history, undo, and redo stacks.
- Exporting from a reel renders only that reel. It receives the same MP4, Markdown cut report, JSON edit list, transcript, captions, and metadata files as the main edit.
- `../.editor-cache/review.mp4`: a 720p review copy with original source timestamps permanently burned into the frames. The full source remains 1080p. The editor uses this review copy when present.
- **Export → Render video** renders your current assembly from the original 1080p recording. Timestamp burn-in is enabled by default and can be disabled for a clean final copy. Choose 1080p or 720p.
- Each export gets its own `../exports/<export-id>/` folder with `edited-video.mp4`, `cut-report.md`, `project.json`, `edit-list.json`, `transcript.txt`, `subtitles.srt`, and chapter metadata. Export is a snapshot; subsequent editing does not change a running render.
- Source time always refers to the original recording. Edit time refers to the current assembly. Exports use 30 fps; each clip's duration is rounded to the nearest frame. The export edit list records exact output offsets. Browser preview transitions may have a short seek delay; the rendered MP4 is continuous.

## Development

`npm run dev -- --port 5173` runs the development interface; run `python3 server.py` alongside it for media and saves. `npm run local:build` rebuilds the self-contained local web assets. `npm run build` validates the Sites/Vinext build as well.

Checks: `npm run typecheck`, `npm test`, and `python3 -m unittest discover -s tests -p 'test_*.py'`. The isolated server tests do not modify the actual edit project. A real reordered four-second export was checked with FFmpeg, including audio, chapter markers, source timestamps, and captions.

The generated recording manifest uses the original ElevenLabs word timing from `.transcription/skills.elevenlabs.json`, not interpolated timestamps from the formatted transcript. Chapter opening takes were checked against that transcript. Word boundaries are speech-recognition estimates; in/out fields and frame controls let you refine a cut by ear.
