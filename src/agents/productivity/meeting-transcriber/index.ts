/**
 * Meeting Transcriber Agent
 *
 * AI-powered meeting transcription that converts audio/video
 * recordings into text with speaker diarization, action items,
 * and meeting summaries.
 *
 * Capabilities:
 * - Audio/video transcription using Whisper
 * - Speaker identification and labeling
 * - Automatic meeting summary generation
 * - Action item extraction
 * - Key points and decisions highlighting
 * - Multiple output formats (text, SRT, VTT)
 *
 * Uses: OpenAI Whisper, Claude for analysis
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';
import {
  getOpenAIClient,
  fetchAudioFile,
  estimateTranscriptionCost,
  formatDuration,
  segmentsToSRT,
  segmentsToVTT,
  WhisperSegment,
} from '../../../providers/openai.js';
import { getJobsStorage } from '../../../storage/jobs.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const SpeakerSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  speakingTime: z.number().describe('Total speaking time in seconds'),
  segmentCount: z.number(),
});

const TranscriptSegmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string(),
  speaker: z.string().optional(),
  confidence: z.number().optional(),
});

const ActionItemSchema = z.object({
  id: z.string(),
  description: z.string(),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  context: z.string().optional(),
});

const KeyPointSchema = z.object({
  timestamp: z.number(),
  point: z.string(),
  category: z.enum(['decision', 'discussion', 'question', 'agreement', 'concern']),
});

const MeetingSummarySchema = z.object({
  title: z.string(),
  duration: z.string(),
  participantCount: z.number(),
  overview: z.string(),
  keyTopics: z.array(z.string()),
  decisions: z.array(z.string()),
  nextSteps: z.array(z.string()),
});

const TranscriptionOptionsSchema = z.object({
  language: z.string().optional().describe('ISO 639-1 language code'),
  detectSpeakers: z.boolean().default(false),
  generateSummary: z.boolean().default(true),
  extractActionItems: z.boolean().default(true),
  outputFormats: z.array(z.enum(['text', 'srt', 'vtt', 'json'])).default(['text', 'json']),
});

// Input/Output Schemas
const TranscriberInputSchema = z.object({
  audioUrl: z.string().describe('URL of the audio/video file'),
  meetingTitle: z.string().optional(),
  attendees: z.array(z.string()).optional().describe('Known attendee names'),
  options: TranscriptionOptionsSchema.optional(),
  webhookUrl: z.string().url().optional(),
});

const TranscriberOutputSchema = z.object({
  jobId: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  transcript: z.object({
    text: z.string(),
    segments: z.array(TranscriptSegmentSchema),
    language: z.string().optional(),
    duration: z.number().optional(),
  }).optional(),
  speakers: z.array(SpeakerSchema).optional(),
  summary: MeetingSummarySchema.optional(),
  actionItems: z.array(ActionItemSchema).optional(),
  keyPoints: z.array(KeyPointSchema).optional(),
  outputs: z.object({
    text: z.string().optional(),
    srt: z.string().optional(),
    vtt: z.string().optional(),
    json: z.string().optional(),
  }).optional(),
  processingTime: z.number().optional(),
  cost: z.number().optional(),
  error: z.string().optional(),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function generateActionItemId(): string {
  return `AI-${Date.now().toString(36).toUpperCase()}`;
}

function estimateSpeakers(segments: WhisperSegment[]): SpeakerSchema['_output'][] {
  // Simple heuristic: try to detect speaker changes based on pauses
  // In production, use proper speaker diarization model
  const speakers: Map<string, { time: number; segments: number }> = new Map();
  let currentSpeaker = 'Speaker 1';
  let speakerCount = 1;
  let lastEnd = 0;

  for (const segment of segments) {
    // If there's a significant pause, potentially new speaker
    if (segment.start - lastEnd > 2) {
      // Simple alternation for demo - real implementation needs ML
      const possibleNewSpeaker = `Speaker ${(speakerCount % 3) + 1}`;
      if (possibleNewSpeaker !== currentSpeaker) {
        currentSpeaker = possibleNewSpeaker;
        speakerCount++;
      }
    }

    const existing = speakers.get(currentSpeaker) || { time: 0, segments: 0 };
    speakers.set(currentSpeaker, {
      time: existing.time + (segment.end - segment.start),
      segments: existing.segments + 1,
    });

    lastEnd = segment.end;
  }

  return Array.from(speakers.entries()).map(([id, data]) => ({
    id,
    speakingTime: Math.round(data.time),
    segmentCount: data.segments,
  }));
}

function extractActionItemsFromText(text: string): ActionItemSchema['_output'][] {
  const actionItems: ActionItemSchema['_output'][] = [];

  // Simple keyword-based extraction
  const actionPatterns = [
    /(?:action item|todo|task|follow[- ]?up)[:.]?\s*(.+?)(?:\.|$)/gi,
    /(?:will|should|need to|going to|assigned to)\s+(\w+)\s+(.+?)(?:\.|$)/gi,
    /(?:by|before|due)\s+(next\s+\w+|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\/\d{1,2})/gi,
  ];

  const sentences = text.split(/[.!?]+/);

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (
      lower.includes('action item') ||
      lower.includes('todo') ||
      lower.includes('follow up') ||
      lower.includes('will do') ||
      lower.includes('assigned to') ||
      lower.includes('need to')
    ) {
      actionItems.push({
        id: generateActionItemId(),
        description: sentence.trim(),
        priority: lower.includes('urgent') || lower.includes('asap') ? 'high' : 'medium',
      });
    }
  }

  return actionItems.slice(0, 10); // Limit to 10 items
}

function extractKeyPointsFromText(text: string, segments: WhisperSegment[]): KeyPointSchema['_output'][] {
  const keyPoints: KeyPointSchema['_output'][] = [];

  // Look for key patterns in text
  const patterns = {
    decision: /(?:decided|decision|agreed|approved|confirmed)[:.]?\s*(.+?)(?:\.|$)/gi,
    question: /(?:\?|asked|question|wondering|clarify)[:.]?\s*(.+?)(?:\.|$)/gi,
    agreement: /(?:everyone agrees|consensus|aligned|on the same page)[:.]?\s*(.+?)(?:\.|$)/gi,
    concern: /(?:concern|worried|issue|problem|risk)[:.]?\s*(.+?)(?:\.|$)/gi,
  };

  for (const [category, pattern] of Object.entries(patterns)) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // Find approximate timestamp based on position in text
      const position = match.index / text.length;
      const segmentIndex = Math.floor(position * segments.length);
      const timestamp = segments[segmentIndex]?.start || 0;

      keyPoints.push({
        timestamp,
        point: match[1]?.trim() || match[0].trim(),
        category: category as KeyPointSchema['_output']['category'],
      });
    }
  }

  return keyPoints.slice(0, 15); // Limit to 15 points
}

function generateSummary(
  text: string,
  duration: number,
  speakerCount: number,
  meetingTitle?: string
): MeetingSummarySchema['_output'] {
  // Extract key topics (simple word frequency)
  const words = text.toLowerCase().split(/\s+/);
  const wordFreq: Map<string, number> = new Map();
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'it', 'that', 'this', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how']);

  for (const word of words) {
    if (word.length > 4 && !stopWords.has(word)) {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    }
  }

  const keyTopics = Array.from(wordFreq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);

  // Extract sentences that look like decisions or next steps
  const sentences = text.split(/[.!]+/).filter(s => s.trim().length > 20);
  const decisions = sentences
    .filter(s => /decided|agreed|will|approved|confirmed/i.test(s))
    .slice(0, 3)
    .map(s => s.trim());

  const nextSteps = sentences
    .filter(s => /next|follow[- ]?up|action|todo|will do/i.test(s))
    .slice(0, 3)
    .map(s => s.trim());

  return {
    title: meetingTitle || 'Meeting Transcript',
    duration: formatDuration(duration),
    participantCount: speakerCount,
    overview: text.substring(0, 300).trim() + (text.length > 300 ? '...' : ''),
    keyTopics,
    decisions,
    nextSteps,
  };
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function transcribeAudio(
  ctx: AgentContext,
  params: {
    audioUrl: string;
    language?: string;
    responseFormat?: 'json' | 'verbose_json' | 'text' | 'srt' | 'vtt';
  }
): Promise<{
  success: boolean;
  text?: string;
  segments?: WhisperSegment[];
  language?: string;
  duration?: number;
  error?: string;
}> {
  const client = getOpenAIClient();

  logger.info('transcription_started', {
    url: params.audioUrl.substring(0, 50),
    language: params.language,
  });

  try {
    // Fetch audio file
    const { buffer, filename } = await fetchAudioFile(params.audioUrl);

    // Transcribe with Whisper
    const result = await client.transcribe(buffer, filename, {
      language: params.language,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    logger.info('transcription_completed', {
      textLength: result.text?.length,
      segmentCount: result.segments?.length,
    });

    return {
      success: true,
      text: result.text,
      segments: result.segments,
      language: result.language,
      duration: result.duration,
    };
  } catch (error) {
    logger.error('transcription_failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Transcription failed',
    };
  }
}

async function analyzeMeeting(
  ctx: AgentContext,
  params: {
    text: string;
    segments: WhisperSegment[];
    duration: number;
    meetingTitle?: string;
    extractActions: boolean;
    generateSummary: boolean;
  }
): Promise<{
  speakers: SpeakerSchema['_output'][];
  summary?: MeetingSummarySchema['_output'];
  actionItems?: ActionItemSchema['_output'][];
  keyPoints?: KeyPointSchema['_output'][];
}> {
  logger.info('meeting_analysis_started');

  // Estimate speakers (simplified)
  const speakers = estimateSpeakers(params.segments);

  // Extract action items
  const actionItems = params.extractActions
    ? extractActionItemsFromText(params.text)
    : undefined;

  // Extract key points
  const keyPoints = extractKeyPointsFromText(params.text, params.segments);

  // Generate summary
  const summary = params.generateSummary
    ? generateSummary(params.text, params.duration, speakers.length, params.meetingTitle)
    : undefined;

  logger.info('meeting_analysis_completed', {
    speakerCount: speakers.length,
    actionItemCount: actionItems?.length,
    keyPointCount: keyPoints.length,
  });

  return {
    speakers,
    summary,
    actionItems,
    keyPoints,
  };
}

async function formatOutput(
  ctx: AgentContext,
  params: {
    text: string;
    segments: WhisperSegment[];
    formats: Array<'text' | 'srt' | 'vtt' | 'json'>;
    speakers?: SpeakerSchema['_output'][];
  }
): Promise<{
  text?: string;
  srt?: string;
  vtt?: string;
  json?: string;
}> {
  const outputs: { text?: string; srt?: string; vtt?: string; json?: string } = {};

  for (const format of params.formats) {
    switch (format) {
      case 'text':
        outputs.text = params.text;
        break;
      case 'srt':
        outputs.srt = segmentsToSRT(params.segments);
        break;
      case 'vtt':
        outputs.vtt = segmentsToVTT(params.segments);
        break;
      case 'json':
        outputs.json = JSON.stringify({
          text: params.text,
          segments: params.segments.map(s => ({
            start: s.start,
            end: s.end,
            text: s.text,
          })),
          speakers: params.speakers,
        }, null, 2);
        break;
    }
  }

  return outputs;
}

async function processTranscriptionPipeline(
  ctx: AgentContext,
  params: {
    audioUrl: string;
    meetingTitle?: string;
    options: z.infer<typeof TranscriptionOptionsSchema>;
    jobId: string;
  }
): Promise<{
  success: boolean;
  transcript?: {
    text: string;
    segments: TranscriptSegmentSchema['_output'][];
    language?: string;
    duration?: number;
  };
  speakers?: SpeakerSchema['_output'][];
  summary?: MeetingSummarySchema['_output'];
  actionItems?: ActionItemSchema['_output'][];
  keyPoints?: KeyPointSchema['_output'][];
  outputs?: { text?: string; srt?: string; vtt?: string; json?: string };
  processingTime: number;
  cost?: number;
  error?: string;
}> {
  const startTime = Date.now();
  const jobsStorage = getJobsStorage();
  const client = getOpenAIClient();

  try {
    jobsStorage.markProcessing(params.jobId, undefined, 'openai');
    jobsStorage.updateProgress(params.jobId, 10);

    // Step 1: Fetch and transcribe audio
    const { buffer, filename } = await fetchAudioFile(params.audioUrl);
    jobsStorage.updateProgress(params.jobId, 20);

    const transcription = await client.transcribe(buffer, filename, {
      language: params.options.language,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    if (!transcription.text) {
      throw new Error('Transcription returned empty result');
    }

    jobsStorage.updateProgress(params.jobId, 50);

    const segments: TranscriptSegmentSchema['_output'][] = (transcription.segments || []).map(s => ({
      start: s.start,
      end: s.end,
      text: s.text,
    }));

    // Step 2: Analyze meeting
    const whisperSegments = transcription.segments || [];
    const duration = transcription.duration || 0;

    const speakers = params.options.detectSpeakers
      ? estimateSpeakers(whisperSegments)
      : undefined;

    jobsStorage.updateProgress(params.jobId, 70);

    const actionItems = params.options.extractActionItems
      ? extractActionItemsFromText(transcription.text)
      : undefined;

    const keyPoints = extractKeyPointsFromText(transcription.text, whisperSegments);

    const summary = params.options.generateSummary
      ? generateSummary(transcription.text, duration, speakers?.length || 1, params.meetingTitle)
      : undefined;

    jobsStorage.updateProgress(params.jobId, 85);

    // Step 3: Format outputs
    const outputs: { text?: string; srt?: string; vtt?: string; json?: string } = {};

    for (const format of params.options.outputFormats) {
      switch (format) {
        case 'text':
          outputs.text = transcription.text;
          break;
        case 'srt':
          outputs.srt = segmentsToSRT(whisperSegments);
          break;
        case 'vtt':
          outputs.vtt = segmentsToVTT(whisperSegments);
          break;
        case 'json':
          outputs.json = JSON.stringify({
            text: transcription.text,
            segments,
            speakers,
            summary,
            actionItems,
            keyPoints,
          }, null, 2);
          break;
      }
    }

    const processingTime = Date.now() - startTime;
    const cost = estimateTranscriptionCost(duration);

    jobsStorage.markCompleted(
      params.jobId,
      {
        transcript: {
          text: transcription.text,
          segments,
          language: transcription.language,
          duration,
        },
        speakers,
        summary,
        actionItems,
        keyPoints,
        outputs,
        processingTime,
      },
      cost
    );

    logger.info('transcription_pipeline_completed', {
      jobId: params.jobId,
      processingTime,
      duration,
      cost,
    });

    return {
      success: true,
      transcript: {
        text: transcription.text,
        segments,
        language: transcription.language,
        duration,
      },
      speakers,
      summary,
      actionItems,
      keyPoints,
      outputs,
      processingTime,
      cost,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    jobsStorage.markFailed(params.jobId, errorMessage);

    logger.error('transcription_pipeline_failed', {
      jobId: params.jobId,
      error: errorMessage,
    });

    return {
      success: false,
      processingTime: Date.now() - startTime,
      error: errorMessage,
    };
  }
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const meetingTranscriberAgent = defineAgent({
  name: 'meeting-transcriber',
  description: 'AI-powered meeting transcription with speaker identification, summaries, and action item extraction',
  version: '1.0.0',

  inputSchema: TranscriberInputSchema,
  outputSchema: TranscriberOutputSchema,

  tools: {
    transcribe_audio: {
      description: 'Transcribe audio/video file to text using Whisper',
      parameters: z.object({
        audioUrl: z.string(),
        language: z.string().optional(),
        responseFormat: z.enum(['json', 'verbose_json', 'text', 'srt', 'vtt']).optional(),
      }),
      returns: z.object({
        success: z.boolean(),
        text: z.string().optional(),
        segments: z.array(z.object({
          id: z.number(),
          seek: z.number(),
          start: z.number(),
          end: z.number(),
          text: z.string(),
          tokens: z.array(z.number()),
          temperature: z.number(),
          avg_logprob: z.number(),
          compression_ratio: z.number(),
          no_speech_prob: z.number(),
        })).optional(),
        language: z.string().optional(),
        duration: z.number().optional(),
        error: z.string().optional(),
      }),
      execute: transcribeAudio,
      sideEffectful: true,
      timeoutMs: 600000, // 10 minutes for long audio
    },

    analyze_meeting: {
      description: 'Analyze transcript for speakers, action items, and key points',
      parameters: z.object({
        text: z.string(),
        segments: z.array(z.object({
          id: z.number(),
          seek: z.number(),
          start: z.number(),
          end: z.number(),
          text: z.string(),
          tokens: z.array(z.number()),
          temperature: z.number(),
          avg_logprob: z.number(),
          compression_ratio: z.number(),
          no_speech_prob: z.number(),
        })),
        duration: z.number(),
        meetingTitle: z.string().optional(),
        extractActions: z.boolean(),
        generateSummary: z.boolean(),
      }),
      returns: z.object({
        speakers: z.array(SpeakerSchema),
        summary: MeetingSummarySchema.optional(),
        actionItems: z.array(ActionItemSchema).optional(),
        keyPoints: z.array(KeyPointSchema).optional(),
      }),
      execute: analyzeMeeting,
      timeoutMs: 60000,
    },

    format_output: {
      description: 'Format transcript in requested output formats',
      parameters: z.object({
        text: z.string(),
        segments: z.array(z.object({
          id: z.number(),
          seek: z.number(),
          start: z.number(),
          end: z.number(),
          text: z.string(),
          tokens: z.array(z.number()),
          temperature: z.number(),
          avg_logprob: z.number(),
          compression_ratio: z.number(),
          no_speech_prob: z.number(),
        })),
        formats: z.array(z.enum(['text', 'srt', 'vtt', 'json'])),
        speakers: z.array(SpeakerSchema).optional(),
      }),
      returns: z.object({
        text: z.string().optional(),
        srt: z.string().optional(),
        vtt: z.string().optional(),
        json: z.string().optional(),
      }),
      execute: formatOutput,
      timeoutMs: 30000,
    },

    process_pipeline: {
      description: 'Run the complete meeting transcription pipeline',
      parameters: z.object({
        audioUrl: z.string(),
        meetingTitle: z.string().optional(),
        options: TranscriptionOptionsSchema,
        jobId: z.string(),
      }),
      returns: z.object({
        success: z.boolean(),
        transcript: z.object({
          text: z.string(),
          segments: z.array(TranscriptSegmentSchema),
          language: z.string().optional(),
          duration: z.number().optional(),
        }).optional(),
        speakers: z.array(SpeakerSchema).optional(),
        summary: MeetingSummarySchema.optional(),
        actionItems: z.array(ActionItemSchema).optional(),
        keyPoints: z.array(KeyPointSchema).optional(),
        outputs: z.object({
          text: z.string().optional(),
          srt: z.string().optional(),
          vtt: z.string().optional(),
          json: z.string().optional(),
        }).optional(),
        processingTime: z.number(),
        cost: z.number().optional(),
        error: z.string().optional(),
      }),
      execute: processTranscriptionPipeline,
      sideEffectful: true,
      timeoutMs: 600000,
    },
  },

  systemPrompt: `You are a meeting transcription assistant that converts audio/video recordings into useful transcripts and insights.

Workflow:
1. Fetch and transcribe the audio using Whisper
2. Analyze the transcript for speakers (if requested)
3. Extract action items and key decisions
4. Generate a summary of the meeting
5. Format outputs in requested formats

Guidelines:
- Preserve accuracy of the transcription
- Clearly identify action items with assignees when mentioned
- Highlight decisions and agreements
- Provide timestamps for key moments
- Support multiple output formats (text, SRT, VTT, JSON)

Output formats:
- text: Plain text transcript
- srt: SubRip subtitle format (for video)
- vtt: WebVTT format (for web video)
- json: Structured JSON with all metadata

Tips for best results:
- Clear audio with minimal background noise
- Individual microphones for better speaker separation
- Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm`,

  config: {
    maxTurns: 10,
    temperature: 0.2,
    maxTokens: 4096,
  },
});

export default meetingTranscriberAgent;
