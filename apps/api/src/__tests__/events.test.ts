import { describe, expect, test, vi } from "vitest";
import { ExperimentEvents, type RunEvent } from "../experiments/events.js";

const done = (id: string): RunEvent => ({ type: "experiment.done", experimentId: id });

describe("ExperimentEvents", () => {
  test("delivers events only to subscribers of that experiment id", () => {
    const bus = new ExperimentEvents();
    const a = vi.fn();
    const b = vi.fn();
    bus.subscribe("exp-a", a);
    bus.subscribe("exp-b", b);

    bus.emit(done("exp-a"));

    expect(a).toHaveBeenCalledWith(done("exp-a"));
    expect(b).not.toHaveBeenCalled();
  });

  test("unsubscribe stops further delivery", () => {
    const bus = new ExperimentEvents();
    const listener = vi.fn();
    const off = bus.subscribe("exp", listener);

    bus.emit(done("exp"));
    off();
    bus.emit(done("exp"));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("a throwing subscriber does not block the others", () => {
    const bus = new ExperimentEvents();
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    bus.subscribe("exp", bad);
    bus.subscribe("exp", good);

    expect(() => bus.emit(done("exp"))).not.toThrow();
    expect(good).toHaveBeenCalledOnce();
  });

  test("emitting to an id with no subscribers is a no-op", () => {
    expect(() => new ExperimentEvents().emit(done("nobody"))).not.toThrow();
  });
});
