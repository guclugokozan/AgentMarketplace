/**
 * Higgsfield AI Agents Registry
 *
 * This module exports all 20 Higgsfield-inspired AI agents for the Agent Marketplace.
 * Each agent provides specialized AI capabilities for media generation and manipulation.
 *
 * Categories:
 * - Image Generation (01, 06, 08, 09, 17)
 * - Video Generation (02, 03, 04, 05, 12, 15)
 * - Character & Avatar (07, 10)
 * - Motion Graphics (11, 16)
 * - Audio (18, 19)
 * - General AI (13, 14, 20)
 *
 * Biometric Operations (require consent):
 * - 03: Face Swap Video
 * - 04: Lipsync Studio
 * - 19: Voice Cloner
 */

// Image Generation Agents
export { imageGeneratorAgent } from './01-image-generator/index.js';
export { imageInpaintingAgent } from './06-image-inpainting/index.js';
export { styleTransferAgent } from './08-style-transfer/index.js';
export { productEnhancerAgent } from './09-product-enhancer/index.js';
export { sketchToImageAgent } from './17-sketch-to-image/index.js';

// Video Generation Agents
export { videoGeneratorAgent } from './02-video-generator/index.js';
export { faceSwapVideoAgent } from './03-face-swap-video/index.js';
export { lipsyncStudioAgent } from './04-lipsync-studio/index.js';
export { videoUpscalerAgent } from './05-video-upscaler/index.js';
export { vfxTransformerAgent } from './12-vfx-transformer/index.js';
export { videoEffectsAgent } from './15-video-effects/index.js';

// Character & Avatar Agents
export { characterCreatorAgent } from './07-character-creator/index.js';
export { avatarGeneratorAgent } from './10-avatar-generator/index.js';

// Motion Graphics & Storyboard Agents
export { storyboardGeneratorAgent } from './11-storyboard-generator/index.js';
export { motionGraphicsAgent } from './16-motion-graphics/index.js';

// Audio Agents
export { musicGeneratorAgent } from './18-music-generator/index.js';
export { voiceClonerAgent } from './19-voice-cloner/index.js';

// General AI Agents
export { adGeneratorAgent } from './13-ad-generator/index.js';
export { photoEditorAgent } from './14-photo-editor/index.js';
export { aiAssistantAgent } from './20-ai-assistant/index.js';

// =============================================================================
// AGENT REGISTRY
// =============================================================================

import { imageGeneratorAgent } from './01-image-generator/index.js';
import { videoGeneratorAgent } from './02-video-generator/index.js';
import { faceSwapVideoAgent } from './03-face-swap-video/index.js';
import { lipsyncStudioAgent } from './04-lipsync-studio/index.js';
import { videoUpscalerAgent } from './05-video-upscaler/index.js';
import { imageInpaintingAgent } from './06-image-inpainting/index.js';
import { characterCreatorAgent } from './07-character-creator/index.js';
import { styleTransferAgent } from './08-style-transfer/index.js';
import { productEnhancerAgent } from './09-product-enhancer/index.js';
import { avatarGeneratorAgent } from './10-avatar-generator/index.js';
import { storyboardGeneratorAgent } from './11-storyboard-generator/index.js';
import { vfxTransformerAgent } from './12-vfx-transformer/index.js';
import { adGeneratorAgent } from './13-ad-generator/index.js';
import { photoEditorAgent } from './14-photo-editor/index.js';
import { videoEffectsAgent } from './15-video-effects/index.js';
import { motionGraphicsAgent } from './16-motion-graphics/index.js';
import { sketchToImageAgent } from './17-sketch-to-image/index.js';
import { musicGeneratorAgent } from './18-music-generator/index.js';
import { voiceClonerAgent } from './19-voice-cloner/index.js';
import { aiAssistantAgent } from './20-ai-assistant/index.js';

/**
 * Complete registry of all Higgsfield agents
 */
export const higgsFieldAgents = {
  // Image Generation
  'image-generator': imageGeneratorAgent,
  'image-inpainting': imageInpaintingAgent,
  'style-transfer': styleTransferAgent,
  'product-enhancer': productEnhancerAgent,
  'sketch-to-image': sketchToImageAgent,

  // Video Generation
  'video-generator': videoGeneratorAgent,
  'face-swap-video': faceSwapVideoAgent,
  'lipsync-studio': lipsyncStudioAgent,
  'video-upscaler': videoUpscalerAgent,
  'vfx-transformer': vfxTransformerAgent,
  'video-effects': videoEffectsAgent,

  // Character & Avatar
  'character-creator': characterCreatorAgent,
  'avatar-generator': avatarGeneratorAgent,

  // Motion Graphics & Storyboard
  'storyboard-generator': storyboardGeneratorAgent,
  'motion-graphics': motionGraphicsAgent,

  // Audio
  'music-generator': musicGeneratorAgent,
  'voice-cloner': voiceClonerAgent,

  // General AI
  'ad-generator': adGeneratorAgent,
  'photo-editor': photoEditorAgent,
  'ai-assistant': aiAssistantAgent,
} as const;

/**
 * List of agent names
 */
export const higgsFieldAgentNames = Object.keys(higgsFieldAgents) as Array<keyof typeof higgsFieldAgents>;

/**
 * Agent metadata for marketplace listing
 */
export const higgsFieldAgentMetadata = [
  {
    id: 'image-generator',
    name: 'Image Generator',
    description: 'AI-powered image generation with DALL-E 3, SDXL, and FLUX models',
    category: 'image',
    tags: ['image', 'generation', 'dall-e', 'sdxl', 'flux'],
    requiresConsent: false,
    estimatedCost: 'medium',
    processingTime: 'fast',
  },
  {
    id: 'video-generator',
    name: 'Video Generator',
    description: 'Create videos from text or images using Runway Gen-3',
    category: 'video',
    tags: ['video', 'generation', 'runway', 'text-to-video'],
    requiresConsent: false,
    estimatedCost: 'high',
    processingTime: 'slow',
  },
  {
    id: 'face-swap-video',
    name: 'Face Swap Video',
    description: 'Swap faces in videos with AI (requires consent)',
    category: 'video',
    tags: ['video', 'face-swap', 'deepfake'],
    requiresConsent: true,
    estimatedCost: 'high',
    processingTime: 'slow',
  },
  {
    id: 'lipsync-studio',
    name: 'Lipsync Studio',
    description: 'AI-powered video lip synchronization (requires consent)',
    category: 'video',
    tags: ['video', 'lipsync', 'dubbing', 'voice'],
    requiresConsent: true,
    estimatedCost: 'high',
    processingTime: 'slow',
  },
  {
    id: 'video-upscaler',
    name: 'Video Upscaler',
    description: 'Upscale and enhance video quality with AI',
    category: 'video',
    tags: ['video', 'upscale', 'enhancement', '4k'],
    requiresConsent: false,
    estimatedCost: 'medium',
    processingTime: 'slow',
  },
  {
    id: 'image-inpainting',
    name: 'Image Inpainting',
    description: 'AI-powered image editing and object removal',
    category: 'image',
    tags: ['image', 'inpainting', 'editing', 'removal'],
    requiresConsent: false,
    estimatedCost: 'medium',
    processingTime: 'fast',
  },
  {
    id: 'character-creator',
    name: 'Character Creator',
    description: 'Create and manage consistent AI characters',
    category: 'character',
    tags: ['character', 'avatar', 'consistent', 'identity'],
    requiresConsent: false,
    estimatedCost: 'medium',
    processingTime: 'medium',
  },
  {
    id: 'style-transfer',
    name: 'Style Transfer',
    description: 'Apply artistic styles to images and videos',
    category: 'image',
    tags: ['style', 'transfer', 'artistic', 'filter'],
    requiresConsent: false,
    estimatedCost: 'low',
    processingTime: 'fast',
  },
  {
    id: 'product-enhancer',
    name: 'Product Enhancer',
    description: 'AI-powered product photo enhancement for e-commerce',
    category: 'image',
    tags: ['product', 'e-commerce', 'enhancement', 'photography'],
    requiresConsent: false,
    estimatedCost: 'medium',
    processingTime: 'medium',
  },
  {
    id: 'avatar-generator',
    name: 'Avatar Generator',
    description: 'Generate stylized avatars from photos or descriptions',
    category: 'character',
    tags: ['avatar', 'profile', 'gaming', 'social'],
    requiresConsent: false,
    estimatedCost: 'medium',
    processingTime: 'fast',
  },
  {
    id: 'storyboard-generator',
    name: 'Storyboard Generator',
    description: 'Create visual storyboards from scripts',
    category: 'creative',
    tags: ['storyboard', 'script', 'film', 'animation'],
    requiresConsent: false,
    estimatedCost: 'high',
    processingTime: 'slow',
  },
  {
    id: 'vfx-transformer',
    name: 'VFX Transformer',
    description: 'Apply visual effects and transformations to videos',
    category: 'video',
    tags: ['vfx', 'effects', 'color-grading', 'filters'],
    requiresConsent: false,
    estimatedCost: 'medium',
    processingTime: 'medium',
  },
  {
    id: 'ad-generator',
    name: 'Ad Generator',
    description: 'Create advertisements for multiple platforms',
    category: 'marketing',
    tags: ['ads', 'marketing', 'social-media', 'creative'],
    requiresConsent: false,
    estimatedCost: 'medium',
    processingTime: 'medium',
  },
  {
    id: 'photo-editor',
    name: 'Photo Editor',
    description: 'Professional AI-powered photo editing',
    category: 'image',
    tags: ['photo', 'editing', 'retouching', 'enhancement'],
    requiresConsent: false,
    estimatedCost: 'low',
    processingTime: 'fast',
  },
  {
    id: 'video-effects',
    name: 'Video Effects',
    description: 'Apply color grading, transitions, and effects',
    category: 'video',
    tags: ['video', 'effects', 'transitions', 'color'],
    requiresConsent: false,
    estimatedCost: 'medium',
    processingTime: 'medium',
  },
  {
    id: 'motion-graphics',
    name: 'Motion Graphics',
    description: 'Create animated titles, lower thirds, and graphics',
    category: 'video',
    tags: ['motion', 'graphics', 'animation', 'titles'],
    requiresConsent: false,
    estimatedCost: 'medium',
    processingTime: 'medium',
  },
  {
    id: 'sketch-to-image',
    name: 'Sketch to Image',
    description: 'Convert sketches and doodles to realistic images',
    category: 'image',
    tags: ['sketch', 'drawing', 'conversion', 'art'],
    requiresConsent: false,
    estimatedCost: 'medium',
    processingTime: 'fast',
  },
  {
    id: 'music-generator',
    name: 'Music Generator',
    description: 'AI-powered music and sound effect generation',
    category: 'audio',
    tags: ['music', 'audio', 'sound-effects', 'generation'],
    requiresConsent: false,
    estimatedCost: 'medium',
    processingTime: 'medium',
  },
  {
    id: 'voice-cloner',
    name: 'Voice Cloner',
    description: 'Clone and synthesize voices with AI (requires consent)',
    category: 'audio',
    tags: ['voice', 'cloning', 'synthesis', 'tts'],
    requiresConsent: true,
    estimatedCost: 'high',
    processingTime: 'medium',
  },
  {
    id: 'ai-assistant',
    name: 'AI Assistant',
    description: 'Intelligent conversational AI with memory and orchestration',
    category: 'assistant',
    tags: ['assistant', 'chat', 'memory', 'orchestration'],
    requiresConsent: false,
    estimatedCost: 'low',
    processingTime: 'fast',
  },
];

/**
 * Get agent by name
 */
export function getHiggsFieldAgent(name: keyof typeof higgsFieldAgents) {
  return higgsFieldAgents[name];
}

/**
 * Get agents by category
 */
export function getHiggsFieldAgentsByCategory(category: string) {
  return higgsFieldAgentMetadata
    .filter(a => a.category === category)
    .map(a => ({
      ...a,
      agent: higgsFieldAgents[a.id as keyof typeof higgsFieldAgents],
    }));
}

/**
 * Get agents that require consent
 */
export function getConsentRequiredAgents() {
  return higgsFieldAgentMetadata
    .filter(a => a.requiresConsent)
    .map(a => ({
      ...a,
      agent: higgsFieldAgents[a.id as keyof typeof higgsFieldAgents],
    }));
}

/**
 * Search agents by tags
 */
export function searchHiggsFieldAgents(query: string) {
  const lowerQuery = query.toLowerCase();
  return higgsFieldAgentMetadata.filter(a =>
    a.name.toLowerCase().includes(lowerQuery) ||
    a.description.toLowerCase().includes(lowerQuery) ||
    a.tags.some(t => t.includes(lowerQuery))
  );
}

export default higgsFieldAgents;
