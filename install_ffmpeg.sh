#!/bin/bash

# FFmpeg Installation Helper for MusicKind
# This script helps users install FFmpeg on different platforms

echo "🎵 MusicKind - FFmpeg Installation Helper"
echo "========================================="

detect_os() {
    case "$(uname -s)" in
        Linux)
            if [ -f /etc/debian_version ]; then
                echo "debian"
            elif [ -f /etc/redhat-release ]; then
                echo "redhat"
            else
                echo "linux"
            fi
            ;;
        Darwin)
            echo "macos"
            ;;
        CYGWIN*|MINGW32*|MSYS*|MINGW*)
            echo "windows"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

install_ffmpeg() {
    local os=$1
    echo "🔍 Detected OS: $os"
    
    case $os in
        "macos")
            echo "🍎 macOS detected"
            if command -v brew &> /dev/null; then
                echo "🍺 Installing FFmpeg using Homebrew..."
                brew install ffmpeg
                if [ $? -eq 0 ]; then
                    echo "✅ FFmpeg installed successfully!"
                else
                    echo "❌ Failed to install FFmpeg. Please try manually:"
                    echo "   brew install ffmpeg"
                fi
            else
                echo "⚠️  Homebrew not found. Please install Homebrew first:"
                echo "   /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
                echo "Then run this script again."
            fi
            ;;
        "debian")
            echo "🐧 Debian/Ubuntu detected"
            echo "📦 Installing FFmpeg using apt..."
            sudo apt update
            sudo apt install -y ffmpeg
            if [ $? -eq 0 ]; then
                echo "✅ FFmpeg installed successfully!"
            else
                echo "❌ Failed to install FFmpeg. Please try manually:"
                echo "   sudo apt update && sudo apt install ffmpeg"
            fi
            ;;
        "redhat")
            echo "🐧 RedHat/CentOS/Fedora detected"
            echo "📦 Installing FFmpeg using yum/dnf..."
            if command -v dnf &> /dev/null; then
                sudo dnf install -y ffmpeg
            else
                sudo yum install -y ffmpeg
            fi
            if [ $? -eq 0 ]; then
                echo "✅ FFmpeg installed successfully!"
            else
                echo "❌ Failed to install FFmpeg. Please try manually:"
                echo "   sudo dnf install ffmpeg  # or sudo yum install ffmpeg"
            fi
            ;;
        "windows")
            echo "🪟 Windows detected"
            echo "💡 Please download FFmpeg manually:"
            echo "   1. Visit: https://ffmpeg.org/download.html"
            echo "   2. Download the Windows build"
            echo "   3. Extract to a location like C:\\ffmpeg"
            echo "   4. Add C:\\ffmpeg\\bin to your PATH environment variable"
            echo ""
            echo "🔄 Alternatively, use Chocolatey (if installed):"
            echo "   choco install ffmpeg"
            ;;
        *)
            echo "❌ Unknown operating system"
            echo "💡 Please install FFmpeg manually from: https://ffmpeg.org/download.html"
            ;;
    esac
}

verify_ffmpeg() {
    if command -v ffmpeg &> /dev/null; then
        echo "✅ FFmpeg is installed and available!"
        echo "📋 FFmpeg version:"
        ffmpeg -version | head -n 1
        return 0
    else
        echo "❌ FFmpeg is not available in PATH"
        return 1
    fi
}

main() {
    # Check if FFmpeg is already installed
    if verify_ffmpeg; then
        echo ""
        read -p "FFmpeg is already installed. Reinstall? (y/N): " reinstall
        if [[ ! "$reinstall" =~ ^[Yy]$ ]]; then
            echo "👋 Installation cancelled."
            exit 0
        fi
    fi
    
    echo ""
    read -p "This script will attempt to install FFmpeg. Continue? (Y/n): " confirm
    if [[ "$confirm" =~ ^[Nn]$ ]]; then
        echo "👋 Installation cancelled."
        exit 0
    fi
    
    echo ""
    local os=$(detect_os)
    install_ffmpeg "$os"
    
    echo ""
    echo "🔄 Verifying installation..."
    if verify_ffmpeg; then
        echo "🎉 FFmpeg installation completed successfully!"
        echo "🚀 You can now use MusicKind with all features!"
    else
        echo "⚠️  Installation may have failed. Please check the error messages above."
        echo "💡 You may need to install FFmpeg manually."
        exit 1
    fi
}

main "$@"