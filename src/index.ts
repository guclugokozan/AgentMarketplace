/**
 * Agent Marketplace
 *
 * Main exports for the Agent Marketplace library.
 */

// Core types
export * from './core/types.js';
export * from './core/models.js';
export * from './core/errors.js';

// Storage
export { getDatabase, closeDatabase } from './storage/database.js';
export { getRunsStorage, RunsStorage } from './storage/runs.js';
export { getStepsStorage, StepsStorage } from './storage/steps.js';

// Execution
export { getAgentExecutor, AgentExecutor } from './execution/executor.js';
export { getPreFlightChecker, PreFlightChecker } from './execution/preflight.js';

// Tools
export { getToolRegistry, ToolRegistry } from './tools/registry.js';

// Agents
export { getAgentRegistry, AgentRegistry } from './agents/registry.js';
export { codeReviewerAgent, CodeReviewerAgent } from './agents/code-reviewer/index.js';

// Audit
export { getProvenanceLogger, ProvenanceLogger } from './audit/provenance.js';

// Logging
export { getLogger, createLogger, StructuredLogger } from './logging/logger.js';
