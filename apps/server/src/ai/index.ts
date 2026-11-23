import type { AIProvider } from './provider.js';
import { MockAIProvider } from './mock-provider.js';
import { OpenAICompatibleProvider } from './openai-provider.js';

export * from './provider.js';
export * from './templates.js';
export * from './mock-provider.js';
export * from './openai-provider.js';
export * from './spec-stream.js';
export * from './layout-intent.js';

export function createAIProviderFromEnv(): AIProvider {
  const mode = (process.env.AI_PROVIDER || 'mock').toLowerCase();
  if (mode === 'openai' || mode === 'openai-compatible') {
    const apiKey = process.env.OPENAI_API_KEY || '';
    if (apiKey) {
      return new OpenAICompatibleProvider({
        apiKey,
        baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      });
    }
    console.warn(
      '[AIProvider] AI_PROVIDER is set to OpenAI, but OPENAI_API_KEY is empty. Falling back to MockAIProvider.',
    );
  }
  return new MockAIProvider();
}
