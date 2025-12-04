/**
 * Character Creator Agent
 *
 * AI-powered consistent character generation.
 * Creates and maintains character identity across multiple images.
 *
 * Features:
 * - Character definition and persistence
 * - Consistent face/style generation
 * - Multiple pose/expression variations
 * - Character sheet generation
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import { getReplicateExtendedClient, REPLICATE_MODELS } from '../../../providers/replicate.js';
import { getDalleClient } from '../../../providers/openai.js';
import Database from 'better-sqlite3';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const CharacterTraitsSchema = z.object({
  gender: z.enum(['male', 'female', 'non-binary', 'other']).optional(),
  age: z.string().optional(),
  ethnicity: z.string().optional(),
  hairColor: z.string().optional(),
  hairStyle: z.string().optional(),
  eyeColor: z.string().optional(),
  bodyType: z.string().optional(),
  facialFeatures: z.string().optional(),
  distinguishingMarks: z.string().optional(),
  style: z.string().optional(),
});

const CharacterInputSchema = z.object({
  action: z.enum(['create', 'generate', 'list', 'get', 'update', 'delete']).describe('Action to perform'),
  characterId: z.string().optional().describe('Character ID for existing characters'),
  name: z.string().optional().describe('Character name'),
  description: z.string().optional().describe('Full character description'),
  traits: CharacterTraitsSchema.optional().describe('Character traits'),
  referenceImageUrl: z.string().optional().describe('Reference image for character'),
  pose: z.string().optional().describe('Pose for generation'),
  expression: z.string().optional().describe('Expression for generation'),
  outfit: z.string().optional().describe('Outfit for generation'),
  background: z.string().optional().describe('Background for generation'),
  count: z.number().min(1).max(4).default(1).describe('Number of images'),
});

const CharacterOutputSchema = z.object({
  success: z.boolean(),
  characterId: z.string().optional(),
  character: z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    traits: CharacterTraitsSchema,
    referenceImages: z.array(z.string()),
    createdAt: z.string(),
  }).optional(),
  characters: z.array(z.object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
  })).optional(),
  generatedImages: z.array(z.object({
    url: z.string(),
    pose: z.string().optional(),
    expression: z.string().optional(),
  })).optional(),
  error: z.string().optional(),
});

// =============================================================================
// DATABASE HELPERS
// =============================================================================

function getDatabase(): Database.Database {
  const db = new Database('./data/agent-marketplace.db');
  db.pragma('foreign_keys = ON');
  return db;
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function createCharacter(
  ctx: AgentContext,
  params: {
    name: string;
    description: string;
    traits: z.infer<typeof CharacterTraitsSchema>;
    referenceImageUrl?: string;
    tenantId?: string;
    userId?: string;
  }
): Promise<{
  characterId: string;
  character: {
    id: string;
    name: string;
    description: string;
    traits: z.infer<typeof CharacterTraitsSchema>;
    referenceImages: string[];
  };
}> {
  const db = getDatabase();

  const id = `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  logger.info('character_create_started', {
    name: params.name,
    hasReference: !!params.referenceImageUrl,
  });

  const referenceImages = params.referenceImageUrl ? [params.referenceImageUrl] : [];

  db.prepare(`
    INSERT INTO characters (id, name, description, traits, reference_images, tenant_id, user_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.name,
    params.description,
    JSON.stringify(params.traits),
    JSON.stringify(referenceImages),
    params.tenantId || null,
    params.userId || null
  );

  db.close();

  return {
    characterId: id,
    character: {
      id,
      name: params.name,
      description: params.description,
      traits: params.traits,
      referenceImages,
    },
  };
}

async function getCharacter(
  ctx: AgentContext,
  params: { characterId: string }
): Promise<{
  character: {
    id: string;
    name: string;
    description: string;
    traits: z.infer<typeof CharacterTraitsSchema>;
    referenceImages: string[];
    createdAt: string;
  } | null;
}> {
  const db = getDatabase();

  const row = db.prepare(`
    SELECT id, name, description, traits, reference_images, created_at
    FROM characters WHERE id = ?
  `).get(params.characterId) as any;

  db.close();

  if (!row) {
    return { character: null };
  }

  return {
    character: {
      id: row.id,
      name: row.name,
      description: row.description,
      traits: JSON.parse(row.traits || '{}'),
      referenceImages: JSON.parse(row.reference_images || '[]'),
      createdAt: row.created_at,
    },
  };
}

async function listCharacters(
  ctx: AgentContext,
  params: {
    tenantId?: string;
    userId?: string;
    limit?: number;
  }
): Promise<{
  characters: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}> {
  const db = getDatabase();

  let query = 'SELECT id, name, description FROM characters';
  const conditions: string[] = [];
  const queryParams: any[] = [];

  if (params.tenantId) {
    conditions.push('tenant_id = ?');
    queryParams.push(params.tenantId);
  }
  if (params.userId) {
    conditions.push('user_id = ?');
    queryParams.push(params.userId);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  queryParams.push(params.limit || 50);

  const rows = db.prepare(query).all(...queryParams) as any[];
  db.close();

  return {
    characters: rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description,
    })),
  };
}

async function generateCharacterImage(
  ctx: AgentContext,
  params: {
    characterId: string;
    pose?: string;
    expression?: string;
    outfit?: string;
    background?: string;
    count: number;
    agentId: string;
    runId: string;
  }
): Promise<{
  images: Array<{
    url: string;
    pose: string;
    expression: string;
  }>;
}> {
  const db = getDatabase();

  const row = db.prepare(`
    SELECT name, description, traits FROM characters WHERE id = ?
  `).get(params.characterId) as any;

  db.close();

  if (!row) {
    throw new Error(`Character ${params.characterId} not found`);
  }

  const traits = JSON.parse(row.traits || '{}');
  const dalle = getDalleClient();

  // Build comprehensive prompt
  let prompt = `${row.description}`;
  if (traits.gender) prompt += `, ${traits.gender}`;
  if (traits.age) prompt += `, ${traits.age}`;
  if (traits.hairColor && traits.hairStyle) prompt += `, ${traits.hairColor} ${traits.hairStyle} hair`;
  if (traits.eyeColor) prompt += `, ${traits.eyeColor} eyes`;
  if (traits.facialFeatures) prompt += `, ${traits.facialFeatures}`;
  if (traits.style) prompt += `, ${traits.style} style`;

  if (params.pose) prompt += `, ${params.pose} pose`;
  if (params.expression) prompt += `, ${params.expression} expression`;
  if (params.outfit) prompt += `, wearing ${params.outfit}`;
  if (params.background) prompt += `, ${params.background} background`;

  prompt += ', highly detailed, consistent character, portrait';

  logger.info('character_generation_started', {
    characterId: params.characterId,
    count: params.count,
  });

  const results = await dalle.generate({
    prompt,
    model: 'dall-e-3',
    size: '1024x1024',
    quality: 'hd',
    n: params.count,
  });

  return {
    images: results.map(r => ({
      url: r.url!,
      pose: params.pose || 'neutral',
      expression: params.expression || 'neutral',
    })),
  };
}

async function generateCharacterSheet(
  ctx: AgentContext,
  params: {
    characterId: string;
    agentId: string;
    runId: string;
  }
): Promise<{
  images: Array<{
    url: string;
    view: string;
  }>;
}> {
  const views = [
    { view: 'front', pose: 'standing front view', expression: 'neutral' },
    { view: 'side', pose: 'standing side profile view', expression: 'neutral' },
    { view: 'back', pose: 'standing back view', expression: 'neutral' },
    { view: 'action', pose: 'dynamic action pose', expression: 'determined' },
  ];

  logger.info('character_sheet_started', { characterId: params.characterId });

  const results: Array<{ url: string; view: string }> = [];

  for (const { view, pose, expression } of views) {
    const generated = await generateCharacterImage(ctx, {
      characterId: params.characterId,
      pose,
      expression,
      count: 1,
      agentId: params.agentId,
      runId: params.runId,
    });

    if (generated.images.length > 0) {
      results.push({
        url: generated.images[0].url,
        view,
      });
    }
  }

  return { images: results };
}

async function updateCharacter(
  ctx: AgentContext,
  params: {
    characterId: string;
    name?: string;
    description?: string;
    traits?: z.infer<typeof CharacterTraitsSchema>;
    addReferenceImage?: string;
  }
): Promise<{
  updated: boolean;
}> {
  const db = getDatabase();

  const updates: string[] = [];
  const values: any[] = [];

  if (params.name) {
    updates.push('name = ?');
    values.push(params.name);
  }
  if (params.description) {
    updates.push('description = ?');
    values.push(params.description);
  }
  if (params.traits) {
    updates.push('traits = ?');
    values.push(JSON.stringify(params.traits));
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(params.characterId);

  const result = db.prepare(`
    UPDATE characters SET ${updates.join(', ')} WHERE id = ?
  `).run(...values);

  if (params.addReferenceImage) {
    const current = db.prepare('SELECT reference_images FROM characters WHERE id = ?').get(params.characterId) as any;
    if (current) {
      const images = JSON.parse(current.reference_images || '[]');
      images.push(params.addReferenceImage);
      db.prepare('UPDATE characters SET reference_images = ? WHERE id = ?').run(
        JSON.stringify(images),
        params.characterId
      );
    }
  }

  db.close();

  return { updated: result.changes > 0 };
}

async function deleteCharacter(
  ctx: AgentContext,
  params: { characterId: string }
): Promise<{ deleted: boolean }> {
  const db = getDatabase();
  const result = db.prepare('DELETE FROM characters WHERE id = ?').run(params.characterId);
  db.close();
  return { deleted: result.changes > 0 };
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const characterCreatorAgent = defineAgent({
  name: 'character-creator',
  description: 'AI-powered consistent character generation with persistence and variations',
  version: '1.0.0',

  inputSchema: CharacterInputSchema,
  outputSchema: CharacterOutputSchema,

  tools: {
    create_character: {
      description: 'Create a new character with traits and optional reference image',
      parameters: z.object({
        name: z.string(),
        description: z.string(),
        traits: CharacterTraitsSchema,
        referenceImageUrl: z.string().optional(),
        tenantId: z.string().optional(),
        userId: z.string().optional(),
      }),
      returns: z.object({
        characterId: z.string(),
        character: z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          traits: CharacterTraitsSchema,
          referenceImages: z.array(z.string()),
        }),
      }),
      execute: createCharacter,
      sideEffectful: true,
      timeoutMs: 30000,
    },

    get_character: {
      description: 'Get character details by ID',
      parameters: z.object({
        characterId: z.string(),
      }),
      returns: z.object({
        character: z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
          traits: CharacterTraitsSchema,
          referenceImages: z.array(z.string()),
          createdAt: z.string(),
        }).nullable(),
      }),
      execute: getCharacter,
      timeoutMs: 10000,
    },

    list_characters: {
      description: 'List all characters',
      parameters: z.object({
        tenantId: z.string().optional(),
        userId: z.string().optional(),
        limit: z.number().optional(),
      }),
      returns: z.object({
        characters: z.array(z.object({
          id: z.string(),
          name: z.string(),
          description: z.string(),
        })),
      }),
      execute: listCharacters,
      timeoutMs: 10000,
    },

    generate_image: {
      description: 'Generate image of character with specific pose/expression',
      parameters: z.object({
        characterId: z.string(),
        pose: z.string().optional(),
        expression: z.string().optional(),
        outfit: z.string().optional(),
        background: z.string().optional(),
        count: z.number(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        images: z.array(z.object({
          url: z.string(),
          pose: z.string(),
          expression: z.string(),
        })),
      }),
      execute: generateCharacterImage,
      sideEffectful: true,
      timeoutMs: 120000,
    },

    generate_sheet: {
      description: 'Generate a character sheet with multiple views',
      parameters: z.object({
        characterId: z.string(),
        agentId: z.string(),
        runId: z.string(),
      }),
      returns: z.object({
        images: z.array(z.object({
          url: z.string(),
          view: z.string(),
        })),
      }),
      execute: generateCharacterSheet,
      sideEffectful: true,
      timeoutMs: 480000, // 8 minutes for 4 images
    },

    update_character: {
      description: 'Update character details',
      parameters: z.object({
        characterId: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        traits: CharacterTraitsSchema.optional(),
        addReferenceImage: z.string().optional(),
      }),
      returns: z.object({
        updated: z.boolean(),
      }),
      execute: updateCharacter,
      sideEffectful: true,
      timeoutMs: 30000,
    },

    delete_character: {
      description: 'Delete a character',
      parameters: z.object({
        characterId: z.string(),
      }),
      returns: z.object({
        deleted: z.boolean(),
      }),
      execute: deleteCharacter,
      sideEffectful: true,
      timeoutMs: 10000,
    },
  },

  systemPrompt: `You are a character creation and generation specialist. Your role is to help users create consistent, well-defined characters.

Workflow for new characters:
1. Gather character details (name, description, traits)
2. Create the character in the database
3. Generate initial reference images
4. Save reference images for consistency

Workflow for existing characters:
1. Retrieve character details
2. Generate new images maintaining consistency
3. Use stored traits for accurate reproduction

Character traits to consider:
- Physical: gender, age, height, body type, skin tone
- Face: eye color, hair color/style, facial features
- Style: clothing preferences, accessories, aesthetic
- Distinguishing marks: scars, tattoos, birthmarks

Generation tips:
- Include all relevant traits in prompts
- Maintain consistent style descriptors
- Use reference images when available
- Generate character sheets for full reference

Poses and expressions:
- Neutral, happy, sad, angry, surprised
- Standing, sitting, action, portrait
- Front view, side profile, three-quarter`,

  config: {
    maxTurns: 10,
    temperature: 0.5,
    maxTokens: 2048,
  },
});

export default characterCreatorAgent;
