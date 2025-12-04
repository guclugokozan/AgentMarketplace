/**
 * Product Description Writer Agent
 *
 * Generates compelling product descriptions for e-commerce listings.
 * Features:
 * - SEO-optimized content
 * - Multiple format outputs (short/long descriptions, bullet points)
 * - Platform-specific formatting (Amazon, Shopify, etc.)
 * - Tone customization
 */

import { z } from 'zod';
import type { Agent, AgentCard, AgentInput, AgentOutput, ExecutionContext, ToolDefinition } from '../../../core/types.js';

// =============================================================================
// SCHEMAS
// =============================================================================

const ProductInfoSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().optional(),
  brand: z.string().optional(),
  price: z.number().optional(),
  currency: z.string().default('USD'),
  features: z.array(z.string()).optional(),
  specifications: z.record(z.string()).optional(),
  targetAudience: z.string().optional(),
  uniqueSellingPoints: z.array(z.string()).optional(),
  images: z.array(z.object({
    url: z.string().url().optional(),
    base64: z.string().optional(),
    description: z.string().optional(),
  })).optional(),
});

const InputSchema = z.object({
  product: ProductInfoSchema,
  platform: z.enum([
    'generic', 'amazon', 'shopify', 'etsy', 'ebay', 'woocommerce'
  ]).default('generic'),
  tone: z.enum([
    'professional', 'casual', 'luxury', 'playful', 'technical', 'persuasive'
  ]).default('professional'),
  length: z.enum(['short', 'medium', 'long']).default('medium'),
  includeEmoji: z.boolean().default(false),
  targetKeywords: z.array(z.string()).optional(),
  competitorUrls: z.array(z.string().url()).optional(),
  language: z.string().default('en'),
});

const OutputSchema = z.object({
  title: z.string(),
  shortDescription: z.string(),
  longDescription: z.string(),
  bulletPoints: z.array(z.string()),
  seoTitle: z.string(),
  seoDescription: z.string(),
  tags: z.array(z.string()),
  keywords: z.array(z.string()),
  platform: z.string(),
  characterCounts: z.object({
    title: z.number(),
    shortDescription: z.number(),
    longDescription: z.number(),
  }),
  suggestions: z.array(z.object({
    type: z.string(),
    suggestion: z.string(),
  })).optional(),
});

export type ProductDescriptionInput = z.infer<typeof InputSchema>;
export type ProductDescriptionOutput = z.infer<typeof OutputSchema>;

// =============================================================================
// TOOLS
// =============================================================================

const analyzeProductTool: ToolDefinition = {
  name: 'analyze_product',
  version: '1.0.0',
  description: 'Analyze product information to identify key selling points',
  inputSchema: {
    type: 'object',
    properties: {
      product: { type: 'object' },
      targetAudience: { type: 'string' },
    },
    required: ['product'],
  },
  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: true,
  sideEffectful: false,
  scopes: [],
  allowlistedDomains: [],
  timeoutMs: 10000,
  async execute(input: { product: z.infer<typeof ProductInfoSchema>; targetAudience?: string }) {
    const { product } = input;

    // Extract key selling points from features and specs
    const sellingPoints: string[] = [];

    if (product.features) {
      sellingPoints.push(...product.features.slice(0, 5));
    }

    if (product.uniqueSellingPoints) {
      sellingPoints.push(...product.uniqueSellingPoints);
    }

    // Identify product category traits
    const categoryTraits = getCategoryTraits(product.category);

    return {
      productName: product.name,
      brand: product.brand,
      sellingPoints,
      categoryTraits,
      pricePoint: getPricePoint(product.price),
      targetAudience: input.targetAudience || product.targetAudience || 'general consumers',
    };
  },
};

const generateDescriptionTool: ToolDefinition = {
  name: 'generate_description',
  version: '1.0.0',
  description: 'Generate product description content',
  inputSchema: {
    type: 'object',
    properties: {
      product: { type: 'object' },
      analysis: { type: 'object' },
      tone: { type: 'string' },
      length: { type: 'string' },
      platform: { type: 'string' },
    },
    required: ['product', 'analysis', 'tone', 'length', 'platform'],
  },
  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: true,
  sideEffectful: false,
  scopes: [],
  allowlistedDomains: [],
  timeoutMs: 30000,
  async execute(input: {
    product: z.infer<typeof ProductInfoSchema>;
    analysis: Record<string, unknown>;
    tone: string;
    length: string;
    platform: string;
    keywords?: string[];
    includeEmoji?: boolean;
  }) {
    const { product, analysis, tone, length, platform, keywords, includeEmoji } = input;
    const sellingPoints = (analysis.sellingPoints as string[]) || [];

    // Generate title
    const title = generateTitle(product, tone, platform);

    // Generate descriptions based on length
    const lengthConfig = {
      short: { sentences: 2, bulletCount: 3 },
      medium: { sentences: 4, bulletCount: 5 },
      long: { sentences: 8, bulletCount: 7 },
    };
    const config = lengthConfig[length as keyof typeof lengthConfig];

    const shortDescription = generateShortDescription(product, sellingPoints, tone, includeEmoji);
    const longDescription = generateLongDescription(product, sellingPoints, tone, config.sentences, includeEmoji);
    const bulletPoints = generateBulletPoints(product, sellingPoints, config.bulletCount);

    // Generate SEO content
    const seoTitle = generateSEOTitle(product, keywords);
    const seoDescription = generateSEODescription(product, keywords);
    const tags = generateTags(product, keywords);

    return {
      title,
      shortDescription,
      longDescription,
      bulletPoints,
      seoTitle,
      seoDescription,
      tags,
      keywords: keywords || extractKeywords(product),
    };
  },
};

const optimizeForPlatformTool: ToolDefinition = {
  name: 'optimize_for_platform',
  version: '1.0.0',
  description: 'Optimize content for specific e-commerce platform requirements',
  inputSchema: {
    type: 'object',
    properties: {
      content: { type: 'object' },
      platform: { type: 'string' },
    },
    required: ['content', 'platform'],
  },
  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: true,
  sideEffectful: false,
  scopes: [],
  allowlistedDomains: [],
  timeoutMs: 5000,
  async execute(input: { content: Record<string, unknown>; platform: string }) {
    const { content, platform } = input;

    // Platform-specific limits
    const limits: Record<string, { titleMax: number; descMax: number; bulletMax: number }> = {
      amazon: { titleMax: 200, descMax: 2000, bulletMax: 500 },
      shopify: { titleMax: 255, descMax: 5000, bulletMax: 1000 },
      etsy: { titleMax: 140, descMax: 10000, bulletMax: 1000 },
      ebay: { titleMax: 80, descMax: 4000, bulletMax: 500 },
      woocommerce: { titleMax: 300, descMax: 10000, bulletMax: 2000 },
      generic: { titleMax: 255, descMax: 5000, bulletMax: 1000 },
    };

    const limit = limits[platform] || limits.generic;

    // Truncate if needed
    const title = truncate(content.title as string, limit.titleMax);
    const longDescription = truncate(content.longDescription as string, limit.descMax);
    const bulletPoints = (content.bulletPoints as string[]).map(bp => truncate(bp, limit.bulletMax));

    const suggestions: Array<{ type: string; suggestion: string }> = [];

    if ((content.title as string).length > limit.titleMax) {
      suggestions.push({
        type: 'title',
        suggestion: `Title was truncated to ${limit.titleMax} characters for ${platform}`,
      });
    }

    return {
      ...content,
      title,
      longDescription,
      bulletPoints,
      suggestions,
      characterCounts: {
        title: title.length,
        shortDescription: (content.shortDescription as string).length,
        longDescription: longDescription.length,
      },
    };
  },
};

// =============================================================================
// AGENT CARD
// =============================================================================

const productDescriptionWriterCard: AgentCard = {
  id: 'product-description-writer',
  name: 'Product Description Writer',
  description: 'Generate compelling, SEO-optimized product descriptions for e-commerce listings. Supports multiple platforms including Amazon, Shopify, Etsy, and more.',
  version: '1.0.0',
  capabilities: [
    'content-generation',
    'seo-optimization',
    'e-commerce',
    'copywriting',
    'multi-platform',
  ],
  inputSchema: {
    type: 'object',
    properties: {
      product: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string' },
          brand: { type: 'string' },
          features: { type: 'array', items: { type: 'string' } },
        },
        required: ['name'],
      },
      platform: { type: 'string', enum: ['generic', 'amazon', 'shopify', 'etsy', 'ebay', 'woocommerce'] },
      tone: { type: 'string', enum: ['professional', 'casual', 'luxury', 'playful', 'technical', 'persuasive'] },
      length: { type: 'string', enum: ['short', 'medium', 'long'] },
    },
    required: ['product'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      shortDescription: { type: 'string' },
      longDescription: { type: 'string' },
      bulletPoints: { type: 'array', items: { type: 'string' } },
      seoTitle: { type: 'string' },
      seoDescription: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    },
  },
  defaultModel: 'claude-sonnet-4-5-20250514',
  defaultEffortLevel: 'medium',
  sideEffects: false,
  estimatedCostTier: 'low',
};

// =============================================================================
// AGENT IMPLEMENTATION
// =============================================================================

export const productDescriptionWriterAgent: Agent = {
  card: productDescriptionWriterCard,

  async execute(input: AgentInput, context: ExecutionContext): Promise<AgentOutput> {
    const startTime = Date.now();

    try {
      // Validate input
      const parseResult = InputSchema.safeParse(input.parameters);
      if (!parseResult.success) {
        return {
          status: 'failed',
          result: {
            error: 'Invalid input',
            details: parseResult.error.errors,
          },
          usage: context.consumed,
        };
      }

      const params = parseResult.data;

      // Step 1: Analyze product
      const analysis = await analyzeProductTool.execute({
        product: params.product,
        targetAudience: params.product.targetAudience,
      }, {} as any);

      // Step 2: Generate descriptions
      const content = await generateDescriptionTool.execute({
        product: params.product,
        analysis,
        tone: params.tone,
        length: params.length,
        platform: params.platform,
        keywords: params.targetKeywords,
        includeEmoji: params.includeEmoji,
      }, {} as any);

      // Step 3: Optimize for platform
      const optimized = await optimizeForPlatformTool.execute({
        content,
        platform: params.platform,
      }, {} as any);

      const result: ProductDescriptionOutput = {
        title: optimized.title as string,
        shortDescription: content.shortDescription as string,
        longDescription: optimized.longDescription as string,
        bulletPoints: optimized.bulletPoints as string[],
        seoTitle: content.seoTitle as string,
        seoDescription: content.seoDescription as string,
        tags: content.tags as string[],
        keywords: content.keywords as string[],
        platform: params.platform,
        characterCounts: optimized.characterCounts as { title: number; shortDescription: number; longDescription: number },
        suggestions: optimized.suggestions as Array<{ type: string; suggestion: string }>,
      };

      return {
        status: 'success',
        result,
        usage: {
          ...context.consumed,
          durationMs: Date.now() - startTime,
        },
      };
    } catch (error) {
      return {
        status: 'failed',
        result: {
          error: (error as Error).message,
        },
        usage: {
          ...context.consumed,
          durationMs: Date.now() - startTime,
        },
      };
    }
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getCategoryTraits(category?: string): string[] {
  const categoryMap: Record<string, string[]> = {
    electronics: ['innovative', 'high-tech', 'reliable', 'cutting-edge'],
    fashion: ['stylish', 'trendy', 'comfortable', 'versatile'],
    home: ['durable', 'practical', 'elegant', 'space-saving'],
    beauty: ['luxurious', 'effective', 'gentle', 'premium'],
    sports: ['performance', 'durable', 'lightweight', 'professional-grade'],
    food: ['delicious', 'fresh', 'natural', 'premium-quality'],
    toys: ['fun', 'educational', 'safe', 'engaging'],
  };

  if (!category) return ['quality', 'reliable', 'excellent'];

  const lowerCategory = category.toLowerCase();
  for (const [key, traits] of Object.entries(categoryMap)) {
    if (lowerCategory.includes(key)) {
      return traits;
    }
  }

  return ['quality', 'reliable', 'excellent'];
}

function getPricePoint(price?: number): string {
  if (!price) return 'standard';
  if (price < 25) return 'budget';
  if (price < 100) return 'mid-range';
  if (price < 500) return 'premium';
  return 'luxury';
}

function generateTitle(product: z.infer<typeof ProductInfoSchema>, tone: string, platform: string): string {
  const parts: string[] = [];

  if (product.brand) {
    parts.push(product.brand);
  }

  parts.push(product.name);

  if (product.features && product.features.length > 0) {
    parts.push('-');
    parts.push(product.features[0]);
  }

  return parts.join(' ');
}

function generateShortDescription(
  product: z.infer<typeof ProductInfoSchema>,
  sellingPoints: string[],
  tone: string,
  includeEmoji?: boolean
): string {
  const intro = getIntroByTone(tone, product.name);
  const points = sellingPoints.slice(0, 2).join(' and ');

  let description = `${intro} ${points ? `Features ${points}.` : ''}`;

  if (includeEmoji) {
    description = `✨ ${description}`;
  }

  return description.trim();
}

function generateLongDescription(
  product: z.infer<typeof ProductInfoSchema>,
  sellingPoints: string[],
  tone: string,
  sentences: number,
  includeEmoji?: boolean
): string {
  const paragraphs: string[] = [];

  // Opening paragraph
  paragraphs.push(getIntroByTone(tone, product.name));

  // Features paragraph
  if (sellingPoints.length > 0) {
    paragraphs.push(`Key features include: ${sellingPoints.slice(0, 4).join(', ')}.`);
  }

  // Specifications paragraph
  if (product.specifications) {
    const specs = Object.entries(product.specifications)
      .slice(0, 3)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
    if (specs) {
      paragraphs.push(`Specifications: ${specs}.`);
    }
  }

  // Call to action
  paragraphs.push(getCTAByTone(tone));

  let description = paragraphs.slice(0, sentences).join(' ');

  if (includeEmoji) {
    description = description
      .replace(/features/gi, '✅ Features')
      .replace(/quality/gi, '⭐ Quality');
  }

  return description;
}

function generateBulletPoints(
  product: z.infer<typeof ProductInfoSchema>,
  sellingPoints: string[],
  count: number
): string[] {
  const bullets: string[] = [];

  // Add features as bullets
  if (product.features) {
    for (const feature of product.features.slice(0, count)) {
      bullets.push(feature);
    }
  }

  // Add selling points
  for (const point of sellingPoints) {
    if (bullets.length >= count) break;
    if (!bullets.includes(point)) {
      bullets.push(point);
    }
  }

  // Add specifications as bullets
  if (product.specifications && bullets.length < count) {
    for (const [key, value] of Object.entries(product.specifications)) {
      if (bullets.length >= count) break;
      bullets.push(`${key}: ${value}`);
    }
  }

  return bullets.slice(0, count);
}

function generateSEOTitle(product: z.infer<typeof ProductInfoSchema>, keywords?: string[]): string {
  const parts: string[] = [product.name];

  if (product.brand) {
    parts.unshift(product.brand);
  }

  if (keywords && keywords.length > 0) {
    parts.push('-', keywords[0]);
  }

  if (product.category) {
    parts.push('|', product.category);
  }

  return parts.join(' ').slice(0, 60);
}

function generateSEODescription(product: z.infer<typeof ProductInfoSchema>, keywords?: string[]): string {
  let desc = `Shop ${product.name}`;

  if (product.brand) {
    desc = `Shop ${product.brand} ${product.name}`;
  }

  if (product.features && product.features.length > 0) {
    desc += `. Features: ${product.features.slice(0, 2).join(', ')}`;
  }

  if (keywords && keywords.length > 0) {
    desc += `. ${keywords.slice(0, 2).join(', ')}`;
  }

  desc += '. Free shipping available.';

  return desc.slice(0, 160);
}

function generateTags(product: z.infer<typeof ProductInfoSchema>, keywords?: string[]): string[] {
  const tags: string[] = [];

  if (product.category) {
    tags.push(product.category.toLowerCase());
  }

  if (product.brand) {
    tags.push(product.brand.toLowerCase());
  }

  // Extract words from product name
  const nameWords = product.name.toLowerCase().split(/\s+/);
  for (const word of nameWords) {
    if (word.length > 3 && !tags.includes(word)) {
      tags.push(word);
    }
  }

  if (keywords) {
    for (const kw of keywords) {
      if (!tags.includes(kw.toLowerCase())) {
        tags.push(kw.toLowerCase());
      }
    }
  }

  return tags.slice(0, 10);
}

function extractKeywords(product: z.infer<typeof ProductInfoSchema>): string[] {
  const keywords: string[] = [];

  if (product.category) keywords.push(product.category);
  if (product.brand) keywords.push(product.brand);

  const nameWords = product.name.split(/\s+/).filter(w => w.length > 3);
  keywords.push(...nameWords);

  return [...new Set(keywords)].slice(0, 10);
}

function getIntroByTone(tone: string, productName: string): string {
  const intros: Record<string, string> = {
    professional: `Introducing the ${productName}, designed to meet the highest standards of quality and performance.`,
    casual: `Meet the ${productName} - your new favorite product that makes life easier!`,
    luxury: `Experience unparalleled excellence with the ${productName}, crafted for those who demand the finest.`,
    playful: `Say hello to the amazing ${productName}! Get ready for something awesome!`,
    technical: `The ${productName} delivers exceptional specifications and performance metrics.`,
    persuasive: `Transform your experience with the ${productName} - the smart choice for discerning customers.`,
  };

  return intros[tone] || intros.professional;
}

function getCTAByTone(tone: string): string {
  const ctas: Record<string, string> = {
    professional: 'Order now and experience the difference.',
    casual: 'Grab yours today!',
    luxury: 'Indulge in excellence. Order your exclusive piece today.',
    playful: 'Don\'t wait - add to cart now and join the fun!',
    technical: 'View specifications and order now.',
    persuasive: 'Join thousands of satisfied customers. Buy now!',
  };

  return ctas[tone] || ctas.professional;
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

export default productDescriptionWriterAgent;
