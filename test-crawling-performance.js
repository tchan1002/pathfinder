// Test script to compare crawling performance
const { performance } = require('perf_hooks');

async function testDirectCrawling() {
  console.log('🚀 Testing direct Pathfinder crawling...');
  const start = performance.now();
  
  try {
    const response = await fetch('https://pathfinder-bay-mu.vercel.app/api/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        siteId: 'test-site-id',
        startUrl: 'https://www.edisonhealth.org/'
      })
    });
    
    const end = performance.now();
    console.log(`✅ Direct crawling completed in ${(end - start).toFixed(2)}ms`);
    console.log(`📊 Response status: ${response.status}`);
    
    const data = await response.json();
    console.log(`📄 Pages crawled: ${data.crawled?.length || 0}`);
    
  } catch (error) {
    console.error('❌ Direct crawling failed:', error.message);
  }
}

async function testSherpaCrawling() {
  console.log('🔄 Testing Sherpa analyze endpoint...');
  const start = performance.now();
  
  try {
    const response = await fetch('https://pathfinder-bay-mu.vercel.app/api/sherpa/v1/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_url: 'https://www.edisonhealth.org/',
        domain_limit: null,
        user_id: null,
        max_pages: null
      })
    });
    
    const end = performance.now();
    console.log(`✅ Sherpa analyze completed in ${(end - start).toFixed(2)}ms`);
    console.log(`📊 Response status: ${response.status}`);
    
    const data = await response.json();
    console.log(`📄 Response mode: ${data.mode}`);
    console.log(`🆔 Job ID: ${data.job_id}`);
    
  } catch (error) {
    console.error('❌ Sherpa analyze failed:', error.message);
  }
}

async function runTests() {
  console.log('🧪 Starting crawling performance tests...\n');
  
  await testDirectCrawling();
  console.log('');
  await testSherpaCrawling();
  
  console.log('\n📊 Performance comparison complete!');
}

runTests().catch(console.error);
