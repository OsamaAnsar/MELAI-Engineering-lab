export type RunEvent =
  | { type: "run.started"; experimentId: string; runId: string; modelId: string }
  | { type: "run.completed"; experimentId: string; runId: string; status: "success" | "error" }
  | { type: "experiment.done"; experimentId: string };

type Listener = (event: RunEvent) => void;

/**
 * In-process pub/sub for experiment run progress. One instance per Fastify app
 * (created in buildApp) so test apps don't share a bus.
 */
export class ExperimentEvents {
  readonly #listeners = new Map<string, Set<Listener>>();

  subscribe(experimentId: string, listener: Listener): () => void {
    let set = this.#listeners.get(experimentId);
    if (!set) {
      set = new Set();
      this.#listeners.set(experimentId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) this.#listeners.delete(experimentId);
    };
  }

  emit(event: RunEvent): void {
    const set = this.#listeners.get(event.experimentId);
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
