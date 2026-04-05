const MODEL = 'text-embedding-3-small';
const API = 'https://api.openai.com/v1/embeddings';

export async function generateEmbedding(text: string): Promise<number[]> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      input: text,
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI embeddings failed: ${res.status} ${errBody}`);
  }
  const data = (await res.json()) as {
    data?: Array<{ embedding: number[] }>;
  };
  const emb = data.data?.[0]?.embedding;
  if (!emb) throw new Error('OpenAI embeddings: missing embedding in response');
  return emb;
}
