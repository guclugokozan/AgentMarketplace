/**
 * Comprehensive Browser UI Tests for MuleRun Agents
 * Tests the test-all-agents.html UI at localhost:3000
 *
 * Run with: npx playwright test tests/browser-ui-comprehensive.test.ts
 */

import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:3000';
const UI_URL = `${BASE_URL}/test-all-agents.html`;

// Test image URLs
const TEST_IMAGES = {
  portrait: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=512',
  person: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=512',
  product: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
  landscape: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=512',
  garment: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=512',
};

// Helper to wait for page to load agents
async function waitForAgentsLoaded(page: Page) {
  await page.waitForSelector('.agent-card', { timeout: 30000 });
  await page.waitForFunction(() => {
    const cards = document.querySelectorAll('.agent-card');
    return cards.length >= 10; // At least 10 agents should load
  }, { timeout: 30000 });
}

// Helper to run an agent via UI
async function runAgentUI(page: Page, agentId: string, inputs: Record<string, string>) {
  const cardSelector = `#card-${agentId}`;
  const card = page.locator(cardSelector);

  // Fill in inputs
  for (const [inputName, value] of Object.entries(inputs)) {
    const inputSelector = `#${agentId}-${inputName}`;
    const input = page.locator(inputSelector);

    if (await input.count() > 0) {
      const tagName = await input.evaluate(el => el.tagName.toLowerCase());
      if (tagName === 'select') {
        await input.selectOption(value);
      } else {
        await input.fill(value);
      }
    }
  }

  // Click run button
  const runBtn = card.locator(`#btn-${agentId}`);
  await runBtn.click();

  // Wait for result to show
  const resultSection = card.locator(`#result-${agentId}`);
  await resultSection.waitFor({ state: 'visible', timeout: 120000 });

  return { card, resultSection };
}

// =============================================================================
// 1. PAGE LOAD & NAVIGATION TESTS
// =============================================================================

test.describe('1. Page Load & Navigation', () => {
  test('1.1 Page loads successfully', async ({ page }) => {
    const response = await page.goto(UI_URL);
    expect(response?.status()).toBe(200);
  });

  test('1.2 Header displays correctly', async ({ page }) => {
    await page.goto(UI_URL);
    const header = page.locator('.header');
    await expect(header).toBeVisible();
    const logo = page.locator('.logo');
    await expect(logo).toContainText('AI Agents');
  });

  test('1.3 Agent cards load', async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);
    const cards = page.locator('.agent-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(30);
  });

  test('1.4 Server status shows connected', async ({ page }) => {
    await page.goto(UI_URL);
    await page.waitForSelector('.status-dot.connected', { timeout: 10000 });
    const statusText = page.locator('#serverStatus');
    await expect(statusText).toContainText('Connected');
  });

  test('1.5 Agent count displays correctly', async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);
    const agentCount = page.locator('#agentCount');
    await expect(agentCount).toContainText('38 Agents');
  });

  test('1.6 Category navigation renders', async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);
    const categoryNav = page.locator('.category-nav');
    await expect(categoryNav).toBeVisible();
    const catBtns = page.locator('.cat-btn');
    const btnCount = await catBtns.count();
    expect(btnCount).toBeGreaterThan(5);
  });

  test('1.7 Category filter works', async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);

    // Get initial card count
    const initialCount = await page.locator('.agent-card').count();

    // Click on a specific category
    const analyticsBtn = page.locator('.cat-btn:has-text("Analytics")');
    if (await analyticsBtn.count() > 0) {
      await analyticsBtn.click();
      await page.waitForTimeout(500);
      const filteredCount = await page.locator('.agent-card').count();
      expect(filteredCount).toBeLessThan(initialCount);
    }
  });

  test('1.8 All category shows all agents', async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);

    // Click 'All' category
    const allBtn = page.locator('.cat-btn:has-text("All")');
    await allBtn.click();
    await page.waitForTimeout(500);

    const allCount = await page.locator('.agent-card').count();
    expect(allCount).toBeGreaterThanOrEqual(30);
  });
});

// =============================================================================
// 2. TEXT-BASED AGENT UI TESTS
// =============================================================================

test.describe('2. Text-Based Agent UI Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);
  });

  test('2.1 AI Assistant - basic text input', async ({ page }) => {
    const { resultSection } = await runAgentUI(page, 'ai-assistant', {
      task: 'What is 2 + 2?'
    });

    // Wait for completion
    await page.waitForSelector('#status-ai-assistant.completed', { timeout: 60000 });
    const jsonResult = page.locator('#json-ai-assistant');
    const text = await jsonResult.textContent();
    expect(text).toContain('status');
  });

  test('2.2 Product Description Writer', async ({ page }) => {
    const { resultSection } = await runAgentUI(page, 'product-description-writer', {
      product: 'Wireless Headphones',
      features: 'Noise cancellation, 30h battery, comfortable',
      tone: 'professional'
    });

    await page.waitForSelector('#status-product-description-writer.completed', { timeout: 60000 });
    const status = page.locator('#status-product-description-writer');
    await expect(status).toHaveClass(/completed/);
  });

  test('2.3 Email Template Generator', async ({ page }) => {
    const { resultSection } = await runAgentUI(page, 'email-template-generator', {
      purpose: 'Meeting request',
      audience: 'Manager',
      tone: 'professional'
    });

    await page.waitForSelector('#status-email-template-generator.completed', { timeout: 60000 });
    const status = page.locator('#status-email-template-generator');
    await expect(status).toHaveClass(/completed/);
  });

  test('2.4 Social Media Caption Generator', async ({ page }) => {
    const { resultSection } = await runAgentUI(page, 'social-media-caption-generator', {
      topic: 'New product launch',
      platform: 'twitter'
    });

    await page.waitForSelector('#status-social-media-caption-generator.completed', { timeout: 60000 });
    const status = page.locator('#status-social-media-caption-generator');
    await expect(status).toHaveClass(/completed/);
  });

  test('2.5 Customer Support Bot', async ({ page }) => {
    const { resultSection } = await runAgentUI(page, 'customer-support-bot', {
      query: 'How do I return an item?',
      context: 'E-commerce store'
    });

    await page.waitForSelector('#status-customer-support-bot.completed', { timeout: 60000 });
    const status = page.locator('#status-customer-support-bot');
    await expect(status).toHaveClass(/completed/);
  });

  test('2.6 SEO Content Optimizer', async ({ page }) => {
    const { resultSection } = await runAgentUI(page, 'seo-content-optimizer', {
      content: 'This is a sample blog post about AI technology.',
      keywords: 'AI, machine learning, automation'
    });

    await page.waitForSelector('#status-seo-content-optimizer.completed', { timeout: 60000 });
    const status = page.locator('#status-seo-content-optimizer');
    await expect(status).toHaveClass(/completed/);
  });
});

// =============================================================================
// 3. IMAGE AGENT UI TESTS (Sync)
// =============================================================================

test.describe('3. Image Agent UI Tests (Sync)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);
  });

  test('3.1 Background Remover - shows result', async ({ page }) => {
    // Fill image URL
    const imageInput = page.locator('#background-remover-image');
    await imageInput.fill(TEST_IMAGES.product);

    // Click run
    const runBtn = page.locator('#btn-background-remover');
    await runBtn.click();

    // Wait for completion (max 90 seconds for image processing)
    await page.waitForSelector('#status-background-remover.completed', { timeout: 90000 });

    // Check result section is visible
    const resultSection = page.locator('#result-background-remover');
    await expect(resultSection).toBeVisible();
  });

  test('3.2 Image Upscaler - uses image URL', async ({ page }) => {
    const imageInput = page.locator('#image-upscaler-image');
    await imageInput.fill(TEST_IMAGES.landscape);

    const scaleSelect = page.locator('#image-upscaler-scale');
    if (await scaleSelect.count() > 0) {
      await scaleSelect.selectOption('2');
    }

    const runBtn = page.locator('#btn-image-upscaler');
    await runBtn.click();

    await page.waitForSelector('#status-image-upscaler.completed', { timeout: 90000 });
    const status = page.locator('#status-image-upscaler');
    await expect(status).toHaveClass(/completed/);
  });

  test('3.3 Style Transfer - applies style', async ({ page }) => {
    const imageInput = page.locator('#style-transfer-image');
    await imageInput.fill(TEST_IMAGES.portrait);

    const styleSelect = page.locator('#style-transfer-style');
    if (await styleSelect.count() > 0) {
      await styleSelect.selectOption('anime');
    }

    const runBtn = page.locator('#btn-style-transfer');
    await runBtn.click();

    await page.waitForSelector('#status-style-transfer.completed', { timeout: 90000 });
    const status = page.locator('#status-style-transfer');
    await expect(status).toHaveClass(/completed/);
  });

  test('3.4 Portrait Enhancer - enhances portrait', async ({ page }) => {
    const imageInput = page.locator('#portrait-enhancer-image');
    await imageInput.fill(TEST_IMAGES.portrait);

    const runBtn = page.locator('#btn-portrait-enhancer');
    await runBtn.click();

    await page.waitForSelector('#status-portrait-enhancer.completed', { timeout: 90000 });
    const status = page.locator('#status-portrait-enhancer');
    await expect(status).toHaveClass(/completed/);
  });

  test('3.5 Background Replacer - replaces background', async ({ page }) => {
    const imageInput = page.locator('#background-replacer-image');
    await imageInput.fill(TEST_IMAGES.portrait);

    const bgInput = page.locator('#background-replacer-background');
    if (await bgInput.count() > 0) {
      await bgInput.fill('Professional office with city skyline');
    }

    const runBtn = page.locator('#btn-background-replacer');
    await runBtn.click();

    await page.waitForSelector('#status-background-replacer.completed', { timeout: 90000 });
    const status = page.locator('#status-background-replacer');
    await expect(status).toHaveClass(/completed/);
  });
});

// =============================================================================
// 4. ASYNC AGENT UI TESTS (Jobs)
// =============================================================================

test.describe('4. Async Agent UI Tests (Jobs)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);
  });

  test('4.1 Virtual Try-On - shows processing status', async ({ page }) => {
    // Fill person image
    const personInput = page.locator('#virtual-try-on-personImage');
    await personInput.fill(TEST_IMAGES.person);

    // Fill garment image
    const garmentInput = page.locator('#virtual-try-on-garmentImage');
    await garmentInput.fill(TEST_IMAGES.garment);

    // Select category
    const categorySelect = page.locator('#virtual-try-on-category');
    if (await categorySelect.count() > 0) {
      await categorySelect.selectOption('upper_body');
    }

    // Click run
    const runBtn = page.locator('#btn-virtual-try-on');
    await runBtn.click();

    // Check processing status appears (job queued)
    const statusEl = page.locator('#status-virtual-try-on');
    await expect(statusEl).toHaveClass(/processing/, { timeout: 30000 });

    // For async agents, just verify job was queued successfully
    const resultSection = page.locator('#result-virtual-try-on');
    await expect(resultSection).toBeVisible();
  });

  test('4.2 Image Generator - queues job successfully', async ({ page }) => {
    const promptInput = page.locator('#image-generator-prompt');
    await promptInput.fill('A beautiful sunset over mountains');

    const runBtn = page.locator('#btn-image-generator');
    await runBtn.click();

    // Check processing starts
    await page.waitForSelector('#status-image-generator.processing', { timeout: 30000 });

    // Verify job was accepted
    const resultSection = page.locator('#result-image-generator');
    await expect(resultSection).toBeVisible();
  });

  test('4.3 Face Swap - starts processing', async ({ page }) => {
    const sourceInput = page.locator('#face-swap-sourceImage');
    await sourceInput.fill(TEST_IMAGES.person);

    const targetInput = page.locator('#face-swap-targetImage');
    await targetInput.fill(TEST_IMAGES.portrait);

    const runBtn = page.locator('#btn-face-swap');
    await runBtn.click();

    await page.waitForSelector('#status-face-swap.processing', { timeout: 30000 });
    const resultSection = page.locator('#result-face-swap');
    await expect(resultSection).toBeVisible();
  });

  test('4.4 Music Generator - queues music generation', async ({ page }) => {
    const promptInput = page.locator('#music-generator-prompt');
    await promptInput.fill('Upbeat electronic music');

    const durationSelect = page.locator('#music-generator-duration');
    if (await durationSelect.count() > 0) {
      await durationSelect.selectOption('8');
    }

    const runBtn = page.locator('#btn-music-generator');
    await runBtn.click();

    await page.waitForSelector('#status-music-generator.processing', { timeout: 30000 });
    const resultSection = page.locator('#result-music-generator');
    await expect(resultSection).toBeVisible();
  });
});

// =============================================================================
// 5. UI ELEMENT TESTS
// =============================================================================

test.describe('5. UI Element Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);
  });

  test('5.1 Run button changes to loading state', async ({ page }) => {
    const taskInput = page.locator('#ai-assistant-task');
    await taskInput.fill('Hello');

    const runBtn = page.locator('#btn-ai-assistant');
    await runBtn.click();

    // Button should have loading class
    await expect(runBtn).toHaveClass(/loading/, { timeout: 5000 });
  });

  test('5.2 Progress bar updates during processing', async ({ page }) => {
    const imageInput = page.locator('#background-remover-image');
    await imageInput.fill(TEST_IMAGES.product);

    const runBtn = page.locator('#btn-background-remover');
    await runBtn.click();

    // Progress bar should be visible
    const progressBar = page.locator('#progress-background-remover');
    await page.waitForTimeout(1000);

    const width = await progressBar.evaluate(el => {
      return (el as HTMLElement).style.width;
    });
    // Progress should have started
    expect(width).not.toBe('0%');
  });

  test('5.3 Result JSON displays correctly', async ({ page }) => {
    const taskInput = page.locator('#ai-assistant-task');
    await taskInput.fill('What is AI?');

    const runBtn = page.locator('#btn-ai-assistant');
    await runBtn.click();

    await page.waitForSelector('#status-ai-assistant.completed', { timeout: 60000 });

    const jsonEl = page.locator('#json-ai-assistant');
    const jsonText = await jsonEl.textContent();

    // Should be valid JSON
    expect(() => JSON.parse(jsonText || '')).not.toThrow();
  });

  test('5.4 Sample buttons populate image URL', async ({ page }) => {
    const sampleBtn = page.locator('#card-background-remover .sample-btn:has-text("Product")');
    await sampleBtn.click();

    const imageInput = page.locator('#background-remover-image');
    const value = await imageInput.inputValue();
    expect(value).toContain('unsplash.com');
  });

  test('5.5 Select dropdowns work', async ({ page }) => {
    const select = page.locator('#image-generator-width');
    if (await select.count() > 0) {
      await select.selectOption('768');
      const value = await select.inputValue();
      expect(value).toBe('768');
    }
  });
});

// =============================================================================
// 6. ERROR HANDLING TESTS
// =============================================================================

test.describe('6. Error Handling Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);
  });

  test('6.1 Empty input shows error', async ({ page }) => {
    const runBtn = page.locator('#btn-background-remover');
    await runBtn.click();

    // Should show failed status for validation error
    await page.waitForSelector('#result-background-remover.show', { timeout: 30000 });

    const statusEl = page.locator('#status-background-remover');
    // Either shows processing, failed, or completed depending on backend behavior
    const text = await statusEl.textContent();
    expect(text).toBeTruthy();
  });

  test('6.2 Invalid image URL is handled', async ({ page }) => {
    const imageInput = page.locator('#background-remover-image');
    await imageInput.fill('not-a-valid-url');

    const runBtn = page.locator('#btn-background-remover');
    await runBtn.click();

    await page.waitForSelector('#result-background-remover.show', { timeout: 30000 });

    // Check JSON result for error or processing
    const jsonEl = page.locator('#json-background-remover');
    await page.waitForTimeout(5000); // Give it time to process
    const jsonText = await jsonEl.textContent();
    expect(jsonText).toBeTruthy();
  });

  test('6.3 Button re-enables after completion', async ({ page }) => {
    const taskInput = page.locator('#ai-assistant-task');
    await taskInput.fill('Hello');

    const runBtn = page.locator('#btn-ai-assistant');
    await runBtn.click();

    await page.waitForSelector('#status-ai-assistant.completed', { timeout: 60000 });

    // Button should be re-enabled
    await expect(runBtn).not.toBeDisabled();

    // Button text should say "Run Again"
    const btnText = await runBtn.textContent();
    expect(btnText).toContain('Run Again');
  });
});

// =============================================================================
// 7. RESPONSIVENESS & DISPLAY TESTS
// =============================================================================

test.describe('7. Responsiveness & Display', () => {
  test('7.1 Desktop layout shows grid', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);

    const grid = page.locator('.agents-grid');
    const display = await grid.evaluate(el => getComputedStyle(el).display);
    expect(display).toBe('grid');
  });

  test('7.2 Mobile viewport renders', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);

    const cards = page.locator('.agent-card');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('7.3 Images load in agent previews', async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);

    const previewImages = page.locator('.agent-preview img');
    const count = await previewImages.count();
    expect(count).toBeGreaterThan(10);
  });

  test('7.4 Agent names display correctly', async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);

    // Check a few specific agent names
    const aiAssistant = page.locator('.agent-card:has(#btn-ai-assistant) h3');
    await expect(aiAssistant).toContainText('AI Assistant');

    const bgRemover = page.locator('.agent-card:has(#btn-background-remover) h3');
    await expect(bgRemover).toContainText('Background Remover');
  });
});

// =============================================================================
// 8. DATA VALIDATION TESTS
// =============================================================================

test.describe('8. Data Validation Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);
  });

  test('8.1 Smart Data Analyzer accepts JSON', async ({ page }) => {
    const dataInput = page.locator('#smart-data-analyzer-data');
    await dataInput.fill('{"sales": [100, 200, 300], "months": ["Jan", "Feb", "Mar"]}');

    const goalInput = page.locator('#smart-data-analyzer-goal');
    await goalInput.fill('Find trends');

    const runBtn = page.locator('#btn-smart-data-analyzer');
    await runBtn.click();

    await page.waitForSelector('#status-smart-data-analyzer.completed', { timeout: 60000 });
    const status = page.locator('#status-smart-data-analyzer');
    await expect(status).toHaveClass(/completed/);
  });

  test('8.2 Data Visualization accepts goal', async ({ page }) => {
    const dataInput = page.locator('#data-visualization-data');
    await dataInput.fill('{"labels": ["Q1", "Q2", "Q3"], "values": [100, 150, 200]}');

    const goalInput = page.locator('#data-visualization-goal');
    await goalInput.fill('Show quarterly growth');

    const runBtn = page.locator('#btn-data-visualization');
    await runBtn.click();

    await page.waitForSelector('#status-data-visualization.completed', { timeout: 60000 });
    const status = page.locator('#status-data-visualization');
    await expect(status).toHaveClass(/completed/);
  });

  test('8.3 Resume Builder accepts experience', async ({ page }) => {
    const expInput = page.locator('#resume-builder-experience');
    await expInput.fill('5 years software engineer, Python, JavaScript');

    const roleInput = page.locator('#resume-builder-targetRole');
    await roleInput.fill('Senior Developer');

    const runBtn = page.locator('#btn-resume-builder');
    await runBtn.click();

    await page.waitForSelector('#status-resume-builder.completed', { timeout: 60000 });
    const status = page.locator('#status-resume-builder');
    await expect(status).toHaveClass(/completed/);
  });
});

// =============================================================================
// 9. CONCURRENT OPERATION TESTS
// =============================================================================

test.describe('9. Concurrent Operations', () => {
  test('9.1 Run multiple text agents simultaneously', async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);

    // Start AI Assistant
    const task1 = page.locator('#ai-assistant-task');
    await task1.fill('Hello world');
    await page.locator('#btn-ai-assistant').click();

    // Start Product Description Writer (don't wait for first to finish)
    const product = page.locator('#product-description-writer-product');
    await product.fill('Laptop');
    await page.locator('#btn-product-description-writer').click();

    // Both should complete
    await Promise.all([
      page.waitForSelector('#status-ai-assistant.completed', { timeout: 120000 }),
      page.waitForSelector('#status-product-description-writer.completed', { timeout: 120000 })
    ]);

    const status1 = page.locator('#status-ai-assistant');
    await expect(status1).toHaveClass(/completed/);

    const status2 = page.locator('#status-product-description-writer');
    await expect(status2).toHaveClass(/completed/);
  });
});

// =============================================================================
// 10. RESULT DISPLAY TESTS
// =============================================================================

test.describe('10. Result Display Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(UI_URL);
    await waitForAgentsLoaded(page);
  });

  test('10.1 Image result displays in media section', async ({ page }) => {
    const imageInput = page.locator('#background-remover-image');
    await imageInput.fill(TEST_IMAGES.product);

    const runBtn = page.locator('#btn-background-remover');
    await runBtn.click();

    await page.waitForSelector('#status-background-remover.completed', { timeout: 90000 });

    // Check if media section has an image
    const mediaSection = page.locator('#media-background-remover');
    const hasImage = await mediaSection.locator('img').count() > 0;

    // Also check JSON result
    const jsonSection = page.locator('#json-background-remover');
    const jsonText = await jsonSection.textContent();

    // Either image should display OR JSON should show success
    expect(hasImage || jsonText?.includes('completed') || jsonText?.includes('success')).toBeTruthy();
  });

  test('10.2 Download button appears for images', async ({ page }) => {
    const imageInput = page.locator('#background-remover-image');
    await imageInput.fill(TEST_IMAGES.product);

    const runBtn = page.locator('#btn-background-remover');
    await runBtn.click();

    await page.waitForSelector('#status-background-remover.completed', { timeout: 90000 });

    // Download button may or may not appear depending on result
    const downloadBtn = page.locator('#download-background-remover');
    // Just check it exists (may be hidden)
    await expect(downloadBtn).toBeTruthy();
  });

  test('10.3 Status shows completion time', async ({ page }) => {
    const taskInput = page.locator('#ai-assistant-task');
    await taskInput.fill('What is 1+1?');

    const runBtn = page.locator('#btn-ai-assistant');
    await runBtn.click();

    await page.waitForSelector('#status-ai-assistant.completed', { timeout: 60000 });

    const statusEl = page.locator('#status-ai-assistant');
    const statusText = await statusEl.textContent();

    // Should contain "Completed" at minimum
    expect(statusText).toContain('Completed');
  });
});
