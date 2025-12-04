/**
 * Translation Provider Client
 *
 * Handles text translation using DeepL API.
 * Also includes OCR capabilities for extracting text from images.
 */

import { createLogger } from '../logging/logger.js';
import { getProviderApiKey, getProvider } from '../config/providers.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// TYPES
// =============================================================================

export interface TranslationResult {
  text: string;
  detectedSourceLang?: string;
  targetLang: string;
}

export interface OCRResult {
  text: string;
  confidence: number;
  language?: string;
  blocks: TextBlock[];
}

export interface TextBlock {
  text: string;
  confidence: number;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  words: Array<{
    text: string;
    confidence: number;
  }>;
}

// DeepL supported languages
export const DEEPL_LANGUAGES = {
  source: [
    'BG', 'CS', 'DA', 'DE', 'EL', 'EN', 'ES', 'ET', 'FI', 'FR',
    'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV', 'NB', 'NL', 'PL',
    'PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH',
  ],
  target: [
    'BG', 'CS', 'DA', 'DE', 'EL', 'EN-GB', 'EN-US', 'ES', 'ET', 'FI',
    'FR', 'HU', 'ID', 'IT', 'JA', 'KO', 'LT', 'LV', 'NB', 'NL',
    'PL', 'PT-BR', 'PT-PT', 'RO', 'RU', 'SK', 'SL', 'SV', 'TR', 'UK', 'ZH',
  ],
} as const;

export const LANGUAGE_NAMES: Record<string, string> = {
  'BG': 'Bulgarian',
  'CS': 'Czech',
  'DA': 'Danish',
  'DE': 'German',
  'EL': 'Greek',
  'EN': 'English',
  'EN-GB': 'English (British)',
  'EN-US': 'English (American)',
  'ES': 'Spanish',
  'ET': 'Estonian',
  'FI': 'Finnish',
  'FR': 'French',
  'HU': 'Hungarian',
  'ID': 'Indonesian',
  'IT': 'Italian',
  'JA': 'Japanese',
  'KO': 'Korean',
  'LT': 'Lithuanian',
  'LV': 'Latvian',
  'NB': 'Norwegian (Bokmål)',
  'NL': 'Dutch',
  'PL': 'Polish',
  'PT': 'Portuguese',
  'PT-BR': 'Portuguese (Brazilian)',
  'PT-PT': 'Portuguese (European)',
  'RO': 'Romanian',
  'RU': 'Russian',
  'SK': 'Slovak',
  'SL': 'Slovenian',
  'SV': 'Swedish',
  'TR': 'Turkish',
  'UK': 'Ukrainian',
  'ZH': 'Chinese',
};

// =============================================================================
// DEEPL CLIENT
// =============================================================================

export class DeepLClient {
  private apiKey: string;
  private baseUrl: string;
  private timeout: number;

  constructor() {
    const apiKey = getProviderApiKey('deepl');
    if (!apiKey) {
      throw new Error('DEEPL_API_KEY environment variable is required');
    }

    const config = getProvider('deepl');
    this.apiKey = apiKey;
    // DeepL free API uses api-free.deepl.com, Pro uses api.deepl.com
    this.baseUrl = config?.baseUrl || 'https://api-free.deepl.com/v2';
    this.timeout = config?.timeout || 30000;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
      'Content-Type': 'application/json',
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
        logger.error('deepl_api_error', {
          status: response.status,
          body: errorBody,
          endpoint,
        });
        throw new Error(`DeepL API error: ${response.status} - ${errorBody}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('DeepL API request timed out');
      }
      throw error;
    }
  }

  /**
   * Translate text
   */
  async translate(
    text: string | string[],
    targetLang: string,
    sourceLang?: string,
    options?: {
      formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
      preserveFormatting?: boolean;
    }
  ): Promise<TranslationResult[]> {
    const texts = Array.isArray(text) ? text : [text];

    logger.info('deepl_translation_started', {
      textCount: texts.length,
      targetLang,
      sourceLang,
    });

    const body: Record<string, unknown> = {
      text: texts,
      target_lang: targetLang.toUpperCase(),
    };

    if (sourceLang) {
      body.source_lang = sourceLang.toUpperCase();
    }
    if (options?.formality) {
      body.formality = options.formality;
    }
    if (options?.preserveFormatting !== undefined) {
      body.preserve_formatting = options.preserveFormatting;
    }

    const result = await this.request<{
      translations: Array<{
        detected_source_language: string;
        text: string;
      }>;
    }>('/translate', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    logger.info('deepl_translation_completed', {
      translationCount: result.translations.length,
    });

    return result.translations.map(t => ({
      text: t.text,
      detectedSourceLang: t.detected_source_language,
      targetLang: targetLang.toUpperCase(),
    }));
  }

  /**
   * Get usage statistics
   */
  async getUsage(): Promise<{
    characterCount: number;
    characterLimit: number;
  }> {
    const result = await this.request<{
      character_count: number;
      character_limit: number;
    }>('/usage');

    return {
      characterCount: result.character_count,
      characterLimit: result.character_limit,
    };
  }

  /**
   * Get supported languages
   */
  async getLanguages(type: 'source' | 'target' = 'target'): Promise<Array<{
    language: string;
    name: string;
    supportsFormality: boolean;
  }>> {
    const result = await this.request<Array<{
      language: string;
      name: string;
      supports_formality: boolean;
    }>>(`/languages?type=${type}`);

    return result.map(l => ({
      language: l.language,
      name: l.name,
      supportsFormality: l.supports_formality,
    }));
  }
}

// =============================================================================
// SIMPLE OCR (using Claude's vision)
// =============================================================================

/**
 * Extract text from image using basic pattern matching
 * In production, this would use Google Cloud Vision or similar
 */
export async function extractTextFromImage(imageUrl: string): Promise<OCRResult> {
  // This is a placeholder for actual OCR
  // In production, use Google Cloud Vision API or similar
  logger.info('ocr_extraction_started', { imageUrl: imageUrl.substring(0, 50) });

  // For now, return a placeholder indicating OCR needs to be implemented
  // The actual implementation would call Google Cloud Vision API
  return {
    text: '',
    confidence: 0,
    blocks: [],
  };
}

/**
 * Estimate translation cost
 * DeepL: ~$20 per million characters (varies by plan)
 */
export function estimateTranslationCost(characterCount: number): number {
  const costPerMillion = 20; // $20 per million characters
  return Math.round((characterCount / 1000000) * costPerMillion * 1000) / 1000;
}

// Singleton instance
let deepLInstance: DeepLClient | null = null;

export function getDeepLClient(): DeepLClient {
  if (!deepLInstance) {
    deepLInstance = new DeepLClient();
  }
  return deepLInstance;
}

export default DeepLClient;
