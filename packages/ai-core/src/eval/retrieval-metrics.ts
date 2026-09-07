/**
 * Pure ranking-quality metrics for retrieval evaluation. Every function takes a
 * list of retrieved chunk ids (best first) and a description of which ids are
 * relevant, and returns a single number in [0, 1]. Nothing here touches the
 * database or an embedding model — the API service resolves `relevantText`
 * substrings into an id set before calling these.
 */

function toSet(relevant: Iterable<string>): Set<string> {
  return relevant instanceof Set ? relevant : new Set(relevant);
}

/** Fraction of relevant ids that appear in the top `k`. Vacuously 1 when nothing is relevant. */
export function recallAtK(retrieved: string[], relevant: Iterable<string>, k: number): number {
  const rel = toSet(relevant);
  if (rel.size === 0) return 1;
  const top = retrieved.slice(0, k);
  const found = top.filter((id) => rel.has(id)).length;
  return found / rel.size;
}

/** Fraction of the top `k` retrieved ids that are relevant. Denominator is `min(k, retrieved.length)`. */
export function precisionAtK(retrieved: string[], relevant: Iterable<string>, k: number): number {
  const rel = toSet(relevant);
  const top = retrieved.slice(0, k);
  if (top.length === 0) return 0;
  const found = top.filter((id) => rel.has(id)).length;
  return found / top.length;
}

/** `1 / rank` of the first relevant id (1-based), or 0 if none is retrieved. */
export function reciprocalRank(retrieved: string[], relevant: Iterable<string>): number {
  const rel = toSet(relevant);
  for (let i = 0; i < retrieved.length; i++) {
    if (rel.has(retrieved[i]!)) return 1 / (i + 1);
  }
  return 0;
}

/** 1 if any relevant id is in the top `k`, else 0 (also called success@k). */
export function hitRate(retrieved: string[], relevant: Iterable<string>, k: number): number {
  const rel = toSet(relevant);
  return retrieved.slice(0, k).some((id) => rel.has(id)) ? 1 : 0;
}

function dcg(gains: number[]): number {
  return gains.reduce((sum, gain, i) => sum + (2 ** gain - 1) / Math.log2(i + 2), 0);
}

/**
 * Normalized discounted cumulative gain over the top `k`. `gradeById` maps an id
 * to its graded relevance (0 when absent); binary relevance is the `{id: 1}`
 * case. Returns 0 when no graded id exists.
 */
export function ndcgAtK(
  retrieved: string[],
  gradeById: Record<string, number> | Map<string, number>,
  k: number,
): number {
  const grade = (id: string): number =>
    gradeById instanceof Map ? (gradeById.get(id) ?? 0) : (gradeById[id] ?? 0);
  const idealGrades = (
    gradeById instanceof Map ? [...gradeById.values()] : Object.values(gradeById)
  )
    .filter((g) => g > 0)
    .sort((a, b) => b - a);

  const actual = dcg(retrieved.slice(0, k).map(grade));
  const ideal = dcg(idealGrades.slice(0, k));
  return ideal === 0 ? 0 : actual / ideal;
}
