from pathlib import Path
import array
import json
import subprocess
ROOT=Path(__file__).resolve().parents[2]
# One real peak every two seconds. Stream audio so memory stays bounded.
proc=subprocess.Popen(['ffmpeg','-v','error','-i',str(ROOT/'video.mp4'),'-vn','-ac','1','-ar','2000','-f','f32le','pipe:1'],stdout=subprocess.PIPE)
peaks=[]
while True:
    chunk=proc.stdout.read(4000*4)
    if not chunk:break
    samples=array.array('f');samples.frombytes(chunk)
    peaks.append(round(max((abs(x) for x in samples),default=0),4))
if proc.wait():raise RuntimeError('Cannot extract waveform')
(ROOT/'recording-editor/public/waveform.json').write_text(json.dumps({'secondsPerPeak':2,'peaks':peaks}))
print(f'Extracted {len(peaks)} waveform peaks')
