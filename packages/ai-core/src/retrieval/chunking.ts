export interface Chunk {
  index: number;
  content: string;
  /** Whitespace-word count — an approximation, not an exact tokenizer count. */
  tokenCount: number;
}

function approximateTokenCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export interface FixedChunkOptions {
  /** Target chunk size in characters. */
  chunkSize: number;
  /** Characters of overlap between consecutive chunks. */
  overlap: number;
}

/** Splits text into fixed-size, overlapping character windows. */
export function chunkFixed(text: string, options: FixedChunkOptions): Chunk[] {
  const { chunkSize, overlap } = options;
  if (chunkSize <= 0) throw new Error("chunkSize must be positive");
  if (overlap < 0 || overlap >= chunkSize) throw new Error("overlap must be in [0, chunkSize)");

  const trimmed = text.trim();
  if (trimmed === "") return [];

  const chunks: Chunk[] = [];
  const step = chunkSize - overlap;
  let index = 0;
  for (let start = 0; start < trimmed.length; start += step) {
    const content = trimmed.slice(start, start + chunkSize);
    chunks.push({ index, content, tokenCount: approximateTokenCount(content) });
    index += 1;
    if (start + chunkSize >= trimmed.length) break;
  }
  return chunks;
}

export interface SentenceChunkOptions {
  /** Target maximum chunk size in characters; sentences are packed greedily up to this. */
  maxChunkSize: number;
}

const SENTENCE_BOUNDARY = /(?<=[.!?])\s+/;

/** Splits text into sentences, then greedily packs sentences into chunks up to maxChunkSize. */
export function chunkBySentence(text: string, options: SentenceChunkOptions): Chunk[] {
  const { maxChunkSize } = options;
  if (maxChunkSize <= 0) throw new Error("maxChunkSize must be positive");

  const sentences = text
    .trim()
    .split(SENTENCE_BOUNDARY)
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length === 0) return [];

  const chunks: Chunk[] = [];
  let current: string[] = [];
  let index = 0;

  const flush = () => {
    if (current.length === 0) return;
    const content = current.join(" ");
    chunks.push({ index, content, tokenCount: approximateTokenCount(content) });
    index += 1;
    current = [];
  };

  for (const sentence of sentences) {
    const candidate = current.length === 0 ? sentence : `${current.join(" ")} ${sentence}`;
    if (candidate.length > maxChunkSize && current.length > 0) {
      flush();
    }
    current.push(sentence);
  }
  flush();

  return chunks;
}
