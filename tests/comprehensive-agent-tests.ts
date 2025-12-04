/**
 * Comprehensive Agent Test Suite
 * 100+ test cases covering all agents with easy, moderate, difficult, and edge cases
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

const BASE_URL = 'http://localhost:3000';
const TIMEOUT = 180000; // 3 minutes for long-running tests

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

interface TestResult {
  testId: number;
  agent: string;
  testName: string;
  category: string;
  difficulty: 'easy' | 'moderate' | 'difficult' | 'edge';
  passed: boolean;
  error?: string;
  responseTime?: number;
  output?: any;
}

const results: TestResult[] = [];

async function runAgentTest(
  testId: number,
  agent: string,
  testName: string,
  category: string,
  difficulty: 'easy' | 'moderate' | 'difficult' | 'edge',
  input: any,
  validateFn?: (output: any) => boolean
): Promise<TestResult> {
  const startTime = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/mulerun/agents/${agent}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });

    const data = await response.json();
    const responseTime = Date.now() - startTime;

    // Check if it's a job (async) or direct result
    const isAsync = data.jobId && data.status === 'processing';
    const isCompleted = data.status === 'completed';
    const isFailed = data.status === 'failed' || data.error;

    let passed = false;
    let error: string | undefined;

    if (isFailed) {
      passed = false;
      error = data.error || 'Unknown error';
    } else if (isAsync || isCompleted) {
      passed = true;
      if (validateFn && data.output) {
        passed = validateFn(data.output);
        if (!passed) error = 'Validation failed';
      }
    } else {
      passed = false;
      error = `Unexpected response: ${JSON.stringify(data).substring(0, 200)}`;
    }

    const result: TestResult = {
      testId,
      agent,
      testName,
      category,
      difficulty,
      passed,
      error,
      responseTime,
      output: data,
    };

    results.push(result);
    return result;

  } catch (err: any) {
    const result: TestResult = {
      testId,
      agent,
      testName,
      category,
      difficulty,
      passed: false,
      error: err.message,
      responseTime: Date.now() - startTime,
    };
    results.push(result);
    return result;
  }
}

// Export for running
export async function runAllTests(): Promise<TestResult[]> {
  console.log('Starting comprehensive agent tests...\n');

  // ============================================================================
  // IMAGE PROCESSING AGENTS (Tests 1-25)
  // ============================================================================

  // Background Remover Tests (1-5)
  await runAgentTest(1, 'background-remover', 'Basic portrait background removal', 'image', 'easy',
    { image: TEST_IMAGES.portrait },
    (o) => o.success && o.resultImage
  );

  await runAgentTest(2, 'background-remover', 'Product image background removal', 'image', 'easy',
    { image: TEST_IMAGES.product },
    (o) => o.success && o.resultImage
  );

  await runAgentTest(3, 'background-remover', 'Landscape background removal', 'image', 'moderate',
    { image: TEST_IMAGES.landscape },
    (o) => o.success
  );

  await runAgentTest(4, 'background-remover', 'Architecture background removal', 'image', 'difficult',
    { image: TEST_IMAGES.architecture },
    (o) => o.success
  );

  await runAgentTest(5, 'background-remover', 'Edge: Empty image URL', 'image', 'edge',
    { image: '' }
    // Should fail gracefully
  );

  // Image Upscaler Tests (6-10)
  await runAgentTest(6, 'image-upscaler', 'Basic 2x upscale', 'image', 'easy',
    { image: TEST_IMAGES.portrait, scale: 2 },
    (o) => o.success && o.upscaledImage
  );

  await runAgentTest(7, 'image-upscaler', '4x upscale with face enhance', 'image', 'moderate',
    { image: TEST_IMAGES.portrait, scale: 4, faceEnhance: true },
    (o) => o.success
  );

  await runAgentTest(8, 'image-upscaler', 'Landscape 2x upscale', 'image', 'easy',
    { image: TEST_IMAGES.landscape, scale: 2 },
    (o) => o.success
  );

  await runAgentTest(9, 'image-upscaler', 'Edge: Invalid scale value', 'image', 'edge',
    { image: TEST_IMAGES.portrait, scale: 100 }
  );

  await runAgentTest(10, 'image-upscaler', 'Edge: No scale specified', 'image', 'edge',
    { image: TEST_IMAGES.portrait }
  );

  // Portrait Enhancer Tests (11-15)
  await runAgentTest(11, 'portrait-enhancer', 'Basic portrait enhancement', 'image', 'easy',
    { image: TEST_IMAGES.portrait },
    (o) => o.success && o.enhancedImage
  );

  await runAgentTest(12, 'portrait-enhancer', 'Female portrait enhancement', 'image', 'easy',
    { image: TEST_IMAGES.portrait2 },
    (o) => o.success
  );

  await runAgentTest(13, 'portrait-enhancer', 'Edge: Non-portrait image', 'image', 'edge',
    { image: TEST_IMAGES.landscape }
  );

  await runAgentTest(14, 'portrait-retoucher', 'Basic portrait retouch', 'image', 'easy',
    { image: TEST_IMAGES.portrait },
    (o) => o.success
  );

  await runAgentTest(15, 'portrait-retoucher', 'Female portrait retouch', 'image', 'easy',
    { image: TEST_IMAGES.portrait2 },
    (o) => o.success
  );

  // Style Transfer Tests (16-20)
  await runAgentTest(16, 'style-transfer', 'Van Gogh style', 'image', 'easy',
    { image: TEST_IMAGES.landscape, style: 'van gogh' },
    (o) => o.success && o.stylizedImage
  );

  await runAgentTest(17, 'style-transfer', 'Anime style', 'image', 'moderate',
    { image: TEST_IMAGES.portrait, style: 'anime' },
    (o) => o.success
  );

  await runAgentTest(18, 'style-transfer', 'Watercolor style', 'image', 'moderate',
    { image: TEST_IMAGES.landscape, style: 'watercolor painting' },
    (o) => o.success
  );

  await runAgentTest(19, 'style-transfer', 'Cyberpunk neon style', 'image', 'difficult',
    { image: TEST_IMAGES.architecture, style: 'cyberpunk neon' },
    (o) => o.success
  );

  await runAgentTest(20, 'style-transfer', 'Edge: Empty style', 'image', 'edge',
    { image: TEST_IMAGES.landscape, style: '' }
  );

  // Sketch to Image Tests (21-25)
  await runAgentTest(21, 'sketch-to-image', 'Colorful bird from sketch', 'image', 'easy',
    { sketch: TEST_IMAGES.sketch, description: 'a colorful bird with rainbow feathers' },
    (o) => o.success && o.generatedImage
  );

  await runAgentTest(22, 'sketch-to-image', 'Realistic animal from sketch', 'image', 'moderate',
    { sketch: TEST_IMAGES.sketch, description: 'a realistic eagle in nature' },
    (o) => o.success
  );

  await runAgentTest(23, 'sketch-to-image', 'Fantasy creature from sketch', 'image', 'difficult',
    { sketch: TEST_IMAGES.sketch, description: 'a magical phoenix with fire wings, fantasy art' },
    (o) => o.success
  );

  await runAgentTest(24, 'sketch-to-image', 'Anime character from sketch', 'image', 'moderate',
    { sketch: TEST_IMAGES.portrait, description: 'anime character with blue hair' },
    (o) => o.success
  );

  await runAgentTest(25, 'sketch-to-image', 'Edge: Minimal description', 'image', 'edge',
    { sketch: TEST_IMAGES.sketch, description: 'bird' },
    (o) => o.success
  );

  // ============================================================================
  // IMAGE GENERATION AGENTS (Tests 26-40)
  // ============================================================================

  // Image Generator Tests (26-30)
  await runAgentTest(26, 'image-generator', 'Simple landscape generation', 'image', 'easy',
    { prompt: 'a beautiful sunset over mountains', style: 'photorealistic' }
  );

  await runAgentTest(27, 'image-generator', 'Portrait generation', 'image', 'moderate',
    { prompt: 'professional headshot of a business woman', style: 'portrait photography' }
  );

  await runAgentTest(28, 'image-generator', 'Fantasy scene generation', 'image', 'difficult',
    { prompt: 'epic dragon flying over a medieval castle at sunset, cinematic lighting' }
  );

  await runAgentTest(29, 'image-generator', 'Product mockup generation', 'image', 'moderate',
    { prompt: 'modern smartphone on white background, product photography' }
  );

  await runAgentTest(30, 'image-generator', 'Edge: Very long prompt', 'image', 'edge',
    { prompt: 'A highly detailed photorealistic image of a futuristic cyberpunk city at night with neon lights reflecting on wet streets, flying cars, holographic advertisements, rain falling, people walking with umbrellas, steam rising from vents, dramatic lighting, cinematic composition, 8k ultra HD quality, masterpiece, trending on artstation' }
  );

  // Scene Generator Tests (31-35)
  await runAgentTest(31, 'scene-generator', 'Cozy coffee shop', 'image', 'easy',
    { description: 'a cozy coffee shop', mood: 'warm', style: 'realistic' }
  );

  await runAgentTest(32, 'scene-generator', 'Futuristic office', 'image', 'moderate',
    { description: 'a futuristic office space', mood: 'professional', style: 'sci-fi' }
  );

  await runAgentTest(33, 'scene-generator', 'Haunted mansion', 'image', 'difficult',
    { description: 'an abandoned haunted mansion at midnight', mood: 'scary', style: 'gothic' }
  );

  await runAgentTest(34, 'scene-generator', 'Beach sunset', 'image', 'easy',
    { description: 'tropical beach at sunset', mood: 'relaxing', style: 'photorealistic' }
  );

  await runAgentTest(35, 'scene-generator', 'Edge: Abstract scene', 'image', 'edge',
    { description: 'abstract concept of time', mood: 'mysterious' }
  );

  // Character Creator Tests (36-40)
  await runAgentTest(36, 'character-creator', 'Fantasy knight', 'image', 'easy',
    { description: 'a brave knight in shining armor', style: 'fantasy' },
    (o) => o.success && o.characterImages
  );

  await runAgentTest(37, 'character-creator', 'Sci-fi robot', 'image', 'moderate',
    { description: 'a humanoid robot with glowing eyes', style: 'sci-fi' },
    (o) => o.success
  );

  await runAgentTest(38, 'character-creator', 'Anime hero', 'image', 'moderate',
    { description: 'an anime hero with spiky hair and a sword', style: 'anime' },
    (o) => o.success
  );

  await runAgentTest(39, 'character-creator', 'Realistic business person', 'image', 'difficult',
    { description: 'a confident CEO in a modern suit', style: 'realistic portrait' },
    (o) => o.success
  );

  await runAgentTest(40, 'character-creator', 'Edge: Minimal description', 'image', 'edge',
    { description: 'person', style: 'realistic' }
  );

  // ============================================================================
  // FACE/PORTRAIT AGENTS (Tests 41-50)
  // ============================================================================

  // Face Swap Tests (41-43)
  await runAgentTest(41, 'face-swap', 'Basic face swap', 'image', 'moderate',
    { sourceImage: TEST_IMAGES.portrait, targetImage: TEST_IMAGES.portrait2 }
  );

  await runAgentTest(42, 'face-swap', 'Same gender face swap', 'image', 'easy',
    { sourceImage: TEST_IMAGES.portrait, targetImage: TEST_IMAGES.portrait }
  );

  await runAgentTest(43, 'face-swap', 'Edge: Same image swap', 'image', 'edge',
    { sourceImage: TEST_IMAGES.portrait, targetImage: TEST_IMAGES.portrait }
  );

  // Headshot Generator Tests (44-47)
  await runAgentTest(44, 'headshot-generator', 'Professional male headshot', 'image', 'easy',
    { description: 'professional business headshot of a man', style: 'corporate' }
  );

  await runAgentTest(45, 'headshot-generator', 'Creative female headshot', 'image', 'moderate',
    { description: 'creative headshot of a woman artist', style: 'artistic' }
  );

  await runAgentTest(46, 'headshot-generator', 'LinkedIn style headshot', 'image', 'easy',
    { description: 'linkedin profile photo, professional', style: 'business casual' }
  );

  await runAgentTest(47, 'headshot-generator', 'Edge: Unusual style', 'image', 'edge',
    { description: 'headshot', style: 'underwater' }
  );

  // Virtual Try-On Tests (48-50)
  await runAgentTest(48, 'virtual-try-on', 'Upper body try-on', 'image', 'moderate',
    { personImage: TEST_IMAGES.portrait, garmentImage: TEST_IMAGES.fashion, category: 'upper_body' }
  );

  await runAgentTest(49, 'virtual-try-on', 'Dress try-on', 'image', 'difficult',
    { personImage: TEST_IMAGES.portrait2, garmentImage: TEST_IMAGES.fashion, category: 'dresses' }
  );

  await runAgentTest(50, 'virtual-try-on', 'Edge: Mismatched images', 'image', 'edge',
    { personImage: TEST_IMAGES.landscape, garmentImage: TEST_IMAGES.fashion, category: 'upper_body' }
  );

  // ============================================================================
  // TEXT/CONTENT AGENTS (Tests 51-75)
  // ============================================================================

  // Product Description Writer Tests (51-55)
  await runAgentTest(51, 'product-description-writer', 'Tech product description', 'text', 'easy',
    { productName: 'Wireless Earbuds Pro', features: 'noise cancellation, 24hr battery, bluetooth 5.0', tone: 'professional' },
    (o) => o.headline && o.description
  );

  await runAgentTest(52, 'product-description-writer', 'Fashion product description', 'text', 'moderate',
    { productName: 'Premium Leather Jacket', features: 'genuine leather, slim fit, multiple pockets', tone: 'luxury' },
    (o) => o.headline && o.description
  );

  await runAgentTest(53, 'product-description-writer', 'Food product description', 'text', 'easy',
    { productName: 'Organic Green Tea', features: 'antioxidant rich, calming, natural', tone: 'health-conscious' },
    (o) => o.headline
  );

  await runAgentTest(54, 'product-description-writer', 'SaaS product description', 'text', 'difficult',
    { productName: 'CloudSync Pro', features: 'real-time collaboration, end-to-end encryption, unlimited storage, AI-powered search', tone: 'enterprise' },
    (o) => o.headline
  );

  await runAgentTest(55, 'product-description-writer', 'Edge: Minimal input', 'text', 'edge',
    { productName: 'Widget', features: 'useful', tone: 'casual' }
  );

  // Social Media Caption Generator Tests (56-60)
  await runAgentTest(56, 'social-media-caption-generator', 'Instagram product launch', 'text', 'easy',
    { topic: 'new product launch', platform: 'instagram', tone: 'excited' },
    (o) => o.instagram && o.instagram.caption
  );

  await runAgentTest(57, 'social-media-caption-generator', 'LinkedIn thought leadership', 'text', 'moderate',
    { topic: 'AI in business transformation', platform: 'linkedin', tone: 'professional' },
    (o) => o.linkedin
  );

  await runAgentTest(58, 'social-media-caption-generator', 'Twitter tech announcement', 'text', 'easy',
    { topic: 'software update release', platform: 'twitter', tone: 'informative' },
    (o) => o.twitter
  );

  await runAgentTest(59, 'social-media-caption-generator', 'TikTok viral content', 'text', 'moderate',
    { topic: 'behind the scenes office tour', platform: 'tiktok', tone: 'fun' },
    (o) => o.tiktok
  );

  await runAgentTest(60, 'social-media-caption-generator', 'Edge: All platforms', 'text', 'difficult',
    { topic: 'company anniversary celebration', platform: 'all', tone: 'celebratory' }
  );

  // Email Template Generator Tests (61-65)
  await runAgentTest(61, 'email-template-generator', 'Welcome email', 'text', 'easy',
    { purpose: 'welcome new customer', tone: 'friendly', companyName: 'TechCorp' },
    (o) => o.subject && o.body
  );

  await runAgentTest(62, 'email-template-generator', 'Sales follow-up', 'text', 'moderate',
    { purpose: 'follow up on sales demo', tone: 'professional', companyName: 'SalesForce' },
    (o) => o.subject
  );

  await runAgentTest(63, 'email-template-generator', 'Apology email', 'text', 'difficult',
    { purpose: 'apologize for service outage', tone: 'sincere', companyName: 'CloudServices' },
    (o) => o.subject
  );

  await runAgentTest(64, 'email-template-generator', 'Newsletter', 'text', 'moderate',
    { purpose: 'monthly newsletter', tone: 'engaging', companyName: 'NewsDaily' },
    (o) => o.subject
  );

  await runAgentTest(65, 'email-template-generator', 'Edge: Unusual purpose', 'text', 'edge',
    { purpose: 'announce company bankruptcy', tone: 'formal', companyName: 'EndCorp' }
  );

  // SEO Content Optimizer Tests (66-70)
  await runAgentTest(66, 'seo-content-optimizer', 'Basic SEO optimization', 'text', 'easy',
    { content: 'How to improve your website SEO', targetKeywords: 'SEO tips, website optimization' },
    (o) => o.optimizedContent && o.seoScore
  );

  await runAgentTest(67, 'seo-content-optimizer', 'E-commerce SEO', 'text', 'moderate',
    { content: 'Best running shoes for marathon training in 2024', targetKeywords: 'running shoes, marathon, athletic footwear' },
    (o) => o.seoScore
  );

  await runAgentTest(68, 'seo-content-optimizer', 'Technical blog SEO', 'text', 'difficult',
    { content: 'Understanding microservices architecture and its benefits for scalable applications', targetKeywords: 'microservices, architecture, scalability, cloud' },
    (o) => o.seoScore
  );

  await runAgentTest(69, 'seo-content-optimizer', 'Local business SEO', 'text', 'moderate',
    { content: 'Best pizza restaurant in New York City', targetKeywords: 'pizza NYC, best pizza, New York restaurant' },
    (o) => o.seoScore
  );

  await runAgentTest(70, 'seo-content-optimizer', 'Edge: Very short content', 'text', 'edge',
    { content: 'Buy now', targetKeywords: 'purchase, shop' }
  );

  // Video Script Generator Tests (71-75)
  await runAgentTest(71, 'video-script-generator', 'YouTube tutorial', 'text', 'easy',
    { topic: 'How to make coffee at home', platform: 'youtube', duration: '5 minutes' },
    (o) => o.hook && o.mainContent
  );

  await runAgentTest(72, 'video-script-generator', 'TikTok explainer', 'text', 'moderate',
    { topic: '3 productivity hacks', platform: 'tiktok', duration: '60 seconds' },
    (o) => o.hook
  );

  await runAgentTest(73, 'video-script-generator', 'Corporate training', 'text', 'difficult',
    { topic: 'Company compliance training overview', platform: 'internal', duration: '15 minutes' },
    (o) => o.mainContent
  );

  await runAgentTest(74, 'video-script-generator', 'Product demo', 'text', 'moderate',
    { topic: 'Software product demonstration', platform: 'youtube', duration: '10 minutes' },
    (o) => o.hook
  );

  await runAgentTest(75, 'video-script-generator', 'Edge: Very long duration', 'text', 'edge',
    { topic: 'Complete coding bootcamp', platform: 'youtube', duration: '8 hours' }
  );

  // ============================================================================
  // ANALYTICS/DATA AGENTS (Tests 76-85)
  // ============================================================================

  // Smart Data Analyzer Tests (76-80)
  await runAgentTest(76, 'smart-data-analyzer', 'Simple trend analysis', 'analytics', 'easy',
    { data: 'month,sales\nJan,100\nFeb,150\nMar,200\nApr,250', analysisType: 'trend' },
    (o) => o.summary && o.keyFindings
  );

  await runAgentTest(77, 'smart-data-analyzer', 'Correlation analysis', 'analytics', 'moderate',
    { data: 'advertising,sales,customers\n1000,5000,100\n2000,8000,160\n3000,11000,220', analysisType: 'correlation' },
    (o) => o.summary
  );

  await runAgentTest(78, 'smart-data-analyzer', 'Anomaly detection', 'analytics', 'difficult',
    { data: 'date,value\n2024-01,100\n2024-02,105\n2024-03,98\n2024-04,500\n2024-05,102', analysisType: 'anomaly' },
    (o) => o.summary
  );

  await runAgentTest(79, 'smart-data-analyzer', 'Multi-variable analysis', 'analytics', 'difficult',
    { data: 'region,product,sales,profit,returns\nNorth,A,1000,200,50\nSouth,A,1500,350,30\nNorth,B,800,150,20\nSouth,B,1200,280,40', analysisType: 'comprehensive' },
    (o) => o.summary
  );

  await runAgentTest(80, 'smart-data-analyzer', 'Edge: Single data point', 'analytics', 'edge',
    { data: 'value\n42', analysisType: 'trend' }
  );

  // Data Visualization Advisor Tests (81-85)
  await runAgentTest(81, 'data-visualization', 'Time series recommendation', 'analytics', 'easy',
    { dataDescription: 'Monthly sales data for 12 months showing growth trend', visualizationType: 'chart' },
    (o) => o.recommendedChart
  );

  await runAgentTest(82, 'data-visualization', 'Comparison chart', 'analytics', 'moderate',
    { dataDescription: 'Comparing performance of 5 products across 4 regions', visualizationType: 'chart' },
    (o) => o.recommendedChart
  );

  await runAgentTest(83, 'data-visualization', 'Distribution visualization', 'analytics', 'moderate',
    { dataDescription: 'Age distribution of customers from 18 to 80', visualizationType: 'chart' },
    (o) => o.recommendedChart
  );

  await runAgentTest(84, 'data-visualization', 'Complex dashboard', 'analytics', 'difficult',
    { dataDescription: 'Executive dashboard showing KPIs, trends, comparisons, and forecasts', visualizationType: 'dashboard' },
    (o) => o.recommendedChart
  );

  await runAgentTest(85, 'data-visualization', 'Edge: Vague description', 'analytics', 'edge',
    { dataDescription: 'some numbers', visualizationType: 'chart' }
  );

  // ============================================================================
  // BUSINESS/PRODUCTIVITY AGENTS (Tests 86-95)
  // ============================================================================

  // Customer Support Bot Tests (86-88)
  await runAgentTest(86, 'customer-support-bot', 'Return query', 'business', 'easy',
    { query: 'How do I return a product?', context: 'e-commerce store' },
    (o) => o.response
  );

  await runAgentTest(87, 'customer-support-bot', 'Technical support', 'business', 'moderate',
    { query: 'My account is locked and I cannot reset my password', context: 'software service' },
    (o) => o.response
  );

  await runAgentTest(88, 'customer-support-bot', 'Complaint handling', 'business', 'difficult',
    { query: 'I am very unhappy with your service and want to speak to a manager immediately', context: 'telecommunications' },
    (o) => o.response
  );

  // Resume Builder Tests (89-91)
  await runAgentTest(89, 'resume-builder', 'Software engineer resume', 'business', 'easy',
    { name: 'John Doe', title: 'Software Engineer', experience: '5 years', skills: 'JavaScript, React, Node.js' },
    (o) => o.professionalSummary && o.skills
  );

  await runAgentTest(90, 'resume-builder', 'Marketing manager resume', 'business', 'moderate',
    { name: 'Jane Smith', title: 'Marketing Manager', experience: '8 years', skills: 'Digital marketing, SEO, Content strategy, Team leadership' },
    (o) => o.professionalSummary
  );

  await runAgentTest(91, 'resume-builder', 'Entry level resume', 'business', 'moderate',
    { name: 'Fresh Graduate', title: 'Junior Developer', experience: '0 years', skills: 'Python, HTML, CSS' },
    (o) => o.professionalSummary
  );

  // AI Assistant Tests (92-95)
  await runAgentTest(92, 'ai-assistant', 'Simple factual question', 'business', 'easy',
    { message: 'What is the capital of France?' },
    (o) => o.response
  );

  await runAgentTest(93, 'ai-assistant', 'Business advice', 'business', 'moderate',
    { message: 'What are the best practices for remote team management?' },
    (o) => o.response
  );

  await runAgentTest(94, 'ai-assistant', 'Technical explanation', 'business', 'difficult',
    { message: 'Explain the difference between REST and GraphQL APIs with examples' },
    (o) => o.response
  );

  await runAgentTest(95, 'ai-assistant', 'Edge: Ambiguous question', 'business', 'edge',
    { message: 'How long is it?' }
  );

  // ============================================================================
  // VIDEO/AUDIO AGENTS (Tests 96-105)
  // ============================================================================

  // Music Generator Tests (96-98)
  await runAgentTest(96, 'music-generator', 'Electronic music', 'audio', 'easy',
    { prompt: 'upbeat electronic dance music', duration: 8 }
  );

  await runAgentTest(97, 'music-generator', 'Ambient music', 'audio', 'moderate',
    { prompt: 'calm ambient music for meditation', duration: 15 }
  );

  await runAgentTest(98, 'music-generator', 'Cinematic music', 'audio', 'difficult',
    { prompt: 'epic orchestral cinematic music with dramatic buildup', duration: 20 }
  );

  // Voice Cloner Tests (99-100)
  await runAgentTest(99, 'voice-cloner', 'Basic text to speech', 'audio', 'easy',
    { text: 'Hello, this is a test of the text to speech system.', voicePreset: 'en_speaker_6' }
  );

  await runAgentTest(100, 'voice-cloner', 'Long text to speech', 'audio', 'moderate',
    { text: 'Welcome to our comprehensive guide on artificial intelligence. Today we will explore the fascinating world of machine learning and its applications in modern technology.', voicePreset: 'en_speaker_3' }
  );

  // Video Generator Tests (101-102)
  await runAgentTest(101, 'video-generator', 'Image to video', 'video', 'moderate',
    { image: TEST_IMAGES.landscape }
  );

  await runAgentTest(102, 'image-animator', 'Animate still image', 'video', 'moderate',
    { image: TEST_IMAGES.portrait }
  );

  // Object Remover Tests (103-104)
  await runAgentTest(103, 'object-remover', 'Remove object from image', 'image', 'moderate',
    { image: TEST_IMAGES.landscape, mask: TEST_IMAGES.landscape, objectToRemove: 'background element' },
    (o) => o.success
  );

  // Background Replacer Tests (104-105)
  await runAgentTest(104, 'background-replacer', 'Replace with nature background', 'image', 'moderate',
    { image: TEST_IMAGES.portrait, newBackground: 'tropical beach sunset' },
    (o) => o.success
  );

  await runAgentTest(105, 'background-replacer', 'Replace with studio background', 'image', 'easy',
    { image: TEST_IMAGES.portrait, newBackground: 'professional studio white background' },
    (o) => o.success
  );

  // Product Photographer Tests (106-108)
  await runAgentTest(106, 'product-photographer', 'Generate product photo', 'image', 'easy',
    { description: 'luxury watch', background: 'black velvet', style: 'professional' },
    (o) => o.success
  );

  await runAgentTest(107, 'product-photographer', 'Tech product photo', 'image', 'moderate',
    { description: 'modern smartphone', background: 'gradient', style: 'minimal' },
    (o) => o.success
  );

  await runAgentTest(108, 'product-photographer', 'Food product photo', 'image', 'moderate',
    { description: 'gourmet chocolate truffles', background: 'marble surface', style: 'appetizing' },
    (o) => o.success
  );

  // ============================================================================
  // COMBINED/COMPLEX SCENARIOS (Tests 109-115)
  // ============================================================================

  await runAgentTest(109, 'ai-background-generator', 'Generate AI background', 'image', 'moderate',
    { prompt: 'professional office background', style: 'realistic' }
  );

  await runAgentTest(110, 'pro-headshot-generator', 'Professional headshot', 'image', 'moderate',
    { description: 'executive headshot', style: 'corporate' }
  );

  await runAgentTest(111, 'ai-model-swap', 'Model swap', 'image', 'difficult',
    { sourceImage: TEST_IMAGES.portrait, targetImage: TEST_IMAGES.portrait2 }
  );

  await runAgentTest(112, 'image-translator', 'Translate image text', 'image', 'moderate',
    { image: TEST_IMAGES.product, targetLanguage: 'Spanish' }
  );

  await runAgentTest(113, 'meeting-transcriber', 'Transcribe meeting', 'text', 'moderate',
    { transcript: 'John: We need to finish the project by Friday.\nMary: I agree. The budget is $5000.' }
  );

  await runAgentTest(114, 'lip-sync', 'Lip sync video', 'video', 'difficult',
    { video: TEST_IMAGES.portrait, audio: 'https://example.com/audio.mp3' }
  );

  await runAgentTest(115, 'talking-avatar', 'Create talking avatar', 'video', 'difficult',
    { image: TEST_IMAGES.portrait, text: 'Hello, welcome to our presentation.' }
  );

  // Print summary
  console.log('\n========================================');
  console.log('TEST SUMMARY');
  console.log('========================================\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log(`Total: ${total}`);
  console.log(`Passed: ${passed} (${((passed/total)*100).toFixed(1)}%)`);
  console.log(`Failed: ${failed} (${((failed/total)*100).toFixed(1)}%)`);

  console.log('\nFailed Tests:');
  results.filter(r => !r.passed).forEach(r => {
    console.log(`  [${r.testId}] ${r.agent}: ${r.testName}`);
    console.log(`      Error: ${r.error?.substring(0, 100)}`);
  });

  console.log('\nBy Category:');
  const categories = [...new Set(results.map(r => r.category))];
  categories.forEach(cat => {
    const catResults = results.filter(r => r.category === cat);
    const catPassed = catResults.filter(r => r.passed).length;
    console.log(`  ${cat}: ${catPassed}/${catResults.length} passed`);
  });

  console.log('\nBy Difficulty:');
  const difficulties = ['easy', 'moderate', 'difficult', 'edge'];
  difficulties.forEach(diff => {
    const diffResults = results.filter(r => r.difficulty === diff);
    const diffPassed = diffResults.filter(r => r.passed).length;
    console.log(`  ${diff}: ${diffPassed}/${diffResults.length} passed`);
  });

  return results;
}

// Run if executed directly
if (typeof process !== 'undefined' && process.argv[1]?.includes('comprehensive-agent-tests')) {
  runAllTests().then(results => {
    const failedCount = results.filter(r => !r.passed).length;
    process.exit(failedCount > 0 ? 1 : 0);
  });
}

export { results, TestResult };
