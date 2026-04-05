import { generateEmbedding } from './embedding.js';
import { cosineSimilarity } from '../utils/similarity.js';
import type { Row } from '../db/index.js';

export type MatchedEntry = {
  id: string;
  content: string;
  score: number;
};

const MS_PER_HOUR = 60 * 60 * 1000;

function parseCreatedAt(createdAt: string | null): number {
  if (!createdAt) return 0;
  const t = Date.parse(createdAt);
  return Number.isNaN(t) ? 0 : t;
}

function isWithinHours(createdAt: string | null, maxAgeHours: number): boolean {
  const age = Date.now() - parseCreatedAt(createdAt);
  return age >= 0 && age <= maxAgeHours * MS_PER_HOUR;
}

/**
 * Map OS app name → short context phrase for embedding similarity.
 */
export function activeAppToContextPhrase(activeApp: string): string | null {
  const a = activeApp;
  if (a.includes('Chrome')) return 'browser email web';
  if (a.includes('Mail')) return 'email communication';
  if (a.includes('Code')) return 'coding programming';
  return null;
}

/**
 * Semantic match of context phrase against stored entry embeddings.
 */
export async function getRelevantEntries(
  contextPhrase: string,
  rows: Row[],
  options: { maxAgeHours: number; minScore: number; limit: number },
): Promise<MatchedEntry[]> {
  const ctxEmb = await generateEmbedding(contextPhrase);
  const scored: MatchedEntry[] = [];
  for (const r of rows) {
    if (!r.embedding) continue;
    if (!isWithinHours(r.created_at, options.maxAgeHours)) continue;
    let emb: number[];
    try {
      emb = JSON.parse(r.embedding) as number[];
    } catch {
      continue;
    }
    const score = cosineSimilarity(ctxEmb, emb);
    if (score < options.minScore) continue;
    scored.push({
      id: r.id,
      content: r.content ?? '',
      score,
    });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, options.limit);
}
