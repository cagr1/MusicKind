#!/usr/bin/env python3
"""
Identify an audio file using Shazam (via shazamio).
Outputs JSON: {"artist": "...", "title": "...", "album": "...", "year": "..."}
or {"error": "..."} if not found.
"""

import argparse
import asyncio
import json


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, help="Path to audio file")
    return parser.parse_args()


async def identify(file_path):
    try:
        from shazamio import Shazam
    except ImportError:
        return {"error": "shazamio no instalado. Ejecuta: pip install shazamio"}

    shazam = Shazam()
    try:
        result = await shazam.recognize(file_path)
    except Exception as exc:
        return {"error": f"Shazam error: {str(exc)}"}

    track = result.get("track")
    if not track:
        return {"error": "Canción no encontrada en Shazam"}

    album = ""
    year = ""
    for section in track.get("sections", []):
        for meta in section.get("metadata", []):
            label = meta.get("title", "").lower()
            if label == "album":
                album = meta.get("text", "")
            elif label in ("released", "año", "year"):
                year = meta.get("text", "")

    return {
        "artist": track.get("subtitle", ""),
        "title": track.get("title", ""),
        "album": album,
        "year": year
    }


if __name__ == "__main__":
    args = parse_args()
    result = asyncio.run(identify(args.file))
    print(json.dumps(result, ensure_ascii=False))
