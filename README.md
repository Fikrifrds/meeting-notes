# Meeting Recorder

A modern desktop application for recording meetings with real-time transcription, built with Tauri, React, and Rust.

## Features

- 🎙️ **Audio Recording**: High-quality audio recording with visual feedback
- 📝 **Real-time Transcription**: AI-powered transcription using Whisper
- ⏱️ **Timer Display**: Live recording timer with formatted time display
- 🎨 **Modern UI**: Clean, responsive interface with audio visualization
- 💾 **File Management**: Automatic saving of audio files and transcripts
- 🔒 **Privacy-First**: All processing happens locally on your device

## Prerequisites

- Node.js (v18 or later)
- Rust (latest stable version)
- macOS, Windows, or Linux

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd meeting-recorder
```

2. Install dependencies:
```bash
npm install
```

3. Download the Whisper model for transcription:
```bash
./download-whisper-model.sh
```

## Development

Start the development server:
```bash
npm run tauri dev
```

This will:
- Start the Vite development server for the React frontend
- Compile and run the Rust backend
- Open the application window

## Building

Create a production build:
```bash
npm run tauri build
```

## Usage

### Basic Recording
1. Click "Start Recording" to begin audio capture
2. The timer will show the recording duration
3. Audio visualization bars will animate during recording
4. Click "Stop Recording" to end the session

### Transcription
1. First, click "Initialize Whisper" to load the AI model
2. Record your audio as usual
3. After stopping the recording, click "Transcribe Audio"
4. The transcribed text will appear in the transcript area

### File Management
- Audio files are saved to `~/Documents/MeetingRecordings/`
- Files are automatically named with timestamps
- Use "Save Files" to export transcripts

## Project Structure

```
meeting-recorder/
├── src/                    # React frontend
│   ├── App.tsx            # Main application component
│   ├── App.css            # Styling
│   └── main.tsx           # Entry point
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── main.rs        # Application entry
│   │   └── lib.rs         # Core functionality
│   ├── Cargo.toml         # Rust dependencies
│   └── tauri.conf.json    # Tauri configuration
├── public/                # Static assets
└── package.json           # Node.js dependencies
```

## Technical Details

### Backend (Rust)
- **Audio State Management**: Thread-safe state management for recording sessions
- **Whisper Integration**: Local AI transcription using whisper-rs
- **File I/O**: Automatic file saving and organization
- **Tauri Commands**: Exposed functions for frontend communication

### Frontend (React + TypeScript)
- **State Management**: React hooks for UI state
- **Real-time Updates**: Live timer and audio visualization
- **Tauri Integration**: Direct communication with Rust backend
- **Responsive Design**: Modern CSS with animations

### Dependencies
- **Tauri**: Desktop application framework
- **whisper-rs**: Rust bindings for OpenAI Whisper
- **React**: Frontend framework
- **TypeScript**: Type-safe JavaScript

## Troubleshooting

### Whisper Model Issues
If transcription fails:
1. Ensure the Whisper model is downloaded: `./download-whisper-model.sh`
2. Check that the model file exists at `~/Documents/MeetingRecordings/models/ggml-base.en.bin`
3. Try reinitializing Whisper in the application

### Audio Recording Issues
- Ensure microphone permissions are granted
- Check system audio settings
- Restart the application if audio capture fails

### Build Issues
- Update Rust: `rustup update`
- Clear cache: `npm run tauri clean`
- Reinstall dependencies: `rm -rf node_modules && npm install`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Roadmap

- [ ] Real-time transcription during recording
- [ ] Multiple language support
- [ ] Cloud sync integration
- [ ] Advanced audio processing
- [ ] Meeting participant identification
- [ ] Export to various formats (PDF, DOCX, etc.)

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Search existing GitHub issues
3. Create a new issue with detailed information
