/**
 * Background Remover Agent
 *
 * AI-powered background removal for product images:
 * - Automatic subject detection
 * - Clean edge extraction
 * - Transparent background output
 * - Multiple output formats
 */

import type { AgentDefinition, AgentCard, ToolDefinition, ExecutionContext } from '../../core/types.js';

const backgroundRemoverCard: AgentCard = {
  id: 'background-remover',
  name: 'AI Background Remover',
  description: 'Remove backgrounds from product images with AI precision. Perfect for e-commerce, marketing materials, and photo editing.',
  version: '1.0.0',
  capabilities: [
    'image-processing',
    'background-removal',
    'product-photography',
    'transparency',
  ],
  inputSchema: {
    type: 'object',
    properties: {
      imageUrl: {
        type: 'string',
        description: 'URL of the image to process',
      },
      imageBase64: {
        type: 'string',
        description: 'Base64 encoded image data',
      },
      outputFormat: {
        type: 'string',
        enum: ['png', 'webp', 'jpg'],
        description: 'Output image format',
        default: 'png',
      },
      backgroundColor: {
        type: 'string',
        description: 'Background color (hex) or "transparent"',
        default: 'transparent',
      },
      quality: {
        type: 'string',
        enum: ['fast', 'balanced', 'high'],
        description: 'Processing quality level',
        default: 'balanced',
      },
      edgeRefinement: {
        type: 'boolean',
        description: 'Apply edge refinement for smoother cutouts',
        default: true,
      },
    },
    required: [],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      outputUrl: { type: 'string' },
      outputBase64: { type: 'string' },
      originalSize: {
        type: 'object',
        properties: {
          width: { type: 'number' },
          height: { type: 'number' },
        },
      },
      processingTime: { type: 'number' },
      confidence: { type: 'number' },
      detectedSubject: { type: 'string' },
    },
  },
  defaultModel: 'claude-sonnet-4-5-20250514',
  defaultEffortLevel: 'medium',
  sideEffects: false,
  estimatedCostTier: 'medium',
};

// Background removal tools
const analyzeImageTool: ToolDefinition = {
  name: 'analyze_image',
  version: '1.0.0',
  description: 'Analyze image to detect subject and background',
  inputSchema: {
    type: 'object',
    properties: {
      imageUrl: { type: 'string' },
      imageBase64: { type: 'string' },
    },
  },
  defer_loading: false,
  allowed_callers: ['agent'],
  idempotent: true,
  sideEffectful: false,
  scopes: ['read:images'],
  allowlistedDomains: ['*'],
  timeoutMs: 30000,
  async execute(input: { imageUrl?: string; imageBase64?: string }) {
    // Simulated image analysis (in production, would use vision AI)
    return {
      width: 1920,
      height: 1080,
      format: 'jpeg',
      hasTransparency: false,
      detectedSubject: 'product',
      subjectBoundingBox: {
        x: 200,
        y: 150,
        width: 1520,
        height: 780,
      },
      backgroundComplexity: 'simple',
      edgeQuality: 'clean',
      confidence: 0.95,
    };
  },
};

const removeBackgroundTool: ToolDefinition = {
  name: 'remove_background',
  version: '1.0.0',
  description: 'Remove background from the analyzed image',
  inputSchema: {
    type: 'object',
    properties: {
      imageUrl: { type: 'string' },
      imageBase64: { type: 'string' },
      quality: { type: 'string' },
      edgeRefinement: { type: 'boolean' },
    },
  },
  defer_loading: false,
  allowed_callers: ['agent'],
  idempotent: true,
  sideEffectful: false,
  scopes: ['write:images'],
  allowlistedDomains: ['*'],
  timeoutMs: 60000,
  async execute(input: { imageUrl?: string; imageBase64?: string; quality?: string; edgeRefinement?: boolean }) {
    // Simulated background removal (in production, would use AI service like Remove.bg API)
    const processingTime = input.quality === 'high' ? 3500 : input.quality === 'fast' ? 800 : 1500;

    // Generate a demo output (placeholder transparent image data)
    const demoBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    return {
      success: true,
      outputBase64: demoBase64,
      outputUrl: `https://api.placeholder.com/processed/${Date.now()}.png`,
      processingTimeMs: processingTime,
      maskQuality: 0.92,
      edgesRefined: input.edgeRefinement !== false,
    };
  },
};

const applyBackgroundTool: ToolDefinition = {
  name: 'apply_background',
  version: '1.0.0',
  description: 'Apply a new background color or keep transparent',
  inputSchema: {
    type: 'object',
    properties: {
      processedImageBase64: { type: 'string' },
      backgroundColor: { type: 'string' },
      outputFormat: { type: 'string' },
    },
    required: ['processedImageBase64'],
  },
  defer_loading: false,
  allowed_callers: ['agent'],
  idempotent: true,
  sideEffectful: false,
  scopes: ['write:images'],
  allowlistedDomains: [],
  timeoutMs: 10000,
  async execute(input: { processedImageBase64: string; backgroundColor?: string; outputFormat?: string }) {
    const format = input.outputFormat || 'png';
    const bgColor = input.backgroundColor || 'transparent';

    return {
      outputBase64: input.processedImageBase64,
      outputFormat: format,
      backgroundColor: bgColor,
      outputUrl: `https://api.placeholder.com/final/${Date.now()}.${format}`,
    };
  },
};

export const backgroundRemoverAgent: AgentDefinition = {
  card: backgroundRemoverCard,
  tools: [analyzeImageTool, removeBackgroundTool, applyBackgroundTool],

  systemPrompt: `You are an AI background removal specialist. Your task is to:

1. Analyze uploaded images to detect the main subject
2. Precisely remove the background while preserving fine details like hair, fur, or transparent objects
3. Apply edge refinement for professional-quality results
4. Output in the requested format with optional background color

Always prioritize quality and accuracy in subject detection.`,

  async execute(context: ExecutionContext) {
    const { task } = context;
    const input = typeof task === 'string' ? { imageUrl: task } : task;

    const startTime = Date.now();

    // Step 1: Analyze the image
    const analysis = await analyzeImageTool.execute({
      imageUrl: input.imageUrl,
      imageBase64: input.imageBase64,
    });

    // Step 2: Remove background
    const removal = await removeBackgroundTool.execute({
      imageUrl: input.imageUrl,
      imageBase64: input.imageBase64,
      quality: input.quality || 'balanced',
      edgeRefinement: input.edgeRefinement !== false,
    });

    // Step 3: Apply final background
    const final = await applyBackgroundTool.execute({
      processedImageBase64: removal.outputBase64,
      backgroundColor: input.backgroundColor || 'transparent',
      outputFormat: input.outputFormat || 'png',
    });

    const totalTime = Date.now() - startTime;

    return {
      success: true,
      outputUrl: final.outputUrl,
      outputBase64: final.outputBase64,
      outputFormat: final.outputFormat,
      originalSize: {
        width: analysis.width,
        height: analysis.height,
      },
      processingTime: totalTime,
      confidence: analysis.confidence,
      detectedSubject: analysis.detectedSubject,
      edgesRefined: removal.edgesRefined,
      backgroundColor: final.backgroundColor,
      message: `Successfully removed background from ${analysis.detectedSubject} image. Processing took ${totalTime}ms with ${Math.round(analysis.confidence * 100)}% confidence.`,
    };
  },
};

export default backgroundRemoverAgent;
