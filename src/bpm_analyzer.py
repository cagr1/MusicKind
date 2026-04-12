#!/usr/bin/env python3
"""
BPM & Key Analysis Module
Extracts BPM and key from audio files using librosa
"""

import sys
import json
import librosa
import numpy as np
import os
from pathlib import Path

def extract_bpm_key(file_path, analysis_seconds=None):
    """Extract BPM and key from audio file"""
    try:
        # Load audio (optionally limited duration for speed)
        if analysis_seconds:
            y, sr = librosa.load(file_path, sr=None, mono=True, duration=analysis_seconds)
        else:
            y, sr = librosa.load(file_path, sr=None, mono=True)
        
        # Get BPM using beat tracking
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        bpm = float(tempo)
        
        # Detect key using chroma features
        chroma = librosa.feature.chroma_stft(y=y, sr=sr)
        chroma_mean = np.mean(chroma, axis=1)
        pitch_class = int(np.argmax(chroma_mean))
        
        # Map pitch class to key notation
        key_names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
        key = key_names[pitch_class]
        
        return {
            "ok": True,
            "bpm": round(bpm, 1),
            "key": key,
            "file": file_path
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "file": file_path
        }

def process_files(files, analysis_seconds=None):
    """Process multiple files and return results"""
    results = []
    total = len(files)
    
    for i, file_path in enumerate(files):
        print(f"[PROGRESS:{i+1}/{total}] Processing: {os.path.basename(file_path)}")
        sys.stdout.flush()
        
        result = extract_bpm_key(file_path, analysis_seconds)
        result["index"] = i + 1
        results.append(result)
    
    return results

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Extract BPM and key from audio files")
    parser.add_argument("--files", nargs="+", required=True, help="List of files to analyze")
    parser.add_argument("--output", help="Output JSON file path")
    parser.add_argument("--analysis-seconds", type=float, help="Limit analysis to first N seconds")
    
    args = parser.parse_args()
    
    results = process_files(args.files, args.analysis_seconds)
    
    if args.output:
        with open(args.output, "w") as f:
            json.dump(results, f, indent=2)
    else:
        print(json.dumps(results, indent=2))