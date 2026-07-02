/**
 * Browser smoke test for row action clicks against the Vite dev server.
 * Run: npm run dev (separate terminal), then node scripts/row-clicks-browser.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.RESTPILOT_DEV_URL ?? "http://127.0.0.1:1420/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  page.on("pageerror", (error) => {
    console.warn("page error (ignored):", error.message);
  });

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector("#app .collection-sidebar", { timeout: 20000 });
  await page.waitForFunction(() => Boolean(window.__restpilotAppActions), { timeout: 20000 });

  await page.evaluate(() => {
    document.querySelector("[data-title-bar-sidebar]")?.click();
  });
  await page.waitForFunction(() => document.querySelector("#app.is-sidebar-hidden"), { timeout: 5000 });
  await page.evaluate(() => {
    document.querySelector("[data-title-bar-sidebar]")?.click();
  });
  await page.waitForFunction(() => !document.querySelector("#app.is-sidebar-hidden"), { timeout: 5000 });
  console.log("OK: sidebar toggle click");

  await page.evaluate(() => {
    document.querySelector("[data-title-bar-settings]")?.click();
  });
  await page.waitForSelector(".settings-dialog, .app-dialog", { timeout: 5000 });
  await page.keyboard.press("Escape");
  console.log("OK: settings click");

  await page.evaluate(() => {
    document.querySelector('[data-activity="request"]')?.click();
  });
  const treeRowCount = await page.locator(".tree-row").count();
  if (!treeRowCount) {
    await page.locator(".sidebar-action-menu").first().evaluate((menu) => {
      menu.setAttribute("open", "");
    });
    await page.locator("#new-request").click();
    await page.waitForSelector(".tree-row", { timeout: 10000 });
  }

  await page.evaluate(() => {
    document.querySelector('[data-tree-action="rename"]')?.click();
  });
  await page.waitForSelector(".tree-rename-input", { timeout: 5000 });
  console.log("OK: collection rename click");

  await page.evaluate(() => {
    document.querySelector("#request-vars-btn")?.click();
  });
  await page.waitForSelector(".app-popover", { timeout: 5000 });
  console.log("OK: request variables popover click");

  await page.evaluate(() => {
    document.querySelector('[data-activity="variables"]')?.click();
  });
  await page.waitForSelector(".variables-workspace", { timeout: 10000 });

  const addVariable = page.locator(".variables-workspace .variables-add-btn").first();
  if (await addVariable.isVisible()) {
    await addVariable.click();
  }

  const secretBtn = page.locator(".variables-workspace .variable-secret-btn").first();
  await secretBtn.waitFor({ timeout: 10000 });
  await page.evaluate(() => {
    document.querySelector(".variables-workspace .variable-secret-btn")?.click();
  });
  console.log("OK: variable secret toggle click");

  const removeBtn = page.locator(".variables-workspace .remove-variable").first();
  const variableRowsBefore = await page.locator(".variables-workspace .variable-item").count();
  await page.evaluate(() => {
    document.querySelector(".variables-workspace .remove-variable")?.click();
  });
  await page.waitForFunction(
    (expected) => document.querySelectorAll(".variables-workspace .variable-item").length === expected,
    variableRowsBefore - 1,
    { timeout: 5000 }
  );
  console.log("OK: variable remove click");

  await browser.close();
  console.log("Browser row-click smoke test passed.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
