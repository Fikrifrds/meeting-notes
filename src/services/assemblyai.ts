export interface TranscriptionConfig {
  apiKey: string;
  enableSpeakerDiarization?: boolean;
  speechModel?: string;
}

export interface AssemblyAITranscriptResponse {
  text: string;
  utterances?: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
  }>;
}

export class AssemblyAIService {
  private apiKey: string;
  private baseUrl = 'https://api.assemblyai.com/v2';

  constructor(config: TranscriptionConfig) {
    this.apiKey = config.apiKey;
  }

  /**
   * Upload audio file to AssemblyAI
   */
  private async uploadFile(audioFile: File): Promise<string> {
    const formData = new FormData();
    formData.append('audio', audioFile);

    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': this.apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.statusText}`);
    }

    const data = await response.json();
    return data.upload_url;
  }

  /**
   * Transcribe audio file using AssemblyAI
   */
  async transcribeFile(audioFile: File, enableSpeakerDiarization = false): Promise<string> {
    try {
      // Upload file first
      const uploadUrl = await this.uploadFile(audioFile);

      // Create transcription request
      const transcriptRequest = {
        audio_url: uploadUrl,
        speech_model: 'universal',
        speaker_labels: enableSpeakerDiarization,
      };

      const response = await fetch(`${this.baseUrl}/transcript`, {
        method: 'POST',
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transcriptRequest),
      });

      if (!response.ok) {
        throw new Error(`Transcription request failed: ${response.statusText}`);
      }

      const transcript = await response.json();
      const transcriptId = transcript.id;

      // Poll for completion
      return await this.pollForCompletion(transcriptId, enableSpeakerDiarization);
    } catch (error) {
      console.error("AssemblyAI transcription error:", error);
      throw new Error(`Transcription failed: ${error}`);
    }
  }

  /**
   * Transcribe from URL (for pre-uploaded files)
   */
  async transcribeFromUrl(audioUrl: string, enableSpeakerDiarization = false): Promise<string> {
    try {
      const transcriptRequest = {
        audio_url: audioUrl,
        speech_model: 'universal',
        speaker_labels: enableSpeakerDiarization,
      };

      const response = await fetch(`${this.baseUrl}/transcript`, {
        method: 'POST',
        headers: {
          'Authorization': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(transcriptRequest),
      });

      if (!response.ok) {
        throw new Error(`Transcription request failed: ${response.statusText}`);
      }

      const transcript = await response.json();
      const transcriptId = transcript.id;

      return await this.pollForCompletion(transcriptId, enableSpeakerDiarization);
    } catch (error) {
      console.error("AssemblyAI transcription error:", error);
      throw new Error(`Transcription failed: ${error}`);
    }
  }

  /**
   * Poll for transcription completion
   */
  private async pollForCompletion(transcriptId: string, enableSpeakerDiarization: boolean): Promise<string> {
    const maxAttempts = 60; // 5 minutes max
    let attempts = 0;

    while (attempts < maxAttempts) {
      const response = await fetch(`${this.baseUrl}/transcript/${transcriptId}`, {
        headers: {
          'Authorization': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get transcript status: ${response.statusText}`);
      }

      const result = await response.json();

      if (result.status === 'completed') {
        if (enableSpeakerDiarization && result.utterances) {
          // Format with speaker labels
          let formattedTranscript = "";
          for (const utterance of result.utterances) {
            formattedTranscript += `Speaker ${utterance.speaker}: ${utterance.text}\n`;
          }
          return formattedTranscript;
        }
        return result.text || "";
      } else if (result.status === 'error') {
        throw new Error(`Transcription failed: ${result.error}`);
      }

      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));
      attempts++;
    }

    throw new Error('Transcription timed out');
  }
}

// Utility function to create AssemblyAI service instance
export function createAssemblyAIService(apiKey: string): AssemblyAIService {
  return new AssemblyAIService({ apiKey });
}