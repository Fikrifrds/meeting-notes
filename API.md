# API Reference

This document provides a comprehensive reference for all Tauri commands and frontend APIs used in the Meeting Recorder application.

## Tauri Commands (Backend → Frontend)

All Tauri commands are defined in `src-tauri/src/lib.rs` and can be invoked from the frontend using `invoke()`.

### Audio Device Management

#### `load_audio_devices`

**Description**: Retrieves a list of available audio input devices.

**Signature**:
```rust
#[tauri::command]
async fn load_audio_devices() -> Result<Vec<String>, String>
```

**Frontend Usage**:
```typescript
import { invoke } from '@tauri-apps/api/tauri';

const loadDevices = async () => {
  try {
    const devices: string[] = await invoke('load_audio_devices');
    console.log('Available devices:', devices);
    return devices;
  } catch (error) {
    console.error('Failed to load devices:', error);
    throw error;
  }
};
```

**Returns**:
- **Success**: Array of device names (strings)
- **Error**: Error message string

**Example Response**:
```json
[
  "Built-in Microphone",
  "External Microphone",
  "USB Audio Device"
]
```

---

### Recording Management

#### `update_recording_status`

**Description**: Updates the current recording status and selected audio device.

**Signature**:
```rust
#[tauri::command]
async fn update_recording_status(
    is_recording: bool,
    device_name: String,
    state: State<'_, AudioState>
) -> Result<String, String>
```

**Parameters**:
- `is_recording`: Boolean indicating recording state
- `device_name`: Name of the selected audio device

**Frontend Usage**:
```typescript
const updateStatus = async (recording: boolean, device: string) => {
  try {
    const result = await invoke('update_recording_status', {
      isRecording: recording,
      deviceName: device
    });
    console.log('Status updated:', result);
    return result;
  } catch (error) {
    console.error('Failed to update status:', error);
    throw error;
  }
};
```

**Returns**:
- **Success**: Confirmation message
- **Error**: Error message string

---

#### `start_recording`

**Description**: Starts audio recording with the currently selected device.

**Signature**:
```rust
#[tauri::command]
async fn start_recording(state: State<'_, AudioState>) -> Result<String, String>
```

**Frontend Usage**:
```typescript
const startRecording = async () => {
  try {
    const result = await invoke('start_recording');
    console.log('Recording started:', result);
    return result;
  } catch (error) {
    console.error('Failed to start recording:', error);
    throw error;
  }
};
```

**Returns**:
- **Success**: "Recording started" message
- **Error**: Error message with details

**Possible Errors**:
- Device not found
- Permission denied
- Audio system unavailable

---

#### `stop_recording`

**Description**: Stops the current recording session and saves the audio file.

**Signature**:
```rust
#[tauri::command]
async fn stop_recording(state: State<'_, AudioState>) -> Result<String, String>
```

**Frontend Usage**:
```typescript
const stopRecording = async () => {
  try {
    const result = await invoke('stop_recording');
    console.log('Recording stopped:', result);
    return result;
  } catch (error) {
    console.error('Failed to stop recording:', error);
    throw error;
  }
};
```

**Returns**:
- **Success**: File path of saved recording
- **Error**: Error message string

**Example Response**:
```
"/Users/username/Documents/MeetingRecordings/recording_2024-01-15_14-30-25.wav"
```

---

### Whisper AI Integration

#### `initialize_whisper`

**Description**: Initializes the Whisper AI model for transcription.

**Signature**:
```rust
#[tauri::command]
async fn initialize_whisper(state: State<'_, AudioState>) -> Result<String, String>
```

**Frontend Usage**:
```typescript
const initializeWhisper = async () => {
  try {
    const result = await invoke('initialize_whisper');
    console.log('Whisper initialized:', result);
    return result;
  } catch (error) {
    console.error('Failed to initialize Whisper:', error);
    throw error;
  }
};
```

**Returns**:
- **Success**: "Whisper initialized successfully"
- **Error**: Error message with details

**Possible Errors**:
- Model file not found
- Insufficient memory
- Metal backend unavailable (macOS)

**Model Location**: `~/Documents/MeetingRecordings/models/ggml-base.en.bin`

---

#### `transcribe_audio`

**Description**: Transcribes the most recent audio recording using Whisper AI.

**Signature**:
```rust
#[tauri::command]
async fn transcribe_audio(state: State<'_, AudioState>) -> Result<String, String>
```

**Frontend Usage**:
```typescript
const transcribeAudio = async () => {
  try {
    const transcript = await invoke('transcribe_audio');
    console.log('Transcription:', transcript);
    return transcript;
  } catch (error) {
    console.error('Transcription failed:', error);
    throw error;
  }
};
```

**Returns**:
- **Success**: Transcribed text string
- **Error**: Error message string

**Possible Errors**:
- No audio file to transcribe
- Whisper not initialized
- Audio file corrupted
- Transcription timeout

---

#### `toggle_realtime_transcription`

**Description**: Enables or disables real-time transcription during recording.

**Signature**:
```rust
#[tauri::command]
async fn toggle_realtime_transcription(
    enabled: bool,
    state: State<'_, AudioState>
) -> Result<String, String>
```

**Parameters**:
- `enabled`: Boolean to enable/disable real-time transcription

**Frontend Usage**:
```typescript
const toggleRealtime = async (enabled: boolean) => {
  try {
    const result = await invoke('toggle_realtime_transcription', {
      enabled
    });
    console.log('Real-time transcription:', result);
    return result;
  } catch (error) {
    console.error('Failed to toggle real-time transcription:', error);
    throw error;
  }
};
```

**Returns**:
- **Success**: Status message
- **Error**: Error message string

---

## Frontend Event Listeners

The application uses Tauri's event system for real-time communication from backend to frontend.

### Real-time Transcription Events

#### `realtime-transcription`

**Description**: Receives real-time transcription updates during recording.

**Event Data**:
```typescript
interface TranscriptionEvent {
  text: string;
  timestamp: number;
  confidence?: number;
}
```

**Frontend Usage**:
```typescript
import { listen } from '@tauri-apps/api/event';

const setupRealtimeListener = async () => {
  const unlisten = await listen('realtime-transcription', (event) => {
    const data = event.payload as TranscriptionEvent;
    console.log('Real-time transcript:', data.text);
    
    // Update UI with new transcription
    setTranscript(prev => prev + ' ' + data.text);
  });

  // Return unlisten function for cleanup
  return unlisten;
};

// Usage in React component
useEffect(() => {
  let unlisten: (() => void) | null = null;
  
  setupRealtimeListener().then(unlistenFn => {
    unlisten = unlistenFn;
  });

  return () => {
    if (unlisten) unlisten();
  };
}, []);
```

---

## Frontend State Management

### React State Structure

```typescript
interface AppState {
  // Recording state
  isRecording: boolean;
  recordingTime: number;
  
  // Transcription state
  transcript: string;
  isWhisperInitialized: boolean;
  isRealtimeEnabled: boolean;
  
  // Audio devices
  audioDevices: string[];
  selectedDevice: string;
  
  // UI state
  error: string;
  isLoading: boolean;
}
```

### State Management Hooks

#### Recording Timer Hook

```typescript
const useRecordingTimer = (isRecording: boolean) => {
  const [time, setTime] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRecording) {
      interval = setInterval(() => {
        setTime(prev => prev + 1);
      }, 1000);
    } else {
      setTime(0);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isRecording]);

  return time;
};
```

#### Audio Devices Hook

```typescript
const useAudioDevices = () => {
  const [devices, setDevices] = useState<string[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('');

  const loadDevices = useCallback(async () => {
    try {
      const deviceList = await invoke('load_audio_devices');
      setDevices(deviceList);
      if (deviceList.length > 0 && !selectedDevice) {
        setSelectedDevice(deviceList[0]);
      }
    } catch (error) {
      console.error('Failed to load devices:', error);
    }
  }, [selectedDevice]);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  return { devices, selectedDevice, setSelectedDevice, loadDevices };
};
```

---

## Error Handling

### Error Types

```typescript
interface APIError {
  message: string;
  code?: string;
  details?: any;
}

// Common error patterns
const ErrorTypes = {
  DEVICE_NOT_FOUND: 'Device not found',
  PERMISSION_DENIED: 'Permission denied',
  WHISPER_NOT_INITIALIZED: 'Whisper not initialized',
  MODEL_NOT_FOUND: 'Model file not found',
  RECORDING_FAILED: 'Recording failed',
  TRANSCRIPTION_FAILED: 'Transcription failed'
} as const;
```

### Error Handling Utilities

```typescript
const handleAPIError = (error: unknown): string => {
  if (typeof error === 'string') {
    return error;
  }
  
  if (error instanceof Error) {
    return error.message;
  }
  
  return 'An unknown error occurred';
};

const withErrorHandling = async <T>(
  operation: () => Promise<T>,
  errorMessage: string = 'Operation failed'
): Promise<T | null> => {
  try {
    return await operation();
  } catch (error) {
    console.error(errorMessage, error);
    return null;
  }
};
```

---

## File System Operations

### File Paths and Structure

```
~/Documents/MeetingRecordings/
├── models/
│   └── ggml-base.en.bin          # Whisper AI model
├── recordings/
│   ├── recording_2024-01-15_14-30-25.wav
│   ├── recording_2024-01-15_15-45-10.wav
│   └── ...
└── transcripts/
    ├── transcript_2024-01-15_14-30-25.txt
    ├── transcript_2024-01-15_15-45-10.txt
    └── ...
```

### File Naming Convention

```rust
// Timestamp format: YYYY-MM-DD_HH-MM-SS
let timestamp = chrono::Local::now().format("%Y-%m-%d_%H-%M-%S");
let filename = format!("recording_{}.wav", timestamp);
```

### File Operations

```typescript
// Save transcript to file (example implementation)
const saveTranscript = async (transcript: string, filename: string) => {
  try {
    // This would be implemented as a Tauri command
    await invoke('save_transcript', {
      content: transcript,
      filename
    });
  } catch (error) {
    console.error('Failed to save transcript:', error);
  }
};
```

---

## Performance Considerations

### Audio Processing

- **Sample Rate**: 16kHz (optimized for Whisper)
- **Channels**: Mono (single channel)
- **Format**: 16-bit PCM WAV
- **Buffer Size**: Configurable based on system performance

### Memory Management

- **Whisper Model**: ~140MB in memory when loaded
- **Audio Buffers**: Circular buffers to prevent memory leaks
- **Real-time Processing**: Chunked processing to maintain responsiveness

### Threading

- **Audio Capture**: Separate thread for audio input
- **Transcription**: Background thread for AI processing
- **UI Updates**: Main thread for React state updates

---

## Security Considerations

### Tauri Security

- **CSP**: Content Security Policy prevents XSS attacks
- **Permissions**: Minimal required permissions only
- **File Access**: Restricted to designated directories

### Data Privacy

- **Local Processing**: All audio and transcription stays on device
- **No Network**: No data transmitted to external servers
- **File Permissions**: User controls file access and storage

---

## Testing APIs

### Manual Testing

```typescript
// Test all APIs in sequence
const testAllAPIs = async () => {
  console.log('Testing API endpoints...');
  
  // Test device loading
  const devices = await invoke('load_audio_devices');
  console.log('Devices:', devices);
  
  // Test Whisper initialization
  await invoke('initialize_whisper');
  console.log('Whisper initialized');
  
  // Test recording workflow
  await invoke('start_recording');
  console.log('Recording started');
  
  // Wait 5 seconds
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const filePath = await invoke('stop_recording');
  console.log('Recording saved:', filePath);
  
  // Test transcription
  const transcript = await invoke('transcribe_audio');
  console.log('Transcript:', transcript);
};
```

### Error Testing

```typescript
// Test error conditions
const testErrorHandling = async () => {
  try {
    // Test transcription without initialization
    await invoke('transcribe_audio');
  } catch (error) {
    console.log('Expected error:', error);
  }
  
  try {
    // Test recording with invalid device
    await invoke('update_recording_status', {
      isRecording: true,
      deviceName: 'NonexistentDevice'
    });
  } catch (error) {
    console.log('Expected error:', error);
  }
};
```

---

## API Versioning and Compatibility

### Current Version: 1.0

- All APIs are stable for production use
- Breaking changes will increment major version
- Backward compatibility maintained within major versions

### Future Enhancements

- Batch transcription support
- Multiple language models
- Audio format conversion
- Cloud sync integration (optional)
- Plugin system for extensibility

---

## Debugging APIs

### Logging

```rust
// Enable debug logging in Rust
log::debug!("API call: {}", command_name);
log::info!("Operation completed: {}", result);
log::error!("API error: {}", error);
```

```typescript
// Frontend debugging
const debugInvoke = async (command: string, args?: any) => {
  console.log(`Invoking: ${command}`, args);
  const start = performance.now();
  
  try {
    const result = await invoke(command, args);
    const duration = performance.now() - start;
    console.log(`Success: ${command} (${duration.toFixed(2)}ms)`, result);
    return result;
  } catch (error) {
    const duration = performance.now() - start;
    console.error(`Error: ${command} (${duration.toFixed(2)}ms)`, error);
    throw error;
  }
};
```

### Performance Monitoring

```typescript
// Monitor API performance
const apiMetrics = {
  calls: new Map<string, number>(),
  totalTime: new Map<string, number>(),
  
  record(command: string, duration: number) {
    this.calls.set(command, (this.calls.get(command) || 0) + 1);
    this.totalTime.set(command, (this.totalTime.get(command) || 0) + duration);
  },
  
  getStats() {
    const stats: Record<string, any> = {};
    for (const [command, calls] of this.calls) {
      const totalTime = this.totalTime.get(command) || 0;
      stats[command] = {
        calls,
        totalTime: totalTime.toFixed(2),
        avgTime: (totalTime / calls).toFixed(2)
      };
    }
    return stats;
  }
};
```