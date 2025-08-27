#!/bin/bash

# Meeting Recorder - One-Command Installer
# Usage: curl -sSL https://raw.githubusercontent.com/Fikrifrds/meeting-notes/main/install.sh | bash

set -e

echo "🎙️ Meeting Recorder - One-Command Installer"
echo "==========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_URL="https://github.com/Fikrifrds/meeting-notes"
RELEASE_API="https://api.github.com/repos/Fikrifrds/meeting-notes/releases/latest"
INSTALL_DIR="$HOME/.local/share/meeting-recorder"
APP_DIR="$HOME/Documents/MeetingRecorder"
DESKTOP_FILE="$HOME/.local/share/applications/meeting-recorder.desktop"

# Functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

detect_platform() {
    case "$(uname -s)" in
        Darwin)
            echo "macos"
            ;;
        Linux)
            if grep -q Microsoft /proc/version 2>/dev/null; then
                echo "windows-wsl"
            else
                echo "linux"
            fi
            ;;
        MINGW*|CYGWIN*|MSYS*)
            echo "windows"
            ;;
        *)
            echo "unknown"
            ;;
    esac
}

install_dependencies() {
    local platform=$1
    
    log_info "Installing system dependencies for $platform..."
    
    case $platform in
        "macos")
            # Check if Homebrew is installed
            if ! command -v brew &> /dev/null; then
                log_info "Installing Homebrew..."
                /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            fi
            ;;
        "linux")
            if command -v apt &> /dev/null; then
                sudo apt update
                sudo apt install -y curl wget unzip
            elif command -v yum &> /dev/null; then
                sudo yum install -y curl wget unzip
            elif command -v pacman &> /dev/null; then
                sudo pacman -S curl wget unzip
            fi
            ;;
    esac
}

download_app() {
    local platform=$1
    
    log_info "Detecting latest release..."
    
    # Get download URL for the platform
    local download_url=""
    case $platform in
        "macos")
            download_url=$(curl -s $RELEASE_API | grep "browser_download_url.*dmg" | cut -d '"' -f 4 | head -n 1)
            ;;
        "linux")
            download_url=$(curl -s $RELEASE_API | grep "browser_download_url.*AppImage" | cut -d '"' -f 4 | head -n 1)
            ;;
        "windows")
            download_url=$(curl -s $RELEASE_API | grep "browser_download_url.*msi" | cut -d '"' -f 4 | head -n 1)
            ;;
    esac
    
    if [ -z "$download_url" ]; then
        log_error "Could not find download URL for $platform"
        log_info "Falling back to source installation..."
        install_from_source
        return
    fi
    
    log_info "Downloading from: $download_url"
    
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    case $platform in
        "macos")
            curl -L -o meeting-recorder.dmg "$download_url"
            log_info "Mounting DMG..."
            hdiutil attach meeting-recorder.dmg
            cp -R /Volumes/Meeting\ Recorder/Meeting\ Recorder.app "$INSTALL_DIR/"
            hdiutil detach /Volumes/Meeting\ Recorder
            rm meeting-recorder.dmg
            ;;
        "linux")
            curl -L -o meeting-recorder.AppImage "$download_url"
            chmod +x meeting-recorder.AppImage
            ;;
        "windows")
            curl -L -o meeting-recorder.msi "$download_url"
            log_warning "Please run the MSI installer manually: $INSTALL_DIR/meeting-recorder.msi"
            ;;
    esac
}

install_from_source() {
    log_info "Installing from source..."
    
    # Check prerequisites
    if ! command -v node &> /dev/null; then
        log_error "Node.js is required but not installed."
        log_info "Please install Node.js from https://nodejs.org/"
        exit 1
    fi
    
    if ! command -v cargo &> /dev/null; then
        log_error "Rust is required but not installed."
        log_info "Please install Rust from https://rustup.rs/"
        exit 1
    fi
    
    # Clone and build
    git clone "$REPO_URL" "$INSTALL_DIR/source"
    cd "$INSTALL_DIR/source"
    
    log_info "Installing dependencies..."
    npm install
    
    log_info "Building application..."
    npm run tauri build
    
    # Copy built app to install directory
    case "$(detect_platform)" in
        "macos")
            cp -R src-tauri/target/release/bundle/macos/Meeting\ Recorder.app "$INSTALL_DIR/"
            ;;
        "linux")
            cp src-tauri/target/release/bundle/appimage/meeting-recorder*.AppImage "$INSTALL_DIR/meeting-recorder.AppImage"
            chmod +x "$INSTALL_DIR/meeting-recorder.AppImage"
            ;;
    esac
}

setup_data_directories() {
    log_info "Setting up data directories..."
    
    mkdir -p "$APP_DIR/MeetingRecordings/models"
    mkdir -p "$APP_DIR/exports"
    mkdir -p "$APP_DIR/backups"
    
    log_success "Data directories created at $APP_DIR"
}

download_whisper_models() {
    log_info "Downloading Whisper AI models..."
    
    local models_dir="$APP_DIR/MeetingRecordings/models"
    
    # Download recommended model (large-v3 for best multilingual support)
    local model_url="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin"
    local model_file="$models_dir/ggml-large-v3.bin"
    
    if [ ! -f "$model_file" ]; then
        log_info "Downloading large-v3 model (3.1GB) - this may take a few minutes..."
        curl -L --progress-bar -o "$model_file" "$model_url"
        
        if [ -f "$model_file" ] && [ -s "$model_file" ]; then
            log_success "Whisper model downloaded successfully"
        else
            log_error "Failed to download Whisper model"
            rm -f "$model_file"
            
            # Fallback to smaller model
            log_info "Downloading smaller base.en model (142MB)..."
            local fallback_url="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
            local fallback_file="$models_dir/ggml-base.en.bin"
            curl -L -o "$fallback_file" "$fallback_url"
        fi
    else
        log_success "Whisper model already exists"
    fi
}

setup_environment() {
    log_info "Setting up environment configuration..."
    
    local env_file="$APP_DIR/.env"
    if [ ! -f "$env_file" ]; then
        cat > "$env_file" << 'EOL'
# AI Configuration
OPENAI_API_KEY=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

# OpenAI Settings
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.3

# Whisper Configuration
WHISPER_MODEL_PATH=auto
EOL
        log_success "Environment configuration created"
    else
        log_success "Environment configuration already exists"
    fi
}

create_desktop_entry() {
    local platform=$1
    
    if [ "$platform" = "linux" ]; then
        log_info "Creating desktop entry..."
        
        mkdir -p "$(dirname "$DESKTOP_FILE")"
        
        cat > "$DESKTOP_FILE" << EOL
[Desktop Entry]
Name=Meeting Recorder
Comment=AI-powered meeting recorder with real-time transcription
Exec=$INSTALL_DIR/meeting-recorder.AppImage
Icon=$INSTALL_DIR/icon.png
Terminal=false
Type=Application
Categories=Office;AudioVideo;
EOL
        
        chmod +x "$DESKTOP_FILE"
        log_success "Desktop entry created"
    fi
}

create_launcher_scripts() {
    local platform=$1
    
    # Create launcher script
    local launcher="$INSTALL_DIR/launch.sh"
    cat > "$launcher" << EOL
#!/bin/bash
cd "$APP_DIR"
export PATH="\$PATH:$INSTALL_DIR"

case "$platform" in
    "macos")
        open "$INSTALL_DIR/Meeting Recorder.app"
        ;;
    "linux")
        "$INSTALL_DIR/meeting-recorder.AppImage"
        ;;
    *)
        echo "Platform not supported for automatic launch"
        ;;
esac
EOL
    
    chmod +x "$launcher"
    
    # Create global command
    local bin_dir="$HOME/.local/bin"
    mkdir -p "$bin_dir"
    ln -sf "$launcher" "$bin_dir/meeting-recorder"
    
    log_success "Launcher created - you can now run 'meeting-recorder' from anywhere"
}

setup_auto_updates() {
    log_info "Setting up auto-update mechanism..."
    
    # Create update script
    local update_script="$INSTALL_DIR/update.sh"
    cat > "$update_script" << 'EOL'
#!/bin/bash
echo "🔄 Checking for Meeting Recorder updates..."
curl -sSL https://raw.githubusercontent.com/Fikrifrds/meeting-notes/main/install.sh | bash
EOL
    
    chmod +x "$update_script"
    log_success "Auto-update script created at $update_script"
}


main() {
    log_info "Starting installation process..."
    
    # Detect platform
    local platform=$(detect_platform)
    log_info "Detected platform: $platform"
    
    if [ "$platform" = "unknown" ]; then
        log_error "Unsupported platform. Please install manually."
        exit 1
    fi
    
    # Install system dependencies
    install_dependencies "$platform"
    
    # Setup directories first
    setup_data_directories
    
    # Download and setup application
    log_info "Downloading Meeting Recorder..."
    download_app "$platform"
    
    # Download AI models
    download_whisper_models
    
    # Setup configuration
    setup_environment
    
    # Create launchers
    create_desktop_entry "$platform"
    create_launcher_scripts "$platform"
    
    # Setup updates
    setup_auto_updates
    
    log_success "✨ Installation completed successfully!"
    echo
    echo "🎉 Meeting Recorder is now ready to use!"
    echo
    echo "📍 Installation location: $INSTALL_DIR"
    echo "📁 Data location: $APP_DIR"
    echo
    echo "🚀 To start the application:"
    case $platform in
        "macos")
            echo "   • Double-click Meeting Recorder in Applications"
            echo "   • Or run: open '$INSTALL_DIR/Meeting Recorder.app'"
            ;;
        "linux")
            echo "   • Run: meeting-recorder"
            echo "   • Or find 'Meeting Recorder' in your applications menu"
            ;;
        "windows")
            echo "   • Run the MSI installer at: $INSTALL_DIR/meeting-recorder.msi"
            ;;
    esac
    echo
    echo "📚 Features ready to use:"
    echo "   ✅ Audio recording"
    echo "   ✅ AI transcription (Whisper model downloaded)"
    echo "   ✅ AI meeting minutes generation (OpenAI)"
    echo "   ✅ Cloud AI processing ready"
    echo
    echo "🔄 To update: $INSTALL_DIR/update.sh"
    echo "❓ For help: https://github.com/Fikrifrds/meeting-notes"
}

# Run the installer
main "$@"