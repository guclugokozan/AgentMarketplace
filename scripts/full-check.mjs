import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 2000 } });

await page.goto('http://localhost:3000/store.html');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(3000);

// Take full page screenshot with much larger viewport
await page.screenshot({ path: 'store-full.png', fullPage: true });

// Get exact positions
const positions = await page.evaluate(() => {
  const getPos = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { top: rect.top, height: rect.height, childCount: el.children?.length || 0 };
  };

  return {
    popularSection: getPos('#popularAgents'),
    allAgentsSection: getPos('#allAgents'),
    todayTab: getPos('#todayTab')
  };
});

console.log('Element positions:', JSON.stringify(positions, null, 2));

// Get the HTML structure to understand layout
const structure = await page.evaluate(() => {
  const todayTab = document.getElementById('todayTab');
  if (!todayTab) return 'No todayTab found';

  const children = Array.from(todayTab.children).map(child => ({
    tag: child.tagName,
    id: child.id,
    className: child.className?.substring(0, 50),
    height: child.offsetHeight,
    childCount: child.children?.length || 0
  }));

  return children;
});

console.log('\nTodayTab structure:');
console.log(JSON.stringify(structure, null, 2));

// Check if popular section has the grid class
const popularClasses = await page.locator('#popularAgents').getAttribute('class');
console.log('\nPopularAgents classes:', popularClasses);

// Get actual card count and their visibility
const cardInfo = await page.evaluate(() => {
  const cards = document.querySelectorAll('#popularAgents > div');
  return Array.from(cards).map(card => {
    const rect = card.getBoundingClientRect();
    const style = window.getComputedStyle(card);
    return {
      top: rect.top,
      height: rect.height,
      display: style.display,
      visibility: style.visibility,
      opacity: style.opacity
    };
  });
});

console.log('\nPopular agent cards info:');
cardInfo.forEach((c, i) => console.log(`Card ${i+1}: top=${c.top}, height=${c.height}, display=${c.display}`));

await browser.close();
