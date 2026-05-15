import { env } from '@/core/env';

async function postJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`AI_REQUEST_FAILED_${res.status}`);
  return res.json() as Promise<{ choices?: Array<{ message?: { content?: string } }> }>;
}

export type AskOptions = { json?: boolean; model?: string };

export async function askGroq(prompt: string, options: AskOptions = {}) {
  if (!env.GROQ_API_KEY) throw new Error('GROQ_API_KEY_NOT_CONFIGURED');
  const model = options.model ?? (options.json ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant');
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  };
  if (options.json) body.response_format = { type: 'json_object' };
  const data = await postJson(
    'https://api.groq.com/openai/v1/chat/completions',
    { authorization: `Bearer ${env.GROQ_API_KEY}` },
    body,
  );
  return data.choices?.[0]?.message?.content ?? '';
}

export async function askOpenAI(prompt: string, options: AskOptions = {}) {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY_NOT_CONFIGURED');
  const body: Record<string, unknown> = {
    model: options.model ?? 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  };
  if (options.json) body.response_format = { type: 'json_object' };
  const data = await postJson(
    'https://api.openai.com/v1/chat/completions',
    { authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body,
  );
  return data.choices?.[0]?.message?.content ?? '';
}

export async function askBestAvailable(prompt: string, options: AskOptions = {}) {
  if (env.GROQ_API_KEY) return askGroq(prompt, options);
  return askOpenAI(prompt, options);
}
