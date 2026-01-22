import { chromium } from "playwright";
import fs from "fs";
import os from "os";
import path from "path";
import buildTools from "../helpers/build.js";

const { ensureBuilt, findUnpacked } = buildTools;

const mv = process.env.MV || "3";
ensureBuilt({ browser: "chrome", mv });

const extPath = findUnpacked(mv);
if (!extPath || !fs.existsSync(extPath)) {
  throw new Error(`Unpacked extension not found for MV${mv}`);
}

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "ipvfoo-chrome-"));
const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "ipvfoo-chrome-home-"));
const crashpadDir = path.join(userDataDir, "crashpad");
fs.mkdirSync(crashpadDir, { recursive: true });
let executablePath = chromium.executablePath();
if (process.platform === "darwin") {
  const systemChrome = process.env.CHROME_EXECUTABLE || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  if (fs.existsSync(systemChrome)) {
    executablePath = systemChrome;
  }
}
if (!fs.existsSync(executablePath) && process.platform === "darwin" && process.arch === "arm64") {
  const fallback = executablePath.replace("chrome-mac-x64", "chrome-mac-arm64");
  if (fs.existsSync(fallback)) {
    executablePath = fallback;
  }
}
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  executablePath,
  env: {
    ...process.env,
    HOME: homeDir,
  },
  args: [
    `--disable-extensions-except=${extPath}`,
    `--load-extension=${extPath}`,
    "--disable-crash-reporter",
    "--disable-crashpad",
    "--disable-features=Crashpad,CrashpadReporting",
    `--crash-dumps-dir=${crashpadDir}`,
  ],
});

try {
  let backgroundUrl = null;
  const serviceWorkers = context.serviceWorkers();
  if (serviceWorkers.length) {
    backgroundUrl = serviceWorkers[0].url();
  } else {
    const sw = await context.waitForEvent("serviceworker").catch(() => null);
    if (sw) backgroundUrl = sw.url();
  }
  if (!backgroundUrl) {
    const pages = context.backgroundPages();
    if (pages.length) backgroundUrl = pages[0].url();
  }
  if (!backgroundUrl) {
    const bg = await context.waitForEvent("backgroundpage").catch(() => null);
    if (bg) backgroundUrl = bg.url();
  }
  if (!backgroundUrl) {
    throw new Error("Unable to resolve extension background URL");
  }
  const extensionId = backgroundUrl.split("/")[2];

  await context.route("https://api.iplocate.io/json", (route) => {
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ip: "203.0.113.11",
        country: "Testland",
        country_code: "TL",
        region: "Central",
        city: "Testville",
        org: "Test Org",
        asn: "AS64500",
        isp: "Test ISP",
        timezone: "UTC",
        latitude: "1.0",
        longitude: "2.0",
        continent: "NA",
        postal_code: "00000",
      }),
    });
  });

  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.waitForSelector("#provider_select");
  await options.selectOption("#provider_select", "iplocate");
  await options.check('input[data-metric="country"]');
  await options.check('input[data-metric="city"]');
  await options.click("#provider_test_btn");
  await options.waitForSelector("#provider_test_status", { state: "visible" });
  await options.waitForSelector("#provider_test_status:has-text('OK')");

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html#0`);
  await popup.waitForSelector("#provider_section", { state: "visible" });
  const content = await popup.textContent("#provider_section");
  if (!content.includes("Testland") || !content.includes("Testville")) {
    throw new Error("Provider metrics not displayed in popup");
  }
} finally {
  await context.close();
}
