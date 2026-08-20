import { test, expect } from "../playwright-fixture";

/**
 * E2E: the "Ver N mensagens novas" counter must stay consistent as the user
 * clicks items on the mini-listado AND new INSERTs arrive in realtime.
 *
 * Drives the deterministic harness at /dev/inbox-unread that wires the exact
 * same helpers used by /inbox (addIncoming / markUpTo / pruneRemoved /
 * pruneBySeen) but lets us trigger inserts/clicks via buttons.
 */

const HARNESS = "/dev/inbox-unread";

const counterText = async (page) =>
  (await page.getByTestId("counter").textContent())?.trim() ?? "";

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS);
  await expect(page.getByTestId("harness")).toBeVisible();
  await expect(page.getByTestId("counter")).toHaveText("0 não lidas");
});

test("counter increases as INSERTs arrive", async ({ page }) => {
  await page.getByTestId("btn-insert").click();
  await expect(page.getByTestId("counter")).toHaveText("Ver 1 mensagem nova");

  await page.getByTestId("btn-insert").click();
  await expect(page.getByTestId("counter")).toHaveText("Ver 2 mensagens novas");

  await page.getByTestId("btn-insert").click();
  await expect(page.getByTestId("counter")).toHaveText("Ver 3 mensagens novas");
});

test("clicking a mini-listado item marks it (and older) as read", async ({ page }) => {
  await page.getByTestId("btn-insert").click(); // m1
  await page.getByTestId("btn-insert").click(); // m2
  await page.getByTestId("btn-insert").click(); // m3
  await expect(page.getByTestId("counter")).toHaveText("Ver 3 mensagens novas");

  // Click middle item → m1 and m2 cleared, m3 still unread.
  await page.getByTestId("mini-m2").click();
  await expect(page.getByTestId("counter")).toHaveText("Ver 1 mensagem nova");
  await expect(page.getByTestId("mini-m1")).toHaveAttribute("data-unread", "0");
  await expect(page.getByTestId("mini-m2")).toHaveAttribute("data-unread", "0");
  await expect(page.getByTestId("mini-m3")).toHaveAttribute("data-unread", "1");

  // Click last item → counter zeros out.
  await page.getByTestId("mini-m3").click();
  await expect(page.getByTestId("counter")).toHaveText("0 não lidas");
});

test("INSERT that arrives mid-click keeps the new arrival counted", async ({ page }) => {
  await page.getByTestId("btn-insert").click(); // m1
  await page.getByTestId("btn-insert").click(); // m2
  await expect(page.getByTestId("counter")).toHaveText("Ver 2 mensagens novas");

  // User clicks m2 — clears m1 + m2…
  await page.getByTestId("mini-m2").click();
  await expect(page.getByTestId("counter")).toHaveText("0 não lidas");

  // …and *then* a brand-new INSERT lands. It must NOT be swallowed.
  await page.getByTestId("btn-insert").click(); // m3
  await expect(page.getByTestId("counter")).toHaveText("Ver 1 mensagem nova");
  await expect(page.getByTestId("mini-m3")).toHaveAttribute("data-unread", "1");
});

test("own messages never count as unread", async ({ page }) => {
  await page.getByTestId("btn-insert").click(); // m1 from other
  await expect(page.getByTestId("counter")).toHaveText("Ver 1 mensagem nova");

  await page.getByTestId("btn-insert-own").click(); // mine — ignored
  await page.getByTestId("btn-insert-own").click(); // mine — ignored
  await expect(page.getByTestId("counter")).toHaveText("Ver 1 mensagem nova");

  await page.getByTestId("btn-insert").click(); // another from other
  await expect(page.getByTestId("counter")).toHaveText("Ver 2 mensagens novas");
});

test("external 'seen all' (cross-tab) wipes the unread set", async ({ page }) => {
  await page.getByTestId("btn-insert").click();
  await page.getByTestId("btn-insert").click();
  await expect(page.getByTestId("counter")).toHaveText("Ver 2 mensagens novas");

  await page.getByTestId("btn-external-seen-all").click();
  await expect(page.getByTestId("counter")).toHaveText("0 não lidas");
});
