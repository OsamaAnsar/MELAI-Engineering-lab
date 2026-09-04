export type RetrievalEvent =
  | { type: "result.started"; retrievalRunId: string; resultId: string; retrievalConfigId: string }
  | {
      type: "result.completed";
      retrievalRunId: string;
      resultId: string;
      status: "success" | "error";
    }
  | { type: "retrieval_run.done"; retrievalRunId: string };

type Listener = (event: RetrievalEvent) => void;

/**
 * In-process pub/sub for retrieval-run progress — same shape as ExperimentEvents.
 * One instance per Fastify app (created in buildApp) so test apps don't share a bus.
 */
export class RetrievalEvents {
  readonly #listeners = new Map<string, Set<Listener>>();

  subscribe(retrievalRunId: string, listener: Listener): () => void {
    let set = this.#listeners.get(retrievalRunId);
    if (!set) {
      set = new Set();
      this.#listeners.set(retrievalRunId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) this.#listeners.delete(retrievalRunId);
    };
  }

  emit(event: RetrievalEvent): void {
    const set = this.#listeners.get(event.retrievalRunId);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener(event);
      } catch {
        // a broken subscriber must not stop the others
      }
    }
  }
}
