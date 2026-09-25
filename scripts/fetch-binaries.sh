#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CACHE="$ROOT/.cache/build/bin"
LICENSES="$ROOT/vendor/bin/licenses"
FFMPEG_RELEASE="9.0.2"
CHROMAPRINT_RELEASE="v1.5.1"

usage() { echo "Uso: $0 <arm64|x64>" >&2; exit 2; }
[[ $# == 1 ]] || usage
case "$1" in arm64) ARCH=arm64; LIPO_ARCH=arm64 ;; x64) ARCH=x64; LIPO_ARCH=x86_64 ;; *) usage ;; esac
command -v curl >/dev/null && command -v shasum >/dev/null || { echo "Se requieren curl y shasum." >&2; exit 1; }
[[ "$(uname -s)" == Darwin ]] || { echo "Este script requiere macOS (lipo y otool)." >&2; exit 1; }

mkdir -p "$CACHE" "$LICENSES" "$ROOT/vendor/bin/darwin-$ARCH"

fetch() {
  local name="$1" url="$2" sha="$3"
  local file="$CACHE/$name"
  if [[ ! -f "$file" ]] || [[ "$(shasum -a 256 "$file" | awk '{print $1}')" != "$sha" ]]; then
    rm -f "$file"
    curl --fail --location --silent --show-error "$url" -o "$file"
  fi
  local actual
  actual="$(shasum -a 256 "$file" | awk '{print $1}')"
  [[ "$actual" == "$sha" ]] || { echo "SHA-256 inválido para $name: $actual" >&2; rm -f "$file"; exit 1; }
}

if [[ "$ARCH" == arm64 ]]; then
  DOWNLOAD_ARCH=arm64
  RELEASE_ID=1789931890
  FFMPEG_SHA=c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924
  FFPROBE_SHA=fcbe839537485eaee7a7a8bc5cbc0f90d53617e80943e8a5b2e31cb851197ea6
else
  DOWNLOAD_ARCH=amd64
  RELEASE_ID=1789931006
  FFMPEG_SHA=7c6b4125b191cbf773832dc51f424cf2b6bb7da43007d1e066f95909e47cacd4
  FFPROBE_SHA=2322438ed2f6319a691291b247d09c69dcaa3a982460d1f269a7e1af335cfdfd
fi
base="https://ffmpeg.martin-riedl.de/download/macos/$DOWNLOAD_ARCH/${RELEASE_ID}_$FFMPEG_RELEASE"
fetch "ffmpeg-$ARCH-$FFMPEG_RELEASE.zip" "$base/ffmpeg.zip" "$FFMPEG_SHA"
fetch "ffprobe-$ARCH-$FFMPEG_RELEASE.zip" "$base/ffprobe.zip" "$FFPROBE_SHA"
unzip -p "$CACHE/ffmpeg-$ARCH-$FFMPEG_RELEASE.zip" ffmpeg > "$ROOT/vendor/bin/darwin-$ARCH/ffmpeg"
unzip -p "$CACHE/ffprobe-$ARCH-$FFMPEG_RELEASE.zip" ffprobe > "$ROOT/vendor/bin/darwin-$ARCH/ffprobe"
chmod 755 "$ROOT/vendor/bin/darwin-$ARCH/ffmpeg" "$ROOT/vendor/bin/darwin-$ARCH/ffprobe"

fpcalc="chromaprint-fpcalc-1.5.1-macos-universal.tar.gz"
fetch "$fpcalc" "https://github.com/acoustid/chromaprint/releases/download/$CHROMAPRINT_RELEASE/$fpcalc" d4d8faff4b5f7c558d9be053da47804f9501eaa6c2f87906a9f040f38d61c860
tar -xzf "$CACHE/$fpcalc" -C "$CACHE"
install -m 755 "$CACHE/chromaprint-fpcalc-1.5.1-macos-universal/fpcalc" "$ROOT/vendor/bin/darwin-$ARCH/fpcalc"
fetch chromaprint-LICENSE.md "https://raw.githubusercontent.com/acoustid/chromaprint/$CHROMAPRINT_RELEASE/LICENSE.md" 562cfe59627e0c4e8e3b066f3ff2e9736f83811ffe4c6c2c7796595aa7595ebd
install -m 644 "$CACHE/chromaprint-LICENSE.md" "$LICENSES/Chromaprint-LICENSE.md"
fetch COPYING.LGPLv2.1 "https://www.gnu.org/licenses/old-licenses/lgpl-2.1.txt" 20e50fe7aae3e56378ebf0417d9de904f55a0e61e4df315333e632a4d3555d95
install -m 644 "$CACHE/COPYING.LGPLv2.1" "$LICENSES/COPYING.LGPLv2.1"
fetch ffmpeg-COPYING.GPLv3 "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n$FFMPEG_RELEASE/COPYING.GPLv3" 8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903
install -m 644 "$CACHE/ffmpeg-COPYING.GPLv3" "$LICENSES/FFmpeg-COPYING.GPLv3"
install -m 644 "$ROOT/vendor/keyfinder/licenses/libkeyfinder-COPYING" "$LICENSES/libkeyfinder-COPYING"
install -m 644 "$ROOT/vendor/keyfinder/licenses/fftw-COPYING" "$LICENSES/fftw-COPYING"

keyfinder="$ROOT/vendor/keyfinder/darwin/keyfinder-cli"
[[ -x "$keyfinder" ]] || { echo "Falta $keyfinder; ejecuta scripts/build-keyfinder.sh primero." >&2; exit 1; }
install -m 755 "$keyfinder" "$ROOT/vendor/bin/darwin-$ARCH/keyfinder-cli"

for name in ffmpeg ffprobe fpcalc keyfinder-cli; do
  binary="$ROOT/vendor/bin/darwin-$ARCH/$name"
  actual_archs="$(lipo -archs "$binary")"
  [[ " $actual_archs " == *" $LIPO_ARCH "* ]] || { echo "$name: esperaba $LIPO_ARCH, encontrado $actual_archs" >&2; exit 1; }
  bad_deps="$(otool -L "$binary" | awk '/^[[:space:]]/ {print $1}' | grep -Ev '^(/usr/lib/|/System/)' || true)"
  [[ -z "$bad_deps" ]] || { echo "$name tiene dependencias externas:" >&2; echo "$bad_deps" >&2; exit 1; }
done

if [[ "$ARCH" == x64 ]] && [[ "$(uname -m)" == arm64 ]]; then
  version_output="$(arch -x86_64 "$ROOT/vendor/bin/darwin-$ARCH/ffmpeg" -version)"
else
  version_output="$("$ROOT/vendor/bin/darwin-$ARCH/ffmpeg" -version)"
fi
grep -q -- '--enable-gpl' <<<"$version_output" || { echo 'El build de FFmpeg no declara --enable-gpl.' >&2; exit 1; }
grep -q -- '--enable-version3' <<<"$version_output" || { echo 'El build de FFmpeg no declara --enable-version3.' >&2; exit 1; }
if grep -q -- '--enable-nonfree' <<<"$version_output"; then echo 'El build nonfree de FFmpeg no se puede redistribuir.' >&2; exit 1; fi
head -n 1 <<<"$version_output"
"$ROOT/vendor/bin/darwin-$ARCH/fpcalc" -version
echo "Binarios verificados en vendor/bin/darwin-$ARCH ($LIPO_ARCH)."
