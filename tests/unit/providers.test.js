const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("vm");

const { loadScript } = require("../helpers/load-script");
const { makeChromeStub, installFetchStub, installCanvasStub } = require("../helpers/stubs");

function makeContext({ failSync, failPng, manifestVersion = 3, initialStorage, chromeOverrides, beforeLoad } = {}) {
  const context = vm.createContext({});
  const manifest = manifestVersion === 2
    ? { manifest_version: 2, background: { page: "background.html" } }
    : { manifest_version: 3, background: { service_worker: "background.js" } };
  const chrome = makeChromeStub(manifest, initialStorage);
  if (failSync) {
    chrome.storage.sync.get = (...args) => {
      const cb = args[args.length - 1];
      if (typeof cb === "function") {
        chrome.runtime.lastError = new Error("sync unavailable");
        cb(null);
        chrome.runtime.lastError = null;
        return;
      }
      return Promise.reject(new Error("sync unavailable"));
    };
  }
  if (chromeOverrides) {
    Object.assign(chrome, chromeOverrides);
  }
  if (beforeLoad) {
    beforeLoad(context, chrome);
  }
  context.chrome = chrome;
  context.navigator = { userAgent: "UnitTest" };
  context.URL = URL;
  context.Blob = Blob;
  context.console = console;
  context.setTimeout = setTimeout;
  context.clearTimeout = clearTimeout;

  const fetchTools = installFetchStub({ failPng });
  context.fetch = fetchTools.fetchStub;
  context.__fetchTools = fetchTools;
  context.createImageBitmap = async () => ({ width: 1, height: 1 });
  installCanvasStub(context);

  loadScript("src/iputil.js", context);
  loadScript("src/common.js", context);
  vm.runInContext(
    "globalThis.__exports = { " +
      "optionsReady, options, optionsDirty, optionsStorage, " +
      "spriteImgReady, buildIcon, chromeAsync, " +
      "parseMetricSelection, normalizeMetricSelection, extractIP, " +
      "PROVIDERS, PROVIDER_ORDER, METRIC_ORDER, METRIC_LABELS, " +
      "providerMetricsFor, formatProviderRows, fetchProviderInfo, " +
      "normalizeMetrics, newMap, clearMap, sleep, " +
      "DEFAULT_OPTIONS, NAT64_KEY, handleOptionsChanged, watchOptions, " +
      "setOptions, addPackedNAT64, revertNAT64" +
    " }",
    context
  );
  return context;
}

test("provider helpers", async () => {
  const ctx = makeContext();
  const ex = ctx.__exports;
  await ex.optionsReady;

  assert.equal(ex.parseMetricSelection("").length, 0);
  assert.equal(ex.parseMetricSelection("ip,country").join(","), "ip,country");
  assert.equal(ex.normalizeMetricSelection(["ip", "country"]), "ip,country");

  assert.equal(ex.extractIP("Your IP is 1.2.3.4"), "1.2.3.4");
  assert.equal(ex.extractIP("bad"), null);

  assert.ok(ex.PROVIDERS.ipify);
  assert.ok(ex.providerMetricsFor("iplocate").includes("ip"));
  assert.equal(ex.providerMetricsFor("unknown").join(","), "ip");

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
  tools.setMock("https://ipv4.iplocation.net", "Your IP address is 203.0.113.20");
  tools.setMock("https://myip.dnsomatic.com/", "Your IP address is 203.0.113.30");

  const ipify = await ctx.__exports.fetchProviderInfo("ipify");
  assert.equal(ipify.metrics.ip, "203.0.113.10");

  const locate = await ctx.__exports.fetchProviderInfo("iplocate");
  assert.equal(locate.metrics.country, "Testland");
  assert.equal(locate.metrics.city, "Testville");
  assert.equal(locate.metrics.isp, "Test ISP");

  const ip4 = await ctx.__exports.fetchProviderInfo("ip4only");
  assert.equal(ip4.metrics.ip, "198.51.100.7");

  const iplocation = await ctx.__exports.fetchProviderInfo("iplocation");
  assert.equal(iplocation.metrics.ip, "203.0.113.20");

  const opendns = await ctx.__exports.fetchProviderInfo("opendns");
  assert.equal(opendns.metrics.ip, "203.0.113.30");

  const fallback = await ctx.__exports.fetchProviderInfo("unknown");
  assert.equal(fallback.providerId, "ipify");
  assert.equal(fallback.metrics.ip, "203.0.113.10");
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

test("chromeAsync MV2 callbacks and errors", async () => {
  const ctx = makeContext({ manifestVersion: 2 });
  ctx.successFn = (cb) => cb("ok");
  const ok = await vm.runInContext("chromeAsync(successFn)", ctx);
  assert.equal(ok, "ok");

  ctx.failFn = (cb) => {
    ctx.chrome.runtime.lastError = new Error("fail");
    cb(null);
    ctx.chrome.runtime.lastError = null;
  };
  await assert.rejects(vm.runInContext("chromeAsync(failFn)", ctx), /fail/);
});

test("helpers edge cases", async () => {
  const ctx = makeContext();
  const ex = ctx.__exports;
  await ex.optionsReady;

  assert.equal(ex.normalizeMetricSelection(123), "");
  assert.equal(ex.extractIP(""), null);
  assert.equal(ex.extractIP("xyz"), null);

  const emptyMetrics = ex.normalizeMetrics(null);
  assert.equal(Object.keys(emptyMetrics).length, 0);
  const normMetrics = ex.normalizeMetrics({ a: null, b: "  ", c: 0 });
  assert.equal(normMetrics.c, "0");
  assert.equal(Object.keys(normMetrics).length, 1);

  const rows = ex.formatProviderRows({ foo: "bar" }, ["foo"]);
  assert.equal(rows[0][0], "foo");
});

test("fetchProviderInfo error branches", async () => {
  const ctx1 = makeContext();
  const ex1 = ctx1.__exports;
  ex1.DEFAULT_OPTIONS.providerId = "missing";
  const unknown = await ex1.fetchProviderInfo("unknown");
  assert.equal(unknown.error, "Unknown provider");

  const ctx2 = makeContext();
  const ex2 = ctx2.__exports;
  ctx2.fetch = async () => { throw new Error("boom"); };
  const fetchErr = await ex2.fetchProviderInfo("ipify");
  assert.ok(fetchErr.error.includes("boom"));
});

test("buildIcon requires spriteImgReady", () => {
  const ctx = makeContext();
  vm.runInContext("spriteImg.ready = false", ctx);
  assert.throws(() => ctx.__exports.buildIcon("4", 16, "darkfg"), /must await spriteImgReady/);
});

test("optionsReady loads stored values", async () => {
  const prefix = "20010db80000000000000000";
  const ctx = makeContext({
    initialStorage: {
      sync: {
        providerMetrics: "ip,country",
        providerId: "iplocate",
        [`nat64/${prefix}`]: 1,
      },
    },
  });
  const ex = ctx.__exports;
  await ex.optionsReady;
  assert.equal(ex.options.providerMetrics, "ip,country");
  assert.ok(ex.options[ex.NAT64_KEY].has(prefix));
});

test("watchOptions callback runs after optionsReady", async () => {
  let resolveGet = null;
  const ctx = makeContext({
    beforeLoad: (_context, chrome) => {
      chrome.storage.sync.get = () => new Promise((resolve) => {
        resolveGet = resolve;
      });
    },
  });
  const ex = ctx.__exports;
  ex.handleOptionsChanged({ providerId: { oldValue: "ipify", newValue: "ipify" } });
  let watched = null;
  ex.watchOptions((changed) => { watched = changed; });
  resolveGet({});
  await ex.optionsReady;
  assert.ok(Array.isArray(watched));
});

test("handleOptionsChanged NAT64 add/remove", async () => {
  const ctx = makeContext();
  const ex = ctx.__exports;
  await ex.optionsReady;
  const prefix = "20010db80000000000000000";
  const key = `${ex.NAT64_KEY}${prefix}`;
  ex.handleOptionsChanged({ [key]: { oldValue: undefined, newValue: 1 } });
  assert.ok(ex.options[ex.NAT64_KEY].has(prefix));
  ex.handleOptionsChanged({ [key]: { oldValue: 1, newValue: undefined } });
  assert.ok(!ex.options[ex.NAT64_KEY].has(prefix));
});

test("watchOptions throws on duplicate registration", async () => {
  const ctx = makeContext();
  const ex = ctx.__exports;
  ex.watchOptions(() => {});
  assert.throws(() => ex.watchOptions(() => {}), /redundant watchOptions/);
});

test("setOptions handles storage errors and buffered writes", async () => {
  const ctx = makeContext();
  const ex = ctx.__exports;
  await ex.optionsReady;
  const base = {};
  for (const key of Object.keys(ex.DEFAULT_OPTIONS)) {
    base[key] = ex.options[key];
  }

  ctx.chrome.storage.sync.set = () => Promise.reject(new Error("fail"));
  const failOptions = { ...base, regularColorScheme: "darkfg" };
  ex.setOptions(failOptions);
  await new Promise((resolve) => setTimeout(resolve, 0));

  let resolveFirst = null;
  let callCount = 0;
  ctx.chrome.storage.sync.set = () => {
    callCount += 1;
    if (callCount === 1) {
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    }
    return Promise.resolve();
  };
  const first = { ...base, providerId: base.providerId === "ipify" ? "iplocate" : "ipify" };
  const second = { ...base, providerId: "ipify" };
  ex.setOptions(first);
  ex.setOptions(second);
  resolveFirst();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(callCount >= 2);
});

test("NAT64 helpers handle duplicates and failures", async () => {
  const ctx = makeContext();
  const ex = ctx.__exports;
  await ex.optionsReady;
  const prefix = "20010db80000000000000000";

  ctx.chrome.storage.sync.set = () => Promise.reject(new Error("fail"));
  ex.addPackedNAT64(prefix);
  ex.addPackedNAT64(prefix);
  assert.throws(() => ex.addPackedNAT64("bad"), /invalid packed96/);

  ctx.chrome.storage.sync.remove = () => Promise.reject(new Error("fail"));
  ex.revertNAT64();
  await new Promise((resolve) => setTimeout(resolve, 0));
});
