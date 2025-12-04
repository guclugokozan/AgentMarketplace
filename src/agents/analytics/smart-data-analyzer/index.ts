/**
 * Smart Data Analyzer Agent
 *
 * AI-powered data analysis agent that processes CSV/Excel files,
 * identifies patterns, generates insights, and provides natural
 * language explanations of data.
 *
 * Capabilities:
 * - Statistical analysis (mean, median, std dev, correlations)
 * - Pattern detection and anomaly identification
 * - Trend analysis and forecasting
 * - Natural language data queries
 * - Data quality assessment
 */

import { defineAgent, AgentContext, z } from '@anthropic-ai/agent-sdk';
import { createLogger } from '../../../logging/logger.js';

const logger = createLogger({ level: 'info' });

// =============================================================================
// SCHEMAS
// =============================================================================

const DataColumnSchema = z.object({
  name: z.string(),
  type: z.enum(['number', 'string', 'date', 'boolean', 'mixed']),
  nullCount: z.number(),
  uniqueCount: z.number(),
  sampleValues: z.array(z.unknown()).max(5),
});

const StatisticsSchema = z.object({
  count: z.number(),
  mean: z.number().optional(),
  median: z.number().optional(),
  stdDev: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  percentile25: z.number().optional(),
  percentile75: z.number().optional(),
});

const CorrelationSchema = z.object({
  column1: z.string(),
  column2: z.string(),
  coefficient: z.number(),
  strength: z.enum(['strong_positive', 'moderate_positive', 'weak_positive', 'none', 'weak_negative', 'moderate_negative', 'strong_negative']),
});

const AnomalySchema = z.object({
  rowIndex: z.number(),
  column: z.string(),
  value: z.unknown(),
  reason: z.string(),
  severity: z.enum(['low', 'medium', 'high']),
});

const InsightSchema = z.object({
  type: z.enum(['trend', 'pattern', 'anomaly', 'correlation', 'distribution', 'quality']),
  title: z.string(),
  description: z.string(),
  confidence: z.number().min(0).max(1),
  affectedColumns: z.array(z.string()),
  recommendation: z.string().optional(),
});

const DataQualitySchema = z.object({
  overallScore: z.number().min(0).max(100),
  completeness: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  accuracy: z.number().min(0).max(100),
  issues: z.array(z.object({
    type: z.string(),
    column: z.string().optional(),
    description: z.string(),
    rowsAffected: z.number(),
  })),
});

// Input/Output Schemas
const AnalyzeDataInputSchema = z.object({
  data: z.string().describe('CSV data or JSON array as string'),
  format: z.enum(['csv', 'json']).default('csv'),
  hasHeaders: z.boolean().default(true),
  analysisDepth: z.enum(['quick', 'standard', 'deep']).default('standard'),
});

const AnalyzeDataOutputSchema = z.object({
  summary: z.object({
    rowCount: z.number(),
    columnCount: z.number(),
    columns: z.array(DataColumnSchema),
  }),
  statistics: z.record(z.string(), StatisticsSchema),
  correlations: z.array(CorrelationSchema),
  anomalies: z.array(AnomalySchema),
  insights: z.array(InsightSchema),
  dataQuality: DataQualitySchema,
  naturalLanguageSummary: z.string(),
});

const QueryDataInputSchema = z.object({
  data: z.string().describe('CSV data or JSON array as string'),
  question: z.string().describe('Natural language question about the data'),
  format: z.enum(['csv', 'json']).default('csv'),
});

const QueryDataOutputSchema = z.object({
  answer: z.string(),
  methodology: z.string(),
  confidence: z.number().min(0).max(1),
  supportingData: z.array(z.record(z.string(), z.unknown())).optional(),
  visualizationSuggestion: z.string().optional(),
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function parseCSV(csvString: string, hasHeaders: boolean): { headers: string[]; rows: string[][] } {
  const lines = csvString.trim().split('\n');
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  if (hasHeaders) {
    const headers = parseRow(lines[0]);
    const rows = lines.slice(1).map(parseRow);
    return { headers, rows };
  } else {
    const rows = lines.map(parseRow);
    const headers = rows[0]?.map((_, i) => `Column_${i + 1}`) || [];
    return { headers, rows };
  }
}

function inferColumnType(values: unknown[]): 'number' | 'string' | 'date' | 'boolean' | 'mixed' {
  const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
  if (nonNullValues.length === 0) return 'string';

  let numberCount = 0;
  let dateCount = 0;
  let booleanCount = 0;

  for (const value of nonNullValues) {
    const strValue = String(value).toLowerCase();

    if (strValue === 'true' || strValue === 'false') {
      booleanCount++;
    } else if (!isNaN(Number(value)) && strValue !== '') {
      numberCount++;
    } else if (!isNaN(Date.parse(strValue))) {
      dateCount++;
    }
  }

  const total = nonNullValues.length;
  const threshold = 0.8;

  if (booleanCount / total >= threshold) return 'boolean';
  if (numberCount / total >= threshold) return 'number';
  if (dateCount / total >= threshold) return 'date';
  if (numberCount + dateCount + booleanCount < total * 0.5) return 'string';

  return 'mixed';
}

function calculateStatistics(values: number[]): StatisticsSchema['_output'] {
  const validValues = values.filter(v => !isNaN(v) && isFinite(v));
  if (validValues.length === 0) {
    return { count: 0 };
  }

  const sorted = [...validValues].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((a, b) => a + b, 0);
  const mean = sum / count;

  const squaredDiffs = sorted.map(v => Math.pow(v - mean, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / count;
  const stdDev = Math.sqrt(variance);

  const median = count % 2 === 0
    ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
    : sorted[Math.floor(count / 2)];

  const percentile25 = sorted[Math.floor(count * 0.25)];
  const percentile75 = sorted[Math.floor(count * 0.75)];

  return {
    count,
    mean: Math.round(mean * 1000) / 1000,
    median: Math.round(median * 1000) / 1000,
    stdDev: Math.round(stdDev * 1000) / 1000,
    min: sorted[0],
    max: sorted[count - 1],
    percentile25: Math.round(percentile25 * 1000) / 1000,
    percentile75: Math.round(percentile75 * 1000) / 1000,
  };
}

function calculateCorrelation(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  if (n < 3) return 0;

  const validPairs: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    if (!isNaN(x[i]) && !isNaN(y[i]) && isFinite(x[i]) && isFinite(y[i])) {
      validPairs.push({ x: x[i], y: y[i] });
    }
  }

  if (validPairs.length < 3) return 0;

  const meanX = validPairs.reduce((s, p) => s + p.x, 0) / validPairs.length;
  const meanY = validPairs.reduce((s, p) => s + p.y, 0) / validPairs.length;

  let numerator = 0;
  let denomX = 0;
  let denomY = 0;

  for (const pair of validPairs) {
    const dx = pair.x - meanX;
    const dy = pair.y - meanY;
    numerator += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denominator = Math.sqrt(denomX * denomY);
  if (denominator === 0) return 0;

  return Math.round((numerator / denominator) * 1000) / 1000;
}

function getCorrelationStrength(coefficient: number): CorrelationSchema['_output']['strength'] {
  const abs = Math.abs(coefficient);
  const positive = coefficient >= 0;

  if (abs >= 0.7) return positive ? 'strong_positive' : 'strong_negative';
  if (abs >= 0.4) return positive ? 'moderate_positive' : 'moderate_negative';
  if (abs >= 0.2) return positive ? 'weak_positive' : 'weak_negative';
  return 'none';
}

function detectAnomalies(
  columnName: string,
  values: unknown[],
  columnType: string
): AnomalySchema['_output'][] {
  const anomalies: AnomalySchema['_output'][] = [];

  if (columnType === 'number') {
    const numValues = values.map((v, i) => ({ value: Number(v), index: i }))
      .filter(v => !isNaN(v.value) && isFinite(v.value));

    if (numValues.length < 10) return anomalies;

    const sorted = numValues.map(v => v.value).sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)];
    const q3 = sorted[Math.floor(sorted.length * 0.75)];
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    for (const item of numValues) {
      if (item.value < lowerBound || item.value > upperBound) {
        const severity = Math.abs(item.value - (item.value < lowerBound ? lowerBound : upperBound)) / iqr > 3
          ? 'high' : Math.abs(item.value - (item.value < lowerBound ? lowerBound : upperBound)) / iqr > 1.5
            ? 'medium' : 'low';

        anomalies.push({
          rowIndex: item.index,
          column: columnName,
          value: item.value,
          reason: `Value ${item.value} is outside the expected range [${lowerBound.toFixed(2)}, ${upperBound.toFixed(2)}]`,
          severity,
        });
      }
    }
  }

  return anomalies.slice(0, 20); // Limit to top 20 anomalies
}

// =============================================================================
// TOOL IMPLEMENTATIONS
// =============================================================================

async function parseAndProfileData(
  ctx: AgentContext,
  params: { data: string; format: 'csv' | 'json'; hasHeaders: boolean }
): Promise<{
  headers: string[];
  rows: unknown[][];
  columns: DataColumnSchema['_output'][];
}> {
  let headers: string[];
  let rows: unknown[][];

  if (params.format === 'csv') {
    const parsed = parseCSV(params.data, params.hasHeaders);
    headers = parsed.headers;
    rows = parsed.rows;
  } else {
    const jsonData = JSON.parse(params.data);
    if (!Array.isArray(jsonData) || jsonData.length === 0) {
      throw new Error('JSON data must be a non-empty array of objects');
    }
    headers = Object.keys(jsonData[0]);
    rows = jsonData.map(obj => headers.map(h => obj[h]));
  }

  const columns: DataColumnSchema['_output'][] = headers.map((name, colIndex) => {
    const values = rows.map(row => row[colIndex]);
    const type = inferColumnType(values);
    const nullCount = values.filter(v => v === null || v === undefined || v === '').length;
    const uniqueValues = new Set(values.map(v => String(v)));

    return {
      name,
      type,
      nullCount,
      uniqueCount: uniqueValues.size,
      sampleValues: values.slice(0, 5),
    };
  });

  logger.info('data_profiled', {
    rowCount: rows.length,
    columnCount: columns.length,
  });

  return { headers, rows, columns };
}

async function computeStatistics(
  ctx: AgentContext,
  params: { headers: string[]; rows: unknown[][]; columns: DataColumnSchema['_output'][] }
): Promise<Record<string, StatisticsSchema['_output']>> {
  const statistics: Record<string, StatisticsSchema['_output']> = {};

  for (let i = 0; i < params.columns.length; i++) {
    const column = params.columns[i];
    if (column.type === 'number') {
      const values = params.rows.map(row => Number(row[i]));
      statistics[column.name] = calculateStatistics(values);
    }
  }

  return statistics;
}

async function findCorrelations(
  ctx: AgentContext,
  params: { headers: string[]; rows: unknown[][]; columns: DataColumnSchema['_output'][] }
): Promise<CorrelationSchema['_output'][]> {
  const numericColumns = params.columns
    .map((col, idx) => ({ ...col, index: idx }))
    .filter(col => col.type === 'number');

  const correlations: CorrelationSchema['_output'][] = [];

  for (let i = 0; i < numericColumns.length; i++) {
    for (let j = i + 1; j < numericColumns.length; j++) {
      const col1 = numericColumns[i];
      const col2 = numericColumns[j];

      const values1 = params.rows.map(row => Number(row[col1.index]));
      const values2 = params.rows.map(row => Number(row[col2.index]));

      const coefficient = calculateCorrelation(values1, values2);
      const strength = getCorrelationStrength(coefficient);

      if (strength !== 'none') {
        correlations.push({
          column1: col1.name,
          column2: col2.name,
          coefficient,
          strength,
        });
      }
    }
  }

  // Sort by absolute correlation strength
  return correlations.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));
}

async function detectAllAnomalies(
  ctx: AgentContext,
  params: { headers: string[]; rows: unknown[][]; columns: DataColumnSchema['_output'][] }
): Promise<AnomalySchema['_output'][]> {
  const allAnomalies: AnomalySchema['_output'][] = [];

  for (let i = 0; i < params.columns.length; i++) {
    const column = params.columns[i];
    const values = params.rows.map(row => row[i]);
    const columnAnomalies = detectAnomalies(column.name, values, column.type);
    allAnomalies.push(...columnAnomalies);
  }

  return allAnomalies.sort((a, b) => {
    const severityOrder = { high: 0, medium: 1, low: 2 };
    return severityOrder[a.severity] - severityOrder[b.severity];
  });
}

async function assessDataQuality(
  ctx: AgentContext,
  params: {
    rowCount: number;
    columns: DataColumnSchema['_output'][];
    anomalies: AnomalySchema['_output'][];
  }
): Promise<DataQualitySchema['_output']> {
  const issues: DataQualitySchema['_output']['issues'] = [];

  // Completeness: based on null values
  let totalCells = params.rowCount * params.columns.length;
  let nullCells = params.columns.reduce((sum, col) => sum + col.nullCount, 0);
  const completeness = Math.round((1 - nullCells / totalCells) * 100);

  for (const col of params.columns) {
    if (col.nullCount > params.rowCount * 0.1) {
      issues.push({
        type: 'missing_values',
        column: col.name,
        description: `Column has ${col.nullCount} missing values (${Math.round(col.nullCount / params.rowCount * 100)}%)`,
        rowsAffected: col.nullCount,
      });
    }
  }

  // Consistency: based on mixed types
  const mixedTypeColumns = params.columns.filter(col => col.type === 'mixed');
  const consistency = Math.round((1 - mixedTypeColumns.length / params.columns.length) * 100);

  for (const col of mixedTypeColumns) {
    issues.push({
      type: 'inconsistent_type',
      column: col.name,
      description: `Column contains mixed data types`,
      rowsAffected: params.rowCount,
    });
  }

  // Accuracy: based on anomalies
  const anomalyRate = params.anomalies.length / params.rowCount;
  const accuracy = Math.round((1 - Math.min(anomalyRate, 0.5)) * 100);

  if (params.anomalies.length > 0) {
    issues.push({
      type: 'anomalies_detected',
      description: `Found ${params.anomalies.length} anomalous values`,
      rowsAffected: params.anomalies.length,
    });
  }

  const overallScore = Math.round((completeness + consistency + accuracy) / 3);

  return {
    overallScore,
    completeness,
    consistency,
    accuracy,
    issues,
  };
}

async function generateInsights(
  ctx: AgentContext,
  params: {
    columns: DataColumnSchema['_output'][];
    statistics: Record<string, StatisticsSchema['_output']>;
    correlations: CorrelationSchema['_output'][];
    anomalies: AnomalySchema['_output'][];
    dataQuality: DataQualitySchema['_output'];
  }
): Promise<InsightSchema['_output'][]> {
  const insights: InsightSchema['_output'][] = [];

  // Distribution insights
  for (const [colName, stats] of Object.entries(params.statistics)) {
    if (stats.stdDev !== undefined && stats.mean !== undefined) {
      const cv = stats.stdDev / Math.abs(stats.mean);
      if (cv > 1) {
        insights.push({
          type: 'distribution',
          title: `High variability in ${colName}`,
          description: `The coefficient of variation (${(cv * 100).toFixed(1)}%) indicates high variability in this column.`,
          confidence: 0.9,
          affectedColumns: [colName],
          recommendation: 'Consider investigating the causes of this variability or segmenting the data.',
        });
      }
    }
  }

  // Correlation insights
  for (const corr of params.correlations.slice(0, 3)) {
    if (corr.strength.includes('strong')) {
      insights.push({
        type: 'correlation',
        title: `Strong ${corr.coefficient > 0 ? 'positive' : 'negative'} correlation found`,
        description: `${corr.column1} and ${corr.column2} have a correlation of ${corr.coefficient}.`,
        confidence: 0.85,
        affectedColumns: [corr.column1, corr.column2],
        recommendation: corr.coefficient > 0
          ? 'These variables move together. Consider if one can predict the other.'
          : 'These variables move inversely. This might indicate a trade-off relationship.',
      });
    }
  }

  // Anomaly insights
  if (params.anomalies.length > 0) {
    const highSeverity = params.anomalies.filter(a => a.severity === 'high');
    if (highSeverity.length > 0) {
      const affectedCols = [...new Set(highSeverity.map(a => a.column))];
      insights.push({
        type: 'anomaly',
        title: `${highSeverity.length} high-severity anomalies detected`,
        description: `Found significant outliers that may indicate data quality issues or important edge cases.`,
        confidence: 0.95,
        affectedColumns: affectedCols,
        recommendation: 'Review these anomalies to determine if they are errors or genuine extreme values.',
      });
    }
  }

  // Quality insights
  if (params.dataQuality.overallScore < 70) {
    insights.push({
      type: 'quality',
      title: 'Data quality concerns detected',
      description: `Overall data quality score is ${params.dataQuality.overallScore}%. ${params.dataQuality.issues.length} issues found.`,
      confidence: 0.9,
      affectedColumns: params.dataQuality.issues.map(i => i.column).filter((c): c is string => c !== undefined),
      recommendation: 'Address data quality issues before using this data for critical analysis or decision-making.',
    });
  }

  return insights;
}

// =============================================================================
// AGENT DEFINITION
// =============================================================================

export const smartDataAnalyzerAgent = defineAgent({
  name: 'smart-data-analyzer',
  description: 'AI-powered data analysis agent that processes datasets, identifies patterns, detects anomalies, and provides natural language insights',
  version: '1.0.0',

  inputSchema: AnalyzeDataInputSchema,
  outputSchema: AnalyzeDataOutputSchema,

  tools: {
    parse_and_profile: {
      description: 'Parse input data and profile each column for type, nulls, and unique values',
      parameters: z.object({
        data: z.string(),
        format: z.enum(['csv', 'json']),
        hasHeaders: z.boolean(),
      }),
      returns: z.object({
        headers: z.array(z.string()),
        rows: z.array(z.array(z.unknown())),
        columns: z.array(DataColumnSchema),
      }),
      execute: parseAndProfileData,
      timeoutMs: 30000,
    },

    compute_statistics: {
      description: 'Calculate statistical measures for numeric columns',
      parameters: z.object({
        headers: z.array(z.string()),
        rows: z.array(z.array(z.unknown())),
        columns: z.array(DataColumnSchema),
      }),
      returns: z.record(z.string(), StatisticsSchema),
      execute: computeStatistics,
      timeoutMs: 30000,
    },

    find_correlations: {
      description: 'Calculate correlations between numeric columns',
      parameters: z.object({
        headers: z.array(z.string()),
        rows: z.array(z.array(z.unknown())),
        columns: z.array(DataColumnSchema),
      }),
      returns: z.array(CorrelationSchema),
      execute: findCorrelations,
      timeoutMs: 60000,
    },

    detect_anomalies: {
      description: 'Detect outliers and anomalies in the data',
      parameters: z.object({
        headers: z.array(z.string()),
        rows: z.array(z.array(z.unknown())),
        columns: z.array(DataColumnSchema),
      }),
      returns: z.array(AnomalySchema),
      execute: detectAllAnomalies,
      timeoutMs: 30000,
    },

    assess_quality: {
      description: 'Assess overall data quality metrics',
      parameters: z.object({
        rowCount: z.number(),
        columns: z.array(DataColumnSchema),
        anomalies: z.array(AnomalySchema),
      }),
      returns: DataQualitySchema,
      execute: assessDataQuality,
      timeoutMs: 15000,
    },

    generate_insights: {
      description: 'Generate natural language insights from analysis results',
      parameters: z.object({
        columns: z.array(DataColumnSchema),
        statistics: z.record(z.string(), StatisticsSchema),
        correlations: z.array(CorrelationSchema),
        anomalies: z.array(AnomalySchema),
        dataQuality: DataQualitySchema,
      }),
      returns: z.array(InsightSchema),
      execute: generateInsights,
      timeoutMs: 30000,
    },
  },

  systemPrompt: `You are an expert data analyst AI assistant. Your role is to analyze datasets and provide actionable insights.

When analyzing data:
1. First parse and profile the data to understand its structure
2. Compute statistics for numeric columns
3. Find correlations between variables
4. Detect anomalies and outliers
5. Assess overall data quality
6. Generate insights based on all findings

Always explain your findings in clear, non-technical language while providing the statistical backing.
Focus on actionable insights that help users make decisions.
If data quality is poor, clearly communicate the limitations of any analysis.`,

  config: {
    maxTurns: 15,
    temperature: 0.3,
    maxTokens: 4096,
  },
});

// =============================================================================
// QUERY AGENT
// =============================================================================

export const dataQueryAgent = defineAgent({
  name: 'data-query',
  description: 'Answer natural language questions about data',
  version: '1.0.0',

  inputSchema: QueryDataInputSchema,
  outputSchema: QueryDataOutputSchema,

  tools: {
    parse_data: {
      description: 'Parse and prepare data for querying',
      parameters: z.object({
        data: z.string(),
        format: z.enum(['csv', 'json']),
      }),
      returns: z.object({
        headers: z.array(z.string()),
        rows: z.array(z.array(z.unknown())),
        rowCount: z.number(),
      }),
      execute: async (ctx, params) => {
        const parsed = parseCSV(params.data, true);
        return {
          headers: parsed.headers,
          rows: parsed.rows,
          rowCount: parsed.rows.length,
        };
      },
      timeoutMs: 15000,
    },

    aggregate_data: {
      description: 'Perform aggregations (sum, avg, count, min, max) on columns',
      parameters: z.object({
        column: z.string(),
        operation: z.enum(['sum', 'avg', 'count', 'min', 'max']),
        rows: z.array(z.array(z.unknown())),
        columnIndex: z.number(),
      }),
      returns: z.object({
        result: z.number(),
        operation: z.string(),
        column: z.string(),
      }),
      execute: async (ctx, params) => {
        const values = params.rows
          .map(row => Number(row[params.columnIndex]))
          .filter(v => !isNaN(v));

        let result: number;
        switch (params.operation) {
          case 'sum':
            result = values.reduce((a, b) => a + b, 0);
            break;
          case 'avg':
            result = values.reduce((a, b) => a + b, 0) / values.length;
            break;
          case 'count':
            result = values.length;
            break;
          case 'min':
            result = Math.min(...values);
            break;
          case 'max':
            result = Math.max(...values);
            break;
        }

        return {
          result: Math.round(result * 1000) / 1000,
          operation: params.operation,
          column: params.column,
        };
      },
      timeoutMs: 15000,
    },

    filter_data: {
      description: 'Filter rows based on conditions',
      parameters: z.object({
        rows: z.array(z.array(z.unknown())),
        columnIndex: z.number(),
        operator: z.enum(['eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'contains']),
        value: z.union([z.string(), z.number()]),
      }),
      returns: z.object({
        filteredRows: z.array(z.array(z.unknown())),
        matchCount: z.number(),
      }),
      execute: async (ctx, params) => {
        const filteredRows = params.rows.filter(row => {
          const cellValue = row[params.columnIndex];
          const compareValue = params.value;

          switch (params.operator) {
            case 'eq':
              return String(cellValue) === String(compareValue);
            case 'ne':
              return String(cellValue) !== String(compareValue);
            case 'gt':
              return Number(cellValue) > Number(compareValue);
            case 'lt':
              return Number(cellValue) < Number(compareValue);
            case 'gte':
              return Number(cellValue) >= Number(compareValue);
            case 'lte':
              return Number(cellValue) <= Number(compareValue);
            case 'contains':
              return String(cellValue).toLowerCase().includes(String(compareValue).toLowerCase());
          }
        });

        return {
          filteredRows,
          matchCount: filteredRows.length,
        };
      },
      timeoutMs: 15000,
    },
  },

  systemPrompt: `You are a data query assistant. Your role is to answer natural language questions about data.

When answering questions:
1. First understand what the user is asking
2. Parse the data to understand its structure
3. Use the appropriate tools to compute the answer
4. Explain your methodology clearly
5. Provide the answer with appropriate context

Be precise with numbers and always explain any assumptions you make.`,

  config: {
    maxTurns: 10,
    temperature: 0.2,
    maxTokens: 2048,
  },
});

export default smartDataAnalyzerAgent;
