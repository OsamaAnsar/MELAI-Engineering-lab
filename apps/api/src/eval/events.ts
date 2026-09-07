export type EvalEvent =
  | { type: "case.started"; evalRunId: string; caseResultId: string }
  | { type: "case.completed"; evalRunId: string; caseResultId: string; status: "success" | "error" }
  | { type: "eval_run.done"; evalRunId: string };

type Listener = (event: EvalEvent) => void;

/**
 * In-process pub/sub for eval-run progress — same shape as RetrievalEvents.
 * One instance per Fastify app (created in buildApp) so test apps don't share a bus.
 */
export class EvalEvents {
  readonly #listeners = new Map<string, Set<Listener>>();

  subscribe(evalRunId: string, listener: Listener): () => void {
    let set = this.#listeners.get(evalRunId);
    if (!set) {
      set = new Set();
      this.#listeners.set(evalRunId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) this.#listeners.delete(evalRunId);
    };
  }

  emit(event: EvalEvent): void {
    const set = this.#listeners.get(event.evalRunId);
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
