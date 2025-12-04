/**
 * Blog Writer Agent
 *
 * Generates professional blog posts with:
 * - Engaging titles and headlines
 * - Structured paragraphs with sections
 * - Image suggestions/placeholders
 * - SEO-friendly content
 */

import type { AgentDefinition, AgentCard, ToolDefinition, ExecutionContext } from '../../core/types.js';

const blogWriterCard: AgentCard = {
  id: 'blog-writer',
  name: 'Blog Writer',
  description: 'AI-powered blog post generator that creates engaging, SEO-friendly content with structured paragraphs and image suggestions',
  version: '1.0.0',
  capabilities: [
    'content-generation',
    'blog-writing',
    'seo-optimization',
    'image-suggestions',
  ],
  inputSchema: {
    type: 'object',
    properties: {
      topic: {
        type: 'string',
        description: 'The main topic or title idea for the blog post',
      },
      tone: {
        type: 'string',
        enum: ['professional', 'casual', 'technical', 'friendly', 'persuasive'],
        description: 'The writing tone for the blog post',
        default: 'professional',
      },
      length: {
        type: 'string',
        enum: ['short', 'medium', 'long'],
        description: 'Desired length of the blog post',
        default: 'medium',
      },
      targetAudience: {
        type: 'string',
        description: 'The intended audience for the blog post',
      },
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'SEO keywords to include in the content',
      },
      includeImages: {
        type: 'boolean',
        description: 'Whether to include image placeholders/suggestions',
        default: true,
      },
    },
    required: ['topic'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      metaDescription: { type: 'string' },
      content: { type: 'string' },
      sections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            heading: { type: 'string' },
            content: { type: 'string' },
            imageUrl: { type: 'string' },
            imageAlt: { type: 'string' },
          },
        },
      },
      wordCount: { type: 'number' },
      readingTime: { type: 'string' },
      suggestedTags: { type: 'array', items: { type: 'string' } },
    },
  },
  defaultModel: 'claude-sonnet-4-5-20250514',
  defaultEffortLevel: 'high',
  sideEffects: false,
  estimatedCostTier: 'medium',
};

// Blog writing tools
const generateOutlineTool: ToolDefinition = {
  name: 'generate_outline',
  version: '1.0.0',
  description: 'Generate a structured outline for the blog post',
  inputSchema: {
    type: 'object',
    properties: {
      topic: { type: 'string' },
      numSections: { type: 'number' },
    },
    required: ['topic'],
  },
  defer_loading: false,
  allowed_callers: ['agent'],
  idempotent: true,
  sideEffectful: false,
  scopes: ['write:content'],
  allowlistedDomains: [],
  timeoutMs: 30000,
  async execute(input: { topic: string; numSections?: number }) {
    const sections = input.numSections || 5;
    const outlineTemplates = [
      'Introduction',
      'Understanding the Basics',
      'Key Benefits and Advantages',
      'Best Practices and Tips',
      'Common Challenges and Solutions',
      'Real-World Examples',
      'Future Trends',
      'Conclusion and Next Steps',
    ];

    return {
      topic: input.topic,
      sections: outlineTemplates.slice(0, sections).map((title, i) => ({
        order: i + 1,
        title,
        keyPoints: [`Key point ${i + 1}a`, `Key point ${i + 1}b`],
      })),
    };
  },
};

const generateImageSuggestionTool: ToolDefinition = {
  name: 'suggest_image',
  version: '1.0.0',
  description: 'Generate image suggestions for blog sections',
  inputSchema: {
    type: 'object',
    properties: {
      sectionTitle: { type: 'string' },
      sectionContent: { type: 'string' },
    },
    required: ['sectionTitle'],
  },
  defer_loading: false,
  allowed_callers: ['agent'],
  idempotent: true,
  sideEffectful: false,
  scopes: ['read:images'],
  allowlistedDomains: ['unsplash.com', 'pexels.com'],
  timeoutMs: 10000,
  async execute(input: { sectionTitle: string; sectionContent?: string }) {
    // Generate placeholder image URLs (in production, would call image API)
    const keywords = input.sectionTitle.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(' ').slice(0, 3).join(',');
    return {
      imageUrl: `https://source.unsplash.com/800x400/?${encodeURIComponent(keywords)}`,
      altText: `Illustration for: ${input.sectionTitle}`,
      suggestion: `Consider using an image that represents "${input.sectionTitle}"`,
    };
  },
};

const writeSectionTool: ToolDefinition = {
  name: 'write_section',
  version: '1.0.0',
  description: 'Write content for a specific blog section',
  inputSchema: {
    type: 'object',
    properties: {
      heading: { type: 'string' },
      keyPoints: { type: 'array', items: { type: 'string' } },
      tone: { type: 'string' },
      wordCount: { type: 'number' },
    },
    required: ['heading'],
  },
  defer_loading: false,
  allowed_callers: ['agent'],
  idempotent: true,
  sideEffectful: false,
  scopes: ['write:content'],
  allowlistedDomains: [],
  timeoutMs: 30000,
  async execute(input: { heading: string; keyPoints?: string[]; tone?: string; wordCount?: number }) {
    // Generate section content (in production, would use LLM)
    const paragraphs = [
      `When it comes to ${input.heading.toLowerCase()}, understanding the fundamentals is crucial for success.`,
      `Many professionals in this field have discovered that taking a systematic approach yields the best results. By focusing on key strategies and maintaining consistency, you can achieve remarkable outcomes.`,
      `Remember that continuous learning and adaptation are essential in today's rapidly evolving landscape. Stay curious, stay informed, and never stop improving your skills.`,
    ];

    return {
      heading: input.heading,
      content: paragraphs.join('\n\n'),
      wordCount: paragraphs.join(' ').split(' ').length,
    };
  },
};

export const blogWriterAgent: AgentDefinition = {
  card: blogWriterCard,
  tools: [generateOutlineTool, generateImageSuggestionTool, writeSectionTool],

  systemPrompt: `You are an expert blog writer and content strategist. Your goal is to create engaging, well-structured blog posts that:

1. Capture readers' attention with compelling titles and introductions
2. Provide valuable, actionable information
3. Use clear, scannable formatting with headings and bullet points
4. Include relevant image suggestions to enhance visual appeal
5. Optimize content for SEO while maintaining readability
6. End with strong calls-to-action

Always maintain the requested tone and target the specified audience.`,

  async execute(context: ExecutionContext) {
    const { task } = context;
    const input = typeof task === 'string' ? { topic: task } : task;

    const tone = input.tone || 'professional';
    const length = input.length || 'medium';
    const sectionCount = length === 'short' ? 3 : length === 'long' ? 7 : 5;

    // Generate outline
    const outline = await generateOutlineTool.execute({
      topic: input.topic,
      numSections: sectionCount
    });

    // Generate sections with content and images
    const sections = [];
    for (const section of outline.sections) {
      const content = await writeSectionTool.execute({
        heading: section.title,
        keyPoints: section.keyPoints,
        tone,
        wordCount: 150,
      });

      let imageData = null;
      if (input.includeImages !== false) {
        imageData = await generateImageSuggestionTool.execute({
          sectionTitle: section.title,
          sectionContent: content.content,
        });
      }

      sections.push({
        heading: content.heading,
        content: content.content,
        imageUrl: imageData?.imageUrl,
        imageAlt: imageData?.altText,
      });
    }

    // Calculate totals
    const totalWords = sections.reduce((sum, s) => sum + s.content.split(' ').length, 0);
    const readingTime = Math.ceil(totalWords / 200);

    return {
      title: `The Complete Guide to ${input.topic}`,
      metaDescription: `Discover everything you need to know about ${input.topic}. Expert insights, practical tips, and actionable strategies.`,
      sections,
      wordCount: totalWords,
      readingTime: `${readingTime} min read`,
      suggestedTags: [input.topic.toLowerCase(), 'guide', 'tips', 'best-practices'],
      content: sections.map(s => `## ${s.heading}\n\n${s.content}`).join('\n\n'),
    };
  },
};

export default blogWriterAgent;
