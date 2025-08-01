import { invoke } from "@tauri-apps/api/core";
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
   * Enable or disable real-time transcription
   */
  async enableRealtimeTranscription(): Promise<string> {
    if (this.mode === 'basic') {
      return await invoke<string>('enable_realtime_transcription');
    } else {
      // For advanced mode, we would need to implement real-time streaming
      // This is more complex and would require backend integration
      throw new Error('Real-time transcription with AssemblyAI not yet implemented');
    }
  }

  /**
   * Disable real-time transcription
   */
  async disableRealtimeTranscription(): Promise<string> {
    if (this.mode === 'basic') {
      return await invoke<string>('disable_realtime_transcription');
    } else {
      return 'Advanced mode real-time transcription disabled';
    }
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