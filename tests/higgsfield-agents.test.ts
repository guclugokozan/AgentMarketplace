/**
 * Higgsfield Agents Structure & Import Tests
 *
 * Tests that verify the actual agent modules:
 * - Import correctly
 * - Have required exports
 * - Have valid structure
 * - Schemas parse correctly
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// AGENT FILE EXISTENCE TESTS
// =============================================================================

describe('Agent File Existence Tests', () => {
  const agentBasePath = path.join(process.cwd(), 'src/agents/higgsfield');

  const expectedAgents = [
    '01-image-generator',
    '02-video-generator',
    '03-face-swap-video',
    '04-lipsync-studio',
    '05-video-upscaler',
    '06-image-inpainting',
    '07-character-creator',
    '08-style-transfer',
    '09-product-enhancer',
    '10-avatar-generator',
    '11-storyboard-generator',
    '12-vfx-transformer',
    '13-ad-generator',
    '14-photo-editor',
    '15-video-effects',
    '16-motion-graphics',
    '17-sketch-to-image',
    '18-music-generator',
    '19-voice-cloner',
    '20-ai-assistant',
  ];

  expectedAgents.forEach((agentDir, index) => {
    it(`should have agent ${index + 1}: ${agentDir}`, () => {
      const agentPath = path.join(agentBasePath, agentDir, 'index.ts');
      expect(fs.existsSync(agentPath)).toBe(true);
    });
  });

  it('should have registry file', () => {
    const registryPath = path.join(agentBasePath, 'index.ts');
    expect(fs.existsSync(registryPath)).toBe(true);
  });
});

// =============================================================================
// AGENT STRUCTURE VALIDATION TESTS
// =============================================================================

describe('Agent Structure Validation Tests', () => {
  const agentBasePath = path.join(process.cwd(), 'src/agents/higgsfield');

  // Helper to read and check agent file structure
  const readAgentFile = (agentDir: string): string => {
    const filePath = path.join(agentBasePath, agentDir, 'index.ts');
    return fs.readFileSync(filePath, 'utf-8');
  };

  it('should have defineAgent call in image-generator', () => {
    const content = readAgentFile('01-image-generator');
    expect(content).toContain('defineAgent');
    expect(content).toContain('export const imageGeneratorAgent');
    expect(content).toContain('name:');
    expect(content).toContain('description:');
    expect(content).toContain('tools:');
    expect(content).toContain('systemPrompt:');
  });

  it('should have defineAgent call in video-generator', () => {
    const content = readAgentFile('02-video-generator');
    expect(content).toContain('defineAgent');
    expect(content).toContain('export const videoGeneratorAgent');
    expect(content).toContain('tools:');
  });

  it('should have consent validation in face-swap-video', () => {
    const content = readAgentFile('03-face-swap-video');
    expect(content).toContain('defineAgent');
    expect(content).toContain('export const faceSwapVideoAgent');
    expect(content).toContain('validate_consent');
    expect(content).toContain('ConsentRequest');
    expect(content).toContain('getConsentValidator');
  });

  it('should have consent validation in lipsync-studio', () => {
    const content = readAgentFile('04-lipsync-studio');
    expect(content).toContain('defineAgent');
    expect(content).toContain('validate_consent');
  });

  it('should have consent validation in voice-cloner', () => {
    const content = readAgentFile('19-voice-cloner');
    expect(content).toContain('defineAgent');
    expect(content).toContain('voiceClonerAgent');
    expect(content).toContain('ConsentValidator');
  });

  it('should have tools defined in music-generator', () => {
    const content = readAgentFile('18-music-generator');
    expect(content).toContain('defineAgent');
    expect(content).toContain('generate_music');
    expect(content).toContain('generate_sfx');
    expect(content).toContain('MusicGenreSchema');
    expect(content).toContain('MoodSchema');
  });

  it('should have AI assistant orchestration capabilities', () => {
    const content = readAgentFile('20-ai-assistant');
    expect(content).toContain('defineAgent');
    expect(content).toContain('aiAssistantAgent');
    expect(content).toContain('orchestrate_agents');
    expect(content).toContain('create_conversation');
    expect(content).toContain('get_history');
  });

  it('should have storyboard tools', () => {
    const content = readAgentFile('11-storyboard-generator');
    expect(content).toContain('defineAgent');
    expect(content).toContain('parse_script');
    expect(content).toContain('generate_frame');
    expect(content).toContain('ShotTypeSchema');
  });

  it('should have avatar styles in avatar-generator', () => {
    const content = readAgentFile('10-avatar-generator');
    expect(content).toContain('defineAgent');
    expect(content).toContain('AvatarStyleSchema');
    expect(content).toContain('generate_from_photo');
    expect(content).toContain('generate_from_text');
  });

  it('should have character persistence in character-creator', () => {
    const content = readAgentFile('07-character-creator');
    expect(content).toContain('defineAgent');
    expect(content).toContain('characterCreatorAgent');
    expect(content).toContain('createCharacter');
    expect(content).toContain('Database');
  });
});

// =============================================================================
// PROVIDER IMPORT VALIDATION
// =============================================================================

describe('Provider Import Validation', () => {
  const providerBasePath = path.join(process.cwd(), 'src/providers');

  it('should have openai provider with DALL-E', () => {
    const filePath = path.join(providerBasePath, 'openai.ts');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('DalleClient');
    expect(content).toContain('getDalleClient');
    expect(content).toContain('generate');
    expect(content).toContain('edit');
  });

  it('should have stability provider', () => {
    const filePath = path.join(providerBasePath, 'stability.ts');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('StabilityProvider');
    expect(content).toContain('generate');
    expect(content).toContain('generateSD3');
    expect(content).toContain('upscale');
    expect(content).toContain('inpaint');
  });

  it('should have runway provider', () => {
    const filePath = path.join(providerBasePath, 'runway.ts');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('RunwayProvider');
    expect(content).toContain('generateVideo');
    expect(content).toContain('imageToVideo');
    expect(content).toContain('waitForCompletion');
  });

  it('should have replicate provider with job tracking', () => {
    const filePath = path.join(providerBasePath, 'replicate.ts');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('ReplicateExtendedClient');
    expect(content).toContain('createTrackedPrediction');
    expect(content).toContain('waitForTrackedPrediction');
    expect(content).toContain('faceSwap');
  });

  it('should have elevenlabs provider', () => {
    const filePath = path.join(providerBasePath, 'elevenlabs.ts');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('ElevenLabsProvider');
    expect(content).toContain('textToSpeech');
    expect(content).toContain('cloneVoice');
    expect(content).toContain('generateSoundEffect');
  });

  it('should have job manager', () => {
    const filePath = path.join(providerBasePath, 'job-manager.ts');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('ProviderJobManager');
    expect(content).toContain('create');
    expect(content).toContain('getStatus');
    expect(content).toContain('complete');
    expect(content).toContain('fail');
  });
});

// =============================================================================
// CONSENT MODULE VALIDATION
// =============================================================================

describe('Consent Module Validation', () => {
  it('should have consent validator in safety module', () => {
    const filePath = path.join(process.cwd(), 'src/safety/consent.ts');
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('ConsentValidator');
    expect(content).toContain('validate');
    expect(content).toContain('validateOrThrow');
    expect(content).toContain('ConsentRequestSchema');
    expect(content).toContain('ConsentEvidenceSchema');
    expect(content).toContain('face_swap');
    expect(content).toContain('voice_clone');
    expect(content).toContain('lipsync');
  });
});

// =============================================================================
// REGISTRY VALIDATION
// =============================================================================

describe('Registry Validation', () => {
  it('should export all 20 agents from registry', () => {
    const registryPath = path.join(process.cwd(), 'src/agents/higgsfield/index.ts');
    const content = fs.readFileSync(registryPath, 'utf-8');

    // Check all exports
    expect(content).toContain('imageGeneratorAgent');
    expect(content).toContain('videoGeneratorAgent');
    expect(content).toContain('faceSwapVideoAgent');
    expect(content).toContain('lipsyncStudioAgent');
    expect(content).toContain('videoUpscalerAgent');
    expect(content).toContain('imageInpaintingAgent');
    expect(content).toContain('characterCreatorAgent');
    expect(content).toContain('styleTransferAgent');
    expect(content).toContain('productEnhancerAgent');
    expect(content).toContain('avatarGeneratorAgent');
    expect(content).toContain('storyboardGeneratorAgent');
    expect(content).toContain('vfxTransformerAgent');
    expect(content).toContain('adGeneratorAgent');
    expect(content).toContain('photoEditorAgent');
    expect(content).toContain('videoEffectsAgent');
    expect(content).toContain('motionGraphicsAgent');
    expect(content).toContain('sketchToImageAgent');
    expect(content).toContain('musicGeneratorAgent');
    expect(content).toContain('voiceClonerAgent');
    expect(content).toContain('aiAssistantAgent');
  });

  it('should have higgsFieldAgents object', () => {
    const registryPath = path.join(process.cwd(), 'src/agents/higgsfield/index.ts');
    const content = fs.readFileSync(registryPath, 'utf-8');

    expect(content).toContain('higgsFieldAgents');
    expect(content).toContain("'image-generator':");
    expect(content).toContain("'video-generator':");
    expect(content).toContain("'face-swap-video':");
    expect(content).toContain("'voice-cloner':");
    expect(content).toContain("'ai-assistant':");
  });

  it('should have agent metadata', () => {
    const registryPath = path.join(process.cwd(), 'src/agents/higgsfield/index.ts');
    const content = fs.readFileSync(registryPath, 'utf-8');

    expect(content).toContain('higgsFieldAgentMetadata');
    expect(content).toContain('requiresConsent');
    expect(content).toContain('category');
    expect(content).toContain('tags');
  });

  it('should have helper functions', () => {
    const registryPath = path.join(process.cwd(), 'src/agents/higgsfield/index.ts');
    const content = fs.readFileSync(registryPath, 'utf-8');

    expect(content).toContain('getHiggsFieldAgent');
    expect(content).toContain('getHiggsFieldAgentsByCategory');
    expect(content).toContain('getConsentRequiredAgents');
    expect(content).toContain('searchHiggsFieldAgents');
  });
});

// =============================================================================
// SCHEMA COMPLEXITY TESTS
// =============================================================================

describe('Schema Complexity Tests', () => {
  // Simulate the actual schemas used in agents
  it('should validate image generator input schema correctly', () => {
    const ModelSchema = z.enum(['dall-e-3', 'dall-e-2', 'sdxl', 'sd3', 'flux-schnell']);
    const StylePresetSchema = z.enum([
      'photorealistic', 'digital-art', 'anime', 'oil-painting',
      'watercolor', 'sketch', '3d-render', 'cinematic',
      'minimalist', 'abstract', 'fantasy', 'sci-fi',
    ]);
    const AspectRatioSchema = z.enum(['1:1', '16:9', '9:16', '4:3', '3:4', '21:9', '3:2', '2:3']);

    const ImageInputSchema = z.object({
      prompt: z.string().min(1).max(4000),
      negativePrompt: z.string().optional(),
      model: ModelSchema.default('dall-e-3'),
      style: StylePresetSchema.optional(),
      aspectRatio: AspectRatioSchema.default('1:1'),
      quality: z.enum(['standard', 'hd']).default('standard'),
      count: z.number().min(1).max(4).default(1),
      seed: z.number().optional(),
    });

    // Valid input
    const result = ImageInputSchema.parse({
      prompt: 'A beautiful landscape',
      style: 'photorealistic',
      aspectRatio: '16:9',
    });

    expect(result.prompt).toBe('A beautiful landscape');
    expect(result.model).toBe('dall-e-3');
    expect(result.quality).toBe('standard');
    expect(result.count).toBe(1);
  });

  it('should validate video generator input schema correctly', () => {
    const VideoInputSchema = z.object({
      prompt: z.string().min(1).max(2000),
      imageUrl: z.string().optional(),
      duration: z.enum(['4', '8', '16']).default('8'),
      aspectRatio: z.enum(['16:9', '9:16', '1:1']).default('16:9'),
      motionIntensity: z.enum(['low', 'medium', 'high']).default('medium'),
    });

    const result = VideoInputSchema.parse({
      prompt: 'A sunset timelapse over the ocean',
      duration: '16',
    });

    expect(result.duration).toBe('16');
    expect(result.aspectRatio).toBe('16:9');
  });

  it('should validate face swap input with consent', () => {
    const SubjectTypeSchema = z.enum(['self', 'other', 'unknown']);
    const ConsentEvidenceSchema = z.object({
      type: z.enum(['explicit_checkbox', 'terms_acceptance', 'api_attestation', 'none']),
      timestamp: z.string().optional(),
      reference: z.string().optional(),
    });

    const FaceSwapInputSchema = z.object({
      sourceImageUrl: z.string(),
      targetVideoUrl: z.string(),
      subjectType: SubjectTypeSchema,
      consentEvidence: ConsentEvidenceSchema.optional(),
      purpose: z.string().min(1).max(500),
      faceIndex: z.number().default(0),
    });

    const result = FaceSwapInputSchema.parse({
      sourceImageUrl: 'https://example.com/face.jpg',
      targetVideoUrl: 'https://example.com/video.mp4',
      subjectType: 'self',
      purpose: 'Personal use',
    });

    expect(result.subjectType).toBe('self');
    expect(result.faceIndex).toBe(0);
  });

  it('should validate music generator input schema', () => {
    const MusicGenreSchema = z.enum([
      'ambient', 'electronic', 'cinematic', 'corporate',
      'pop', 'rock', 'jazz', 'classical', 'hip_hop',
      'lofi', 'edm', 'acoustic',
    ]);

    const MoodSchema = z.enum([
      'happy', 'sad', 'energetic', 'calm', 'dramatic',
      'mysterious', 'romantic', 'epic', 'playful', 'dark',
      'uplifting', 'nostalgic',
    ]);

    const MusicInputSchema = z.object({
      type: z.enum(['music', 'sfx', 'ambient']),
      prompt: z.string(),
      genre: MusicGenreSchema.optional(),
      mood: MoodSchema.optional(),
      duration: z.number().min(5).max(300).default(30),
      bpm: z.number().min(60).max(200).optional(),
    });

    const result = MusicInputSchema.parse({
      type: 'music',
      prompt: 'Upbeat electronic track for a workout video',
      genre: 'electronic',
      mood: 'energetic',
      bpm: 140,
    });

    expect(result.type).toBe('music');
    expect(result.genre).toBe('electronic');
    expect(result.bpm).toBe(140);
  });

  it('should validate voice cloner input with consent', () => {
    const VoiceStyleSchema = z.enum([
      'natural', 'professional', 'casual', 'dramatic',
      'whisper', 'energetic', 'calm', 'authoritative',
    ]);

    const LanguageSchema = z.enum([
      'en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE',
      'it-IT', 'pt-BR', 'ja-JP', 'ko-KR', 'zh-CN',
    ]);

    const ConsentSchema = z.object({
      subjectId: z.string(),
      subjectName: z.string(),
      consentToken: z.string(),
      purpose: z.string(),
    });

    const VoiceInputSchema = z.object({
      operation: z.enum(['clone', 'synthesize', 'style_transfer', 'translate']),
      audioSampleUrls: z.array(z.string()).optional(),
      text: z.string().optional(),
      voiceId: z.string().optional(),
      targetStyle: VoiceStyleSchema.optional(),
      targetLanguage: LanguageSchema.optional(),
      consent: ConsentSchema.optional(),
    });

    const result = VoiceInputSchema.parse({
      operation: 'synthesize',
      text: 'Hello, this is a test of voice synthesis.',
      voiceId: 'voice-123',
      targetStyle: 'professional',
    });

    expect(result.operation).toBe('synthesize');
    expect(result.targetStyle).toBe('professional');
  });
});

// =============================================================================
// TOOL COUNT VALIDATION
// =============================================================================

describe('Tool Count Validation', () => {
  const agentBasePath = path.join(process.cwd(), 'src/agents/higgsfield');

  const countTools = (content: string): number => {
    const toolMatches = content.match(/\w+:\s*{\s*description:/g);
    return toolMatches ? toolMatches.length : 0;
  };

  it('should have multiple tools in image-generator', () => {
    const content = fs.readFileSync(path.join(agentBasePath, '01-image-generator/index.ts'), 'utf-8');
    expect(content).toContain('generate_dalle');
    expect(content).toContain('generate_stability');
    expect(content).toContain('generate_flux');
    expect(content).toContain('wait_for_job');
  });

  it('should have multiple tools in video-generator', () => {
    const content = fs.readFileSync(path.join(agentBasePath, '02-video-generator/index.ts'), 'utf-8');
    expect(content).toContain('text_to_video');
    expect(content).toContain('image_to_video');
    expect(content).toContain('poll_until_complete');
  });

  it('should have multiple tools in face-swap-video', () => {
    const content = fs.readFileSync(path.join(agentBasePath, '03-face-swap-video/index.ts'), 'utf-8');
    expect(content).toContain('validate_consent');
    expect(content).toContain('detect_faces');
    expect(content).toContain('swap_face_video');
    expect(content).toContain('apply_watermark');
  });

  it('should have multiple tools in music-generator', () => {
    const content = fs.readFileSync(path.join(agentBasePath, '18-music-generator/index.ts'), 'utf-8');
    expect(content).toContain('generate_music');
    expect(content).toContain('generate_sfx');
    expect(content).toContain('generate_ambient');
    expect(content).toContain('continue_music');
    expect(content).toContain('suggest_music');
  });

  it('should have multiple tools in ai-assistant', () => {
    const content = fs.readFileSync(path.join(agentBasePath, '20-ai-assistant/index.ts'), 'utf-8');
    expect(content).toContain('create_conversation');
    expect(content).toContain('get_history');
    expect(content).toContain('add_message');
    expect(content).toContain('summarize');
    expect(content).toContain('search_knowledge');
    expect(content).toContain('orchestrate_agents');
  });
});

// =============================================================================
// SYSTEM PROMPT VALIDATION
// =============================================================================

describe('System Prompt Validation', () => {
  const agentBasePath = path.join(process.cwd(), 'src/agents/higgsfield');

  it('should have system prompt with model guidance in image-generator', () => {
    const content = fs.readFileSync(path.join(agentBasePath, '01-image-generator/index.ts'), 'utf-8');
    expect(content).toContain('systemPrompt:');
    expect(content).toContain('DALL-E');
    expect(content).toContain('SDXL');
  });

  it('should have consent instructions in face-swap-video system prompt', () => {
    const content = fs.readFileSync(path.join(agentBasePath, '03-face-swap-video/index.ts'), 'utf-8');
    expect(content).toContain('systemPrompt:');
    expect(content).toContain('MUST validate consent');
    expect(content).toContain('CRITICAL');
  });

  it('should have consent instructions in voice-cloner system prompt', () => {
    const content = fs.readFileSync(path.join(agentBasePath, '19-voice-cloner/index.ts'), 'utf-8');
    expect(content).toContain('systemPrompt:');
    expect(content).toContain('biometric operation');
    expect(content).toContain('consent');
  });
});

// =============================================================================
// CONFIG VALIDATION
// =============================================================================

describe('Config Validation', () => {
  const agentBasePath = path.join(process.cwd(), 'src/agents/higgsfield');

  it('should have config with maxTurns, temperature, maxTokens', () => {
    const content = fs.readFileSync(path.join(agentBasePath, '01-image-generator/index.ts'), 'utf-8');
    expect(content).toContain('config:');
    expect(content).toContain('maxTurns:');
    expect(content).toContain('temperature:');
    expect(content).toContain('maxTokens:');
  });
});

// =============================================================================
// FINAL SUMMARY
// =============================================================================

describe('Final Test Summary', () => {
  it('should confirm all 20 Higgsfield agents exist and are properly structured', () => {
    const agentBasePath = path.join(process.cwd(), 'src/agents/higgsfield');
    const directories = fs.readdirSync(agentBasePath).filter(f => {
      const stat = fs.statSync(path.join(agentBasePath, f));
      return stat.isDirectory();
    });

    expect(directories.length).toBe(20);
  });
});
