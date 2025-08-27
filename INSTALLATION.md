# 🚀 Meeting Recorder - Installation Guide

## One-Command Installation (Recommended)

The easiest way to install Meeting Recorder with all dependencies and models:

```bash
curl -sSL https://raw.githubusercontent.com/Fikrifrds/meeting-notes/main/install.sh | bash
```

**This automatically:**
- ✅ Downloads and installs the app for your platform
- ✅ Sets up Whisper AI models (3+ GB) for offline transcription  
- ✅ Creates data directories and configuration files
- ✅ Installs desktop shortcuts and launchers
- ✅ Optionally installs Ollama for local AI processing

## What You Get

### Ready-to-Use Features
- 🎙️ **Audio Recording**: High-quality recording with visual feedback
- 🤖 **AI Transcription**: Offline transcription using bundled Whisper models
- 📝 **Meeting Minutes**: AI-generated summaries and action items
- ☁️ **Cloud AI**: Fast results with OpenAI (integrated)
- 🌍 **Multi-language**: Support for 50+ languages including Indonesian

### Pre-bundled Models
- **Large-v3** (3.1GB) - Best accuracy, multilingual support
- **Base.en** (142MB) - Fast, English-only
- **Small** (466MB) - Good balance, multilingual

## Manual Installation Options

### Option 1: Download Releases

1. Go to [Releases](https://github.com/Fikrifrds/meeting-notes/releases)
2. Download the package for your platform:
   - **macOS**: `meeting-recorder-x.x.x.dmg`
   - **Linux**: `meeting-recorder-portable-linux.tar.gz`
   - **Windows**: `meeting-recorder-x.x.x.msi`
3. Follow platform-specific instructions below

### Option 2: Build from Source

```bash
# Prerequisites: Node.js 18+, Rust, Git
git clone https://github.com/Fikrifrds/meeting-notes.git
cd meeting-notes
npm install
./download-whisper-model.sh  # Download AI models
npm run tauri dev            # Development
npm run tauri build          # Production build
```

## Platform-Specific Instructions

### macOS Installation

**Method 1 - DMG (Recommended):**
1. Download `meeting-recorder-x.x.x.dmg`
2. Open DMG and drag app to Applications
3. Models are automatically bundled with the app

**Method 2 - One-command:**
```bash
curl -sSL https://raw.githubusercontent.com/Fikrifrds/meeting-notes/main/install.sh | bash
```

**First Launch:**
- macOS may show security warning for unsigned app
- Go to System Preferences > Security & Privacy > Allow anyway
- Or run: `xattr -dr com.apple.quarantine /Applications/Meeting\ Recorder.app`

### Linux Installation

**Method 1 - Portable Package (Recommended):**
```bash
# Download and extract
wget https://github.com/Fikrifrds/meeting-notes/releases/latest/download/meeting-recorder-portable-linux.tar.gz
tar -xzf meeting-recorder-portable-linux.tar.gz
cd meeting-recorder-portable

# Install system-wide
./install.sh

# Or run portable
./meeting-recorder
```

**Method 2 - AppImage:**
```bash
# Download AppImage
wget https://github.com/Fikrifrds/meeting-notes/releases/latest/download/meeting-recorder.AppImage
chmod +x meeting-recorder.AppImage

# Run directly
./meeting-recorder.AppImage

# Or install system-wide
mv meeting-recorder.AppImage ~/.local/bin/meeting-recorder
```

**Method 3 - One-command:**
```bash
curl -sSL https://raw.githubusercontent.com/Fikrifrds/meeting-notes/main/install.sh | bash
```

### Windows Installation

**Method 1 - MSI Installer:**
1. Download `meeting-recorder-x.x.x.msi`
2. Run installer as Administrator
3. Models will be set up automatically

**Method 2 - One-command (PowerShell):**
```powershell
iwr -useb https://raw.githubusercontent.com/Fikrifrds/meeting-notes/main/install.sh | iex
```

## Post-Installation Setup

### Data Locations
- **Configuration**: `~/Documents/MeetingRecorder/.env`
- **Recordings**: `~/Documents/MeetingRecorder/MeetingRecordings/`
- **AI Models**: `~/Documents/MeetingRecorder/MeetingRecordings/models/`
- **Exports**: `~/Documents/MeetingRecorder/exports/`

### AI Configuration

**OpenAI Integration:**
- Pre-configured with OpenAI API for AI features
- Ready to use for meeting minutes generation
- No additional setup required

### First Launch Checklist

1. **Launch** Meeting Recorder
2. **Grant** microphone permissions when prompted
3. **Test** audio recording (should work immediately)
4. **Initialize** Whisper (models auto-setup if bundled)
5. **Configure** AI provider in Settings

## Troubleshooting

### Models Not Found
If transcription doesn't work:
```bash
# Check if models exist
ls ~/Documents/MeetingRecorder/MeetingRecordings/models/

# Download manually if needed
cd meeting-notes  # source directory
./download-whisper-model.sh

# Or download specific model
curl -L -o ~/Documents/MeetingRecorder/MeetingRecordings/models/ggml-large-v3.bin \
  https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin
```

### Permissions Issues

**macOS:**
```bash
# Fix quarantine
xattr -dr com.apple.quarantine /Applications/Meeting\ Recorder.app

# Reset microphone permissions
tccutil reset Microphone com.meeting-recorder.app
```

**Linux:**
```bash
# Ensure user is in audio group
sudo usermod -a -G audio $USER

# Fix permissions
chmod 755 ~/.local/share/meeting-recorder/
```

### Can't Launch Application

**Check installation:**
```bash
# macOS
ls -la /Applications/Meeting\ Recorder.app

# Linux
which meeting-recorder
ls -la ~/.local/bin/meeting-recorder

# Windows
where meeting-recorder
```

**Reinstall if needed:**
```bash
# Clean reinstall
curl -sSL https://raw.githubusercontent.com/Fikrifrds/meeting-notes/main/install.sh | bash
```

## Updates

### Automatic Updates
```bash
# Run the update script (created during installation)
~/.local/share/meeting-recorder/update.sh

# Or reinstall (preserves data)
curl -sSL https://raw.githubusercontent.com/Fikrifrds/meeting-notes/main/install.sh | bash
```

### Manual Updates
1. Download latest release
2. Replace application files
3. Data and models are preserved automatically

## Uninstall

### Complete Removal
```bash
# Remove application
rm -rf ~/.local/share/meeting-recorder  # Linux
rm -rf /Applications/Meeting\ Recorder.app  # macOS

# Remove desktop entries (Linux)
rm -f ~/.local/share/applications/meeting-recorder.desktop
rm -f ~/.local/bin/meeting-recorder

# Keep or remove data
# rm -rf ~/Documents/MeetingRecorder  # Uncomment to delete all data
```

### Keep Data, Remove App Only
```bash
# Remove only application files, keep recordings and transcripts
rm -rf ~/.local/share/meeting-recorder  # Linux
rm -rf /Applications/Meeting\ Recorder.app  # macOS
# Data remains in ~/Documents/MeetingRecorder/
```

## Support

- 📖 [Documentation](https://github.com/Fikrifrds/meeting-notes)
- 🐛 [Report Issues](https://github.com/Fikrifrds/meeting-notes/issues)
- 💬 [Discussions](https://github.com/Fikrifrds/meeting-notes/discussions)
- ✉️ Email: [Create an issue](https://github.com/Fikrifrds/meeting-notes/issues/new)

## System Requirements

### Minimum Requirements
- **OS**: macOS 10.13+, Linux (Ubuntu 20.04+), Windows 10+
- **RAM**: 4GB (8GB recommended for large models)
- **Storage**: 500MB + 3-5GB for AI models
- **Microphone**: Any system-recognized audio input device

### Recommended Setup
- **RAM**: 8GB+ for best AI performance
- **Storage**: SSD for faster model loading
- **Network**: Internet for initial setup and cloud AI (optional)
- **Audio**: Dedicated microphone for better recording quality

---

**🎉 Ready to record your meetings with AI-powered transcription!**

Installation takes 2-5 minutes and you'll have a fully functional meeting recorder with offline AI capabilities.