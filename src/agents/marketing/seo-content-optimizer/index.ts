/**
 * SEO Content Optimizer Agent
 *
 * AI-powered SEO optimization agent that analyzes and improves
 * content for search engine visibility and user engagement.
 *
 * Capabilities:
 * - Keyword analysis and density optimization
 * - Meta tag generation (title, description)
 * - Content structure analysis (headings, readability)
 * - Internal/external linking suggestions
 * - Competitive content analysis
 * - SEO score calculation
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const KeywordAnalysisSchema = z.object({
  keyword: z.string(),
  count: z.number(),
  density: z.number().describe('Percentage of total words'),
  inTitle: z.boolean(),
  inFirstParagraph: z.boolean(),
  inHeadings: z.boolean(),
  prominence: z.number().min(0).max(100).describe('Overall keyword prominence score'),
});

const ReadabilityScoreSchema = z.object({
  fleschReadingEase: z.number().min(0).max(100),
  gradeLevel: z.number(),
  averageSentenceLength: z.number(),
  averageWordLength: z.number(),
  complexWordPercentage: z.number(),
  readabilityLevel: z.enum(['very_easy', 'easy', 'fairly_easy', 'standard', 'fairly_difficult', 'difficult', 'very_difficult']),
});

const ContentStructureSchema = z.object({
  wordCount: z.number(),
  paragraphCount: z.number(),
  sentenceCount: z.number(),
  headingStructure: z.array(z.object({
    level: z.number().min(1).max(6),
    text: z.string(),
    hasKeyword: z.boolean(),
  })),
  hasTableOfContents: z.boolean(),
  imageCount: z.number(),
  linkCount: z.object({
    internal: z.number(),
    external: z.number(),
  }),
});

const MetaTagsSchema = z.object({
  title: z.object({
    text: z.string(),
    length: z.number(),
    hasKeyword: z.boolean(),
    score: z.number().min(0).max(100),
    suggestions: z.array(z.string()),
  }),
  description: z.object({
    text: z.string(),
    length: z.number(),
    hasKeyword: z.boolean(),
    hasCTA: z.boolean(),
    score: z.number().min(0).max(100),
    suggestions: z.array(z.string()),
  }),
});

const SEOIssueSchema = z.object({
  type: z.enum(['critical', 'warning', 'info']),
  category: z.enum(['keyword', 'structure', 'meta', 'readability', 'links', 'technical']),
  message: z.string(),
  suggestion: z.string(),
  impact: z.enum(['high', 'medium', 'low']),
});

const SEOScoreSchema = z.object({
  overall: z.number().min(0).max(100),
  breakdown: z.object({
    keyword: z.number().min(0).max(100),
    content: z.number().min(0).max(100),
    structure: z.number().min(0).max(100),
    readability: z.number().min(0).max(100),
    meta: z.number().min(0).max(100),
    links: z.number().min(0).max(100),
  }),
  grade: z.enum(['A+', 'A', 'B', 'C', 'D', 'F']),
});

// Input/Output Schemas
const SEOAnalysisInputSchema = z.object({
  content: z.string().describe('The content to analyze (HTML or plain text)'),
  targetKeywords: z.array(z.string()).min(1).max(5).describe('Primary keywords to optimize for'),
  contentType: z.enum(['blog_post', 'product_page', 'landing_page', 'article', 'homepage']).default('article'),
  existingMeta: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  competitorUrls: z.array(z.string()).optional().describe('URLs of competitor content for comparison'),
});

const SEOAnalysisOutputSchema = z.object({
  score: SEOScoreSchema,
  keywords: z.array(KeywordAnalysisSchema),
  readability: ReadabilityScoreSchema,
  structure: ContentStructureSchema,
  meta: MetaTagsSchema,
  issues: z.array(SEOIssueSchema),
  recommendations: z.array(z.object({
    priority: z.enum(['high', 'medium', 'low']),
    category: z.string(),
    action: z.string(),
    expectedImpact: z.string(),
  })),
  optimizedContent: z.object({
    suggestedTitle: z.string(),
    suggestedDescription: z.string(),
    suggestedHeadings: z.array(z.string()),
    contentSuggestions: z.array(z.string()),
  }),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractHeadings(html: string): Array<{ level: number; text: string }> {
  const headings: Array<{ level: number; text: string }> = [];
  const headingRegex = /<h([1-6])[^>]*>(.*?)<\/h\1>/gi;
  let match;

  while ((match = headingRegex.exec(html)) !== null) {
    headings.push({
      level: parseInt(match[1]),
      text: stripHtml(match[2]),
    });
  }

  return headings;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(word => word.length > 0).length;
}

function countSentences(text: string): number {
  return text.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
}

function countSyllables(word: string): number {
  word = word.toLowerCase();
  if (word.length <= 3) return 1;

  word = word.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '');
  word = word.replace(/^y/, '');

  const syllables = word.match(/[aeiouy]{1,2}/g);
  return syllables ? syllables.length : 1;
}

function calculateFleschReadingEase(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = countSentences(text);
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);

  if (words.length === 0 || sentences === 0) return 0;

  const avgSentenceLength = words.length / sentences;
  const avgSyllablesPerWord = syllables / words.length;

  const score = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getReadabilityLevel(score: number): ReadabilityScoreSchema['_output']['readabilityLevel'] {
  if (score >= 90) return 'very_easy';
  if (score >= 80) return 'easy';
  if (score >= 70) return 'fairly_easy';
  if (score >= 60) return 'standard';
  if (score >= 50) return 'fairly_difficult';
  if (score >= 30) return 'difficult';
  return 'very_difficult';
}

function calculateGradeLevel(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const sentences = countSentences(text);
  const complexWords = words.filter(word => countSyllables(word) >= 3).length;

  if (words.length === 0 || sentences === 0) return 0;

  // Gunning Fog Index
  const avgSentenceLength = words.length / sentences;
  const complexWordPercentage = (complexWords / words.length) * 100;

  return Math.round(0.4 * (avgSentenceLength + complexWordPercentage));
}

function calculateKeywordDensity(text: string, keyword: string): number {
  const words = text.toLowerCase().split(/\s+/);
  const keywordWords = keyword.toLowerCase().split(/\s+/);
  const totalWords = words.length;

  if (totalWords === 0) return 0;

  let count = 0;
  for (let i = 0; i <= words.length - keywordWords.length; i++) {
    const slice = words.slice(i, i + keywordWords.length).join(' ');
    if (slice === keyword.toLowerCase()) {
      count++;
    }
  }

  return Math.round((count / totalWords) * 1000) / 10; // Percentage with 1 decimal
}

function countKeywordOccurrences(text: string, keyword: string): number {
  const regex = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function getSEOGrade(score: number): SEOScoreSchema['_output']['grade'] {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function analyzeKeywords(
  ctx: AgentContext,
  params: { content: string; targetKeywords: string[]; title?: string }
): Promise<KeywordAnalysisSchema['_output'][]> {
  const plainText = stripHtml(params.content);
  const headings = extractHeadings(params.content);
  const firstParagraph = plainText.split(/\n\n/)[0] || plainText.substring(0, 500);
  const headingText = headings.map(h => h.text).join(' ').toLowerCase();

  return params.targetKeywords.map(keyword => {
    const count = countKeywordOccurrences(plainText, keyword);
    const density = calculateKeywordDensity(plainText, keyword);
    const inTitle = params.title ? params.title.toLowerCase().includes(keyword.toLowerCase()) : false;
    const inFirstParagraph = firstParagraph.toLowerCase().includes(keyword.toLowerCase());
    const inHeadings = headingText.includes(keyword.toLowerCase());

    // Calculate prominence score
    let prominence = 0;
    if (inTitle) prominence += 30;
    if (inFirstParagraph) prominence += 25;
    if (inHeadings) prominence += 20;
    if (density >= 0.5 && density <= 2.5) prominence += 25;
    else if (density > 0) prominence += 10;

    return {
      keyword,
      count,
      density,
      inTitle,
      inFirstParagraph,
      inHeadings,
      prominence: Math.min(100, prominence),
    };
  });
}

async function analyzeReadability(
  ctx: AgentContext,
  params: { content: string }
): Promise<ReadabilityScoreSchema['_output']> {
  const plainText = stripHtml(params.content);
  const words = plainText.split(/\s+/).filter(w => w.length > 0);
  const sentences = countSentences(plainText);

  const fleschReadingEase = calculateFleschReadingEase(plainText);
  const gradeLevel = calculateGradeLevel(plainText);
  const averageSentenceLength = sentences > 0 ? Math.round(words.length / sentences * 10) / 10 : 0;
  const averageWordLength = words.length > 0
    ? Math.round(words.reduce((sum, w) => sum + w.length, 0) / words.length * 10) / 10
    : 0;
  const complexWords = words.filter(word => countSyllables(word) >= 3).length;
  const complexWordPercentage = words.length > 0
    ? Math.round((complexWords / words.length) * 1000) / 10
    : 0;

  logger.info('readability_analyzed', {
    fleschScore: fleschReadingEase,
    gradeLevel,
    wordCount: words.length,
  });

  return {
    fleschReadingEase,
    gradeLevel,
    averageSentenceLength,
    averageWordLength,
    complexWordPercentage,
    readabilityLevel: getReadabilityLevel(fleschReadingEase),
  };
}

async function analyzeStructure(
  ctx: AgentContext,
  params: { content: string; targetKeywords: string[] }
): Promise<ContentStructureSchema['_output']> {
  const plainText = stripHtml(params.content);
  const headings = extractHeadings(params.content);

  const wordCount = countWords(plainText);
  const paragraphCount = params.content.split(/<\/p>|<br\s*\/?>\s*<br\s*\/?>/gi).length;
  const sentenceCount = countSentences(plainText);

  // Count links
  const internalLinkRegex = /<a[^>]*href=["'](?!https?:\/\/|\/\/)[^"']*["'][^>]*>/gi;
  const externalLinkRegex = /<a[^>]*href=["'](?:https?:\/\/|\/\/)[^"']*["'][^>]*>/gi;
  const internalLinks = (params.content.match(internalLinkRegex) || []).length;
  const externalLinks = (params.content.match(externalLinkRegex) || []).length;

  // Count images
  const imageRegex = /<img[^>]*>/gi;
  const imageCount = (params.content.match(imageRegex) || []).length;

  // Check for table of contents
  const hasTableOfContents = params.content.toLowerCase().includes('table of contents') ||
    params.content.includes('id="toc"') ||
    params.content.includes('class="toc"');

  const headingStructure = headings.map(h => ({
    level: h.level,
    text: h.text,
    hasKeyword: params.targetKeywords.some(kw =>
      h.text.toLowerCase().includes(kw.toLowerCase())
    ),
  }));

  return {
    wordCount,
    paragraphCount,
    sentenceCount,
    headingStructure,
    hasTableOfContents,
    imageCount,
    linkCount: {
      internal: internalLinks,
      external: externalLinks,
    },
  };
}

async function analyzeMeta(
  ctx: AgentContext,
  params: {
    title?: string;
    description?: string;
    targetKeywords: string[];
    contentType: string;
  }
): Promise<MetaTagsSchema['_output']> {
  const primaryKeyword = params.targetKeywords[0] || '';

  // Title analysis
  const titleText = params.title || '';
  const titleLength = titleText.length;
  const titleHasKeyword = titleText.toLowerCase().includes(primaryKeyword.toLowerCase());

  let titleScore = 0;
  const titleSuggestions: string[] = [];

  if (titleLength >= 50 && titleLength <= 60) titleScore += 40;
  else if (titleLength > 0 && titleLength < 50) {
    titleScore += 20;
    titleSuggestions.push('Title is too short. Aim for 50-60 characters.');
  } else if (titleLength > 60) {
    titleScore += 20;
    titleSuggestions.push('Title is too long. Keep it under 60 characters to avoid truncation.');
  }

  if (titleHasKeyword) titleScore += 40;
  else titleSuggestions.push(`Include your primary keyword "${primaryKeyword}" in the title.`);

  if (titleText && titleText[0] === titleText[0].toUpperCase()) titleScore += 10;
  if (titleText.includes('|') || titleText.includes('-')) titleScore += 10;

  // Description analysis
  const descText = params.description || '';
  const descLength = descText.length;
  const descHasKeyword = descText.toLowerCase().includes(primaryKeyword.toLowerCase());
  const descHasCTA = /\b(learn|discover|find out|get|try|start|click|read)\b/i.test(descText);

  let descScore = 0;
  const descSuggestions: string[] = [];

  if (descLength >= 150 && descLength <= 160) descScore += 30;
  else if (descLength > 0 && descLength < 150) {
    descScore += 15;
    descSuggestions.push('Meta description is too short. Aim for 150-160 characters.');
  } else if (descLength > 160) {
    descScore += 15;
    descSuggestions.push('Meta description is too long. Keep it under 160 characters.');
  }

  if (descHasKeyword) descScore += 30;
  else descSuggestions.push(`Include your primary keyword "${primaryKeyword}" in the description.`);

  if (descHasCTA) descScore += 20;
  else descSuggestions.push('Add a call-to-action to improve click-through rates.');

  if (descText.length > 0) descScore += 20;
  else descSuggestions.push('Add a meta description to improve search visibility.');

  return {
    title: {
      text: titleText,
      length: titleLength,
      hasKeyword: titleHasKeyword,
      score: titleScore,
      suggestions: titleSuggestions,
    },
    description: {
      text: descText,
      length: descLength,
      hasKeyword: descHasKeyword,
      hasCTA: descHasCTA,
      score: descScore,
      suggestions: descSuggestions,
    },
  };
}

async function identifyIssues(
  ctx: AgentContext,
  params: {
    keywords: KeywordAnalysisSchema['_output'][];
    readability: ReadabilityScoreSchema['_output'];
    structure: ContentStructureSchema['_output'];
    meta: MetaTagsSchema['_output'];
  }
): Promise<SEOIssueSchema['_output'][]> {
  const issues: SEOIssueSchema['_output'][] = [];

  // Keyword issues
  for (const kw of params.keywords) {
    if (kw.density === 0) {
      issues.push({
        type: 'critical',
        category: 'keyword',
        message: `Target keyword "${kw.keyword}" not found in content`,
        suggestion: `Add the keyword "${kw.keyword}" naturally throughout your content`,
        impact: 'high',
      });
    } else if (kw.density < 0.5) {
      issues.push({
        type: 'warning',
        category: 'keyword',
        message: `Keyword "${kw.keyword}" density is too low (${kw.density}%)`,
        suggestion: 'Aim for keyword density between 0.5% and 2.5%',
        impact: 'medium',
      });
    } else if (kw.density > 3) {
      issues.push({
        type: 'warning',
        category: 'keyword',
        message: `Keyword "${kw.keyword}" density might be too high (${kw.density}%)`,
        suggestion: 'Reduce keyword usage to avoid keyword stuffing penalties',
        impact: 'medium',
      });
    }

    if (!kw.inFirstParagraph) {
      issues.push({
        type: 'warning',
        category: 'keyword',
        message: `Keyword "${kw.keyword}" not found in the first paragraph`,
        suggestion: 'Include your primary keyword in the first 100 words',
        impact: 'medium',
      });
    }

    if (!kw.inHeadings) {
      issues.push({
        type: 'info',
        category: 'keyword',
        message: `Keyword "${kw.keyword}" not found in any heading`,
        suggestion: 'Include keywords in H2 or H3 headings for better SEO',
        impact: 'low',
      });
    }
  }

  // Structure issues
  if (params.structure.wordCount < 300) {
    issues.push({
      type: 'critical',
      category: 'structure',
      message: 'Content is too short',
      suggestion: 'Aim for at least 300 words, ideally 1000+ for comprehensive coverage',
      impact: 'high',
    });
  } else if (params.structure.wordCount < 1000) {
    issues.push({
      type: 'info',
      category: 'structure',
      message: 'Content could be more comprehensive',
      suggestion: 'Consider expanding to 1000+ words for better ranking potential',
      impact: 'low',
    });
  }

  if (params.structure.headingStructure.length === 0) {
    issues.push({
      type: 'critical',
      category: 'structure',
      message: 'No headings found in content',
      suggestion: 'Add H2 and H3 headings to structure your content',
      impact: 'high',
    });
  }

  if (params.structure.imageCount === 0) {
    issues.push({
      type: 'warning',
      category: 'structure',
      message: 'No images found in content',
      suggestion: 'Add relevant images to improve engagement and SEO',
      impact: 'medium',
    });
  }

  if (params.structure.linkCount.internal === 0) {
    issues.push({
      type: 'warning',
      category: 'links',
      message: 'No internal links found',
      suggestion: 'Add internal links to related content on your site',
      impact: 'medium',
    });
  }

  if (params.structure.linkCount.external === 0) {
    issues.push({
      type: 'info',
      category: 'links',
      message: 'No external links found',
      suggestion: 'Consider linking to authoritative external sources',
      impact: 'low',
    });
  }

  // Readability issues
  if (params.readability.fleschReadingEase < 50) {
    issues.push({
      type: 'warning',
      category: 'readability',
      message: 'Content readability is low',
      suggestion: 'Simplify sentences and use shorter words to improve readability',
      impact: 'medium',
    });
  }

  if (params.readability.averageSentenceLength > 25) {
    issues.push({
      type: 'info',
      category: 'readability',
      message: 'Sentences are quite long on average',
      suggestion: 'Break up long sentences for better readability',
      impact: 'low',
    });
  }

  // Meta issues
  if (params.meta.title.score < 50) {
    issues.push({
      type: 'critical',
      category: 'meta',
      message: 'Title tag needs improvement',
      suggestion: params.meta.title.suggestions.join(' '),
      impact: 'high',
    });
  }

  if (params.meta.description.score < 50) {
    issues.push({
      type: 'warning',
      category: 'meta',
      message: 'Meta description needs improvement',
      suggestion: params.meta.description.suggestions.join(' '),
      impact: 'medium',
    });
  }

  return issues.sort((a, b) => {
    const typeOrder = { critical: 0, warning: 1, info: 2 };
    return typeOrder[a.type] - typeOrder[b.type];
  });
}

async function calculateSEOScore(
  ctx: AgentContext,
  params: {
    keywords: KeywordAnalysisSchema['_output'][];
    readability: ReadabilityScoreSchema['_output'];
    structure: ContentStructureSchema['_output'];
    meta: MetaTagsSchema['_output'];
    issues: SEOIssueSchema['_output'][];
  }
): Promise<SEOScoreSchema['_output']> {
  // Keyword score
  const avgKeywordProminence = params.keywords.length > 0
    ? params.keywords.reduce((sum, k) => sum + k.prominence, 0) / params.keywords.length
    : 0;
  const keywordScore = Math.round(avgKeywordProminence);

  // Content score (based on word count)
  let contentScore = 0;
  if (params.structure.wordCount >= 2000) contentScore = 100;
  else if (params.structure.wordCount >= 1500) contentScore = 90;
  else if (params.structure.wordCount >= 1000) contentScore = 80;
  else if (params.structure.wordCount >= 500) contentScore = 60;
  else if (params.structure.wordCount >= 300) contentScore = 40;
  else contentScore = 20;

  // Structure score
  let structureScore = 50; // Base
  if (params.structure.headingStructure.length >= 3) structureScore += 20;
  else if (params.structure.headingStructure.length >= 1) structureScore += 10;
  if (params.structure.imageCount >= 1) structureScore += 15;
  if (params.structure.hasTableOfContents) structureScore += 15;
  structureScore = Math.min(100, structureScore);

  // Readability score
  const readabilityScore = params.readability.fleschReadingEase;

  // Meta score
  const metaScore = Math.round((params.meta.title.score + params.meta.description.score) / 2);

  // Links score
  let linksScore = 50;
  if (params.structure.linkCount.internal >= 3) linksScore += 25;
  else if (params.structure.linkCount.internal >= 1) linksScore += 15;
  if (params.structure.linkCount.external >= 2) linksScore += 25;
  else if (params.structure.linkCount.external >= 1) linksScore += 15;
  linksScore = Math.min(100, linksScore);

  // Calculate overall score with weights
  const weights = {
    keyword: 0.25,
    content: 0.20,
    structure: 0.15,
    readability: 0.15,
    meta: 0.15,
    links: 0.10,
  };

  const overall = Math.round(
    keywordScore * weights.keyword +
    contentScore * weights.content +
    structureScore * weights.structure +
    readabilityScore * weights.readability +
    metaScore * weights.meta +
    linksScore * weights.links
  );

  // Deduct points for critical issues
  const criticalIssues = params.issues.filter(i => i.type === 'critical').length;
  const adjustedOverall = Math.max(0, overall - criticalIssues * 10);

  return {
    overall: adjustedOverall,
    breakdown: {
      keyword: keywordScore,
      content: contentScore,
      structure: structureScore,
      readability: readabilityScore,
      meta: metaScore,
      links: linksScore,
    },
    grade: getSEOGrade(adjustedOverall),
  };
}

async function generateOptimizations(
  ctx: AgentContext,
  params: {
    keywords: KeywordAnalysisSchema['_output'][];
    structure: ContentStructureSchema['_output'];
    meta: MetaTagsSchema['_output'];
    contentType: string;
  }
): Promise<{
  suggestedTitle: string;
  suggestedDescription: string;
  suggestedHeadings: string[];
  contentSuggestions: string[];
}> {
  const primaryKeyword = params.keywords[0]?.keyword || '';
  const existingHeadings = params.structure.headingStructure.map(h => h.text);

  // Generate optimized title
  let suggestedTitle = params.meta.title.text;
  if (!params.meta.title.hasKeyword && primaryKeyword) {
    suggestedTitle = `${primaryKeyword}: ${params.meta.title.text || 'Complete Guide'}`;
  }
  if (suggestedTitle.length > 60) {
    suggestedTitle = suggestedTitle.substring(0, 57) + '...';
  }

  // Generate optimized description
  let suggestedDescription = params.meta.description.text;
  if (!params.meta.description.hasKeyword && primaryKeyword) {
    suggestedDescription = `Learn about ${primaryKeyword}. ${params.meta.description.text || 'Discover everything you need to know.'} Read more now!`;
  }
  if (suggestedDescription.length > 160) {
    suggestedDescription = suggestedDescription.substring(0, 157) + '...';
  }

  // Generate heading suggestions
  const suggestedHeadings: string[] = [];
  if (existingHeadings.length < 3) {
    suggestedHeadings.push(`What is ${primaryKeyword}?`);
    suggestedHeadings.push(`Benefits of ${primaryKeyword}`);
    suggestedHeadings.push(`How to Get Started with ${primaryKeyword}`);
    suggestedHeadings.push(`${primaryKeyword} Best Practices`);
    suggestedHeadings.push(`Frequently Asked Questions`);
  }

  // Content suggestions
  const contentSuggestions: string[] = [];
  if (params.structure.wordCount < 1000) {
    contentSuggestions.push('Expand your content to at least 1000 words for better ranking potential.');
  }
  if (params.structure.imageCount === 0) {
    contentSuggestions.push('Add images with descriptive alt text containing your keywords.');
  }
  if (!params.keywords[0]?.inFirstParagraph) {
    contentSuggestions.push(`Include "${primaryKeyword}" in your opening paragraph.`);
  }
  if (params.structure.linkCount.internal === 0) {
    contentSuggestions.push('Add 2-3 internal links to related content on your site.');
  }

  return {
    suggestedTitle,
    suggestedDescription,
    suggestedHeadings,
    contentSuggestions,
  };
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const seoContentOptimizerAgent = defineAgent({
  name: 'seo-content-optimizer',
  description: 'AI-powered SEO optimization agent that analyzes and improves content for search engine visibility',
  version: '1.0.0',

  inputSchema: SEOAnalysisInputSchema,
  outputSchema: SEOAnalysisOutputSchema,

  tools: {
    analyze_keywords: {
      description: 'Analyze keyword usage, density, and placement in content',
      parameters: z.object({
        content: z.string(),
        targetKeywords: z.array(z.string()),
        title: z.string().optional(),
      }),
      returns: z.array(KeywordAnalysisSchema),
      execute: analyzeKeywords,
      timeoutMs: 15000,
    },

    analyze_readability: {
      description: 'Analyze content readability using standard metrics',
      parameters: z.object({
        content: z.string(),
      }),
      returns: ReadabilityScoreSchema,
      execute: analyzeReadability,
      timeoutMs: 15000,
    },

    analyze_structure: {
      description: 'Analyze content structure including headings, links, and images',
      parameters: z.object({
        content: z.string(),
        targetKeywords: z.array(z.string()),
      }),
      returns: ContentStructureSchema,
      execute: analyzeStructure,
      timeoutMs: 15000,
    },

    analyze_meta: {
      description: 'Analyze meta tags (title and description)',
      parameters: z.object({
        title: z.string().optional(),
        description: z.string().optional(),
        targetKeywords: z.array(z.string()),
        contentType: z.string(),
      }),
      returns: MetaTagsSchema,
      execute: analyzeMeta,
      timeoutMs: 10000,
    },

    identify_issues: {
      description: 'Identify SEO issues and areas for improvement',
      parameters: z.object({
        keywords: z.array(KeywordAnalysisSchema),
        readability: ReadabilityScoreSchema,
        structure: ContentStructureSchema,
        meta: MetaTagsSchema,
      }),
      returns: z.array(SEOIssueSchema),
      execute: identifyIssues,
      timeoutMs: 15000,
    },

    calculate_score: {
      description: 'Calculate overall SEO score and breakdown',
      parameters: z.object({
        keywords: z.array(KeywordAnalysisSchema),
        readability: ReadabilityScoreSchema,
        structure: ContentStructureSchema,
        meta: MetaTagsSchema,
        issues: z.array(SEOIssueSchema),
      }),
      returns: SEOScoreSchema,
      execute: calculateSEOScore,
      timeoutMs: 10000,
    },

    generate_optimizations: {
      description: 'Generate optimization suggestions for the content',
      parameters: z.object({
        keywords: z.array(KeywordAnalysisSchema),
        structure: ContentStructureSchema,
        meta: MetaTagsSchema,
        contentType: z.string(),
      }),
      returns: z.object({
        suggestedTitle: z.string(),
        suggestedDescription: z.string(),
        suggestedHeadings: z.array(z.string()),
        contentSuggestions: z.array(z.string()),
      }),
      execute: generateOptimizations,
      timeoutMs: 15000,
    },
  },

  systemPrompt: `You are an expert SEO analyst. Your role is to analyze content and provide actionable SEO recommendations.

When analyzing content:
1. Evaluate keyword usage, density, and placement
2. Assess readability and content structure
3. Review meta tags for optimization
4. Check for proper heading hierarchy
5. Analyze internal and external linking
6. Identify issues and prioritize fixes
7. Generate specific, actionable recommendations

Focus on:
- Practical improvements that will have real impact
- User experience alongside SEO best practices
- Clear explanations of why each recommendation matters
- Prioritizing high-impact changes over minor tweaks

Avoid:
- Keyword stuffing recommendations
- Generic advice without specific actions
- Overcomplicating the optimization process`,

  config: {
    maxTurns: 12,
    temperature: 0.3,
    maxTokens: 4096,
  },
});

export default seoContentOptimizerAgent;
