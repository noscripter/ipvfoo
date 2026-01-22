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
      window.navigator = { userAgent: "UnitTest" };
      window.fetch = fetchTools.fetchStub;
      window.Blob = Blob;
      window.URL = URL;
      window.createImageBitmap = async () => ({ width: 1, height: 1 });
      installCanvasStub(window);
      if (window.document && window.document.createElement) {
        const origCreate = window.document.createElement.bind(window.document);
        window.document.createElement = (tag) => {
          if (String(tag).toLowerCase() === \"canvas\") {
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
    const ready = dom.window.eval(\"typeof optionsReady !== 'undefined' && optionsReady\");
    if (ready && typeof ready.then === \"function\") {
      await ready;
    }
  } catch {
    // ignore
  }

  return { dom, chrome, fetchTools };
}

module.exports = { loadDom };
