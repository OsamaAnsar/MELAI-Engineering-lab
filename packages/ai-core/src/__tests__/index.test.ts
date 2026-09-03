import { expect, test } from "vitest";
import { PACKAGE_NAME } from "../index.js";

test("package exposes its name", () => {
  expect(PACKAGE_NAME).toBe("@melai/ai-core");
});
