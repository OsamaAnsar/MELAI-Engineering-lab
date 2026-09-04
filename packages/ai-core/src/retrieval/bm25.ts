export interface Bm25Document {
  id: string;
  content: string;
}

export interface Bm25Match {
  id: string;
  score: number;
}

export interface Bm25Options {
  k1?: number;
  b?: number;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * From-scratch Okapi BM25 index. Defaults (k1=1.5, b=0.75) match the
 * conventional values used elsewhere in this project's RAG work.
 */
export class Bm25Index {
  private readonly k1: number;
  private readonly b: number;
  private readonly docIds: string[];
  private readonly docTermFreqs: Map<string, number>[];
  private readonly docLengths: number[];
  private readonly avgDocLength: number;
  private readonly docFreq: Map<string, number>;
  private readonly docCount: number;

  constructor(documents: Bm25Document[], options: Bm25Options = {}) {
    this.k1 = options.k1 ?? 1.5;
    this.b = options.b ?? 0.75;
    this.docCount = documents.length;
    this.docIds = documents.map((d) => d.id);
    this.docTermFreqs = [];
    this.docLengths = [];
    this.docFreq = new Map();

    let totalLength = 0;
    for (const doc of documents) {
      const tokens = tokenize(doc.content);
      totalLength += tokens.length;
      this.docLengths.push(tokens.length);

      const termFreq = new Map<string, number>();
      for (const token of tokens) {
        termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
      }
      this.docTermFreqs.push(termFreq);

      for (const term of termFreq.keys()) {
        this.docFreq.set(term, (this.docFreq.get(term) ?? 0) + 1);
      }
    }
    this.avgDocLength = this.docCount === 0 ? 0 : totalLength / this.docCount;
  }

  private idf(term: string): number {
    const df = this.docFreq.get(term) ?? 0;
    // Standard BM25 IDF with a +1 inside the log to keep it non-negative for common terms.
    return Math.log((this.docCount - df + 0.5) / (df + 0.5) + 1);
  }

  /** Scores every document against the query, returns the top K by descending score. */
  search(query: string, topK: number): Bm25Match[] {
    const queryTerms = tokenize(query);
    const scores: Bm25Match[] = this.docIds.map((id, i) => {
      const termFreq = this.docTermFreqs[i]!;
      const docLength = this.docLengths[i]!;
      let score = 0;
      for (const term of queryTerms) {
        const tf = termFreq.get(term) ?? 0;
        if (tf === 0) continue;
        const idf = this.idf(term);
        const numerator = tf * (this.k1 + 1);
        const denominator =
          tf + this.k1 * (1 - this.b + this.b * (docLength / (this.avgDocLength || 1)));
        score += idf * (numerator / denominator);
      }
      return { id, score };
    });

    return scores
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}
