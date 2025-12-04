/**
 * ElevenLabs Provider
 *
 * Handles voice synthesis, voice cloning, and audio generation.
 */

import { BaseProvider, ProviderConfig, requireApiKey } from './base.js';
import { getJobManager } from './job-manager.js';

// Types
export interface Voice {
  voiceId: string;
  name: string;
  category: string;
  labels?: Record<string, string>;
  previewUrl?: string;
}

export interface TextToSpeechParams {
  text: string;
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  outputFormat?: 'mp3_44100_128' | 'mp3_44100_192' | 'pcm_16000' | 'pcm_22050' | 'pcm_24000' | 'pcm_44100';
}

export interface VoiceCloneParams {
  name: string;
  description?: string;
  files: Array<{
    data: Buffer;
    filename: string;
  }>;
  labels?: Record<string, string>;
}

export interface SpeechToSpeechParams {
  audioData: Buffer;
  voiceId: string;
  modelId?: string;
  stability?: number;
  similarityBoost?: number;
}

export interface DubbingParams {
  sourceUrl?: string;
  sourceData?: Buffer;
  targetLang: string;
  sourceLang?: string;
  numSpeakers?: number;
  watermark?: boolean;
}

interface VoicesResponse {
  voices: Array<{
    voice_id: string;
    name: string;
    category: string;
    labels?: Record<string, string>;
    preview_url?: string;
  }>;
}

interface DubbingResponse {
  dubbing_id: string;
  expected_duration_sec: number;
}

interface DubbingStatusResponse {
  dubbing_id: string;
  name: string;
  status: string;
  target_languages: string[];
  error?: string;
}

export class ElevenLabsProvider extends BaseProvider {
  constructor(config?: Partial<ProviderConfig>) {
    super('ElevenLabs', {
      apiKey: config?.apiKey || requireApiKey('ELEVENLABS_API_KEY', 'ElevenLabs'),
      baseUrl: config?.baseUrl || 'https://api.elevenlabs.io/v1',
      timeout: config?.timeout || 120000,
      ...config,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      'xi-api-key': this.config.apiKey,
    };
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<Voice[]> {
    const response = await this.fetchWithRetry<VoicesResponse>(
      `${this.config.baseUrl}/voices`,
      { method: 'GET' }
    );

    return response.voices.map((v) => ({
      voiceId: v.voice_id,
      name: v.name,
      category: v.category,
      labels: v.labels,
      previewUrl: v.preview_url,
    }));
  }

  /**
   * Text to speech
   */
  async textToSpeech(params: TextToSpeechParams): Promise<ArrayBuffer> {
    const queryParams = new URLSearchParams();
    if (params.outputFormat) {
      queryParams.set('output_format', params.outputFormat);
    }

    const url = `${this.config.baseUrl}/text-to-speech/${params.voiceId}${
      queryParams.toString() ? '?' + queryParams.toString() : ''
    }`;

    return this.fetchBinary(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: params.text,
        model_id: params.modelId || 'eleven_multilingual_v2',
        voice_settings: {
          stability: params.stability ?? 0.5,
          similarity_boost: params.similarityBoost ?? 0.75,
          style: params.style ?? 0,
          use_speaker_boost: params.useSpeakerBoost ?? true,
        },
      }),
    });
  }

  /**
   * Text to speech with streaming
   */
  async textToSpeechStream(
    params: TextToSpeechParams,
    onChunk: (chunk: Uint8Array) => void
  ): Promise<void> {
    const url = `${this.config.baseUrl}/text-to-speech/${params.voiceId}/stream`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': this.config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: params.text,
        model_id: params.modelId || 'eleven_multilingual_v2',
        voice_settings: {
          stability: params.stability ?? 0.5,
          similarity_boost: params.similarityBoost ?? 0.75,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`ElevenLabs stream error: ${error}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(value);
    }
  }

  /**
   * Clone a voice from audio samples
   */
  async cloneVoice(params: VoiceCloneParams): Promise<Voice> {
    const formData = new FormData();
    formData.append('name', params.name);

    if (params.description) {
      formData.append('description', params.description);
    }

    for (const file of params.files) {
      formData.append('files', new Blob([file.data]), file.filename);
    }

    if (params.labels) {
      formData.append('labels', JSON.stringify(params.labels));
    }

    const response = await this.fetchWithRetry<{
      voice_id: string;
      name: string;
    }>(`${this.config.baseUrl}/voices/add`, {
      method: 'POST',
      body: formData as unknown as BodyInit,
      headers: {},
    });

    return {
      voiceId: response.voice_id,
      name: response.name,
      category: 'cloned',
    };
  }

  /**
   * Delete a cloned voice
   */
  async deleteVoice(voiceId: string): Promise<void> {
    await this.fetchWithRetry(`${this.config.baseUrl}/voices/${voiceId}`, {
      method: 'DELETE',
    });
  }

  /**
   * Speech to speech (voice conversion)
   */
  async speechToSpeech(params: SpeechToSpeechParams): Promise<ArrayBuffer> {
    const formData = new FormData();
    formData.append('audio', new Blob([params.audioData]), 'audio.mp3');
    formData.append('model_id', params.modelId || 'eleven_english_sts_v2');
    formData.append(
      'voice_settings',
      JSON.stringify({
        stability: params.stability ?? 0.5,
        similarity_boost: params.similarityBoost ?? 0.75,
      })
    );

    return this.fetchBinary(
      `${this.config.baseUrl}/speech-to-speech/${params.voiceId}`,
      {
        method: 'POST',
        body: formData as unknown as BodyInit,
        headers: {
          Accept: 'audio/mpeg',
        },
      }
    );
  }

  /**
   * Start dubbing job (async)
   */
  async startDubbing(
    params: DubbingParams,
    context: { agentId: string; runId: string; tenantId?: string; userId?: string }
  ): Promise<{ jobId: string; dubbingId: string }> {
    const formData = new FormData();

    if (params.sourceUrl) {
      formData.append('source_url', params.sourceUrl);
    } else if (params.sourceData) {
      formData.append('file', new Blob([params.sourceData]), 'source.mp4');
    }

    formData.append('target_lang', params.targetLang);
    if (params.sourceLang) formData.append('source_lang', params.sourceLang);
    if (params.numSpeakers) formData.append('num_speakers', String(params.numSpeakers));
    if (params.watermark !== undefined) formData.append('watermark', String(params.watermark));

    const response = await this.fetchWithRetry<DubbingResponse>(
      `${this.config.baseUrl}/dubbing`,
      {
        method: 'POST',
        body: formData as unknown as BodyInit,
        headers: {},
      }
    );

    // Create job record
    const jobManager = getJobManager();
    const jobId = jobManager.create({
      provider: 'elevenlabs',
      externalJobId: response.dubbing_id,
      agentId: context.agentId,
      runId: context.runId,
      tenantId: context.tenantId,
      userId: context.userId,
      metadata: { type: 'dubbing', targetLang: params.targetLang },
    });

    return { jobId, dubbingId: response.dubbing_id };
  }

  /**
   * Get dubbing status
   */
  async getDubbingStatus(dubbingId: string): Promise<{
    status: 'pending' | 'processing' | 'complete' | 'failed';
    error?: string;
  }> {
    const response = await this.fetchWithRetry<DubbingStatusResponse>(
      `${this.config.baseUrl}/dubbing/${dubbingId}`,
      { method: 'GET' }
    );

    const statusMap: Record<string, 'pending' | 'processing' | 'complete' | 'failed'> = {
      pending: 'pending',
      dubbing: 'processing',
      dubbed: 'complete',
      failed: 'failed',
    };

    return {
      status: statusMap[response.status] || 'pending',
      error: response.error,
    };
  }

  /**
   * Download dubbed audio
   */
  async downloadDubbedAudio(dubbingId: string, languageCode: string): Promise<ArrayBuffer> {
    return this.fetchBinary(
      `${this.config.baseUrl}/dubbing/${dubbingId}/audio/${languageCode}`,
      {
        method: 'GET',
        headers: { Accept: 'audio/mpeg' },
      }
    );
  }

  /**
   * Wait for dubbing completion
   */
  async waitForDubbing(
    jobId: string,
    languageCode: string,
    options: {
      pollInterval?: number;
      timeout?: number;
    } = {}
  ): Promise<ArrayBuffer> {
    const { pollInterval = 10000, timeout = 600000 } = options;
    const startTime = Date.now();

    const jobManager = getJobManager();
    const job = jobManager.getStatus(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    while (Date.now() - startTime < timeout) {
      const status = await this.getDubbingStatus(job.externalJobId);

      if (status.status === 'complete') {
        const audio = await this.downloadDubbedAudio(job.externalJobId, languageCode);
        jobManager.complete(jobId, `dubbing://${job.externalJobId}/${languageCode}`);
        return audio;
      }

      if (status.status === 'failed') {
        jobManager.fail(jobId, status.error || 'Dubbing failed');
        throw new Error(`Dubbing failed: ${status.error}`);
      }

      if (status.status === 'processing') {
        jobManager.updateProgress(jobId, 50);
      }

      await this.sleep(pollInterval);
    }

    throw new Error(`Dubbing timeout after ${timeout}ms`);
  }

  /**
   * Generate sound effects
   */
  async generateSoundEffect(
    text: string,
    durationSeconds?: number,
    promptInfluence?: number
  ): Promise<ArrayBuffer> {
    return this.fetchBinary(`${this.config.baseUrl}/sound-generation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({
        text,
        duration_seconds: durationSeconds,
        prompt_influence: promptInfluence,
      }),
    });
  }

  /**
   * Get subscription info
   */
  async getSubscription(): Promise<{
    characterCount: number;
    characterLimit: number;
    voiceCount: number;
    voiceLimit: number;
  }> {
    const response = await this.fetchWithRetry<{
      character_count: number;
      character_limit: number;
      voice_count: number;
      voice_limit: number;
    }>(`${this.config.baseUrl}/user/subscription`, { method: 'GET' });

    return {
      characterCount: response.character_count,
      characterLimit: response.character_limit,
      voiceCount: response.voice_count,
      voiceLimit: response.voice_limit,
    };
  }

  /**
   * Get estimated cost
   */
  getEstimatedCost(
    operation: 'tts' | 'clone' | 'sts' | 'dubbing',
    characterCount: number = 1000
  ): number {
    // Rough pricing per 1000 characters
    const costs: Record<string, number> = {
      tts: 0.30,
      clone: 0,
      sts: 0.30,
      dubbing: 0.50,
    };

    return ((costs[operation] || 0.30) * characterCount) / 1000;
  }
}

// Singleton instance
let instance: ElevenLabsProvider | null = null;

export function getElevenLabsProvider(): ElevenLabsProvider {
  if (!instance) {
    instance = new ElevenLabsProvider();
  }
  return instance;
}
