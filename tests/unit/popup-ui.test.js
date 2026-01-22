const test = require("node:test");
const assert = require("node:assert/strict");

const { makeChromeStub } = require("../helpers/stubs");
const { loadDom } = require("../helpers/jsdom-env");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("popup renders provider info and updates rows", async () => {
  const chrome = makeChromeStub();

  let onMessage = null;
  let onDisconnect = null;
  const port = {
    name: "0",
    onMessage: { addListener: (fn) => { onMessage = fn; } },
    onDisconnect: { addListener: (fn) => { onDisconnect = fn; } },
    postMessage: () => {},
  };
  chrome.runtime.connect = () => port;

  const { dom } = await loadDom("src/popup.html", { hash: "#0", chromeOverride: chrome });
  const { document } = dom.window;

  assert.ok(onMessage, "onMessage listener registered");

  onMessage({ cmd: "pushProvider", info: { title: "Test Provider", rows: [["Public IP", "203.0.113.5"]] } });

  const section = document.getElementById("provider_section");
  assert.equal(section.style.display, "block");
  const table = document.getElementById("provider_table");
  assert.ok(table.textContent.includes("Public IP"));
  assert.ok(table.textContent.includes("203.0.113.5"));

  dom.window.pushAll([["example.com", "1.2.3.4", "4", 0]], "4", 0);
  dom.window.pushOne(["example.com", "1.2.3.4", "4", 0]);
  dom.window.pushOne(["aaa.example", "198.51.100.2", "4", 0]);
  dom.window.pushOne(["zzz.example", "2001:db8::1", "6", 0]);
  dom.window.pushPattern("46");
  dom.window.pushSpillCount(1);
  dom.window.pushProvider(null);
  dom.window.shake();

  assert.ok(onDisconnect, "onDisconnect listener registered");
  onDisconnect();
});

test("popup mobile branches", async () => {
  const chrome = makeChromeStub();
  chrome.runtime.connect = () => ({
    name: "0",
    onMessage: { addListener: () => {} },
    onDisconnect: { addListener: () => {} },
    postMessage: () => {},
  });

  const { dom } = await loadDom("src/popup.html", {
    hash: "#0",
    chromeOverride: chrome,
    beforeParse(window) {
      window.navigator = { userAgent: "Mobile" };
      window.browser = {};
    },
  });

  dom.window.pushSpillCount(0);
  dom.window.pushPattern("4");
  dom.window.pushProvider({ title: "Provider", rows: [["Public IP", "198.51.100.1"]] });
});

test("popup scrollbar hack in firefox mode", async () => {
  const chrome = makeChromeStub();
  chrome.runtime.connect = () => ({
    name: "0",
    onMessage: { addListener: () => {} },
    onDisconnect: { addListener: () => {} },
    postMessage: () => {},
  });

  const { dom } = await loadDom("src/popup.html", {
    hash: "#0",
    chromeOverride: chrome,
    beforeParse(window) {
      window.browser = {};
    },
  });

  dom.window.pushOne(["scroll.example", "1.2.3.4", "4", 0]);
  await delay(250);
  assert.ok(dom.window.document.body);
});
