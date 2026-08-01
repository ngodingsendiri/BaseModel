const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export interface LlmConfig {
  prompt: string;
  temperature?: number;
}

type Provider = 'gemini' | 'openrouter';

function pickProvider(env: NodeJS.ProcessEnv): Provider {
  if (env.GEMINI_API_KEY) return 'gemini';
  if (env.OPENROUTER_API_KEY) return 'openrouter';
  throw new Error(
    'No LLM provider configured. Set GEMINI_API_KEY (Gemini free tier) or ' +
      'OPENROUTER_API_KEY (free models) to generate gateway plugins.',
  );
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

async function callOpenRouter(prompt: string, env: NodeJS.ProcessEnv): Promise<string> {
  const apiKey = env.OPENROUTER_API_KEY;
  const model = env.OPENROUTER_MODEL ?? 'deepseek/deepseek-chat-v3-0324:free';
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
    throw new Error(`OpenRouter HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenRouter returned an empty response.');
  return text;
}

export async function generateText(
  config: LlmConfig,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string> {
  const provider = pickProvider(env);
  if (provider === 'gemini') return callGemini(config.prompt, env);
  return callOpenRouter(config.prompt, env);
}
