import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto('http://localhost:3000/store.html');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

console.log('=== Testing Category Buttons ===');

// Get all category buttons
const categoryBtns = await page.locator('.category-btn').all();
console.log('Category buttons found:', categoryBtns.length);

for (const btn of categoryBtns) {
  const text = await btn.textContent();
  const hasOnclick = await btn.evaluate(el => {
    return el.hasAttribute('onclick') || typeof el.onclick === 'function';
  });
  console.log('Button:', text?.trim(), '| Has onclick:', hasOnclick);
}

// Test clicking each category
const categories = ['All Agents', 'Image', 'Video', 'Audio', 'Creative', 'E-Commerce', 'Productivity'];

console.log('\n=== Testing Category Filtering ===');

for (const category of categories) {
  await page.click(`.category-btn:has-text("${category}")`);
  await page.waitForTimeout(300);

  // Check active button
  const activeBtn = await page.locator('.category-btn.bg-primary').first().textContent().catch(() => 'none');

  // Count visible agent rows
  const agentRows = await page.locator('#allAgents > div').all();
  let visibleCount = 0;
  for (const row of agentRows) {
    const isVisible = await row.isVisible();
    if (isVisible) visibleCount++;
  }

  console.log(`Category: ${category} | Active: ${activeBtn?.trim()} | Visible agents: ${visibleCount}`);
}

// Test See All buttons
console.log('\n=== Testing See All Buttons ===');
const seeAllBtns = await page.locator('button:has-text("See All")').all();
console.log('See All buttons found:', seeAllBtns.length);

for (let i = 0; i < seeAllBtns.length; i++) {
  const btn = seeAllBtns[i];
  const hasOnclick = await btn.evaluate(el => el.hasAttribute('onclick'));
  const onclickValue = await btn.getAttribute('onclick');
  console.log(`See All button ${i + 1}: onclick="${onclickValue}"`);
}

// Test clicking on Popular Right Now See All
console.log('\n=== Testing See All Click ===');
await page.locator('button:has-text("See All")').first().click();
await page.waitForTimeout(500);

// Check if scrolled to All Agents
const allAgentsVisible = await page.locator('#allAgents').isVisible();
console.log('All Agents visible after See All click:', allAgentsVisible);

// Take screenshot
await page.screenshot({ path: 'category-test-screenshot.png', fullPage: true });
console.log('\nScreenshot saved to category-test-screenshot.png');

await browser.close();
console.log('\nTest complete!');
