#!/bin/bash

# Create macOS PKG Installer for Meeting Recorder
# This creates a .pkg file that users can simply double-click to install

set -e

echo "🍎 Creating macOS PKG Installer"
echo "==============================="

# Configuration
APP_NAME="Meeting Recorder"
VERSION="1.0.0"
BUNDLE_ID="com.meeting-recorder.app"
PKG_NAME="MeetingRecorder-${VERSION}.pkg"
BUILD_DIR="./installer-build"
PAYLOAD_DIR="$BUILD_DIR/payload"
SCRIPTS_DIR="$BUILD_DIR/scripts"

# Clean previous build
rm -rf "$BUILD_DIR"
mkdir -p "$PAYLOAD_DIR"
mkdir -p "$SCRIPTS_DIR"

echo "📦 Building application..."

# Build the Tauri app
npm install
npm run tauri build

# Find the built app
APP_PATH=$(find src-tauri/target/release/bundle/macos -name "*.app" | head -n 1)

if [ ! -d "$APP_PATH" ]; then
    echo "❌ App build not found. Make sure 'npm run tauri build' succeeds."
    exit 1
fi

echo "✅ Found app at: $APP_PATH"

# Create payload structure
echo "📁 Creating installer payload..."

# Applications directory structure
mkdir -p "$PAYLOAD_DIR/Applications"
cp -R "$APP_PATH" "$PAYLOAD_DIR/Applications/"

# User Documents structure
mkdir -p "$PAYLOAD_DIR/tmp/meeting-recorder-setup"

# Download and bundle models
echo "📥 Downloading Whisper models..."
MODELS_TEMP="$PAYLOAD_DIR/tmp/meeting-recorder-setup/models"
mkdir -p "$MODELS_TEMP"

# Download essential models
models=(
    "ggml-large-v3-turbo.bin:https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin"
    "ggml-base.en.bin:https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
)

for model_info in "${models[@]}"; do
    model_name="${model_info%%:*}"
    model_url="${model_info##*:}"
    
    echo "Downloading $model_name..."
    if curl -L --progress-bar -o "$MODELS_TEMP/$model_name" "$model_url"; then
        echo "✅ Downloaded $model_name"
    else
        echo "⚠️  Failed to download $model_name"
        rm -f "$MODELS_TEMP/$model_name"
    fi
done

# Create configuration template
cat > "$PAYLOAD_DIR/tmp/meeting-recorder-setup/.env" << 'EOF'
OPENAI_API_KEY=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
OPENAI_MODEL=gpt-4.1
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.3
EOF

# Create post-install script
echo "📝 Creating installation scripts..."

cat > "$SCRIPTS_DIR/postinstall" << 'EOF'
#!/bin/bash

# Post-installation script for Meeting Recorder
echo "🎙️ Setting up Meeting Recorder..."

# Create user data directory
USER_DATA_DIR="$HOME/Documents/MeetingRecorder"
mkdir -p "$USER_DATA_DIR/MeetingRecordings/models"
mkdir -p "$USER_DATA_DIR/exports"
mkdir -p "$USER_DATA_DIR/backups"

# Copy models from temp location
TEMP_SETUP="/tmp/meeting-recorder-setup"
if [ -d "$TEMP_SETUP/models" ]; then
    echo "📥 Installing Whisper models..."
    cp "$TEMP_SETUP/models"/* "$USER_DATA_DIR/MeetingRecordings/models/" 2>/dev/null || true
    echo "✅ Models installed"
fi

# Copy configuration
if [ -f "$TEMP_SETUP/.env" ] && [ ! -f "$USER_DATA_DIR/.env" ]; then
    cp "$TEMP_SETUP/.env" "$USER_DATA_DIR/.env"
    echo "✅ Configuration installed"
fi

# Clean up temp files
rm -rf "$TEMP_SETUP"

# Set permissions
chmod -R 755 "$USER_DATA_DIR" 2>/dev/null || true

# Show success message
echo "✅ Meeting Recorder installed successfully!"
echo "📱 You can find it in your Applications folder"
echo "📁 Data will be stored in: $USER_DATA_DIR"

# Optional: Open the app
# open "/Applications/Meeting Recorder.app"

exit 0
EOF

chmod +x "$SCRIPTS_DIR/postinstall"

# Create distribution file
cat > "$BUILD_DIR/distribution.xml" << EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>$APP_NAME $VERSION</title>
    <organization>com.meeting-recorder</organization>
    <domains enable_localSystem="true"/>
    <options customize="never" require-scripts="false" rootVolumeOnly="true" />
    
    <welcome file="welcome.html"/>
    <license file="license.txt"/>
    <conclusion file="conclusion.html"/>
    
    <pkg-ref id="$BUNDLE_ID"/>
    <options customize="never" require-scripts="true"/>
    
    <choices-outline>
        <line choice="default">
            <line choice="$BUNDLE_ID"/>
        </line>
    </choices-outline>
    
    <choice id="default"/>
    <choice id="$BUNDLE_ID" visible="false">
        <pkg-ref id="$BUNDLE_ID"/>
    </choice>
    
    <pkg-ref id="$BUNDLE_ID" version="$VERSION" onConclusion="none">meeting-recorder-component.pkg</pkg-ref>
</installer-gui-script>
EOF

# Create welcome message
cat > "$BUILD_DIR/welcome.html" << EOF
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Welcome</title>
</head>
<body>
    <h1>🎙️ Welcome to Meeting Recorder</h1>
    <p>This installer will set up Meeting Recorder with all necessary components:</p>
    <ul>
        <li>✅ Meeting Recorder application</li>
        <li>✅ Whisper AI models for transcription</li>
        <li>✅ Configuration files with OpenAI integration</li>
        <li>✅ Data directories and shortcuts</li>
    </ul>
    <p><strong>Installation size:</strong> ~4 GB</p>
    <p><strong>Installation time:</strong> 2-3 minutes</p>
    <br/>
    <p>Click Continue to begin installation.</p>
</body>
</html>
EOF

# Create conclusion message
cat > "$BUILD_DIR/conclusion.html" << EOF
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Installation Complete</title>
</head>
<body>
    <h1>🎉 Installation Complete!</h1>
    <p>Meeting Recorder has been successfully installed.</p>
    
    <h2>🚀 What's Ready:</h2>
    <ul>
        <li>✅ Application installed in /Applications/Meeting Recorder.app</li>
        <li>✅ Whisper AI models ready for offline transcription</li>
        <li>✅ OpenAI integration configured for meeting minutes</li>
        <li>✅ Data directories created in ~/Documents/MeetingRecorder/</li>
    </ul>
    
    <h2>🎯 Getting Started:</h2>
    <ol>
        <li>Open Meeting Recorder from your Applications folder</li>
        <li>Grant microphone permissions when prompted</li>
        <li>Start recording your first meeting!</li>
    </ol>
    
    <p><strong>Support:</strong> <a href="https://github.com/Fikrifrds/meeting-notes">GitHub Repository</a></p>
</body>
</html>
EOF

# Create license file
cat > "$BUILD_DIR/license.txt" << EOF
MIT License

Copyright (c) 2024 Meeting Recorder

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
EOF

# Build component package
echo "🔨 Building component package..."
pkgbuild --root "$PAYLOAD_DIR" \
         --scripts "$SCRIPTS_DIR" \
         --identifier "$BUNDLE_ID" \
         --version "$VERSION" \
         --install-location "/" \
         "$BUILD_DIR/meeting-recorder-component.pkg"

# Build final installer
echo "🔨 Building final installer..."
productbuild --distribution "$BUILD_DIR/distribution.xml" \
             --package-path "$BUILD_DIR" \
             --resources "$BUILD_DIR" \
             "$PKG_NAME"

# Calculate size
INSTALLER_SIZE=$(du -h "$PKG_NAME" | cut -f1)

echo ""
echo "✅ PKG Installer created successfully!"
echo "📦 File: $PKG_NAME"
echo "💾 Size: $INSTALLER_SIZE"
echo ""
echo "🚀 Users can now simply:"
echo "   1. Download $PKG_NAME"
echo "   2. Double-click to install"
echo "   3. Follow the installation wizard"
echo "   4. Launch Meeting Recorder from Applications"
echo ""
echo "📱 The installer includes:"
echo "   • Meeting Recorder application"
echo "   • Whisper AI models (pre-downloaded)"
echo "   • OpenAI configuration"
echo "   • All necessary setup"