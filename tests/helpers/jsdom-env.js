const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const { makeChromeStub, installFetchStub, installCanvasStub } = require("./stubs");

async function loadDom(filePath, { hash = "", chromeOverride = null, beforeParse = null } = {}) {
  const absPath = path.resolve(filePath);
  const html = fs.readFileSync(absPath, "utf8");
  const fetchTools = installFetchStub();
  const chrome = chromeOverride || makeChromeStub();

  const dom = new JSDOM(html, {
    url: `file://${absPath}${hash}`,
    runScripts: "dangerously",
    resources: "usable",
    pretendToBeVisual: true,
    beforeParse(window) {
      window.chrome = chrome;
      if (window.navigator) {
        try {
          Object.defineProperty(window.navigator, "userAgent", {
            value: "UnitTest",
            configurable: true,
          });
        } catch {
          window.navigator = { userAgent: "UnitTest" };
        }
      } else {
        window.navigator = { userAgent: "UnitTest" };
      }
      window.fetch = fetchTools.fetchStub;
      window.Blob = Blob;
      window.URL = URL;
      function getOptionsFormProxy() {
        const form = window.document.forms
          ? window.document.forms.namedItem("optionsForm")
          : null;
        if (!form) return null;
        if (!form.__proxy) {
          form.__proxy = new Proxy(form, {
            get(target, prop) {
              if (prop in target) {
                const value = target[prop];
                return typeof value === "function" ? value.bind(target) : value;
              }
              if (typeof prop === "string" && target.elements && typeof target.elements.namedItem === "function") {
                const item = target.elements.namedItem(prop);
                if (item) return item;
              }
              return undefined;
            },
            set(target, prop, value) {
              target[prop] = value;
              return true;
            },
          });
        }
        return form.__proxy;
      }
      Object.defineProperty(window.document, "optionsForm", {
        configurable: true,
        get: getOptionsFormProxy,
      });
      window.createImageBitmap = async () => ({ width: 1, height: 1 });
      installCanvasStub(window);
      if (window.document && window.document.createElement) {
        const origCreate = window.document.createElement.bind(window.document);
        window.document.createElement = (tag) => {
          if (String(tag).toLowerCase() === "canvas") {
            return new window.OffscreenCanvas(16, 16);
          }
          return origCreate(tag);
        };
      }
      if (beforeParse) {
        beforeParse(window);
      }
    },
  });

  await new Promise((resolve) => {
    dom.window.addEventListener("load", () => resolve(), { once: true });
  });

  try {
    const ready = dom.window.eval("typeof optionsReady !== 'undefined' && optionsReady");
    if (ready && typeof ready.then === "function") {
      await ready;
    }
  } catch {
    // ignore
  }
  if (dom.window.document.getElementById("provider_select")) {
    for (let i = 0; i < 10; i++) {
      const form = dom.window.document.optionsForm;
      if (form && typeof form.onchange === "function") {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  return { dom, chrome, fetchTools };
}

module.exports = { loadDom };
