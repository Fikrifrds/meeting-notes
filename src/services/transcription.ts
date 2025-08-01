import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createAssemblyAIService, AssemblyAIService } from './assemblyai';

export type TranscriptionMode = 'basic' | 'advanced';

export interface TranscriptionConfig {
  mode: TranscriptionMode;
  assemblyAIApiKey?: string;
  enableSpeakerDiarization?: boolean;
}

export class TranscriptionService {
  private mode: TranscriptionMode;
  private assemblyAIService?: AssemblyAIService;
  private assemblyAIApiKey?: string;
  private enableSpeakerDiarization: boolean;
  private isStreaming: boolean = false;
  private streamingUnlisteners: (() => void)[] = [];

  constructor(config: TranscriptionConfig) {
    this.mode = config.mode;
    this.enableSpeakerDiarization = config.enableSpeakerDiarization || false;
    this.assemblyAIApiKey = config.assemblyAIApiKey;

    if (this.mode === 'advanced' && config.assemblyAIApiKey) {
      this.assemblyAIService = createAssemblyAIService(config.assemblyAIApiKey);
    }
  }

  /**
   * Transcribe audio file using the configured mode
   */
  async transcribeAudioFile(audioPath: string): Promise<string> {
    if (this.mode === 'basic') {
      return this.transcribeWithWhisper(audioPath);
    } else if (this.mode === 'advanced' && this.assemblyAIService) {
      return this.transcribeWithAssemblyAI(audioPath);
    } else {
      throw new Error('Invalid transcription mode or missing configuration');
    }
  }

  /**
   * Transcribe using Whisper (basic mode)
   */
  private async transcribeWithWhisper(audioPath: string): Promise<string> {
    try {
      const result = await invoke<string>('transcribe_audio', { audioPath });
      return result;
    } catch (error) {
      console.error('Whisper transcription error:', error);
      throw new Error(`Whisper transcription failed: ${error}`);
    }
  }

  /**
   * Transcribe using AssemblyAI (advanced mode)
   */
  private async transcribeWithAssemblyAI(audioPath: string): Promise<string> {
    if (!this.assemblyAIApiKey) {
      throw new Error('AssemblyAI API key not provided');
    }

    try {
      // Use the backend to handle AssemblyAI transcription
      // The backend will read the file and send it to AssemblyAI
      const result = await invoke<string>('transcribe_with_assemblyai', { 
        audioPath: audioPath,
        apiKey: this.assemblyAIApiKey,
        enableSpeakerDiarization: this.enableSpeakerDiarization 
      });
      return result;
    } catch (error) {
      console.error('AssemblyAI transcription error:', error);
      throw new Error(`AssemblyAI transcription failed: ${error}`);
    }
  }

  /**
   * Enable real-time transcription
   */
  async enableRealtimeTranscription(): Promise<string> {
    if (this.mode === 'basic') {
      return await invoke<string>('enable_realtime_transcription');
    } else if (this.mode === 'advanced' && this.assemblyAIApiKey) {
      return await this.startAssemblyAIStreaming();
    } else {
      throw new Error('Invalid transcription mode or missing configuration');
    }
  }

  /**
   * Disable real-time transcription
   */
  async disableRealtimeTranscription(): Promise<string> {
    if (this.mode === 'basic') {
      return await invoke<string>('disable_realtime_transcription');
    } else if (this.mode === 'advanced') {
      return await this.stopAssemblyAIStreaming();
    } else {
      return 'Real-time transcription disabled';
    }
  }

  /**
   * Start AssemblyAI streaming
   */
  private async startAssemblyAIStreaming(): Promise<string> {
    if (!this.assemblyAIApiKey) {
      throw new Error('AssemblyAI API key not provided');
    }

    if (this.isStreaming) {
      return 'AssemblyAI streaming already active';
    }

    try {
      // Set up event listeners for streaming events
      const partialUnlisten = await listen('assemblyai-partial-transcript', (event) => {
        console.log('Partial transcript:', event.payload);
        // Emit custom event for UI to handle
        window.dispatchEvent(new CustomEvent('assemblyai-partial-transcript', { 
          detail: event.payload 
        }));
      });

      const finalUnlisten = await listen('assemblyai-final-transcript', (event) => {
        console.log('Final transcript:', event.payload);
        // Emit custom event for UI to handle
        window.dispatchEvent(new CustomEvent('assemblyai-final-transcript', { 
          detail: event.payload 
        }));
      });

      const sessionBeginsUnlisten = await listen('assemblyai-session-begins', (event) => {
        console.log('AssemblyAI session started:', event.payload);
        this.isStreaming = true;
        window.dispatchEvent(new CustomEvent('assemblyai-session-begins', { 
          detail: event.payload 
        }));
      });

      const sessionTerminatedUnlisten = await listen('assemblyai-session-terminated', (event) => {
        console.log('AssemblyAI session ended:', event.payload);
        this.isStreaming = false;
        this.cleanupStreamingListeners();
        window.dispatchEvent(new CustomEvent('assemblyai-session-terminated', { 
          detail: event.payload 
        }));
      });

      const errorUnlisten = await listen('assemblyai-error', (event) => {
        console.error('AssemblyAI error:', event.payload);
        this.isStreaming = false;
        this.cleanupStreamingListeners();
        window.dispatchEvent(new CustomEvent('assemblyai-error', { 
          detail: event.payload 
        }));
      });

      const turnUnlisten = await listen('assemblyai-turn', (event) => {
        console.log('AssemblyAI turn:', event.payload);
        // Emit custom event for UI to handle speaker turns
        window.dispatchEvent(new CustomEvent('assemblyai-turn', { 
          detail: event.payload 
        }));
      });

      // Store unlisteners for cleanup
      this.streamingUnlisteners = [
        partialUnlisten,
        finalUnlisten,
        sessionBeginsUnlisten,
        sessionTerminatedUnlisten,
        errorUnlisten,
        turnUnlisten
      ];

      // Start the streaming session
      const result = await invoke<string>('start_assemblyai_streaming', {
        apiKey: this.assemblyAIApiKey,
        enableSpeakerDiarization: this.enableSpeakerDiarization
      });

      return result;
    } catch (error) {
      console.error('Failed to start AssemblyAI streaming:', error);
      this.cleanupStreamingListeners();
      throw new Error(`Failed to start AssemblyAI streaming: ${error}`);
    }
  }

  /**
   * Stop AssemblyAI streaming
   */
  private async stopAssemblyAIStreaming(): Promise<string> {
    if (!this.isStreaming) {
      return 'AssemblyAI streaming not active';
    }

    this.isStreaming = false;
    this.cleanupStreamingListeners();
    
    // Emit event to notify UI
    window.dispatchEvent(new CustomEvent('assemblyai-session-terminated', { 
      detail: 'Streaming stopped by user' 
    }));

    return 'AssemblyAI streaming stopped';
  }

  /**
   * Clean up streaming event listeners
   */
  private cleanupStreamingListeners(): void {
    this.streamingUnlisteners.forEach(unlisten => {
      try {
        unlisten();
      } catch (error) {
        console.warn('Error cleaning up listener:', error);
      }
    });
    this.streamingUnlisteners = [];
  }

  /**
   * Get current transcription mode
   */
  getMode(): TranscriptionMode {
    return this.mode;
  }

  /**
   * Switch transcription mode
   */
  switchMode(mode: TranscriptionMode, assemblyAIApiKey?: string): void {
    // Clean up any active streaming when switching modes
    if (this.isStreaming) {
      this.stopAssemblyAIStreaming();
    }

    this.mode = mode;
    this.assemblyAIApiKey = assemblyAIApiKey;
    
    if (mode === 'advanced' && assemblyAIApiKey) {
      this.assemblyAIService = createAssemblyAIService(assemblyAIApiKey);
    } else if (mode === 'basic') {
      this.assemblyAIService = undefined;
    }
  }

  /**
   * Check if speaker diarization is enabled
   */
  isSpeakerDiarizationEnabled(): boolean {
    return this.enableSpeakerDiarization;
  }

  /**
   * Enable or disable speaker diarization
   */
  setSpeakerDiarization(enabled: boolean): void {
    this.enableSpeakerDiarization = enabled;
  }

  /**
   * Check if streaming is currently active
   */
  isStreamingActive(): boolean {
    return this.isStreaming;
  }
}

// Utility function to create transcription service from environment
export function createTranscriptionServiceFromEnv(): TranscriptionService {
  // In a real implementation, you would read these from environment variables
  // For now, we'll use defaults and let the user configure them
  const mode: TranscriptionMode = 'basic'; // Default to basic mode
  
  return new TranscriptionService({
    mode,
    enableSpeakerDiarization: false,
  });
}

// Utility function to get environment configuration
export function getTranscriptionConfig(): { mode: TranscriptionMode; hasAssemblyAIKey: boolean } {
  // This would typically read from environment variables
  // For now, return defaults
  return {
    mode: 'basic',
    hasAssemblyAIKey: false,
  };
}