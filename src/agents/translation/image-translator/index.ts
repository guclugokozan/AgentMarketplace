/**
 * Image Translator Agent
 *
 * AI-powered image translation that extracts text from images,
 * translates it, and optionally overlays the translated text.
 *
 * Capabilities:
 * - OCR text extraction from images using GPT-4 Vision
 * - Multi-language translation support (50+ languages)
 * - Text position detection for overlay
 * - Batch image processing
 * - Support for documents, screenshots, photos
 *
 * Uses: OpenAI GPT-4 Vision (OCR + Translation)
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getJobsStorage } from '../../../storage/jobs.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// OPENAI CLIENT
// =============================================================================

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string; detail?: string } }>;
}

interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

async function callOpenAI(messages: OpenAIMessage[], model: string = 'gpt-4o'): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 4096,
      temperature: 0.2,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as OpenAIResponse;
  return data.choices[0]?.message?.content || '';
}

// =============================================================================
// SCHEMAS
// =============================================================================

const SupportedLanguageSchema = z.enum([
  'Arabic', 'Bengali', 'Bulgarian', 'Chinese (Simplified)', 'Chinese (Traditional)',
  'Croatian', 'Czech', 'Danish', 'Dutch', 'English', 'Estonian', 'Finnish',
  'French', 'German', 'Greek', 'Hebrew', 'Hindi', 'Hungarian', 'Indonesian',
  'Italian', 'Japanese', 'Korean', 'Latvian', 'Lithuanian', 'Malay', 'Norwegian',
  'Persian', 'Polish', 'Portuguese', 'Romanian', 'Russian', 'Serbian', 'Slovak',
  'Slovenian', 'Spanish', 'Swedish', 'Tamil', 'Telugu', 'Thai', 'Turkish',
  'Ukrainian', 'Urdu', 'Vietnamese',
]);

const TextRegionSchema = z.object({
  originalText: z.string(),
  translatedText: z.string(),
  confidence: z.number().min(0).max(1),
  boundingBox: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  sourceLanguage: z.string().optional(),
});

const OCRExtractionSchema = z.object({
  success: z.boolean(),
  fullText: z.string(),
  detectedLanguage: z.string().optional(),
  confidence: z.number().min(0).max(1),
  regions: z.array(TextRegionSchema.omit({ translatedText: true })),
  characterCount: z.number(),
  wordCount: z.number(),
  error: z.string().optional(),
});

const TranslationResultSchema = z.object({
  originalText: z.string(),
  translatedText: z.string(),
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  characterCount: z.number(),
});

const TranslationOptionsSchema = z.object({
  targetLanguage: SupportedLanguageSchema,
  sourceLanguage: SupportedLanguageSchema.optional().describe('Auto-detect if not specified'),
  formality: z.enum(['default', 'formal', 'informal']).default('default'),
  preserveFormatting: z.boolean().default(true),
  overlayTranslation: z.boolean().default(false).describe('Overlay translated text on image'),
});

// Input/Output Schemas
const ImageTranslatorInputSchema = z.object({
  imageUrl: z.string().describe('URL or base64 of the image to translate'),
  options: TranslationOptionsSchema,
  webhookUrl: z.string().url().optional(),
});

const ImageTranslatorOutputSchema = z.object({
  jobId: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  extraction: OCRExtractionSchema.optional(),
  translation: z.object({
    originalText: z.string(),
    translatedText: z.string(),
    sourceLanguage: z.string(),
    targetLanguage: z.string(),
    regions: z.array(TextRegionSchema),
  }).optional(),
  outputImageUrl: z.string().optional().describe('Image with translated text overlay'),
  processingTime: z.number().optional(),
  cost: z.number().optional(),
  error: z.string().optional(),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function estimateTranslationCost(characterCount: number): number {
  // OpenAI GPT-4o pricing estimate
  // Input: ~$2.50/1M tokens, Output: ~$10/1M tokens
  // Rough estimate: 4 characters per token
  const estimatedTokens = characterCount / 4;
  const inputCost = (estimatedTokens / 1000000) * 2.50;
  const outputCost = (estimatedTokens / 1000000) * 10;
  return inputCost + outputCost + 0.01; // Add base cost for vision
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function extractTextFromImage(
  ctx: AgentContext,
  params: { imageUrl: string }
): Promise<z.infer<typeof OCRExtractionSchema>> {
  logger.info('text_extraction_started_openai');

  try {
    const imageContent: any[] = [];

    // Handle base64 or URL
    if (params.imageUrl.startsWith('data:')) {
      imageContent.push({
        type: 'image_url',
        image_url: { url: params.imageUrl, detail: 'high' },
      });
    } else {
      imageContent.push({
        type: 'image_url',
        image_url: { url: params.imageUrl, detail: 'high' },
      });
    }

    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: `You are an OCR expert. Extract ALL text from the image accurately.
Output format (JSON):
{
  "fullText": "all text extracted from the image",
  "detectedLanguage": "detected source language name",
  "confidence": 0.95,
  "regions": [
    {
      "originalText": "text in this region",
      "confidence": 0.95,
      "boundingBox": { "x": 0, "y": 0, "width": 100, "height": 50 }
    }
  ]
}

If the image has no text, return:
{ "fullText": "", "detectedLanguage": null, "confidence": 0, "regions": [] }

Respond ONLY with valid JSON, no markdown.`,
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Extract all text from this image with position information.' },
          ...imageContent,
        ],
      },
    ];

    const response = await callOpenAI(messages, 'gpt-4o');

    // Parse the JSON response
    let parsed: any;
    try {
      // Clean up response if it has markdown code blocks
      let cleanResponse = response.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.slice(7);
      }
      if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.slice(3);
      }
      if (cleanResponse.endsWith('```')) {
        cleanResponse = cleanResponse.slice(0, -3);
      }
      parsed = JSON.parse(cleanResponse.trim());
    } catch (parseError) {
      logger.error('ocr_parse_failed', { response: response.substring(0, 200) });
      return {
        success: false,
        fullText: '',
        confidence: 0,
        regions: [],
        characterCount: 0,
        wordCount: 0,
        error: 'Failed to parse OCR response',
      };
    }

    const fullText = parsed.fullText || '';
    const characterCount = fullText.length;
    const wordCount = fullText.split(/\s+/).filter((w: string) => w.length > 0).length;

    logger.info('text_extraction_completed_openai', {
      characterCount,
      wordCount,
      regionCount: parsed.regions?.length || 0,
    });

    return {
      success: characterCount > 0,
      fullText,
      detectedLanguage: parsed.detectedLanguage,
      confidence: parsed.confidence || 0.9,
      regions: parsed.regions || [],
      characterCount,
      wordCount,
    };
  } catch (error) {
    logger.error('text_extraction_failed_openai', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      fullText: '',
      confidence: 0,
      regions: [],
      characterCount: 0,
      wordCount: 0,
      error: error instanceof Error ? error.message : 'OCR extraction failed',
    };
  }
}

async function translateText(
  ctx: AgentContext,
  params: {
    text: string;
    targetLanguage: string;
    sourceLanguage?: string;
    formality?: 'default' | 'formal' | 'informal';
  }
): Promise<z.infer<typeof TranslationResultSchema>> {
  logger.info('translation_started_openai', {
    targetLanguage: params.targetLanguage,
    sourceLanguage: params.sourceLanguage,
    characterCount: params.text.length,
  });

  try {
    const formalityInstruction = params.formality === 'formal'
      ? 'Use formal language and honorifics where appropriate.'
      : params.formality === 'informal'
      ? 'Use casual, everyday language.'
      : 'Use neutral, standard language.';

    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: `You are an expert translator. Translate the text accurately while preserving:
- Original formatting (line breaks, paragraphs)
- Tone and style
- Technical terms and proper nouns (transliterate if needed)
${formalityInstruction}

Output ONLY the translated text, nothing else.`,
      },
      {
        role: 'user',
        content: `Translate the following text${params.sourceLanguage ? ` from ${params.sourceLanguage}` : ''} to ${params.targetLanguage}:

${params.text}`,
      },
    ];

    const translatedText = await callOpenAI(messages, 'gpt-4o');

    // Detect source language if not provided
    let detectedSource = params.sourceLanguage || 'auto';
    if (!params.sourceLanguage) {
      const detectMessages: OpenAIMessage[] = [
        {
          role: 'system',
          content: 'Identify the language of the given text. Respond with ONLY the language name, nothing else.',
        },
        {
          role: 'user',
          content: params.text.substring(0, 500),
        },
      ];
      detectedSource = await callOpenAI(detectMessages, 'gpt-4o-mini');
    }

    logger.info('translation_completed_openai', {
      detectedSource,
      targetLanguage: params.targetLanguage,
    });

    return {
      originalText: params.text,
      translatedText: translatedText.trim(),
      sourceLanguage: detectedSource.trim(),
      targetLanguage: params.targetLanguage,
      characterCount: params.text.length,
    };
  } catch (error) {
    logger.error('translation_failed_openai', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

async function translateRegions(
  ctx: AgentContext,
  params: {
    regions: Array<{
      originalText: string;
      confidence: number;
      boundingBox: { x: number; y: number; width: number; height: number };
    }>;
    targetLanguage: string;
    sourceLanguage?: string;
    formality?: 'default' | 'formal' | 'informal';
  }
): Promise<z.infer<typeof TextRegionSchema>[]> {
  logger.info('region_translation_started_openai', {
    regionCount: params.regions.length,
    targetLanguage: params.targetLanguage,
  });

  try {
    // Batch translate all regions in one request
    const allTexts = params.regions.map((r, i) => `[${i}] ${r.originalText}`).join('\n');

    const formalityInstruction = params.formality === 'formal'
      ? 'Use formal language.'
      : params.formality === 'informal'
      ? 'Use casual language.'
      : '';

    const messages: OpenAIMessage[] = [
      {
        role: 'system',
        content: `You are an expert translator. Translate each numbered text segment${params.sourceLanguage ? ` from ${params.sourceLanguage}` : ''} to ${params.targetLanguage}. ${formalityInstruction}

Output format - each line should be: [number] translated text
Keep the same numbering. Respond ONLY with the translations, no explanations.`,
      },
      {
        role: 'user',
        content: allTexts,
      },
    ];

    const response = await callOpenAI(messages, 'gpt-4o');

    // Parse the response
    const lines = response.trim().split('\n');
    const translations: Record<number, string> = {};

    for (const line of lines) {
      const match = line.match(/^\[(\d+)\]\s*(.+)$/);
      if (match) {
        translations[parseInt(match[1])] = match[2];
      }
    }

    return params.regions.map((region, index) => ({
      originalText: region.originalText,
      translatedText: translations[index] || region.originalText,
      confidence: region.confidence,
      boundingBox: region.boundingBox,
      sourceLanguage: params.sourceLanguage,
    }));
  } catch (error) {
    logger.error('region_translation_failed_openai', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Return original text if translation fails
    return params.regions.map(region => ({
      originalText: region.originalText,
      translatedText: region.originalText,
      confidence: region.confidence,
      boundingBox: region.boundingBox,
    }));
  }
}

async function getSupportedLanguages(
  ctx: AgentContext,
  params: { type?: 'source' | 'target' }
): Promise<{
  languages: Array<{ code: string; name: string }>;
}> {
  // GPT-4 supports translation between essentially all major languages
  const languages = [
    'Arabic', 'Bengali', 'Bulgarian', 'Chinese (Simplified)', 'Chinese (Traditional)',
    'Croatian', 'Czech', 'Danish', 'Dutch', 'English', 'Estonian', 'Finnish',
    'French', 'German', 'Greek', 'Hebrew', 'Hindi', 'Hungarian', 'Indonesian',
    'Italian', 'Japanese', 'Korean', 'Latvian', 'Lithuanian', 'Malay', 'Norwegian',
    'Persian', 'Polish', 'Portuguese', 'Romanian', 'Russian', 'Serbian', 'Slovak',
    'Slovenian', 'Spanish', 'Swedish', 'Tamil', 'Telugu', 'Thai', 'Turkish',
    'Ukrainian', 'Urdu', 'Vietnamese',
  ];

  return {
    languages: languages.map(name => ({
      code: name.toLowerCase().replace(/[^a-z]/g, '_'),
      name,
    })),
  };
}

async function processTranslationPipeline(
  ctx: AgentContext,
  params: {
    imageUrl: string;
    options: z.infer<typeof TranslationOptionsSchema>;
    jobId: string;
  }
): Promise<{
  success: boolean;
  extraction?: z.infer<typeof OCRExtractionSchema>;
  translation?: {
    originalText: string;
    translatedText: string;
    sourceLanguage: string;
    targetLanguage: string;
    regions: z.infer<typeof TextRegionSchema>[];
  };
  processingTime: number;
  cost?: number;
  error?: string;
}> {
  const startTime = Date.now();
  const jobsStorage = getJobsStorage();

  try {
    jobsStorage.markProcessing(params.jobId, undefined, 'openai');
    jobsStorage.updateProgress(params.jobId, 10);

    // Step 1: Extract text from image using GPT-4 Vision
    const extraction = await extractTextFromImage(ctx, { imageUrl: params.imageUrl });

    if (!extraction.success || !extraction.fullText) {
      const errorMsg = extraction.error || 'No text found in image';
      jobsStorage.markFailed(params.jobId, errorMsg);

      return {
        success: false,
        extraction,
        processingTime: Date.now() - startTime,
        error: errorMsg,
      };
    }

    jobsStorage.updateProgress(params.jobId, 40);

    // Step 2: Translate the extracted text
    const mainTranslation = await translateText(ctx, {
      text: extraction.fullText,
      targetLanguage: params.options.targetLanguage,
      sourceLanguage: params.options.sourceLanguage,
      formality: params.options.formality,
    });

    jobsStorage.updateProgress(params.jobId, 70);

    // Step 3: Translate individual regions if available
    let translatedRegions: z.infer<typeof TextRegionSchema>[] = [];

    if (extraction.regions.length > 0) {
      translatedRegions = await translateRegions(ctx, {
        regions: extraction.regions,
        targetLanguage: params.options.targetLanguage,
        sourceLanguage: params.options.sourceLanguage,
        formality: params.options.formality,
      });
    }

    jobsStorage.updateProgress(params.jobId, 90);

    const processingTime = Date.now() - startTime;
    const cost = estimateTranslationCost(extraction.characterCount);

    const translation = {
      originalText: extraction.fullText,
      translatedText: mainTranslation.translatedText,
      sourceLanguage: mainTranslation.sourceLanguage,
      targetLanguage: params.options.targetLanguage,
      regions: translatedRegions,
    };

    jobsStorage.markCompleted(
      params.jobId,
      {
        extraction,
        translation,
        processingTime,
      },
      cost
    );

    logger.info('translation_pipeline_completed_openai', {
      jobId: params.jobId,
      processingTime,
      characterCount: extraction.characterCount,
      cost,
    });

    return {
      success: true,
      extraction,
      translation,
      processingTime,
      cost,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    jobsStorage.markFailed(params.jobId, errorMessage);

    logger.error('translation_pipeline_failed_openai', {
      jobId: params.jobId,
      error: errorMessage,
    });

    return {
      success: false,
      processingTime: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const imageTranslatorAgent = defineAgent({
  name: 'image-translator',
  description: 'AI-powered image translation using OpenAI GPT-4 Vision for OCR and translation',
  version: '2.0.0',

  inputSchema: ImageTranslatorInputSchema,
  outputSchema: ImageTranslatorOutputSchema,

  tools: {
    extract_text: {
      description: 'Extract text from an image using GPT-4 Vision',
      parameters: z.object({
        imageUrl: z.string(),
      }),
      returns: OCRExtractionSchema,
      execute: extractTextFromImage,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    translate_text: {
      description: 'Translate extracted text to target language using GPT-4',
      parameters: z.object({
        text: z.string(),
        targetLanguage: z.string(),
        sourceLanguage: z.string().optional(),
        formality: z.enum(['default', 'formal', 'informal']).optional(),
      }),
      returns: TranslationResultSchema,
      execute: translateText,
      sideEffectful: true,
      timeoutMs: 30000,
    },

    translate_regions: {
      description: 'Translate text regions preserving position information',
      parameters: z.object({
        regions: z.array(z.object({
          originalText: z.string(),
          confidence: z.number(),
          boundingBox: z.object({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
          }),
        })),
        targetLanguage: z.string(),
        sourceLanguage: z.string().optional(),
        formality: z.enum(['default', 'formal', 'informal']).optional(),
      }),
      returns: z.array(TextRegionSchema),
      execute: translateRegions,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    get_languages: {
      description: 'Get list of supported languages',
      parameters: z.object({
        type: z.enum(['source', 'target']).optional(),
      }),
      returns: z.object({
        languages: z.array(z.object({
          code: z.string(),
          name: z.string(),
        })),
      }),
      execute: getSupportedLanguages,
      timeoutMs: 5000,
    },

    process_pipeline: {
      description: 'Run the complete image translation pipeline using OpenAI',
      parameters: z.object({
        imageUrl: z.string(),
        options: TranslationOptionsSchema,
        jobId: z.string(),
      }),
      returns: z.object({
        success: z.boolean(),
        extraction: OCRExtractionSchema.optional(),
        translation: z.object({
          originalText: z.string(),
          translatedText: z.string(),
          sourceLanguage: z.string(),
          targetLanguage: z.string(),
          regions: z.array(TextRegionSchema),
        }).optional(),
        processingTime: z.number(),
        cost: z.number().optional(),
        error: z.string().optional(),
      }),
      execute: processTranslationPipeline,
      sideEffectful: true,
      timeoutMs: 120000,
    },
  },

  systemPrompt: `You are an image translation assistant powered by OpenAI GPT-4 Vision.
You can extract text from images and translate it to 40+ languages.

Workflow:
1. Extract text from the image using GPT-4 Vision (OCR)
2. Detect the source language automatically
3. Translate text to the target language
4. Preserve text positions for potential overlay

Supported operations:
- Extract text from photos, screenshots, documents, signs, menus
- Translate between 40+ major world languages
- Maintain formatting and structure
- Batch process multiple text regions

Translation tips:
- Auto-detection works for most languages
- Specify source language for better accuracy with similar scripts
- Use formality settings for appropriate tone (formal/informal)

Output includes:
- Full translated text
- Individual region translations with positions
- Confidence scores for OCR accuracy
- Language detection results`,

  config: {
    maxTurns: 10,
    temperature: 0.2,
    maxTokens: 4096,
  },
});

export default imageTranslatorAgent;
