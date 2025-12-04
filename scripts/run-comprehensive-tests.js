#!/usr/bin/env node
/**
 * Comprehensive Agent Test Runner
 * Runs 115+ real tests against all agents and reports results
 */

import { writeFileSync } from 'fs';

const BASE_URL = 'http://localhost:3000';

// Test image URLs (publicly accessible)
const TEST_IMAGES = {
  portrait: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
  portrait2: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400',
  landscape: 'https://images.unsplash.com/photo-1501820434261-5bb046afcf6b?w=400',
  product: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=400',
  sketch: 'https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=400',
  fashion: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=400',
  food: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400',
  architecture: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=400',
};

const results = [];

async function runTest(testId, agent, testName, category, difficulty, input, expectError = false) {
  const startTime = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/mulerun/agents/${agent}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });

    const data = await response.json();
    const responseTime = Date.now() - startTime;

    const isAsync = data.jobId && data.status === 'processing';
    const isCompleted = data.status === 'completed';
    const isFailed = data.status === 'failed' || data.error;

    let passed;
    let error = isFailed ? (data.error || 'Unknown error') : undefined;

    // For edge cases expecting an error, passing means getting an error
    if (expectError) {
      passed = isFailed; // Expected to fail with an error
    } else {
      passed = isAsync || isCompleted;
    }

    const result = {
      testId,
      agent,
      testName,
      category,
      difficulty,
      passed,
      error,
      responseTime,
      status: data.status,
      expectError,
    };

    results.push(result);

    const icon = passed ? '✅' : '❌';
    console.log(`${icon} [${testId}] ${agent}: ${testName} (${responseTime}ms)`);
    if (error && !expectError) console.log(`   Error: ${error.substring(0, 80)}`);
    if (expectError && passed) console.log(`   (Expected error - correctly handled)`);

    return result;

  } catch (err) {
    const passed = expectError; // Network errors count as "expected error" if we expect error
    const result = {
      testId,
      agent,
      testName,
      category,
      difficulty,
      passed,
      error: err.message,
      responseTime: Date.now() - startTime,
      expectError,
    };
    results.push(result);
    const icon = passed ? '✅' : '❌';
    console.log(`${icon} [${testId}] ${agent}: ${testName}`);
    if (!expectError) console.log(`   Error: ${err.message.substring(0, 80)}`);
    return result;
  }
}

async function runAllTests() {
  console.log('🚀 Starting Comprehensive Agent Tests...\n');
  console.log('=' .repeat(60));

  // IMAGE PROCESSING (1-25)
  console.log('\n📷 IMAGE PROCESSING TESTS\n');

  await runTest(1, 'background-remover', 'Basic portrait BG removal', 'image', 'easy', { image: TEST_IMAGES.portrait });
  await runTest(2, 'background-remover', 'Product BG removal', 'image', 'easy', { image: TEST_IMAGES.product });
  await runTest(3, 'background-remover', 'Landscape BG removal', 'image', 'moderate', { image: TEST_IMAGES.landscape });
  await runTest(4, 'background-remover', 'Architecture BG removal', 'image', 'difficult', { image: TEST_IMAGES.architecture });
  await runTest(5, 'background-remover', 'Edge: Empty URL', 'image', 'edge', { image: '' }, true);

  await runTest(6, 'image-upscaler', 'Basic 2x upscale', 'image', 'easy', { image: TEST_IMAGES.portrait, scale: 2 });
  await runTest(7, 'image-upscaler', '4x upscale + face enhance', 'image', 'moderate', { image: TEST_IMAGES.portrait, scale: 4, faceEnhance: true });
  await runTest(8, 'image-upscaler', 'Landscape upscale', 'image', 'easy', { image: TEST_IMAGES.landscape, scale: 2 });
  await runTest(9, 'image-upscaler', 'Edge: Invalid scale', 'image', 'edge', { image: TEST_IMAGES.portrait, scale: 100 }, true);
  await runTest(10, 'image-upscaler', 'Edge: No scale', 'image', 'edge', { image: TEST_IMAGES.portrait });

  await runTest(11, 'portrait-enhancer', 'Male portrait enhance', 'image', 'easy', { image: TEST_IMAGES.portrait });
  await runTest(12, 'portrait-enhancer', 'Female portrait enhance', 'image', 'easy', { image: TEST_IMAGES.portrait2 });
  await runTest(13, 'portrait-enhancer', 'Edge: Non-portrait', 'image', 'edge', { image: TEST_IMAGES.landscape });
  await runTest(14, 'portrait-retoucher', 'Basic retouch', 'image', 'easy', { image: TEST_IMAGES.portrait });
  await runTest(15, 'portrait-retoucher', 'Female retouch', 'image', 'easy', { image: TEST_IMAGES.portrait2 });

  await runTest(16, 'style-transfer', 'Van Gogh style', 'image', 'easy', { image: TEST_IMAGES.landscape, style: 'van gogh' });
  await runTest(17, 'style-transfer', 'Anime style', 'image', 'moderate', { image: TEST_IMAGES.portrait, style: 'anime' });
  await runTest(18, 'style-transfer', 'Watercolor style', 'image', 'moderate', { image: TEST_IMAGES.landscape, style: 'watercolor' });
  await runTest(19, 'style-transfer', 'Cyberpunk style', 'image', 'difficult', { image: TEST_IMAGES.architecture, style: 'cyberpunk neon' });
  await runTest(20, 'style-transfer', 'Edge: Empty style', 'image', 'edge', { image: TEST_IMAGES.landscape, style: '' });

  await runTest(21, 'sketch-to-image', 'Colorful bird', 'image', 'easy', { sketch: TEST_IMAGES.sketch, description: 'colorful bird with rainbow feathers' });
  await runTest(22, 'sketch-to-image', 'Realistic animal', 'image', 'moderate', { sketch: TEST_IMAGES.sketch, description: 'realistic eagle in nature' });
  await runTest(23, 'sketch-to-image', 'Fantasy creature', 'image', 'difficult', { sketch: TEST_IMAGES.sketch, description: 'magical phoenix with fire wings' });
  await runTest(24, 'sketch-to-image', 'Anime character', 'image', 'moderate', { sketch: TEST_IMAGES.portrait, description: 'anime character with blue hair' });
  await runTest(25, 'sketch-to-image', 'Edge: Minimal desc', 'image', 'edge', { sketch: TEST_IMAGES.sketch, description: 'bird' });

  // IMAGE GENERATION (26-40)
  console.log('\n🎨 IMAGE GENERATION TESTS\n');

  await runTest(26, 'image-generator', 'Landscape generation', 'image', 'easy', { prompt: 'beautiful sunset over mountains', style: 'photorealistic' });
  await runTest(27, 'image-generator', 'Portrait generation', 'image', 'moderate', { prompt: 'professional headshot of business woman', style: 'portrait' });
  await runTest(28, 'image-generator', 'Fantasy scene', 'image', 'difficult', { prompt: 'dragon flying over castle at sunset' });
  await runTest(29, 'image-generator', 'Product mockup', 'image', 'moderate', { prompt: 'smartphone on white background' });
  await runTest(30, 'image-generator', 'Edge: Long prompt', 'image', 'edge', { prompt: 'Highly detailed futuristic cyberpunk city at night with neon lights reflecting on wet streets and flying cars and holographic ads and rain and steam' });

  await runTest(31, 'scene-generator', 'Coffee shop', 'image', 'easy', { description: 'cozy coffee shop', mood: 'warm', style: 'realistic' });
  await runTest(32, 'scene-generator', 'Futuristic office', 'image', 'moderate', { description: 'futuristic office space', mood: 'professional', style: 'sci-fi' });
  await runTest(33, 'scene-generator', 'Haunted mansion', 'image', 'difficult', { description: 'abandoned haunted mansion', mood: 'scary', style: 'gothic' });
  await runTest(34, 'scene-generator', 'Beach sunset', 'image', 'easy', { description: 'tropical beach sunset', mood: 'relaxing' });
  await runTest(35, 'scene-generator', 'Edge: Abstract', 'image', 'edge', { description: 'abstract time concept', mood: 'mysterious' });

  await runTest(36, 'character-creator', 'Fantasy knight', 'image', 'easy', { description: 'brave knight in armor', style: 'fantasy' });
  await runTest(37, 'character-creator', 'Sci-fi robot', 'image', 'moderate', { description: 'humanoid robot with glowing eyes', style: 'sci-fi' });
  await runTest(38, 'character-creator', 'Anime hero', 'image', 'moderate', { description: 'anime hero with spiky hair', style: 'anime' });
  await runTest(39, 'character-creator', 'Realistic CEO', 'image', 'difficult', { description: 'confident CEO in suit', style: 'realistic' });
  await runTest(40, 'character-creator', 'Edge: Minimal', 'image', 'edge', { description: 'person', style: 'realistic' });

  // FACE/PORTRAIT (41-50)
  console.log('\n👤 FACE/PORTRAIT TESTS\n');

  await runTest(41, 'face-swap', 'Basic face swap', 'image', 'moderate', { sourceImage: TEST_IMAGES.portrait, targetImage: TEST_IMAGES.portrait2 });
  await runTest(42, 'face-swap', 'Same gender swap', 'image', 'easy', { sourceImage: TEST_IMAGES.portrait, targetImage: TEST_IMAGES.portrait });
  await runTest(43, 'face-swap', 'Edge: Same image', 'image', 'edge', { sourceImage: TEST_IMAGES.portrait, targetImage: TEST_IMAGES.portrait });

  await runTest(44, 'headshot-generator', 'Male headshot', 'image', 'easy', { description: 'professional male headshot', style: 'corporate' });
  await runTest(45, 'headshot-generator', 'Female headshot', 'image', 'moderate', { description: 'creative female artist headshot', style: 'artistic' });
  await runTest(46, 'headshot-generator', 'LinkedIn photo', 'image', 'easy', { description: 'linkedin profile photo', style: 'business' });
  await runTest(47, 'headshot-generator', 'Edge: Unusual style', 'image', 'edge', { description: 'headshot', style: 'underwater' });

  await runTest(48, 'virtual-try-on', 'Upper body try-on', 'image', 'moderate', { personImage: TEST_IMAGES.portrait, garmentImage: TEST_IMAGES.fashion, category: 'upper_body' });
  await runTest(49, 'virtual-try-on', 'Dress try-on', 'image', 'difficult', { personImage: TEST_IMAGES.portrait2, garmentImage: TEST_IMAGES.fashion, category: 'dresses' });
  await runTest(50, 'virtual-try-on', 'Edge: Mismatched', 'image', 'edge', { personImage: TEST_IMAGES.landscape, garmentImage: TEST_IMAGES.fashion, category: 'upper_body' });

  // TEXT/CONTENT (51-75)
  console.log('\n📝 TEXT/CONTENT TESTS\n');

  await runTest(51, 'product-description-writer', 'Tech product', 'text', 'easy', { productName: 'Wireless Earbuds', features: 'noise cancellation, 24hr battery', tone: 'professional' });
  await runTest(52, 'product-description-writer', 'Fashion product', 'text', 'moderate', { productName: 'Leather Jacket', features: 'genuine leather, slim fit', tone: 'luxury' });
  await runTest(53, 'product-description-writer', 'Food product', 'text', 'easy', { productName: 'Green Tea', features: 'organic, calming', tone: 'health' });
  await runTest(54, 'product-description-writer', 'SaaS product', 'text', 'difficult', { productName: 'CloudSync Pro', features: 'real-time sync, encryption', tone: 'enterprise' });
  await runTest(55, 'product-description-writer', 'Edge: Minimal', 'text', 'edge', { productName: 'Widget', features: 'useful', tone: 'casual' });

  await runTest(56, 'social-media-caption-generator', 'Instagram launch', 'text', 'easy', { topic: 'product launch', platform: 'instagram', tone: 'excited' });
  await runTest(57, 'social-media-caption-generator', 'LinkedIn thought', 'text', 'moderate', { topic: 'AI in business', platform: 'linkedin', tone: 'professional' });
  await runTest(58, 'social-media-caption-generator', 'Twitter announcement', 'text', 'easy', { topic: 'software update', platform: 'twitter', tone: 'informative' });
  await runTest(59, 'social-media-caption-generator', 'TikTok viral', 'text', 'moderate', { topic: 'office tour', platform: 'tiktok', tone: 'fun' });
  await runTest(60, 'social-media-caption-generator', 'All platforms', 'text', 'difficult', { topic: 'company anniversary', platform: 'all', tone: 'celebratory' });

  await runTest(61, 'email-template-generator', 'Welcome email', 'text', 'easy', { purpose: 'welcome customer', tone: 'friendly', companyName: 'TechCorp' });
  await runTest(62, 'email-template-generator', 'Sales follow-up', 'text', 'moderate', { purpose: 'follow up demo', tone: 'professional', companyName: 'SalesForce' });
  await runTest(63, 'email-template-generator', 'Apology email', 'text', 'difficult', { purpose: 'service outage apology', tone: 'sincere', companyName: 'CloudServices' });
  await runTest(64, 'email-template-generator', 'Newsletter', 'text', 'moderate', { purpose: 'monthly newsletter', tone: 'engaging', companyName: 'NewsDaily' });
  await runTest(65, 'email-template-generator', 'Edge: Unusual', 'text', 'edge', { purpose: 'company closure', tone: 'formal', companyName: 'EndCorp' });

  await runTest(66, 'seo-content-optimizer', 'Basic SEO', 'text', 'easy', { content: 'How to improve website SEO', targetKeywords: 'SEO tips' });
  await runTest(67, 'seo-content-optimizer', 'E-commerce SEO', 'text', 'moderate', { content: 'Best running shoes 2024', targetKeywords: 'running shoes' });
  await runTest(68, 'seo-content-optimizer', 'Technical blog', 'text', 'difficult', { content: 'Microservices architecture benefits', targetKeywords: 'microservices' });
  await runTest(69, 'seo-content-optimizer', 'Local business', 'text', 'moderate', { content: 'Best pizza in NYC', targetKeywords: 'pizza NYC' });
  await runTest(70, 'seo-content-optimizer', 'Edge: Short', 'text', 'edge', { content: 'Buy now', targetKeywords: 'purchase' });

  await runTest(71, 'video-script-generator', 'YouTube tutorial', 'text', 'easy', { topic: 'How to make coffee', platform: 'youtube', duration: '5 minutes' });
  await runTest(72, 'video-script-generator', 'TikTok explainer', 'text', 'moderate', { topic: 'Productivity hacks', platform: 'tiktok', duration: '60 seconds' });
  await runTest(73, 'video-script-generator', 'Corporate training', 'text', 'difficult', { topic: 'Compliance training', platform: 'internal', duration: '15 minutes' });
  await runTest(74, 'video-script-generator', 'Product demo', 'text', 'moderate', { topic: 'Software demo', platform: 'youtube', duration: '10 minutes' });
  await runTest(75, 'video-script-generator', 'Edge: Long', 'text', 'edge', { topic: 'Coding bootcamp', platform: 'youtube', duration: '8 hours' });

  // ANALYTICS/DATA (76-85)
  console.log('\n📊 ANALYTICS/DATA TESTS\n');

  await runTest(76, 'smart-data-analyzer', 'Trend analysis', 'analytics', 'easy', { data: 'month,sales\nJan,100\nFeb,150\nMar,200', analysisType: 'trend' });
  await runTest(77, 'smart-data-analyzer', 'Correlation', 'analytics', 'moderate', { data: 'ads,sales\n1000,5000\n2000,8000', analysisType: 'correlation' });
  await runTest(78, 'smart-data-analyzer', 'Anomaly detect', 'analytics', 'difficult', { data: 'date,value\n01,100\n02,105\n03,500\n04,102', analysisType: 'anomaly' });
  await runTest(79, 'smart-data-analyzer', 'Multi-variable', 'analytics', 'difficult', { data: 'region,sales,profit\nNorth,1000,200\nSouth,1500,350', analysisType: 'comprehensive' });
  await runTest(80, 'smart-data-analyzer', 'Edge: Single point', 'analytics', 'edge', { data: 'value\n42', analysisType: 'trend' });

  await runTest(81, 'data-visualization', 'Time series', 'analytics', 'easy', { dataDescription: 'Monthly sales 12 months', visualizationType: 'chart' });
  await runTest(82, 'data-visualization', 'Comparison', 'analytics', 'moderate', { dataDescription: 'Product performance 5 products 4 regions', visualizationType: 'chart' });
  await runTest(83, 'data-visualization', 'Distribution', 'analytics', 'moderate', { dataDescription: 'Customer age distribution', visualizationType: 'chart' });
  await runTest(84, 'data-visualization', 'Dashboard', 'analytics', 'difficult', { dataDescription: 'Executive KPI dashboard', visualizationType: 'dashboard' });
  await runTest(85, 'data-visualization', 'Edge: Vague', 'analytics', 'edge', { dataDescription: 'some numbers', visualizationType: 'chart' });

  // BUSINESS/PRODUCTIVITY (86-95)
  console.log('\n💼 BUSINESS/PRODUCTIVITY TESTS\n');

  await runTest(86, 'customer-support-bot', 'Return query', 'business', 'easy', { query: 'How to return product?', context: 'e-commerce' });
  await runTest(87, 'customer-support-bot', 'Tech support', 'business', 'moderate', { query: 'Account locked, cannot reset password', context: 'software' });
  await runTest(88, 'customer-support-bot', 'Complaint', 'business', 'difficult', { query: 'Very unhappy with service, want manager', context: 'telecom' });

  await runTest(89, 'resume-builder', 'Software engineer', 'business', 'easy', { name: 'John Doe', title: 'Software Engineer', experience: '5 years', skills: 'JavaScript, React' });
  await runTest(90, 'resume-builder', 'Marketing manager', 'business', 'moderate', { name: 'Jane Smith', title: 'Marketing Manager', experience: '8 years', skills: 'Digital marketing, SEO' });
  await runTest(91, 'resume-builder', 'Entry level', 'business', 'moderate', { name: 'Fresh Grad', title: 'Junior Dev', experience: '0 years', skills: 'Python, HTML' });

  await runTest(92, 'ai-assistant', 'Simple fact', 'business', 'easy', { message: 'Capital of France?' });
  await runTest(93, 'ai-assistant', 'Business advice', 'business', 'moderate', { message: 'Remote team management best practices?' });
  await runTest(94, 'ai-assistant', 'Technical explain', 'business', 'difficult', { message: 'Explain REST vs GraphQL with examples' });
  await runTest(95, 'ai-assistant', 'Edge: Ambiguous', 'business', 'edge', { message: 'How long is it?' });

  // AUDIO/VIDEO (96-105)
  console.log('\n🎵 AUDIO/VIDEO TESTS\n');

  await runTest(96, 'music-generator', 'Electronic', 'audio', 'easy', { prompt: 'upbeat electronic dance', duration: 8 });
  await runTest(97, 'music-generator', 'Ambient', 'audio', 'moderate', { prompt: 'calm meditation ambient', duration: 15 });
  await runTest(98, 'music-generator', 'Cinematic', 'audio', 'difficult', { prompt: 'epic orchestral cinematic', duration: 20 });

  await runTest(99, 'voice-cloner', 'Basic TTS', 'audio', 'easy', { text: 'Hello, this is a test.', voicePreset: 'en_speaker_6' });
  await runTest(100, 'voice-cloner', 'Long TTS', 'audio', 'moderate', { text: 'Welcome to our AI guide. Today we explore machine learning.', voicePreset: 'en_speaker_3' });

  await runTest(101, 'video-generator', 'Image to video', 'video', 'moderate', { image: TEST_IMAGES.landscape });
  await runTest(102, 'image-animator', 'Animate image', 'video', 'moderate', { image: TEST_IMAGES.portrait });

  await runTest(103, 'object-remover', 'Remove object', 'image', 'moderate', { image: TEST_IMAGES.landscape, mask: TEST_IMAGES.landscape, objectToRemove: 'element' });
  await runTest(104, 'background-replacer', 'Beach background', 'image', 'moderate', { image: TEST_IMAGES.portrait, newBackground: 'tropical beach' });
  await runTest(105, 'background-replacer', 'Studio background', 'image', 'easy', { image: TEST_IMAGES.portrait, newBackground: 'white studio' });

  // PRODUCT/MISC (106-115)
  console.log('\n📦 PRODUCT/MISC TESTS\n');

  await runTest(106, 'product-photographer', 'Watch photo', 'image', 'easy', { description: 'luxury watch', background: 'black velvet', style: 'professional' });
  await runTest(107, 'product-photographer', 'Phone photo', 'image', 'moderate', { description: 'modern smartphone', background: 'gradient', style: 'minimal' });
  await runTest(108, 'product-photographer', 'Food photo', 'image', 'moderate', { description: 'chocolate truffles', background: 'marble', style: 'appetizing' });

  await runTest(109, 'ai-background-generator', 'Office background', 'image', 'moderate', { prompt: 'professional office', style: 'realistic' });
  await runTest(110, 'pro-headshot-generator', 'Pro headshot', 'image', 'moderate', { description: 'executive headshot', style: 'corporate' });
  await runTest(111, 'ai-model-swap', 'Model swap', 'image', 'difficult', { sourceImage: TEST_IMAGES.portrait, targetImage: TEST_IMAGES.portrait2 });
  await runTest(112, 'image-translator', 'Image translate', 'image', 'moderate', { image: TEST_IMAGES.product, targetLanguage: 'Spanish' });
  await runTest(113, 'meeting-transcriber', 'Meeting notes', 'text', 'moderate', { transcript: 'John: Finish by Friday.\nMary: Budget is $5000.' });
  await runTest(114, 'lip-sync', 'Lip sync', 'video', 'difficult', { video: TEST_IMAGES.portrait, audio: 'https://example.com/audio.mp3' });
  await runTest(115, 'talking-avatar', 'Talking avatar', 'video', 'difficult', { image: TEST_IMAGES.portrait, text: 'Hello, welcome to our presentation.' });

  // SUMMARY
  console.log('\n' + '='.repeat(60));
  console.log('📋 TEST SUMMARY');
  console.log('='.repeat(60) + '\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total Tests: ${total}`);
  console.log(`✅ Passed: ${passed} (${((passed/total)*100).toFixed(1)}%)`);
  console.log(`❌ Failed: ${failed} (${((failed/total)*100).toFixed(1)}%)`);

  if (failed > 0) {
    console.log('\n❌ FAILED TESTS:');
    console.log('-'.repeat(60));
    results.filter(r => !r.passed).forEach(r => {
      console.log(`[${r.testId}] ${r.agent}: ${r.testName}`);
      console.log(`    Error: ${r.error?.substring(0, 100) || 'Unknown'}`);
    });
  }

  console.log('\n📊 BY CATEGORY:');
  const categories = [...new Set(results.map(r => r.category))];
  categories.forEach(cat => {
    const catResults = results.filter(r => r.category === cat);
    const catPassed = catResults.filter(r => r.passed).length;
    const icon = catPassed === catResults.length ? '✅' : '⚠️';
    console.log(`  ${icon} ${cat}: ${catPassed}/${catResults.length}`);
  });

  console.log('\n📈 BY DIFFICULTY:');
  ['easy', 'moderate', 'difficult', 'edge'].forEach(diff => {
    const diffResults = results.filter(r => r.difficulty === diff);
    const diffPassed = diffResults.filter(r => r.passed).length;
    const icon = diffPassed === diffResults.length ? '✅' : '⚠️';
    console.log(`  ${icon} ${diff}: ${diffPassed}/${diffResults.length}`);
  });

  // Write detailed results to file
  const report = {
    timestamp: new Date().toISOString(),
    summary: { total, passed, failed, passRate: ((passed/total)*100).toFixed(1) + '%' },
    results: results,
  };
  writeFileSync('./test-results.json', JSON.stringify(report, null, 2));
  console.log('\n📄 Full results saved to test-results.json');

  return { passed, failed, total, results };
}

// Run tests
runAllTests().then(({ passed, failed, total }) => {
  console.log('\n' + '='.repeat(60));
  if (failed === 0) {
    console.log('🎉 ALL TESTS PASSED!');
  } else {
    console.log(`⚠️  ${failed} tests failed. Review and fix issues.`);
  }
  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
}).catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
