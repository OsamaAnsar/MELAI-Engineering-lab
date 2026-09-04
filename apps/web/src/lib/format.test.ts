import { describe, expect, test } from "vitest";
import { timeAgo } from "./format.js";

describe("timeAgo", () => {
  const now = Date.parse("2026-09-04T12:00:00Z");

  test("seconds", () => {
    expect(timeAgo("2026-09-04T11:59:48Z", now)).toBe("12s ago");
  });

  test("minutes", () => {
    expect(timeAgo("2026-09-04T11:45:00Z", now)).toBe("15m ago");
  });

  test("hours", () => {
    expect(timeAgo("2026-09-04T09:00:00Z", now)).toBe("3h ago");
  });

  test("falls back to a date past a day", () => {
    expect(timeAgo("2026-09-01T12:00:00Z", now)).toBe(
      new Date("2026-09-01T12:00:00Z").toLocaleDateString(),
    );
  });
});
