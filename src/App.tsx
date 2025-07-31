import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [timer, setTimer] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("Ready to record");

  // Timer effect
  useEffect(() => {
    let interval: number;
    if (isRecording) {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  // Format timer display
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRecordToggle = async () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
      setStatus("Recording saved successfully");
      // TODO: Call Rust backend to stop recording
      try {
        await invoke("stop_recording");
      } catch (error) {
        console.error("Error stopping recording:", error);
      }
    } else {
      // Start recording
      setIsRecording(true);
      setTimer(0);
      setStatus("Recording... 🔴");
      setTranscript("");
      // TODO: Call Rust backend to start recording
      try {
        await invoke("start_recording");
      } catch (error) {
        console.error("Error starting recording:", error);
      }
    }
  };

  const handleClear = () => {
    setTimer(0);
    setTranscript("");
    setStatus("Ready to record");
  };

  const handleSave = async () => {
    // TODO: Call Rust backend to save files
    try {
      await invoke("save_files");
      alert('Files saved to Documents/MeetingRecorder/\n\n- meeting_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.wav (audio)\n- meeting_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.txt (transcript)');
    } catch (error) {
      console.error("Error saving files:", error);
    }
  };

  return (
    <div className="app-container">
      <div className="header">
        <h1>🎙️ Meeting Recorder</h1>
        <p>Simple voice recording with real-time transcription</p>
      </div>

      <div className="recording-section">
        <button 
          className={`record-button ${isRecording ? 'recording' : ''}`}
          onClick={handleRecordToggle}
        >
          {isRecording ? '🛑 Stop Recording' : '🎙️ Start Recording'}
        </button>

        <div className="status-info">
          <div className={`status ${isRecording ? 'recording' : ''}`}>
            {status}
          </div>
          <div className={`timer ${isRecording ? 'recording' : ''}`}>
            {formatTime(timer)}
          </div>
        </div>

        {isRecording && (
          <div className="audio-indicator">
            {[...Array(8)].map((_, i) => (
              <div 
                key={i} 
                className={`audio-bar ${Math.random() > 0.5 ? 'active' : ''}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="transcript-section">
        <div className="transcript-label">Live Transcript:</div>
        <textarea 
          className={`transcript-box ${transcript ? '' : 'empty'}`}
          value={transcript}
          placeholder="Text will appear here as you speak during the recording..."
          readOnly
        />
      </div>

      <div className="actions">
        <button className="action-btn" onClick={handleClear}>
          Clear
        </button>
        <button className="action-btn">
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

      <div className="footer">
        Files saved to: Documents/MeetingRecorder/meeting_{new Date().toISOString().slice(0, 10)}_*
      </div>
    </div>
  );
}

export default App;
