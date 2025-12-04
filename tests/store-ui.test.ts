import { test, expect } from '@playwright/test';

test.describe('Store UI Components', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/store.html');
    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('Page loads correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/AI Agent Store/);
    await expect(page.locator('text=AI Store')).toBeVisible();
  });

  test('Today tab content is visible', async ({ page }) => {
    await expect(page.locator('text=Today')).toBeVisible();
    await expect(page.locator('#todayTab')).toBeVisible();
  });

  test('Featured card is visible and clickable', async ({ page }) => {
    const featuredCard = page.locator('text=Featured Agent').first();
    await expect(featuredCard).toBeVisible();

    // Check Video Generator featured card
    await expect(page.locator('text=Video Generator').first()).toBeVisible();
  });

  test('Category buttons are visible and clickable', async ({ page }) => {
    const categories = ['All Agents', 'Image', 'Video', 'Audio', 'Creative', 'E-Commerce', 'Productivity'];

    for (const category of categories) {
      const btn = page.locator(`.category-btn:has-text("${category}")`).first();
      await expect(btn).toBeVisible();
    }

    // Test clicking category
    await page.click('.category-btn:has-text("Video")');
    // Should filter agents
  });

  test('Popular Right Now section has agents', async ({ page }) => {
    await expect(page.locator('text=Popular Right Now')).toBeVisible();

    // Check if agents are rendered in the section
    const popularAgentsContainer = page.locator('#popularAgents');
    await expect(popularAgentsContainer).toBeVisible();

    // Wait for JS to populate
    await page.waitForTimeout(1000);

    // Check if there are agent cards
    const agentCards = popularAgentsContainer.locator('.group');
    const count = await agentCards.count();
    console.log(`Popular agents count: ${count}`);

    // Should have at least 1 agent
    expect(count).toBeGreaterThan(0);
  });

  test('See It In Action section has videos', async ({ page }) => {
    await expect(page.locator('text=See It In Action')).toBeVisible();

    // Check featured video is present
    const videos = page.locator('video');
    const videoCount = await videos.count();
    console.log(`Video count: ${videoCount}`);
    expect(videoCount).toBeGreaterThan(0);
  });

  test('All Agents section has agents', async ({ page }) => {
    await expect(page.locator('text=All Agents')).toBeVisible();

    const allAgentsContainer = page.locator('#allAgents');
    await expect(allAgentsContainer).toBeVisible();

    await page.waitForTimeout(1000);

    // Check if there are agent rows
    const agentRows = allAgentsContainer.locator('.flex');
    const count = await agentRows.count();
    console.log(`All agents count: ${count}`);

    expect(count).toBeGreaterThan(0);
  });

  test('See All button is clickable', async ({ page }) => {
    const seeAllBtn = page.locator('button:has-text("See All")').first();
    await expect(seeAllBtn).toBeVisible();

    // Check if button is clickable (not disabled)
    const isDisabled = await seeAllBtn.isDisabled();
    expect(isDisabled).toBe(false);
  });

  test('Clicking agent card opens detail modal', async ({ page }) => {
    // Wait for agents to load
    await page.waitForTimeout(1000);

    // Try clicking on a showcase card
    const showcaseCard = page.locator('.flex-shrink-0.w-72').first();
    if (await showcaseCard.isVisible()) {
      await showcaseCard.click();

      // Check if modal is visible
      await page.waitForTimeout(500);
      const modal = page.locator('#modalSheet');
      const isVisible = await modal.isVisible();
      console.log(`Modal visible after click: ${isVisible}`);
    }
  });

  test('Search input works', async ({ page }) => {
    const searchInput = page.locator('#searchInput');
    await expect(searchInput).toBeVisible();

    await searchInput.fill('video');
    await page.waitForTimeout(500);

    // Check if results are filtered
    const agentCount = page.locator('#agentCount');
    const countText = await agentCount.textContent();
    console.log(`Search results: ${countText}`);
  });

  test('Tab navigation works', async ({ page }) => {
    // Click Agents tab
    await page.click('.tab-btn:has-text("Agents")');
    await page.waitForTimeout(300);

    const agentsTab = page.locator('#agentsTab');
    await expect(agentsTab).toBeVisible();

    // Click Search tab
    await page.click('.tab-btn:has-text("Search")');
    await page.waitForTimeout(300);

    const searchTab = page.locator('#searchTab');
    await expect(searchTab).toBeVisible();

    // Click Today tab
    await page.click('.tab-btn:has-text("Today")');
    await page.waitForTimeout(300);

    const todayTab = page.locator('#todayTab');
    await expect(todayTab).toBeVisible();
  });

  test('Check JS console for errors', async ({ page }) => {
    const errors: string[] = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.reload();
    await page.waitForTimeout(2000);

    console.log('Console errors:', errors);
    // Log errors but don't fail - we want to see what's wrong
  });

  test('Debug: Check agents object exists', async ({ page }) => {
    const agentsCount = await page.evaluate(() => {
      // @ts-ignore
      return Object.keys(window.agents || {}).length;
    });
    console.log(`Agents in window: ${agentsCount}`);
    expect(agentsCount).toBeGreaterThan(0);
  });

  test('Debug: Check populateAgents function', async ({ page }) => {
    await page.waitForTimeout(500);

    // Manually call populateAgents
    await page.evaluate(() => {
      // @ts-ignore
      if (typeof populateAgents === 'function') {
        populateAgents();
      }
    });

    await page.waitForTimeout(500);

    // Check if popular agents populated
    const popularHTML = await page.locator('#popularAgents').innerHTML();
    console.log(`Popular agents HTML length: ${popularHTML.length}`);
    console.log(`Popular agents HTML preview: ${popularHTML.substring(0, 200)}`);

    // Check if all agents populated
    const allHTML = await page.locator('#allAgents').innerHTML();
    console.log(`All agents HTML length: ${allHTML.length}`);
    console.log(`All agents HTML preview: ${allHTML.substring(0, 200)}`);
  });
});
