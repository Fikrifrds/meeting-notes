# Meeting Recorder

A modern desktop application for recording meetings with real-time transcription, built with Tauri, React, and Rust.

## Features

- 🎙️ **Audio Recording**: High-quality audio recording with visual feedback
- 📝 **Real-time Transcription**: AI-powered transcription using Whisper
- 🤖 **AI Meeting Minutes**: Generate meeting minutes with OpenAI or Ollama
- 🏠 **Local AI Support**: Use Ollama for completely private, offline AI processing
- ☁️ **Cloud AI Option**: OpenAI integration for fast, reliable results
- ⏱️ **Timer Display**: Live recording timer with formatted time display
- 🎨 **Modern UI**: Clean, responsive interface with audio visualization
- 💾 **File Management**: Automatic saving of audio files and transcripts
- 🔒 **Privacy-First**: All processing happens locally on your device
- 🎯 **Multi-device Support**: Detects and lists available audio input devices
- ⚡ **Metal Acceleration**: Optimized for macOS with Metal backend support

## Prerequisites

Before starting development, ensure you have the following installed:

### Required Software
- **Node.js** (v18 or later) - [Download here](https://nodejs.org/)
- **Rust** (latest stable version) - [Install via rustup](https://rustup.rs/)
- **Git** - For version control

### Platform-Specific Requirements

#### macOS
- **Xcode Command Line Tools**: `xcode-select --install`
- **For system audio recording** (optional): [BlackHole](https://github.com/ExistentialAudio/BlackHole) or [Soundflower](https://github.com/mattingalls/Soundflower)

#### Windows
- **Microsoft Visual Studio C++ Build Tools** or **Visual Studio Community**
- **WebView2** (usually pre-installed on Windows 10/11)

#### Linux
- **Build essentials**: `sudo apt-get install build-essential`
- **WebKit2GTK**: `sudo apt-get install webkit2gtk-4.0-dev`
- **Additional dependencies**: `sudo apt-get install libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`

## Quick Start

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd meeting-notes

# Install Node.js dependencies
npm install

# Verify Rust installation
rustc --version
cargo --version
```

### 2. Download Whisper Model

The application requires a Whisper AI model for transcription. The script now supports multiple model options for different accuracy and speed requirements:

```bash
# Make the script executable (macOS/Linux)
chmod +x download-whisper-model.sh

# Download the model (interactive menu will appear)
./download-whisper-model.sh
```

**Model Options:**
- **large-v3-turbo** (RECOMMENDED): Best accuracy + speed balance (1.5GB)
- **small.en**: Good upgrade from base, faster processing (466MB)
- **medium.en**: High accuracy for important meetings (1.5GB)
- **base.en**: Fallback option, fastest but lower accuracy (142MB)

**Quick Download (command line):**
```bash
# Download specific model directly
./download-whisper-model.sh large-v3-turbo  # Recommended
./download-whisper-model.sh small.en        # Good balance
./download-whisper-model.sh all             # Download all models
```

**Manual Download (if script fails):**
1. Create directory: `mkdir -p ~/Documents/MeetingRecordings/models`
2. Download any model from [Hugging Face Whisper models](https://huggingface.co/ggerganov/whisper.cpp/tree/main)
3. Save to: `~/Documents/MeetingRecordings/models/ggml-[model-name].bin`

### 3. Start Development

```bash
# Start the development server
npm run tauri dev
```

This command will:
- Start Vite development server (React frontend) on `http://localhost:1420`
- Compile and run the Rust backend
- Open the application window automatically
- Enable hot-reload for both frontend and backend changes

## AI Provider Configuration

The application supports two AI providers for generating meeting minutes from transcripts:

### 🏠 Ollama (Local AI) - Recommended for Privacy

**Advantages:**
- ✅ Complete privacy - no data leaves your device
- ✅ No internet required for AI processing
- ✅ No API costs or rate limits
- ✅ Works offline

**Setup:**

1. **Install Ollama**: Download from [ollama.ai](https://ollama.ai/)

2. **Download a model** (choose one):
   ```bash
   # Recommended: Fast and efficient
   ollama pull llama3.2:3b
   
   # Alternative: More capable but slower
   ollama pull llama3.1:8b
   ```

3. **Configure environment** (copy from `.env.example`):
   ```bash
   # Copy example configuration
   cp .env.example .env
   
   # Edit .env file with your preferred model
   OLLAMA_HOST=http://localhost:11434
   OLLAMA_MODEL=llama3.2:3b
   ```

4. **Select in app**: Choose "Ollama (Local)" in the settings panel

### ☁️ OpenAI (Cloud AI) - Fast and Reliable

**Advantages:**
- ✅ Very fast processing
- ✅ High-quality results
- ✅ No local setup required

**Setup:**

1. **Get API key**: Sign up at [platform.openai.com](https://platform.openai.com/api-keys)

2. **Configure environment**:
   ```bash
   # Edit .env file
   OPENAI_API_KEY=sk-your-api-key-here
   OPENAI_MODEL=gpt-4o-mini
   OPENAI_MAX_TOKENS=2000
   OPENAI_TEMPERATURE=0.3
   ```

3. **Select in app**: Choose "OpenAI (Cloud)" in the settings panel

**Privacy Notice**: Transcript text will be sent to OpenAI for processing.

### Switching Between Providers

You can easily switch between AI providers in the application:

1. Open **Settings** (⚙️ icon)
2. Find **"🤖 AI Provider for Meeting Minutes"** section
3. Select your preferred option:
   - **Ollama (Local)** - Private, offline processing
   - **OpenAI (Cloud)** - Fast, cloud-based processing

The application will remember your choice and use the selected provider for all future meeting minutes generation.

## Development Workflow

### Available Scripts

```bash
# Development
npm run dev          # Start Vite dev server only
npm run tauri dev    # Start full Tauri development environment

# Building
npm run build        # Build frontend for production
npm run tauri build  # Create production desktop application

# Maintenance
npm run preview      # Preview production build
```

### Development Server Details

- **Frontend URL**: `http://localhost:1420/`
- **Hot Module Replacement**: Enabled for React components
- **Rust Hot Reload**: Automatic recompilation on Rust file changes
- **Port Configuration**: Fixed port 1420 (required by Tauri)

### Recommended VS Code Extensions

The project includes VS Code extension recommendations in `.vscode/extensions.json`:

- **Tauri**: `tauri-apps.tauri-vscode` - Tauri development support
- **Rust Analyzer**: `rust-lang.rust-analyzer` - Rust language support

Install these for the best development experience.

## Project Structure

```
meeting-notes/
├── src/                          # React Frontend
│   ├── App.tsx                   # Main application component
│   ├── App.css                   # Application styles
│   ├── main.tsx                  # React entry point
│   ├── vite-env.d.ts            # Vite type definitions
│   └── assets/                   # Static assets
├── src-tauri/                    # Rust Backend
│   ├── src/
│   │   ├── main.rs              # Application entry point
│   │   └── lib.rs               # Core application logic
│   ├── Cargo.toml               # Rust dependencies
│   ├── Cargo.lock               # Dependency lock file
│   ├── build.rs                 # Build script
│   ├── tauri.conf.json          # Tauri configuration
│   ├── capabilities/            # Permission definitions
│   │   └── default.json         # Default capabilities
│   └── icons/                   # Application icons
├── public/                       # Static public assets
│   ├── tauri.svg
│   └── vite.svg
├── .vscode/                      # VS Code configuration
│   └── extensions.json          # Recommended extensions
├── package.json                  # Node.js dependencies
├── package-lock.json            # Dependency lock file
├── tsconfig.json                # TypeScript configuration
├── tsconfig.node.json           # Node-specific TypeScript config
├── vite.config.ts               # Vite configuration
├── download-whisper-model.sh    # Whisper model download script
└── README.md                    # This file
```

## Configuration Files

### Tauri Configuration (`src-tauri/tauri.conf.json`)

Key configurations:
- **App identifier**: `com.meeting-recorder.app`
- **Development URL**: `http://localhost:1420`
- **Plugin configuration**: Opener plugin enabled
- **Window settings**: 800x600 default size

### Vite Configuration (`vite.config.ts`)

Optimized for Tauri development:
- **Fixed port**: 1420 (required by Tauri)
- **HMR configuration**: Hot module replacement
- **File watching**: Excludes `src-tauri` directory

### TypeScript Configuration

- **Target**: ES2020 with modern features
- **Strict mode**: Enabled for type safety
- **JSX**: React JSX transform
- **Module resolution**: Bundler mode for Vite

## Usage Guide

### First-Time Setup

1. **Launch the application**: `npm run tauri dev`
2. **Initialize Whisper**: Click "Initialize Whisper" button
3. **Grant permissions**: Allow microphone access when prompted

### Recording Workflow

1. **Start Recording**: Click the record button
2. **Monitor**: Watch the timer and audio visualization
3. **Stop Recording**: Click stop when finished
4. **Transcribe**: Click "Transcribe Audio" for AI transcription
5. **Generate Minutes**: Click "Generate Meeting Minutes" for AI-powered summaries
6. **Save**: Use "Save Files" to export transcripts and meeting minutes

### Real-time Transcription

1. **Enable**: Toggle "Real-time Transcription" after initializing Whisper
2. **Record**: Start recording as usual
3. **View**: Real-time transcript appears during recording

## Technical Architecture

### Backend (Rust)

**Core Components:**
- **AudioState**: Thread-safe state management for recording sessions
- **Whisper Integration**: Local AI transcription using whisper-rs with Metal acceleration
- **Audio Processing**: Real-time audio capture, mixing, and resampling
- **File Management**: Automatic WAV file creation and transcript saving
- **Tauri Commands**: Exposed async functions for frontend communication

**Key Dependencies:**
- `tauri`: Desktop application framework
- `whisper-rs`: Rust bindings for OpenAI Whisper
- `ollama-rs`: Rust client for Ollama local AI
- `reqwest`: HTTP client for OpenAI API
- `cpal`: Cross-platform audio library
- `hound`: WAV file reading/writing
- `tokio`: Async runtime
- `chrono`: Date/time handling
- `serde`: Serialization/deserialization

### Frontend (React + TypeScript)

**Features:**
- **State Management**: React hooks for UI state
- **Real-time Updates**: Live timer and status updates
- **Event Handling**: Tauri event listeners for real-time transcription
- **Error Handling**: User-friendly error messages with auto-clear
- **Responsive Design**: Modern CSS with animations

**Key Dependencies:**
- `react`: Frontend framework
- `@tauri-apps/api`: Tauri frontend bindings
- `typescript`: Type safety
- `vite`: Build tool and dev server

## Troubleshooting

### Common Issues

#### Whisper Model Problems
```bash
# Check if any models exist
ls -la ~/Documents/MeetingRecordings/models/

# Re-download or upgrade model
./download-whisper-model.sh

# Download specific model for better accuracy
./download-whisper-model.sh large-v3-turbo

# Manual verification (check any model file)
file ~/Documents/MeetingRecordings/models/ggml-*.bin
```

#### Audio Recording Issues
- **Microphone permissions**: Check system privacy settings
- **Device detection**: Restart application if devices not listed
- **System audio**: Install BlackHole (macOS) or VB-Cable (Windows)

#### Build Issues
```bash
# Update Rust toolchain
rustup update

# Clear Rust cache
cargo clean

# Clear Node.js cache
rm -rf node_modules package-lock.json
npm install

# Full clean rebuild
npm run tauri clean
npm run tauri dev
```

#### Development Server Issues
```bash
# Check port availability
lsof -i :1420

# Kill existing processes
pkill -f "tauri dev"

# Restart development server
npm run tauri dev
```

### Platform-Specific Issues

#### macOS
- **Metal acceleration**: Requires macOS 10.13+ with Metal support
- **Microphone permissions**: Grant in System Preferences > Security & Privacy
- **Gatekeeper**: May need to allow unsigned applications during development

#### Windows
- **WebView2**: Update Windows or install WebView2 manually
- **Antivirus**: May flag Rust binaries, add project to exclusions
- **Path issues**: Ensure Rust and Node.js are in system PATH

#### Linux
- **Audio system**: May need to configure PulseAudio or ALSA
- **Permissions**: Ensure user is in audio group
- **Dependencies**: Install all required system libraries

## Performance Optimization

### Development
- **Incremental compilation**: Rust changes compile faster after first build
- **Hot reload**: Frontend changes reflect immediately
- **Debug builds**: Faster compilation, larger binaries

### Production
- **Release builds**: Optimized performance, smaller binaries
- **Metal acceleration**: GPU-accelerated Whisper inference on macOS
- **Audio processing**: Efficient real-time audio handling

## Contributing

### Development Setup
1. Fork the repository
2. Create a feature branch: `git checkout -b feature-name`
3. Follow the development workflow above
4. Test thoroughly on your platform
5. Submit a pull request

### Code Style
- **Rust**: Follow `rustfmt` formatting
- **TypeScript**: Use ESLint and Prettier
- **Commits**: Use conventional commit messages

### Testing
- **Manual testing**: Test all features before submitting
- **Cross-platform**: Test on multiple operating systems if possible
- **Audio devices**: Test with different microphone setups

## Deployment

### Building for Distribution

```bash
# Create production build
npm run tauri build
```

**Output locations:**
- **macOS**: `src-tauri/target/release/bundle/macos/`
- **Windows**: `src-tauri/target/release/bundle/msi/`
- **Linux**: `src-tauri/target/release/bundle/deb/` or `src-tauri/target/release/bundle/appimage/`

### Code Signing (Production)
- **macOS**: Configure Apple Developer certificates
- **Windows**: Use code signing certificates
- **Linux**: GPG signing for package repositories

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Roadmap

- [x] Basic audio recording and playback
- [x] Whisper AI transcription integration
- [x] Real-time transcription during recording
- [x] Modern React UI with TypeScript
- [x] Cross-platform desktop application
- [x] AI meeting minutes generation (OpenAI + Ollama)
- [x] Local AI support with Ollama integration
- [x] Privacy-focused offline AI processing
- [ ] Multiple language support for transcription
- [ ] Cloud sync integration (optional)
- [ ] Advanced audio processing and noise reduction
- [ ] Meeting participant identification
- [ ] Export to various formats (PDF, DOCX, etc.)
- [ ] Plugin system for extensibility

## Support

For issues and questions:

1. **Check troubleshooting section** above
2. **Search existing issues** on GitHub
3. **Create detailed issue** with:
   - Operating system and version
   - Node.js and Rust versions
   - Steps to reproduce
   - Error messages and logs
   - Expected vs actual behavior

## Resources

- **Tauri Documentation**: https://tauri.app/
- **Whisper.cpp**: https://github.com/ggerganov/whisper.cpp
- **React Documentation**: https://react.dev/
- **Rust Book**: https://doc.rust-lang.org/book/
