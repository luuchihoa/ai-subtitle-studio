import os
import subprocess
import json
from pathlib import Path
from typing import List, Tuple, Dict, Any
import numpy as np

def extract_and_convert_audio(input_file: str, output_wav: str) -> bool:
    """
    Converts any video or audio file to 16kHz mono 16-bit PCM WAV (optimal for Whisper/STT).
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-i", input_file,
        "-vn",                   # Disable video
        "-acodec", "pcm_s16le",  # 16-bit PCM
        "-ar", "16000",          # 16kHz sample rate
        "-ac", "1",              # Mono channel
        output_wav
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return result.returncode == 0

def get_media_info(file_path: str) -> Dict[str, Any]:
    """
    Uses ffprobe to extract media duration, streams, and format info.
    """
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        "-show_streams",
        file_path
    ]
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if result.returncode != 0:
        return {"duration": 0.0, "is_video": False, "format": "unknown"}
    
    try:
        data = json.loads(result.stdout.decode("utf-8"))
        duration = float(data.get("format", {}).get("duration", 0.0))
        
        has_video = any(s.get("codec_type") == "video" for s in data.get("streams", []))
        return {
            "duration": duration,
            "is_video": has_video,
            "format": data.get("format", {}).get("format_name", "unknown")
        }
    except Exception:
        return {"duration": 0.0, "is_video": False, "format": "unknown"}

def generate_waveform_peaks(audio_path: str, num_peaks: int = 1000) -> List[float]:
    """
    Generates normalized peak amplitudes [0.0 - 1.0] from an audio file for frontend visualizer.
    """
    try:
        # Export raw 8-bit mono samples using ffmpeg
        cmd = [
            "ffmpeg",
            "-v", "quiet",
            "-i", audio_path,
            "-ac", "1",
            "-filter:a", "aresample=8000",
            "-f", "s16le",
            "-"
        ]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        raw_bytes, _ = proc.communicate()
        
        if not raw_bytes:
            return [0.0] * num_peaks

        samples = np.frombuffer(raw_bytes, dtype=np.int16)
        if len(samples) == 0:
            return [0.0] * num_peaks

        # Divide into buckets and get max absolute amplitude per bucket
        bucket_size = max(1, len(samples) // num_peaks)
        peaks = []
        for i in range(0, len(samples), bucket_size):
            chunk = samples[i:i + bucket_size]
            if len(chunk) > 0:
                peak = float(np.max(np.abs(chunk))) / 32768.0
                peaks.append(round(peak, 4))
            if len(peaks) >= num_peaks:
                break
                
        # Fill remaining if any
        while len(peaks) < num_peaks:
            peaks.append(0.0)
            
        return peaks[:num_peaks]
    except Exception as e:
        print(f"Error generating waveform: {e}")
        return [0.1] * num_peaks
