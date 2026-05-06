#!/usr/bin/env python3
"""
XTTS v2 Voice Cloning Script
Usage:
  Clone:   python voice_clone.py clone <input_audio> <voice_id>
  Synth:   python voice_clone.py synth <voice_id> <text> <output_file>
  List:    python voice_clone.py list
"""

import sys
import os
from TTS.api import TTS

VOICES_DIR = os.path.join(os.path.dirname(__file__), "..", "voices")
os.makedirs(VOICES_DIR, exist_ok=True)

# Global TTS instance (lazy load)
_tts = None

def get_tts():
    global _tts
    if _tts is None:
        print("Loading XTTS v2 model...", file=sys.stderr)
        _tts = TTS("coqui/XTTS-v2", gpu=True)
        print("Model loaded!", file=sys.stderr)
    return _tts

def clone_voice(input_audio: str, voice_id: str):
    """Extract speaker embedding from audio and save it."""
    tts = get_tts()
    
    voice_path = os.path.join(VOICES_DIR, f"{voice_id}.wav")
    
    # XTTS v2: synthesize with reference audio
    # We copy the reference audio as the voice profile
    import shutil
    shutil.copy(input_audio, voice_path)
    
    print(f"Voice '{voice_id}' cloned from {input_audio}")
    print(f"Saved to: {voice_path}")
    return voice_path

def synthesize(voice_id: str, text: str, output_file: str):
    """Generate speech with the cloned voice."""
    tts = get_tts()
    
    voice_path = os.path.join(VOICES_DIR, f"{voice_id}.wav")
    if not os.path.exists(voice_path):
        print(f"ERROR: Voice '{voice_id}' not found. Clone it first.", file=sys.stderr)
        sys.exit(1)
    
    print(f"Synthesizing with voice '{voice_id}'...", file=sys.stderr)
    tts.tts_to_file(
        text=text,
        speaker_wav=voice_path,
        language="ru",
        file_path=output_file
    )
    print(f"Audio saved to: {output_file}")
    return output_file

def list_voices():
    """List all available cloned voices."""
    voices = [f.replace(".wav", "") for f in os.listdir(VOICES_DIR) if f.endswith(".wav")]
    if not voices:
        print("No cloned voices yet.")
    else:
        print("Cloned voices:")
        for v in voices:
            path = os.path.join(VOICES_DIR, f"{v}.wav")
            size = os.path.getsize(path) if os.path.exists(path) else 0
            print(f"  - {v} ({size} bytes)")
    return voices

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    
    cmd = sys.argv[1]
    
    if cmd == "clone":
        if len(sys.argv) < 4:
            print("Usage: python voice_clone.py clone <input_audio> <voice_id>")
            sys.exit(1)
        clone_voice(sys.argv[2], sys.argv[3])
    
    elif cmd == "synth":
        if len(sys.argv) < 5:
            print("Usage: python voice_clone.py synth <voice_id> <text> <output_file>")
            sys.exit(1)
        synthesize(sys.argv[2], sys.argv[3], sys.argv[4])
    
    elif cmd == "list":
        list_voices()
    
    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)
        sys.exit(1)

if __name__ == "__main__":
    main()
