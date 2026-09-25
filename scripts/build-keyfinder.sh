#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORK="$ROOT/.cache/build/keyfinder"
DOWNLOADS="$WORK/downloads"
SOURCE="$WORK/src"
BUILD="$WORK/build"
PREFIX="$WORK/prefix"
VENDOR="$ROOT/vendor/keyfinder"
FFTW_URL="https://fftw.org/fftw-3.3.11.tar.gz"
KEYFINDER_URL="https://github.com/mixxxdj/libkeyfinder/archive/refs/tags/2.2.8.tar.gz"
FFTW_SHA256="5630c24cdeb33b131612f7eb4b1a9934234754f9f388ff8617458d0be6f239a1"
KEYFINDER_SHA256="a54fc6c5ff435bb4b447f175bc97f9081fb5abf0edd5d125e6f5215c8fff4d11"
MIN_VERSION="12.0"

[[ "$(uname -s)" == Darwin ]] || { echo "Este script requiere macOS." >&2; exit 1; }
for tool in curl shasum tar make cmake clang++ lipo; do
  command -v "$tool" >/dev/null || { echo "Falta herramienta requerida: $tool" >&2; exit 1; }
done

mkdir -p "$DOWNLOADS" "$SOURCE" "$BUILD" "$PREFIX" "$VENDOR/darwin" "$VENDOR/licenses"
fetch() {
  local url="$1" dest="$2" expected="$3"
  if [[ ! -f "$dest" ]]; then curl -fL --retry 2 "$url" -o "$dest"; fi
  echo "$expected  $dest" | shasum -a 256 -c -
}
fetch "$FFTW_URL" "$DOWNLOADS/fftw-3.3.11.tar.gz" "$FFTW_SHA256"
fetch "$KEYFINDER_URL" "$DOWNLOADS/libkeyfinder-2.2.8.tar.gz" "$KEYFINDER_SHA256"

mkdir -p "$SOURCE/fftw" "$SOURCE/libkeyfinder"
if [[ ! -f "$SOURCE/fftw/configure" ]]; then
  tar -xzf "$DOWNLOADS/fftw-3.3.11.tar.gz" -C "$SOURCE/fftw" --strip-components=1
fi
if [[ ! -f "$SOURCE/libkeyfinder/CMakeLists.txt" ]]; then
  tar -xzf "$DOWNLOADS/libkeyfinder-2.2.8.tar.gz" -C "$SOURCE/libkeyfinder" --strip-components=1
fi

for arch in arm64 x86_64; do
  fftw_prefix="$PREFIX/$arch/fftw"
  keyfinder_prefix="$PREFIX/$arch/keyfinder"
  fftw_build="$BUILD/$arch/fftw"
  keyfinder_build="$BUILD/$arch/keyfinder"
  mkdir -p "$fftw_build"
  (
    cd "$fftw_build"
    MACOSX_DEPLOYMENT_TARGET="$MIN_VERSION" \
      CFLAGS="-arch $arch -mmacosx-version-min=$MIN_VERSION -O2" \
      LDFLAGS="-arch $arch -mmacosx-version-min=$MIN_VERSION" \
      "$SOURCE/fftw/configure" --host="$arch-apple-darwin" --prefix="$fftw_prefix" \
        --enable-static --disable-shared --disable-fortran --disable-mpi
    make -j"$(sysctl -n hw.ncpu)"
    make install
  )
  cmake -S "$SOURCE/libkeyfinder" -B "$keyfinder_build" \
    -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DBUILD_TESTING=OFF \
    -DCMAKE_OSX_ARCHITECTURES="$arch" -DCMAKE_OSX_DEPLOYMENT_TARGET="$MIN_VERSION" \
    -DCMAKE_INSTALL_PREFIX="$keyfinder_prefix" \
    -DFFTW3_INCLUDE_DIR="$fftw_prefix/include" -DFFTW3_LIBRARY="$fftw_prefix/lib/libfftw3.a"
  cmake --build "$keyfinder_build" --parallel "$(sysctl -n hw.ncpu)"
  cmake --install "$keyfinder_build"
  clang++ -std=c++11 -O2 -arch "$arch" -mmacosx-version-min="$MIN_VERSION" \
    -I"$keyfinder_prefix/include" "$ROOT/tools/keyfinder-cli.cpp" \
    "$keyfinder_prefix/lib/libkeyfinder.a" "$fftw_prefix/lib/libfftw3.a" \
    -o "$BUILD/$arch/keyfinder-cli"
done

lipo -create "$BUILD/arm64/keyfinder-cli" "$BUILD/x86_64/keyfinder-cli" \
  -output "$VENDOR/darwin/keyfinder-cli.tmp"
chmod 755 "$VENDOR/darwin/keyfinder-cli.tmp"
mv "$VENDOR/darwin/keyfinder-cli.tmp" "$VENDOR/darwin/keyfinder-cli"
cp "$SOURCE/libkeyfinder/LICENSE" "$VENDOR/licenses/libkeyfinder-COPYING"
cp "$SOURCE/fftw/COPYING" "$VENDOR/licenses/fftw-COPYING"
echo "Built $VENDOR/darwin/keyfinder-cli"
