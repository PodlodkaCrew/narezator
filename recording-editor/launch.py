#!/usr/bin/env python3
"""Start the packaged editor and open it in the default browser."""
from pathlib import Path
import json
import subprocess
import sys
import urllib.request
import webbrowser
import time
APP=Path(__file__).resolve().parent
URL='http://127.0.0.1:8766'
def running():
    try:
        with urllib.request.urlopen(URL+'/api/media-info',timeout=1) as response:
            return json.load(response).get('source')=='video.mp4'
    except Exception:return False
if running():
    webbrowser.open(URL);sys.exit(0)
if not (APP/'local-dist/index.html').is_file():
    print('Build the editor once with: cd recording-editor && npm install && npm run local:build');sys.exit(1)
if not (APP.parent/'video.mp4').is_file():
    print('Place video.mp4 beside the recording-editor folder.');sys.exit(1)
process=subprocess.Popen([sys.executable,str(APP/'server.py')],cwd=APP)
try:
    for _ in range(60):
        if process.poll() is not None:raise RuntimeError('The local server stopped. Check whether port 8766 is in use.')
        if running():break
        time.sleep(.1)
    else:raise RuntimeError('The local server did not start.')
    webbrowser.open(URL)
    print('\nCutroom is running. Keep this window open while you edit. Press Ctrl+C to stop.\n',flush=True)
    process.wait()
except KeyboardInterrupt:
    process.terminate();process.wait()
except Exception as exc:
    process.terminate();process.wait();print(exc);sys.exit(1)
