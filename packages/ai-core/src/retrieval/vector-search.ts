export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface VectorMatch {
  id: string;
  score: number;
}

export interface VectorCandidate {
  id: string;
  vector: number[];
}

/**
 * In-memory cosine-similarity ranking. The DB-backed path uses pgvector's
 * `<=>` operator directly in SQL instead of loading every vector into
 * memory; this pure function is the tested reference implementation and is
 * what the mock/test path uses.
 */
export function vectorSearch(
  query: number[],
  candidates: VectorCandidate[],
  topK: number,
): VectorMatch[] {
  return candidates
    .map((c) => ({ id: c.id, score: cosineSimilarity(query, c.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
