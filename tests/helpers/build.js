const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

function ensureBuilt({ browser, mv }) {
  const cmd = browser ? `make mv${mv} BROWSER=${browser}` : `make mv${mv}`;
  execSync(cmd, { stdio: "inherit" });
}

function findInBuild(pattern) {
  const dir = path.resolve("build");
  const entries = fs.readdirSync(dir);
  for (const entry of entries) {
    if (pattern.test(entry)) {
      return path.join(dir, entry);
    }
  }
  return null;
}

function findUnpacked(mv) {
  const pattern = new RegExp(`-mv${mv}-unpacked$`);
  return findInBuild(pattern);
}

function findXpi(mv) {
  const pattern = new RegExp(`-mv${mv}\\.xpi$`);
  return findInBuild(pattern);
}

module.exports = { ensureBuilt, findUnpacked, findXpi };
