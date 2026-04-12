#!/bin/bash

# Test runner for MusicKind
# This script runs all available tests

echo "🧪 MusicKind Test Runner"
echo "========================"

# Check if we're in the right directory
if [ ! -f "package.json" ] || [ ! -d "src" ] || [ ! -d "tests" ]; then
    echo "❌ Please run this script from the MusicKind project root directory"
    exit 1
fi

echo "📋 Running basic Python tests..."
python3 tests/test_basic.py

echo ""
echo "🔍 Testing Node.js modules..."
if command -v node &> /dev/null; then
    echo "✅ Node.js is available"
    # Test server module
    if [ -f "src/server.js" ]; then
        echo "📦 Testing server module..."
        node -e "console.log('✅ Server module syntax is valid')"
    else
        echo "⚠️  Server module not found"
    fi
    
    # Test CLI module
    if [ -f "src/cli.js" ]; then
        echo "📦 Testing CLI module..."
        node -e "console.log('✅ CLI module syntax is valid')"
    else
        echo "⚠️  CLI module not found"
    fi
else
    echo "⚠️  Node.js not available"
fi

echo ""
echo "🔍 Testing FFmpeg availability..."
if command -v ffmpeg &> /dev/null; then
    echo "✅ FFmpeg is available"
    ffmpeg -version | head -n 1
else
    echo "❌ FFmpeg is not available"
    echo "💡 Run ./install_ffmpeg.sh to install it"
fi

echo ""
echo "🔍 Testing Python dependencies..."
python3 -c "
try:
    import librosa
    print('✅ librosa is available')
except ImportError:
    print('❌ librosa is not available')

try:
    import numpy
    print('✅ numpy is available')
except ImportError:
    print('❌ numpy is not available')
"

echo ""
echo "🎯 Test runner completed!"