import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from 'react-markdown';
import TranscriptionSegments, { TranscriptionResult } from './components/TranscriptionSegments';
import "./App.css";

function App() {
  // Supported languages for Whisper transcription
  const supportedLanguages = [
    { code: 'en', name: 'English' },
    { code: 'id', name: 'Indonesian (Bahasa Indonesia)' },
    { code: 'es', name: 'Spanish (Español)' },
    { code: 'fr', name: 'French (Français)' },
    { code: 'de', name: 'German (Deutsch)' },
    { code: 'it', name: 'Italian (Italiano)' },
    { code: 'pt', name: 'Portuguese (Português)' },
    { code: 'ru', name: 'Russian (Русский)' },
    { code: 'ja', name: 'Japanese (日本語)' },
    { code: 'ko', name: 'Korean (한국어)' },
    { code: 'zh', name: 'Chinese (中文)' },
    { code: 'ar', name: 'Arabic (العربية)' },
    { code: 'hi', name: 'Hindi (हिन्दी)' },
    { code: 'th', name: 'Thai (ไทย)' },
    { code: 'vi', name: 'Vietnamese (Tiếng Việt)' },
    { code: 'nl', name: 'Dutch (Nederlands)' },
    { code: 'pl', name: 'Polish (Polski)' },
    { code: 'tr', name: 'Turkish (Türkçe)' },
    { code: 'sv', name: 'Swedish (Svenska)' },
    { code: 'da', name: 'Danish (Dansk)' },
    { code: 'no', name: 'Norwegian (Norsk)' },
    { code: 'fi', name: 'Finnish (Suomi)' },
    { code: 'auto', name: 'Auto-detect' }
  ];

  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [transcriptionResult, setTranscriptionResult] = useState<TranscriptionResult | null>(null);
  const [whisperInitialized, setWhisperInitialized] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [lastRecordingPath, setLastRecordingPath] = useState("");
  const [isRealtimeEnabled, setIsRealtimeEnabled] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("Not recording");
  const [realtimeTranscript, setRealtimeTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [meetingMinutes, setMeetingMinutes] = useState("");
  const [isGeneratingMinutes, setIsGeneratingMinutes] = useState(false);
  const [micGain, setMicGain] = useState(2.5);
  const [systemGain, setSystemGain] = useState(1.5);
  const [aiProvider, setAiProvider] = useState<'openai' | 'ollama'>('ollama');
  const [selectedLanguage, setSelectedLanguage] = useState('en'); // Default to English
  
  // Audio device selection state
  interface AudioDevice {
    name: string;
    is_default: boolean;
    device_type: string;
  }
  
  interface AudioDevices {
    input_devices: AudioDevice[];
    output_devices: AudioDevice[];
  }
  
  const [availableDevices, setAvailableDevices] = useState<AudioDevices>({ input_devices: [], output_devices: [] });
  const [selectedMicDevice, setSelectedMicDevice] = useState<string | null>(null);
  const [selectedSystemDevice, setSelectedSystemDevice] = useState<string | null>(null);

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

  // Load audio devices and gain settings on component mount
  useEffect(() => {
    // Delay to ensure Tauri API is fully loaded
    const timer = setTimeout(() => {
      loadAudioDevices();
      loadGainSettings();
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
      
      const devices = await invoke<AudioDevices>("get_audio_devices");
      setAvailableDevices(devices);
      
      // Load currently selected devices
      await loadSelectedDevices();
    } catch (error) {
      console.error("Failed to load audio devices:", error);
      showError(`Failed to load audio devices: ${error}`);
    }
  };

  const loadSelectedDevices = async () => {
    try {
      const [micDevice, systemDevice] = await invoke<[string | null, string | null]>("get_selected_devices");
      setSelectedMicDevice(micDevice);
      setSelectedSystemDevice(systemDevice);
    } catch (error) {
      console.error("Failed to load selected devices:", error);
    }
  };

  const updateSelectedDevices = async (micDevice: string | null, systemDevice: string | null) => {
    try {
      await invoke("set_audio_devices", { 
        micDevice: micDevice, 
        systemDevice: systemDevice 
      });
      setSelectedMicDevice(micDevice);
      setSelectedSystemDevice(systemDevice);
      console.log(`Audio devices updated - Mic: ${micDevice || 'Default'}, System: ${systemDevice || 'Auto-detect'}`);
    } catch (error) {
      console.error("Failed to set audio devices:", error);
      showError(`Failed to set audio devices: ${error}`);
    }
  };

  const loadGainSettings = async () => {
    try {
      const [mic, system] = await invoke<[number, number]>("get_gain_settings");
      setMicGain(mic);
      setSystemGain(system);
    } catch (error) {
      console.error("Failed to load gain settings:", error);
    }
  };

  const updateGainSettings = async (newMicGain: number, newSystemGain: number) => {
    try {
      await invoke("set_gain_settings", { micGain: newMicGain, systemGain: newSystemGain });
      setMicGain(newMicGain);
      setSystemGain(newSystemGain);
      console.log(`Gain updated - Mic: ${newMicGain}, System: ${newSystemGain}`);
    } catch (error) {
      console.error("Failed to update gain settings:", error);
      showError(`Failed to update gain settings: ${error}`);
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
      setTranscriptionResult(null);
      
      // Pass language parameter to backend
      const languageParam = selectedLanguage === 'auto' ? null : selectedLanguage;
      const result = await invoke<TranscriptionResult>("transcribe_audio_with_segments", { 
        audioPath: lastRecordingPath,
        language: languageParam 
      });
      console.log("Transcription result:", result);
      
      setTranscript(result.full_text);
      setTranscriptionResult(result);
      
    } catch (error) {
      console.error("Failed to transcribe audio:", error);
      setTranscript("");
      setTranscriptionResult(null);
      showError(`Failed to transcribe audio: ${error}`);
    } finally {
      setIsTranscribing(false);
    }
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

  const generateMeetingMinutes = async () => {
    if (!transcript.trim()) {
      showError("No transcript available to generate meeting minutes. Please transcribe audio first.");
      return;
    }

    try {
      clearError();
      setIsGeneratingMinutes(true);
      setMeetingMinutes(`Generating meeting minutes with ${aiProvider.toUpperCase()}...`);
      
      const command = aiProvider === 'ollama' ? 'generate_meeting_minutes_ollama' : 'generate_meeting_minutes';
      const result = await invoke<string>(command, { transcript });
      console.log("Meeting minutes generated:", result);
      
      setMeetingMinutes(result);
      
    } catch (error) {
      console.error("Failed to generate meeting minutes:", error);
      setMeetingMinutes("");
      showError(`Failed to generate meeting minutes with ${aiProvider.toUpperCase()}: ${error}`);
    } finally {
      setIsGeneratingMinutes(false);
    }
  };

  const saveMeetingMinutes = async () => {
    if (!meetingMinutes.trim()) {
      showError("No meeting minutes to save. Please generate meeting minutes first.");
      return;
    }

    try {
      clearError();
      const result = await invoke<string>("save_meeting_minutes", { 
        meetingMinutes: meetingMinutes,
        filename: null 
      });
      console.log("Meeting minutes saved:", result);
      showError(`Meeting minutes saved successfully!\n${result}`);
      
    } catch (error) {
      console.error("Error saving meeting minutes:", error);
      showError(`Error saving meeting minutes: ${error}`);
    }
  };

  const handleClearAll = () => {
    setRecordingTime(0);
    setTranscript("");
    setTranscriptionResult(null);
    setRealtimeTranscript("");
    setMeetingMinutes("");
    setLastRecordingPath("");
    setRecordingStatus("Not recording");
    clearError();
  };

  const testMicrophoneAccess = async () => {
    try {
      clearError();
      const result = await invoke<string>("test_microphone_access");
      console.log("Microphone test result:", result);
      showError(`✅ ${result}`);
    } catch (error) {
      console.error("Microphone test failed:", error);
      showError(`❌ Microphone test failed: ${error}`);
    }
  };

  const testAudioSystem = async () => {
    try {
      clearError();
      const result = await invoke<string>("test_audio_system");
      console.log("Audio system test result:", result);
      showError(`🔊 ${result}`);
    } catch (error) {
      console.error("Audio system test failed:", error);
      showError(`❌ Audio system test failed: ${error}`);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <span className="text-white text-xl">🎙️</span>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Meeting Recorder</h1>
                <p className="text-sm text-gray-500">Professional audio transcription</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className={`w-3 h-3 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                <span className="text-sm font-medium text-gray-700">
                  {isRecording ? 'Recording' : 'Ready'}
                </span>
              </div>
              {isRecording && (
                <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                  {recordingStatus}
                  {isRealtimeEnabled && " • Real-time ON"}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-400 p-4 mx-4 mt-4 rounded-r-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            </div>
            <button 
              onClick={clearError}
              className="text-red-400 hover:text-red-600 transition-colors"
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Recording Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 mb-8">
          <div className="text-center">
            {/* Timer */}
            <div className="mb-8">
              <div className="text-6xl font-mono font-bold text-gray-900 mb-2">
                {formatTime(recordingTime)}
              </div>
              <p className="text-gray-500">Recording Duration</p>
            </div>

            {/* Audio Indicator */}
            <div className="flex justify-center mb-8">
              <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center transition-all duration-300 ${
                isRecording 
                  ? 'border-red-500 bg-red-50 animate-pulse' 
                  : 'border-gray-300 bg-gray-50'
              }`}>
                <div className={`w-12 h-12 rounded-full transition-all duration-300 ${
                  isRecording ? 'bg-red-500' : 'bg-gray-400'
                }`}></div>
              </div>
            </div>

            {/* Controls */}
            <div className="flex flex-wrap justify-center gap-4">
              {!whisperInitialized && (
                <button 
                  className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 shadow-lg"
                  onClick={initializeWhisper}
                >
                  <span className="mr-2">⚡</span>
                  Initialize Whisper
                </button>
              )}
              
              {whisperInitialized && !isRecording && (
                <button
                  className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 shadow-lg ${
                    isRealtimeEnabled 
                      ? 'bg-green-500 hover:bg-green-600 text-white' 
                      : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                  }`}
                  onClick={toggleRealtimeTranscription}
                >
                  <span className="mr-2">{isRealtimeEnabled ? '🔴' : '⚡'}</span>
                  {isRealtimeEnabled ? 'Real-time ON' : 'Enable Real-time'}
                </button>
              )}
              
              <button
                className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 transform hover:scale-105 shadow-lg ${
                  isRecording 
                    ? 'bg-red-500 hover:bg-red-600 text-white' 
                    : 'bg-blue-500 hover:bg-blue-600 text-white'
                }`}
                onClick={isRecording ? stopRecording : startRecording}
              >
                <span className="mr-2">{isRecording ? '⏹️' : '▶️'}</span>
                {isRecording ? 'Stop Recording' : 'Start Recording'}
              </button>

              {lastRecordingPath && whisperInitialized && !isRecording && (
                <button 
                  className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                  onClick={transcribeAudio}
                  disabled={isTranscribing}
                >
                  <span className="mr-2">{isTranscribing ? '⏳' : '📝'}</span>
                  {isTranscribing ? 'Transcribing...' : 'Transcribe Audio'}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Transcript Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 mb-8">
          <div className="flex items-center mb-6">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
              <span className="text-blue-600">📝</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Transcript</h2>
          </div>
          
          <div className="space-y-6">
            {isRealtimeEnabled && isRecording && realtimeTranscript && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
                <div className="flex items-center mb-4">
                  <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-2"></div>
                  <h3 className="text-lg font-semibold text-green-800">Real-time (Live)</h3>
                </div>
                <div className="bg-white rounded-lg p-4 border border-green-200 min-h-[120px] max-h-[300px] overflow-y-auto">
                  <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                    {realtimeTranscript}
                  </p>
                </div>
              </div>
            )}
            
            <div>
              {(isRealtimeEnabled && isRecording) && (
                <h3 className="text-lg font-semibold text-gray-800 mb-4">Final Transcript with Timestamps</h3>
              )}
              <TranscriptionSegments 
                result={transcriptionResult} 
                isLoading={isTranscribing}
              />
            </div>
          </div>
        </div>

        {/* Meeting Minutes Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 mb-8">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                <span className="text-purple-600">🤖</span>
              </div>
              <h3 className="text-2xl font-bold text-gray-900">AI Meeting Minutes</h3>
            </div>
            {transcript && !isRecording && (
              <button 
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                onClick={generateMeetingMinutes}
                disabled={isGeneratingMinutes}
              >
                <span className="mr-2">✨</span>
                {isGeneratingMinutes ? 'Generating...' : 'Generate Minutes'}
              </button>
            )}
          </div>
          
          <div className="bg-gray-50 rounded-xl p-6 min-h-[200px] max-h-[500px] overflow-y-auto">
            {meetingMinutes ? (
              <div className="prose prose-gray max-w-none">
                <ReactMarkdown>{meetingMinutes}</ReactMarkdown>
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl text-gray-400">🤖</span>
                </div>
                <p className="text-gray-500">AI-generated meeting minutes will appear here after generating...</p>
              </div>
            )}
          </div>
          
          {meetingMinutes && (
            <div className="mt-6 flex justify-end">
              <button 
                className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 shadow-lg"
                onClick={saveMeetingMinutes}
              >
                <span className="mr-2">💾</span>
                Save Minutes
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
          <button 
            className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 shadow-lg"
            onClick={handleClearAll}
          >
            <span className="mr-2">🗑️</span>
            Clear All
          </button>
          <button 
            className="bg-slate-600 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 shadow-lg"
            onClick={toggleSettings}
          >
            <span className="mr-2">⚙️</span>
            Settings
          </button>
          <button 
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            onClick={handleSave}
            disabled={!transcript}
          >
            <span className="mr-2">💾</span>
            Save Files
          </button>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center mr-3">
                      <span className="text-slate-600">⚙️</span>
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">Settings</h3>
                  </div>
                  <button 
                    className="text-gray-400 hover:text-gray-600 transition-colors p-2"
                    onClick={() => setShowSettings(false)}
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              
              <div className="p-6 space-y-8">
                {/* Real-time Transcription */}
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-gray-800">Real-time Transcription</h4>
                  <label className="flex items-center space-x-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isRealtimeEnabled}
                      onChange={toggleRealtimeTranscription}
                      disabled={isRecording}
                      className="w-5 h-5 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                    />
                    <span className="text-gray-700 font-medium">⚡ Enable Real-time Transcription</span>
                  </label>
                </div>

                {/* AI Provider Selection */}
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-gray-800">🤖 AI Provider for Meeting Minutes</h4>
                  <div className="space-y-3">
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="radio"
                        name="aiProvider"
                        value="ollama"
                        checked={aiProvider === 'ollama'}
                        onChange={(e) => setAiProvider(e.target.value as 'openai' | 'ollama')}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 focus:ring-2"
                      />
                      <div className="flex-1">
                        <span className="text-gray-700 font-medium">🏠 Ollama (Local)</span>
                        <p className="text-sm text-gray-500">Private, runs locally on your device. Requires Ollama installation.</p>
                      </div>
                    </label>
                    <label className="flex items-center space-x-3 cursor-pointer">
                      <input
                        type="radio"
                        name="aiProvider"
                        value="openai"
                        checked={aiProvider === 'openai'}
                        onChange={(e) => setAiProvider(e.target.value as 'openai' | 'ollama')}
                        className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 focus:ring-2"
                      />
                      <div className="flex-1">
                        <span className="text-gray-700 font-medium">☁️ OpenAI (Cloud)</span>
                        <p className="text-sm text-gray-500">Fast and reliable. Requires API key and sends transcript to OpenAI.</p>
                      </div>
                    </label>
                  </div>
                  
                  {aiProvider === 'ollama' && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-start space-x-2">
                        <span className="text-green-600 text-lg">🔒</span>
                        <div>
                          <h5 className="font-medium text-green-900">Privacy First</h5>
                          <p className="text-sm text-green-700 mt-1">
                            Your transcript never leaves your device. Requires Ollama to be running locally.
                          </p>
                          <p className="text-xs text-green-600 mt-2">
                            💡 Make sure Ollama is installed and running with a model like llama3.1:8b
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {aiProvider === 'openai' && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                      <div className="flex items-start space-x-2">
                        <span className="text-yellow-600 text-lg">⚠️</span>
                        <div>
                          <h5 className="font-medium text-yellow-900">Privacy Notice</h5>
                          <p className="text-sm text-yellow-700 mt-1">
                            Transcript text will be sent to OpenAI for processing. Requires valid API key.
                          </p>
                          <p className="text-xs text-yellow-600 mt-2">
                            💡 Set OPENAI_API_KEY in your .env file
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Language Selection */}
                <div className="space-y-4">
                  <h4 className="text-lg font-semibold text-gray-800">🌍 Transcription Language</h4>
                  <div className="space-y-2">
                    <label htmlFor="language-select" className="block text-sm font-medium text-gray-700">
                      Select Language for Transcription:
                    </label>
                    <select
                      id="language-select"
                      value={selectedLanguage}
                      onChange={(e) => setSelectedLanguage(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    >
                      {supportedLanguages.map((lang) => (
                        <option key={lang.code} value={lang.code}>
                          {lang.name}
                        </option>
                      ))}
                    </select>
                    <div className="text-xs text-gray-500 mt-1">
                      💡 Choose "Auto-detect" to let Whisper automatically identify the language, or select a specific language for better accuracy.
                    </div>
                  </div>
                  
                  {selectedLanguage === 'id' && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-start space-x-2">
                        <span className="text-green-600 text-lg">🇮🇩</span>
                        <div>
                          <h5 className="font-medium text-green-900">Indonesian Language Support</h5>
                          <p className="text-sm text-green-700 mt-1">
                            Optimized for Indonesian (Bahasa Indonesia) transcription. Works best with multilingual Whisper models.
                          </p>
                          <p className="text-xs text-green-600 mt-2">
                            💡 Recommended models: Large V3, Medium, or Small (avoid Turbo for best accuracy)
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {selectedLanguage === 'auto' && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-start space-x-2">
                        <span className="text-blue-600 text-lg">🔍</span>
                        <div>
                          <h5 className="font-medium text-blue-900">Auto-detect Language</h5>
                          <p className="text-sm text-blue-700 mt-1">
                            Whisper will automatically detect the spoken language. This works well for most languages but may be less accurate than specifying the exact language.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Audio Gain Settings */}
                <div className="space-y-6">
                  <h4 className="text-lg font-semibold text-gray-800">🎚️ Audio Gain Settings</h4>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="mic-gain" className="block text-sm font-medium text-gray-700">
                        🎤 Microphone Gain: <span className="text-blue-600 font-semibold">{micGain.toFixed(1)}</span>
                      </label>
                      <input
                        id="mic-gain"
                        type="range"
                        min="0.1"
                        max="5.0"
                        step="0.1"
                        value={micGain}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value);
                          updateGainSettings(newValue, systemGain);
                        }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <label htmlFor="system-gain" className="block text-sm font-medium text-gray-700">
                        🔊 System Audio Gain: <span className="text-blue-600 font-semibold">{systemGain.toFixed(1)}</span>
                      </label>
                      <input
                        id="system-gain"
                        type="range"
                        min="0.1"
                        max="5.0"
                        step="0.1"
                        value={systemGain}
                        onChange={(e) => {
                          const newValue = parseFloat(e.target.value);
                          updateGainSettings(micGain, newValue);
                        }}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
                      />
                    </div>
                    
                    <div className="flex flex-wrap gap-2 pt-2">
                      <button 
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        onClick={() => updateGainSettings(1.0, 1.0)}
                      >
                        Normal (1.0/1.0)
                      </button>
                      <button 
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        onClick={() => updateGainSettings(2.0, 1.5)}
                      >
                        Boost (2.0/1.5)
                      </button>
                      <button 
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        onClick={() => updateGainSettings(3.0, 2.0)}
                      >
                        High (3.0/2.0)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Audio Device Selection */}
                <div className="space-y-6">
                  <h4 className="text-lg font-semibold text-gray-800">🎤 Audio Device Selection</h4>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="mic-device" className="block text-sm font-medium text-gray-700">
                        Microphone Device:
                      </label>
                      <select
                        id="mic-device"
                        value={selectedMicDevice || ''}
                        onChange={(e) => {
                          const value = e.target.value || null;
                          updateSelectedDevices(value, selectedSystemDevice);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">Use Default</option>
                        {availableDevices.input_devices.map((device, index) => (
                          <option key={index} value={device.name}>
                            {device.name}{device.is_default ? ' (Default)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div className="space-y-2">
                      <label htmlFor="system-device" className="block text-sm font-medium text-gray-700">
                        System Audio Capture:
                      </label>
                      <select
                        id="system-device"
                        value={selectedSystemDevice || ''}
                        onChange={(e) => {
                          const value = e.target.value || null;
                          updateSelectedDevices(selectedMicDevice, value);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                      >
                        <option value="">🔍 Auto-detect (Recommended)</option>
                        {/* Loopback devices (preferred for system audio) */}
                        {availableDevices.input_devices
                          .filter(device => device.device_type === 'system_audio')
                          .map((device, index) => (
                            <option key={`loopback-${index}`} value={device.name}>
                              🔄 {device.name} (Loopback Device)
                            </option>
                          ))}
                        {/* Output devices (fallback) */}
                        {availableDevices.output_devices.map((device, index) => (
                          <option key={`output-${index}`} value={device.name}>
                            🔊 {device.name}{device.is_default ? ' (Current Output)' : ''}
                          </option>
                        ))}
                      </select>
                      <div className="text-xs text-gray-500 mt-1">
                        💡 The system will capture audio from <strong>one</strong> source. Auto-detect finds the best available loopback device.
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h5 className="font-medium text-blue-900 mb-2">🎯 Active Audio Sources:</h5>
                    <div className="space-y-1 text-sm text-blue-800">
                      <p>🎤 Microphone Input: <span className="font-medium">{selectedMicDevice || 'Default device'}</span></p>
                      <p>🔊 System Audio Capture: <span className="font-medium">{selectedSystemDevice || 'Auto-detecting best source'}</span></p>
                    </div>
                    <div className="mt-2 text-xs text-blue-600">
                      ℹ️ Both sources are mixed into a single recording
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-3">
                    <button 
                      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                      onClick={loadAudioDevices}
                    >
                      <span className="mr-2">🔄</span>
                      Refresh Devices
                    </button>
                    
                    <button 
                      className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                      onClick={testMicrophoneAccess}
                    >
                      <span className="mr-2">🧪</span>
                      Test Microphone
                    </button>
                    
                    <button 
                      className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                      onClick={testAudioSystem}
                    >
                      <span className="mr-2">🔊</span>
                      Test Audio System
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-6 text-gray-500 text-sm bg-white rounded-2xl shadow-lg border border-gray-200">
          <p>📁 Files saved to: <span className="font-mono">Documents/MeetingRecordings/meeting_{new Date().toISOString().slice(0, 10)}_*</span></p>
        </div>
    </main>
      </div>
    );
  }

  export default App;
