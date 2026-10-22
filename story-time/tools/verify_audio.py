"""Transcribe MP3/WAV files with faster-whisper and print JSON {path: transcript}.
Run with the whisper venv (default /workspace/tts/venv/bin/python). Used by narrate.py."""
import json, sys
from faster_whisper import WhisperModel
m = WhisperModel('small.en', device='cpu', compute_type='float32', cpu_threads=4)
out = {}
for f in sys.argv[1:]:
    segs, _ = m.transcribe(f, beam_size=5, vad_filter=False, condition_on_previous_text=False)
    out[f] = ' '.join(s.text.strip() for s in segs)
print('@@JSON@@' + json.dumps(out))
