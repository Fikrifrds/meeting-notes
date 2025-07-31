import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [whisperInitialized, setWhisperInitialized] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [lastRecordingPath, setLastRecordingPath] = useState("");
  const [isRealtimeEnabled, setIsRealtimeEnabled] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("Not recording");
  const [realtimeTranscript, setRealtimeTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    let interval: number;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
        // Update recording status
        updateRecordingStatus();
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Load audio devices on component mount
  useEffect(() => {
    // Delay to ensure Tauri API is fully loaded
    const timer = setTimeout(() => {
      loadAudioDevices();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  // Listen for real-time transcription events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    
    const setupListener = async () => {
      try {
        // Import listen dynamically to ensure it's available
        const { listen: listenFn } = await import("@tauri-apps/api/event");
        
        unlisten = await listenFn<string>('realtime-transcript', (event) => {
          console.log('Received real-time transcript:', event.payload);
          setRealtimeTranscript(prev => {
            // Append new transcript with a space if there's existing content
            return prev ? `${prev} ${event.payload}` : event.payload;
          });
        });
        
        console.log('Real-time transcript listener setup successfully');
      } catch (error) {
        console.error('Failed to setup real-time transcript listener:', error);
      }
    };
    
    // Delay setup to ensure Tauri is fully loaded
    const timer = setTimeout(setupListener, 1000);
    
    return () => {
      clearTimeout(timer);
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  const clearError = () => setError(null);

  const showError = (message: string) => {
    setError(message);
    setTimeout(clearError, 5000); // Auto-clear after 5 seconds
  };

  const loadAudioDevices = async () => {
    try {
      // Check if invoke is available (Tauri API loaded)
      if (typeof invoke === 'undefined') {
        console.log("Tauri API not yet loaded, skipping device loading");
        return;
      }
      
      const devices = await invoke<string[]>("get_audio_devices");
      setAudioDevices(devices);
    } catch (error) {
      console.error("Failed to load audio devices:", error);
      showError(`Failed to load audio devices: ${error}`);
    }
  };

  const updateRecordingStatus = async () => {
    try {
      const status = await invoke<string>("get_recording_status");
      setRecordingStatus(status);
    } catch (error) {
      console.error("Failed to get recording status:", error);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const initializeWhisper = async () => {
    try {
      clearError();
      const result = await invoke("initialize_whisper");
      console.log("Whisper initialization:", result);
      setWhisperInitialized(true);
    } catch (error) {
      console.error("Failed to initialize Whisper:", error);
      showError(`Failed to initialize Whisper: ${error}`);
    }
  };

  const toggleRealtimeTranscription = async () => {
    try {
      clearError();
      if (isRealtimeEnabled) {
        await invoke("disable_realtime_transcription");
        setIsRealtimeEnabled(false);
      } else {
        await invoke("enable_realtime_transcription");
        setIsRealtimeEnabled(true);
      }
    } catch (error) {
      console.error("Failed to toggle real-time transcription:", error);
      showError(`Failed to toggle real-time transcription: ${error}`);
    }
  };

  const startRecording = async () => {
    try {
      clearError();
      setIsRecording(true);
      setRecordingTime(0);
      setTranscript("");
      setRealtimeTranscript("");
      
      const result = await invoke("start_recording");
      console.log("Recording started:", result);
      
    } catch (error) {
      console.error("Failed to start recording:", error);
      setIsRecording(false);
      showError(`Failed to start recording: ${error}`);
    }
  };

  const stopRecording = async () => {
    try {
      clearError();
      const result = await invoke<string>("stop_recording");
      console.log("Recording stopped:", result);
      
      setIsRecording(false);
      
      // Extract file path from result message
      const pathMatch = result.match(/Recording stopped and saved: (.+)/);
      if (pathMatch) {
        setLastRecordingPath(pathMatch[1]);
      }
      
    } catch (error) {
      console.error("Failed to stop recording:", error);
      setIsRecording(false);
      showError(`Failed to stop recording: ${error}`);
    }
  };

  const transcribeAudio = async () => {
    if (!lastRecordingPath) {
      showError("No recording available to transcribe. Please record audio first.");
      return;
    }

    try {
      clearError();
      setIsTranscribing(true);
      setTranscript("Processing audio file...");
      
      const result = await invoke<string>("transcribe_audio", { audioPath: lastRecordingPath });
      console.log("Transcription result:", result);
      
      setTranscript(result);
      
    } catch (error) {
      console.error("Failed to transcribe audio:", error);
      setTranscript("");
      showError(`Failed to transcribe audio: ${error}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleClear = () => {
    setRecordingTime(0);
    setTranscript("");
    setRealtimeTranscript("");
    setLastRecordingPath("");
    setRecordingStatus("Not recording");
    clearError();
  };

  const handleSave = async () => {
    try {
      clearError();
      
      // Save audio file
      await invoke("save_files");
      
      // Save transcript if available
      if (transcript.trim()) {
        const result = await invoke<string>("save_transcript_to_file", { 
          transcript: transcript,
          filename: null 
        });
        console.log("Transcript saved:", result);
        showError(`Files saved successfully!\n${result}`);
      } else {
        showError("Audio file saved, but no transcript available to save.");
      }
      
    } catch (error) {
      console.error("Error saving files:", error);
      showError(`Error saving files: ${error}`);
    }
  };

  const toggleSettings = () => {
    setShowSettings(!showSettings);
  };

  return (
    <div className="container">
      <header className="header">
        <h1>Meeting Recorder</h1>
        <div className="status">
          <span className={`status-indicator ${isRecording ? 'recording' : 'idle'}`}></span>
          <span>{isRecording ? 'Recording' : 'Ready'}</span>
          {isRecording && (
            <span className="recording-details">
              • {recordingStatus}
              {isRealtimeEnabled && " • Real-time ON"}
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span className="error-message">{error}</span>
          <button className="error-close" onClick={clearError}>×</button>
        </div>
      )}

      <main className="main">
        <div className="recording-section">
          <div className="timer">
            <h2>{formatTime(recordingTime)}</h2>
          </div>

          <div className="audio-indicator">
            <div className={`audio-circle ${isRecording ? 'recording' : ''}`}></div>
          </div>

          <div className="controls">
            {!whisperInitialized && (
              <button className="btn btn-primary" onClick={initializeWhisper}>
                Initialize Whisper
              </button>
            )}
            
            {whisperInitialized && !isRecording && (
              <button
                className={`btn ${isRealtimeEnabled ? 'btn-success' : 'btn-secondary'}`}
                onClick={toggleRealtimeTranscription}
              >
                {isRealtimeEnabled ? 'Real-time ON' : 'Enable Real-time'}
              </button>
            )}
            
            <button
              className={`btn ${isRecording ? 'btn-danger' : 'btn-primary'}`}
              onClick={isRecording ? stopRecording : startRecording}
            >
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </button>

            {lastRecordingPath && whisperInitialized && !isRecording && (
              <button 
                className="btn btn-secondary" 
                onClick={transcribeAudio}
                disabled={isTranscribing}
              >
                {isTranscribing ? 'Transcribing...' : 'Transcribe Audio'}
              </button>
            )}
          </div>
        </div>

        <div className="transcript-section">
          {isRealtimeEnabled && isRecording && realtimeTranscript && (
            <div className="realtime-transcript">
              <h3>
                <span className="live-indicator"></span>
                Real-time (Live)
              </h3>
              <div className="transcript-area realtime">
                {realtimeTranscript}
              </div>
            </div>
          )}
          
          <div className="final-transcript">
            {(isRealtimeEnabled && isRecording) && <h3>Final Transcript</h3>}
            <div className="transcript-area">
              {transcript || "Transcript will appear here after recording and transcription..."}
            </div>
          </div>
        </div>

        <div className="actions">
          <button className="action-btn" onClick={handleClear}>
            Clear
          </button>
          <button className="action-btn" onClick={toggleSettings}>
            Settings
          </button>
          <button 
            className="action-btn primary" 
            onClick={handleSave}
            disabled={!transcript}
          >
            Save Files
          </button>
        </div>

        {showSettings && (
          <div className="settings-panel">
            <h3>Settings</h3>
            <div className="setting-group">
              <label>Available Audio Devices:</label>
              <div className="device-list">
                {audioDevices.length > 0 ? (
                  audioDevices.map((device, index) => (
                    <div key={index} className="device-item">
                      {device}
                    </div>
                  ))
                ) : (
                  <div className="device-item">No devices found</div>
                )}
              </div>
              <button className="btn btn-secondary" onClick={loadAudioDevices}>
                Refresh Devices
              </button>
            </div>
          </div>
        )}

        <div className="footer">
          Files saved to: Documents/MeetingRecordings/meeting_{new Date().toISOString().slice(0, 10)}_*
        </div>
    </main>
      </div>
    );
  }

  export default App;
