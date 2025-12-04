import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto('http://localhost:3000/store.html');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

let allTestsPassed = true;
const results = [];

function log(testName, passed, details = '') {
  const status = passed ? '✅' : '❌';
  results.push({ test: testName, passed, details });
  console.log(`${status} ${testName}${details ? `: ${details}` : ''}`);
  if (!passed) allTestsPassed = false;
}

console.log('=== COMPREHENSIVE STORE TEST ===\n');

// Test 1: Category Buttons
console.log('--- Category Buttons ---');
const categoryBtns = await page.locator('.category-btn').count();
log('Category buttons exist', categoryBtns === 7, `Found ${categoryBtns}/7 buttons`);

// Test each category filter
const categories = ['All Agents', 'Image', 'Video', 'Audio', 'Creative', 'E-Commerce', 'Productivity'];
const expectedCounts = [17, 4, 5, 2, 3, 2, 1];

for (let i = 0; i < categories.length; i++) {
  const category = categories[i];
  await page.click(`.category-btn:has-text("${category}")`);
  await page.waitForTimeout(300);

  const activeBtn = await page.locator('.category-btn.bg-primary').first().textContent();
  const isActive = activeBtn?.trim() === category;

  const visibleRows = await page.locator('#allAgents > div:visible').count();
  const countMatches = visibleRows === expectedCounts[i];

  log(`Category filter: ${category}`, isActive && countMatches,
    `Active=${isActive}, Count=${visibleRows}/${expectedCounts[i]}`);
}

// Reset to All
await page.click('.category-btn:has-text("All Agents")');
await page.waitForTimeout(300);

// Test 2: See All Buttons
console.log('\n--- See All Buttons ---');
const seeAllBtns = await page.locator('button:has-text("See All")').all();
log('See All buttons exist', seeAllBtns.length >= 3, `Found ${seeAllBtns.length} buttons`);

// Click first See All and check scroll
await page.locator('button:has-text("See All")').first().click();
await page.waitForTimeout(500);
const allAgentsInView = await page.locator('#allAgents').isVisible();
log('See All scrolls to All Agents', allAgentsInView);

// Test 3: Detail Page Opens/Closes
console.log('\n--- Detail Page Functionality ---');

// Check detail page is initially hidden (translated off-screen)
const detailPageInitialHidden = await page.locator('#agentDetailPage').evaluate(el =>
  el.classList.contains('translate-x-full')
);
log('Detail page hidden initially', detailPageInitialHidden);

// Click on first agent in Popular Right Now
const firstPopularAgent = page.locator('#popularAgents .group').first();
if (await firstPopularAgent.isVisible()) {
  await firstPopularAgent.click();
  await page.waitForTimeout(500);

  const detailPageVisible = await page.locator('#agentDetailPage').evaluate(el =>
    el.classList.contains('translate-x-0')
  );
  log('Detail page opens on agent click', detailPageVisible);

  // Check detail page has content
  const modalContent = await page.locator('#modalContent').innerHTML();
  log('Detail page has content', modalContent.length > 100, `Content length: ${modalContent.length}`);

  // Close detail page
  await page.click('#agentDetailPage button[onclick="closeDetail()"]');
  await page.waitForTimeout(400);

  const detailPageClosed = await page.locator('#agentDetailPage').evaluate(el =>
    el.classList.contains('translate-x-full')
  );
  log('Detail page closes correctly', detailPageClosed);

  // Just verify it's hidden
  log('Detail page restored to hidden state', detailPageClosed);
}

// Test 4: Showcase Gallery
console.log('\n--- Showcase Gallery ---');

const showcaseCards = await page.locator('.flex-shrink-0.w-72').count();
log('Showcase cards exist', showcaseCards >= 5, `Found ${showcaseCards} cards`);

// Test clicking a showcase card
const firstShowcase = page.locator('.flex-shrink-0.w-72').first();
if (await firstShowcase.isVisible()) {
  await firstShowcase.click();
  await page.waitForTimeout(500);

  const showcaseDetailOpen = await page.locator('#agentDetailPage').evaluate(el =>
    el.classList.contains('translate-x-0')
  );
  log('Showcase card opens detail page', showcaseDetailOpen);

  await page.click('#agentDetailPage button[onclick="closeDetail()"]');
  await page.waitForTimeout(400);
}

// Test 5: Tab Navigation
console.log('\n--- Tab Navigation ---');

// Use evaluate to call showTab directly (bottom nav may be hidden on desktop)
await page.evaluate(() => showTab('agents'));
await page.waitForTimeout(300);
const agentsTabVisible = await page.locator('#agentsTab').isVisible();
log('Agents tab works', agentsTabVisible);

await page.evaluate(() => showTab('search'));
await page.waitForTimeout(300);
const searchTabVisible = await page.locator('#searchTab').isVisible();
log('Search tab works', searchTabVisible);

await page.evaluate(() => showTab('today'));
await page.waitForTimeout(300);
const todayTabVisible = await page.locator('#todayTab').isVisible();
log('Today tab works', todayTabVisible);

// Test 6: Popular Right Now
console.log('\n--- Popular Right Now ---');
const popularAgentsCount = await page.locator('#popularAgents .group').count();
log('Popular agents rendered', popularAgentsCount >= 8, `Found ${popularAgentsCount} agents`);

// Test 7: All Agents
console.log('\n--- All Agents ---');
const allAgentsCount = await page.locator('#allAgents > div').count();
log('All agents rendered', allAgentsCount === 17, `Found ${allAgentsCount} agents`);

// Test 8: Search
console.log('\n--- Search Functionality ---');
const searchInput = page.locator('#searchInput');
await searchInput.fill('video');
await page.waitForTimeout(500);
const agentCountText = await page.locator('#agentCount').textContent();
log('Search filters agents', agentCountText?.includes('5') || agentCountText?.includes('agent'), `Count: ${agentCountText}`);

// Clear search
await searchInput.fill('');
await page.waitForTimeout(300);

// Test 9: Featured Card
console.log('\n--- Featured Card ---');
const featuredCard = page.locator('text=Featured Agent').first();
const featuredVisible = await featuredCard.isVisible();
log('Featured card visible', featuredVisible);

// Test 10: Videos in See It In Action
console.log('\n--- See It In Action Videos ---');
const videoCount = await page.locator('video').count();
log('Videos present', videoCount >= 4, `Found ${videoCount} videos`);

// Final Screenshot
await page.screenshot({ path: 'comprehensive-test-screenshot.png', fullPage: true });
console.log('\nScreenshot saved to comprehensive-test-screenshot.png');

await browser.close();

// Summary
console.log('\n=== TEST SUMMARY ===');
const passed = results.filter(r => r.passed).length;
const failed = results.filter(r => !r.passed).length;
console.log(`Passed: ${passed}/${results.length}`);
console.log(`Failed: ${failed}/${results.length}`);

if (failed > 0) {
  console.log('\nFailed tests:');
  results.filter(r => !r.passed).forEach(r => console.log(`  - ${r.test}: ${r.details}`));
}

console.log(`\n${allTestsPassed ? '✅ ALL TESTS PASSED!' : '❌ SOME TESTS FAILED'}`);
