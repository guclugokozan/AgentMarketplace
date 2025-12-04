/**
 * Replicate AI Service
 *
 * Real AI model execution using Replicate's API.
 * Provides actual image processing, generation, and transformation.
 */

import Replicate from 'replicate';
import { createLogger } from '../logging/logger.js';

const logger = createLogger({ level: 'info' });

// Initialize Replicate client
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

/**
 * Convert Replicate output to serializable format
 * Replicate returns FileOutput objects that need to be converted to strings
 * FileOutput can be: string, object with url() method, object with href, ReadableStream
 */
function serializeOutput(output: unknown): string | string[] {
  // Handle null/undefined
  if (output === null || output === undefined) {
    return '';
  }

  // Already a string
  if (typeof output === 'string') {
    return output;
  }

  // Array of outputs
  if (Array.isArray(output)) {
    return output.map(item => serializeSingleOutput(item)).filter(Boolean);
  }

  // Single object
  return serializeSingleOutput(output);
}

/**
 * Serialize a single output item
 */
function serializeSingleOutput(item: unknown): string {
  if (item === null || item === undefined) {
    return '';
  }

  if (typeof item === 'string') {
    return item;
  }

  if (typeof item === 'object') {
    const obj = item as any;

    // FileOutput with url() method
    if (typeof obj.url === 'function') {
      try {
        return String(obj.url());
      } catch {
        // Fall through
      }
    }

    // Object with href property (URL-like)
    if (obj.href && typeof obj.href === 'string') {
      return obj.href;
    }

    // Object with read method (ReadableStream) - convert to string
    if (typeof obj.read === 'function' || typeof obj.getReader === 'function') {
      // Try to get URL from the object's string representation
      const str = String(obj);
      if (str.startsWith('http')) {
        return str;
      }
      // Can't serialize ReadableStream directly
      logger.warn('serialize_output_stream', { type: typeof obj });
      return '';
    }

    // Check common URL properties
    if (obj.output && typeof obj.output === 'string') {
      return obj.output;
    }

    // Try toString
    const str = String(obj);
    if (str && str !== '[object Object]' && str.startsWith('http')) {
      return str;
    }

    // Last resort: JSON stringify
    try {
      return JSON.stringify(obj);
    } catch {
      return '';
    }
  }

  return String(item);
}

// =============================================================================
// MODEL DEFINITIONS
// =============================================================================

const MODELS = {
  // Background Removal
  backgroundRemoval: 'cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003',

  // Image Upscaling
  upscale: 'nightmareai/real-esrgan:f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa',

  // Image Generation (SDXL)
  imageGeneration: 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',

  // Face Swap
  faceSwap: 'lucataco/faceswap:9a4298548422074c3f57258c5d544497314ae4112df80d116f0d2109e843d20d',

  // Virtual Try-On - using OOTDiffusion (more stable than IDM-VTON)
  virtualTryOn: 'viktorfa/oot_diffusion:9f8fa4956970dde99689af7488157a30aa152e23953526a605df1d77598343d7',

  // Portrait Enhancement / Face Restoration
  faceRestoration: 'tencentarc/gfpgan:0fbacf7afc6c144e5be9767cff80f25aff23e52b0708f17e20f9879b2f21516c',

  // Object Removal / Inpainting
  inpainting: 'stability-ai/stable-diffusion-inpainting:95b7223104132402a9ae91cc677285bc5eb997834bd2349fa486f53910fd68b3',

  // Style Transfer - Using SDXL img2img for fast style transfer (~5s vs 20-25s)
  styleTransfer: 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc',

  // Sketch to Image - ControlNet Scribble (specifically designed for sketch/scribble to image)
  sketchToImage: 'jagilley/controlnet-scribble:435061a1b5a4c1e26740464bf786efdfa9cb3a3ac488595a2de23e143fdb0117',

  // Video Generation (using image-to-video)
  imageToVideo: 'stability-ai/stable-video-diffusion:3f0457e4619daac51203dedb472816fd4af51f3149fa7a9e0b5ffcf1b8172438',

  // Lip Sync
  lipSync: 'devxpy/cog-wav2lip:8d65e3f4f4298520e079198b493c25adfc43c058ffec924f2aefc8010ed25eef',

  // Music Generation
  musicGeneration: 'meta/musicgen:b05b1dff1d8c6dc63d14b0cdb42135378dcb87f6373b0d3d341ede46e59e2b38',

  // Text to Speech
  textToSpeech: 'suno-ai/bark:b76242b40d67c76ab6742e987628a2a9ac019e11d56ab96c4e91ce03b79b2787',
} as const;

// =============================================================================
// IMAGE PROCESSING FUNCTIONS
// =============================================================================

export interface ProcessingResult {
  success: boolean;
  output?: string | string[];
  error?: string;
  processingTime?: number;
  model?: string;
}

/**
 * Remove background from an image
 */
export async function removeBackground(imageUrl: string): Promise<ProcessingResult> {
  const startTime = Date.now();
  try {
    logger.info('replicate_remove_background', { imageUrl: imageUrl.substring(0, 50) });

    const output = await replicate.run(MODELS.backgroundRemoval, {
      input: {
        image: imageUrl,
      },
    });

    return {
      success: true,
      output: serializeOutput(output),
      processingTime: Date.now() - startTime,
      model: 'rembg',
    };
  } catch (error: any) {
    logger.error('replicate_remove_background_error', { error: error.message });
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Upscale an image using Real-ESRGAN
 */
export async function upscaleImage(
  imageUrl: string,
  scale: number = 4,
  faceEnhance: boolean = true
): Promise<ProcessingResult> {
  const startTime = Date.now();
  try {
    logger.info('replicate_upscale', { imageUrl: imageUrl.substring(0, 50), scale });

    const output = await replicate.run(MODELS.upscale, {
      input: {
        image: imageUrl,
        scale,
        face_enhance: faceEnhance,
      },
    });

    return {
      success: true,
      output: serializeOutput(output),
      processingTime: Date.now() - startTime,
      model: 'real-esrgan',
    };
  } catch (error: any) {
    logger.error('replicate_upscale_error', { error: error.message });
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Generate image using SDXL with intelligent prompt enhancement
 */
export async function generateImage(
  prompt: string,
  negativePrompt: string = '',
  width: number = 1024,
  height: number = 1024,
  numOutputs: number = 1,
  style?: string
): Promise<ProcessingResult> {
  const startTime = Date.now();
  try {
    // Enhance the prompt based on content type
    const enhancedPrompt = enhanceImagePrompt(prompt, style);
    const enhancedNegative = negativePrompt || getDefaultNegativePrompt(prompt);

    logger.info('replicate_generate_image', {
      originalPrompt: prompt.substring(0, 50),
      enhancedPrompt: enhancedPrompt.substring(0, 100),
    });

    const output = await replicate.run(MODELS.imageGeneration, {
      input: {
        prompt: enhancedPrompt,
        negative_prompt: enhancedNegative,
        width,
        height,
        num_outputs: numOutputs,
        scheduler: 'K_EULER',
        num_inference_steps: 35,
        guidance_scale: 8.5,
        refine: 'expert_ensemble_refiner',
        high_noise_frac: 0.8,
      },
    });

    return {
      success: true,
      output: serializeOutput(output),
      processingTime: Date.now() - startTime,
      model: 'sdxl',
    };
  } catch (error: any) {
    logger.error('replicate_generate_image_error', { error: error.message });
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Enhance image generation prompt based on content
 */
function enhanceImagePrompt(prompt: string, style?: string): string {
  const lowerPrompt = prompt.toLowerCase();
  let prefix = '';
  let suffix = ', high quality, 8k resolution, detailed';

  // Style-specific enhancements
  if (style) {
    const lowerStyle = style.toLowerCase();
    if (lowerStyle.includes('photo') || lowerStyle.includes('realistic')) {
      prefix = 'professional photography, photorealistic, ';
      suffix = ', DSLR quality, sharp focus, natural lighting';
    } else if (lowerStyle.includes('anime') || lowerStyle.includes('manga')) {
      prefix = 'high quality anime artwork, ';
      suffix = ', vibrant colors, detailed lineart, studio quality';
    } else if (lowerStyle.includes('oil') || lowerStyle.includes('painting')) {
      prefix = 'masterpiece oil painting, ';
      suffix = ', brush strokes visible, gallery quality, fine art';
    } else if (lowerStyle.includes('3d') || lowerStyle.includes('render')) {
      prefix = 'professional 3D render, octane render, ';
      suffix = ', ray tracing, subsurface scattering, photorealistic lighting';
    } else if (lowerStyle.includes('pixel')) {
      prefix = 'pixel art, retro game style, ';
      suffix = ', detailed pixels, nostalgic, clean sprite work';
    } else if (lowerStyle.includes('watercolor')) {
      prefix = 'beautiful watercolor painting, ';
      suffix = ', soft edges, wet-on-wet technique, artistic';
    }
    return prefix + prompt + suffix;
  }

  // Content-based enhancements
  if (/portrait|person|face|headshot/i.test(lowerPrompt)) {
    prefix = 'professional portrait photography, ';
    suffix = ', detailed skin texture, studio lighting, DSLR quality';
  } else if (/landscape|nature|scenery|mountain|ocean|forest/i.test(lowerPrompt)) {
    prefix = 'breathtaking landscape photography, ';
    suffix = ', golden hour lighting, wide angle, HDR, National Geographic quality';
  } else if (/product|item|object/i.test(lowerPrompt)) {
    prefix = 'professional product photography, ';
    suffix = ', studio lighting, white background, commercial quality';
  } else if (/architecture|building|interior|room/i.test(lowerPrompt)) {
    prefix = 'architectural photography, ';
    suffix = ', perfect perspective, professional lighting, high resolution';
  } else if (/food|dish|meal|cuisine/i.test(lowerPrompt)) {
    prefix = 'professional food photography, ';
    suffix = ', appetizing, styled, natural lighting, editorial quality';
  } else if (/fantasy|magical|dragon|wizard|mythical/i.test(lowerPrompt)) {
    prefix = 'epic fantasy artwork, ';
    suffix = ', magical lighting, detailed, concept art quality, trending on artstation';
  } else if (/sci-fi|futuristic|space|robot|cyber/i.test(lowerPrompt)) {
    prefix = 'cinematic sci-fi artwork, ';
    suffix = ', futuristic lighting, detailed technology, concept art quality';
  } else if (/anime|manga|character/i.test(lowerPrompt)) {
    prefix = 'high quality anime illustration, ';
    suffix = ', vibrant colors, detailed, professional anime art';
  } else if (/logo|icon|design|graphic/i.test(lowerPrompt)) {
    prefix = 'professional graphic design, ';
    suffix = ', clean lines, vector quality, modern design';
  }

  return prefix + prompt + suffix;
}

/**
 * Get default negative prompt based on content type
 */
function getDefaultNegativePrompt(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();

  const baseNegative = 'blurry, low quality, distorted, deformed';

  if (/person|face|portrait|character/i.test(lowerPrompt)) {
    return `${baseNegative}, bad anatomy, bad hands, missing fingers, extra limbs, disfigured, ugly`;
  } else if (/anime|manga/i.test(lowerPrompt)) {
    return `${baseNegative}, bad anatomy, poorly drawn face, poorly drawn hands, western cartoon style`;
  } else if (/photo|realistic/i.test(lowerPrompt)) {
    return `${baseNegative}, artificial, CGI, illustration, drawing, painting, cartoon`;
  }

  return `${baseNegative}, watermark, text, signature`;
}

/**
 * Face swap between two images
 * swap_image: The face to swap IN (source face)
 * target_image: The image to swap the face INTO
 */
export async function swapFace(
  sourceImageUrl: string,
  targetImageUrl: string
): Promise<ProcessingResult> {
  const startTime = Date.now();
  try {
    logger.info('replicate_face_swap', {
      source: sourceImageUrl.substring(0, 50),
      target: targetImageUrl.substring(0, 50),
    });

    const output = await replicate.run(MODELS.faceSwap, {
      input: {
        swap_image: sourceImageUrl,
        target_image: targetImageUrl,
      },
    });

    return {
      success: true,
      output: serializeOutput(output),
      processingTime: Date.now() - startTime,
      model: 'faceswap',
    };
  } catch (error: any) {
    logger.error('replicate_face_swap_error', { error: error.message });
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Virtual try-on using OOTDiffusion
 * category: 'upperbody' | 'lowerbody' | 'dress'
 */
export async function virtualTryOn(
  personImageUrl: string,
  garmentImageUrl: string,
  category: 'upper_body' | 'lower_body' | 'dresses' = 'upper_body'
): Promise<ProcessingResult> {
  const startTime = Date.now();
  try {
    // Map category to OOTDiffusion format
    const garmentType = category === 'upper_body' ? 'upperbody' :
                        category === 'lower_body' ? 'lowerbody' : 'dress';

    logger.info('replicate_virtual_try_on', {
      person: personImageUrl.substring(0, 50),
      garment: garmentImageUrl.substring(0, 50),
      garmentType,
    });

    const output = await replicate.run(MODELS.virtualTryOn, {
      input: {
        model_image: personImageUrl,
        garment_image: garmentImageUrl,
        garment_type: garmentType,
        steps: 20,
        guidance_scale: 2,
        seed: 0,
      },
    });

    return {
      success: true,
      output: serializeOutput(output),
      processingTime: Date.now() - startTime,
      model: 'oot-diffusion',
    };
  } catch (error: any) {
    logger.error('replicate_virtual_try_on_error', { error: error.message });
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Enhance portrait / face restoration
 */
export async function enhancePortrait(imageUrl: string): Promise<ProcessingResult> {
  const startTime = Date.now();
  try {
    logger.info('replicate_enhance_portrait', { imageUrl: imageUrl.substring(0, 50) });

    const output = await replicate.run(MODELS.faceRestoration, {
      input: {
        img: imageUrl,
        version: 'v1.4',
        scale: 2,
      },
    });

    return {
      success: true,
      output: serializeOutput(output),
      processingTime: Date.now() - startTime,
      model: 'gfpgan',
    };
  } catch (error: any) {
    logger.error('replicate_enhance_portrait_error', { error: error.message });
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Inpaint / remove object from image
 */
export async function inpaintImage(
  imageUrl: string,
  maskUrl: string,
  prompt: string
): Promise<ProcessingResult> {
  const startTime = Date.now();
  try {
    logger.info('replicate_inpaint', {
      imageUrl: imageUrl.substring(0, 50),
      prompt: prompt.substring(0, 50),
    });

    const output = await replicate.run(MODELS.inpainting, {
      input: {
        image: imageUrl,
        mask: maskUrl,
        prompt,
        num_outputs: 1,
        guidance_scale: 7.5,
        num_inference_steps: 25,
      },
    });

    return {
      success: true,
      output: Array.isArray(serializeOutput(output)) ? (serializeOutput(output) as string[])[0] : serializeOutput(output),
      processingTime: Date.now() - startTime,
      model: 'stable-diffusion-inpainting',
    };
  } catch (error: any) {
    logger.error('replicate_inpaint_error', { error: error.message });
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Style transfer on image using SDXL img2img for fast processing (~5s)
 * Uses img2img mode with style prompt to transform the image
 */
export async function applyStyleTransfer(
  imageUrl: string,
  stylePrompt: string
): Promise<ProcessingResult> {
  const startTime = Date.now();
  try {
    // Enhance the style prompt for better results
    const enhancedStyle = enhanceStylePrompt(stylePrompt);
    // Adjust prompt_strength based on style type (higher = more transformation)
    const promptStrength = getStyleStrength(stylePrompt);
    // Get appropriate negative prompt for the style
    const negativePrompt = getStyleNegativePrompt(stylePrompt);

    logger.info('replicate_style_transfer', {
      imageUrl: imageUrl.substring(0, 50),
      originalStyle: stylePrompt.substring(0, 50),
      enhancedStyle: enhancedStyle.substring(0, 100),
      promptStrength,
    });

    const output = await replicate.run(MODELS.styleTransfer, {
      input: {
        prompt: enhancedStyle,
        negative_prompt: negativePrompt,
        image: imageUrl,
        prompt_strength: promptStrength,
        num_outputs: 1,
        scheduler: 'DPMSolverMultistep',
        num_inference_steps: 25,
        guidance_scale: 7.5,
      },
    });

    return {
      success: true,
      output: Array.isArray(serializeOutput(output)) ? (serializeOutput(output) as string[])[0] : serializeOutput(output),
      processingTime: Date.now() - startTime,
      model: 'sdxl-img2img',
    };
  } catch (error: any) {
    logger.error('replicate_style_transfer_error', { error: error.message });
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Enhance style transfer prompt based on style type
 */
function enhanceStylePrompt(style: string): string {
  const lowerStyle = style.toLowerCase();

  // Artist-specific styles
  if (/van gogh|vangogh/i.test(lowerStyle)) {
    return `in the style of Vincent van Gogh, ${style}, swirling brushstrokes, post-impressionist, vibrant colors, thick impasto technique, emotional intensity`;
  } else if (/monet|impressionist/i.test(lowerStyle)) {
    return `in the style of Claude Monet, ${style}, soft brushstrokes, impressionist painting, natural lighting, atmospheric, dreamy`;
  } else if (/picasso|cubist/i.test(lowerStyle)) {
    return `in the style of Pablo Picasso, ${style}, cubist style, geometric shapes, multiple perspectives, abstract`;
  } else if (/dali|surreal/i.test(lowerStyle)) {
    return `in the style of Salvador Dali, ${style}, surrealist art, dreamlike, melting forms, hyperrealistic details`;
  } else if (/warhol|pop art/i.test(lowerStyle)) {
    return `in the style of Andy Warhol, ${style}, pop art style, bold colors, screen print effect, iconic`;
  }

  // Style categories
  if (/oil painting|oil/i.test(lowerStyle)) {
    return `${style}, masterpiece oil painting, visible brushstrokes, rich colors, gallery quality, classical technique`;
  } else if (/watercolor|water color/i.test(lowerStyle)) {
    return `${style}, beautiful watercolor painting, soft washes, wet-on-wet technique, delicate, ethereal`;
  } else if (/anime|manga|japanese/i.test(lowerStyle)) {
    return `${style}, high quality anime style, cel shaded, vibrant colors, detailed lineart, Studio Ghibli quality`;
  } else if (/cartoon|comic/i.test(lowerStyle)) {
    return `${style}, cartoon style illustration, bold outlines, vibrant colors, expressive`;
  } else if (/sketch|pencil|charcoal/i.test(lowerStyle)) {
    return `${style}, detailed pencil sketch, artistic shading, professional drawing, fine details`;
  } else if (/neon|cyberpunk|cyber/i.test(lowerStyle)) {
    return `${style}, neon lighting, cyberpunk aesthetic, glowing colors, futuristic, high contrast`;
  } else if (/vintage|retro|old/i.test(lowerStyle)) {
    return `${style}, vintage style, aged look, sepia tones, nostalgic, film grain`;
  } else if (/minimalist|minimal/i.test(lowerStyle)) {
    return `${style}, minimalist style, clean lines, simple shapes, limited color palette, modern`;
  } else if (/fantasy|magical|ethereal/i.test(lowerStyle)) {
    return `${style}, fantasy art style, magical lighting, ethereal glow, detailed, dreamlike`;
  } else if (/noir|black and white|monochrome/i.test(lowerStyle)) {
    return `${style}, film noir style, high contrast black and white, dramatic shadows, cinematic`;
  }

  // Default enhancement
  return `artistic style transformation, ${style}, high quality, detailed, professional`;
}

/**
 * Get appropriate prompt_strength value for SDXL img2img based on style type
 * Higher values (closer to 1.0) = more transformation, less original preserved
 * Lower values (closer to 0) = more original preserved, subtle style application
 */
function getStyleStrength(style: string): number {
  const lowerStyle = style.toLowerCase();

  // Heavy transformation styles need higher strength
  if (/anime|manga|cartoon|comic|cubist|picasso/i.test(lowerStyle)) {
    return 0.75;
  }
  // Artistic styles with moderate transformation
  if (/van gogh|monet|oil|watercolor|fantasy/i.test(lowerStyle)) {
    return 0.65;
  }
  // Subtle styles that preserve more of the original
  if (/vintage|retro|minimal|sketch/i.test(lowerStyle)) {
    return 0.5;
  }

  return 0.6; // Default - balanced transformation
}

/**
 * Get appropriate negative prompt for style transfer
 */
function getStyleNegativePrompt(style: string): string {
  const lowerStyle = style.toLowerCase();
  const base = 'blurry, low quality, distorted, deformed, ugly, bad composition';

  if (/anime|manga|cartoon/i.test(lowerStyle)) {
    return `${base}, photorealistic, 3d render, photograph`;
  }
  if (/photo|realistic/i.test(lowerStyle)) {
    return `${base}, cartoon, anime, drawing, illustration, painting`;
  }
  if (/oil|watercolor|painting/i.test(lowerStyle)) {
    return `${base}, photograph, digital art, 3d render`;
  }
  if (/sketch|pencil|charcoal/i.test(lowerStyle)) {
    return `${base}, color, photograph, digital art, 3d`;
  }

  return base;
}

/**
 * Convert sketch to image using ControlNet Scribble
 * jagilley/controlnet-scribble is specifically designed for converting sketches/scribbles to images
 * It properly follows the sketch structure to generate coherent images
 */
export async function sketchToImage(
  sketchUrl: string,
  prompt: string
): Promise<ProcessingResult> {
  const startTime = Date.now();
  try {
    // Build a simple, focused prompt - the sketch provides the structure
    const cleanPrompt = buildSketchPrompt(prompt);

    logger.info('replicate_sketch_to_image', {
      sketchUrl: sketchUrl.substring(0, 50),
      originalPrompt: prompt.substring(0, 50),
      cleanPrompt: cleanPrompt.substring(0, 100),
    });

    // jagilley/controlnet-scribble parameters:
    // - num_samples and image_resolution are strings, not numbers
    // - No 'structure' parameter needed - it's specifically a scribble model
    const output = await replicate.run(MODELS.sketchToImage, {
      input: {
        image: sketchUrl,
        prompt: cleanPrompt,
        num_samples: '1',
        image_resolution: '512',
        ddim_steps: 20,
        scale: 9,
        seed: Math.floor(Math.random() * 1000000),
        eta: 0,
        a_prompt: 'best quality, extremely detailed, sharp focus, high resolution',
        n_prompt: 'longbody, lowres, bad anatomy, bad hands, missing fingers, extra digit, fewer digits, cropped, worst quality, low quality, blurry, deformed',
      },
    });

    return {
      success: true,
      output: Array.isArray(serializeOutput(output)) ? (serializeOutput(output) as string[])[0] : serializeOutput(output),
      processingTime: Date.now() - startTime,
      model: 'controlnet-scribble',
    };
  } catch (error: any) {
    logger.error('replicate_sketch_to_image_error', { error: error.message });
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Build a simple, focused prompt for sketch-to-image
 * Keep it concise - the sketch provides the structure
 */
function buildSketchPrompt(prompt: string): string {
  // If prompt is very short or generic, just use it directly with quality modifiers
  if (prompt.length < 20) {
    return `${prompt}, high quality, detailed`;
  }

  // Otherwise, use the prompt as-is - the user knows what they want
  return prompt;
}

/**
 * Generate video from image
 */
export async function imageToVideo(
  imageUrl: string,
  motionBucketId: number = 127,
  fps: number = 7
): Promise<ProcessingResult> {
  const startTime = Date.now();
  try {
    logger.info('replicate_image_to_video', {
      imageUrl: imageUrl.substring(0, 50),
      fps,
    });

    const output = await replicate.run(MODELS.imageToVideo, {
      input: {
        cond_aug: 0.02,
        decoding_t: 14,
        input_image: imageUrl,
        video_length: '25_frames_with_svd_xt',
        sizing_strategy: 'maintain_aspect_ratio',
        motion_bucket_id: motionBucketId,
        fps: fps,
      },
    });

    return {
      success: true,
      output: serializeOutput(output),
      processingTime: Date.now() - startTime,
      model: 'stable-video-diffusion',
    };
  } catch (error: any) {
    logger.error('replicate_image_to_video_error', { error: error.message });
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Lip sync audio to video
 */
export async function lipSyncVideo(
  faceUrl: string,
  audioUrl: string
): Promise<ProcessingResult> {
  const startTime = Date.now();
  try {
    logger.info('replicate_lip_sync', {
      faceUrl: faceUrl.substring(0, 50),
      audioUrl: audioUrl.substring(0, 50),
    });

    const output = await replicate.run(MODELS.lipSync, {
      input: {
        face: faceUrl,
        audio: audioUrl,
      },
    });

    return {
      success: true,
      output: serializeOutput(output),
      processingTime: Date.now() - startTime,
      model: 'wav2lip',
    };
  } catch (error: any) {
    logger.error('replicate_lip_sync_error', { error: error.message });
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Generate music with intelligent prompt enhancement
 */
export async function generateMusic(
  prompt: string,
  durationSeconds: number = 8
): Promise<ProcessingResult> {
  const startTime = Date.now();
  try {
    // Enhance the music prompt for better results
    const enhancedPrompt = enhanceMusicPrompt(prompt);

    logger.info('replicate_generate_music', {
      originalPrompt: prompt.substring(0, 50),
      enhancedPrompt: enhancedPrompt.substring(0, 100),
    });

    const output = await replicate.run(MODELS.musicGeneration, {
      input: {
        prompt: enhancedPrompt,
        duration: durationSeconds,
        model_version: 'stereo-melody-large',
        output_format: 'mp3',
        normalization_strategy: 'peak',
      },
    });

    return {
      success: true,
      output: serializeOutput(output),
      processingTime: Date.now() - startTime,
      model: 'musicgen',
    };
  } catch (error: any) {
    logger.error('replicate_generate_music_error', { error: error.message });
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Enhance music generation prompt for better results
 */
function enhanceMusicPrompt(prompt: string): string {
  const lowerPrompt = prompt.toLowerCase();

  // Genre-specific enhancements
  if (/electronic|edm|techno|house|trance/i.test(lowerPrompt)) {
    return `${prompt}, synthesizers, drum machine, 128 bpm, club music, professional mix, clear bass`;
  } else if (/hip hop|rap|trap/i.test(lowerPrompt)) {
    return `${prompt}, 808 bass, hi-hats, snares, urban beat, professional production`;
  } else if (/rock|guitar|metal|punk/i.test(lowerPrompt)) {
    return `${prompt}, electric guitar, drums, bass guitar, energetic, professional recording`;
  } else if (/jazz|blues|swing/i.test(lowerPrompt)) {
    return `${prompt}, saxophone, piano, double bass, drums, improvisational, warm tones`;
  } else if (/classical|orchestra|symphony/i.test(lowerPrompt)) {
    return `${prompt}, orchestral instruments, strings, woodwinds, brass, timpani, concert hall acoustics`;
  } else if (/ambient|chill|relaxing|calm|meditation/i.test(lowerPrompt)) {
    return `${prompt}, atmospheric pads, soft textures, reverb, peaceful, slow tempo, soothing`;
  } else if (/pop|catchy|upbeat/i.test(lowerPrompt)) {
    return `${prompt}, catchy melody, verse chorus structure, modern production, radio-ready`;
  } else if (/cinematic|epic|film|trailer/i.test(lowerPrompt)) {
    return `${prompt}, orchestral, dramatic, building intensity, cinematic drums, emotional`;
  } else if (/lo-fi|lofi|study|background/i.test(lowerPrompt)) {
    return `${prompt}, lo-fi hip hop beats, vinyl crackle, mellow piano, jazzy chords, relaxed`;
  } else if (/country|folk|acoustic/i.test(lowerPrompt)) {
    return `${prompt}, acoustic guitar, fiddle, warm tones, storytelling feel, authentic`;
  } else if (/reggae|dub|island/i.test(lowerPrompt)) {
    return `${prompt}, offbeat guitar, bass grooves, drums, island vibes, laid back`;
  } else if (/funk|disco|groove/i.test(lowerPrompt)) {
    return `${prompt}, funky bass line, rhythmic guitar, brass section, groovy drums`;
  }

  // Mood-specific if no genre detected
  if (/happy|joyful|uplifting|energetic/i.test(lowerPrompt)) {
    return `${prompt}, major key, uplifting melody, energetic tempo, positive vibes`;
  } else if (/sad|melancholic|emotional|dramatic/i.test(lowerPrompt)) {
    return `${prompt}, minor key, emotional melody, expressive, heartfelt`;
  } else if (/scary|horror|tense|suspense/i.test(lowerPrompt)) {
    return `${prompt}, dissonant, suspenseful, dark atmosphere, tension building`;
  } else if (/romantic|love|gentle|soft/i.test(lowerPrompt)) {
    return `${prompt}, romantic melody, soft instrumentation, gentle, warm`;
  }

  // Default enhancement
  return `${prompt}, high quality audio, professional production, clear mix, balanced sound`;
}

/**
 * Text to speech using Bark
 * Voice presets: en_speaker_0 through en_speaker_9, or other languages like de_speaker_0, es_speaker_0, etc.
 */
export async function textToSpeech(
  text: string,
  voicePreset: string = 'en_speaker_6'
): Promise<ProcessingResult> {
  const startTime = Date.now();
  try {
    // Clean voice preset - remove v2/ prefix if present
    const cleanVoicePreset = voicePreset.replace(/^v2\//, '');

    logger.info('replicate_text_to_speech', { text: text.substring(0, 50), voicePreset: cleanVoicePreset });

    const output = await replicate.run(MODELS.textToSpeech, {
      input: {
        prompt: text,
        text_temp: 0.7,
        waveform_temp: 0.7,
        history_prompt: cleanVoicePreset,
      },
    });

    // Bark returns { audio_out: FileOutput } - serialize it properly
    let audioUrl: string;
    const outputData = output as any;
    if (outputData && outputData.audio_out) {
      // FileOutput has a url() method or can be stringified
      if (typeof outputData.audio_out === 'string') {
        audioUrl = outputData.audio_out;
      } else if (typeof outputData.audio_out.url === 'function') {
        audioUrl = outputData.audio_out.url();
      } else if (outputData.audio_out.href) {
        audioUrl = outputData.audio_out.href;
      } else {
        audioUrl = String(outputData.audio_out);
      }
    } else {
      audioUrl = serializeOutput(output) as string;
    }

    logger.info('replicate_text_to_speech_result', { audioUrl: audioUrl?.substring(0, 100) });

    return {
      success: true,
      output: audioUrl,
      processingTime: Date.now() - startTime,
      model: 'bark',
    };
  } catch (error: any) {
    logger.error('replicate_text_to_speech_error', { error: error.message });
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
    };
  }
}

/**
 * Replace background with a new one
 */
export async function replaceBackground(
  imageUrl: string,
  newBackgroundPrompt: string
): Promise<ProcessingResult> {
  const startTime = Date.now();
  try {
    // Step 1: Remove background
    const bgRemoved = await removeBackground(imageUrl);
    if (!bgRemoved.success) {
      return bgRemoved;
    }

    // Step 2: Generate new background
    const newBg = await generateImage(newBackgroundPrompt, '', 1024, 1024);
    if (!newBg.success) {
      return newBg;
    }

    // Return both the subject with transparent bg and the generated background
    return {
      success: true,
      output: [bgRemoved.output as string, (newBg.output as string[])[0]],
      processingTime: Date.now() - startTime,
      model: 'rembg + sdxl',
    };
  } catch (error: any) {
    logger.error('replicate_replace_background_error', { error: error.message });
    return {
      success: false,
      error: error.message,
      processingTime: Date.now() - startTime,
    };
  }
}

// Export the replicate client for advanced usage
export { replicate };
