const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("vm");

const { loadDom } = require("../helpers/jsdom-env");
const { makeChromeStub } = require("../helpers/stubs");
const { loadScript } = require("../helpers/load-script");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("popup rejects bad tabId", () => {
  const context = vm.createContext({
    window: { location: { hash: "#bad" } },
    navigator: { userAgent: "UnitTest" },
  });
  assert.throws(() => loadScript("src/popup.js", context), /Bad tabId/);
});

test("popup handles onMessage commands", async () => {
  const chrome = makeChromeStub();
  let onMessage = null;
  const port = {
    name: "0",
    onMessage: { addListener: (fn) => { onMessage = fn; } },
    onDisconnect: { addListener: () => {} },
    postMessage: () => {},
  };
  chrome.runtime.connect = () => port;

  const { dom } = await loadDom("src/popup.html", { hash: "#0", chromeOverride: chrome });
  assert.ok(onMessage);

  onMessage({ cmd: "pushAll", tuples: [["aaa.example", "1.1.1.1", "4", 0]], pattern: "4", spillCount: 0 });
  onMessage({ cmd: "pushOne", tuple: ["bbb.example", "2.2.2.2", "4", 0] });
  onMessage({ cmd: "pushPattern", pattern: "6" });
  onMessage({ cmd: "pushSpillCount", spillCount: 1 });
  onMessage({ cmd: "pushProvider", info: { title: "Provider", rows: [["Public IP", "1.1.1.1"]] } });
  onMessage({ cmd: "shake" });
  await delay(700);
});

test("popup beg button requests permission", async () => {
  const chrome = makeChromeStub();
  chrome.permissions.getAll = async () => ({ origins: [] });
  let requested = false;
  chrome.permissions.request = async () => {
    requested = true;
    return true;
  };
  let closed = false;
  const { dom } = await loadDom("src/popup.html", {
    hash: "#1",
    chromeOverride: chrome,
    beforeParse(window) {
      window.close = () => { closed = true; };
    },
  });

  await dom.window.beg();
  const button = dom.window.document.getElementById("beg");
  assert.equal(button.style.display, "block");
  button.click();
  await delay(0);
  assert.ok(requested);
  assert.ok(closed);
});

test("popup mobile rendering paths", async () => {
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
      Object.defineProperty(window.navigator, "userAgent", {
        value: "Mobile",
        configurable: true,
      });
    },
  });

  await dom.window.onload();
  await dom.window.pushPattern("4");
  await dom.window.pushPattern("4");
  dom.window.pushSpillCount(1);
  dom.window.pushSpillCount(0);
  dom.window.pushOne(["bbb.example", "1.2.3.4", "4", 0]);
});

test("popup scrollbar hack branches", async () => {
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

  const docEl = dom.window.document.documentElement;
  Object.defineProperty(docEl, "scrollHeight", { value: 200, configurable: true });
  Object.defineProperty(docEl, "clientHeight", { value: 100, configurable: true });
  dom.window.scrollbarHack();
  await delay(250);
  assert.equal(dom.window.document.body.style.paddingRight, "20px");

  Object.defineProperty(docEl, "scrollHeight", { value: 100, configurable: true });
  Object.defineProperty(docEl, "clientHeight", { value: 200, configurable: true });
  dom.window.scrollbarHack();
  await delay(250);
  assert.ok(dom.window.document.body.classList.contains("force-redraw"));
});

test("popup row helpers and selection", async () => {
  const chrome = makeChromeStub();
  chrome.runtime.connect = () => ({
    name: "0",
    onMessage: { addListener: () => {} },
    onDisconnect: { addListener: () => {} },
    postMessage: () => {},
  });
  const { dom } = await loadDom("src/popup.html", { hash: "#0", chromeOverride: chrome });
  const { document } = dom.window;

  const FLAG_SSL = 0x1;
  const FLAG_NOSSL = 0x2;
  const FLAG_UNCACHED = 0x4;
  const FLAG_CONNECTED = 0x8;
  const FLAG_WEBSOCKET = 0x10;
  const FLAG_NOTWORKER = 0x20;

  const longDomain = "a".repeat(60);
  dom.window.makeRow(true, [longDomain, "1.1.1.1", "4", FLAG_SSL | FLAG_NOSSL]);
  dom.window.makeRow(false, ["short.example", "1.1.1.1", "6", FLAG_SSL]);
  dom.window.makeRow(false, ["ws.example", "1.1.1.1", "4", FLAG_WEBSOCKET | FLAG_CONNECTED]);
  dom.window.makeRow(false, ["sw.example", "1.1.1.1", "4", 0]);
  dom.window.makeRow(false, ["cached.example", "1.1.1.1", "4", FLAG_NOTWORKER]);
  dom.window.makeRow(false, ["uncached.example", "1.1.1.1", "4", FLAG_NOTWORKER | FLAG_UNCACHED]);

  const table = document.getElementById("addr_table");
  dom.window.pushOne(["aaa.example", "1.1.1.1", "4", 0]);
  dom.window.pushOne(["zzz.example", "1.1.1.1", "4", 0]);
  dom.window.pushOne(["mmm.example", "1.1.1.1", "4", 0]);
  assert.ok(table.firstChild);

  const src = document.createElement("div");
  const dst = document.createElement("div");
  src.appendChild(document.createTextNode("a"));
  dst.appendChild(document.createTextNode("b"));
  dom.window.minimalCopy(src, dst);
  assert.equal(dst.textContent, "a");

  const sheet = document.styleSheets[0];
  sheet.insertRule(".snippedTextInvisible { }", sheet.cssRules.length);
  sheet.insertRule(".snipLinkVisible { }", sheet.cssRules.length);
  const frag = dom.window.makeSnippedText(longDomain, 4);
  const holder = document.createElement("div");
  holder.appendChild(frag);
  document.body.appendChild(holder);
  const snipLink = holder.querySelector("a");
  snipLink.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
  const selectors = Array.from(sheet.cssRules).map((rule) => rule.selectorText);
  assert.ok(!selectors.includes(".snippedTextInvisible"));
  assert.ok(!selectors.includes(".snipLinkVisible"));

  dom.window.pushProvider({ rows: [["Public IP", "1.1.1.1"]] });
  dom.window.pushProvider({ title: "", rows: [["Public IP", "1.1.1.1"]] });

  const cell = table.querySelector("td");
  const sel = dom.window.getSelection();
  sel.removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(cell);
  sel.addRange(range);
  dom.window.handleMouseDown({ timeStamp: 0 });
  assert.equal(dom.window.isSpuriousSelection(sel, 20), false);
  sel.removeAllRanges();
  assert.equal(dom.window.isSpuriousSelection(sel, 5), true);
  dom.window.handleContextMenu.call(cell, { timeStamp: 0, preventDefault: () => {} });

  const textNode = cell.lastChild;
  const range2 = document.createRange();
  range2.setStart(textNode, 0);
  range2.setEnd(textNode, 1);
  sel.removeAllRanges();
  sel.addRange(range2);
  assert.equal(dom.window.isSpuriousSelection(sel, 5), true);

  dom.window.handleMouseDown({ timeStamp: 0 });
  assert.equal(dom.window.isSpuriousSelection(sel, 5), false);

  dom.window.handleClick.call(cell);
});
