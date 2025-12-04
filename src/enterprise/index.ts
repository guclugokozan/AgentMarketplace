/**
 * Enterprise Module Exports
 *
 * Provides enterprise-grade features for the Agent Marketplace
 */

// Multi-tenant isolation
export {
  TenantManager,
  TenantConfigSchema,
  TIER_LIMITS,
  createTenantMiddleware,
  TenantScopedQuery,
  type TenantConfig,
  type TenantContext,
  type TenantUsage,
} from './multi-tenant.js';

// Attribute-Based Access Control
export {
  ABACManager,
  PolicySchema,
  PolicyConditionSchema,
  BUILT_IN_ROLES,
  createABACMiddleware,
  type Policy,
  type PolicyCondition,
  type PolicyEffect,
  type AccessRequest,
  type AccessDecision,
} from './abac.js';

// Queue and Fairness
export {
  FairQueue,
  QueueItemSchema,
  DEFAULT_QUOTAS,
  createQueueMiddleware,
  type QueueItem,
  type QueueStats,
  type TenantQueueStats,
  type TenantQuota,
} from './queue.js';
