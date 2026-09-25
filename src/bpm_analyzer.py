#!/usr/bin/env python3
"""
BPM & Key Analysis Module
Extracts BPM and key from audio files using librosa
"""

import sys
import json
from key_detection import resolve_key
from bpm_detection import resolve_bpm
import librosa
import os
from pathlib import Path

def extract_bpm_key(file_path, analysis_seconds=None):
    """Extract BPM and key from audio file"""
    try:
        # The full-track Percival estimate ignores analysis_seconds; only the
        # librosa fallback honors the legacy duration limit.
        bpm_info = resolve_bpm(file_path, fallback_duration=analysis_seconds)
        if bpm_info.get("error"):
            return {
                "ok": False,
                "error": bpm_info["error"],
                "file": file_path,
            }
        
        key_info = resolve_key(file_path)
        return {
            "ok": True,
            **bpm_info,
            **key_info,
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
