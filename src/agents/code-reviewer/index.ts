/**
 * Code Reviewer Agent
 *
 * Example agent that reviews code for bugs, security issues, and best practices.
 * Demonstrates:
 * - Proper AgentCard definition
 * - Effort-appropriate thinking
 * - Structured output
 */

import type { Agent, AgentCard, AgentInput, AgentOutput, ExecutionContext } from '../../core/types.js';

export interface CodeReviewInput {
  code: string;
  language: 'typescript' | 'python' | 'go' | 'rust' | 'javascript' | 'java';
  focusAreas?: ('security' | 'performance' | 'best_practices' | 'bugs' | 'readability')[];
  context?: string;
}

export interface CodeReviewIssue {
  severity: 'error' | 'warning' | 'info';
  category: 'security' | 'performance' | 'best_practices' | 'bug' | 'readability';
  line?: number;
  message: string;
  suggestion?: string;
}

export interface CodeReviewOutput {
  issues: CodeReviewIssue[];
  summary: string;
  score: number;
  recommendations: string[];
}

export class CodeReviewerAgent implements Agent {
  card: AgentCard = {
    id: 'code-reviewer',
    name: 'Code Reviewer',
    description: `Reviews code for bugs, security vulnerabilities, performance issues, and best practices.
Use when you need:
- Code review before merging
- Security audit of code
- Performance analysis
- Best practices validation
Supports: TypeScript, Python, Go, Rust, JavaScript, Java`,
    version: '1.0.0',
    capabilities: [
      'code-review',
      'security-audit',
      'performance-analysis',
      'best-practices',
      'bug-detection',
    ],
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'The code to review',
        },
        language: {
          type: 'string',
          enum: ['typescript', 'python', 'go', 'rust', 'javascript', 'java'],
          description: 'Programming language of the code',
        },
        focusAreas: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['security', 'performance', 'best_practices', 'bugs', 'readability'],
          },
          description: 'Specific areas to focus the review on',
        },
        context: {
          type: 'string',
          description: 'Additional context about the code (e.g., what it does, where it runs)',
        },
      },
      required: ['code', 'language'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        issues: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              severity: { type: 'string', enum: ['error', 'warning', 'info'] },
              category: { type: 'string' },
              line: { type: 'number' },
              message: { type: 'string' },
              suggestion: { type: 'string' },
            },
          },
        },
        summary: { type: 'string' },
        score: { type: 'number', minimum: 0, maximum: 100 },
        recommendations: { type: 'array', items: { type: 'string' } },
      },
    },
    defaultModel: 'claude-sonnet-4-5-20250514',
    defaultEffortLevel: 'medium',
    sideEffects: false,
    estimatedCostTier: 'medium',
  };

  async execute(input: AgentInput, context: ExecutionContext): Promise<AgentOutput> {
    // This is a placeholder - actual execution happens in the executor
    // The agent provides the card and can have custom logic if needed

    const params = input.parameters as unknown as CodeReviewInput;

    // Validate input
    if (!params.code || params.code.trim().length === 0) {
      return {
        status: 'failed',
        result: { error: 'Code is required' },
        usage: context.consumed,
      };
    }

    if (!params.language) {
      return {
        status: 'failed',
        result: { error: 'Language is required' },
        usage: context.consumed,
      };
    }

    // The actual LLM call happens in the executor
    // This method can be used for pre/post processing

    return {
      status: 'success',
      result: null, // Will be filled by executor
      usage: context.consumed,
    };
  }

  /**
   * Build the review prompt (used by executor)
   */
  buildPrompt(input: CodeReviewInput): string {
    const focusAreasText = input.focusAreas?.length
      ? `Focus especially on: ${input.focusAreas.join(', ')}`
      : 'Review all aspects';

    return `Review the following ${input.language} code thoroughly.

## Code to Review
\`\`\`${input.language}
${input.code}
\`\`\`

${input.context ? `## Context\n${input.context}\n` : ''}

## Review Instructions
${focusAreasText}

For each issue found, provide:
1. Severity (error/warning/info)
2. Category (security/performance/best_practices/bug/readability)
3. Line number (if applicable)
4. Clear description of the issue
5. Suggested fix

After listing issues, provide:
- A brief summary of the code quality
- An overall score (0-100)
- Top 3 recommendations for improvement

## Expected Output Format
\`\`\`json
{
  "issues": [
    {
      "severity": "error|warning|info",
      "category": "security|performance|best_practices|bug|readability",
      "line": 10,
      "message": "Description of the issue",
      "suggestion": "How to fix it"
    }
  ],
  "summary": "Brief summary of code quality",
  "score": 85,
  "recommendations": [
    "First recommendation",
    "Second recommendation",
    "Third recommendation"
  ]
}
\`\`\``;
  }
}

// Export singleton instance
export const codeReviewerAgent = new CodeReviewerAgent();
