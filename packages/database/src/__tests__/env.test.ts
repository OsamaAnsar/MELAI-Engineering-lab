import { expect, test } from "vitest";
import { getDatabaseUrl } from "../index.js";

test("accepts a postgres connection string", () => {
  expect(getDatabaseUrl({ DATABASE_URL: "postgres://u:p@localhost:5432/db" })).toBe(
    "postgres://u:p@localhost:5432/db",
  );
});

test("rejects a non-postgres url", () => {
  expect(() => getDatabaseUrl({ DATABASE_URL: "mysql://localhost/db" })).toThrow();
});

test("rejects a missing url", () => {
  expect(() => getDatabaseUrl({})).toThrow();
});
