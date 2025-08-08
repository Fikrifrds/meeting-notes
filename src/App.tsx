import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import TranscriptionSegments, { TranscriptionResult } from './components/TranscriptionSegments';
import MeetingsManager from "./components/MeetingsManager";
import { 
  Mic, 
  Square, 
  Play, 
  FileText, 
  Bot, 
  Sparkles, 
  Trash2, 
  Settings, 
  X,
  Heart, 
  Zap, 
  RefreshCw, 
  TestTube, 
  Volume2, 
  Folder, 
  Upload,
  Sliders,
  Target,
  Info
} from 'lucide-react';
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
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [lastRecordingPath, setLastRecordingPath] = useState("");
  const [isRealtimeEnabled, setIsRealtimeEnabled] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState("Not recording");
  const [realtimeTranscript, setRealtimeTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [currentView, setCurrentView] = useState<'recording' | 'meetings'>('recording');
  const [meetingMinutes, setMeetingMinutes] = useState("");
  const [isGeneratingMinutes, setIsGeneratingMinutes] = useState(false);
  const [micGain, setMicGain] = useState(2.5);
  const [systemGain, setSystemGain] = useState(1.5);
  const [selectedLanguage, setSelectedLanguage] = useState('en'); // Default to English
  const [currentMeetingId, setCurrentMeetingId] = useState<string | null>(null); // Track current meeting
  
  // Audio file upload state
  const [isUploadingAudio, setIsUploadingAudio] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // AI-generated metadata state
  const [parsedMetadata, setParsedMetadata] = useState<{
    keyTopics: string[];
    sentiment: string;
    energy: string;
    cleanedMinutes: string;
  } | null>(null);
  
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
      // Auto-initialize Whisper and database
      autoInitialize();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);

  // Function to trigger file input
  const triggerFileUpload = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  // Audio file upload handler
  const handleAudioUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file type
    const allowedTypes = ['audio/wav', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a'];
    if (!allowedTypes.includes(file.type) && !file.name.match(/\.(wav|mp3|mp4|m4a)$/i)) {
      showError("Please select a valid audio file (WAV, MP3, MP4, M4A)");
      return;
    }

    try {
      setIsUploadingAudio(true);
      setTranscript("");
      setTranscriptionResult(null);
      setMeetingMinutes("");
      setTranscriptionProgress(0);
      
      // Create a temporary file path for the uploaded audio
      const tempPath = await invoke<string>("save_uploaded_audio", { 
        fileName: file.name,
        fileData: Array.from(new Uint8Array(await file.arrayBuffer()))
      });
      
      setLastRecordingPath(tempPath);
      showError("Audio file uploaded successfully! Starting automatic transcription...");
      
      // Create a new meeting for the uploaded audio
      const meetingResult = await invoke<{id: string}>("save_transcript_to_database", {
        title: `Uploaded Audio - ${file.name} - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        transcript: "Processing uploaded audio...",
        segments: [],
        language: selectedLanguage === 'auto' ? null : selectedLanguage,
        audioFilePath: tempPath
      });
      
      setCurrentMeetingId(meetingResult.id);
      console.log("Meeting created for uploaded audio with ID:", meetingResult.id);
      
      // Automatically start transcription
      await autoTranscribeUploadedAudio(tempPath, meetingResult.id);
      
    } catch (error) {
      console.error("Failed to upload audio file:", error);
      showError(`Failed to upload audio file: ${error}`);
    } finally {
      setIsUploadingAudio(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Auto-initialize Whisper and database
  const autoInitialize = async () => {
    try {
      // Initialize database
      await invoke("initialize_database");
      console.log("Database auto-initialized");
      
      // Initialize Whisper
      await initializeWhisper();
      console.log("Whisper auto-initialized");
    } catch (error) {
      console.error("Auto-initialization failed:", error);
      showError(`Auto-initialization failed: ${error}`);
    }
  };

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

  // Parse metadata when meeting minutes change
  useEffect(() => {
    if (meetingMinutes) {
      parseMetadata(meetingMinutes);
    } else {
      setParsedMetadata(null);
    }
  }, [meetingMinutes]);

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

  // Define the StartRecordingResult interface to match the new response
  interface StartRecordingResult {
    message: string;
    meeting_id: string;
    audio_file_path: string;
  }

  const startRecording = async () => {
    try {
      clearError();
      setIsRecording(true);
      setRecordingTime(0);
      setTranscript("");
      setRealtimeTranscript("");
      setMeetingMinutes("");
      setCurrentMeetingId(null); // Clear previous meeting ID
      
      const result = await invoke<StartRecordingResult>("start_recording");
      console.log("Recording started:", result);
      
      // Store the meeting ID and audio file path from the start
      setCurrentMeetingId(result.meeting_id);
      setLastRecordingPath(result.audio_file_path);
      
      console.log("Meeting created with ID:", result.meeting_id);
      console.log("Audio will be saved to:", result.audio_file_path);
      
    } catch (error) {
      console.error("Failed to start recording:", error);
      setIsRecording(false);
      showError(`Failed to start recording: ${error}`);
    }
  };

  // Define the RecordingResult interface to match the Rust struct
  interface RecordingResult {
    success: boolean;
    message: string;
    audio_file_path: string | null;
    duration_seconds: number;
    sample_count: number;
  }

  const stopRecording = async () => {
    try {
      clearError();
      const result = await invoke<RecordingResult>("stop_recording");
      console.log("Recording stopped:", result);
      
      setIsRecording(false);
      
      // Use the structured response instead of parsing a message string
      if (result.success && result.audio_file_path) {
        setLastRecordingPath(result.audio_file_path);
        
        try {
          // Auto-transcribe and save to database
          await autoTranscribeAndSave(result.audio_file_path);
        } catch (autoSaveError) {
          console.error("Auto-transcribe and save failed:", autoSaveError);
          showError(`WARNING: Auto-transcription failed, but meeting was already created with ID: ${currentMeetingId}. You can transcribe manually later.`);
        }
      } else {
        showError(`Recording stopped but no audio file was saved: ${result.message}`);
      }
      
    } catch (error) {
      console.error("Failed to stop recording:", error);
      setIsRecording(false);
      showError(`Failed to stop recording: ${error}`);
    }
  };

  // Auto-transcribe uploaded audio and save to database
  const autoTranscribeUploadedAudio = async (audioPath: string, meetingId: string) => {
    const languageParam = selectedLanguage === 'auto' ? null : selectedLanguage;
    
    try {
      setIsTranscribing(true);
      setTranscriptionProgress(0);
      setTranscript("Starting transcription...");
      
      // Start progress simulation
      const progressInterval = setInterval(() => {
        setTranscriptionProgress(prev => {
          if (prev < 90) {
            return prev + Math.random() * 10;
          }
          return prev;
        });
      }, 500);
      
      // Transcribe audio
      const transcriptionResult = await invoke<TranscriptionResult>("transcribe_audio_with_segments", { 
        audioPath: audioPath,
        language: languageParam 
      });
      
      // Complete progress
      clearInterval(progressInterval);
      setTranscriptionProgress(100);
      
      setTranscript(transcriptionResult.full_text);
      setTranscriptionResult(transcriptionResult);
      
      // Update the meeting with transcript
      const savedMeeting = await invoke<{id: string}>("update_meeting_transcript", {
        meetingId: meetingId,
        title: `Uploaded Audio - ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
        transcript: transcriptionResult.full_text,
        segments: transcriptionResult.segments,
        language: languageParam,
        audioFilePath: audioPath
      });
      
      console.log("Uploaded audio transcribed and saved:", savedMeeting);
      showError("SUCCESS: Audio uploaded and transcribed automatically! Meeting saved to database.");
      
    } catch (error) {
      console.error("Auto-transcription of uploaded audio failed:", error);
      showError(`Transcription failed: ${error}`);
    } finally {
      setIsTranscribing(false);
      setTranscriptionProgress(0);
    }
  };

  // Auto-transcribe and save to database
  const autoTranscribeAndSave = async (audioPath: string) => {
    if (!currentMeetingId) {
      console.error("No meeting ID available for saving transcript");
      showError("No meeting ID available. Please start a new recording.");
      return;
    }

    const languageParam = selectedLanguage === 'auto' ? null : selectedLanguage;
    
    try {
      setIsTranscribing(true);
      setTranscriptionProgress(0);
      setTranscript("Auto-transcribing audio...");
      
      // Start progress simulation
      const progressInterval = setInterval(() => {
        setTranscriptionProgress(prev => {
          if (prev < 90) {
            return prev + Math.random() * 10;
          }
          return prev;
        });
      }, 500);
      
      // Transcribe audio
      const transcriptionResult = await invoke<TranscriptionResult>("transcribe_audio_with_segments", { 
        audioPath: audioPath,
        language: languageParam 
      });
      
      // Complete progress
      clearInterval(progressInterval);
      setTranscriptionProgress(100);
      
      setTranscript(transcriptionResult.full_text);
      setTranscriptionResult(transcriptionResult);
      
      // Update the existing meeting with transcript and audio path
      const savedMeeting = await invoke<{id: string}>("update_meeting_transcript", {
         meetingId: currentMeetingId,
         title: `Meeting ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
         transcript: transcriptionResult.full_text,
         segments: transcriptionResult.segments,
         language: languageParam,
         audioFilePath: audioPath
       });
       
       console.log("Transcript auto-saved to database:", savedMeeting);
       showError("SUCCESS: Recording transcribed and saved to database automatically!");
      
    } catch (error) {
      console.error("Auto-transcription failed:", error);
      
      // Even if transcription fails, update the meeting with audio path
      try {
        const savedMeeting = await invoke<{id: string}>("update_meeting_transcript", {
          meetingId: currentMeetingId,
          title: `Meeting ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`,
          transcript: "Transcription failed - audio file available",
          segments: [],
          language: languageParam,
          audioFilePath: audioPath
        });
        
        console.log("Meeting updated with audio path despite transcription failure:", savedMeeting);
        showError(`WARNING: Transcription failed, but meeting saved with audio file: ${error}`);
      } catch (saveError) {
        console.error("Failed to update meeting with audio path:", saveError);
        showError(`Auto-transcription failed: ${error}. Also failed to update meeting: ${saveError}`);
      }
    } finally {
      setIsTranscribing(false);
      setTranscriptionProgress(0);
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
      setTranscriptionProgress(0);
      setTranscript("Processing audio file...");
      setTranscriptionResult(null);
      
      // Start progress simulation
      const progressInterval = setInterval(() => {
        setTranscriptionProgress(prev => {
          if (prev < 90) {
            return prev + Math.random() * 10;
          }
          return prev;
        });
      }, 500);
      
      // Pass language parameter to backend
      const languageParam = selectedLanguage === 'auto' ? null : selectedLanguage;
      const result = await invoke<TranscriptionResult>("transcribe_audio_with_segments", { 
        audioPath: lastRecordingPath,
        language: languageParam 
      });
      console.log("Transcription result:", result);
      
      // Complete progress
      clearInterval(progressInterval);
      setTranscriptionProgress(100);
      
      setTranscript(result.full_text);
      setTranscriptionResult(result);
      
    } catch (error) {
      console.error("Failed to transcribe audio:", error);
      setTranscript("");
      setTranscriptionResult(null);
      showError(`Failed to transcribe audio: ${error}`);
    } finally {
      setIsTranscribing(false);
      setTranscriptionProgress(0);
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
      setMeetingMinutes(`Generating meeting minutes with OpenAI...`);
      
      const languageParam = selectedLanguage === 'auto' ? null : selectedLanguage;
      const result = await invoke<string>('generate_meeting_minutes', { 
        transcript,
        language: languageParam 
      });
      console.log("Meeting minutes generated:", result);
      
      setMeetingMinutes(result);
      
      // Auto-save meeting minutes to database
      await autoSaveMeetingMinutes(result);
      
    } catch (error) {
      console.error("Failed to generate meeting minutes:", error);
      setMeetingMinutes("");
      showError(`Failed to generate meeting minutes with OpenAI: ${error}`);
    } finally {
      setIsGeneratingMinutes(false);
    }
  };

  // Auto-save meeting minutes to database
  const autoSaveMeetingMinutes = async (minutes: string) => {
    if (!currentMeetingId) {
      console.warn("No current meeting ID available for saving minutes");
      return;
    }
    
    try {
      await invoke("save_meeting_minutes_to_database", {
        meetingId: currentMeetingId,
        meetingMinutes: minutes,
        aiProvider: 'openai'
      });
      
      console.log("Meeting minutes auto-saved to database");
      showError("SUCCESS: Meeting minutes generated and saved to database automatically!");
      
    } catch (error) {
      console.error("Failed to auto-save meeting minutes:", error);
      showError(`Failed to auto-save meeting minutes: ${error}`);
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
    setCurrentMeetingId(null);
    clearError();
  };

  // Parse AI-generated metadata from meeting minutes
  const parseMetadata = (meetingMinutes: string) => {
    if (!meetingMinutes) {
      setParsedMetadata(null);
      return;
    }

    // Look for the metadata section at the end
    const metadataMatch = meetingMinutes.match(/---\s*\nKEY_TOPICS:\s*(.+)\s*\nSENTIMENT:\s*(.+)\s*\nENERGY:\s*(.+)\s*$/);
    
    if (metadataMatch) {
      const [, keyTopicsStr, sentiment, energy] = metadataMatch;
      const keyTopics = keyTopicsStr.split(',').map(topic => topic.trim()).filter(Boolean);
      
      // Remove the metadata section from the minutes for clean display
      const cleanedMinutes = meetingMinutes.replace(/---\s*\nKEY_TOPICS:[\s\S]*$/, '').trim();
      
      setParsedMetadata({
        keyTopics,
        sentiment: sentiment.trim(),
        energy: energy.trim(),
        cleanedMinutes
      });
    } else {
      // Fallback for older format or if parsing fails
    }
  };

  const testMicrophoneAccess = async () => {
    try {
      clearError();
      const result = await invoke<string>("test_microphone_access");
      console.log("Microphone test result:", result);
      showError(`SUCCESS: ${result}`);
    } catch (error) {
      console.error("Microphone test failed:", error);
      showError(`ERROR: Microphone test failed: ${error}`);
    }
  };

  const testAudioSystem = async () => {
    try {
      clearError();
      const result = await invoke<string>("test_audio_system");
      console.log("Audio system test result:", result);
      showError(`AUDIO: ${result}`);
    } catch (error) {
      console.error("Audio system test failed:", error);
      showError(`ERROR: Audio system test failed: ${error}`);
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white/95 backdrop-blur-lg border-b border-gray-100 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-3">
          {/* Top Row */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <Mic className="text-white w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">Meeting Recorder</h1>
                <p className="text-xs text-gray-500">Professional audio transcription</p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Quick Settings */}
              <div className="flex items-center space-x-3">
                {/* Language Selector */}
                <div className="relative">
                  <select
                    value={selectedLanguage}
                    onChange={(e) => setSelectedLanguage(e.target.value)}
                    className="appearance-none bg-white border border-gray-200 rounded-lg px-3 py-2 pr-8 text-sm text-gray-700 font-medium hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all cursor-pointer"
                  >
                    {supportedLanguages.map((lang) => (
                      <option key={lang.code} value={lang.code}>
                        {lang.name}
                      </option>
                    ))}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* AI Provider Info */}
                <div className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  Using OpenAI for meeting minutes generation
                </div>
              </div>

              {/* Settings Button */}
              <button 
                className="text-gray-600 hover:text-gray-900 p-2 hover:bg-gray-100 rounded-lg transition-colors"
                onClick={toggleSettings}
                title="Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          {/* Bottom Row */}
          <div className="flex items-center justify-between">
            {/* Navigation Tabs */}
            <div className="flex items-center space-x-1 bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setCurrentView('recording')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
                  currentView === 'recording'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Mic className="w-4 h-4" />
                <span>Recording</span>
              </button>
              <button
                onClick={() => setCurrentView('meetings')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
                  currentView === 'meetings'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <FileText className="w-4 h-4" />
                <span>Meetings</span>
              </button>
            </div>
            
            {/* Status Indicator */}
            <div className="flex items-center space-x-3">
              {isRecording && (
                <div className="text-xs text-gray-500 bg-orange-100 text-orange-700 px-3 py-1 rounded-full border border-orange-200">
                  {recordingStatus}
                  {isRealtimeEnabled && " • Real-time"}
                </div>
              )}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                <span className="text-sm font-medium text-gray-700">
                  {isRecording ? 'Recording' : 'Ready'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Message Banner */}
      {error && (
        <div className={`border-l-4 p-4 mx-4 mt-4 rounded-r-lg ${
          error.startsWith('SUCCESS') || error.startsWith('AUDIO') 
            ? 'bg-green-50 border-green-400' 
            : 'bg-red-50 border-red-400'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                {error.startsWith('SUCCESS') || error.startsWith('AUDIO') ? (
                  <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <div className="ml-3">
                <p className={`text-sm ${
                  error.startsWith('SUCCESS') || error.startsWith('AUDIO') 
                    ? 'text-green-700' 
                    : 'text-red-700'
                }`}>{error}</p>
              </div>
            </div>
            <button 
              onClick={clearError}
              className={`transition-colors ${
                error.startsWith('SUCCESS') || error.startsWith('AUDIO') 
                  ? 'text-green-400 hover:text-green-600' 
                  : 'text-red-400 hover:text-red-600'
              }`}
            >
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {currentView === 'meetings' ? (
          <MeetingsManager />
        ) : (
          <>
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
            <div className="space-y-6">
              {/* Initialization Button */}
              {!whisperInitialized && (
                <div className="flex justify-center">
                  <button 
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white px-8 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 shadow-lg flex items-center"
                    onClick={initializeWhisper}
                  >
                    <Zap className="w-5 h-5 mr-2" />
                    Initialize Whisper
                  </button>
                </div>
              )}

              {/* Main Recording Controls */}
              {whisperInitialized && (
                <>
                  {/* Primary Controls */}
                  <div className="flex justify-center">
                    <button
                      className={`px-12 py-4 rounded-xl font-semibold text-lg transition-all duration-200 transform hover:scale-105 shadow-xl flex items-center ${
                        isRecording 
                          ? 'bg-red-500 hover:bg-red-600 text-white' 
                          : 'bg-blue-500 hover:bg-blue-600 text-white'
                      }`}
                      onClick={isRecording ? stopRecording : startRecording}
                    >
                      {isRecording ? (
                        <Square className="w-6 h-6 mr-3" />
                      ) : (
                        <Play className="w-6 h-6 mr-3" />
                      )}
                      {isRecording ? 'Stop Recording' : 'Start Recording'}
                    </button>
                  </div>

                  {/* Secondary Controls */}
                  {!isRecording && (
                    <div className="flex flex-wrap justify-center gap-3">
                      {/* Audio File Upload */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="audio/*,.wav,.mp3,.mp4,.m4a"
                        onChange={handleAudioUpload}
                        className="hidden"
                        disabled={isUploadingAudio}
                      />
                      <button 
                        className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white px-5 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                        onClick={triggerFileUpload}
                        disabled={isUploadingAudio}
                      >
                        <Upload className="w-4 h-4 mr-2" />
                        {isUploadingAudio ? 'Uploading...' : 'Upload Audio File'}
                      </button>
                      
                      <button
                        className={`px-5 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-lg flex items-center ${
                          isRealtimeEnabled 
                            ? 'bg-orange-500 hover:bg-orange-600 text-white' 
                            : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                        }`}
                        onClick={toggleRealtimeTranscription}
                      >
                        {isRealtimeEnabled ? (
                          <div className="w-3 h-3 bg-red-400 rounded-full mr-2 animate-pulse"></div>
                        ) : (
                          <Zap className="w-4 h-4 mr-2" />
                        )}
                        {isRealtimeEnabled ? 'Real-time ON' : 'Enable Real-time'}
                      </button>

                      {lastRecordingPath && !transcript && (
                        <button 
                          className="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                          onClick={transcribeAudio}
                          disabled={isTranscribing}
                        >
                          {isTranscribing ? (
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                          ) : (
                            <FileText className="w-4 h-4 mr-2" />
                          )}
                          {isTranscribing ? `Transcribing... ${Math.round(transcriptionProgress)}%` : 'Transcribe Audio'}
                        </button>
                      )}

                      {(transcript || lastRecordingPath) && (
                        <button 
                          className="bg-gray-500 hover:bg-gray-600 text-white px-5 py-2.5 rounded-lg font-medium transition-all duration-200 shadow-lg flex items-center"
                          onClick={handleClearAll}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Clear All
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Transcript Section */}
        <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8 mb-8">
          <div className="flex items-center mb-6">
            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
              <FileText className="text-blue-600 w-5 h-5" />
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
            
            {isTranscribing && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <RefreshCw className="w-5 h-5 text-blue-600 animate-spin mr-2" />
                    <h3 className="text-lg font-semibold text-blue-800">Processing Transcription</h3>
                  </div>
                  <span className="text-sm font-medium text-blue-700">{Math.round(transcriptionProgress)}%</span>
                </div>
                <div className="w-full bg-blue-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${transcriptionProgress}%` }}
                  ></div>
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
                <Bot className="text-purple-600 w-5 h-5" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900">AI Meeting Minutes</h3>
            </div>
            {transcript && !isRecording && (
              <button 
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 transform hover:scale-105 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center"
                onClick={generateMeetingMinutes}
                disabled={isGeneratingMinutes}
              >
                <Sparkles className="w-4 h-4 mr-2" />
                {isGeneratingMinutes ? 'Generating...' : 'Generate Minutes'}
              </button>
            )}
          </div>
          
          <div className="bg-gray-50 rounded-xl p-6 min-h-[200px] max-h-[500px] overflow-y-auto">
            {meetingMinutes ? (
              <div className="text-gray-800 leading-normal prose prose-sm max-w-none prose-headings:text-gray-900 prose-h1:text-xl prose-h1:font-bold prose-h1:mb-4 prose-h1:mt-6 prose-h2:text-lg prose-h2:font-semibold prose-h2:mb-3 prose-h2:mt-5 prose-h3:text-base prose-h3:font-medium prose-h3:mb-2 prose-h3:mt-4 prose-p:text-gray-700 prose-p:mb-3 prose-li:text-gray-700 prose-strong:text-gray-900 prose-table:text-sm prose-ul:mb-4 prose-ol:mb-4">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: ({ children }) => (
                      <h1 className="text-xl font-bold text-gray-900 mb-4 mt-6 first:mt-0">
                        {children}
                      </h1>
                    ),
                    h2: ({ children }) => (
                      <h2 className="text-lg font-semibold text-gray-900 mb-3 mt-5 first:mt-0">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-base font-medium text-gray-900 mb-2 mt-4 first:mt-0">
                        {children}
                      </h3>
                    ),
                    p: ({ children }) => (
                      <p className="text-gray-700 mb-3 leading-relaxed">
                        {children}
                      </p>
                    ),
                    ul: ({ children }) => (
                      <ul className="list-disc pl-6 mb-4 space-y-1">
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol className="list-decimal pl-6 mb-4 space-y-1">
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li className="text-gray-700 leading-relaxed">
                        {children}
                      </li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-gray-900">
                        {children}
                      </strong>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-blue-300 pl-4 py-2 my-4 bg-blue-50 italic text-gray-700">
                        {children}
                      </blockquote>
                    ),
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-4">
                        <table className="min-w-full divide-y divide-gray-200 border border-gray-300 rounded-lg">
                          {children}
                        </table>
                      </div>
                    ),
                    thead: ({ children }) => (
                      <thead className="bg-gray-50">
                        {children}
                      </thead>
                    ),
                    tbody: ({ children }) => (
                      <tbody className="bg-white divide-y divide-gray-200">
                        {children}
                      </tbody>
                    ),
                    tr: ({ children }) => (
                      <tr className="hover:bg-gray-50">
                        {children}
                      </tr>
                    ),
                    th: ({ children }) => (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider border-r border-gray-200 last:border-r-0">
                        {children}
                      </th>
                    ),
                    td: ({ children }) => (
                      <td className="px-4 py-3 text-sm text-gray-900 border-r border-gray-200 last:border-r-0">
                        {children}
                      </td>
                    ),
                  }}
                >
                  {parsedMetadata?.cleanedMinutes || meetingMinutes}
                </ReactMarkdown>
                
                {parsedMetadata && (
                  <div className="space-y-2 mt-6">
                    <h4 className="font-semibold text-base">Key Topics:</h4>
                    <div className="flex flex-wrap gap-2">
                      {parsedMetadata.keyTopics.map((topic) => (
                        <span key={topic} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                          {topic}
                        </span>
                      ))}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm">
                      <span className="flex items-center gap-2">
                        <span>Sentiment:</span>
                        <span className="flex items-center gap-1">
                           {parsedMetadata.sentiment === 'Positive' && <Heart className="w-4 h-4 text-green-500" />}
                           {parsedMetadata.sentiment === 'Neutral' && <div className="w-4 h-4 bg-yellow-500 rounded-full"></div>}
                           {parsedMetadata.sentiment === 'Negative' && <X className="w-4 h-4 text-red-500" />}
                           <span className="font-medium">{parsedMetadata.sentiment}</span>
                         </span>
                      </span>
                      <span className="text-gray-400">|</span>
                      <span className="flex items-center gap-2">
                        <span>Energy:</span>
                        <span className="font-medium">{parsedMetadata.energy}</span>
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Bot className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-gray-500">AI-generated meeting minutes will appear here after generating...</p>
              </div>
            )}
          </div>
          

        </div>


        {/* Settings Panel */}
        {showSettings && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-2xl">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center mr-3">
                      <Settings className="text-slate-600 w-5 h-5" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">Settings</h3>
                  </div>
                  <button 
                    className="text-gray-400 hover:text-gray-600 transition-colors p-2"
                    onClick={() => setShowSettings(false)}
                  >
                    <X className="w-6 h-6" />
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
                    <span className="text-gray-700 font-medium flex items-center">
                      <Zap className="w-4 h-4 mr-2" />
                      Enable Real-time Transcription
                    </span>
                  </label>
                </div>


                {/* Audio Gain Settings */}
                <div className="space-y-6">
                  <h4 className="text-lg font-semibold text-gray-800 flex items-center">
                    <Sliders className="w-5 h-5 mr-2" />
                    Audio Gain Settings
                  </h4>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label htmlFor="mic-gain" className="block text-sm font-medium text-gray-700 flex items-center">
                        <Mic className="w-4 h-4 mr-2" />
                        Microphone Gain: <span className="text-blue-600 font-semibold">{micGain.toFixed(1)}</span>
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
                      <label htmlFor="system-gain" className="block text-sm font-medium text-gray-700 flex items-center">
                        <Volume2 className="w-4 h-4 mr-2" />
                        System Audio Gain: <span className="text-blue-600 font-semibold">{systemGain.toFixed(1)}</span>
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
                  <h4 className="text-lg font-semibold text-gray-800 flex items-center">
                    <Mic className="w-5 h-5 mr-2" />
                    Audio Device Selection
                  </h4>
                  
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
                      <div className="text-xs text-gray-500 mt-1 flex items-center">
                        <Info className="w-3 h-3 mr-1" />
                        The system will capture audio from <strong>one</strong> source. Auto-detect finds the best available loopback device.
                      </div>
                    </div>
                  </div>
                  
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h5 className="font-medium text-blue-900 mb-2 flex items-center">
                      <Target className="w-4 h-4 mr-2" />
                      Active Audio Sources:
                    </h5>
                    <div className="space-y-1 text-sm text-blue-800">
                      <p className="flex items-center">
                        <Mic className="w-3 h-3 mr-2" />
                        Microphone Input: <span className="font-medium ml-1">{selectedMicDevice || 'Default device'}</span>
                      </p>
                      <p className="flex items-center">
                        <Volume2 className="w-3 h-3 mr-2" />
                        System Audio Capture: <span className="font-medium ml-1">{selectedSystemDevice || 'Auto-detecting best source'}</span>
                      </p>
                    </div>
                    <div className="mt-2 text-xs text-blue-600 flex items-center">
                      <Info className="w-3 h-3 mr-1" />
                      Both sources are mixed into a single recording
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-3">
                    <button 
                      className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center"
                      onClick={loadAudioDevices}
                    >
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Refresh Devices
                    </button>
                    
                    <button 
                      className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center"
                      onClick={testMicrophoneAccess}
                    >
                      <TestTube className="w-4 h-4 mr-2" />
                      Test Microphone
                    </button>
                    
                    <button 
                      className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center"
                      onClick={testAudioSystem}
                    >
                      <Volume2 className="w-4 h-4 mr-2" />
                      Test Audio System
                    </button>
                    
                    {/* <button 
                      className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center"
                      onClick={updateAudioPaths}
                    >
                      <Wrench className="w-4 h-4 mr-2" />
                      Fix Audio Paths
                    </button> */}
{/*                     
                    <button 
                      className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg font-medium transition-colors flex items-center"
                      onClick={debugAudioPaths}
                    >
                      <Search className="w-4 h-4 mr-2" />
                      Debug Audio Paths
                    </button> */}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
          </>
        )}

        {/* Footer */}
        <div className="text-center py-6 text-gray-500 text-sm bg-white rounded-2xl shadow-lg border border-gray-200">
          <p className="flex items-center justify-center">
            <Folder className="w-4 h-4 mr-2" />
            Files saved to: <span className="font-mono ml-1">Documents/MeetingRecorder/MeetingRecordings/meeting_{new Date().toISOString().slice(0, 10)}_*</span>
          </p>
        </div>
    </main>
      </div>
    );
  }

  export default App;
