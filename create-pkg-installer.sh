#!/bin/bash

# Create Professional macOS PKG Installer for Meeting Recorder
# This creates a .pkg file that users can simply double-click to install

set -e

echo "🍎 Creating Professional macOS PKG Installer"
echo "==========================================="

# Configuration
APP_NAME="Meeting Recorder"
VERSION="1.0.0"
BUNDLE_ID="com.meeting-recorder.app"
PKG_NAME="MeetingRecorder-${VERSION}-Installer.pkg"
BUILD_DIR="./pkg-installer-build"
PAYLOAD_DIR="$BUILD_DIR/payload"
SCRIPTS_DIR="$BUILD_DIR/scripts"

# Clean previous build
rm -rf "$BUILD_DIR"
rm -f "$PKG_NAME"
mkdir -p "$PAYLOAD_DIR"
mkdir -p "$SCRIPTS_DIR"

echo "📦 Building application..."

# Clean any problematic build artifacts first
if [ -d "src-tauri/target/release/bundle" ]; then
    echo "🧹 Cleaning old build artifacts..."
    chmod -R 755 src-tauri/target/release/bundle 2>/dev/null || true
    rm -rf src-tauri/target/release/bundle
fi

# Build the Tauri app
npm install
npm run tauri build

# Find the built app
APP_PATH=$(find src-tauri/target/release/bundle/macos -name "*.app" | head -n 1)

if [ ! -d "$APP_PATH" ]; then
    echo "❌ App build not found at expected location"
    echo "   Looking in: src-tauri/target/release/bundle/macos/"
    ls -la src-tauri/target/release/bundle/ 2>/dev/null || echo "   Bundle directory doesn't exist"
    exit 1
fi

echo "✅ Found app at: $APP_PATH"
APP_SIZE=$(du -sh "$APP_PATH" | cut -f1)
echo "📊 App size: $APP_SIZE"

# Create payload structure for PKG
echo "📁 Creating installer payload..."

# Main application installation  
mkdir -p "$PAYLOAD_DIR/Applications"
# Copy and rename the app to have proper display name
cp -R "$APP_PATH" "$PAYLOAD_DIR/Applications/"
# Rename to proper display name with space
mv "$PAYLOAD_DIR/Applications/meeting-recorder.app" "$PAYLOAD_DIR/Applications/Meeting Recorder.app"

echo "✅ App copied to payload"

# Download Whisper models to temp location for setup
echo "📥 Downloading Whisper models..."
TEMP_MODELS="$PAYLOAD_DIR/tmp/meeting-recorder-setup/models"
mkdir -p "$TEMP_MODELS"

# Download the turbo model (faster, smaller)
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin"
MODEL_FILE="$TEMP_MODELS/ggml-large-v3-turbo.bin"

if curl -L --progress-bar -o "$MODEL_FILE" "$MODEL_URL"; then
    echo "✅ Downloaded Whisper model ($(du -sh "$MODEL_FILE" | cut -f1))"
else
    echo "⚠️  Warning: Failed to download Whisper model"
    echo "   Users will need to download it manually"
    rm -f "$MODEL_FILE"
fi

# Create environment configuration
cat > "$PAYLOAD_DIR/tmp/meeting-recorder-setup/.env" << 'EOF'
OPENAI_API_KEY=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
OPENAI_MODEL=gpt-4o-mini
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.3
EOF

# Create comprehensive postinstall script
echo "📝 Creating installation scripts..."

cat > "$SCRIPTS_DIR/postinstall" << 'EOF'
#!/bin/bash

# Meeting Recorder Post-Installation Script
echo "🎙️ Setting up Meeting Recorder..."

# Debug: Check if app was actually installed
if [ -d "/Applications/Meeting Recorder.app" ]; then
    echo "✅ Meeting Recorder.app found in Applications"
else
    echo "❌ Meeting Recorder.app NOT found in Applications"
    echo "   Listing Applications directory:"
    ls -la /Applications/ | grep -i meeting || echo "   No meeting-related apps found"
fi

# Get the current user (not root, since installer runs as root)
CURRENT_USER="${USER:-$(logname 2>/dev/null || echo $(whoami))}"
if [ "$CURRENT_USER" = "root" ]; then
    # Try to get the real user who invoked the installer
    CURRENT_USER=$(stat -f "%Su" /dev/console)
fi

USER_HOME=$(eval echo "~$CURRENT_USER")
USER_DATA_DIR="$USER_HOME/Documents/MeetingRecorder"

echo "👤 Setting up for user: $CURRENT_USER"
echo "📁 Data directory: $USER_DATA_DIR"

# Create user data directory structure
sudo -u "$CURRENT_USER" mkdir -p "$USER_DATA_DIR/MeetingRecordings/models"
sudo -u "$CURRENT_USER" mkdir -p "$USER_DATA_DIR/exports"
sudo -u "$CURRENT_USER" mkdir -p "$USER_DATA_DIR/backups"

# Setup directory from installer
TEMP_SETUP="/tmp/meeting-recorder-setup"

# Copy Whisper models
if [ -d "$TEMP_SETUP/models" ]; then
    echo "📥 Installing Whisper AI models..."
    sudo -u "$CURRENT_USER" cp "$TEMP_SETUP/models"/* "$USER_DATA_DIR/MeetingRecordings/models/" 2>/dev/null || true
    MODEL_COUNT=$(ls "$USER_DATA_DIR/MeetingRecordings/models/" 2>/dev/null | wc -l | tr -d ' ')
    if [ "$MODEL_COUNT" -gt 0 ]; then
        echo "✅ Installed $MODEL_COUNT Whisper model(s)"
    else
        echo "⚠️  No models were copied - users will need to download manually"
    fi
fi

# Copy configuration
if [ -f "$TEMP_SETUP/.env" ] && [ ! -f "$USER_DATA_DIR/.env" ]; then
    echo "⚙️ Installing configuration..."
    sudo -u "$CURRENT_USER" cp "$TEMP_SETUP/.env" "$USER_DATA_DIR/.env"
    echo "✅ Configuration installed"
fi

# Set proper ownership and permissions
chown -R "$CURRENT_USER:staff" "$USER_DATA_DIR" 2>/dev/null || true
chmod -R 755 "$USER_DATA_DIR" 2>/dev/null || true

# Clean up temporary files
rm -rf "$TEMP_SETUP" 2>/dev/null || true

# Create a launch script for easy access
LAUNCH_SCRIPT="$USER_HOME/Desktop/Launch Meeting Recorder.command"
cat > "$LAUNCH_SCRIPT" << 'LAUNCH_EOF'
#!/bin/bash

# Check if Meeting Recorder exists and launch it
if [ -d "/Applications/Meeting Recorder.app" ]; then
    echo "Launching Meeting Recorder..."
    open "/Applications/Meeting Recorder.app"
else
    echo "❌ Meeting Recorder not found in Applications folder"
    echo "Expected location: /Applications/Meeting Recorder.app"
    echo ""
    echo "Available apps in Applications:"
    ls -la /Applications/ | grep -i meeting || echo "No meeting-related apps found"
    echo ""
    echo "Press any key to close..."
    read -n 1
fi
LAUNCH_EOF

chown "$CURRENT_USER:staff" "$LAUNCH_SCRIPT" 2>/dev/null || true
chmod +x "$LAUNCH_SCRIPT" 2>/dev/null || true

echo ""
echo "🎉 Meeting Recorder installation completed successfully!"
echo ""
echo "📱 Application: /Applications/Meeting Recorder.app"
echo "📁 Data folder: $USER_DATA_DIR"
echo "🚀 Desktop shortcut: Launch Meeting Recorder.command"
echo ""
echo "Next steps:"
echo "1. Launch Meeting Recorder from Applications or desktop shortcut"
echo "2. Grant microphone permissions when prompted"
echo "3. Start recording your first meeting!"

exit 0
EOF

chmod +x "$SCRIPTS_DIR/postinstall"

# Create modern installer UI files
echo "🎨 Creating installer interface..."

# Welcome screen
cat > "$BUILD_DIR/welcome.html" << EOF
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Welcome</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 20px; }
        h1 { color: #1d4ed8; }
        .feature { margin: 8px 0; }
        .feature .icon { color: #10b981; font-weight: bold; }
        .size { color: #6b7280; font-size: 14px; }
        .requirements { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0; }
    </style>
</head>
<body>
    <h1>🎙️ Welcome to Meeting Recorder</h1>
    <p>This installer will set up Meeting Recorder with all necessary components for AI-powered meeting transcription.</p>
    
    <h2>✨ What's Included:</h2>
    <div class="feature"><span class="icon">✅</span> Meeting Recorder application</div>
    <div class="feature"><span class="icon">✅</span> Whisper AI models for offline transcription</div>
    <div class="feature"><span class="icon">✅</span> OpenAI integration for meeting minutes</div>
    <div class="feature"><span class="icon">✅</span> Data directories and configuration</div>
    <div class="feature"><span class="icon">✅</span> Desktop shortcut for easy access</div>
    
    <div class="requirements">
        <h3>📋 Installation Details:</h3>
        <p class="size"><strong>Size:</strong> ~2 GB (including AI models)</p>
        <p class="size"><strong>Location:</strong> /Applications/Meeting Recorder.app</p>
        <p class="size"><strong>Data:</strong> ~/Documents/MeetingRecorder/</p>
        <p class="size"><strong>Requirements:</strong> macOS 10.13+ with microphone access</p>
    </div>
    
    <p><strong>Ready to install?</strong> Click Continue to begin.</p>
</body>
</html>
EOF

# Conclusion screen
cat > "$BUILD_DIR/conclusion.html" << EOF
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Installation Complete</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; margin: 20px; }
        h1 { color: #10b981; }
        .next-steps { background: #eff6ff; padding: 15px; border-radius: 8px; margin: 15px 0; }
        .step { margin: 8px 0; }
        .support { background: #f9fafb; padding: 15px; border-radius: 8px; margin: 15px 0; }
        a { color: #1d4ed8; text-decoration: none; }
    </style>
</head>
<body>
    <h1>🎉 Installation Complete!</h1>
    <p>Meeting Recorder has been successfully installed and is ready to use.</p>
    
    <div class="next-steps">
        <h2>🚀 Getting Started:</h2>
        <div class="step">1. Find <strong>Meeting Recorder</strong> in your Applications folder</div>
        <div class="step">2. Or double-click <strong>"Launch Meeting Recorder"</strong> on your desktop</div>
        <div class="step">3. Grant microphone permissions when prompted</div>
        <div class="step">4. Start recording your first meeting!</div>
    </div>
    
    <h2>🎯 Features Ready to Use:</h2>
    <ul>
        <li><strong>Audio Recording:</strong> High-quality meeting recording</li>
        <li><strong>AI Transcription:</strong> Automatic speech-to-text conversion</li>
        <li><strong>Meeting Minutes:</strong> AI-generated summaries and action items</li>
        <li><strong>Multi-language:</strong> Support for 50+ languages</li>
        <li><strong>Privacy:</strong> All transcription happens locally on your Mac</li>
    </ul>
    
    <div class="support">
        <h3>📞 Support & Help:</h3>
        <p>Need help? Visit our <a href="https://github.com/Fikrifrds/meeting-notes">GitHub repository</a> for documentation, troubleshooting, and support.</p>
        <p>Data location: <code>~/Documents/MeetingRecorder/</code></p>
    </div>
    
    <p><strong>Enjoy your meetings! 🎙️</strong></p>
</body>
</html>
EOF

# Create license
cat > "$BUILD_DIR/license.txt" << EOF
MIT License

Copyright (c) 2024 Meeting Recorder

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
EOF

# Create distribution.xml for the installer
cat > "$BUILD_DIR/distribution.xml" << EOF
<?xml version="1.0" encoding="utf-8"?>
<installer-gui-script minSpecVersion="2">
    <title>$APP_NAME $VERSION</title>
    <organization>com.meeting-recorder</organization>
    <domains enable_localSystem="true"/>
    <options customize="never" require-scripts="true" rootVolumeOnly="true" />
    
    <welcome file="welcome.html"/>
    <license file="license.txt"/>
    <conclusion file="conclusion.html"/>
    
    <pkg-ref id="$BUNDLE_ID"/>
    
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

# Build component package
echo "🔨 Building component package..."
pkgbuild --root "$PAYLOAD_DIR" \
         --scripts "$SCRIPTS_DIR" \
         --identifier "$BUNDLE_ID" \
         --version "$VERSION" \
         --install-location "/" \
         "$BUILD_DIR/meeting-recorder-component.pkg"

# Build final product
echo "🔨 Building final installer..."
productbuild --distribution "$BUILD_DIR/distribution.xml" \
             --package-path "$BUILD_DIR" \
             --resources "$BUILD_DIR" \
             "$PKG_NAME"

# Get final size
INSTALLER_SIZE=$(du -sh "$PKG_NAME" | cut -f1)

echo ""
echo "🎉 Professional PKG Installer Created!"
echo "======================================"
echo "📦 File: $PKG_NAME"
echo "💾 Size: $INSTALLER_SIZE"
echo ""
echo "✨ User Experience:"
echo "   1. Users download $PKG_NAME"
echo "   2. Double-click to launch installer"
echo "   3. Follow the installation wizard"
echo "   4. App appears in Applications folder"
echo "   5. Desktop shortcut created automatically"
echo "   6. All AI models and config pre-installed"
echo ""
echo "🚀 Ready for distribution!"
echo "   Users get a complete, professional installation experience"
echo "   No technical knowledge required"
echo "   Everything works out of the box"