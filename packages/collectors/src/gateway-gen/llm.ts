const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const REQUESTY_ENDPOINT = 'https://router.requesty.ai/v1/chat/completions';

export interface LlmConfig {
  prompt: string;
  temperature?: number;
}

export type Provider = 'gemini' | 'openrouter' | 'requesty';

function resolveProviders(env: NodeJS.ProcessEnv): Provider[] {
  const forced = env.LLM_PROVIDER;
  if (forced === 'openrouter' || forced === 'gemini' || forced === 'requesty') return [forced];
  const list: Provider[] = [];
  if (env.REQUESTY_API_KEY) list.push('requesty');
  if (env.GEMINI_API_KEY) list.push('gemini');
  if (env.OPENROUTER_API_KEY) list.push('openrouter');
  if (list.length === 0) {
    throw new Error(
      'No LLM provider configured. Set REQUESTY_API_KEY, GEMINI_API_KEY, or ' +
        'OPENROUTER_API_KEY (all have free tiers) to generate gateway plugins.',
    );
  }
  return list;
}

async function callRequesty(prompt: string, env: NodeJS.ProcessEnv): Promise<string> {
  const apiKey = env.REQUESTY_API_KEY;
  const model = env.REQUESTY_MODEL ?? 'mistral/leanstral-1-5';
  const response = await fetch(REQUESTY_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://basemodel.ai',
      'X-Title': 'BaseModel gateway generator',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      max_tokens: 8192,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Requesty HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('Requesty returned an empty response.');
  return text;
}

async function callGemini(prompt: string, env: NodeJS.ProcessEnv): Promise<string> {
  const apiKey = env.GEMINI_API_KEY;
  const model = env.GEMINI_MODEL ?? 'gemini-flash-lite-latest';
  const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gemini HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('');
  if (!text) throw new Error('Gemini returned an empty response.');
  return text;
}

const OPENROUTER_FREE_CANDIDATES = [
  'cohere/north-mini-code:free',
  'google/gemma-4-31b-it:free',
  'openai/gpt-oss-20b:free',
  'google/gemma-4-26b-a4b-it:free',
  'poolside/laguna-s-2.1:free',
];

async function callOpenRouter(prompt: string, env: NodeJS.ProcessEnv): Promise<string> {
  const apiKey = env.OPENROUTER_API_KEY;
  const candidates = env.OPENROUTER_MODEL ? [env.OPENROUTER_MODEL] : OPENROUTER_FREE_CANDIDATES;
  const failures: string[] = [];
  for (const model of candidates) {
    try {
      const response = await fetch(OPENROUTER_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://basemodel.ai',
          'X-Title': 'BaseModel gateway generator',
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.2,
          max_tokens: 8192,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 200)}`);
      }
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('empty response');
      return text;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${model}: ${message}`);
      console.warn(`[llm] openrouter ${model} failed: ${message}`);
    }
  }
  throw new Error(`OpenRouter failed on all candidate models: ${failures.join(' | ')}`);
}

export async function generateText(
  config: LlmConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const providers = resolveProviders(env);
  const failures: string[] = [];
  for (const provider of providers) {
    try {
      if (provider === 'gemini') return await callGemini(config.prompt, env);
      if (provider === 'openrouter') return await callOpenRouter(config.prompt, env);
      return await callRequesty(config.prompt, env);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${provider}: ${message}`);
      console.warn(
        `[llm] ${provider} failed, ${providers.length > 1 ? 'trying next provider' : 'no fallback left'}: ${message}`,
      );
    }
  }
  throw new Error(`All LLM providers failed: ${failures.join(' | ')}`);
}
