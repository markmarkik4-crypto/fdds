#!/usr/bin/env python3
"""Convert audio files to WAV format for XTTS v2."""
import sys
import subprocess
import os

def convert_to_wav(input_path, output_path):
    # Try ffmpeg first (best quality)
    try:
        subprocess.run([
            "ffmpeg", "-y", "-i", input_path,
            "-ar", "22050",  # XTTS optimal sample rate
            "-ac", "1",       # Mono
            "-c:a", "pcm_s16le",
            output_path
        ], check=True, capture_output=True)
        print(f"Converted to: {output_path}")
        return
    except FileNotFoundError:
        pass  # ffmpeg not found

    # Fallback: try pydub
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_file(input_path)
        audio = audio.set_frame_rate(22050).set_channels(1)
        audio.export(output_path, format="wav")
        print(f"Converted to: {output_path}")
        return
    except ImportError:
        pass

    print("ERROR: Install ffmpeg (`brew install ffmpeg`) or pydub (`pip install pydub`)", file=sys.stderr)
    sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python convert.py <input_file> <output_wav>")
        sys.exit(1)
    convert_to_wav(sys.argv[1], sys.argv[2])
