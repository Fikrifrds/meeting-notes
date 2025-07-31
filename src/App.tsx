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
      const result = await invoke("initialize_whisper");
      console.log("Whisper initialization:", result);
      setWhisperInitialized(true);
    } catch (error) {
      console.error("Failed to initialize Whisper:", error);
      alert(`Failed to initialize Whisper: ${error}`);
    }
  };

  const toggleRealtimeTranscription = async () => {
    try {
      if (isRealtimeEnabled) {
        await invoke("disable_realtime_transcription");
        setIsRealtimeEnabled(false);
      } else {
        await invoke("enable_realtime_transcription");
        setIsRealtimeEnabled(true);
      }
    } catch (error) {
      console.error("Failed to toggle real-time transcription:", error);
      alert(`Failed to toggle real-time transcription: ${error}`);
    }
  };

  const startRecording = async () => {
    try {
      setIsRecording(true);
      setRecordingTime(0);
      setTranscript("");
      setRealtimeTranscript("");
      
      const result = await invoke("start_recording");
      console.log("Recording started:", result);
      
    } catch (error) {
      console.error("Failed to start recording:", error);
      setIsRecording(false);
      alert(`Failed to start recording: ${error}`);
    }
  };

  const stopRecording = async () => {
    try {
      const result = await invoke<string>("stop_recording");
      console.log("Recording stopped:", result);
      
      setIsRecording(false);
      
      // Extract file path from result message
      const pathMatch = result.match(/Recording stopped and saved: (.+)/);
      if (pathMatch) {
        setLastRecordingPath(pathMatch[1]);
        alert(`Recording saved successfully!\n${result}`);
      } else {
        alert(`Recording stopped: ${result}`);
      }
      
    } catch (error) {
      console.error("Failed to stop recording:", error);
      setIsRecording(false);
      alert(`Failed to stop recording: ${error}`);
    }
  };

  const transcribeAudio = async () => {
    if (!lastRecordingPath) {
      alert("No recording available to transcribe. Please record audio first.");
      return;
    }

    try {
      setIsTranscribing(true);
      setTranscript("Processing audio file...");
      
      const result = await invoke<string>("transcribe_audio", { audioPath: lastRecordingPath });
      console.log("Transcription result:", result);
      
      setTranscript(result);
      
    } catch (error) {
      console.error("Failed to transcribe:", error);
      setTranscript(`Transcription failed: ${error}`);
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
  };

  const handleSave = async () => {
    try {
      await invoke("save_files");
      alert('Files saved to Documents/MeetingRecorder/\n\n- meeting_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.wav (audio)\n- meeting_' + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + '.txt (transcript)');
    } catch (error) {
      console.error("Error saving files:", error);
    }
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

      <main className="main">
        <div className="recording-section">
          <div className="timer">
            <h2>{formatTime(recordingTime)}</h2>
          </div>

          <div className="audio-visualization">
            <div className="waveform">
              {Array.from({ length: 20 }, (_, i) => (
                <div
                  key={i}
                  className={`bar ${isRecording ? 'active' : ''}`}
                  style={{
                    animationDelay: `${i * 0.1}s`,
                    height: isRecording ? `${Math.random() * 40 + 10}px` : '4px'
                  }}
                ></div>
              ))}
            </div>
          </div>

          <div className="controls">
            {!whisperInitialized && (
              <button 
                className="btn btn-secondary"
                onClick={initializeWhisper}
              >
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
          <h3>Transcript</h3>
          {isRealtimeEnabled && isRecording && (
            <div className="realtime-transcript">
              <h4>Real-time (Live)</h4>
              <div className="transcript-area realtime">
                {realtimeTranscript || "Listening for speech..."}
              </div>
            </div>
          )}
          <div className="final-transcript">
            {(isRealtimeEnabled && isRecording) && <h4>Final Transcript</h4>}
            <div className="transcript-area">
              {transcript || "Transcript will appear here after recording and transcription..."}
            </div>
          </div>
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
      </main>
    </div>
  );
}

export default App;
