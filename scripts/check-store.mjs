import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const errors = [];
const logs = [];

page.on('console', msg => {
  if (msg.type() === 'error') {
    errors.push(msg.text());
  } else {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  }
});

page.on('pageerror', err => {
  errors.push(`Page Error: ${err.message}`);
});

await page.goto('http://localhost:3000/store.html');
await page.waitForLoadState('networkidle');
await page.waitForTimeout(2000);

// Check agent count
const agentCount = await page.evaluate(() => {
  return Object.keys(window.agents || {}).length;
});
console.log('Agents count:', agentCount);

// Check if functions exist
const functionsExist = await page.evaluate(() => {
  return {
    populateAgents: typeof populateAgents === 'function',
    renderAgentCard: typeof renderAgentCard === 'function',
    renderAgentRow: typeof renderAgentRow === 'function',
    filterCategory: typeof filterCategory === 'function',
    openDetail: typeof openDetail === 'function'
  };
});
console.log('Functions exist:', functionsExist);

// Check popularAgents innerHTML
const popularHTML = await page.locator('#popularAgents').innerHTML();
console.log('Popular agents HTML length:', popularHTML.length);
if (popularHTML.length > 0) {
  console.log('Popular HTML preview:', popularHTML.substring(0, 300));
}

// Check allAgents innerHTML
const allHTML = await page.locator('#allAgents').innerHTML();
console.log('All agents HTML length:', allHTML.length);
if (allHTML.length > 0) {
  console.log('All HTML preview:', allHTML.substring(0, 300));
}

// Manually call populateAgents and check
await page.evaluate(() => {
  if (typeof populateAgents === 'function') {
    populateAgents();
  }
});
await page.waitForTimeout(500);

const popularHTMLAfter = await page.locator('#popularAgents').innerHTML();
console.log('Popular agents HTML length after manual call:', popularHTMLAfter.length);

const allHTMLAfter = await page.locator('#allAgents').innerHTML();
console.log('All agents HTML length after manual call:', allHTMLAfter.length);

// Count popular agents
const popularCount = await page.evaluate(() => {
  return Object.values(window.agents || {}).filter(a => a.popular).length;
});
console.log('Agents with popular=true:', popularCount);

// Check for errors
console.log('\n--- Console Errors ---');
errors.forEach(e => console.log('ERROR:', e));

console.log('\n--- Console Logs (first 10) ---');
logs.slice(0, 10).forEach(l => console.log(l));

await browser.close();
