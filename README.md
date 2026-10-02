# Narezator Electron

Standalone video editor using Electron, Node and bundled FFmpeg. It does not run Python or an HTTP service.

## Launch

Open `Start Narezator.command`. The launcher opens the newest packaged app in `release/mac-arm64` or `release/next/mac-arm64`, or builds and starts the app if no package exists. The alternate build location allows updating while an older app is running. Quit an older Narezator window before opening a new build.

## Directory layout

The Git repository and Electron source live directly in `narezator/`. Recording project files live outside Git in the sibling `projects/skills/` directory:

```text
audio_transcription/
  narezator/                 # .git, Electron source, tests, launcher, builds
  projects/skills/         # video, audio, transcripts, chapters, recording metadata
    edits/                # current .narezator project, edits, reels and reports
    legacy-electron/      # preserved original Electron project
    .transcription/       # transcription source material and preparation history
    .editor-cache/        # previews and preserved export jobs
    .migration-backup/    # relocation inventory and original path settings
```

The app does not bundle interview data or require a web server. A fresh installation opens the project picker. The existing Skills project is `../projects/skills/edits/Skills · interview.cutroom`; its video and data paths remain relative to the project file. Electron's preferences and recovery storage remain in its normal Application Support directory, with the preserved project/export cache linked to `projects/skills/`.

## Projects

Use the **Project** menu in the editor:

- **New Project**: choose ElevenLabs or OpenAI and save your API key, then select a video, a project name, and optional chapters or existing edits. Save the `.narezator` file to open the video and start automatic transcription.
- **Open Project…**: select an existing `.narezator` file. If its video has moved, you can locate it again.
- **Close Project**: saves pending edits and returns to the project screen.
- **Recent projects**: reopen previously used projects, including the original interview.

Each new project has a `.narezator` manifest and an adjacent `.narezator.data` folder containing its transcript, chapter metadata and edits. Keep these together when moving a project. Video is referenced rather than copied. Edits, reels, undo/redo and recovery drafts are isolated per project. Failed or cancelled opens leave the current project active.

Existing `.cutroom` projects are still supported without conversion. Upgraded installations reuse the original `Application Support/Cutroom` profile so the current workspace, recent projects, exports, and recovery drafts remain available. Fresh installations use `Application Support/Narezator`.

The right-hand transcript panel shows audio preparation, provider processing, and completion. The video remains available while transcription runs. You can cancel or retry from that panel, including switching providers or updating a rejected key. Completed words automatically appear in the selectable, synchronized transcript. Provider processing uses an indeterminate progress indicator because the services do not return a processing percentage.

ElevenLabs uses [Scribe v2](https://elevenlabs.io/docs/api-reference/speech-to-text/convert) with word timestamps and speaker labels. OpenAI uses [Whisper with word timestamps](https://developers.openai.com/api/docs/guides/speech-to-text#timestamps); OpenAI transcripts have one speaker label. FFmpeg extracts mono audio locally. OpenAI uploads are split into ten-minute pieces with overlap, keeping each upload below the provider limit and restoring source timestamps when results are combined. ElevenLabs receives one audio file to preserve speaker identity across the recording. Audio is uploaded only after project creation, to the selected provider using your account; provider charges apply.

API keys stay in the Electron main process after entry. **Remember key securely** encrypts them using Electron's OS-backed safe storage; when secure storage is unavailable, they remain in memory for the session. They are never included in project files, exports, or progress messages. Existing saved projects can be opened without a key or a network request.

Transcription writes only recording metadata and its job status, preserving cuts, reels, annotations, undo history, and edits made while it runs. It continues for its original project when you open another project. Failed or interrupted jobs can be retried; retries transcribe the recording again and may incur new charges. Temporary audio is removed when the job ends. Quitting the app cancels active jobs.

Chapters can be an existing chapter JSON array or a Markdown/text file with one chapter per line and optional `hh:mm:ss` timestamps. Questions without timestamps can be positioned using **Set start here**. Existing project imports retain their original transcript timings.

When a project has no chapters, Narezator generates topic chapters and their summaries after transcription finishes if an OpenAI key is configured. Existing transcript-only projects use the same flow when opened. If only ElevenLabs is configured, the chapter panel shows an OpenAI key setup and **Generate chapters** button. Generation finds real topic changes in the complete source transcript and anchors starts to exact transcript words. Supplied chapter files are preserved. Progress and retry appear in the chapter panel, and the app remains editable while generation runs.

Generated chapters and summaries are saved in the edit project; adding them preserves cuts, reels, notes and undo/redo. Undoing earlier cuts retains the new chapters. A transcript-specific cache in the project data folder recovers finished generation after a reload without another request, even if no key is available. Reopening a project with saved chapters makes no generation request.

Each chapter has a **Summary** button that expands one sentence describing the discussion’s flow and 2–3 bullet points with its main outcomes or insights, in the discussion’s language. Opening or closing a summary keeps playback in place. Descriptions are saved with the project and work offline after generation; chapter JSON can also include `summary: {"flow": "One sentence…", "insights": ["First insight…", "Second insight…"]}`.

The first opening generates a missing summary from that chapter’s source transcript using your saved OpenAI API key. If you have only configured ElevenLabs, add an OpenAI key in the summary panel. Generation uses [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs); only the chapter transcript is sent, and provider charges apply. Missing chapters need a start marker, and transcription must finish before a summary can be generated. Moving a marker invalidates summaries for the source ranges it changes. Failed generation can be retried in the panel.

## Existing progress

On upgrade, the existing Electron interview is registered as a project and appears in Recent Projects. Its edit file stays in place, including reels, history and undo/redo.

To replace the edits in an already open matching project, use **Main cut → Edits → Import project** with the latest edit JSON.

Switching between Main cut, Reels and Annotations remembers the playhead, source/cut mode, selected range and transcript scroll position for each view during the session. Each reel has its own position, and returning to Reels restores the last selected reel.

## Annotations

Select transcript text, drag across the waveform, or set in/out points, then click **Annotate** beside **Create reel**. Write a freeform note and choose **Save annotation**. The **Annotations** tab lists notes across the main cut and reels; click a timestamp to open its original source range, or edit/delete a note. **Undo delete** restores the last removed note during the current session.

**Export annotations** saves a Markdown report containing original source start/end timestamps, their boundary phrases (individual words for short ranges), and the full note text. Selections spanning removed or reordered clips retain each selected source interval in order. Notes remain anchored when clips are edited, and saving a note does not change cuts or reels. Old projects open with an empty annotations list; notes are included in project saves, copies, imports and recovery drafts.

## Visual identity

The Electron interface follows the Podlodka × Non-Objective identity guide: dark blue instrument panels, warm cream surfaces, the supplied muted palette, and circular connectors. Elma Mono Regular is used for interface text and Ease Geometric A Black for the Narezator wordmark. Both fonts are bundled for offline use. The theme covers the editor, reels, project picker and export dialogs.

## Development and checks

```bash
npm install
npm run dev
npm test
npm run test:seek
npm run test:projects
npm run test:annotations
npm run test:chapters
npm run test:chapter-generation
npm run test:reels-export
npm run test:transcription
npm run package
```

`test:seek` exercises real Electron word seeking and playback in main, source and reel views. `test:projects` exercises creating, closing and reopening projects while a save is in flight, in an isolated temporary profile. `npm run package` creates a local unsigned `.app`; signing and notarization require a Developer ID certificate.

Exports use bundled FFmpeg and include `edited-video.mp4`, `cut-report.md`, `edit-list.json`, `project.json`, `transcript.txt` and `subtitles.srt`. Export jobs keep the source recording they started with even when you switch projects.

Reel Markdown reports begin with the reel's original source start–end timestamps and list cuts only within that span. They omit the metadata introduction and the recording before/after the reel. This format applies to **Save report**, individual reel exports, and **Export all reels**.

To export every reel, open **Reels → Export all reels**, choose resolution and source timestamps, then **Choose folder & export**. Narezator creates a new `Narezator-reels-…` folder in your chosen destination. Each reel gets a numbered folder containing its MP4 and the same Markdown cut report and supporting files as a single export. Empty reels are skipped; `reels.json` records each reel's export status. Reels render sequentially with overall progress and cancellation. Completed files remain available if you cancel or a later reel fails. You can keep editing: the batch uses a snapshot taken when you start it, preserving each reel's independent cuts and ordering.
