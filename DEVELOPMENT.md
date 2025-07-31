# Development Guide

This guide provides detailed instructions for setting up and developing the Meeting Recorder application.

## Environment Setup

### 1. System Requirements

#### macOS
```bash
# Install Xcode Command Line Tools
xcode-select --install

# Install Homebrew (if not already installed)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install Node.js via Homebrew
brew install node

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env
```

#### Windows
```powershell
# Install Node.js from https://nodejs.org/
# Install Rust from https://rustup.rs/
# Install Visual Studio Build Tools or Visual Studio Community

# Verify installations
node --version
npm --version
rustc --version
cargo --version
```

#### Linux (Ubuntu/Debian)
```bash
# Update package list
sudo apt update

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Install system dependencies
sudo apt-get install -y build-essential webkit2gtk-4.0-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev
```

### 2. Project Setup

```bash
# Clone the repository
git clone <repository-url>
cd meeting-notes

# Install Node.js dependencies
npm install

# Verify Tauri CLI installation
npm run tauri --version

# Download Whisper model
chmod +x download-whisper-model.sh
./download-whisper-model.sh
```

## Development Workflow

### Starting Development

```bash
# Start the development server
npm run tauri dev
```

This command:
1. Starts Vite dev server on `http://localhost:1420`
2. Compiles Rust backend with debug symbols
3. Opens the application window
4. Enables hot-reload for both frontend and backend

### Development Commands

```bash
# Frontend only (for UI development)
npm run dev

# Build frontend for production
npm run build

# Preview production build
npm run preview

# Clean build artifacts
npm run tauri clean

# Build production application
npm run tauri build
```

### Code Structure

#### Frontend Development (`src/`)

**Main Components:**
- `App.tsx` - Main application component with state management
- `App.css` - Application styles and animations
- `main.tsx` - React entry point

**Key Features:**
- Real-time audio visualization
- Timer display with formatting
- State management for recording/transcription
- Error handling with user feedback
- Tauri command integration

#### Backend Development (`src-tauri/src/`)

**Core Files:**
- `main.rs` - Application entry point and window setup
- `lib.rs` - Core business logic and Tauri commands

**Key Components:**
- Audio state management with Arc<Mutex<>>
- Whisper model integration
- File I/O operations
- Real-time audio processing
- Cross-platform audio device detection

### Configuration Files

#### Tauri Configuration (`src-tauri/tauri.conf.json`)

```json
{
  "productName": "Meeting Recorder",
  "identifier": "com.meeting-recorder.app",
  "plugins": {
    "opener": {
      "requireLiteralLeadingDot": false
    }
  },
  "app": {
    "windows": [
      {
        "width": 800,
        "height": 600,
        "resizable": true,
        "title": "Meeting Recorder"
      }
    ]
  }
}
```

#### Capabilities (`src-tauri/capabilities/default.json`)

```json
{
  "identifier": "default",
  "description": "Default capabilities for the application",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:app:default",
    "core:event:default",
    "core:window:default",
    "core:app:allow-app-hide",
    "core:app:allow-app-show",
    "opener:default"
  ]
}
```

## Debugging

### Frontend Debugging

```bash
# Open browser dev tools
# In the application, press F12 or Cmd+Option+I

# View console logs
console.log("Debug message");

# React DevTools (install browser extension)
# Available in development mode
```

### Backend Debugging

```bash
# Add debug prints in Rust
println!("Debug: {:?}", variable);

# Use Rust debugger
# Add to Cargo.toml [dependencies]
# log = "0.4"
# env_logger = "0.10"

# View logs in terminal
RUST_LOG=debug npm run tauri dev
```

### Common Debug Scenarios

#### Audio Issues
```rust
// In lib.rs, add debugging for audio devices
#[tauri::command]
async fn load_audio_devices() -> Result<Vec<String>, String> {
    println!("Loading audio devices...");
    // ... existing code
    println!("Found {} devices", devices.len());
    Ok(devices)
}
```

#### Whisper Model Issues
```rust
// Debug Whisper initialization
#[tauri::command]
async fn initialize_whisper(state: State<'_, AudioState>) -> Result<String, String> {
    println!("Initializing Whisper model...");
    // ... existing code
    println!("Whisper initialized successfully");
    Ok("Whisper initialized".to_string())
}
```

## Testing

### Manual Testing Checklist

#### Audio Recording
- [ ] Start/stop recording functionality
- [ ] Timer accuracy and display
- [ ] Audio visualization during recording
- [ ] File saving with correct timestamps
- [ ] Multiple recording sessions

#### Transcription
- [ ] Whisper model initialization
- [ ] Audio transcription accuracy
- [ ] Real-time transcription during recording
- [ ] Error handling for missing models
- [ ] Large file transcription

#### UI/UX
- [ ] Responsive design on different window sizes
- [ ] Button states and feedback
- [ ] Error message display and clearing
- [ ] Loading states and animations
- [ ] Keyboard shortcuts (if implemented)

#### Cross-Platform
- [ ] macOS functionality
- [ ] Windows functionality (if available)
- [ ] Linux functionality (if available)
- [ ] Audio device detection on each platform

### Automated Testing (Future)

```bash
# Frontend tests (to be implemented)
npm test

# Rust tests
cd src-tauri
cargo test

# Integration tests
npm run test:integration
```

## Performance Optimization

### Development Performance

```bash
# Use incremental compilation
export CARGO_INCREMENTAL=1

# Parallel compilation
export CARGO_BUILD_JOBS=4

# Faster linking (macOS)
export CARGO_TARGET_X86_64_APPLE_DARWIN_LINKER=clang
export CARGO_TARGET_AARCH64_APPLE_DARWIN_LINKER=clang
```

### Production Optimization

```bash
# Build with optimizations
npm run tauri build

# Profile build size
cd src-tauri
cargo bloat --release --crates

# Profile performance
cargo build --release
time ./target/release/meeting-recorder
```

## Troubleshooting Development Issues

### Compilation Errors

```bash
# Clear all caches
rm -rf node_modules package-lock.json
npm install
cd src-tauri
cargo clean
cd ..
npm run tauri dev
```

### Permission Errors

```bash
# macOS: Reset microphone permissions
tccutil reset Microphone com.meeting-recorder.app

# Check file permissions
ls -la ~/Documents/MeetingRecordings/
chmod 755 ~/Documents/MeetingRecordings/
```

### Port Conflicts

```bash
# Check what's using port 1420
lsof -i :1420

# Kill conflicting processes
pkill -f "1420"

# Use different port (not recommended for Tauri)
# Modify vite.config.ts if absolutely necessary
```

### Model Download Issues

```bash
# Manual model download
mkdir -p ~/Documents/MeetingRecordings/models
cd ~/Documents/MeetingRecordings/models

# Download directly
curl -L -o ggml-base.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin

# Verify download
file ggml-base.en.bin
ls -la ggml-base.en.bin
```

## Code Style and Standards

### Rust Code Style

```bash
# Format code
cd src-tauri
cargo fmt

# Check for issues
cargo clippy

# Fix common issues
cargo clippy --fix
```

### TypeScript/React Code Style

```bash
# Format code (if ESLint/Prettier configured)
npm run lint
npm run format

# Type checking
npx tsc --noEmit
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/new-feature

# Commit with conventional commits
git commit -m "feat: add real-time transcription"
git commit -m "fix: resolve audio device detection issue"
git commit -m "docs: update development guide"

# Push and create PR
git push origin feature/new-feature
```

## Advanced Development

### Adding New Tauri Commands

1. **Define in Rust** (`src-tauri/src/lib.rs`):
```rust
#[tauri::command]
async fn new_command(param: String) -> Result<String, String> {
    // Implementation
    Ok("Success".to_string())
}
```

2. **Register in main.rs**:
```rust
fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            // ... existing commands
            new_command
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

3. **Use in Frontend** (`src/App.tsx`):
```typescript
import { invoke } from '@tauri-apps/api/tauri';

const handleNewCommand = async () => {
    try {
        const result = await invoke('new_command', { param: 'value' });
        console.log(result);
    } catch (error) {
        console.error('Command failed:', error);
    }
};
```

### Adding New Dependencies

#### Rust Dependencies
```bash
cd src-tauri
cargo add new-dependency
```

#### Node.js Dependencies
```bash
npm install new-dependency
npm install --save-dev new-dev-dependency
```

### Custom Build Scripts

Create custom build scripts in `package.json`:
```json
{
  "scripts": {
    "dev:clean": "npm run tauri clean && npm run tauri dev",
    "build:debug": "npm run tauri build --debug",
    "test:manual": "echo 'Run manual tests checklist'"
  }
}
```

## Resources

- [Tauri Documentation](https://tauri.app/)
- [Rust Book](https://doc.rust-lang.org/book/)
- [React Documentation](https://react.dev/)
- [Whisper.cpp](https://github.com/ggerganov/whisper.cpp)
- [CPAL Audio Library](https://docs.rs/cpal/)
- [Vite Documentation](https://vitejs.dev/)