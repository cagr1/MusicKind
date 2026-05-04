#!/usr/bin/env python3
"""
Identify an audio file using AcoustID (fpcalc fingerprint + AcoustID API).
Outputs JSON: {"artist": "...", "title": "...", "album": "...", "year": "..."}
or {"error": "..."} if not found.

Requires: fpcalc binary (brew install chromaprint on macOS)
No extra Python packages needed.
"""

import sys
import subprocess
import json
import argparse
import urllib.request
import urllib.parse

ACOUSTID_API_URL = "https://api.acoustid.org/v2/lookup"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", required=True, help="Path to audio file")
    parser.add_argument("--api-key", required=True, help="AcoustID API key")
    return parser.parse_args()


def get_fingerprint(file_path):
    try:
        result = subprocess.run(
            ["fpcalc", "-json", file_path],
            capture_output=True, text=True, timeout=30
        )
        if result.returncode != 0:
            return None, None, "fpcalc no encontrado. Instala chromaprint: brew install chromaprint"
        data = json.loads(result.stdout)
        return data.get("fingerprint"), data.get("duration"), None
    except FileNotFoundError:
        return None, None, "fpcalc no encontrado. Instala chromaprint: brew install chromaprint"
    except subprocess.TimeoutExpired:
        return None, None, "fpcalc tardó demasiado procesando el archivo"
    except (json.JSONDecodeError, KeyError):
        return None, None, "Error al leer la salida de fpcalc"


def lookup_acoustid(fingerprint, duration, api_key):
    params = urllib.parse.urlencode({
        "client": api_key,
        "fingerprint": fingerprint,
        "duration": int(duration),
        "meta": "recordings+releases"
    })
    url = f"{ACOUSTID_API_URL}?{params}"

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "MusicKind/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
    except Exception as exc:
        return None, f"Error al contactar AcoustID: {exc}"

    if data.get("status") != "ok":
        return None, "Error en la respuesta de AcoustID"

    results = data.get("results", [])
    if not results:
        return None, "Canción no encontrada en AcoustID"

    best = max(results, key=lambda r: r.get("score", 0))
    recordings = best.get("recordings", [])
    if not recordings:
        return None, "Canción no encontrada en AcoustID"

    rec = recordings[0]
    artists = rec.get("artists", [])
    artist = ", ".join(a.get("name", "") for a in artists) if artists else ""
    title = rec.get("title", "")

    album = ""
    year = ""
    releases = rec.get("releases", [])
    if releases:
        rel = releases[0]
        album = rel.get("title", "")
        date = rel.get("date", {}) or {}
        if date.get("year"):
            year = str(date["year"])

    return {"artist": artist, "title": title, "album": album, "year": year}, None


def main():
    args = parse_args()

    fingerprint, duration, err = get_fingerprint(args.file)
    if err:
        print(json.dumps({"error": err}, ensure_ascii=False))
        return

    result, err = lookup_acoustid(fingerprint, duration, args.api_key)
    if err:
        print(json.dumps({"error": err}, ensure_ascii=False))
        return

    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
