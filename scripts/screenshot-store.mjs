import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

await page.goto('http://localhost:3000/store.html');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

// Take full page screenshot
await page.screenshot({ path: 'store-screenshot.png', fullPage: true });
console.log('Full page screenshot saved to store-screenshot.png');

// Check if elements are visible
const popularVisible = await page.locator('#popularAgents').isVisible();
console.log('Popular agents container visible:', popularVisible);

const allVisible = await page.locator('#allAgents').isVisible();
console.log('All agents container visible:', allVisible);

// Get computed styles of popular agents container
const popularStyles = await page.evaluate(() => {
  const el = document.getElementById('popularAgents');
  if (!el) return null;
  const style = window.getComputedStyle(el);
  return {
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    height: el.offsetHeight,
    childCount: el.children.length
  };
});
console.log('Popular agents styles:', popularStyles);

// Get first agent card visibility
const firstCard = page.locator('#popularAgents > div').first();
const firstCardVisible = await firstCard.isVisible().catch(() => false);
console.log('First agent card visible:', firstCardVisible);

// Get first card computed box
const firstCardBox = await firstCard.boundingBox().catch(() => null);
console.log('First agent card bounding box:', firstCardBox);

// Check container parent
const popularParentStyles = await page.evaluate(() => {
  const el = document.getElementById('popularAgents');
  if (!el || !el.parentElement) return null;
  const parent = el.parentElement;
  const style = window.getComputedStyle(parent);
  return {
    display: style.display,
    visibility: style.visibility,
    overflow: style.overflow,
    height: parent.offsetHeight
  };
});
console.log('Popular section parent styles:', popularParentStyles);

await browser.close();
