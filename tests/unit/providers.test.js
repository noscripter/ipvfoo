const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("vm");

const { loadScript } = require("../helpers/load-script");
const { makeChromeStub, installFetchStub, installCanvasStub } = require("../helpers/stubs");

function makeContext({ failSync, failPng } = {}) {
  const context = vm.createContext({});
  const chrome = makeChromeStub({ manifest_version: 3, background: { service_worker: "background.js" } });
  if (failSync) {
    chrome.storage.sync.get = async () => {
      throw new Error("sync unavailable");
    };
  }
  context.chrome = chrome;
  context.navigator = { userAgent: "UnitTest" };
  context.URL = URL;
  context.Blob = Blob;
  context.console = console;

  const fetchTools = installFetchStub({ failPng });
  context.fetch = fetchTools.fetchStub;
  context.__fetchTools = fetchTools;
  context.createImageBitmap = async () => ({ width: 1, height: 1 });
  installCanvasStub(context);

  loadScript("src/iputil.js", context);
  loadScript("src/common.js", context);
  vm.runInContext(
    "globalThis.__exports = { " +
      "optionsReady, options, spriteImgReady, buildIcon, " +
      "parseMetricSelection, normalizeMetricSelection, extractIP, " +
      "PROVIDERS, PROVIDER_ORDER, METRIC_ORDER, METRIC_LABELS, " +
      "providerMetricsFor, formatProviderRows, fetchProviderInfo, " +
      "normalizeMetrics, newMap, clearMap, sleep" +
    " }",
    context
  );
  return context;
}

test("provider helpers", async () => {
  const ctx = makeContext();
  const ex = ctx.__exports;
  await ex.optionsReady;

  assert.deepEqual(ex.parseMetricSelection(""), []);
  assert.deepEqual(ex.parseMetricSelection("ip,country"), ["ip", "country"]);
  assert.equal(ex.normalizeMetricSelection(["ip", "country"]), "ip,country");

  assert.equal(ex.extractIP("Your IP is 1.2.3.4"), "1.2.3.4");
  assert.equal(ex.extractIP("bad"), null);

  assert.ok(ex.PROVIDERS.ipify);
  assert.ok(ex.providerMetricsFor("iplocate").includes("ip"));
  assert.deepEqual(ex.providerMetricsFor("unknown"), ["ip"]);

  const rows = ex.formatProviderRows({ ip: "203.0.113.1", country: "Testland" }, ["ip", "country"]);
  assert.equal(rows.length, 2);

  const m = ex.newMap();
  m.test = 1;
  ex.clearMap(m);
  assert.equal(Object.keys(m).length, 0);

  await ex.sleep(1);
});

test("provider fetch (json + text)", async () => {
  const ctx = makeContext();
  const tools = ctx.__fetchTools;

  tools.setMock("https://api.ipify.org?format=json", JSON.stringify({ ip: "203.0.113.10" }));
  tools.setMock(
    "https://api.iplocate.io/json",
    JSON.stringify({
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
    })
  );
  tools.setMock("https://ip4only.me/api/", "Your IP address is 198.51.100.7");

  const ipify = await ctx.__exports.fetchProviderInfo("ipify");
  assert.equal(ipify.metrics.ip, "203.0.113.10");

  const locate = await ctx.__exports.fetchProviderInfo("iplocate");
  assert.equal(locate.metrics.country, "Testland");
  assert.equal(locate.metrics.city, "Testville");
  assert.equal(locate.metrics.isp, "Test ISP");

  const ip4 = await ctx.__exports.fetchProviderInfo("ip4only");
  assert.equal(ip4.metrics.ip, "198.51.100.7");

  const bad = await ctx.__exports.fetchProviderInfo("unknown");
  assert.ok(bad.error);
});

test("provider fetch fallback to local storage", async () => {
  const ctx = makeContext({ failSync: true });
  const ex = ctx.__exports;
  await ex.optionsReady;
  assert.ok(ex.options.ready);
});

test("provider error cases", async () => {
  const ctx = makeContext();
  const tools = ctx.__fetchTools;
  tools.setMock("https://api.ipify.org?format=json", "not-json");
  const badJson = await ctx.__exports.fetchProviderInfo("ipify");
  assert.equal(badJson.error, "Bad JSON");

  tools.setMock("https://api.ipify.org?format=json", "{}", 500);
  const httpError = await ctx.__exports.fetchProviderInfo("ipify");
  assert.equal(httpError.error, "HTTP 500");

  const originalParse = ctx.__exports.PROVIDERS.ipify.parse;
  ctx.__exports.PROVIDERS.ipify.parse = () => { throw new Error("boom"); };
  tools.setMock("https://api.ipify.org?format=json", JSON.stringify({ ip: "203.0.113.1" }));
  const parseError = await ctx.__exports.fetchProviderInfo("ipify");
  assert.equal(parseError.error, "Parse error");
  ctx.__exports.PROVIDERS.ipify.parse = originalParse;
});

test("sprite image fallback path", async () => {
  const ctx = makeContext({ failPng: true });
  await ctx.__exports.spriteImgReady;
  const icon = ctx.__exports.buildIcon("4", 16, "darkfg");
  assert.ok(icon.data.length > 0);
});
