import fs from "fs/promises";
import path from "path";
import os from "os";
import { Builder, By, until } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import buildTools from "../helpers/build.js";

const { ensureBuilt, findXpi } = buildTools;

const mv = process.env.MV || "3";
ensureBuilt({ browser: "firefox", mv });

const xpiPath = findXpi(mv);
if (!xpiPath) {
  throw new Error(`XPI not found for MV${mv}`);
}

const profileDir = await fs.mkdtemp(path.join(os.tmpdir(), "ipvfoo-firefox-"));
const profile = new firefox.Profile(profileDir);
const options = new firefox.Options().setProfile(profile).addArguments("-headless");

const driver = await new Builder()
  .forBrowser("firefox")
  .setFirefoxOptions(options)
  .build();

async function findExtensionsJson(root) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isFile() && entry.name === "extensions.json") {
      return full;
    }
    if (entry.isDirectory()) {
      const nested = await findExtensionsJson(full);
      if (nested) return nested;
    }
  }
  return null;
}

async function waitForRootUri(profileRoot, addonId) {
  const start = Date.now();
  while (Date.now() - start < 15000) {
    const jsonPath = await findExtensionsJson(profileRoot);
    if (jsonPath) {
      const raw = await fs.readFile(jsonPath, "utf8");
      const data = JSON.parse(raw);
      const addon = (data.addons || []).find((item) => item.id === addonId);
      if (addon && addon.rootURI) return addon.rootURI;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("Could not resolve moz-extension root URI");
}

try {
  await driver.installAddon(xpiPath, true);
  const rootUri = await waitForRootUri(profileDir, "ipvfoo@pmarks.net");

  await driver.get(`${rootUri}options.html`);
  await driver.wait(until.elementLocated(By.id("provider_select")), 5000);
  await driver.executeScript(() => {
    const sel = document.getElementById("provider_select");
    sel.value = "ipify";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    const ip = document.querySelector('input[data-metric="ip"]');
    if (ip && !ip.checked) ip.click();
  });
  const testBtn = await driver.findElement(By.id("provider_test_btn"));
  await testBtn.click();
  await driver.wait(until.elementTextContains(await driver.findElement(By.id("provider_test_status")), "OK"), 10000);

  await driver.get(`${rootUri}popup.html#0`);
  await driver.wait(until.elementLocated(By.id("provider_section")), 5000);
  const content = await driver.findElement(By.id("provider_section")).getText();
  if (!content.includes("Public IP")) {
    throw new Error("Provider section missing in popup");
  }
} finally {
  await driver.quit();
}
