/**
 * MuleRun Agent Registry
 *
 * Central registry for all MuleRun-inspired agents.
 * Provides agent discovery, metadata, and categorization.
 */

import { createLogger } from '../logging/logger.js';
import { checkAgentProviders, AGENT_PROVIDERS, getAgentCostEstimate } from '../config/providers.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// TYPES
// =============================================================================

export type AgentCategory =
  | 'analytics'
  | 'ecommerce'
  | 'creative'
  | 'productivity'
  | 'marketing'
  | 'translation'
  | 'content'
  | 'business'
  | 'higgsfield-image'
  | 'higgsfield-video'
  | 'higgsfield-audio'
  | 'higgsfield-ai';

export type AgentTier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface AgentMetadata {
  id: string;
  name: string;
  description: string;
  category: AgentCategory;
  tier: AgentTier;
  version: string;
  async: boolean; // Requires job queue
  estimatedDuration: {
    min: number; // seconds
    max: number;
  };
  inputTypes: string[];
  outputTypes: string[];
  providers: string[];
  features: string[];
  useCases: string[];
}

export interface AgentRegistryEntry {
  metadata: AgentMetadata;
  // Dynamic import path - agents loaded on demand
  importPath: string;
  available: boolean;
  unavailableReason?: string;
}

// =============================================================================
// AGENT METADATA
// =============================================================================

const AGENT_METADATA: AgentMetadata[] = [
  // ANALYTICS
  {
    id: 'smart-data-analyzer',
    name: 'Smart Data Analyzer',
    description: 'AI-powered data analysis with pattern detection, anomaly identification, and natural language insights',
    category: 'analytics',
    tier: 'starter',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 5, max: 60 },
    inputTypes: ['csv', 'json', 'text'],
    outputTypes: ['json', 'text'],
    providers: ['anthropic'],
    features: ['Statistical analysis', 'Correlation detection', 'Anomaly detection', 'Data quality assessment', 'Natural language summaries'],
    useCases: ['Business intelligence', 'Data exploration', 'Report generation', 'Quality auditing'],
  },
  {
    id: 'data-visualization',
    name: 'Data Visualization Advisor',
    description: 'Get AI-powered suggestions for the best data visualization approaches',
    category: 'analytics',
    tier: 'free',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 5, max: 30 },
    inputTypes: ['text', 'json'],
    outputTypes: ['json', 'text'],
    providers: ['anthropic', 'openai'],
    features: ['Chart recommendations', 'Visualization best practices', 'Data structure analysis', 'Color scheme suggestions'],
    useCases: ['Dashboard design', 'Report creation', 'Data presentation', 'Analytics'],
  },

  // E-COMMERCE
  {
    id: 'virtual-try-on',
    name: 'Virtual Try-On',
    description: 'AI-powered virtual clothing try-on for e-commerce',
    category: 'ecommerce',
    tier: 'pro',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 30, max: 120 },
    inputTypes: ['image/png', 'image/jpeg', 'image/webp'],
    outputTypes: ['image/png'],
    providers: ['anthropic', 'replicate'],
    features: ['Person validation', 'Garment classification', 'Virtual fitting', 'Multiple garment types'],
    useCases: ['E-commerce', 'Fashion retail', 'Virtual fitting rooms'],
  },
  {
    id: 'ai-background-generator',
    name: 'AI Background Generator',
    description: 'Generate professional backgrounds for product photography',
    category: 'ecommerce',
    tier: 'starter',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 15, max: 90 },
    inputTypes: ['image/png', 'image/jpeg', 'image/webp'],
    outputTypes: ['image/png'],
    providers: ['anthropic', 'replicate'],
    features: ['Background removal', 'AI background generation', 'Preset backgrounds', 'Custom prompts'],
    useCases: ['Product photography', 'E-commerce listings', 'Marketing materials'],
  },
  {
    id: 'product-description-writer',
    name: 'Product Description Writer',
    description: 'Generate compelling product descriptions optimized for different platforms',
    category: 'ecommerce',
    tier: 'free',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 5, max: 30 },
    inputTypes: ['json', 'text'],
    outputTypes: ['text', 'json'],
    providers: ['anthropic'],
    features: ['Platform optimization', 'SEO integration', 'Multiple variations', 'Benefit highlighting'],
    useCases: ['E-commerce listings', 'Product catalogs', 'Marketing copy'],
  },

  // CREATIVE
  {
    id: 'pro-headshot-generator',
    name: 'Pro Headshot Generator',
    description: 'Transform casual photos into professional headshots',
    category: 'creative',
    tier: 'pro',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 30, max: 180 },
    inputTypes: ['image/png', 'image/jpeg', 'image/webp'],
    outputTypes: ['image/png'],
    providers: ['anthropic', 'replicate'],
    features: ['Face validation', 'Style presets', 'Background options', 'Face enhancement'],
    useCases: ['LinkedIn profiles', 'Corporate headshots', 'Professional portfolios'],
  },

  // PRODUCTIVITY
  {
    id: 'resume-builder',
    name: 'Resume Builder',
    description: 'AI-powered resume optimization with ATS scoring and keyword analysis',
    category: 'productivity',
    tier: 'starter',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 10, max: 60 },
    inputTypes: ['text', 'json', 'pdf'],
    outputTypes: ['markdown', 'html', 'json'],
    providers: ['anthropic'],
    features: ['ATS optimization', 'Keyword analysis', 'Multiple formats', 'Job matching'],
    useCases: ['Job applications', 'Career transitions', 'Resume optimization'],
  },
  {
    id: 'meeting-transcriber',
    name: 'Meeting Transcriber',
    description: 'Transcribe meetings with speaker identification, summaries, and action items',
    category: 'productivity',
    tier: 'pro',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 60, max: 600 },
    inputTypes: ['audio/mp3', 'audio/wav', 'video/mp4', 'audio/m4a'],
    outputTypes: ['text', 'srt', 'vtt', 'json'],
    providers: ['anthropic', 'openai'],
    features: ['Whisper transcription', 'Speaker identification', 'Action item extraction', 'Meeting summaries'],
    useCases: ['Meeting notes', 'Podcast transcription', 'Video captioning'],
  },
  {
    id: 'email-template-generator',
    name: 'Email Template Generator',
    description: 'Generate professional email templates with A/B variants',
    category: 'productivity',
    tier: 'free',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 5, max: 30 },
    inputTypes: ['json', 'text'],
    outputTypes: ['text', 'html'],
    providers: ['anthropic'],
    features: ['Multiple email types', 'Personalization tokens', 'A/B variants', 'Subject line optimization'],
    useCases: ['Sales outreach', 'Marketing campaigns', 'Customer communication'],
  },

  // MARKETING
  {
    id: 'seo-content-optimizer',
    name: 'SEO Content Optimizer',
    description: 'Analyze and optimize content for search engines',
    category: 'marketing',
    tier: 'starter',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 10, max: 60 },
    inputTypes: ['text', 'html'],
    outputTypes: ['json'],
    providers: ['anthropic'],
    features: ['Keyword analysis', 'Readability scoring', 'Meta tag optimization', 'Content structure analysis'],
    useCases: ['Blog optimization', 'Landing pages', 'Content marketing'],
  },
  {
    id: 'social-media-caption-generator',
    name: 'Social Media Caption Generator',
    description: 'Generate platform-optimized social media captions with hashtags',
    category: 'marketing',
    tier: 'free',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 5, max: 20 },
    inputTypes: ['json', 'text'],
    outputTypes: ['json'],
    providers: ['anthropic'],
    features: ['Platform optimization', 'Hashtag generation', 'Multiple variations', 'CTA suggestions'],
    useCases: ['Social media marketing', 'Content creation', 'Brand management'],
  },

  // TRANSLATION
  {
    id: 'image-translator',
    name: 'Image Translator',
    description: 'Extract and translate text from images',
    category: 'translation',
    tier: 'pro',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 15, max: 90 },
    inputTypes: ['image/png', 'image/jpeg', 'image/webp'],
    outputTypes: ['json', 'text'],
    providers: ['anthropic', 'openai'],
    features: ['GPT-4 Vision OCR', '40+ languages', 'Text position detection', 'Batch processing'],
    useCases: ['Document translation', 'Screenshot translation', 'Sign translation'],
  },

  // CONTENT
  {
    id: 'video-script-generator',
    name: 'Video Script Generator',
    description: 'Generate engaging video scripts with hooks and timing markers',
    category: 'content',
    tier: 'starter',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 10, max: 60 },
    inputTypes: ['json', 'text'],
    outputTypes: ['json', 'text'],
    providers: ['anthropic'],
    features: ['Platform-specific scripts', 'Hook generation', 'B-roll suggestions', 'Timing markers'],
    useCases: ['YouTube videos', 'TikTok content', 'Educational videos', 'Marketing videos'],
  },

  // BUSINESS
  {
    id: 'customer-support-bot',
    name: 'Customer Support Bot',
    description: 'AI customer support with intent classification and escalation',
    category: 'business',
    tier: 'pro',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 2, max: 15 },
    inputTypes: ['text', 'json'],
    outputTypes: ['json'],
    providers: ['anthropic'],
    features: ['Intent classification', 'Sentiment analysis', 'Knowledge base search', 'Escalation handling'],
    useCases: ['Customer service', 'Help desk', 'FAQ automation'],
  },

  // =============================================================================
  // HIGGSFIELD AI AGENTS (20 agents)
  // =============================================================================

  // HIGGSFIELD IMAGE AGENTS
  {
    id: 'background-remover',
    name: 'Background Remover',
    description: 'Remove backgrounds from images instantly using AI',
    category: 'higgsfield-image',
    tier: 'starter',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 5, max: 30 },
    inputTypes: ['image/png', 'image/jpeg', 'image/webp'],
    outputTypes: ['image/png'],
    providers: ['replicate'],
    features: ['Instant removal', 'High quality edges', 'Transparent PNG output', 'Batch processing'],
    useCases: ['Product photography', 'Portrait editing', 'Marketing materials', 'E-commerce'],
  },
  {
    id: 'face-swap',
    name: 'Face Swap',
    description: 'Swap faces between two images seamlessly using AI',
    category: 'higgsfield-image',
    tier: 'pro',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 30, max: 120 },
    inputTypes: ['image/png', 'image/jpeg'],
    outputTypes: ['image/png'],
    providers: ['replicate'],
    features: ['High quality swap', 'Face detection', 'Natural blending', 'Multiple faces'],
    useCases: ['Entertainment', 'Creative projects', 'Social media', 'Film production'],
  },
  {
    id: 'portrait-retoucher',
    name: 'Portrait Retoucher',
    description: 'Professional portrait retouching and enhancement',
    category: 'higgsfield-image',
    tier: 'starter',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 10, max: 45 },
    inputTypes: ['image/png', 'image/jpeg'],
    outputTypes: ['image/png'],
    providers: ['replicate'],
    features: ['Skin smoothing', 'Blemish removal', 'Natural enhancement', 'Color correction'],
    useCases: ['Portrait photography', 'Professional headshots', 'Social media', 'Beauty'],
  },
  {
    id: 'ai-model-swap',
    name: 'AI Model Swap',
    description: 'Swap fashion models in product photos while keeping garments intact',
    category: 'higgsfield-image',
    tier: 'pro',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 45, max: 180 },
    inputTypes: ['image/png', 'image/jpeg'],
    outputTypes: ['image/png'],
    providers: ['replicate'],
    features: ['Model replacement', 'Garment preservation', 'Pose matching', 'Natural results'],
    useCases: ['Fashion photography', 'E-commerce', 'Marketing', 'Catalog production'],
  },
  {
    id: 'image-generator',
    name: 'Image Generator',
    description: 'Multi-provider AI image generation using DALL-E 3, Stability AI, and Flux models',
    category: 'higgsfield-image',
    tier: 'pro',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 10, max: 120 },
    inputTypes: ['text', 'json'],
    outputTypes: ['image/png', 'image/jpeg'],
    providers: ['openai', 'stability', 'replicate'],
    features: ['DALL-E 3', 'Stability SDXL', 'Flux Models', 'Multiple Styles', 'Batch Generation'],
    useCases: ['Marketing visuals', 'Social media content', 'Product mockups', 'Creative projects'],
  },
  {
    id: 'headshot-generator',
    name: 'Headshot Generator',
    description: 'Professional AI headshots from casual photos with multiple styles',
    category: 'higgsfield-image',
    tier: 'pro',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 30, max: 180 },
    inputTypes: ['image/png', 'image/jpeg'],
    outputTypes: ['image/png'],
    providers: ['replicate', 'stability'],
    features: ['Professional Styles', 'Background Removal', 'Lighting Enhancement', 'Multiple Outputs'],
    useCases: ['LinkedIn profiles', 'Corporate headshots', 'Professional portfolios'],
  },
  {
    id: 'character-creator',
    name: 'Character Creator',
    description: 'Consistent AI character generation with persistence and multiple poses',
    category: 'higgsfield-image',
    tier: 'pro',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 15, max: 90 },
    inputTypes: ['text', 'image/png', 'json'],
    outputTypes: ['image/png', 'json'],
    providers: ['replicate', 'stability'],
    features: ['Character Consistency', 'Multiple Poses', 'Style Transfer', 'Database Persistence'],
    useCases: ['Game development', 'Animation', 'Storytelling', 'Brand mascots'],
  },
  {
    id: 'image-upscaler',
    name: 'Image Upscaler',
    description: 'AI image upscaling and enhancement up to 4x resolution',
    category: 'higgsfield-image',
    tier: 'starter',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 10, max: 60 },
    inputTypes: ['image/png', 'image/jpeg'],
    outputTypes: ['image/png'],
    providers: ['replicate'],
    features: ['4x Upscale', 'Noise Reduction', 'Face Enhancement', 'Detail Restoration'],
    useCases: ['Photo restoration', 'Print preparation', 'Video frame enhancement'],
  },
  {
    id: 'object-remover',
    name: 'Object Remover',
    description: 'Remove unwanted objects from images using AI inpainting',
    category: 'higgsfield-image',
    tier: 'starter',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 10, max: 45 },
    inputTypes: ['image/png', 'image/jpeg'],
    outputTypes: ['image/png'],
    providers: ['stability', 'replicate'],
    features: ['Smart Inpainting', 'Mask Detection', 'Background Fill', 'Batch Processing'],
    useCases: ['Photo editing', 'Real estate photography', 'E-commerce'],
  },
  {
    id: 'style-transfer',
    name: 'Style Transfer',
    description: 'Apply artistic styles to images with AI',
    category: 'higgsfield-image',
    tier: 'starter',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 10, max: 60 },
    inputTypes: ['image/png', 'image/jpeg'],
    outputTypes: ['image/png'],
    providers: ['replicate', 'stability'],
    features: ['Art Styles', 'Custom Styles', 'Intensity Control', 'Preset Library'],
    useCases: ['Artistic photography', 'Social media content', 'NFT creation'],
  },
  {
    id: 'background-replacer',
    name: 'Background Replacer',
    description: 'Replace and generate image backgrounds with AI',
    category: 'higgsfield-image',
    tier: 'starter',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 10, max: 45 },
    inputTypes: ['image/png', 'image/jpeg'],
    outputTypes: ['image/png'],
    providers: ['stability', 'replicate'],
    features: ['AI Background', 'Custom Backgrounds', 'Edge Refinement', 'Lighting Match'],
    useCases: ['Product photography', 'Portrait editing', 'Marketing materials'],
  },
  {
    id: 'scene-generator',
    name: 'Scene Generator',
    description: 'Generate complete scenes with multiple elements and composition',
    category: 'higgsfield-image',
    tier: 'pro',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 30, max: 180 },
    inputTypes: ['text', 'json'],
    outputTypes: ['image/png'],
    providers: ['stability', 'replicate'],
    features: ['Multi-Element', 'Composition AI', 'Lighting Control', 'Style Consistency'],
    useCases: ['Concept art', 'Game backgrounds', 'Marketing visuals'],
  },
  {
    id: 'product-photographer',
    name: 'Product Photographer',
    description: 'AI product photography and staging for e-commerce',
    category: 'higgsfield-image',
    tier: 'pro',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 15, max: 90 },
    inputTypes: ['image/png', 'image/jpeg'],
    outputTypes: ['image/png'],
    providers: ['stability', 'replicate'],
    features: ['Product Staging', 'Lifestyle Shots', 'Shadow Generation', 'Multi-Angle'],
    useCases: ['E-commerce listings', 'Product catalogs', 'Marketing'],
  },
  {
    id: 'portrait-enhancer',
    name: 'Portrait Enhancer',
    description: 'Professional portrait enhancement and retouching',
    category: 'higgsfield-image',
    tier: 'starter',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 10, max: 45 },
    inputTypes: ['image/png', 'image/jpeg'],
    outputTypes: ['image/png'],
    providers: ['replicate'],
    features: ['Skin Smoothing', 'Eye Enhancement', 'Lighting Fix', 'Natural Results'],
    useCases: ['Portrait photography', 'Social media', 'Professional headshots'],
  },
  {
    id: 'sketch-to-image',
    name: 'Sketch to Image',
    description: 'Convert sketches and doodles to realistic images',
    category: 'higgsfield-image',
    tier: 'pro',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 15, max: 90 },
    inputTypes: ['image/png', 'image/jpeg'],
    outputTypes: ['image/png'],
    providers: ['stability', 'replicate'],
    features: ['ControlNet', 'Multiple Styles', 'Line Art Coloring', 'Fidelity Control'],
    useCases: ['Concept art', 'Illustration', 'Design prototyping'],
  },

  // HIGGSFIELD VIDEO AGENTS
  {
    id: 'video-generator',
    name: 'Video Generator',
    description: 'AI video generation using Runway Gen-3 Alpha',
    category: 'higgsfield-video',
    tier: 'enterprise',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 60, max: 600 },
    inputTypes: ['text', 'image/png', 'image/jpeg'],
    outputTypes: ['video/mp4'],
    providers: ['runway'],
    features: ['Text-to-Video', 'Image-to-Video', 'Gen-3 Alpha', 'Multiple Durations'],
    useCases: ['Marketing videos', 'Social media content', 'Creative projects'],
  },
  {
    id: 'face-swap-video',
    name: 'Face Swap Video',
    description: 'Video face swapping with consent validation (biometric)',
    category: 'higgsfield-video',
    tier: 'enterprise',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 120, max: 600 },
    inputTypes: ['video/mp4', 'image/png', 'image/jpeg'],
    outputTypes: ['video/mp4'],
    providers: ['replicate'],
    features: ['Consent Required', 'Face Detection', 'Video Processing', 'Watermarking'],
    useCases: ['Film production', 'Content creation', 'Entertainment'],
  },
  {
    id: 'lip-sync',
    name: 'Lip Sync',
    description: 'AI-powered lip synchronization for videos',
    category: 'higgsfield-video',
    tier: 'pro',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 60, max: 300 },
    inputTypes: ['video/mp4', 'audio/mp3', 'audio/wav'],
    outputTypes: ['video/mp4'],
    providers: ['replicate'],
    features: ['Audio Sync', 'Multiple Models', 'Quality Control', 'Emotion Transfer'],
    useCases: ['Dubbing', 'Content localization', 'Video production'],
  },
  {
    id: 'talking-avatar',
    name: 'Talking Avatar',
    description: 'Generate talking head videos from images',
    category: 'higgsfield-video',
    tier: 'pro',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 60, max: 300 },
    inputTypes: ['image/png', 'image/jpeg', 'text', 'audio/mp3'],
    outputTypes: ['video/mp4'],
    providers: ['replicate', 'elevenlabs'],
    features: ['Image to Video', 'Text-to-Speech', 'Expression Control', 'Multiple Styles'],
    useCases: ['Virtual presenters', 'Educational content', 'Marketing'],
  },
  {
    id: 'image-animator',
    name: 'Image Animator',
    description: 'Animate still images with AI motion synthesis',
    category: 'higgsfield-video',
    tier: 'pro',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 30, max: 180 },
    inputTypes: ['image/png', 'image/jpeg'],
    outputTypes: ['video/mp4', 'image/gif'],
    providers: ['replicate'],
    features: ['Motion Synthesis', 'Loop Creation', 'Depth Estimation', 'Parallax Effect'],
    useCases: ['Social media content', 'Digital art', 'Marketing'],
  },
  {
    id: 'video-upscaler',
    name: 'Video Upscaler',
    description: 'Upscale and enhance video quality up to 4K',
    category: 'higgsfield-video',
    tier: 'pro',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 120, max: 900 },
    inputTypes: ['video/mp4'],
    outputTypes: ['video/mp4'],
    providers: ['replicate'],
    features: ['4K Upscale', 'Frame Interpolation', 'Stabilization', 'Denoising'],
    useCases: ['Video restoration', 'Archive enhancement', 'Production'],
  },

  // HIGGSFIELD AUDIO AGENTS
  {
    id: 'music-generator',
    name: 'Music Generator',
    description: 'AI music and sound effect generation with MusicGen',
    category: 'higgsfield-audio',
    tier: 'pro',
    version: '1.0.0',
    async: true,
    estimatedDuration: { min: 30, max: 300 },
    inputTypes: ['text', 'json'],
    outputTypes: ['audio/mp3', 'audio/wav'],
    providers: ['replicate', 'elevenlabs'],
    features: ['MusicGen', 'Sound Effects', 'Ambient', 'Style Control'],
    useCases: ['Video soundtracks', 'Game audio', 'Content creation'],
  },
  {
    id: 'voice-cloner',
    name: 'Voice Cloner',
    description: 'AI voice synthesis with multiple voice presets using Bark model',
    category: 'higgsfield-audio',
    tier: 'enterprise',
    version: '1.0.0',
    async: true,  // Bark model takes 5+ minutes
    estimatedDuration: { min: 180, max: 480 },
    inputTypes: ['text'],
    outputTypes: ['audio/mp3'],
    providers: ['replicate'],
    features: ['Voice Synthesis', 'Multiple Presets', 'Natural Speech', 'Multi-Language'],
    useCases: ['Audiobook production', 'Voiceover', 'Localization'],
  },

  // HIGGSFIELD AI AGENTS
  {
    id: 'ai-assistant',
    name: 'AI Assistant',
    description: 'Multi-agent orchestration and task management',
    category: 'higgsfield-ai',
    tier: 'enterprise',
    version: '1.0.0',
    async: false,
    estimatedDuration: { min: 10, max: 120 },
    inputTypes: ['text', 'json'],
    outputTypes: ['json', 'text'],
    providers: ['anthropic'],
    features: ['Multi-Agent', 'Task Planning', 'Workflow Automation', 'Context Management'],
    useCases: ['Complex workflows', 'Task automation', 'Agent orchestration'],
  },
];

// =============================================================================
// REGISTRY
// =============================================================================

class AgentRegistry {
  private agents: Map<string, AgentRegistryEntry> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    for (const metadata of AGENT_METADATA) {
      const providerStatus = checkAgentProviders(metadata.id);
      const importPath = this.getImportPath(metadata);

      this.agents.set(metadata.id, {
        metadata,
        importPath,
        available: providerStatus.canRun,
        unavailableReason: providerStatus.canRun
          ? undefined
          : `Missing providers: ${providerStatus.missing.join(', ')}`,
      });
    }

    logger.info('agent_registry_initialized', {
      totalAgents: this.agents.size,
      availableAgents: Array.from(this.agents.values()).filter(a => a.available).length,
    });
  }

  private getImportPath(metadata: AgentMetadata): string {
    // Higgsfield agents have numbered directories
    const higgsFieldMap: Record<string, string> = {
      'background-remover': '00-background-remover',
      'image-generator': '01-image-generator',
      'video-generator': '02-video-generator',
      'face-swap': '03-face-swap',
      'face-swap-video': '03-face-swap-video',
      'lip-sync': '04-lip-sync',
      'talking-avatar': '05-talking-avatar',
      'headshot-generator': '06-headshot-generator',
      'character-creator': '07-character-creator',
      'image-upscaler': '08-image-upscaler',
      'object-remover': '09-object-remover',
      'style-transfer': '10-style-transfer',
      'background-replacer': '11-background-replacer',
      'image-animator': '12-image-animator',
      'video-upscaler': '13-video-upscaler',
      'scene-generator': '14-scene-generator',
      'product-photographer': '15-product-photographer',
      'portrait-enhancer': '16-portrait-enhancer',
      'portrait-retoucher': '16-portrait-retoucher',
      'sketch-to-image': '17-sketch-to-image',
      'music-generator': '18-music-generator',
      'voice-cloner': '19-voice-cloner',
      'ai-assistant': '20-ai-assistant',
      'ai-model-swap': '21-ai-model-swap',
      'data-visualization': '22-data-visualization',
    };

    if (higgsFieldMap[metadata.id]) {
      return `./agents/higgsfield/${higgsFieldMap[metadata.id]}/index.js`;
    }

    const categoryPaths: Record<string, string> = {
      analytics: 'analytics',
      ecommerce: 'ecommerce',
      creative: 'creative',
      productivity: 'productivity',
      marketing: 'marketing',
      translation: 'translation',
      content: 'content',
      business: 'business',
    };

    return `./agents/${categoryPaths[metadata.category] || metadata.category}/${metadata.id}/index.js`;
  }

  /**
   * Get all registered agents
   */
  getAll(): AgentRegistryEntry[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get agent by ID
   */
  get(id: string): AgentRegistryEntry | undefined {
    return this.agents.get(id);
  }

  /**
   * Get available agents only
   */
  getAvailable(): AgentRegistryEntry[] {
    return this.getAll().filter(a => a.available);
  }

  /**
   * Get agents by category
   */
  getByCategory(category: AgentCategory): AgentRegistryEntry[] {
    return this.getAll().filter(a => a.metadata.category === category);
  }

  /**
   * Get agents by tier
   */
  getByTier(tier: AgentTier): AgentRegistryEntry[] {
    return this.getAll().filter(a => a.metadata.tier === tier);
  }

  /**
   * Get async agents (require job queue)
   */
  getAsyncAgents(): AgentRegistryEntry[] {
    return this.getAll().filter(a => a.metadata.async);
  }

  /**
   * Check if agent is available
   */
  isAvailable(id: string): boolean {
    return this.agents.get(id)?.available ?? false;
  }

  /**
   * Get agent cost estimate
   */
  getCostEstimate(id: string): { minCost: number; maxCost: number; currency: 'USD' } | undefined {
    if (!this.agents.has(id)) return undefined;
    return getAgentCostEstimate(id);
  }

  /**
   * Search agents by keyword
   */
  search(query: string): AgentRegistryEntry[] {
    const lowerQuery = query.toLowerCase();
    return this.getAll().filter(agent => {
      const { metadata } = agent;
      return (
        metadata.name.toLowerCase().includes(lowerQuery) ||
        metadata.description.toLowerCase().includes(lowerQuery) ||
        metadata.features.some(f => f.toLowerCase().includes(lowerQuery)) ||
        metadata.useCases.some(u => u.toLowerCase().includes(lowerQuery))
      );
    });
  }

  /**
   * Get summary statistics
   */
  getStats(): {
    total: number;
    available: number;
    byCategory: Record<AgentCategory, number>;
    byTier: Record<AgentTier, number>;
    asyncCount: number;
  } {
    const agents = this.getAll();

    const byCategory = {} as Record<AgentCategory, number>;
    const byTier = {} as Record<AgentTier, number>;

    for (const agent of agents) {
      byCategory[agent.metadata.category] = (byCategory[agent.metadata.category] || 0) + 1;
      byTier[agent.metadata.tier] = (byTier[agent.metadata.tier] || 0) + 1;
    }

    return {
      total: agents.length,
      available: agents.filter(a => a.available).length,
      byCategory,
      byTier,
      asyncCount: agents.filter(a => a.metadata.async).length,
    };
  }

  /**
   * Export catalog for API/documentation
   */
  exportCatalog(): {
    agents: Array<{
      id: string;
      name: string;
      description: string;
      category: AgentCategory;
      tier: AgentTier;
      available: boolean;
      async: boolean;
      features: string[];
      costEstimate: { min: number; max: number } | null;
    }>;
    stats: ReturnType<AgentRegistry['getStats']>;
  } {
    return {
      agents: this.getAll().map(agent => ({
        id: agent.metadata.id,
        name: agent.metadata.name,
        description: agent.metadata.description,
        category: agent.metadata.category,
        tier: agent.metadata.tier,
        available: agent.available,
        async: agent.metadata.async,
        features: agent.metadata.features,
        costEstimate: this.getCostEstimate(agent.metadata.id)
          ? { min: this.getCostEstimate(agent.metadata.id)!.minCost, max: this.getCostEstimate(agent.metadata.id)!.maxCost }
          : null,
      })),
      stats: this.getStats(),
    };
  }
}

// Singleton instance
let registryInstance: AgentRegistry | null = null;

export function getAgentRegistry(): AgentRegistry {
  if (!registryInstance) {
    registryInstance = new AgentRegistry();
  }
  return registryInstance;
}

export default AgentRegistry;
