#!/bin/bash

# Build Meeting Recorder with Pre-downloaded Models
# This script creates a distribution package that includes Whisper models

set -e

echo "🔨 Building Meeting Recorder with Pre-downloaded Models"
echo "====================================================="

# Configuration
MODELS_DIR="./bundled-models"
BUILD_DIR="./src-tauri/target/release/bundle"
DIST_DIR="./dist-with-models"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Download models if not present
download_models() {
    log_info "Preparing Whisper models..."
    
    mkdir -p "$MODELS_DIR"
    
    # Model configurations
    declare -A models=(
        ["ggml-large-v3.bin"]="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin"
        ["ggml-base.en.bin"]="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
        ["ggml-small.bin"]="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
    )
    
    for model in "${!models[@]}"; do
        local model_path="$MODELS_DIR/$model"
        if [ ! -f "$model_path" ]; then
            log_info "Downloading $model..."
            curl -L --progress-bar -o "$model_path" "${models[$model]}"
            
            # Verify download
            if [ ! -s "$model_path" ]; then
                log_warning "Failed to download $model, removing empty file"
                rm -f "$model_path"
            else
                log_success "Downloaded $model ($(du -h "$model_path" | cut -f1))"
            fi
        else
            log_success "$model already exists ($(du -h "$model_path" | cut -f1))"
        fi
    done
}

# Build the application
build_app() {
    log_info "Building Tauri application..."
    
    # Clean previous builds
    npm run tauri clean 2>/dev/null || true
    
    # Install dependencies
    npm install
    
    # Build for production
    npm run tauri build
    
    log_success "Application built successfully"
}

# Create distribution packages
create_distribution_packages() {
    log_info "Creating distribution packages with models..."
    
    # Clean and create dist directory
    rm -rf "$DIST_DIR"
    mkdir -p "$DIST_DIR"
    
    # Detect platform and copy appropriate files
    if [[ "$OSTYPE" == "darwin"* ]]; then
        create_macos_package
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        create_linux_package
    else
        log_warning "Unsupported platform for automatic packaging: $OSTYPE"
    fi
}

create_macos_package() {
    log_info "Creating macOS distribution package..."
    
    local macos_build="$BUILD_DIR/macos"
    local dmg_build="$BUILD_DIR/dmg"
    
    if [ -d "$macos_build" ]; then
        # Create app bundle with models
        local app_name=$(find "$macos_build" -name "*.app" -type d | head -n 1)
        if [ -n "$app_name" ]; then
            local dist_app="$DIST_DIR/$(basename "$app_name")"
            cp -R "$app_name" "$dist_app"
            
            # Add models to app bundle
            local models_dest="$dist_app/Contents/Resources/models"
            mkdir -p "$models_dest"
            cp "$MODELS_DIR"/* "$models_dest/" 2>/dev/null || true
            
            log_success "Created macOS app bundle with models"
            
            # Create installer script
            create_macos_installer
        fi
    fi
    
    # Also copy DMG if available
    if [ -d "$dmg_build" ]; then
        cp "$dmg_build"/*.dmg "$DIST_DIR/" 2>/dev/null || true
    fi
}

create_linux_package() {
    log_info "Creating Linux distribution package..."
    
    # Copy AppImage
    local appimage_build="$BUILD_DIR/appimage"
    if [ -d "$appimage_build" ]; then
        cp "$appimage_build"/*.AppImage "$DIST_DIR/" 2>/dev/null || true
    fi
    
    # Copy DEB package
    local deb_build="$BUILD_DIR/deb"
    if [ -d "$deb_build" ]; then
        cp "$deb_build"/*.deb "$DIST_DIR/" 2>/dev/null || true
    fi
    
    # Create portable package
    create_linux_portable
}

create_macos_installer() {
    cat > "$DIST_DIR/install-macos.sh" << 'EOL'
#!/bin/bash

echo "🍎 Installing Meeting Recorder for macOS"
echo "======================================="

APP_NAME="Meeting Recorder.app"
INSTALL_DIR="/Applications"
DATA_DIR="$HOME/Documents/MeetingRecorder"

# Copy app to Applications
if [ -d "$APP_NAME" ]; then
    echo "📱 Installing application..."
    cp -R "$APP_NAME" "$INSTALL_DIR/"
    
    # Setup data directory
    echo "📁 Setting up data directories..."
    mkdir -p "$DATA_DIR/MeetingRecordings/models"
    mkdir -p "$DATA_DIR/exports"
    
    # Copy models from app bundle to user directory
    if [ -d "$INSTALL_DIR/$APP_NAME/Contents/Resources/models" ]; then
        cp "$INSTALL_DIR/$APP_NAME/Contents/Resources/models"/* "$DATA_DIR/MeetingRecordings/models/"
        echo "✅ Whisper models installed"
    fi
    
    # Create environment file
    if [ ! -f "$DATA_DIR/.env" ]; then
        cat > "$DATA_DIR/.env" << 'ENV_EOF'
OPENAI_API_KEY=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
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.3
ENV_EOF
        echo "⚙️ Environment configuration created"
    fi
    
    echo "✅ Installation completed!"
    echo "🚀 You can now find Meeting Recorder in your Applications folder"
    
    # Open the app
    read -p "Open Meeting Recorder now? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open "$INSTALL_DIR/$APP_NAME"
    fi
else
    echo "❌ Application bundle not found"
    exit 1
fi
EOL
    
    chmod +x "$DIST_DIR/install-macos.sh"
    log_success "Created macOS installer script"
}

create_linux_portable() {
    log_info "Creating Linux portable package..."
    
    local portable_dir="$DIST_DIR/meeting-recorder-portable"
    mkdir -p "$portable_dir/bin"
    mkdir -p "$portable_dir/data/models"
    mkdir -p "$portable_dir/data/recordings"
    
    # Copy models
    cp "$MODELS_DIR"/* "$portable_dir/data/models/" 2>/dev/null || true
    
    # Copy AppImage
    local appimage=$(find "$BUILD_DIR/appimage" -name "*.AppImage" 2>/dev/null | head -n 1)
    if [ -n "$appimage" ]; then
        cp "$appimage" "$portable_dir/bin/meeting-recorder.AppImage"
        chmod +x "$portable_dir/bin/meeting-recorder.AppImage"
    fi
    
    # Create launcher script
    cat > "$portable_dir/meeting-recorder" << 'EOL'
#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$SCRIPT_DIR/data"
export MEETING_RECORDER_DATA_DIR="$DATA_DIR"

# Setup data directory in user home if not using portable mode
if [ -z "$MEETING_RECORDER_PORTABLE" ]; then
    USER_DATA_DIR="$HOME/Documents/MeetingRecorder"
    mkdir -p "$USER_DATA_DIR/MeetingRecordings/models"
    mkdir -p "$USER_DATA_DIR/exports"
    
    # Copy models if they don't exist
    if [ ! -f "$USER_DATA_DIR/MeetingRecordings/models/ggml-large-v3.bin" ] && [ -f "$DATA_DIR/models/ggml-large-v3.bin" ]; then
        cp "$DATA_DIR/models"/* "$USER_DATA_DIR/MeetingRecordings/models/"
        echo "✅ Whisper models copied to $USER_DATA_DIR/MeetingRecordings/models/"
    fi
    
    cd "$USER_DATA_DIR"
else
    cd "$DATA_DIR"
fi

# Launch the application
"$SCRIPT_DIR/bin/meeting-recorder.AppImage" "$@"
EOL
    
    chmod +x "$portable_dir/meeting-recorder"
    
    # Create install script
    cat > "$portable_dir/install.sh" << 'EOL'
#!/bin/bash
echo "🐧 Installing Meeting Recorder for Linux"
echo "======================================="

INSTALL_DIR="$HOME/.local/share/meeting-recorder"
BIN_DIR="$HOME/.local/bin"
DATA_DIR="$HOME/Documents/MeetingRecorder"

# Create directories
mkdir -p "$INSTALL_DIR"
mkdir -p "$BIN_DIR"
mkdir -p "$DATA_DIR/MeetingRecordings/models"
mkdir -p "$DATA_DIR/exports"

# Copy files
cp -R * "$INSTALL_DIR/"

# Create symlink
ln -sf "$INSTALL_DIR/meeting-recorder" "$BIN_DIR/meeting-recorder"

# Setup desktop entry
DESKTOP_FILE="$HOME/.local/share/applications/meeting-recorder.desktop"
mkdir -p "$(dirname "$DESKTOP_FILE")"

cat > "$DESKTOP_FILE" << 'DESKTOP_EOF'
[Desktop Entry]
Name=Meeting Recorder
Comment=AI-powered meeting recorder with real-time transcription
Exec=$HOME/.local/bin/meeting-recorder
Terminal=false
Type=Application
Categories=Office;AudioVideo;
DESKTOP_EOF

echo "✅ Installation completed!"
echo "🚀 You can now run 'meeting-recorder' from anywhere"
echo "📱 Or find Meeting Recorder in your applications menu"
EOL
    
    chmod +x "$portable_dir/install.sh"
    
    # Create archive
    cd "$DIST_DIR"
    tar -czf meeting-recorder-portable-linux.tar.gz meeting-recorder-portable/
    cd - > /dev/null
    
    log_success "Created Linux portable package"
}

create_release_info() {
    log_info "Creating release information..."
    
    cat > "$DIST_DIR/README.txt" << EOL
Meeting Recorder - Ready-to-Use Distribution
==========================================

This package includes:
✅ Meeting Recorder application
✅ Pre-downloaded Whisper AI models
✅ Automatic setup scripts
✅ Ready-to-use configuration

Installation:
-------------

macOS:
  1. Run: ./install-macos.sh
  2. Or drag Meeting Recorder.app to Applications folder

Linux:
  1. Extract meeting-recorder-portable-linux.tar.gz
  2. Run: ./meeting-recorder-portable/install.sh
  3. Or run portable: ./meeting-recorder-portable/meeting-recorder

Windows:
  1. Run the .msi installer
  2. Models will be automatically set up

Features Ready to Use:
---------------------
🎙️ Audio recording
🤖 AI transcription (Whisper models included)
📝 Meeting minutes generation
🏠 Local AI support (with Ollama)
☁️ Cloud AI support (add OpenAI API key)

Data Location:
--------------
~/Documents/MeetingRecorder/

Support:
--------
GitHub: https://github.com/Fikrifrds/meeting-notes
Issues: https://github.com/Fikrifrds/meeting-notes/issues

Enjoy your meetings! 🎉
EOL

    # Create checksum file
    cd "$DIST_DIR"
    find . -type f \( -name "*.app" -o -name "*.AppImage" -o -name "*.deb" -o -name "*.dmg" -o -name "*.msi" -o -name "*.tar.gz" \) -exec shasum -a 256 {} \; > SHA256SUMS
    cd - > /dev/null
    
    log_success "Created release information"
}

# Main execution
main() {
    # Check prerequisites
    if ! command -v npm &> /dev/null; then
        echo "❌ npm is required but not installed"
        exit 1
    fi
    
    if ! command -v cargo &> /dev/null; then
        echo "❌ Rust/Cargo is required but not installed"
        exit 1
    fi
    
    # Execute build steps
    download_models
    build_app
    create_distribution_packages
    create_release_info
    
    echo
    log_success "🎉 Build completed successfully!"
    echo
    echo "📦 Distribution packages created in: $DIST_DIR"
    echo
    echo "📋 Available packages:"
    find "$DIST_DIR" -maxdepth 1 -type f \( -name "*.app" -o -name "*.AppImage" -o -name "*.deb" -o -name "*.dmg" -o -name "*.msi" -o -name "*.tar.gz" \) -exec basename {} \; | sed 's/^/   • /'
    echo
    echo "🚀 Users can install with:"
    echo "   curl -sSL https://your-domain.com/install.sh | bash"
    echo
    echo "📁 Or download packages from: $DIST_DIR"
}

main "$@"