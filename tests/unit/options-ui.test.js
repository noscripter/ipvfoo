const test = require("node:test");
const assert = require("node:assert/strict");
const { loadDom } = require("../helpers/jsdom-env");


test("options UI renders providers, metrics, and actions", async () => {
  let linkOpened = false;
  const { dom, chrome, fetchTools } = await loadDom("src/options.html", {
    beforeParse(window) {
      window.browser = {};
      window.open = () => { linkOpened = true; };
      window.matchMedia = () => ({
        matches: false,
        addEventListener: (event, fn) => { window.__matchMediaListener = fn; },
      });
    },
  });

  dom.window.eval("window.__exports = { PROVIDER_ORDER, METRIC_ORDER, PROVIDERS, DEFAULT_OPTIONS };");
  const { document } = dom.window;
  const { PROVIDER_ORDER, METRIC_ORDER, PROVIDERS, DEFAULT_OPTIONS } = dom.window.__exports;

  const select = document.getElementById("provider_select");
  assert.equal(select.options.length, PROVIDER_ORDER.length);

  const metrics = document.querySelectorAll("#provider_metric_choices input[type=\"checkbox\"]");
  assert.equal(metrics.length, METRIC_ORDER.length);

  select.value = "iplocate";
  select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

  const providerUrl = document.getElementById("provider_url").textContent;
  assert.equal(providerUrl, PROVIDERS.iplocate.url);

  select.value = "ipify";
  select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));
  const nonIp = document.querySelector("input[data-metric=\"country\"]");
  assert.ok(nonIp.disabled);

  select.value = "iplocate";
  select.dispatchEvent(new dom.window.Event("change", { bubbles: true }));

  const country = document.querySelector("input[data-metric=\"country\"]");
  country.click();

  const stored = chrome.storage.sync._dump();
  assert.equal(stored.providerId, "iplocate");
  assert.ok(stored.providerMetrics.includes("country"));

  if (dom.window.__matchMediaListener) {
    dom.window.__matchMediaListener({ matches: true });
  }

  const nat64Table = document.getElementById("nat64");
  const originalRows = nat64Table.querySelectorAll("tr").length;
  dom.window.addPackedNAT64(dom.window.parseIP("2001:db8::").slice(0, 96/4));
  assert.ok(nat64Table.querySelectorAll("tr").length >= originalRows);

  let closed = false;
  dom.window.close = () => { closed = true; };
  const dismissBtn = document.getElementById("dismiss_btn");
  dismissBtn.click();
  assert.ok(closed);

  let backCalled = false;
  Object.defineProperty(dom.window, "history", {
    value: { length: 2, back: () => { backCalled = true; } },
    configurable: true,
  });
  dismissBtn.click();
  assert.ok(backCalled);

  const revertBtn = document.getElementById("revert_btn");
  revertBtn.click();
  const afterRevert = chrome.storage.sync._dump();
  assert.equal(afterRevert.regularColorScheme, DEFAULT_OPTIONS.regularColorScheme);

  const firstLink = document.querySelector("#ipv4pages a");
  firstLink.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, ctrlKey: true }));
  assert.ok(linkOpened);
  linkOpened = false;
  firstLink.dispatchEvent(new dom.window.MouseEvent("auxclick", { bubbles: true, button: 1 }));
  assert.ok(linkOpened);

  const regularDark = document.querySelector("input[name=\"regularColorScheme\"][value=\"darkfg\"]");
  regularDark.click();
  const afterDark = chrome.storage.sync._dump();
  assert.equal(afterDark.regularColorScheme, "darkfg");

  dom.window.addNAT64("2001:db8::/96");

  dom.window.eval("optionsDirty.regularColorScheme = 2;");
  dom.window.eval("handleOptionsChanged({ regularColorScheme: { oldValue: 'auto', newValue: 'lightfg' } })");
  dom.window.eval("handleOptionsChanged({ regularColorScheme: { oldValue: 'lightfg', newValue: 'lightfg' } })");
  dom.window.eval("handleOptionsChanged({ other: { oldValue: 1, newValue: 2 } })");

  fetchTools.setMock(
    PROVIDERS.iplocate.url,
    JSON.stringify({ ip: "203.0.113.1", country: "Testland", city: "Testville" })
  );
  const testBtn = document.getElementById("provider_test_btn");
  testBtn.click();
  const status = document.getElementById("provider_test_status");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(status.textContent.includes("OK"));

  fetchTools.setMock(PROVIDERS.iplocate.url, "", 500);
  testBtn.click();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(status.textContent.includes("Error"));

  if (typeof dom.window.renderProviderTest === "function") {
    dom.window.renderProviderTest(null);
    assert.ok(status.textContent.includes("No result"));
  }
});
