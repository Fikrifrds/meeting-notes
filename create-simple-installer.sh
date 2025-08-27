#!/bin/bash

# Create Simple Installer Bundle
# Creates a downloadable folder that users can run with one click

set -e

echo "📦 Creating Simple Installer Bundle"
echo "=================================="

VERSION="1.0.0"
BUNDLE_NAME="MeetingRecorder-${VERSION}-Installer"
BUILD_DIR="./simple-installer"

# Clean and create build directory
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/$BUNDLE_NAME"
cd "$BUILD_DIR/$BUNDLE_NAME"

echo "🔨 Building application..."

# Build the app in the source directory
cd ../../
npm install
npm run tauri build
cd "$BUILD_DIR/$BUNDLE_NAME"

# Copy the built app
echo "📱 Copying application..."
APP_PATH=$(find ../../src-tauri/target/release/bundle/macos -name "*.app" | head -n 1)

if [ ! -d "$APP_PATH" ]; then
    echo "❌ App build not found. Make sure 'npm run tauri build' succeeds."
    exit 1
fi

cp -R "$APP_PATH" ./

# Create data setup
echo "📁 Creating data structure..."
mkdir -p "MeetingRecorder-Data/MeetingRecordings/models"
mkdir -p "MeetingRecorder-Data/exports"

# Download models
echo "📥 Downloading Whisper models..."
MODELS_DIR="MeetingRecorder-Data/MeetingRecordings/models"

models=(
    "ggml-large-v3-turbo.bin:https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin"
    "ggml-base.en.bin:https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
)

for model_info in "${models[@]}"; do
    model_name="${model_info%%:*}"
    model_url="${model_info##*:}"
    
    echo "Downloading $model_name..."
    if curl -L --progress-bar -o "$MODELS_DIR/$model_name" "$model_url"; then
        echo "✅ Downloaded $model_name"
    else
        echo "⚠️  Failed to download $model_name"
    fi
done

# Create configuration
cat > "MeetingRecorder-Data/.env" << 'EOF'
OPENAI_API_KEY=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
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.3
EOF

# Create simple installer script
cat > "Install Meeting Recorder.command" << 'EOF'
#!/bin/bash

echo "🎙️ Installing Meeting Recorder..."
echo "================================"

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_NAME="Meeting Recorder.app"

# Check if app exists
if [ ! -d "$SCRIPT_DIR/$APP_NAME" ]; then
    echo "❌ Meeting Recorder app not found in installer bundle"
    exit 1
fi

echo "📱 Installing application to /Applications..."
cp -R "$SCRIPT_DIR/$APP_NAME" "/Applications/"

echo "📁 Setting up data directory..."
USER_DATA_DIR="$HOME/Documents/MeetingRecorder"
mkdir -p "$USER_DATA_DIR"

# Copy data if user directory doesn't exist or is empty
if [ ! -f "$USER_DATA_DIR/.env" ]; then
    echo "📥 Copying configuration and models..."
    cp -R "$SCRIPT_DIR/MeetingRecorder-Data"/* "$USER_DATA_DIR/"
    echo "✅ Data setup complete"
else
    echo "ℹ️  Data directory already exists, skipping data copy"
fi

echo ""
echo "🎉 Installation Complete!"
echo ""
echo "✅ Meeting Recorder installed in /Applications/"
echo "📁 Data directory: $USER_DATA_DIR"
echo "🚀 You can now launch Meeting Recorder from Applications"
echo ""
echo "Features ready to use:"
echo "  • Audio recording"
echo "  • AI transcription (Whisper models included)"
echo "  • AI meeting minutes (OpenAI configured)"
echo ""

# Ask if user wants to open the app
read -p "Open Meeting Recorder now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    open "/Applications/$APP_NAME"
fi

echo "Press any key to close this installer..."
read -n 1 -s
EOF

chmod +x "Install Meeting Recorder.command"

# Create README
cat > "README.txt" << EOF
🎙️ Meeting Recorder - Simple Installer
======================================

What's Included:
• Meeting Recorder.app - The main application
• Whisper AI models - For offline transcription
• Configuration files - Pre-configured with OpenAI
• Installation script - One-click setup

Installation:
1. Double-click "Install Meeting Recorder.command"
2. Follow the prompts
3. Launch Meeting Recorder from Applications

Features:
✅ Audio recording with visual feedback
✅ Real-time AI transcription 
✅ AI meeting minutes generation
✅ Multi-language support
✅ Export capabilities

Data Location:
All recordings and data are stored in:
~/Documents/MeetingRecorder/

Support:
https://github.com/Fikrifrds/meeting-notes

Enjoy your meetings! 🎉
EOF

# Go back and create archive
cd ../
ARCHIVE_NAME="${BUNDLE_NAME}.zip"
zip -r "$ARCHIVE_NAME" "$BUNDLE_NAME"

ARCHIVE_SIZE=$(du -h "$ARCHIVE_NAME" | cut -f1)

echo ""
echo "✅ Simple Installer created successfully!"
echo "📦 File: $BUILD_DIR/$ARCHIVE_NAME"
echo "💾 Size: $ARCHIVE_SIZE"
echo ""
echo "🚀 Users can now:"
echo "   1. Download $ARCHIVE_NAME"
echo "   2. Extract the zip file"
echo "   3. Double-click 'Install Meeting Recorder.command'"
echo "   4. Follow the installation prompts"
echo ""
echo "📱 The installer includes everything:"
echo "   • Pre-built Meeting Recorder app"
echo "   • Pre-downloaded Whisper models"
echo "   • Pre-configured OpenAI settings"
echo "   • One-click installation script"