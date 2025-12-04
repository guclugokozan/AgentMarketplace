/**
 * Marketplace Module Tests
 *
 * Tests for listings, reviews, and marketplace features
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { MarketplaceManager, CATEGORIES, BADGE_TYPES, type Listing, type PricingModel } from '../src/marketplace/listings.js';

describe('Marketplace Module', () => {
  let db: Database.Database;
  let marketplace: MarketplaceManager;
  let authorId: string;

  beforeEach(() => {
    db = new Database(':memory:');
    marketplace = new MarketplaceManager(db);
    authorId = crypto.randomUUID();
  });

  afterEach(() => {
    db.close();
  });

  describe('Listing Management', () => {
    describe('createListing', () => {
      it('should create a listing with free pricing', async () => {
        const listing = await marketplace.createListing({
          agentId: 'test-agent',
          authorId,
          displayName: 'Test Agent',
          shortDescription: 'A test agent for testing purposes',
          categories: ['development'],
          pricing: { type: 'free' },
        });

        expect(listing.id).toBeDefined();
        expect(listing.displayName).toBe('Test Agent');
        expect(listing.status).toBe('draft');
        expect(listing.visibility).toBe('private');
        expect(listing.pricing.type).toBe('free');
      });

      it('should create a listing with per-call pricing', async () => {
        const listing = await marketplace.createListing({
          agentId: 'paid-agent',
          authorId,
          displayName: 'Paid Agent',
          shortDescription: 'A premium agent with per-call pricing',
          categories: ['data-analysis'],
          pricing: {
            type: 'per_call',
            priceUsd: 0.05,
            freeQuota: 10,
          },
        });

        expect(listing.pricing.type).toBe('per_call');
        if (listing.pricing.type === 'per_call') {
          expect(listing.pricing.priceUsd).toBe(0.05);
          expect(listing.pricing.freeQuota).toBe(10);
        }
      });

      it('should create a listing with subscription pricing', async () => {
        const listing = await marketplace.createListing({
          agentId: 'subscription-agent',
          authorId,
          displayName: 'Subscription Agent',
          shortDescription: 'An agent with subscription pricing',
          categories: ['automation'],
          pricing: {
            type: 'subscription',
            monthlyPriceUsd: 29.99,
            yearlyPriceUsd: 299.99,
            includedCalls: 1000,
            overagePerCall: 0.03,
          },
        });

        expect(listing.pricing.type).toBe('subscription');
      });

      it('should initialize stats to zero', async () => {
        const listing = await marketplace.createListing({
          agentId: 'new-agent',
          authorId,
          displayName: 'New Agent',
          shortDescription: 'Brand new agent with no usage',
          categories: ['other'],
          pricing: { type: 'free' },
        });

        expect(listing.stats.totalUses).toBe(0);
        expect(listing.stats.totalRatings).toBe(0);
        expect(listing.stats.averageRating).toBe(0);
      });
    });

    describe('getListing', () => {
      it('should retrieve listing by ID', async () => {
        const created = await marketplace.createListing({
          agentId: 'get-test',
          authorId,
          displayName: 'Get Test',
          shortDescription: 'Testing get functionality',
          categories: ['development'],
          pricing: { type: 'free' },
        });

        const retrieved = await marketplace.getListing(created.id);
        expect(retrieved).not.toBeNull();
        expect(retrieved!.displayName).toBe('Get Test');
      });

      it('should retrieve listing by agent ID', async () => {
        await marketplace.createListing({
          agentId: 'unique-agent-id',
          authorId,
          displayName: 'Agent ID Test',
          shortDescription: 'Testing get by agent ID',
          categories: ['development'],
          pricing: { type: 'free' },
        });

        const retrieved = await marketplace.getListingByAgentId('unique-agent-id');
        expect(retrieved).not.toBeNull();
        expect(retrieved!.agentId).toBe('unique-agent-id');
      });

      it('should return null for non-existent listing', async () => {
        const retrieved = await marketplace.getListing('non-existent-id');
        expect(retrieved).toBeNull();
      });
    });

    describe('updateListing', () => {
      it('should update listing properties', async () => {
        const listing = await marketplace.createListing({
          agentId: 'update-test',
          authorId,
          displayName: 'Original Name',
          shortDescription: 'Original description here',
          categories: ['development'],
          pricing: { type: 'free' },
        });

        const updated = await marketplace.updateListing(listing.id, {
          displayName: 'Updated Name',
          shortDescription: 'Updated description here',
          longDescription: 'A much longer description for the listing.',
        });

        expect(updated).not.toBeNull();
        expect(updated!.displayName).toBe('Updated Name');
        expect(updated!.longDescription).toBe('A much longer description for the listing.');
      });

      it('should not allow changing agent ID', async () => {
        const listing = await marketplace.createListing({
          agentId: 'immutable-agent',
          authorId,
          displayName: 'Immutable Test',
          shortDescription: 'Agent ID should not change',
          categories: ['development'],
          pricing: { type: 'free' },
        });

        const updated = await marketplace.updateListing(listing.id, {
          agentId: 'different-agent', // Should be ignored
        } as Partial<Listing>);

        expect(updated!.agentId).toBe('immutable-agent');
      });
    });

    describe('publishListing', () => {
      it('should publish a listing', async () => {
        const listing = await marketplace.createListing({
          agentId: 'publish-test',
          authorId,
          displayName: 'Publish Test',
          shortDescription: 'Testing publish functionality',
          categories: ['development'],
          pricing: { type: 'free' },
        });

        expect(listing.status).toBe('draft');

        const published = await marketplace.publishListing(listing.id);

        expect(published).not.toBeNull();
        expect(published!.status).toBe('published');
        expect(published!.visibility).toBe('public');
        expect(published!.publishedAt).toBeDefined();
      });
    });

    describe('suspendListing', () => {
      it('should suspend a listing with reason', async () => {
        const listing = await marketplace.createListing({
          agentId: 'suspend-test',
          authorId,
          displayName: 'Suspend Test',
          shortDescription: 'Testing suspend functionality',
          categories: ['development'],
          pricing: { type: 'free' },
        });

        await marketplace.publishListing(listing.id);
        const suspended = await marketplace.suspendListing(listing.id, 'Violated terms of service');

        expect(suspended!.status).toBe('suspended');
        expect(suspended!.metadata).toBeDefined();
        expect(suspended!.metadata!.suspensionReason).toBe('Violated terms of service');
      });
    });
  });

  describe('Search and Discovery', () => {
    beforeEach(async () => {
      // Create and publish several listings
      const listings = [
        { agentId: 'code-reviewer', displayName: 'Code Reviewer', shortDescription: 'Reviews code for quality', categories: ['development'], tags: ['code', 'review'] },
        { agentId: 'data-analyzer', displayName: 'Data Analyzer', shortDescription: 'Analyzes data sets', categories: ['data-analysis'], tags: ['data', 'analytics'] },
        { agentId: 'writer-bot', displayName: 'Writer Bot', shortDescription: 'Writes content and articles', categories: ['writing'], tags: ['content', 'writing'] },
        { agentId: 'automation-helper', displayName: 'Automation Helper', shortDescription: 'Automates repetitive tasks', categories: ['automation'], tags: ['automation', 'productivity'] },
      ];

      for (const l of listings) {
        const listing = await marketplace.createListing({
          ...l,
          authorId,
          pricing: { type: 'free' },
        });
        await marketplace.publishListing(listing.id);
      }
    });

    describe('search', () => {
      it('should find listings by query', async () => {
        const results = await marketplace.search({ query: 'code' });
        expect(results.listings.length).toBeGreaterThan(0);
        expect(results.listings.some(l => l.displayName === 'Code Reviewer')).toBe(true);
      });

      it('should filter by category', async () => {
        const results = await marketplace.search({ categories: ['data-analysis'] });
        expect(results.listings.length).toBe(1);
        expect(results.listings[0].displayName).toBe('Data Analyzer');
      });

      it('should support pagination', async () => {
        const page1 = await marketplace.search({ limit: 2 });
        const page2 = await marketplace.search({ limit: 2, offset: 2 });

        expect(page1.listings.length).toBe(2);
        expect(page2.listings.length).toBe(2);
        // Total should be 4 (all published listings)
        expect(page1.total).toBe(4);
        expect(page2.total).toBe(4);
      });

      it('should sort by different criteria', async () => {
        // Add some usage to one listing
        const listing = await marketplace.getListingByAgentId('code-reviewer');
        if (listing) {
          await marketplace.recordUsage(listing.id);
          await marketplace.recordUsage(listing.id);
        }

        const byUses = await marketplace.search({ sortBy: 'uses' });
        // Code reviewer should be first due to usage
        expect(byUses.listings[0].agentId).toBe('code-reviewer');
      });
    });

    describe('getFeatured', () => {
      it('should return staff picks', async () => {
        const listing = await marketplace.getListingByAgentId('code-reviewer');
        if (listing) {
          await marketplace.updateListing(listing.id, {
            badges: ['staff_pick'],
          });
        }

        const featured = await marketplace.getFeatured();
        expect(featured.some(l => l.badges.includes('staff_pick'))).toBe(true);
      });
    });

    describe('getTrending', () => {
      it('should return trending listings', async () => {
        // Record usage for trending calculation
        const listing = await marketplace.getListingByAgentId('data-analyzer');
        if (listing) {
          for (let i = 0; i < 10; i++) {
            await marketplace.recordUsage(listing.id);
          }
        }

        const trending = await marketplace.getTrending();
        expect(trending.length).toBeGreaterThan(0);
      });
    });

    describe('getByCategory', () => {
      it('should return listings in category', async () => {
        const devListings = await marketplace.getByCategory('development');
        expect(devListings.length).toBe(1);
        expect(devListings[0].categories).toContain('development');
      });
    });
  });

  describe('Reviews', () => {
    let listingId: string;

    beforeEach(async () => {
      const listing = await marketplace.createListing({
        agentId: 'review-test-agent',
        authorId,
        displayName: 'Review Test',
        shortDescription: 'Testing review functionality',
        categories: ['development'],
        pricing: { type: 'free' },
      });
      listingId = listing.id;
    });

    describe('createReview', () => {
      it('should create a review', async () => {
        const review = await marketplace.createReview({
          listingId,
          authorId: crypto.randomUUID(),
          rating: 5,
          title: 'Great agent!',
          content: 'This agent is fantastic and helped me a lot.',
        });

        expect(review.id).toBeDefined();
        expect(review.rating).toBe(5);
        expect(review.status).toBe('pending');
      });

      it('should create a verified review', async () => {
        const review = await marketplace.createReview({
          listingId,
          authorId: crypto.randomUUID(),
          rating: 4,
          verified: true,
        });

        expect(review.verified).toBe(true);
      });
    });

    describe('getReviews', () => {
      beforeEach(async () => {
        // Create several reviews
        for (let i = 1; i <= 5; i++) {
          await marketplace.createReview({
            listingId,
            authorId: crypto.randomUUID(),
            rating: i,
            title: `Review ${i}`,
          });
        }
      });

      it('should list reviews for listing', async () => {
        const reviews = await marketplace.getReviews(listingId);
        expect(reviews.length).toBe(5);
      });

      it('should sort by rating', async () => {
        const reviews = await marketplace.getReviews(listingId, { sortBy: 'rating' });
        expect(reviews[0].rating).toBe(5);
        expect(reviews[4].rating).toBe(1);
      });

      it('should paginate reviews', async () => {
        const page1 = await marketplace.getReviews(listingId, { limit: 2 });
        const page2 = await marketplace.getReviews(listingId, { limit: 2, offset: 2 });

        expect(page1.length).toBe(2);
        expect(page2.length).toBe(2);
      });
    });

    describe('voteReview', () => {
      it('should increment helpful votes', async () => {
        const review = await marketplace.createReview({
          listingId,
          authorId: crypto.randomUUID(),
          rating: 5,
        });

        await marketplace.voteReview(review.id, true);
        await marketplace.voteReview(review.id, true);

        const reviews = await marketplace.getReviews(listingId);
        const updated = reviews.find(r => r.id === review.id);
        expect(updated!.helpful).toBe(2);
      });

      it('should increment not helpful votes', async () => {
        const review = await marketplace.createReview({
          listingId,
          authorId: crypto.randomUUID(),
          rating: 1,
        });

        await marketplace.voteReview(review.id, false);

        const reviews = await marketplace.getReviews(listingId);
        const updated = reviews.find(r => r.id === review.id);
        expect(updated!.notHelpful).toBe(1);
      });
    });
  });

  describe('Usage Tracking', () => {
    let listingId: string;

    beforeEach(async () => {
      const listing = await marketplace.createListing({
        agentId: 'usage-test-agent',
        authorId,
        displayName: 'Usage Test',
        shortDescription: 'Testing usage tracking functionality',
        categories: ['development'],
        pricing: { type: 'per_call', priceUsd: 0.10, freeQuota: 0 },
      });
      listingId = listing.id;
    });

    it('should record usage', async () => {
      await marketplace.recordUsage(listingId, 0.10);
      await marketplace.recordUsage(listingId, 0.10);

      // Force stats update by recording many times
      for (let i = 0; i < 10; i++) {
        await marketplace.recordUsage(listingId);
      }

      const listing = await marketplace.getListing(listingId);
      expect(listing!.stats.totalUses).toBeGreaterThan(0);
    });
  });

  describe('Author Verification', () => {
    it('should request verification', async () => {
      const userId = crypto.randomUUID();
      const verification = await marketplace.requestVerification(userId, 'email');

      expect(verification.id).toBeDefined();
      expect(verification.status).toBe('pending');
      expect(verification.verificationType).toBe('email');
    });

    it('should approve verification', async () => {
      const userId = crypto.randomUUID();
      const verification = await marketplace.requestVerification(userId, 'github');

      await marketplace.approveVerification(verification.id, 365);

      const isVerified = await marketplace.isAuthorVerified(userId);
      expect(isVerified).toBe(true);
    });

    it('should not consider unverified users as verified', async () => {
      const userId = crypto.randomUUID();
      await marketplace.requestVerification(userId, 'company');

      const isVerified = await marketplace.isAuthorVerified(userId);
      expect(isVerified).toBe(false);
    });
  });

  describe('Favorites', () => {
    let listingId: string;
    let userId: string;

    beforeEach(async () => {
      const listing = await marketplace.createListing({
        agentId: 'favorites-test',
        authorId,
        displayName: 'Favorites Test',
        shortDescription: 'Testing favorites functionality',
        categories: ['development'],
        pricing: { type: 'free' },
      });
      listingId = listing.id;
      userId = crypto.randomUUID();
    });

    it('should add favorite', async () => {
      await marketplace.addFavorite(userId, listingId);

      const favorites = await marketplace.getFavorites(userId);
      expect(favorites.length).toBe(1);
      expect(favorites[0].id).toBe(listingId);
    });

    it('should remove favorite', async () => {
      await marketplace.addFavorite(userId, listingId);
      await marketplace.removeFavorite(userId, listingId);

      const favorites = await marketplace.getFavorites(userId);
      expect(favorites.length).toBe(0);
    });

    it('should not duplicate favorites', async () => {
      await marketplace.addFavorite(userId, listingId);
      await marketplace.addFavorite(userId, listingId);

      const favorites = await marketplace.getFavorites(userId);
      expect(favorites.length).toBe(1);
    });
  });

  describe('Revenue Calculation', () => {
    it('should calculate free pricing', async () => {
      const listing = await marketplace.createListing({
        agentId: 'free-agent',
        authorId,
        displayName: 'Free Agent',
        shortDescription: 'A free agent',
        categories: ['development'],
        pricing: { type: 'free' },
      });

      const revenue = marketplace.calculateRevenue(listing, {
        calls: 100,
        inputTokens: 10000,
        outputTokens: 5000,
      });

      expect(revenue).toBe(0);
    });

    it('should calculate per-call pricing', async () => {
      const listing = await marketplace.createListing({
        agentId: 'per-call-agent',
        authorId,
        displayName: 'Per Call Agent',
        shortDescription: 'A per-call agent',
        categories: ['development'],
        pricing: { type: 'per_call', priceUsd: 0.10, freeQuota: 10 },
      });

      const revenue = marketplace.calculateRevenue(listing, {
        calls: 50,
        inputTokens: 0,
        outputTokens: 0,
      });

      // 50 calls - 10 free = 40 billable * $0.10 = $4.00
      expect(revenue).toBe(4.00);
    });

    it('should calculate per-token pricing', async () => {
      const listing = await marketplace.createListing({
        agentId: 'per-token-agent',
        authorId,
        displayName: 'Per Token Agent',
        shortDescription: 'A per-token agent',
        categories: ['development'],
        pricing: {
          type: 'per_token',
          inputPricePerMillion: 3.00,
          outputPricePerMillion: 15.00,
          markup: 1.5,
        },
      });

      const revenue = marketplace.calculateRevenue(listing, {
        calls: 10,
        inputTokens: 1_000_000,
        outputTokens: 500_000,
      });

      // Input: 1M * $3/1M = $3
      // Output: 0.5M * $15/1M = $7.50
      // Total: ($3 + $7.50) * 1.5 markup = $15.75
      expect(revenue).toBeCloseTo(15.75, 2);
    });
  });

  describe('Categories', () => {
    it('should have all expected categories', () => {
      expect(CATEGORIES.length).toBeGreaterThan(0);
      expect(CATEGORIES.find(c => c.id === 'development')).toBeDefined();
      expect(CATEGORIES.find(c => c.id === 'data-analysis')).toBeDefined();
    });

    it('should have unique category IDs', () => {
      const ids = CATEGORIES.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe('Badges', () => {
    it('should have all badge types defined', () => {
      expect(BADGE_TYPES.verified).toBeDefined();
      expect(BADGE_TYPES.popular).toBeDefined();
      expect(BADGE_TYPES.trending).toBeDefined();
      expect(BADGE_TYPES.staff_pick).toBeDefined();
      expect(BADGE_TYPES.enterprise_ready).toBeDefined();
      expect(BADGE_TYPES.open_source).toBeDefined();
    });
  });
});
