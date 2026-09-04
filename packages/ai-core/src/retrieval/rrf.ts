export interface RankedItem {
  id: string;
  /** 1-based rank. */
  rank: number;
}

export interface FusedItem {
  id: string;
  score: number;
}

/**
 * Reciprocal Rank Fusion: combines multiple ranked lists into one fused
 * ranking. Default k=60 matches the conventional RRF constant.
 */
export function reciprocalRankFusion(rankings: RankedItem[][], k = 60): FusedItem[] {
  const scores = new Map<string, number>();
  for (const ranking of rankings) {
    for (const { id, rank } of ranking) {
      scores.set(id, (scores.get(id) ?? 0) + 1 / (k + rank));
    }
  }
  return [...scores.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);
}

/** Converts a score-descending match list into 1-based ranks, for feeding into reciprocalRankFusion. */
export function toRanked(matches: { id: string; score: number }[]): RankedItem[] {
  return matches
    .slice()
    .sort((a, b) => b.score - a.score)
    .map((m, i) => ({ id: m.id, rank: i + 1 }));
}
