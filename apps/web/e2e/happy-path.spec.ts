import { expect, test } from "@playwright/test";

test("build a mock experiment, run it, and see the result column", async ({ page }) => {
  const prompt = `e2e hello ${Date.now()}`;

  await page.goto("/experiments/new");

  await page.getByPlaceholder("Explain how HNSW neighbor selection works.").fill(prompt);
  await page.getByRole("button", { name: "Mock (echo)" }).click();
  await page.getByRole("button", { name: "Run experiment" }).click();

  await expect(page).toHaveURL(/\/experiments\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: prompt })).toBeVisible();
  await expect(page.getByText("Mock (echo)")).toBeVisible();

  // The mock provider echoes the prompt back; SSE drives pending -> success.
  await expect(page.getByText(/Mock response to:/)).toBeVisible();
  await expect(page.getByText("success")).toBeVisible();
});

test("dashboard lists the experiment that was just run", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "MELAI Engineering Lab" })).toBeVisible();
  await expect(page.getByText("Recent experiments")).toBeVisible();
  await expect(page.getByRole("link", { name: /e2e hello/ }).first()).toBeVisible();
});
