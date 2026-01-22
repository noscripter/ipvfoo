const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

function createDom(filePath, { hash = "" } = {}) {
  const absPath = path.resolve(filePath);
  const html = fs.readFileSync(absPath, "utf8");
  const dom = new JSDOM(html, {
    url: `file://${absPath}${hash}`,
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  return dom;
}

module.exports = { createDom };
