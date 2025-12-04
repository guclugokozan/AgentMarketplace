/**
 * MuleRun Agents API Routes
 *
 * REST API endpoints for MuleRun agent discovery, execution, and management.
 * Separate from the core agents API for MuleRun-specific functionality.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createLogger } from '../../logging/logger.js';
import { getAgentRegistry, AgentCategory, AgentTier } from '../../agents/mulerun-registry.js';
import { getJobsStorage } from '../../storage/jobs.js';
import { v4 as uuid } from 'uuid';
import OpenAI from 'openai';
import * as replicateService from '../../services/replicate.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const logger = createLogger({ level: 'info' });
const router = Router();

// =============================================================================
// BACKGROUND JOB PROCESSING
// =============================================================================

/**
 * Process a job in the background using real AI
 * This runs asynchronously and updates the job status
 */
async function processJobInBackground(
  jobId: string,
  agentId: string,
  input: Record<string, any>,
  webhookUrl?: string
): Promise<void> {
  const jobsStorage = getJobsStorage();

  // Mark job as processing
  jobsStorage.markProcessing(jobId, undefined, 'replicate');

  try {
    logger.info('job_processing_started', { jobId, agentId });

    // Update progress
    jobsStorage.updateProgress(jobId, 30);

    // Execute the agent with real AI
    const result = await executeAgentWithAI(agentId, input);

    // Update progress
    jobsStorage.updateProgress(jobId, 90);

    // Mark as completed
    jobsStorage.markCompleted(jobId, result);

    logger.info('job_completed', { jobId, agentId });

    // Send webhook if configured
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'job.completed',
            jobId,
            agentId,
            status: 'completed',
            output: result,
          }),
        });
      } catch (webhookError: any) {
        logger.error('webhook_failed', { jobId, webhookUrl, error: webhookError.message });
      }
    }
  } catch (error: any) {
    logger.error('job_processing_failed', { jobId, agentId, error: error.message });

    // Mark as failed
    jobsStorage.markFailed(jobId, error.message, 'PROCESSING_ERROR');

    // Send webhook if configured
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'job.failed',
            jobId,
            agentId,
            status: 'failed',
            error: error.message,
          }),
        });
      } catch (webhookError: any) {
        logger.error('webhook_failed', { jobId, webhookUrl, error: webhookError.message });
      }
    }
  }
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

function extractTenantId(req: Request): string {
  return req.headers['x-tenant-id'] as string || 'default';
}

function extractUserId(req: Request): string | undefined {
  return req.headers['x-user-id'] as string | undefined;
}

// =============================================================================
// ROUTES
// =============================================================================

/**
 * GET /mulerun/agents
 * List all MuleRun agents with optional filtering
 */
router.get('/', (req: Request, res: Response, next: NextFunction) => {
  try {
    const registry = getAgentRegistry();

    const {
      category,
      tier,
      available,
      async: isAsync,
      search,
    } = req.query;

    let agents = registry.getAll();

    // Apply filters
    if (category) {
      agents = agents.filter(a => a.metadata.category === category);
    }
    if (tier) {
      agents = agents.filter(a => a.metadata.tier === tier);
    }
    if (available !== undefined) {
      const showAvailable = available === 'true';
      agents = agents.filter(a => a.available === showAvailable);
    }
    if (isAsync !== undefined) {
      const showAsync = isAsync === 'true';
      agents = agents.filter(a => a.metadata.async === showAsync);
    }
    if (search && typeof search === 'string') {
      agents = registry.search(search);
    }

    const response = agents.map(agent => ({
      id: agent.metadata.id,
      name: agent.metadata.name,
      description: agent.metadata.description,
      category: agent.metadata.category,
      tier: agent.metadata.tier,
      version: agent.metadata.version,
      available: agent.available,
      unavailableReason: agent.unavailableReason,
      async: agent.metadata.async,
      estimatedDuration: agent.metadata.estimatedDuration,
      inputTypes: agent.metadata.inputTypes,
      outputTypes: agent.metadata.outputTypes,
      features: agent.metadata.features,
      costEstimate: registry.getCostEstimate(agent.metadata.id),
    }));

    res.json({
      agents: response,
      total: response.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /mulerun/agents/catalog
 * Get full agent catalog with stats
 */
router.get('/catalog', (req: Request, res: Response, next: NextFunction) => {
  try {
    const registry = getAgentRegistry();
    const catalog = registry.exportCatalog();

    res.json(catalog);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /mulerun/agents/stats
 * Get agent statistics
 */
router.get('/stats', (req: Request, res: Response, next: NextFunction) => {
  try {
    const registry = getAgentRegistry();
    const stats = registry.getStats();

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /mulerun/agents/categories
 * List all agent categories
 */
router.get('/categories', (req: Request, res: Response, next: NextFunction) => {
  try {
    const categories: Array<{ id: AgentCategory; name: string; description: string }> = [
      { id: 'analytics', name: 'Analytics', description: 'Data analysis and visualization tools' },
      { id: 'ecommerce', name: 'E-Commerce', description: 'Product and shopping optimization' },
      { id: 'creative', name: 'Creative', description: 'Image and media generation' },
      { id: 'productivity', name: 'Productivity', description: 'Work efficiency tools' },
      { id: 'marketing', name: 'Marketing', description: 'Marketing and content optimization' },
      { id: 'translation', name: 'Translation', description: 'Language and localization' },
      { id: 'content', name: 'Content', description: 'Content creation tools' },
      { id: 'business', name: 'Business', description: 'Business process automation' },
    ];

    const registry = getAgentRegistry();
    const stats = registry.getStats();

    res.json({
      categories: categories.map(cat => ({
        ...cat,
        agentCount: stats.byCategory[cat.id] || 0,
      })),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /mulerun/agents/:id
 * Get agent details
 */
router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const registry = getAgentRegistry();
    const agent = registry.get(req.params.id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    res.json({
      ...agent.metadata,
      available: agent.available,
      unavailableReason: agent.unavailableReason,
      costEstimate: registry.getCostEstimate(agent.metadata.id),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /mulerun/agents/:id/run
 * Run an agent (sync for non-async agents, creates job for async agents)
 */
router.post('/:id/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const registry = getAgentRegistry();
    const agent = registry.get(req.params.id);
    const tenantId = extractTenantId(req);
    const userId = extractUserId(req);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    if (!agent.available) {
      res.status(503).json({
        error: 'Agent unavailable',
        reason: agent.unavailableReason,
      });
      return;
    }

    const { input: rawInput, webhookUrl, ...directFields } = req.body;

    // Support both { input: {...} } and direct fields format for better frontend compatibility
    // If input is provided, use it. Otherwise, use the direct fields (excluding webhookUrl)
    const input = rawInput || (Object.keys(directFields).length > 0 ? directFields : null);

    if (!input || (typeof input === 'object' && Object.keys(input).length === 0)) {
      res.status(400).json({ error: 'Input is required. Send either { input: {...} } or direct fields.' });
      return;
    }

    // For async agents, create a job and start processing in background
    if (agent.metadata.async) {
      const jobsStorage = getJobsStorage();
      const job = jobsStorage.create({
        agentId: agent.metadata.id,
        tenantId,
        userId,
        input,
        webhookUrl,
        estimatedDurationMs: agent.metadata.estimatedDuration.max * 1000,
      });

      logger.info('mulerun_agent_job_created', {
        agentId: agent.metadata.id,
        jobId: job.id,
        tenantId,
      });

      // Start background processing immediately
      processJobInBackground(job.id, agent.metadata.id, input, webhookUrl);

      res.status(202).json({
        jobId: job.id,
        status: 'processing',
        message: 'Job created and processing started. Check status at /jobs/:id',
        estimatedDuration: agent.metadata.estimatedDuration,
        statusUrl: `/jobs/${job.id}`,
      });
      return;
    }

    // For sync agents, run directly with real AI
    logger.info('mulerun_agent_sync_run', {
      agentId: agent.metadata.id,
      tenantId,
    });

    try {
      const result = await executeAgentWithAI(agent.metadata.id, input);
      res.json({
        agentId: agent.metadata.id,
        status: 'completed',
        output: result,
        input,
      });
    } catch (aiError: any) {
      logger.error('agent_execution_error', { agentId: agent.metadata.id, error: aiError.message });
      // Return 400 for input validation errors, 500 for processing errors
      const isValidationError = aiError.message.includes('required') ||
                                aiError.message.includes('Required') ||
                                aiError.message.includes('Provide') ||
                                aiError.message.includes('Both') ||
                                aiError.message.includes('Either');
      res.status(isValidationError ? 400 : 500).json({
        agentId: agent.metadata.id,
        status: 'failed',
        error: aiError.message,
        input,
      });
    }
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// AI EXECUTION ENGINE - REAL IMPLEMENTATIONS
// =============================================================================

/**
 * Execute agent with REAL AI processing using Replicate and OpenAI APIs.
 * This function actually processes images, generates content, and transforms media.
 */
async function executeAgentWithAI(agentId: string, input: Record<string, any>): Promise<any> {
  logger.info('executing_real_agent', { agentId, inputKeys: Object.keys(input) });

  // ==========================================================================
  // IMAGE PROCESSING AGENTS - REAL REPLICATE API CALLS
  // ==========================================================================

  // Background Removal - Uses rembg model
  if (agentId === 'background-remover') {
    const imageUrl = input.image || input.imageUrl || input.url;
    if (!imageUrl) {
      throw new Error('Image URL is required. Provide "image", "imageUrl", or "url" field.');
    }
    const result = await replicateService.removeBackground(imageUrl);
    if (!result.success) {
      throw new Error(result.error || 'Background removal failed');
    }
    return {
      success: true,
      originalImage: imageUrl,
      resultImage: result.output,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // Background Replacement - Removes bg + generates new background
  if (agentId === 'background-replacer') {
    const imageUrl = input.image || input.imageUrl || input.url;
    const newBackground = input.newBackground || input.background || input.prompt || 'professional office background';
    if (!imageUrl) {
      throw new Error('Image URL is required. Provide "image", "imageUrl", or "url" field.');
    }
    const result = await replicateService.replaceBackground(imageUrl, newBackground);
    if (!result.success) {
      throw new Error(result.error || 'Background replacement failed');
    }
    const outputs = result.output as string[];
    return {
      success: true,
      originalImage: imageUrl,
      subjectWithTransparentBg: outputs[0],
      generatedBackground: outputs[1],
      processingTime: result.processingTime,
      model: result.model,
      instructions: 'Composite the subject onto the new background using an image editor or API',
    };
  }

  // Image Upscaling - Uses Real-ESRGAN
  if (agentId === 'image-upscaler') {
    const imageUrl = input.image || input.imageUrl || input.url;
    const scale = input.scale || 4;
    const faceEnhance = input.faceEnhance !== false;
    if (!imageUrl) {
      throw new Error('Image URL is required. Provide "image", "imageUrl", or "url" field.');
    }
    const result = await replicateService.upscaleImage(imageUrl, scale, faceEnhance);
    if (!result.success) {
      throw new Error(result.error || 'Image upscaling failed');
    }
    return {
      success: true,
      originalImage: imageUrl,
      upscaledImage: result.output,
      scale,
      faceEnhance,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // Image Generation - Uses SDXL
  if (agentId === 'image-generator') {
    const prompt = input.prompt || input.text || input.description;
    const negativePrompt = input.negativePrompt || input.negative || '';
    const width = input.width || 1024;
    const height = input.height || 1024;
    const numOutputs = input.numOutputs || input.count || 1;
    if (!prompt) {
      throw new Error('Prompt is required. Provide "prompt", "text", or "description" field.');
    }
    const result = await replicateService.generateImage(prompt, negativePrompt, width, height, numOutputs);
    if (!result.success) {
      throw new Error(result.error || 'Image generation failed');
    }
    return {
      success: true,
      prompt,
      images: result.output,
      width,
      height,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // Face Swap
  if (agentId === 'face-swap' || agentId === 'face-swap-video') {
    const sourceImage = input.sourceImage || input.source || input.faceImage;
    const targetImage = input.targetImage || input.target || input.baseImage;
    if (!sourceImage || !targetImage) {
      throw new Error('Both sourceImage and targetImage are required.');
    }
    const result = await replicateService.swapFace(sourceImage, targetImage);
    if (!result.success) {
      throw new Error(result.error || 'Face swap failed');
    }
    return {
      success: true,
      sourceImage,
      targetImage,
      resultImage: result.output,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // AI Model Swap - Uses face swap for fashion model replacement
  if (agentId === 'ai-model-swap') {
    const sourceImage = input.sourceImage || input.source || input.model;
    const targetImage = input.targetImage || input.target || input.photo;
    if (!sourceImage || !targetImage) {
      throw new Error('Both sourceImage (new model) and targetImage (product photo) are required.');
    }
    const result = await replicateService.swapFace(sourceImage, targetImage);
    if (!result.success) {
      throw new Error(result.error || 'Model swap failed');
    }
    return {
      success: true,
      sourceModel: sourceImage,
      targetPhoto: targetImage,
      resultImage: result.output,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // Virtual Try-On - Uses IDM-VTON
  if (agentId === 'virtual-try-on') {
    const personImage = input.personImage || input.person || input.humanImage || input.model;
    const garmentImage = input.garmentImage || input.garment || input.clothing || input.clothes;
    const category = input.category || 'upper_body';
    if (!personImage || !garmentImage) {
      throw new Error('Both personImage and garmentImage are required.');
    }
    const result = await replicateService.virtualTryOn(personImage, garmentImage, category);
    if (!result.success) {
      throw new Error(result.error || 'Virtual try-on failed');
    }
    return {
      success: true,
      personImage,
      garmentImage,
      category,
      resultImage: result.output,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // Portrait Enhancement - Uses GFPGAN
  if (agentId === 'portrait-enhancer' || agentId === 'portrait-retoucher' || agentId === 'headshot-generator') {
    const imageUrl = input.image || input.imageUrl || input.url || input.portrait;
    if (!imageUrl) {
      throw new Error('Image URL is required. Provide "image", "imageUrl", or "url" field.');
    }
    const result = await replicateService.enhancePortrait(imageUrl);
    if (!result.success) {
      throw new Error(result.error || 'Portrait enhancement failed');
    }
    return {
      success: true,
      originalImage: imageUrl,
      enhancedImage: result.output,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // Style Transfer
  if (agentId === 'style-transfer') {
    const imageUrl = input.image || input.imageUrl || input.url;
    const style = input.style || input.stylePrompt || 'oil painting style';
    if (!imageUrl) {
      throw new Error('Image URL is required. Provide "image", "imageUrl", or "url" field.');
    }
    const result = await replicateService.applyStyleTransfer(imageUrl, style);
    if (!result.success) {
      throw new Error(result.error || 'Style transfer failed');
    }
    return {
      success: true,
      originalImage: imageUrl,
      style,
      stylizedImage: result.output,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // Sketch to Image
  if (agentId === 'sketch-to-image') {
    const sketchUrl = input.sketch || input.sketchUrl || input.image || input.url;
    const prompt = input.prompt || input.description || 'detailed realistic image';
    if (!sketchUrl) {
      throw new Error('Sketch URL is required. Provide "sketch", "sketchUrl", "image", or "url" field.');
    }
    const result = await replicateService.sketchToImage(sketchUrl, prompt);
    if (!result.success) {
      throw new Error(result.error || 'Sketch to image conversion failed');
    }
    return {
      success: true,
      originalSketch: sketchUrl,
      prompt,
      generatedImage: result.output,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // Object Removal / Inpainting
  if (agentId === 'object-remover') {
    const imageUrl = input.image || input.imageUrl || input.url;
    const maskUrl = input.mask || input.maskUrl;
    const fillPrompt = input.fillPrompt || input.prompt || 'clean background, seamless fill';
    if (!imageUrl) {
      throw new Error('Image URL is required. Provide "image", "imageUrl", or "url" field.');
    }
    if (!maskUrl) {
      throw new Error('Mask URL is required for object removal. Provide "mask" or "maskUrl" field.');
    }
    const result = await replicateService.inpaintImage(imageUrl, maskUrl, fillPrompt);
    if (!result.success) {
      throw new Error(result.error || 'Object removal failed');
    }
    return {
      success: true,
      originalImage: imageUrl,
      mask: maskUrl,
      resultImage: result.output,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // Scene Generator - Enhanced with intelligent scene prompting
  if (agentId === 'scene-generator') {
    const prompt = input.prompt || input.scene || input.description;
    const mood = input.mood || '';
    const timeOfDay = input.timeOfDay || '';
    const negativePrompt = input.negativePrompt || '';
    const width = input.width || 1024;
    const height = input.height || 768;
    if (!prompt) {
      throw new Error('Scene prompt is required. Provide "prompt", "scene", or "description" field.');
    }
    // Build enhanced scene prompt
    const sceneEnhancements = buildScenePrompt(prompt, mood, timeOfDay);
    const result = await replicateService.generateImage(sceneEnhancements, negativePrompt, width, height, 1);
    if (!result.success) {
      throw new Error(result.error || 'Scene generation failed');
    }
    return {
      success: true,
      originalPrompt: prompt,
      enhancedPrompt: sceneEnhancements,
      sceneImage: (result.output as string[])[0],
      width,
      height,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // Product Photographer - Enhanced with style-specific prompts
  if (agentId === 'product-photographer') {
    const imageUrl = input.image || input.imageUrl || input.productImage;
    const style = input.style || 'studio';
    const background = input.background || 'white';
    if (!imageUrl) {
      // Generate product image from description
      const productDesc = input.product || input.description || input.prompt;
      if (!productDesc) {
        throw new Error('Either image URL or product description is required.');
      }
      const enhancedPrompt = buildProductPrompt(productDesc, style, background);
      const result = await replicateService.generateImage(enhancedPrompt, 'blurry, low quality, amateur, cluttered', 1024, 1024, 1);
      if (!result.success) {
        throw new Error(result.error || 'Product image generation failed');
      }
      return {
        success: true,
        description: productDesc,
        style,
        enhancedPrompt,
        productImage: (result.output as string[])[0],
        processingTime: result.processingTime,
        model: result.model,
      };
    }
    // Enhance existing product image by removing background
    const result = await replicateService.removeBackground(imageUrl);
    if (!result.success) {
      throw new Error(result.error || 'Product photography enhancement failed');
    }
    return {
      success: true,
      originalImage: imageUrl,
      productWithTransparentBg: result.output,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // Character Creator - Enhanced with style-aware prompting
  if (agentId === 'character-creator') {
    const description = input.description || input.character || input.prompt;
    const style = input.style || '';
    const pose = input.pose || 'standing';
    const viewAngle = input.viewAngle || 'full body';
    if (!description) {
      throw new Error('Character description is required. Provide "description", "character", or "prompt" field.');
    }
    const enhancedPrompt = buildCharacterPrompt(description, style, pose, viewAngle);
    const result = await replicateService.generateImage(enhancedPrompt, 'blurry, deformed, ugly, bad anatomy, extra limbs', 1024, 1024, 2);
    if (!result.success) {
      throw new Error(result.error || 'Character creation failed');
    }
    return {
      success: true,
      description,
      style,
      enhancedPrompt,
      characterImages: result.output,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // ==========================================================================
  // VIDEO PROCESSING AGENTS
  // ==========================================================================

  // Image to Video / Video Generator
  if (agentId === 'video-generator' || agentId === 'image-animator') {
    const imageUrl = input.image || input.imageUrl || input.url;
    const motionAmount = input.motionAmount || input.motion || 127;
    const fps = input.fps || 7;
    if (!imageUrl) {
      throw new Error('Image URL is required. Provide "image", "imageUrl", or "url" field.');
    }
    const result = await replicateService.imageToVideo(imageUrl, motionAmount, fps);
    if (!result.success) {
      throw new Error(result.error || 'Video generation failed');
    }
    return {
      success: true,
      sourceImage: imageUrl,
      video: result.output,
      fps,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // Lip Sync
  if (agentId === 'lip-sync' || agentId === 'talking-avatar') {
    const faceUrl = input.face || input.faceUrl || input.video || input.image;
    const audioUrl = input.audio || input.audioUrl || input.speech;
    if (!faceUrl || !audioUrl) {
      throw new Error('Both face (image/video) and audio are required.');
    }
    const result = await replicateService.lipSyncVideo(faceUrl, audioUrl);
    if (!result.success) {
      throw new Error(result.error || 'Lip sync failed');
    }
    return {
      success: true,
      faceInput: faceUrl,
      audioInput: audioUrl,
      syncedVideo: result.output,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // ==========================================================================
  // AUDIO PROCESSING AGENTS
  // ==========================================================================

  // Music Generator
  if (agentId === 'music-generator') {
    const prompt = input.prompt || input.description || input.style;
    const duration = input.duration || input.durationSeconds || 8;
    if (!prompt) {
      throw new Error('Music prompt is required. Provide "prompt", "description", or "style" field.');
    }
    const result = await replicateService.generateMusic(prompt, duration);
    if (!result.success) {
      throw new Error(result.error || 'Music generation failed');
    }
    return {
      success: true,
      prompt,
      duration,
      audioUrl: result.output,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // Voice Cloner / Text to Speech
  if (agentId === 'voice-cloner') {
    const text = input.text || input.script || input.content;
    const voicePreset = input.voicePreset || input.voice || 'v2/en_speaker_6';
    if (!text) {
      throw new Error('Text is required. Provide "text", "script", or "content" field.');
    }
    const result = await replicateService.textToSpeech(text, voicePreset);
    if (!result.success) {
      throw new Error(result.error || 'Voice synthesis failed');
    }
    return {
      success: true,
      text,
      voicePreset,
      audioUrl: result.output,
      processingTime: result.processingTime,
      model: result.model,
    };
  }

  // ==========================================================================
  // TEXT-BASED AGENTS - Use OpenAI GPT
  // ==========================================================================

  // These agents use OpenAI for text generation
  const textAgents = [
    'smart-data-analyzer',
    'product-description-writer',
    'email-template-generator',
    'seo-content-optimizer',
    'social-media-caption-generator',
    'video-script-generator',
    'customer-support-bot',
    'resume-builder',
    'data-visualization',
    'ai-assistant',
  ];

  if (textAgents.includes(agentId)) {
    return executeTextAgent(agentId, input);
  }

  // Default: Try to generate an image based on whatever input was given
  const prompt = input.prompt || input.text || input.description || JSON.stringify(input);
  const result = await replicateService.generateImage(prompt, '', 1024, 1024, 1);
  if (!result.success) {
    throw new Error(result.error || 'Processing failed');
  }
  return {
    success: true,
    prompt,
    output: result.output,
    processingTime: result.processingTime,
    model: result.model,
  };
}

/**
 * Execute text-based agents using OpenAI GPT with optimized model selection
 */
async function executeTextAgent(agentId: string, input: Record<string, any>): Promise<any> {
  // Agent-specific configurations with optimized prompts
  const agentConfigs: Record<string, { prompt: string; model: string; temperature: number }> = {
    'smart-data-analyzer': {
      model: 'gpt-4o',  // Use GPT-4 for complex data analysis
      temperature: 0.3,  // Lower temperature for more analytical responses
      prompt: `You are a senior data scientist with expertise in statistical analysis, pattern recognition, and data visualization. Your task is to provide actionable insights from the provided data.

ANALYSIS APPROACH:
1. First, understand the data structure and identify key variables
2. Look for patterns, trends, correlations, and anomalies
3. Consider both what the data shows and what might be missing
4. Provide specific, actionable recommendations

OUTPUT FORMAT (JSON):
{
  "summary": "Executive summary of key findings (2-3 sentences)",
  "dataOverview": { "totalRecords": number, "variables": [...], "dataQuality": "..." },
  "keyFindings": [
    { "finding": "...", "significance": "high/medium/low", "evidence": "..." }
  ],
  "patterns": [...],
  "anomalies": [...],
  "recommendations": [
    { "action": "...", "rationale": "...", "priority": "high/medium/low" }
  ],
  "visualizationSuggestions": [
    { "chartType": "...", "variables": [...], "purpose": "..." }
  ]
}`,
    },

    'product-description-writer': {
      model: 'gpt-4o-mini',
      temperature: 0.8,  // Higher creativity for copywriting
      prompt: `You are a world-class e-commerce copywriter who has written for top brands. Create compelling product descriptions that SELL.

COPYWRITING PRINCIPLES:
- Lead with benefits, not features
- Use sensory language that helps customers imagine owning the product
- Create urgency without being pushy
- Include social proof where applicable
- Optimize for the target platform (Amazon, Shopify, etc.)

OUTPUT FORMAT (JSON):
{
  "headline": "Attention-grabbing headline (max 10 words)",
  "subheadline": "Supporting statement that reinforces the value",
  "description": "Full product description (150-300 words)",
  "bulletPoints": [
    "✓ Benefit-focused bullet point 1",
    "✓ Benefit-focused bullet point 2"
  ],
  "emotionalHook": "The emotional benefit or transformation",
  "seoKeywords": ["keyword1", "keyword2"],
  "callToAction": "Compelling CTA text",
  "targetAudience": "Who this product is for"
}`,
    },

    'email-template-generator': {
      model: 'gpt-4o-mini',
      temperature: 0.7,
      prompt: `You are an email marketing expert who has generated millions in revenue through email campaigns. Create emails that get opened, read, and clicked.

EMAIL BEST PRACTICES:
- Subject line: Curiosity, urgency, or benefit-driven (max 50 chars)
- Preheader: Complements subject, adds intrigue
- Opening: Hook them in the first sentence
- Body: One main idea, clear value proposition
- CTA: Single, clear call-to-action

OUTPUT FORMAT (JSON):
{
  "subject": "Compelling subject line",
  "preheader": "Preview text that complements subject",
  "greeting": "Personalized greeting",
  "opening": "Hook sentence that captures attention",
  "body": "Main email content with clear value proposition",
  "cta": { "text": "CTA button text", "urgency": "Why act now" },
  "signature": "Professional sign-off",
  "psLine": "Optional P.S. for additional hook",
  "estimatedReadTime": "X minutes"
}`,
    },

    'seo-content-optimizer': {
      model: 'gpt-4o',  // Use GPT-4 for complex SEO analysis
      temperature: 0.4,
      prompt: `You are an SEO specialist who has helped websites rank #1 on Google. Optimize content for both search engines AND human readers.

SEO OPTIMIZATION APPROACH:
1. Analyze keyword usage and density
2. Check heading structure (H1, H2, H3)
3. Evaluate readability and engagement
4. Identify opportunities for featured snippets
5. Suggest internal/external linking opportunities

OUTPUT FORMAT (JSON):
{
  "optimizedContent": "The rewritten, SEO-optimized content",
  "seoScore": number (1-100),
  "metaTitle": "SEO-optimized title (50-60 chars)",
  "metaDescription": "Compelling meta description (150-160 chars)",
  "primaryKeyword": "main target keyword",
  "secondaryKeywords": [...],
  "headingStructure": { "h1": "...", "h2s": [...] },
  "readabilityScore": "grade level",
  "improvements": [
    { "issue": "...", "suggestion": "...", "impact": "high/medium/low" }
  ],
  "wordCount": number
}`,
    },

    'social-media-caption-generator': {
      model: 'gpt-4o-mini',
      temperature: 0.9,  // High creativity for social media
      prompt: `You are a viral social media content creator who knows exactly what makes people stop scrolling. Create captions that drive engagement.

PLATFORM BEST PRACTICES:
- Instagram: Visual storytelling, 2200 char max, strategic hashtags
- Twitter/X: Punchy, concise, 280 chars, conversation-starting
- LinkedIn: Professional yet human, thought leadership
- TikTok: Trending, relatable, hook in first line

OUTPUT FORMAT (JSON):
{
  "instagram": {
    "caption": "Full caption with line breaks",
    "hashtags": [...],
    "emojis": "Strategic emoji placement"
  },
  "twitter": {
    "tweet": "Concise, engaging tweet",
    "hashtags": [...]
  },
  "linkedin": {
    "post": "Professional post with hook",
    "hashtags": [...]
  },
  "tiktok": {
    "caption": "Trending, relatable caption",
    "hashtags": [...]
  },
  "bestPostingTimes": "Suggested times for engagement",
  "engagementTips": [...]
}`,
    },

    'video-script-generator': {
      model: 'gpt-4o',  // Use GPT-4 for complex scriptwriting
      temperature: 0.75,
      prompt: `You are a YouTube content creator and video scriptwriter who knows how to keep audiences watching. Create scripts that hook, engage, and convert.

SCRIPTWRITING PRINCIPLES:
- Hook viewers in the first 5 seconds
- Use pattern interrupts every 30-60 seconds
- Include B-roll suggestions for visual interest
- End with clear CTA and next video suggestion

OUTPUT FORMAT (JSON):
{
  "hook": "Opening hook (first 5 seconds) - MUST grab attention",
  "introduction": "Set expectations for the video",
  "mainContent": [
    {
      "section": "Section title",
      "script": "What to say",
      "duration": "estimated seconds",
      "bRoll": "Visual suggestion",
      "onScreenText": "Text overlay suggestion"
    }
  ],
  "transitions": ["Transition phrases between sections"],
  "callToAction": "What viewers should do next",
  "endScreen": "End screen suggestions",
  "estimatedDuration": "Total video length",
  "thumbnailIdeas": ["Click-worthy thumbnail concepts"]
}`,
    },

    'customer-support-bot': {
      model: 'gpt-4o-mini',
      temperature: 0.5,  // Balanced for helpfulness and consistency
      prompt: `You are a customer support expert who turns frustrated customers into loyal advocates. Provide helpful, empathetic, and solution-focused responses.

SUPPORT PRINCIPLES:
1. Acknowledge the customer's feelings
2. Take ownership of the problem
3. Provide clear, actionable solutions
4. Set appropriate expectations
5. Know when to escalate

OUTPUT FORMAT (JSON):
{
  "response": "The customer-facing response (empathetic and helpful)",
  "sentiment": "positive/neutral/negative/frustrated/urgent",
  "category": "billing/technical/general/complaint/feedback",
  "suggestedActions": [
    { "action": "...", "reason": "..." }
  ],
  "internalNotes": "Notes for support team",
  "followUpRequired": boolean,
  "followUpQuestions": [...],
  "escalationNeeded": boolean,
  "escalationReason": "Why escalation is needed (if applicable)",
  "suggestedResources": ["Helpful articles or links"]
}`,
    },

    'resume-builder': {
      model: 'gpt-4o',  // Use GPT-4 for important career documents
      temperature: 0.6,
      prompt: `You are a career coach who has helped thousands land their dream jobs. Create resume content that gets past ATS systems AND impresses hiring managers.

RESUME BEST PRACTICES:
- Use action verbs and quantifiable achievements
- Tailor to the target role
- Focus on impact, not just responsibilities
- Include relevant keywords for ATS
- Keep it concise and scannable

OUTPUT FORMAT (JSON):
{
  "professionalSummary": "3-4 sentence summary highlighting key value",
  "skills": {
    "technical": [...],
    "soft": [...],
    "tools": [...]
  },
  "experienceHighlights": [
    {
      "achievement": "Action verb + what you did + result",
      "metrics": "Quantifiable impact"
    }
  ],
  "keywordsForATS": [...],
  "suggestions": [
    { "area": "...", "improvement": "..." }
  ],
  "tailoredForRole": "How this matches the target role"
}`,
    },

    'data-visualization': {
      model: 'gpt-4o-mini',
      temperature: 0.4,
      prompt: `You are a data visualization expert who makes complex data tell compelling stories. Recommend the best way to visualize data for maximum impact.

VISUALIZATION PRINCIPLES:
- Match chart type to data relationship
- Minimize chart junk
- Highlight the key insight
- Consider the audience
- Ensure accessibility

OUTPUT FORMAT (JSON):
{
  "recommendedChart": {
    "type": "bar/line/scatter/pie/etc.",
    "reason": "Why this chart type is best",
    "dataMapping": {
      "xAxis": "...",
      "yAxis": "...",
      "color": "...",
      "size": "..."
    }
  },
  "configuration": {
    "title": "Chart title",
    "subtitle": "Supporting context",
    "colorPalette": [...],
    "annotations": ["Key points to highlight"]
  },
  "keyInsight": "The main takeaway from this visualization",
  "alternativeCharts": [
    { "type": "...", "useCase": "..." }
  ],
  "accessibilityNotes": "How to make this accessible",
  "interactivitySuggestions": [...]
}`,
    },

    'ai-assistant': {
      model: 'gpt-4o',  // Use GPT-4 for general intelligence tasks
      temperature: 0.7,
      prompt: `You are a highly capable AI assistant that helps users accomplish their goals efficiently. Be helpful, accurate, and proactive.

ASSISTANT PRINCIPLES:
1. Understand the user's true intent
2. Provide actionable, specific guidance
3. Anticipate follow-up needs
4. Be concise but thorough
5. Admit uncertainty when appropriate

OUTPUT FORMAT (JSON):
{
  "response": "Clear, helpful response to the user's request",
  "understanding": "What you understood the user to be asking",
  "actionItems": [
    { "task": "...", "priority": "high/medium/low" }
  ],
  "suggestions": ["Proactive suggestions based on the request"],
  "resources": ["Helpful resources or tools"],
  "followUp": "Suggested next steps or questions",
  "confidence": "high/medium/low - your confidence in the response"
}`,
    },
  };

  const config = agentConfigs[agentId] || {
    model: 'gpt-4o-mini',
    temperature: 0.7,
    prompt: 'You are a helpful AI assistant. Respond in JSON format with relevant information.',
  };

  const userPrompt = `Process this request:\n${JSON.stringify(input, null, 2)}`;

  const completion = await openai.chat.completions.create({
    model: config.model,
    messages: [
      { role: 'system', content: config.prompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: config.temperature,
    max_tokens: 3000,
    response_format: { type: 'json_object' },
  });

  const responseText = completion.choices[0]?.message?.content || '{}';

  try {
    return JSON.parse(responseText);
  } catch {
    return { rawResponse: responseText };
  }
}

/**
 * GET /mulerun/agents/:id/schema
 * Get agent input/output schema
 */
router.get('/:id/schema', (req: Request, res: Response, next: NextFunction) => {
  try {
    const registry = getAgentRegistry();
    const agent = registry.get(req.params.id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // In production, generate JSON Schema from Zod schemas
    res.json({
      agentId: agent.metadata.id,
      inputTypes: agent.metadata.inputTypes,
      outputTypes: agent.metadata.outputTypes,
      useCases: agent.metadata.useCases,
      message: 'Full JSON Schema would be generated from Zod schemas',
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /mulerun/agents/:id/jobs
 * Get jobs for a specific agent
 */
router.get('/:id/jobs', (req: Request, res: Response, next: NextFunction) => {
  try {
    const registry = getAgentRegistry();
    const agent = registry.get(req.params.id);
    const tenantId = extractTenantId(req);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const jobsStorage = getJobsStorage();
    const jobs = jobsStorage.findByTenant(tenantId, {
      limit: parseInt(req.query.limit as string) || 20,
    }).filter(job => job.agentId === agent.metadata.id);

    res.json({
      agentId: agent.metadata.id,
      jobs: jobs.map(job => ({
        id: job.id,
        status: job.status,
        progress: job.progress,
        createdAt: job.createdAt,
        completedAt: job.completedAt,
      })),
      total: jobs.length,
    });
  } catch (error) {
    next(error);
  }
});

// =============================================================================
// PROMPT ENHANCEMENT HELPERS
// =============================================================================

/**
 * Build enhanced scene prompt based on content and mood
 */
function buildScenePrompt(prompt: string, mood: string, timeOfDay: string): string {
  const lowerPrompt = prompt.toLowerCase();
  let enhancement = '';
  let lightingPrefix = '';
  let moodSuffix = '';

  // Time of day lighting
  if (timeOfDay) {
    const time = timeOfDay.toLowerCase();
    if (time.includes('dawn') || time.includes('sunrise')) {
      lightingPrefix = 'golden hour dawn light, soft warm glow, ';
    } else if (time.includes('noon') || time.includes('midday')) {
      lightingPrefix = 'bright midday sun, clear shadows, ';
    } else if (time.includes('sunset') || time.includes('dusk')) {
      lightingPrefix = 'golden hour sunset, warm orange light, dramatic sky, ';
    } else if (time.includes('night') || time.includes('midnight')) {
      lightingPrefix = 'nighttime, moonlight, stars, ';
    } else if (time.includes('twilight') || time.includes('blue hour')) {
      lightingPrefix = 'blue hour twilight, soft blue tones, magical atmosphere, ';
    }
  }

  // Mood enhancement
  if (mood) {
    const moodLower = mood.toLowerCase();
    if (moodLower.includes('peaceful') || moodLower.includes('calm') || moodLower.includes('serene')) {
      moodSuffix = ', peaceful atmosphere, tranquil, serene';
    } else if (moodLower.includes('dramatic') || moodLower.includes('epic')) {
      moodSuffix = ', dramatic lighting, epic scale, cinematic';
    } else if (moodLower.includes('mysterious') || moodLower.includes('dark')) {
      moodSuffix = ', mysterious atmosphere, moody lighting, atmospheric';
    } else if (moodLower.includes('cheerful') || moodLower.includes('happy')) {
      moodSuffix = ', cheerful atmosphere, bright colors, inviting';
    } else if (moodLower.includes('scary') || moodLower.includes('horror')) {
      moodSuffix = ', eerie atmosphere, unsettling, ominous';
    }
  }

  // Scene type detection
  if (/forest|woods|jungle|trees/i.test(lowerPrompt)) {
    enhancement = 'detailed forest environment, lush vegetation, atmospheric depth, ';
  } else if (/ocean|sea|beach|coast/i.test(lowerPrompt)) {
    enhancement = 'detailed seascape, realistic water, waves, ';
  } else if (/mountain|peak|alpine|cliff/i.test(lowerPrompt)) {
    enhancement = 'majestic mountain landscape, dramatic peaks, ';
  } else if (/city|urban|street|downtown/i.test(lowerPrompt)) {
    enhancement = 'detailed cityscape, urban environment, ';
  } else if (/desert|sand|dunes/i.test(lowerPrompt)) {
    enhancement = 'expansive desert landscape, sand textures, ';
  } else if (/space|galaxy|planet|cosmos/i.test(lowerPrompt)) {
    enhancement = 'cosmic scene, nebulae, stars, space environment, ';
  } else if (/interior|room|hall|palace/i.test(lowerPrompt)) {
    enhancement = 'detailed interior design, architectural details, ';
  } else if (/fantasy|magical|enchanted/i.test(lowerPrompt)) {
    enhancement = 'fantasy environment, magical atmosphere, ethereal, ';
  } else if (/sci-fi|futuristic|cyberpunk/i.test(lowerPrompt)) {
    enhancement = 'futuristic environment, sci-fi architecture, neon lights, ';
  } else {
    enhancement = 'detailed environment, cinematic composition, ';
  }

  return lightingPrefix + enhancement + prompt + moodSuffix + ', high quality, 8k resolution, masterpiece';
}

/**
 * Build enhanced character prompt based on style
 */
function buildCharacterPrompt(description: string, style: string, pose: string, viewAngle: string): string {
  const lowerStyle = style.toLowerCase();
  let stylePrefix = '';
  let qualitySuffix = '';

  // Style-specific enhancements
  if (lowerStyle.includes('anime') || lowerStyle.includes('manga')) {
    stylePrefix = 'high quality anime character illustration, ';
    qualitySuffix = ', anime style, cel shading, vibrant colors, detailed lineart';
  } else if (lowerStyle.includes('realistic') || lowerStyle.includes('photo')) {
    stylePrefix = 'hyperrealistic character portrait, photorealistic, ';
    qualitySuffix = ', DSLR quality, detailed skin texture, studio lighting';
  } else if (lowerStyle.includes('cartoon') || lowerStyle.includes('disney')) {
    stylePrefix = 'cartoon character design, Disney style, ';
    qualitySuffix = ', expressive, vibrant colors, clean lines';
  } else if (lowerStyle.includes('fantasy') || lowerStyle.includes('dnd') || lowerStyle.includes('rpg')) {
    stylePrefix = 'fantasy character art, RPG style, ';
    qualitySuffix = ', detailed armor/clothing, dramatic lighting, concept art quality';
  } else if (lowerStyle.includes('chibi') || lowerStyle.includes('cute')) {
    stylePrefix = 'chibi character design, cute style, ';
    qualitySuffix = ', adorable, big eyes, small body proportions';
  } else if (lowerStyle.includes('comic') || lowerStyle.includes('superhero')) {
    stylePrefix = 'comic book character art, superhero style, ';
    qualitySuffix = ', dynamic pose, bold lines, vibrant colors';
  } else if (lowerStyle.includes('pixel') || lowerStyle.includes('retro')) {
    stylePrefix = 'pixel art character, retro game style, ';
    qualitySuffix = ', clean pixels, limited color palette';
  } else if (lowerStyle.includes('3d') || lowerStyle.includes('cg')) {
    stylePrefix = '3D character render, CGI quality, ';
    qualitySuffix = ', Pixar quality, subsurface scattering, detailed textures';
  } else {
    // Default to detailed character art
    stylePrefix = 'detailed character art, professional quality, ';
    qualitySuffix = ', concept art, trending on artstation';
  }

  // Pose and view angle
  const poseStr = pose ? `${pose} pose, ` : '';
  const viewStr = viewAngle ? `${viewAngle} view, ` : 'full body, ';

  return stylePrefix + viewStr + poseStr + description + qualitySuffix;
}

/**
 * Build enhanced product photography prompt
 */
function buildProductPrompt(description: string, style: string, background: string): string {
  const lowerStyle = style.toLowerCase();
  let styleEnhancement = '';
  let bgEnhancement = '';

  // Style variations
  if (lowerStyle.includes('studio') || lowerStyle.includes('professional')) {
    styleEnhancement = 'professional studio product photography, commercial quality, ';
  } else if (lowerStyle.includes('lifestyle') || lowerStyle.includes('context')) {
    styleEnhancement = 'lifestyle product photography, in-context shot, real environment, ';
  } else if (lowerStyle.includes('minimal') || lowerStyle.includes('clean')) {
    styleEnhancement = 'minimalist product photography, clean aesthetic, ';
  } else if (lowerStyle.includes('luxury') || lowerStyle.includes('premium')) {
    styleEnhancement = 'luxury product photography, premium feel, elegant lighting, ';
  } else if (lowerStyle.includes('flat lay') || lowerStyle.includes('top')) {
    styleEnhancement = 'flat lay product photography, top-down view, styled arrangement, ';
  } else if (lowerStyle.includes('hero') || lowerStyle.includes('dramatic')) {
    styleEnhancement = 'hero shot product photography, dramatic lighting, impactful angle, ';
  } else {
    styleEnhancement = 'professional product photography, commercial quality, ';
  }

  // Background variations
  const bg = background.toLowerCase();
  if (bg.includes('white') || bg.includes('clean')) {
    bgEnhancement = 'pure white background, seamless backdrop, ';
  } else if (bg.includes('gradient') || bg.includes('soft')) {
    bgEnhancement = 'soft gradient background, smooth transition, ';
  } else if (bg.includes('natural') || bg.includes('organic')) {
    bgEnhancement = 'natural background, organic materials, ';
  } else if (bg.includes('dark') || bg.includes('black')) {
    bgEnhancement = 'dark background, dramatic contrast, ';
  } else if (bg.includes('marble') || bg.includes('stone')) {
    bgEnhancement = 'marble surface background, elegant texture, ';
  } else if (bg.includes('wood') || bg.includes('rustic')) {
    bgEnhancement = 'wooden surface background, rustic feel, ';
  } else {
    bgEnhancement = 'clean background, ';
  }

  return styleEnhancement + bgEnhancement + description + ', studio lighting, sharp focus, high resolution, 8k quality';
}

export default router;
