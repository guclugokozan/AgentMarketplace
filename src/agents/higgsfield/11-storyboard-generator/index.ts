/**
 * Storyboard Generator Agent
 *
 * AI-powered storyboard creation for video production.
 * Generates visual sequences from scripts or descriptions.
 *
 * Features:
 * - Script to storyboard conversion
 * - Shot composition suggestions
 * - Camera angle visualization
 * - Sequential image generation
 * - Export to various formats
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getDalleClient } from '../../../providers/openai.js';
import { getStabilityProvider } from '../../../providers/stability.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const ShotTypeSchema = z.enum([
  'establishing',
  'wide',
  'medium',
  'close_up',
  'extreme_close_up',
  'over_shoulder',
  'pov',
  'birds_eye',
  'low_angle',
  'high_angle',
]);

const SceneSchema = z.object({
  sceneNumber: z.number(),
  description: z.string(),
  dialogue: z.string().optional(),
  action: z.string().optional(),
  cameraAngle: ShotTypeSchema.optional(),
  duration: z.number().optional(),
  notes: z.string().optional(),
});

const StoryboardInputSchema = z.object({
  script: z.string().optional().describe('Full script to convert'),
  scenes: z.array(SceneSchema).optional().describe('Individual scene descriptions'),
  style: z.enum(['realistic', 'sketch', 'comic', 'anime', 'noir']).default('sketch'),
  aspectRatio: z.enum(['16:9', '2.35:1', '1.85:1', '4:3', '1:1']).default('16:9'),
  includeNotes: z.boolean().default(true),
  framesPerScene: z.number().min(1).max(5).default(1),
});

const StoryboardOutputSchema = z.object({
  success: z.boolean(),
  storyboard: z.array(z.object({
    sceneNumber: z.number(),
    frameNumber: z.number(),
    imageUrl: z.string(),
    description: z.string(),
    cameraAngle: z.string(),
    duration: z.number().optional(),
    dialogue: z.string().optional(),
    notes: z.string().optional(),
  })),
  totalFrames: z.number(),
  estimatedDuration: z.number().optional(),
  processingTime: z.number(),
  error: z.string().optional(),
});

// =============================================================================
// HELPERS
// =============================================================================

function getShotPrompt(shotType: z.infer<typeof ShotTypeSchema>): string {
  const prompts: Record<string, string> = {
    establishing: 'wide establishing shot, showing full location, cinematic composition',
    wide: 'wide shot, full scene visible, environmental context',
    medium: 'medium shot, waist up, character focus with background',
    close_up: 'close up shot, face or detail focus, dramatic',
    extreme_close_up: 'extreme close up, single detail, intense focus',
    over_shoulder: 'over the shoulder shot, conversation framing',
    pov: 'point of view shot, first person perspective',
    birds_eye: 'birds eye view, overhead shot, looking down',
    low_angle: 'low angle shot, looking up, powerful composition',
    high_angle: 'high angle shot, looking down, diminishing effect',
  };
  return prompts[shotType] || prompts.medium;
}

function getStylePrompt(style: string): string {
  const styles: Record<string, string> = {
    realistic: 'photorealistic, cinematic lighting, movie still',
    sketch: 'pencil sketch storyboard, hand-drawn style, professional illustration',
    comic: 'comic book style, bold lines, dynamic composition',
    anime: 'anime storyboard, manga style, Japanese animation',
    noir: 'film noir style, high contrast, dramatic shadows',
  };
  return styles[style] || styles.sketch;
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function parseScript(
  ctx: AgentContext,
  params: { script: string }
): Promise<{
  scenes: Array<{
    sceneNumber: number;
    description: string;
    dialogue: string;
    action: string;
    suggestedShot: string;
  }>;
}> {
  logger.info('script_parsing_started', {
    scriptLength: params.script.length,
  });

  // In production, would use NLP to parse script
  // Simulated parsing
  const lines = params.script.split('\n').filter(l => l.trim());
  const scenes: any[] = [];
  let sceneNum = 0;

  for (const line of lines) {
    if (line.includes('SCENE') || line.includes('INT.') || line.includes('EXT.')) {
      sceneNum++;
      scenes.push({
        sceneNumber: sceneNum,
        description: line,
        dialogue: '',
        action: '',
        suggestedShot: sceneNum === 1 ? 'establishing' : 'medium',
      });
    } else if (scenes.length > 0) {
      const current = scenes[scenes.length - 1];
      if (line.includes(':')) {
        current.dialogue += line + ' ';
      } else {
        current.action += line + ' ';
      }
    }
  }

  return { scenes };
}

async function generateFrame(
  ctx: AgentContext,
  params: {
    description: string;
    shotType: z.infer<typeof ShotTypeSchema>;
    style: string;
    aspectRatio: string;
    dialogue?: string;
  }
): Promise<{
  imageUrl: string;
  revisedPrompt?: string;
}> {
  const dalle = getDalleClient();
  const shotPrompt = getShotPrompt(params.shotType);
  const stylePrompt = getStylePrompt(params.style);

  let prompt = `${params.description}, ${shotPrompt}, ${stylePrompt}`;
  if (params.dialogue) {
    prompt += `, character speaking: "${params.dialogue.substring(0, 50)}..."`;
  }
  prompt += ', storyboard frame, cinematic composition';

  logger.info('frame_generation_started', {
    shotType: params.shotType,
    style: params.style,
  });

  // Map aspect ratio to DALL-E size
  let size: '1024x1024' | '1792x1024' | '1024x1792' = '1792x1024';
  if (params.aspectRatio === '9:16' || params.aspectRatio === '4:3') {
    size = '1024x1792';
  } else if (params.aspectRatio === '1:1') {
    size = '1024x1024';
  }

  const results = await dalle.generate({
    prompt,
    model: 'dall-e-3',
    size,
    quality: 'standard',
    n: 1,
  });

  return {
    imageUrl: results[0].url!,
    revisedPrompt: results[0].revisedPrompt,
  };
}

async function generateSequence(
  ctx: AgentContext,
  params: {
    scenes: z.infer<typeof SceneSchema>[];
    style: string;
    aspectRatio: string;
    framesPerScene: number;
  }
): Promise<{
  frames: Array<{
    sceneNumber: number;
    frameNumber: number;
    imageUrl: string;
    description: string;
    cameraAngle: string;
  }>;
}> {
  const frames: any[] = [];

  logger.info('sequence_generation_started', {
    sceneCount: params.scenes.length,
    framesPerScene: params.framesPerScene,
  });

  for (const scene of params.scenes) {
    for (let frameNum = 1; frameNum <= params.framesPerScene; frameNum++) {
      const frame = await generateFrame(ctx, {
        description: scene.description,
        shotType: scene.cameraAngle || 'medium',
        style: params.style,
        aspectRatio: params.aspectRatio,
        dialogue: scene.dialogue,
      });

      frames.push({
        sceneNumber: scene.sceneNumber,
        frameNumber: frameNum,
        imageUrl: frame.imageUrl,
        description: scene.description,
        cameraAngle: scene.cameraAngle || 'medium',
      });
    }
  }

  return { frames };
}

async function suggestCameraAngles(
  ctx: AgentContext,
  params: {
    sceneDescription: string;
    emotionalTone: string;
    isDialogue: boolean;
  }
): Promise<{
  suggestions: Array<{
    shotType: string;
    reason: string;
    priority: number;
  }>;
}> {
  logger.info('camera_suggestions_started');

  const suggestions: any[] = [];

  // Rule-based suggestions
  if (params.sceneDescription.toLowerCase().includes('enter') ||
      params.sceneDescription.toLowerCase().includes('arrive')) {
    suggestions.push({
      shotType: 'establishing',
      reason: 'Establish the new location',
      priority: 1,
    });
  }

  if (params.isDialogue) {
    suggestions.push({
      shotType: 'over_shoulder',
      reason: 'Classic dialogue framing',
      priority: 2,
    });
    suggestions.push({
      shotType: 'close_up',
      reason: 'Capture emotional reactions',
      priority: 3,
    });
  }

  if (params.emotionalTone === 'tense' || params.emotionalTone === 'dramatic') {
    suggestions.push({
      shotType: 'low_angle',
      reason: 'Creates tension and power',
      priority: 2,
    });
  }

  if (suggestions.length === 0) {
    suggestions.push({
      shotType: 'medium',
      reason: 'Versatile default choice',
      priority: 1,
    });
  }

  return { suggestions };
}

async function addAnnotations(
  ctx: AgentContext,
  params: {
    frames: Array<{
      imageUrl: string;
      dialogue?: string;
      action?: string;
      notes?: string;
    }>;
  }
): Promise<{
  annotatedFrames: Array<{
    imageUrl: string;
    annotations: {
      dialogue: string;
      action: string;
      notes: string;
    };
  }>;
}> {
  logger.info('annotations_added', { frameCount: params.frames.length });

  return {
    annotatedFrames: params.frames.map(f => ({
      imageUrl: f.imageUrl,
      annotations: {
        dialogue: f.dialogue || '',
        action: f.action || '',
        notes: f.notes || '',
      },
    })),
  };
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const storyboardGeneratorAgent = defineAgent({
  name: 'storyboard-generator',
  description: 'AI-powered storyboard creation from scripts or scene descriptions',
  version: '1.0.0',

  inputSchema: StoryboardInputSchema,
  outputSchema: StoryboardOutputSchema,

  tools: {
    parse_script: {
      description: 'Parse a script into individual scenes',
      parameters: z.object({
        script: z.string(),
      }),
      returns: z.object({
        scenes: z.array(z.object({
          sceneNumber: z.number(),
          description: z.string(),
          dialogue: z.string(),
          action: z.string(),
          suggestedShot: z.string(),
        })),
      }),
      execute: parseScript,
      timeoutMs: 30000,
    },

    generate_frame: {
      description: 'Generate a single storyboard frame',
      parameters: z.object({
        description: z.string(),
        shotType: ShotTypeSchema,
        style: z.string(),
        aspectRatio: z.string(),
        dialogue: z.string().optional(),
      }),
      returns: z.object({
        imageUrl: z.string(),
        revisedPrompt: z.string().optional(),
      }),
      execute: generateFrame,
      sideEffectful: true,
      timeoutMs: 60000,
    },

    generate_sequence: {
      description: 'Generate a sequence of storyboard frames',
      parameters: z.object({
        scenes: z.array(SceneSchema),
        style: z.string(),
        aspectRatio: z.string(),
        framesPerScene: z.number(),
      }),
      returns: z.object({
        frames: z.array(z.object({
          sceneNumber: z.number(),
          frameNumber: z.number(),
          imageUrl: z.string(),
          description: z.string(),
          cameraAngle: z.string(),
        })),
      }),
      execute: generateSequence,
      sideEffectful: true,
      timeoutMs: 600000, // 10 minutes for full sequence
    },

    suggest_camera_angles: {
      description: 'Suggest camera angles for a scene',
      parameters: z.object({
        sceneDescription: z.string(),
        emotionalTone: z.string(),
        isDialogue: z.boolean(),
      }),
      returns: z.object({
        suggestions: z.array(z.object({
          shotType: z.string(),
          reason: z.string(),
          priority: z.number(),
        })),
      }),
      execute: suggestCameraAngles,
      timeoutMs: 10000,
    },

    add_annotations: {
      description: 'Add dialogue and action annotations to frames',
      parameters: z.object({
        frames: z.array(z.object({
          imageUrl: z.string(),
          dialogue: z.string().optional(),
          action: z.string().optional(),
          notes: z.string().optional(),
        })),
      }),
      returns: z.object({
        annotatedFrames: z.array(z.object({
          imageUrl: z.string(),
          annotations: z.object({
            dialogue: z.string(),
            action: z.string(),
            notes: z.string(),
          }),
        })),
      }),
      execute: addAnnotations,
      timeoutMs: 10000,
    },
  },

  systemPrompt: `You are a professional storyboard artist assistant. Your role is to help create visual storyboards for film, video, and animation projects.

Workflow:
1. If given a script, parse it into scenes
2. Suggest appropriate camera angles for each scene
3. Generate storyboard frames with proper composition
4. Add annotations (dialogue, action, notes)

Shot types and their uses:
- Establishing: Opens a scene, shows location
- Wide: Shows full scene, spatial relationships
- Medium: Standard conversational shot
- Close-up: Emotional moments, important details
- Extreme close-up: Intense focus on detail
- Over-shoulder: Dialogue between characters
- POV: Subjective view of character
- Bird's eye: Overhead perspective
- Low angle: Creates power, intimidation
- High angle: Diminishes, creates vulnerability

Style options:
- Realistic: For final visualization
- Sketch: Traditional storyboard look
- Comic: Dynamic, action-oriented
- Anime: Japanese animation style
- Noir: High contrast, dramatic

Best practices:
- Start scenes with establishing shots
- Use variety of angles to maintain interest
- Match shot types to emotional beats
- Include camera movement notes
- Indicate transitions between scenes`,

  config: {
    maxTurns: 12,
    temperature: 0.4,
    maxTokens: 4096,
  },
});

export default storyboardGeneratorAgent;
