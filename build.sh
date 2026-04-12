#!/bin/bash

# Build script for MusicKind Electron app
echo "🏗️ MusicKind Build Script"
echo "========================"

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "src" ] || [ ! -d "ui" ]; then
    echo "❌ Please run this script from the MusicKind project root directory"
    exit 1
fi

echo "📦 Installing dependencies..."
npm install

echo "🔍 Checking Python dependencies..."
python3 -c "import sys; print('Python version:', sys.version)"
python3 -c "import librosa; print('✅ librosa available')" 2>/dev/null || echo "⚠️ librosa not found"

echo "🎯 Creating build directory..."
mkdir -p dist

echo "📋 Checking Electron configuration..."
if [ -f "node_modules/.bin/electron" ]; then
    echo "✅ Electron is installed"
else
    echo "⚠️ Installing Electron..."
    npm install electron --save-dev
fi

echo "🍎 Preparing for macOS build (if applicable)..."
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "📱 macOS detected - can create .dmg package"
    echo "💡 To build .dmg: npm run build"
fi

echo "🪟 Preparing for Windows build (if applicable)..."
if [[ "$OSTYPE" == "msys"* ]] || [[ "$OSTYPE" == "win32"* ]]; then
    echo "🪟 Windows detected - can create .exe installer"
    echo "💡 To build installer: npm run build"
fi

echo "🐧 Preparing for Linux build (if applicable)..."
if [[ "$OSTYPE" == "linux"* ]]; then
    echo "🐧 Linux detected - can create AppImage/deb package"
    echo "💡 To build package: npm run build"
fi

echo ""
echo "🚀 Build preparation completed!"
echo ""
echo "Next steps:"
echo "1. Test the app: npm run electron"
echo "2. Build for distribution: npm run build"
echo "3. Run tests: ./run_tests.sh"
echo ""
echo "📚 For more information, see README_improved.md"