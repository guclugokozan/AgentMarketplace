/**
 * Agents API Route
 *
 * GET /agents - List all agents
 * GET /agents/:id - Get agent details
 * GET /agents/:id/health - Get agent health
 * GET /agents/search - Search agents
 */

import { Router, Request, Response, NextFunction } from 'express';
import { getAgentRegistry } from '../../agents/registry.js';

const router = Router();

/**
 * GET /agents
 *
 * List all registered agents.
 */
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const registry = getAgentRegistry();
    const cards = registry.listCards();

    res.json({
      agents: cards.map(card => ({
        id: card.id,
        name: card.name,
        description: card.description,
        version: card.version,
        capabilities: card.capabilities,
        defaultModel: card.defaultModel,
        defaultEffortLevel: card.defaultEffortLevel,
        sideEffects: card.sideEffects,
        estimatedCostTier: card.estimatedCostTier,
        deprecated: card.deprecated,
      })),
      total: cards.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /agents/search
 *
 * Search agents by query.
 */
router.get('/search', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { q, capability } = req.query;

    const registry = getAgentRegistry();
    let results;

    if (capability) {
      results = registry.findByCapability(capability as string);
    } else if (q) {
      results = registry.search(q as string);
    } else {
      results = registry.listCards();
    }

    res.json({
      agents: results.map(card => ({
        id: card.id,
        name: card.name,
        description: card.description,
        capabilities: card.capabilities,
      })),
      total: results.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /agents/:id
 *
 * Get agent details.
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const registry = getAgentRegistry();
    const agent = registry.get(id);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    res.json({
      ...agent.card,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /agents/:id/health
 *
 * Get agent health metrics.
 */
router.get('/:id/health', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const registry = getAgentRegistry();

    const agent = registry.get(id);
    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    const health = await registry.getHealth(id);
    res.json(health);
  } catch (error) {
    next(error);
  }
});

export default router;
