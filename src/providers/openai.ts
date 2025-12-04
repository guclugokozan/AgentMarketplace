/**
 * OpenAI API Client
 *
 * Handles interactions with OpenAI APIs including
 * Whisper for audio transcription.
 */

import { createLogger } from '../logging/logger.js';
import { getProviderApiKey, getProvider } from '../config/providers.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// TYPES
// =============================================================================

export interface WhisperTranscription {
  text: string;
  language?: string;
  duration?: number;
  segments?: WhisperSegment[];
  words?: WhisperWord[];
}

export interface WhisperSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

export interface TranscriptionOptions {
  language?: string;
  prompt?: string;
  response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
  temperature?: number;
  timestamp_granularities?: ('word' | 'segment')[];
}

// =============================================================================
// CLIENT
// =============================================================================

export class OpenAIClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor() {
    const apiKey = getProviderApiKey('openai');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    const config = getProvider('openai');
    this.apiKey = apiKey;
    this.baseUrl = config?.baseUrl || 'https://api.openai.com/v1';
    this.timeout = config?.timeout || 60000;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error('openai_api_error', {
          status: response.status,
          body: errorBody,
          endpoint,
        });
        throw new Error(`OpenAI API error: ${response.status} - ${errorBody}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('OpenAI API request timed out');
      }
      throw error;
    }
  }

  /**
   * Transcribe audio using Whisper
   */
  async transcribe(
    audioFile: Blob | Buffer,
    filename: string,
    options: TranscriptionOptions = {}
  ): Promise<WhisperTranscription> {
    const formData = new FormData();

    // Handle both Blob and Buffer
    if (audioFile instanceof Buffer) {
      const blob = new Blob([audioFile]);
      formData.append('file', blob, filename);
    } else {
      formData.append('file', audioFile, filename);
    }

    formData.append('model', 'whisper-1');

    if (options.language) {
      formData.append('language', options.language);
    }
    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }
    if (options.response_format) {
      formData.append('response_format', options.response_format);
    }
    if (options.temperature !== undefined) {
      formData.append('temperature', options.temperature.toString());
    }
    if (options.timestamp_granularities) {
      options.timestamp_granularities.forEach(g => {
        formData.append('timestamp_granularities[]', g);
      });
    }

    logger.info('whisper_transcription_started', {
      filename,
      options: {
        language: options.language,
        response_format: options.response_format,
      },
    });

    const startTime = Date.now();

    const result = await this.request<WhisperTranscription>('/audio/transcriptions', {
      method: 'POST',
      body: formData,
    });

    logger.info('whisper_transcription_completed', {
      duration: Date.now() - startTime,
      textLength: result.text?.length,
    });

    return result;
  }

  /**
   * Translate audio to English using Whisper
   */
  async translate(
    audioFile: Blob | Buffer,
    filename: string,
    options: Omit<TranscriptionOptions, 'language'> = {}
  ): Promise<WhisperTranscription> {
    const formData = new FormData();

    if (audioFile instanceof Buffer) {
      const blob = new Blob([audioFile]);
      formData.append('file', blob, filename);
    } else {
      formData.append('file', audioFile, filename);
    }

    formData.append('model', 'whisper-1');

    if (options.prompt) {
      formData.append('prompt', options.prompt);
    }
    if (options.response_format) {
      formData.append('response_format', options.response_format);
    }
    if (options.temperature !== undefined) {
      formData.append('temperature', options.temperature.toString());
    }

    logger.info('whisper_translation_started', { filename });

    const result = await this.request<WhisperTranscription>('/audio/translations', {
      method: 'POST',
      body: formData,
    });

    logger.info('whisper_translation_completed', {
      textLength: result.text?.length,
    });

    return result;
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Fetch audio file from URL
 */
export async function fetchAudioFile(url: string): Promise<{
  buffer: Buffer;
  filename: string;
  contentType: string;
}> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'audio/mpeg';
  const buffer = Buffer.from(await response.arrayBuffer());

  // Extract filename from URL or content-disposition
  let filename = 'audio.mp3';
  const urlPath = new URL(url).pathname;
  const pathFilename = urlPath.split('/').pop();
  if (pathFilename && pathFilename.includes('.')) {
    filename = pathFilename;
  }

  return { buffer, filename, contentType };
}

/**
 * Estimate transcription cost (based on OpenAI pricing)
 * Whisper: $0.006 per minute
 */
export function estimateTranscriptionCost(durationSeconds: number): number {
  const durationMinutes = durationSeconds / 60;
  return Math.round(durationMinutes * 0.006 * 1000) / 1000;
}

/**
 * Format duration as HH:MM:SS
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Generate SRT format from segments
 */
export function segmentsToSRT(segments: WhisperSegment[]): string {
  return segments.map((segment, index) => {
    const startTime = formatTimestamp(segment.start);
    const endTime = formatTimestamp(segment.end);
    return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text.trim()}\n`;
  }).join('\n');
}

/**
 * Generate VTT format from segments
 */
export function segmentsToVTT(segments: WhisperSegment[]): string {
  const vttSegments = segments.map(segment => {
    const startTime = formatTimestamp(segment.start, true);
    const endTime = formatTimestamp(segment.end, true);
    return `${startTime} --> ${endTime}\n${segment.text.trim()}`;
  }).join('\n\n');

  return `WEBVTT\n\n${vttSegments}`;
}

function formatTimestamp(seconds: number, vttFormat = false): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const separator = vttFormat ? '.' : ',';

  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0').replace('.', separator)}`;
}

// Singleton instance
let clientInstance: OpenAIClient | null = null;

export function getOpenAIClient(): OpenAIClient {
  if (!clientInstance) {
    clientInstance = new OpenAIClient();
  }
  return clientInstance;
}

// =============================================================================
// DALL-E INTEGRATION
// =============================================================================

export interface DalleGenerateParams {
  prompt: string;
  model?: 'dall-e-2' | 'dall-e-3';
  size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'vivid' | 'natural';
  n?: number;
  responseFormat?: 'url' | 'b64_json';
}

export interface DalleEditParams {
  image: Buffer | string;
  mask?: Buffer | string;
  prompt: string;
  model?: 'dall-e-2';
  size?: '256x256' | '512x512' | '1024x1024';
  n?: number;
}

export interface GeneratedImage {
  url?: string;
  b64_json?: string;
  revisedPrompt?: string;
}

interface DalleResponse {
  created: number;
  data: Array<{
    url?: string;
    b64_json?: string;
    revised_prompt?: string;
  }>;
}

export class DalleClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor() {
    const apiKey = getProviderApiKey('openai');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    const config = getProvider('openai');
    this.apiKey = apiKey;
    this.baseUrl = config?.baseUrl || 'https://api.openai.com/v1';
    this.timeout = config?.timeout || 120000;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: HeadersInit = {
      'Authorization': `Bearer ${this.apiKey}`,
      ...options.headers,
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error('dalle_api_error', {
          status: response.status,
          body: errorBody,
          endpoint,
        });
        throw new Error(`DALL-E API error: ${response.status} - ${errorBody}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('DALL-E API request timed out');
      }
      throw error;
    }
  }

  /**
   * Generate images with DALL-E
   */
  async generate(params: DalleGenerateParams): Promise<GeneratedImage[]> {
    logger.info('dalle_generate_started', {
      model: params.model || 'dall-e-3',
      size: params.size,
    });

    const response = await this.request<DalleResponse>('/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: params.prompt,
        model: params.model || 'dall-e-3',
        size: params.size || '1024x1024',
        quality: params.quality || 'standard',
        style: params.style || 'vivid',
        n: params.n || 1,
        response_format: params.responseFormat || 'url',
      }),
    });

    logger.info('dalle_generate_completed', {
      count: response.data.length,
    });

    return response.data.map((img) => ({
      url: img.url,
      b64_json: img.b64_json,
      revisedPrompt: img.revised_prompt,
    }));
  }

  /**
   * Edit an image with DALL-E (inpainting)
   */
  async edit(params: DalleEditParams): Promise<GeneratedImage[]> {
    const formData = new FormData();

    if (Buffer.isBuffer(params.image)) {
      formData.append('image', new Blob([params.image]), 'image.png');
    } else {
      // Assume it's a base64 string
      const buffer = Buffer.from(params.image, 'base64');
      formData.append('image', new Blob([buffer]), 'image.png');
    }

    if (params.mask) {
      if (Buffer.isBuffer(params.mask)) {
        formData.append('mask', new Blob([params.mask]), 'mask.png');
      } else {
        const buffer = Buffer.from(params.mask, 'base64');
        formData.append('mask', new Blob([buffer]), 'mask.png');
      }
    }

    formData.append('prompt', params.prompt);
    formData.append('model', params.model || 'dall-e-2');
    formData.append('size', params.size || '1024x1024');
    formData.append('n', String(params.n || 1));

    logger.info('dalle_edit_started', { hasImage: true, hasMask: !!params.mask });

    const response = await this.request<DalleResponse>('/images/edits', {
      method: 'POST',
      body: formData as unknown as BodyInit,
    });

    logger.info('dalle_edit_completed', { count: response.data.length });

    return response.data.map((img) => ({
      url: img.url,
      b64_json: img.b64_json,
    }));
  }

  /**
   * Create image variations
   */
  async createVariation(
    image: Buffer | string,
    options?: { size?: '256x256' | '512x512' | '1024x1024'; n?: number }
  ): Promise<GeneratedImage[]> {
    const formData = new FormData();

    if (Buffer.isBuffer(image)) {
      formData.append('image', new Blob([image]), 'image.png');
    } else {
      const buffer = Buffer.from(image, 'base64');
      formData.append('image', new Blob([buffer]), 'image.png');
    }

    formData.append('model', 'dall-e-2');
    formData.append('size', options?.size || '1024x1024');
    formData.append('n', String(options?.n || 1));

    const response = await this.request<DalleResponse>('/images/variations', {
      method: 'POST',
      body: formData as unknown as BodyInit,
    });

    return response.data.map((img) => ({
      url: img.url,
      b64_json: img.b64_json,
    }));
  }

  /**
   * Analyze an image with GPT-4 Vision
   */
  async analyzeImage(imageUrl: string, prompt: string, maxTokens: number = 1000): Promise<string> {
    const response = await this.request<{
      choices: Array<{ message: { content: string } }>;
    }>('/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageUrl } },
            ],
          },
        ],
        max_tokens: maxTokens,
      }),
    });

    return response.choices[0]?.message?.content || '';
  }

  /**
   * Get estimated cost for generation
   */
  getEstimatedCost(
    model: 'dall-e-2' | 'dall-e-3',
    size: string,
    quality: string = 'standard',
    count: number = 1
  ): number {
    const pricing: Record<string, Record<string, number>> = {
      'dall-e-3': {
        '1024x1024_standard': 0.04,
        '1024x1024_hd': 0.08,
        '1792x1024_standard': 0.08,
        '1792x1024_hd': 0.12,
        '1024x1792_standard': 0.08,
        '1024x1792_hd': 0.12,
      },
      'dall-e-2': {
        '256x256': 0.016,
        '512x512': 0.018,
        '1024x1024': 0.02,
      },
    };

    const key = model === 'dall-e-3' ? `${size}_${quality}` : size;
    const unitCost = pricing[model]?.[key] || 0.04;
    return unitCost * count;
  }
}

// DALL-E Singleton
let dalleInstance: DalleClient | null = null;

export function getDalleClient(): DalleClient {
  if (!dalleInstance) {
    dalleInstance = new DalleClient();
  }
  return dalleInstance;
}

export default OpenAIClient;
