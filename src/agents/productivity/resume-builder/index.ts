/**
 * Resume Builder Agent
 *
 * Creates professional, ATS-optimized resumes through AI assistance.
 * Features:
 * - Multiple template styles
 * - ATS optimization scoring
 * - Keyword matching for job descriptions
 * - Multiple output formats
 *
 * Inspired by: MuleRun's "UPCV Resume Gen"
 */

import { z } from 'zod';
import type { Agent, AgentCard, AgentInput, AgentOutput, ExecutionContext, ToolDefinition } from '../../../core/types.js';

// =============================================================================
// SCHEMAS
// =============================================================================

const ExperienceSchema = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().optional(),
  startDate: z.string(),
  endDate: z.string().optional(),
  current: z.boolean().optional(),
  description: z.string().optional(),
  achievements: z.array(z.string()).optional(),
  technologies: z.array(z.string()).optional(),
});

const EducationSchema = z.object({
  degree: z.string(),
  field: z.string().optional(),
  institution: z.string(),
  location: z.string().optional(),
  graduationDate: z.string(),
  gpa: z.string().optional(),
  honors: z.array(z.string()).optional(),
  relevantCourses: z.array(z.string()).optional(),
});

const InputSchema = z.object({
  mode: z.enum(['create', 'improve', 'tailor']).default('create'),

  // Existing resume for improve/tailor modes
  existingResume: z.string().optional(),

  // Target job for tailoring
  targetJob: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    company: z.string().optional(),
    requirements: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
  }).optional(),

  // Contact info
  contact: z.object({
    name: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    location: z.string().optional(),
    linkedin: z.string().url().optional(),
    portfolio: z.string().url().optional(),
    github: z.string().url().optional(),
  }).optional(),

  // Professional summary
  summary: z.string().optional(),

  // Experience
  experience: z.array(ExperienceSchema).optional(),

  // Education
  education: z.array(EducationSchema).optional(),

  // Skills
  skills: z.object({
    technical: z.array(z.string()).optional(),
    soft: z.array(z.string()).optional(),
    languages: z.array(z.object({
      language: z.string(),
      proficiency: z.enum(['native', 'fluent', 'advanced', 'intermediate', 'basic']),
    })).optional(),
    certifications: z.array(z.object({
      name: z.string(),
      issuer: z.string().optional(),
      date: z.string().optional(),
    })).optional(),
  }).optional(),

  // Projects
  projects: z.array(z.object({
    name: z.string(),
    description: z.string(),
    technologies: z.array(z.string()).optional(),
    url: z.string().url().optional(),
    highlights: z.array(z.string()).optional(),
  })).optional(),

  // Formatting options
  template: z.enum([
    'modern', 'classic', 'creative', 'minimalist', 'executive', 'tech', 'academic'
  ]).default('modern'),
  outputFormat: z.enum(['markdown', 'html', 'json']).default('markdown'),
  includeObjective: z.boolean().default(false),
});

const OutputSchema = z.object({
  resume: z.object({
    content: z.string(),
    format: z.string(),
  }),
  atsScore: z.number().min(0).max(100),
  atsDetails: z.object({
    formatting: z.number(),
    keywords: z.number(),
    structure: z.number(),
    readability: z.number(),
  }),
  keywordMatch: z.object({
    matched: z.array(z.string()),
    missing: z.array(z.string()),
    score: z.number(),
  }).optional(),
  suggestions: z.array(z.object({
    section: z.string(),
    issue: z.string(),
    recommendation: z.string(),
    priority: z.enum(['high', 'medium', 'low']),
    impact: z.string(),
  })),
  wordCount: z.number(),
  estimatedReadTime: z.string(),
});

export type ResumeBuilderInput = z.infer<typeof InputSchema>;
export type ResumeBuilderOutput = z.infer<typeof OutputSchema>;

// =============================================================================
// TOOLS
// =============================================================================

const parseResumeTool: ToolDefinition = {
  name: 'parse_resume',
  version: '1.0.0',
  description: 'Parse existing resume text into structured data',
  inputSchema: {
    type: 'object',
    properties: {
      resumeText: { type: 'string' },
    },
    required: ['resumeText'],
  },
  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: true,
  sideEffectful: false,
  scopes: [],
  allowlistedDomains: [],
  timeoutMs: 15000,
  async execute(input: { resumeText: string }) {
    // In production, this would use Claude to parse the resume
    // For now, return a basic structure
    return {
      parsed: true,
      sections: {
        contact: {},
        summary: '',
        experience: [],
        education: [],
        skills: [],
      },
      detectedFormat: 'text',
    };
  },
};

const analyzeJobDescriptionTool: ToolDefinition = {
  name: 'analyze_job_description',
  version: '1.0.0',
  description: 'Extract keywords, requirements, and preferences from job description',
  inputSchema: {
    type: 'object',
    properties: {
      description: { type: 'string' },
      title: { type: 'string' },
    },
    required: ['description'],
  },
  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: true,
  sideEffectful: false,
  scopes: [],
  allowlistedDomains: [],
  timeoutMs: 15000,
  async execute(input: { description: string; title?: string }) {
    // Extract keywords from job description
    const text = input.description.toLowerCase();

    const technicalKeywords = extractTechnicalKeywords(text);
    const softSkills = extractSoftSkills(text);
    const requirements = extractRequirements(text);

    return {
      keywords: technicalKeywords,
      softSkills,
      requirements,
      experienceLevel: detectExperienceLevel(text),
      industry: detectIndustry(text),
    };
  },
};

const generateContentTool: ToolDefinition = {
  name: 'generate_resume_content',
  version: '1.0.0',
  description: 'Generate or improve resume content for each section',
  inputSchema: {
    type: 'object',
    properties: {
      section: { type: 'string' },
      data: { type: 'object' },
      targetKeywords: { type: 'array', items: { type: 'string' } },
      style: { type: 'string' },
    },
    required: ['section', 'data'],
  },
  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: true,
  sideEffectful: false,
  scopes: [],
  allowlistedDomains: [],
  timeoutMs: 20000,
  async execute(input: {
    section: string;
    data: Record<string, unknown>;
    targetKeywords?: string[];
    style?: string;
  }) {
    const { section, data, targetKeywords } = input;

    // Generate content based on section type
    switch (section) {
      case 'summary':
        return {
          content: generateSummary(data, targetKeywords),
          keywordsUsed: targetKeywords?.slice(0, 3) || [],
        };

      case 'experience':
        return {
          content: generateExperienceSection(data as any),
          improvements: ['Added action verbs', 'Quantified achievements'],
        };

      case 'skills':
        return {
          content: organizeSkills(data as any, targetKeywords),
          keywordsUsed: targetKeywords?.filter(k => (data as any).technical?.includes(k)) || [],
        };

      default:
        return { content: '', improvements: [] };
    }
  },
};

const calculateATSScoreTool: ToolDefinition = {
  name: 'calculate_ats_score',
  version: '1.0.0',
  description: 'Calculate ATS compatibility score and provide improvement suggestions',
  inputSchema: {
    type: 'object',
    properties: {
      resumeContent: { type: 'string' },
      targetKeywords: { type: 'array', items: { type: 'string' } },
    },
    required: ['resumeContent'],
  },
  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: true,
  sideEffectful: false,
  scopes: [],
  allowlistedDomains: [],
  timeoutMs: 10000,
  async execute(input: { resumeContent: string; targetKeywords?: string[] }) {
    const { resumeContent, targetKeywords } = input;

    // Calculate various ATS factors
    const formattingScore = calculateFormattingScore(resumeContent);
    const keywordScore = calculateKeywordScore(resumeContent, targetKeywords || []);
    const structureScore = calculateStructureScore(resumeContent);
    const readabilityScore = calculateReadabilityScore(resumeContent);

    const overallScore = Math.round(
      (formattingScore * 0.25) +
      (keywordScore * 0.35) +
      (structureScore * 0.25) +
      (readabilityScore * 0.15)
    );

    // Generate suggestions
    const suggestions = generateATSSuggestions(
      formattingScore,
      keywordScore,
      structureScore,
      readabilityScore,
      targetKeywords || []
    );

    return {
      overallScore,
      details: {
        formatting: formattingScore,
        keywords: keywordScore,
        structure: structureScore,
        readability: readabilityScore,
      },
      suggestions,
      keywordMatch: {
        matched: targetKeywords?.filter(k => resumeContent.toLowerCase().includes(k.toLowerCase())) || [],
        missing: targetKeywords?.filter(k => !resumeContent.toLowerCase().includes(k.toLowerCase())) || [],
        score: keywordScore,
      },
    };
  },
};

const renderResumeTool: ToolDefinition = {
  name: 'render_resume',
  version: '1.0.0',
  description: 'Render resume in specified format and template',
  inputSchema: {
    type: 'object',
    properties: {
      data: { type: 'object' },
      template: { type: 'string' },
      format: { type: 'string' },
    },
    required: ['data', 'template', 'format'],
  },
  defer_loading: false,
  allowed_callers: ['human', 'code_execution_20250825'],
  idempotent: true,
  sideEffectful: false,
  scopes: [],
  allowlistedDomains: [],
  timeoutMs: 10000,
  async execute(input: {
    data: ResumeBuilderInput;
    template: string;
    format: string;
  }) {
    const { data, template, format } = input;

    let content: string;

    switch (format) {
      case 'markdown':
        content = renderMarkdown(data, template);
        break;
      case 'html':
        content = renderHTML(data, template);
        break;
      case 'json':
        content = JSON.stringify(data, null, 2);
        break;
      default:
        content = renderMarkdown(data, template);
    }

    const wordCount = content.split(/\s+/).length;

    return {
      content,
      format,
      wordCount,
      estimatedReadTime: `${Math.ceil(wordCount / 200)} min`,
    };
  },
};

// =============================================================================
// AGENT CARD
// =============================================================================

const resumeBuilderCard: AgentCard = {
  id: 'resume-builder',
  name: 'Resume Builder',
  description: 'Create professional, ATS-optimized resumes with AI assistance. Supports multiple templates, job-specific tailoring, and keyword optimization for better hiring outcomes.',
  version: '1.0.0',
  capabilities: [
    'document-generation',
    'resume-writing',
    'ats-optimization',
    'career-services',
    'keyword-matching',
  ],
  inputSchema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['create', 'improve', 'tailor'] },
      contact: { type: 'object' },
      experience: { type: 'array' },
      education: { type: 'array' },
      skills: { type: 'object' },
      targetJob: { type: 'object' },
      template: { type: 'string' },
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      resume: { type: 'object' },
      atsScore: { type: 'number' },
      suggestions: { type: 'array' },
    },
  },
  defaultModel: 'claude-sonnet-4-5-20250514',
  defaultEffortLevel: 'high',
  sideEffects: false,
  estimatedCostTier: 'medium',
};

// =============================================================================
// AGENT IMPLEMENTATION
// =============================================================================

export const resumeBuilderAgent: Agent = {
  card: resumeBuilderCard,

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
      let targetKeywords: string[] = [];

      // Step 1: Parse existing resume if provided
      if (params.existingResume && (params.mode === 'improve' || params.mode === 'tailor')) {
        const parsed = await parseResumeTool.execute({
          resumeText: params.existingResume,
        }, {} as any);

        // Merge parsed data with provided data
        // In production, this would intelligently merge
      }

      // Step 2: Analyze job description if provided
      if (params.targetJob?.description) {
        const jobAnalysis = await analyzeJobDescriptionTool.execute({
          description: params.targetJob.description,
          title: params.targetJob.title,
        }, {} as any);

        targetKeywords = [
          ...(jobAnalysis.keywords || []),
          ...(params.targetJob.keywords || []),
        ];
      }

      // Step 3: Generate/improve content for each section
      if (params.experience && params.experience.length > 0) {
        await generateContentTool.execute({
          section: 'experience',
          data: { experience: params.experience },
          targetKeywords,
        }, {} as any);
      }

      if (params.skills) {
        await generateContentTool.execute({
          section: 'skills',
          data: params.skills,
          targetKeywords,
        }, {} as any);
      }

      // Step 4: Render the resume
      const rendered = await renderResumeTool.execute({
        data: params,
        template: params.template,
        format: params.outputFormat,
      }, {} as any);

      // Step 5: Calculate ATS score
      const atsResult = await calculateATSScoreTool.execute({
        resumeContent: rendered.content,
        targetKeywords,
      }, {} as any);

      const result: ResumeBuilderOutput = {
        resume: {
          content: rendered.content,
          format: rendered.format,
        },
        atsScore: atsResult.overallScore,
        atsDetails: atsResult.details,
        keywordMatch: targetKeywords.length > 0 ? atsResult.keywordMatch : undefined,
        suggestions: atsResult.suggestions,
        wordCount: rendered.wordCount,
        estimatedReadTime: rendered.estimatedReadTime,
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

function extractTechnicalKeywords(text: string): string[] {
  const techPatterns = [
    /\b(javascript|typescript|python|java|c\+\+|go|rust|ruby|php|swift|kotlin)\b/gi,
    /\b(react|angular|vue|node\.?js|express|django|flask|spring|rails)\b/gi,
    /\b(aws|azure|gcp|docker|kubernetes|terraform|jenkins|ci\/cd)\b/gi,
    /\b(sql|mysql|postgresql|mongodb|redis|elasticsearch)\b/gi,
    /\b(machine learning|ml|ai|deep learning|nlp|computer vision)\b/gi,
    /\b(agile|scrum|kanban|jira|git|github)\b/gi,
  ];

  const keywords: string[] = [];
  for (const pattern of techPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      keywords.push(...matches.map(m => m.toLowerCase()));
    }
  }

  return [...new Set(keywords)];
}

function extractSoftSkills(text: string): string[] {
  const softSkillPatterns = [
    /\b(communication|teamwork|leadership|problem.?solving)\b/gi,
    /\b(time management|organization|adaptability|creativity)\b/gi,
    /\b(critical thinking|collaboration|attention to detail)\b/gi,
  ];

  const skills: string[] = [];
  for (const pattern of softSkillPatterns) {
    const matches = text.match(pattern);
    if (matches) {
      skills.push(...matches.map(m => m.toLowerCase()));
    }
  }

  return [...new Set(skills)];
}

function extractRequirements(text: string): string[] {
  const requirements: string[] = [];

  // Look for experience requirements
  const expMatch = text.match(/(\d+)\+?\s*(years?|yrs?)\s*(of)?\s*(experience)?/gi);
  if (expMatch) {
    requirements.push(...expMatch);
  }

  // Look for degree requirements
  const degreeMatch = text.match(/\b(bachelor'?s?|master'?s?|phd|degree)\b/gi);
  if (degreeMatch) {
    requirements.push(...degreeMatch);
  }

  return requirements;
}

function detectExperienceLevel(text: string): string {
  if (text.includes('senior') || text.includes('lead') || text.includes('principal')) {
    return 'senior';
  }
  if (text.includes('junior') || text.includes('entry') || text.includes('graduate')) {
    return 'junior';
  }
  if (text.includes('mid') || text.includes('intermediate')) {
    return 'mid';
  }
  return 'mid';
}

function detectIndustry(text: string): string {
  const industries: Record<string, string[]> = {
    technology: ['software', 'tech', 'developer', 'engineer', 'programming'],
    finance: ['banking', 'finance', 'investment', 'trading', 'fintech'],
    healthcare: ['health', 'medical', 'hospital', 'clinical', 'pharmaceutical'],
    marketing: ['marketing', 'advertising', 'brand', 'digital marketing'],
  };

  for (const [industry, keywords] of Object.entries(industries)) {
    if (keywords.some(k => text.includes(k))) {
      return industry;
    }
  }

  return 'general';
}

function generateSummary(data: Record<string, unknown>, keywords?: string[]): string {
  const experience = data.experience as any[] || [];
  const skills = data.skills as any || {};

  let summary = 'Experienced professional';

  if (experience.length > 0) {
    const years = experience.length * 2; // Rough estimate
    const latestRole = experience[0]?.title || 'professional';
    summary = `Results-driven ${latestRole} with ${years}+ years of experience`;
  }

  if (skills.technical && skills.technical.length > 0) {
    summary += ` specializing in ${skills.technical.slice(0, 3).join(', ')}`;
  }

  if (keywords && keywords.length > 0) {
    summary += `. Proven expertise in ${keywords.slice(0, 2).join(' and ')}`;
  }

  summary += '. Committed to delivering high-quality results and driving business success.';

  return summary;
}

function generateExperienceSection(data: { experience: z.infer<typeof ExperienceSchema>[] }): string {
  const experiences = data.experience || [];

  return experiences.map(exp => {
    const lines = [
      `**${exp.title}** at ${exp.company}`,
      `${exp.startDate} - ${exp.current ? 'Present' : exp.endDate}`,
    ];

    if (exp.description) {
      lines.push(exp.description);
    }

    if (exp.achievements && exp.achievements.length > 0) {
      lines.push('Key Achievements:');
      exp.achievements.forEach(a => lines.push(`• ${a}`));
    }

    return lines.join('\n');
  }).join('\n\n');
}

function organizeSkills(skills: any, targetKeywords?: string[]): string {
  const sections: string[] = [];

  if (skills.technical && skills.technical.length > 0) {
    // Prioritize keywords that match target
    const sortedTech = targetKeywords
      ? [
          ...skills.technical.filter((s: string) =>
            targetKeywords.some(k => s.toLowerCase().includes(k.toLowerCase()))
          ),
          ...skills.technical.filter((s: string) =>
            !targetKeywords.some(k => s.toLowerCase().includes(k.toLowerCase()))
          ),
        ]
      : skills.technical;

    sections.push(`**Technical Skills:** ${sortedTech.join(', ')}`);
  }

  if (skills.soft && skills.soft.length > 0) {
    sections.push(`**Soft Skills:** ${skills.soft.join(', ')}`);
  }

  return sections.join('\n');
}

function calculateFormattingScore(content: string): number {
  let score = 100;

  // Check for common formatting issues
  if (content.includes('|') || content.includes('┃')) {
    score -= 10; // Tables might not parse well
  }

  if (content.match(/[^\x00-\x7F]/g)?.length || 0 > 10) {
    score -= 10; // Too many special characters
  }

  // Check for proper section headers
  const headers = content.match(/^#+\s+.+$/gm) || [];
  if (headers.length < 3) {
    score -= 15; // Missing section structure
  }

  return Math.max(0, score);
}

function calculateKeywordScore(content: string, keywords: string[]): number {
  if (keywords.length === 0) return 75; // Default if no target

  const lowerContent = content.toLowerCase();
  const matches = keywords.filter(k => lowerContent.includes(k.toLowerCase()));

  return Math.round((matches.length / keywords.length) * 100);
}

function calculateStructureScore(content: string): number {
  let score = 100;

  // Check for essential sections
  const sections = ['experience', 'education', 'skills'];
  for (const section of sections) {
    if (!content.toLowerCase().includes(section)) {
      score -= 20;
    }
  }

  // Check for bullet points (good for ATS)
  const bullets = content.match(/^[\•\-\*]\s+/gm) || [];
  if (bullets.length < 5) {
    score -= 10;
  }

  return Math.max(0, score);
}

function calculateReadabilityScore(content: string): number {
  // Simple readability check
  const words = content.split(/\s+/);
  const sentences = content.split(/[.!?]+/);

  const avgWordsPerSentence = words.length / sentences.length;

  if (avgWordsPerSentence > 25) return 70;
  if (avgWordsPerSentence > 20) return 80;
  if (avgWordsPerSentence > 15) return 90;
  return 95;
}

function generateATSSuggestions(
  formatting: number,
  keywords: number,
  structure: number,
  readability: number,
  targetKeywords: string[]
): ResumeBuilderOutput['suggestions'] {
  const suggestions: ResumeBuilderOutput['suggestions'] = [];

  if (formatting < 80) {
    suggestions.push({
      section: 'formatting',
      issue: 'Complex formatting detected',
      recommendation: 'Use simple formatting without tables or columns. Stick to standard fonts and clear section headers.',
      priority: 'high',
      impact: 'Improves ATS parsing accuracy',
    });
  }

  if (keywords < 60 && targetKeywords.length > 0) {
    suggestions.push({
      section: 'keywords',
      issue: 'Low keyword match rate',
      recommendation: `Include more relevant keywords from the job description: ${targetKeywords.slice(0, 5).join(', ')}`,
      priority: 'high',
      impact: 'Increases likelihood of passing ATS screening',
    });
  }

  if (structure < 80) {
    suggestions.push({
      section: 'structure',
      issue: 'Missing or unclear sections',
      recommendation: 'Ensure your resume has clear sections for Experience, Education, and Skills with proper headers.',
      priority: 'medium',
      impact: 'Helps ATS categorize your information correctly',
    });
  }

  if (readability < 85) {
    suggestions.push({
      section: 'readability',
      issue: 'Sentences may be too long',
      recommendation: 'Break down long sentences. Use bullet points for achievements. Keep descriptions concise.',
      priority: 'low',
      impact: 'Improves recruiter engagement',
    });
  }

  // Always add a positive suggestion
  if (suggestions.length === 0) {
    suggestions.push({
      section: 'general',
      issue: 'Good overall structure',
      recommendation: 'Consider adding quantifiable achievements (e.g., "Increased sales by 25%") to stand out.',
      priority: 'low',
      impact: 'Enhances overall impact',
    });
  }

  return suggestions;
}

function renderMarkdown(data: ResumeBuilderInput, template: string): string {
  const lines: string[] = [];

  // Header
  if (data.contact) {
    lines.push(`# ${data.contact.name}`);
    const contactInfo = [
      data.contact.email,
      data.contact.phone,
      data.contact.location,
    ].filter(Boolean).join(' | ');
    lines.push(contactInfo);

    const links = [
      data.contact.linkedin && `[LinkedIn](${data.contact.linkedin})`,
      data.contact.portfolio && `[Portfolio](${data.contact.portfolio})`,
      data.contact.github && `[GitHub](${data.contact.github})`,
    ].filter(Boolean).join(' | ');
    if (links) lines.push(links);
    lines.push('');
  }

  // Summary
  if (data.summary) {
    lines.push('## Summary');
    lines.push(data.summary);
    lines.push('');
  }

  // Experience
  if (data.experience && data.experience.length > 0) {
    lines.push('## Experience');
    for (const exp of data.experience) {
      lines.push(`### ${exp.title}`);
      lines.push(`**${exp.company}**${exp.location ? ` | ${exp.location}` : ''}`);
      lines.push(`${exp.startDate} - ${exp.current ? 'Present' : exp.endDate || 'Present'}`);
      lines.push('');

      if (exp.description) {
        lines.push(exp.description);
        lines.push('');
      }

      if (exp.achievements && exp.achievements.length > 0) {
        for (const achievement of exp.achievements) {
          lines.push(`• ${achievement}`);
        }
        lines.push('');
      }
    }
  }

  // Education
  if (data.education && data.education.length > 0) {
    lines.push('## Education');
    for (const edu of data.education) {
      lines.push(`### ${edu.degree}${edu.field ? ` in ${edu.field}` : ''}`);
      lines.push(`**${edu.institution}**${edu.location ? ` | ${edu.location}` : ''}`);
      lines.push(`Graduated: ${edu.graduationDate}`);
      if (edu.gpa) lines.push(`GPA: ${edu.gpa}`);
      lines.push('');
    }
  }

  // Skills
  if (data.skills) {
    lines.push('## Skills');
    if (data.skills.technical && data.skills.technical.length > 0) {
      lines.push(`**Technical:** ${data.skills.technical.join(', ')}`);
    }
    if (data.skills.soft && data.skills.soft.length > 0) {
      lines.push(`**Soft Skills:** ${data.skills.soft.join(', ')}`);
    }
    if (data.skills.languages && data.skills.languages.length > 0) {
      const langs = data.skills.languages.map(l => `${l.language} (${l.proficiency})`).join(', ');
      lines.push(`**Languages:** ${langs}`);
    }
    lines.push('');
  }

  // Projects
  if (data.projects && data.projects.length > 0) {
    lines.push('## Projects');
    for (const project of data.projects) {
      lines.push(`### ${project.name}`);
      lines.push(project.description);
      if (project.technologies && project.technologies.length > 0) {
        lines.push(`*Technologies: ${project.technologies.join(', ')}*`);
      }
      if (project.url) {
        lines.push(`[View Project](${project.url})`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function renderHTML(data: ResumeBuilderInput, template: string): string {
  // Convert markdown to basic HTML
  const markdown = renderMarkdown(data, template);

  let html = markdown
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^• (.+)$/gm, '<li>$1</li>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Resume - ${data.contact?.name || 'Resume'}</title>
  <style>
    body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 10px; }
    h2 { color: #444; border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-top: 25px; }
    h3 { color: #555; margin-bottom: 5px; }
    ul { padding-left: 20px; }
    li { margin-bottom: 5px; }
    a { color: #0066cc; }
  </style>
</head>
<body>
<p>${html}</p>
</body>
</html>`;
}

export default resumeBuilderAgent;
