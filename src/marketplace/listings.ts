/**
 * Marketplace Listings Module
 *
 * Provides marketplace functionality for agents:
 * - Public/private visibility
 * - Author verification
 * - Badges (verified, popular, staff pick)
 * - Reviews and ratings
 * - Pricing models
 * - Usage metering
 */

import { z } from 'zod';
import type { Database } from 'better-sqlite3';

// Listing visibility
export type ListingVisibility = 'public' | 'private' | 'unlisted' | 'organization';

// Pricing models
export const PricingModelSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('free'),
  }),
  z.object({
    type: z.literal('per_call'),
    priceUsd: z.number().positive(),
    freeQuota: z.number().int().nonnegative().default(0),
  }),
  z.object({
    type: z.literal('per_token'),
    inputPricePerMillion: z.number().positive(),
    outputPricePerMillion: z.number().positive(),
    markup: z.number().min(0).max(5).default(1), // Multiplier on base cost
  }),
  z.object({
    type: z.literal('subscription'),
    monthlyPriceUsd: z.number().positive(),
    yearlyPriceUsd: z.number().positive().optional(),
    includedCalls: z.number().int().positive(),
    overagePerCall: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal('custom'),
    contactEmail: z.string().email(),
    description: z.string(),
  }),
]);

export type PricingModel = z.infer<typeof PricingModelSchema>;

// Badge types
export const BADGE_TYPES = {
  verified: {
    name: 'Verified',
    description: 'Author identity verified',
    icon: '✓',
    color: '#4CAF50',
  },
  popular: {
    name: 'Popular',
    description: 'Over 1000 uses',
    icon: '🔥',
    color: '#FF5722',
  },
  trending: {
    name: 'Trending',
    description: 'High growth in usage',
    icon: '📈',
    color: '#2196F3',
  },
  staff_pick: {
    name: 'Staff Pick',
    description: 'Recommended by our team',
    icon: '⭐',
    color: '#FFC107',
  },
  enterprise_ready: {
    name: 'Enterprise Ready',
    description: 'Meets enterprise requirements',
    icon: '🏢',
    color: '#9C27B0',
  },
  open_source: {
    name: 'Open Source',
    description: 'Source code available',
    icon: '📖',
    color: '#607D8B',
  },
} as const;

export type BadgeType = keyof typeof BADGE_TYPES;

// Listing schema
export const ListingSchema = z.object({
  id: z.string().uuid(),
  agentId: z.string(),
  authorId: z.string().uuid(),
  organizationId: z.string().uuid().optional(),

  // Display info
  displayName: z.string().min(1).max(100),
  shortDescription: z.string().min(10).max(200),
  longDescription: z.string().max(10000).optional(),
  iconUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  screenshots: z.array(z.string().url()).max(10).optional(),
  demoUrl: z.string().url().optional(),
  documentationUrl: z.string().url().optional(),
  repositoryUrl: z.string().url().optional(),

  // Categorization
  categories: z.array(z.string()).min(1).max(5),
  tags: z.array(z.string()).max(20),

  // Visibility and status
  visibility: z.enum(['public', 'private', 'unlisted', 'organization']),
  status: z.enum(['draft', 'pending_review', 'published', 'suspended', 'deprecated']),
  publishedAt: z.date().optional(),

  // Pricing
  pricing: PricingModelSchema,

  // Badges
  badges: z.array(z.enum(['verified', 'popular', 'trending', 'staff_pick', 'enterprise_ready', 'open_source'])),

  // Stats (denormalized for performance)
  stats: z.object({
    totalUses: z.number().int().nonnegative(),
    totalRatings: z.number().int().nonnegative(),
    averageRating: z.number().min(0).max(5),
    monthlyUses: z.number().int().nonnegative(),
    weeklyUses: z.number().int().nonnegative(),
  }),

  // Metadata
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Listing = z.infer<typeof ListingSchema>;

// Review schema
export const ReviewSchema = z.object({
  id: z.string().uuid(),
  listingId: z.string().uuid(),
  authorId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1).max(100).optional(),
  content: z.string().max(5000).optional(),
  helpful: z.number().int().nonnegative().default(0),
  notHelpful: z.number().int().nonnegative().default(0),
  verified: z.boolean().default(false), // User actually used the agent
  status: z.enum(['pending', 'approved', 'rejected', 'flagged']),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Review = z.infer<typeof ReviewSchema>;

// Author verification schema
export const AuthorVerificationSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  verificationType: z.enum(['email', 'github', 'company', 'identity']),
  status: z.enum(['pending', 'approved', 'rejected', 'expired']),
  verifiedAt: z.date().optional(),
  expiresAt: z.date().optional(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
});

export type AuthorVerification = z.infer<typeof AuthorVerificationSchema>;

// Categories
export const CATEGORIES = [
  { id: 'development', name: 'Development', icon: '💻' },
  { id: 'data-analysis', name: 'Data Analysis', icon: '📊' },
  { id: 'writing', name: 'Writing & Content', icon: '✍️' },
  { id: 'automation', name: 'Automation', icon: '🤖' },
  { id: 'research', name: 'Research', icon: '🔬' },
  { id: 'customer-service', name: 'Customer Service', icon: '💬' },
  { id: 'finance', name: 'Finance', icon: '💰' },
  { id: 'legal', name: 'Legal', icon: '⚖️' },
  { id: 'healthcare', name: 'Healthcare', icon: '🏥' },
  { id: 'education', name: 'Education', icon: '📚' },
  { id: 'marketing', name: 'Marketing', icon: '📣' },
  { id: 'security', name: 'Security', icon: '🔒' },
  { id: 'devops', name: 'DevOps', icon: '🚀' },
  { id: 'other', name: 'Other', icon: '📦' },
] as const;

export class MarketplaceManager {
  constructor(private db: Database) {
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS marketplace_listings (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        organization_id TEXT,
        display_name TEXT NOT NULL,
        short_description TEXT NOT NULL,
        long_description TEXT,
        icon_url TEXT,
        banner_url TEXT,
        screenshots_json TEXT,
        demo_url TEXT,
        documentation_url TEXT,
        repository_url TEXT,
        categories_json TEXT NOT NULL,
        tags_json TEXT,
        visibility TEXT NOT NULL DEFAULT 'private',
        status TEXT NOT NULL DEFAULT 'draft',
        published_at TEXT,
        pricing_json TEXT NOT NULL,
        badges_json TEXT NOT NULL DEFAULT '[]',
        stats_json TEXT NOT NULL,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_listings_agent ON marketplace_listings(agent_id);
      CREATE INDEX IF NOT EXISTS idx_listings_author ON marketplace_listings(author_id);
      CREATE INDEX IF NOT EXISTS idx_listings_status ON marketplace_listings(status);
      CREATE INDEX IF NOT EXISTS idx_listings_visibility ON marketplace_listings(visibility);

      CREATE TABLE IF NOT EXISTS marketplace_reviews (
        id TEXT PRIMARY KEY,
        listing_id TEXT NOT NULL,
        author_id TEXT NOT NULL,
        rating INTEGER NOT NULL,
        title TEXT,
        content TEXT,
        helpful INTEGER NOT NULL DEFAULT 0,
        not_helpful INTEGER NOT NULL DEFAULT 0,
        verified INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id),
        UNIQUE(listing_id, author_id)
      );

      CREATE INDEX IF NOT EXISTS idx_reviews_listing ON marketplace_reviews(listing_id);
      CREATE INDEX IF NOT EXISTS idx_reviews_author ON marketplace_reviews(author_id);

      CREATE TABLE IF NOT EXISTS author_verifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        verification_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        verified_at TEXT,
        expires_at TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_verifications_user ON author_verifications(user_id);

      CREATE TABLE IF NOT EXISTS listing_usage (
        listing_id TEXT NOT NULL,
        date TEXT NOT NULL,
        uses INTEGER NOT NULL DEFAULT 0,
        revenue_usd REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (listing_id, date),
        FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id)
      );

      CREATE TABLE IF NOT EXISTS listing_favorites (
        user_id TEXT NOT NULL,
        listing_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (user_id, listing_id),
        FOREIGN KEY (listing_id) REFERENCES marketplace_listings(id)
      );
    `);
  }

  // Listing management
  async createListing(params: {
    agentId: string;
    authorId: string;
    organizationId?: string;
    displayName: string;
    shortDescription: string;
    longDescription?: string;
    categories: string[];
    tags?: string[];
    pricing: PricingModel;
    iconUrl?: string;
    demoUrl?: string;
    documentationUrl?: string;
    repositoryUrl?: string;
  }): Promise<Listing> {
    const id = crypto.randomUUID();
    const now = new Date();

    const listing: Listing = {
      id,
      agentId: params.agentId,
      authorId: params.authorId,
      organizationId: params.organizationId,
      displayName: params.displayName,
      shortDescription: params.shortDescription,
      longDescription: params.longDescription,
      iconUrl: params.iconUrl,
      demoUrl: params.demoUrl,
      documentationUrl: params.documentationUrl,
      repositoryUrl: params.repositoryUrl,
      categories: params.categories,
      tags: params.tags ?? [],
      visibility: 'private',
      status: 'draft',
      pricing: params.pricing,
      badges: [],
      stats: {
        totalUses: 0,
        totalRatings: 0,
        averageRating: 0,
        monthlyUses: 0,
        weeklyUses: 0,
      },
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO marketplace_listings (
        id, agent_id, author_id, organization_id, display_name, short_description,
        long_description, icon_url, demo_url, documentation_url, repository_url,
        categories_json, tags_json, visibility, status, pricing_json, badges_json,
        stats_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      listing.id,
      listing.agentId,
      listing.authorId,
      listing.organizationId ?? null,
      listing.displayName,
      listing.shortDescription,
      listing.longDescription ?? null,
      listing.iconUrl ?? null,
      listing.demoUrl ?? null,
      listing.documentationUrl ?? null,
      listing.repositoryUrl ?? null,
      JSON.stringify(listing.categories),
      JSON.stringify(listing.tags),
      listing.visibility,
      listing.status,
      JSON.stringify(listing.pricing),
      JSON.stringify(listing.badges),
      JSON.stringify(listing.stats),
      listing.createdAt.toISOString(),
      listing.updatedAt.toISOString()
    );

    return listing;
  }

  async getListing(id: string): Promise<Listing | null> {
    const stmt = this.db.prepare('SELECT * FROM marketplace_listings WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToListing(row) : null;
  }

  async getListingByAgentId(agentId: string): Promise<Listing | null> {
    const stmt = this.db.prepare('SELECT * FROM marketplace_listings WHERE agent_id = ?');
    const row = stmt.get(agentId) as Record<string, unknown> | undefined;
    return row ? this.rowToListing(row) : null;
  }

  async updateListing(id: string, updates: Partial<Listing>): Promise<Listing | null> {
    const existing = await this.getListing(id);
    if (!existing) return null;

    const updated: Listing = {
      ...existing,
      ...updates,
      id: existing.id,
      agentId: existing.agentId,
      authorId: existing.authorId,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };

    const stmt = this.db.prepare(`
      UPDATE marketplace_listings SET
        display_name = ?, short_description = ?, long_description = ?,
        icon_url = ?, banner_url = ?, screenshots_json = ?, demo_url = ?,
        documentation_url = ?, repository_url = ?, categories_json = ?,
        tags_json = ?, visibility = ?, status = ?, published_at = ?,
        pricing_json = ?, badges_json = ?, stats_json = ?, metadata_json = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      updated.displayName,
      updated.shortDescription,
      updated.longDescription ?? null,
      updated.iconUrl ?? null,
      updated.bannerUrl ?? null,
      updated.screenshots ? JSON.stringify(updated.screenshots) : null,
      updated.demoUrl ?? null,
      updated.documentationUrl ?? null,
      updated.repositoryUrl ?? null,
      JSON.stringify(updated.categories),
      JSON.stringify(updated.tags),
      updated.visibility,
      updated.status,
      updated.publishedAt?.toISOString() ?? null,
      JSON.stringify(updated.pricing),
      JSON.stringify(updated.badges),
      JSON.stringify(updated.stats),
      updated.metadata ? JSON.stringify(updated.metadata) : null,
      updated.updatedAt.toISOString(),
      id
    );

    return updated;
  }

  async publishListing(id: string): Promise<Listing | null> {
    return this.updateListing(id, {
      status: 'published',
      visibility: 'public',
      publishedAt: new Date(),
    });
  }

  async suspendListing(id: string, reason: string): Promise<Listing | null> {
    const listing = await this.getListing(id);
    if (!listing) return null;

    return this.updateListing(id, {
      status: 'suspended',
      metadata: { ...listing.metadata, suspensionReason: reason, suspendedAt: new Date().toISOString() },
    });
  }

  // Search and discovery
  async search(params: {
    query?: string;
    categories?: string[];
    tags?: string[];
    minRating?: number;
    pricing?: PricingModel['type'][];
    badges?: BadgeType[];
    sortBy?: 'relevance' | 'rating' | 'uses' | 'recent';
    limit?: number;
    offset?: number;
  }): Promise<{ listings: Listing[]; total: number }> {
    let query = `
      SELECT *, (
        CASE WHEN ? IS NOT NULL AND ? != '' THEN
          (CASE WHEN display_name LIKE '%' || ? || '%' THEN 10 ELSE 0 END) +
          (CASE WHEN short_description LIKE '%' || ? || '%' THEN 5 ELSE 0 END) +
          (CASE WHEN tags_json LIKE '%' || ? || '%' THEN 3 ELSE 0 END)
        ELSE 0 END
      ) as relevance_score
      FROM marketplace_listings
      WHERE status = 'published' AND visibility = 'public'
    `;

    const queryParams: unknown[] = [
      params.query, params.query, params.query, params.query, params.query
    ];

    if (params.categories && params.categories.length > 0) {
      const placeholders = params.categories.map(() => 'categories_json LIKE ?').join(' OR ');
      query += ` AND (${placeholders})`;
      params.categories.forEach(cat => queryParams.push(`%"${cat}"%`));
    }

    if (params.minRating) {
      query += ` AND json_extract(stats_json, '$.averageRating') >= ?`;
      queryParams.push(params.minRating);
    }

    if (params.pricing && params.pricing.length > 0) {
      const placeholders = params.pricing.map(() => `json_extract(pricing_json, '$.type') = ?`).join(' OR ');
      query += ` AND (${placeholders})`;
      queryParams.push(...params.pricing);
    }

    if (params.badges && params.badges.length > 0) {
      const badgeConditions = params.badges.map(() => `badges_json LIKE ?`).join(' OR ');
      query += ` AND (${badgeConditions})`;
      params.badges.forEach(badge => queryParams.push(`%"${badge}"%`));
    }

    // Sort
    switch (params.sortBy) {
      case 'rating':
        query += ` ORDER BY json_extract(stats_json, '$.averageRating') DESC`;
        break;
      case 'uses':
        query += ` ORDER BY json_extract(stats_json, '$.totalUses') DESC`;
        break;
      case 'recent':
        query += ` ORDER BY published_at DESC`;
        break;
      case 'relevance':
      default:
        query += ` ORDER BY relevance_score DESC, json_extract(stats_json, '$.totalUses') DESC`;
    }

    // Count total - build a separate count query
    const countBaseQuery = `
      SELECT COUNT(*) as total
      FROM marketplace_listings
      WHERE status = 'published' AND visibility = 'public'
    `;
    let countConditions = '';
    const countParams: unknown[] = [];

    if (params.categories && params.categories.length > 0) {
      const placeholders = params.categories.map(() => 'categories_json LIKE ?').join(' OR ');
      countConditions += ` AND (${placeholders})`;
      params.categories.forEach(cat => countParams.push(`%"${cat}"%`));
    }
    if (params.minRating) {
      countConditions += ` AND json_extract(stats_json, '$.averageRating') >= ?`;
      countParams.push(params.minRating);
    }
    if (params.pricing && params.pricing.length > 0) {
      const placeholders = params.pricing.map(() => `json_extract(pricing_json, '$.type') = ?`).join(' OR ');
      countConditions += ` AND (${placeholders})`;
      countParams.push(...params.pricing);
    }
    if (params.badges && params.badges.length > 0) {
      const badgeConditions = params.badges.map(() => `badges_json LIKE ?`).join(' OR ');
      countConditions += ` AND (${badgeConditions})`;
      params.badges.forEach(badge => countParams.push(`%"${badge}"%`));
    }

    const countStmt = this.db.prepare(countBaseQuery + countConditions);
    const countResult = countStmt.get(...countParams) as { total: number } | undefined;

    // Apply pagination
    if (params.limit) {
      query += ' LIMIT ?';
      queryParams.push(params.limit);
    }

    if (params.offset) {
      query += ' OFFSET ?';
      queryParams.push(params.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...queryParams) as Record<string, unknown>[];

    return {
      listings: rows.map(row => this.rowToListing(row)),
      total: countResult?.total ?? 0,
    };
  }

  async getFeatured(limit: number = 10): Promise<Listing[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM marketplace_listings
      WHERE status = 'published' AND visibility = 'public'
      AND badges_json LIKE '%staff_pick%'
      ORDER BY json_extract(stats_json, '$.totalUses') DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as Record<string, unknown>[];
    return rows.map(row => this.rowToListing(row));
  }

  async getTrending(limit: number = 10): Promise<Listing[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM marketplace_listings
      WHERE status = 'published' AND visibility = 'public'
      ORDER BY json_extract(stats_json, '$.weeklyUses') DESC
      LIMIT ?
    `);

    const rows = stmt.all(limit) as Record<string, unknown>[];
    return rows.map(row => this.rowToListing(row));
  }

  async getByCategory(category: string, limit: number = 20): Promise<Listing[]> {
    const stmt = this.db.prepare(`
      SELECT * FROM marketplace_listings
      WHERE status = 'published' AND visibility = 'public'
      AND categories_json LIKE ?
      ORDER BY json_extract(stats_json, '$.totalUses') DESC
      LIMIT ?
    `);

    const rows = stmt.all(`%"${category}"%`, limit) as Record<string, unknown>[];
    return rows.map(row => this.rowToListing(row));
  }

  // Reviews
  async createReview(params: {
    listingId: string;
    authorId: string;
    rating: number;
    title?: string;
    content?: string;
    verified?: boolean;
  }): Promise<Review> {
    const id = crypto.randomUUID();
    const now = new Date();

    const review: Review = {
      id,
      listingId: params.listingId,
      authorId: params.authorId,
      rating: params.rating,
      title: params.title,
      content: params.content,
      helpful: 0,
      notHelpful: 0,
      verified: params.verified ?? false,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO marketplace_reviews (
        id, listing_id, author_id, rating, title, content, helpful, not_helpful,
        verified, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      review.id,
      review.listingId,
      review.authorId,
      review.rating,
      review.title ?? null,
      review.content ?? null,
      review.helpful,
      review.notHelpful,
      review.verified ? 1 : 0,
      review.status,
      review.createdAt.toISOString(),
      review.updatedAt.toISOString()
    );

    // Update listing stats
    await this.updateListingStats(params.listingId);

    return review;
  }

  async getReviews(listingId: string, options: {
    status?: Review['status'];
    sortBy?: 'recent' | 'helpful' | 'rating';
    limit?: number;
    offset?: number;
  } = {}): Promise<Review[]> {
    let query = 'SELECT * FROM marketplace_reviews WHERE listing_id = ?';
    const queryParams: unknown[] = [listingId];

    if (options.status) {
      query += ' AND status = ?';
      queryParams.push(options.status);
    }

    switch (options.sortBy) {
      case 'helpful':
        query += ' ORDER BY helpful DESC';
        break;
      case 'rating':
        query += ' ORDER BY rating DESC';
        break;
      case 'recent':
      default:
        query += ' ORDER BY created_at DESC';
    }

    if (options.limit) {
      query += ' LIMIT ?';
      queryParams.push(options.limit);
    }

    if (options.offset) {
      query += ' OFFSET ?';
      queryParams.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...queryParams) as Record<string, unknown>[];

    return rows.map(row => ({
      id: row.id as string,
      listingId: row.listing_id as string,
      authorId: row.author_id as string,
      rating: row.rating as number,
      title: row.title as string | undefined,
      content: row.content as string | undefined,
      helpful: row.helpful as number,
      notHelpful: row.not_helpful as number,
      verified: Boolean(row.verified),
      status: row.status as Review['status'],
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    }));
  }

  async voteReview(reviewId: string, helpful: boolean): Promise<void> {
    const column = helpful ? 'helpful' : 'not_helpful';
    const stmt = this.db.prepare(`
      UPDATE marketplace_reviews SET ${column} = ${column} + 1 WHERE id = ?
    `);
    stmt.run(reviewId);
  }

  // Usage tracking
  async recordUsage(listingId: string, revenueUsd: number = 0): Promise<void> {
    const date = new Date().toISOString().split('T')[0];

    const stmt = this.db.prepare(`
      INSERT INTO listing_usage (listing_id, date, uses, revenue_usd)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(listing_id, date) DO UPDATE SET
        uses = uses + 1,
        revenue_usd = revenue_usd + excluded.revenue_usd
    `);

    stmt.run(listingId, date, revenueUsd);

    // Update stats periodically (every 10th call or so)
    if (Math.random() < 0.1) {
      await this.updateListingStats(listingId);
    }
  }

  private async updateListingStats(listingId: string): Promise<void> {
    const listing = await this.getListing(listingId);
    if (!listing) return;

    // Get total uses
    const totalStmt = this.db.prepare(`
      SELECT SUM(uses) as total FROM listing_usage WHERE listing_id = ?
    `);
    const totalResult = totalStmt.get(listingId) as { total: number | null };

    // Get monthly uses
    const monthAgo = new Date();
    monthAgo.setDate(monthAgo.getDate() - 30);
    const monthlyStmt = this.db.prepare(`
      SELECT SUM(uses) as total FROM listing_usage
      WHERE listing_id = ? AND date >= ?
    `);
    const monthlyResult = monthlyStmt.get(listingId, monthAgo.toISOString().split('T')[0]) as { total: number | null };

    // Get weekly uses
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weeklyStmt = this.db.prepare(`
      SELECT SUM(uses) as total FROM listing_usage
      WHERE listing_id = ? AND date >= ?
    `);
    const weeklyResult = weeklyStmt.get(listingId, weekAgo.toISOString().split('T')[0]) as { total: number | null };

    // Get rating stats
    const ratingStmt = this.db.prepare(`
      SELECT COUNT(*) as count, AVG(rating) as avg
      FROM marketplace_reviews
      WHERE listing_id = ? AND status = 'approved'
    `);
    const ratingResult = ratingStmt.get(listingId) as { count: number; avg: number | null };

    const newStats = {
      totalUses: totalResult.total ?? 0,
      monthlyUses: monthlyResult.total ?? 0,
      weeklyUses: weeklyResult.total ?? 0,
      totalRatings: ratingResult.count,
      averageRating: ratingResult.avg ?? 0,
    };

    // Update badges based on stats
    const newBadges = [...listing.badges];

    if (newStats.totalUses >= 1000 && !newBadges.includes('popular')) {
      newBadges.push('popular');
    }

    // Check for trending (>50% growth week over week)
    const prevWeeklyUses = listing.stats.weeklyUses;
    if (prevWeeklyUses > 0 && newStats.weeklyUses > prevWeeklyUses * 1.5) {
      if (!newBadges.includes('trending')) {
        newBadges.push('trending');
      }
    } else {
      const trendingIndex = newBadges.indexOf('trending');
      if (trendingIndex > -1) {
        newBadges.splice(trendingIndex, 1);
      }
    }

    await this.updateListing(listingId, {
      stats: newStats,
      badges: newBadges as BadgeType[],
    });
  }

  // Author verification
  async requestVerification(userId: string, type: AuthorVerification['verificationType']): Promise<AuthorVerification> {
    const id = crypto.randomUUID();
    const now = new Date();

    const verification: AuthorVerification = {
      id,
      userId,
      verificationType: type,
      status: 'pending',
      createdAt: now,
    };

    const stmt = this.db.prepare(`
      INSERT INTO author_verifications (id, user_id, verification_type, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, userId, type, 'pending', now.toISOString());

    return verification;
  }

  async approveVerification(verificationId: string, expiresInDays?: number): Promise<void> {
    const now = new Date();
    const expiresAt = expiresInDays
      ? new Date(now.getTime() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const stmt = this.db.prepare(`
      UPDATE author_verifications
      SET status = 'approved', verified_at = ?, expires_at = ?
      WHERE id = ?
    `);

    stmt.run(now.toISOString(), expiresAt?.toISOString() ?? null, verificationId);

    // Get user ID and add verified badge to their listings
    const verificationStmt = this.db.prepare('SELECT user_id FROM author_verifications WHERE id = ?');
    const verification = verificationStmt.get(verificationId) as { user_id: string } | undefined;

    if (verification) {
      const updateStmt = this.db.prepare(`
        UPDATE marketplace_listings
        SET badges_json = json_insert(badges_json, '$[#]', 'verified')
        WHERE author_id = ? AND badges_json NOT LIKE '%verified%'
      `);
      updateStmt.run(verification.user_id);
    }
  }

  async isAuthorVerified(userId: string): Promise<boolean> {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) as count FROM author_verifications
      WHERE user_id = ? AND status = 'approved'
      AND (expires_at IS NULL OR expires_at > ?)
    `);

    const result = stmt.get(userId, new Date().toISOString()) as { count: number };
    return result.count > 0;
  }

  // Favorites
  async addFavorite(userId: string, listingId: string): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO listing_favorites (user_id, listing_id, created_at)
      VALUES (?, ?, ?)
    `);
    stmt.run(userId, listingId, new Date().toISOString());
  }

  async removeFavorite(userId: string, listingId: string): Promise<void> {
    const stmt = this.db.prepare(`
      DELETE FROM listing_favorites WHERE user_id = ? AND listing_id = ?
    `);
    stmt.run(userId, listingId);
  }

  async getFavorites(userId: string): Promise<Listing[]> {
    const stmt = this.db.prepare(`
      SELECT l.* FROM marketplace_listings l
      JOIN listing_favorites f ON l.id = f.listing_id
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC
    `);

    const rows = stmt.all(userId) as Record<string, unknown>[];
    return rows.map(row => this.rowToListing(row));
  }

  // Revenue calculation
  calculateRevenue(listing: Listing, usage: { calls: number; inputTokens: number; outputTokens: number }): number {
    switch (listing.pricing.type) {
      case 'free':
        return 0;

      case 'per_call':
        const billableCalls = Math.max(0, usage.calls - listing.pricing.freeQuota);
        return billableCalls * listing.pricing.priceUsd;

      case 'per_token':
        const inputCost = (usage.inputTokens / 1_000_000) * listing.pricing.inputPricePerMillion;
        const outputCost = (usage.outputTokens / 1_000_000) * listing.pricing.outputPricePerMillion;
        return (inputCost + outputCost) * listing.pricing.markup;

      case 'subscription':
        // Subscription is handled separately
        return 0;

      case 'custom':
        return 0;
    }
  }

  private rowToListing(row: Record<string, unknown>): Listing {
    return {
      id: row.id as string,
      agentId: row.agent_id as string,
      authorId: row.author_id as string,
      organizationId: row.organization_id as string | undefined,
      displayName: row.display_name as string,
      shortDescription: row.short_description as string,
      longDescription: row.long_description as string | undefined,
      iconUrl: row.icon_url as string | undefined,
      bannerUrl: row.banner_url as string | undefined,
      screenshots: row.screenshots_json ? JSON.parse(row.screenshots_json as string) : undefined,
      demoUrl: row.demo_url as string | undefined,
      documentationUrl: row.documentation_url as string | undefined,
      repositoryUrl: row.repository_url as string | undefined,
      categories: JSON.parse(row.categories_json as string),
      tags: row.tags_json ? JSON.parse(row.tags_json as string) : [],
      visibility: row.visibility as ListingVisibility,
      status: row.status as Listing['status'],
      publishedAt: row.published_at ? new Date(row.published_at as string) : undefined,
      pricing: JSON.parse(row.pricing_json as string),
      badges: JSON.parse(row.badges_json as string),
      stats: JSON.parse(row.stats_json as string),
      metadata: row.metadata_json ? JSON.parse(row.metadata_json as string) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
    };
  }
}

export default MarketplaceManager;
