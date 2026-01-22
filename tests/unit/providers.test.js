const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");
const { makeChromeStub, installFetchStub, installCanvasStub, makeStorageArea } = require("../helpers/stubs");

const MODULES = ["../../src/iputil", "../../src/common"];

function resetModules() {
  for (const mod of MODULES) {
    delete require.cache[require.resolve(mod)];
  }
}

function resetGlobals() {
  delete global.window;
  delete global.document;
  delete global.navigator;
  delete global.chrome;
  delete global.fetch;
  delete global.createImageBitmap;
  delete global.Range;
}

function stubCanvasElement(window) {
  const proto = window.HTMLCanvasElement && window.HTMLCanvasElement.prototype;
  if (!proto || proto.getContext) return;
  proto.getContext = () => ({
    fillStyle: "",
    fillRect: () => {},
    clearRect: () => {},
    drawImage: () => {},
    getImageData: () => ({ data: new Uint8ClampedArray(16 * 16 * 4) }),
    putImageData: () => {},
  });
}

function makeChromeCallbackStub() {
  const chrome = makeChromeStub({ manifest_version: 2, background: {} });
  const wrapArea = (area) => {
    const getAsync = area.get.bind(area);
    const setAsync = area.set.bind(area);
    const removeAsync = area.remove.bind(area);
    area.get = (keys, cb) => getAsync(keys).then((res) => cb(res));
    area.set = (items, cb) => setAsync(items).then(() => cb());
    area.remove = (keys, cb) => removeAsync(keys).then(() => cb());
  };
  wrapArea(chrome.storage.sync);
  wrapArea(chrome.storage.local);
  wrapArea(chrome.storage.session);
  chrome.permissions.getAll = (cb) => cb({ origins: ["<all_urls>"] });
  chrome.permissions.request = (opts, cb) => cb(true);
  return chrome;
}

function setupCommon({
  manifestVersion = 3,
  failSync = false,
  failPng = false,
  withWindow = false,
  withDocument = false,
  matchMedia = false,
  useCallbackStorage = false,
  sendMessageSpy = null,
} = {}) {
  resetModules();
  resetGlobals();

  const chrome = useCallbackStorage
    ? makeChromeCallbackStub()
    : makeChromeStub({ manifest_version: manifestVersion, background: { service_worker: "background.js" } });

  if (failSync) {
    chrome.storage.sync.get = async () => {
      throw new Error("sync unavailable");
    };
  }
  if (sendMessageSpy) {
    chrome.runtime.sendMessage = sendMessageSpy;
  }

  const fetchTools = installFetchStub({ failPng });

  global.chrome = chrome;
  global.navigator = { userAgent: "UnitTest" };
  global.URL = URL;
  global.Blob = Blob;
  global.fetch = fetchTools.fetchStub;
  global.createImageBitmap = async () => ({ width: 1, height: 1 });
  installCanvasStub(global);

  let dom = null;
  if (withWindow) {
    if (withDocument) {
      dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { pretendToBeVisual: true });
      global.window = dom.window;
      global.document = dom.window.document;
      stubCanvasElement(dom.window);
    } else {
      global.window = {};
    }
    if (matchMedia) {
      let handler = null;
      global.window.matchMedia = () => ({
        matches: true,
        addEventListener: (event, fn) => {
          handler = fn;
        },
        __fire: (matches) => {
          if (handler) handler({ matches });
        },
      });
    }
  }

  require("../../src/iputil");
  const common = require("../../src/common");
  return { common, chrome, fetchTools, dom };
}

async function run() {
  {
    const { common, fetchTools } = setupCommon();
    await common.optionsReady;
    await common.spriteImgReady;

    assert.equal(await common.chromeAsync(() => "ok"), "ok");

    assert.deepEqual(common.parseMetricSelection(""), []);
    assert.deepEqual(common.parseMetricSelection("ip,country"), ["ip", "country"]);
    assert.equal(common.normalizeMetricSelection(["ip", "country"]), "ip,country");
    assert.equal(common.normalizeMetricSelection("ip"), "ip");
    assert.equal(common.normalizeMetricSelection(123), "");

    assert.equal(common.extractIP("Your IP is 1.2.3.4"), "1.2.3.4");
    assert.equal(common.extractIP("bad"), null);

    assert.ok(common.PROVIDERS.ipify);
    assert.ok(common.providerMetricsFor("iplocate").includes("ip"));
    assert.deepEqual(common.providerMetricsFor("unknown"), ["ip"]);

    const rows = common.formatProviderRows({ ip: "203.0.113.1", country: "Testland" }, ["ip", "country"]);
    assert.equal(rows.length, 2);
    const rowsMissing = common.formatProviderRows({ ip: "203.0.113.1" }, ["ip", "country"]);
    assert.equal(rowsMissing.length, 1);

    const norm = common.normalizeMetrics({ ip: " 1.2.3.4 ", empty: "", nil: null });
    assert.deepEqual(norm, { ip: "1.2.3.4" });

    const m = common.newMap();
    m.test = 1;
    common.clearMap(m);
    assert.equal(Object.keys(m).length, 0);

    await common.sleep(1);

    common.buildIcon("", 16, "darkfg");
    common.buildIcon("646", 16, "lightfg");

    const dom = new JSDOM("<div id=\"x\"><span></span><span></span></div>");
    const node = dom.window.document.getElementById("x");
    common.removeChildren(node);
    assert.equal(node.childNodes.length, 0);

    fetchTools.setMock("https://api.ipify.org?format=json", JSON.stringify({ ip: "203.0.113.10" }));
    fetchTools.setMock(
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
    fetchTools.setMock("https://ip4only.me/api/", "Your IP address is 198.51.100.7");

    const ipify = await common.fetchProviderInfo("ipify");
    assert.equal(ipify.metrics.ip, "203.0.113.10");

    const locate = await common.fetchProviderInfo("iplocate");
    assert.equal(locate.metrics.country, "Testland");
    assert.equal(locate.metrics.city, "Testville");
    assert.equal(locate.metrics.isp, "Test ISP");

    const ip4 = await common.fetchProviderInfo("ip4only");
    assert.equal(ip4.metrics.ip, "198.51.100.7");

    const bad = await common.fetchProviderInfo("unknown");
    assert.ok(bad.error);

    fetchTools.setMock("https://api.ipify.org?format=json", "not-json");
    const badJson = await common.fetchProviderInfo("ipify");
    assert.equal(badJson.error, "Bad JSON");

    fetchTools.setMock("https://api.ipify.org?format=json", "{}", 500);
    const httpError = await common.fetchProviderInfo("ipify");
    assert.equal(httpError.error, "HTTP 500");

    const originalParse = common.PROVIDERS.ipify.parse;
    common.PROVIDERS.ipify.parse = () => { throw new Error("boom"); };
    fetchTools.setMock("https://api.ipify.org?format=json", JSON.stringify({ ip: "203.0.113.1" }));
    const parseError = await common.fetchProviderInfo("ipify");
    assert.equal(parseError.error, "Parse error");
    common.PROVIDERS.ipify.parse = originalParse;

    const optionsChanged = [];
    common.watchOptions((changes) => optionsChanged.push(changes));
    assert.throws(() => common.watchOptions(() => {}));

    common.optionsDirty.regularColorScheme = 2;
    common.handleOptionsChanged({ regularColorScheme: { oldValue: "auto", newValue: "lightfg" } });
    common.handleOptionsChanged({ regularColorScheme: { oldValue: "lightfg", newValue: "lightfg" } });
    common.handleOptionsChanged({ providerMetrics: { oldValue: "", newValue: ["ip", "country"] } });
    common.handleOptionsChanged({ other: { oldValue: 1, newValue: 2 } });

    const packed = common.addNAT64("2001:db8::/96");
    assert.ok(packed.includes("Added NAT64"));
    common.addNAT64("2001:db8::/96");

    const invalidPacked = () => common.addPackedNAT64("zz");
    assert.throws(invalidPacked);

    common.handleOptionsChanged({ [`${common.NAT64_KEY}20010db80000000000000000`]: { oldValue: 0, newValue: 1 } });
    common.handleOptionsChanged({ [`${common.NAT64_KEY}20010db80000000000000000`]: { oldValue: 1, newValue: undefined } });
    common.handleOptionsChanged({ [`${common.NAT64_KEY}${Array.from(common.NAT64_DEFAULTS)[0]}`]: { oldValue: 1, newValue: 1 } });

    const storage = common.getOptionsStorage();
    const origSet = storage.set.bind(storage);
    storage.set = async () => { throw new Error("set failed"); };
    common.addPackedNAT64("20010db80000000000000000");
    storage.set = origSet;

    common.revertNAT64();
    const origRemove = storage.remove.bind(storage);
    storage.remove = async () => { throw new Error("remove failed"); };
    common.addPackedNAT64("20010db80000000000000000");
    common.revertNAT64();
    storage.remove = origRemove;

    const unchanged = {
      regularColorScheme: common.options.regularColorScheme,
      incognitoColorScheme: common.options.incognitoColorScheme,
      providerId: common.options.providerId,
      providerMetrics: common.options.providerMetrics,
    };
    common.setOptions(unchanged);

    const origSet2 = storage.set.bind(storage);
    let resolveSet = null;
    let callCount = 0;
    storage.set = () => {
      callCount += 1;
      if (callCount === 1) {
        return new Promise((resolve) => {
          resolveSet = resolve;
        });
      }
      return Promise.resolve();
    };
    const first = { ...unchanged, regularColorScheme: "lightfg" };
    const second = { ...first, regularColorScheme: "darkfg" };
    common.setOptions(first);
    common.setOptions(second);
    resolveSet();
    await new Promise((resolve) => setTimeout(resolve, 0));
    storage.set = origSet2;
  }

  {
    const { common, chrome } = setupCommon({ failSync: true });
    await common.optionsReady;
    assert.equal(common.getOptionsStorage(), chrome.storage.local);
  }

  {
    const { common } = setupCommon({ failPng: true });
    await common.spriteImgReady;
    common.buildIcon("4", 16, "darkfg");
  }

  {
    const { common } = setupCommon({ withWindow: true, withDocument: true });
    await common.spriteImgReady;
    common.buildIcon("46?", 16, "darkfg");
  }

  {
    const { common, chrome } = setupCommon({ useCallbackStorage: true });
    await common.optionsReady;
    const value = await common.chromeAsync((cb) => cb("done"));
    assert.equal(value, "done");

    chrome.runtime.lastError = new Error("bad");
    const promise = common.chromeAsync((cb) => cb("nope"));
    let rejected = false;
    try {
      await promise;
    } catch {
      rejected = true;
    }
    assert.ok(rejected);
    chrome.runtime.lastError = null;
  }

  {
    const { common, chrome } = setupCommon({ withWindow: true, matchMedia: true });
    let lastMessage = null;
    chrome.runtime.sendMessage = (msg) => { lastMessage = msg; };
    const media = global.window.matchMedia();
    assert.deepEqual(lastMessage, { darkModeInteractive: true });
    media.__fire(false);
    assert.deepEqual(lastMessage, { darkModeInteractive: false });
    await common.spriteImgReady;
  }

  resetGlobals();
}

module.exports = { run };
