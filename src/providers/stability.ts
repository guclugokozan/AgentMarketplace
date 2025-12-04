/**
 * Stability AI Provider
 *
 * Handles Stable Diffusion image generation, upscaling, and editing.
 */

import { BaseProvider, ProviderConfig, requireApiKey } from './base.js';

// Types
export interface StabilityGenerateParams {
  prompt: string;
  negativePrompt?: string;
  model?: 'stable-diffusion-xl-1024-v1-0' | 'stable-diffusion-v1-6' | 'sd3' | 'sd3-turbo';
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  samples?: number;
  stylePreset?: string;
}

export interface StabilityUpscaleParams {
  image: Buffer | string;
  width?: number;
  height?: number;
  model?: 'esrgan-v1-x2plus' | 'stable-diffusion-x4-latent-upscaler';
}

export interface StabilityInpaintParams {
  image: Buffer | string;
  mask: Buffer | string;
  prompt: string;
  negativePrompt?: string;
  model?: string;
  steps?: number;
  cfgScale?: number;
  seed?: number;
}

export interface StabilityImageToImageParams {
  image: Buffer | string;
  prompt: string;
  negativePrompt?: string;
  model?: string;
  strength?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  stylePreset?: string;
}

export interface GeneratedArtifact {
  base64: string;
  seed: number;
  finishReason: string;
}

interface StabilityResponse {
  artifacts: Array<{
    base64: string;
    seed: number;
    finishReason: string;
  }>;
}

export class StabilityProvider extends BaseProvider {
  constructor(config?: Partial<ProviderConfig>) {
    super('Stability', {
      apiKey: config?.apiKey || requireApiKey('STABILITY_API_KEY', 'Stability AI'),
      baseUrl: config?.baseUrl || 'https://api.stability.ai/v1',
      timeout: config?.timeout || 120000, // 2 minutes for generation
      ...config,
    });
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.apiKey}`,
      Accept: 'application/json',
    };
  }

  /**
   * Generate images with Stable Diffusion
   */
  async generate(params: StabilityGenerateParams): Promise<GeneratedArtifact[]> {
    const engineId = params.model || 'stable-diffusion-xl-1024-v1-0';

    const response = await this.fetchWithRetry<StabilityResponse>(
      `${this.config.baseUrl}/generation/${engineId}/text-to-image`,
      {
        method: 'POST',
        body: JSON.stringify({
          text_prompts: [
            { text: params.prompt, weight: 1 },
            ...(params.negativePrompt
              ? [{ text: params.negativePrompt, weight: -1 }]
              : []),
          ],
          width: params.width || 1024,
          height: params.height || 1024,
          steps: params.steps || 30,
          cfg_scale: params.cfgScale || 7,
          seed: params.seed,
          samples: params.samples || 1,
          style_preset: params.stylePreset,
        }),
      }
    );

    return response.artifacts.map((a) => ({
      base64: a.base64,
      seed: a.seed,
      finishReason: a.finishReason,
    }));
  }

  /**
   * Generate SD3 images (newer API)
   */
  async generateSD3(params: {
    prompt: string;
    negativePrompt?: string;
    model?: 'sd3' | 'sd3-turbo';
    aspectRatio?: '1:1' | '16:9' | '21:9' | '2:3' | '3:2' | '4:5' | '5:4' | '9:16' | '9:21';
    seed?: number;
    outputFormat?: 'png' | 'jpeg';
  }): Promise<{ image: string; seed: number }> {
    const formData = new FormData();
    formData.append('prompt', params.prompt);
    if (params.negativePrompt) {
      formData.append('negative_prompt', params.negativePrompt);
    }
    formData.append('model', params.model || 'sd3');
    formData.append('aspect_ratio', params.aspectRatio || '1:1');
    if (params.seed !== undefined) {
      formData.append('seed', String(params.seed));
    }
    formData.append('output_format', params.outputFormat || 'png');

    const response = await this.fetchWithRetry<{ image: string; seed: number }>(
      'https://api.stability.ai/v2beta/stable-image/generate/sd3',
      {
        method: 'POST',
        body: formData as unknown as BodyInit,
        headers: {
          Accept: 'application/json',
        },
      }
    );

    return response;
  }

  /**
   * Upscale an image
   */
  async upscale(params: StabilityUpscaleParams): Promise<GeneratedArtifact> {
    const formData = new FormData();

    if (Buffer.isBuffer(params.image)) {
      formData.append('image', new Blob([params.image]), 'image.png');
    } else {
      // Assume base64
      const buffer = Buffer.from(params.image, 'base64');
      formData.append('image', new Blob([buffer]), 'image.png');
    }

    if (params.width) formData.append('width', String(params.width));
    if (params.height) formData.append('height', String(params.height));

    const engineId = params.model || 'esrgan-v1-x2plus';

    const response = await this.fetchWithRetry<StabilityResponse>(
      `${this.config.baseUrl}/generation/${engineId}/image-to-image/upscale`,
      {
        method: 'POST',
        body: formData as unknown as BodyInit,
        headers: {
          Accept: 'application/json',
        },
      }
    );

    return response.artifacts[0];
  }

  /**
   * Inpaint an image
   */
  async inpaint(params: StabilityInpaintParams): Promise<GeneratedArtifact[]> {
    const formData = new FormData();

    // Add image
    if (Buffer.isBuffer(params.image)) {
      formData.append('init_image', new Blob([params.image]), 'image.png');
    } else {
      const buffer = Buffer.from(params.image, 'base64');
      formData.append('init_image', new Blob([buffer]), 'image.png');
    }

    // Add mask
    if (Buffer.isBuffer(params.mask)) {
      formData.append('mask_image', new Blob([params.mask]), 'mask.png');
    } else {
      const buffer = Buffer.from(params.mask, 'base64');
      formData.append('mask_image', new Blob([buffer]), 'mask.png');
    }

    formData.append('text_prompts[0][text]', params.prompt);
    formData.append('text_prompts[0][weight]', '1');

    if (params.negativePrompt) {
      formData.append('text_prompts[1][text]', params.negativePrompt);
      formData.append('text_prompts[1][weight]', '-1');
    }

    if (params.steps) formData.append('steps', String(params.steps));
    if (params.cfgScale) formData.append('cfg_scale', String(params.cfgScale));
    if (params.seed) formData.append('seed', String(params.seed));

    const engineId = params.model || 'stable-diffusion-xl-1024-v1-0';

    const response = await this.fetchWithRetry<StabilityResponse>(
      `${this.config.baseUrl}/generation/${engineId}/image-to-image/masking`,
      {
        method: 'POST',
        body: formData as unknown as BodyInit,
        headers: {
          Accept: 'application/json',
        },
      }
    );

    return response.artifacts;
  }

  /**
   * Image-to-image transformation
   */
  async imageToImage(params: StabilityImageToImageParams): Promise<GeneratedArtifact[]> {
    const formData = new FormData();

    if (Buffer.isBuffer(params.image)) {
      formData.append('init_image', new Blob([params.image]), 'image.png');
    } else {
      const buffer = Buffer.from(params.image, 'base64');
      formData.append('init_image', new Blob([buffer]), 'image.png');
    }

    formData.append('text_prompts[0][text]', params.prompt);
    formData.append('text_prompts[0][weight]', '1');

    if (params.negativePrompt) {
      formData.append('text_prompts[1][text]', params.negativePrompt);
      formData.append('text_prompts[1][weight]', '-1');
    }

    formData.append('image_strength', String(1 - (params.strength || 0.35)));
    if (params.steps) formData.append('steps', String(params.steps));
    if (params.cfgScale) formData.append('cfg_scale', String(params.cfgScale));
    if (params.seed) formData.append('seed', String(params.seed));
    if (params.stylePreset) formData.append('style_preset', params.stylePreset);

    const engineId = params.model || 'stable-diffusion-xl-1024-v1-0';

    const response = await this.fetchWithRetry<StabilityResponse>(
      `${this.config.baseUrl}/generation/${engineId}/image-to-image`,
      {
        method: 'POST',
        body: formData as unknown as BodyInit,
        headers: {
          Accept: 'application/json',
        },
      }
    );

    return response.artifacts;
  }

  /**
   * Get available style presets
   */
  getStylePresets(): string[] {
    return [
      '3d-model',
      'analog-film',
      'anime',
      'cinematic',
      'comic-book',
      'digital-art',
      'enhance',
      'fantasy-art',
      'isometric',
      'line-art',
      'low-poly',
      'modeling-compound',
      'neon-punk',
      'origami',
      'photographic',
      'pixel-art',
      'tile-texture',
    ];
  }

  /**
   * Get estimated cost
   */
  getEstimatedCost(
    operation: 'generate' | 'upscale' | 'inpaint' | 'img2img',
    steps: number = 30
  ): number {
    // Rough pricing based on credits
    const creditsPerDollar = 1000;
    const creditCosts: Record<string, number> = {
      generate: steps * 0.2,
      upscale: 20,
      inpaint: steps * 0.2,
      img2img: steps * 0.2,
    };

    return (creditCosts[operation] || 10) / creditsPerDollar;
  }
}

// Singleton instance
let instance: StabilityProvider | null = null;

export function getStabilityProvider(): StabilityProvider {
  if (!instance) {
    instance = new StabilityProvider();
  }
  return instance;
}
