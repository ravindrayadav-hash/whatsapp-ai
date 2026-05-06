import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

console.log('API Key:', process.env.GEMINI_API_KEY?.slice(0, 10) + '...');
console.log('SDK version check — listing available models via REST...\n');

// Use raw fetch to list models — works regardless of SDK version
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`
);

const data = await res.json();

if (data.error) {
  console.error('API Error:', data.error);
  process.exit(1);
}

const models = data.models || [];
const generativeModels = models.filter(m =>
  m.supportedGenerationMethods?.includes('generateContent')
);

console.log(`Found ${generativeModels.length} models that support generateContent:\n`);
for (const m of generativeModels) {
  console.log(`  ${m.name.replace('models/', '')}`);
}
