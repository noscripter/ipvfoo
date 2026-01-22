const fs = require("fs");
const vm = require("vm");
const path = require("path");

function loadScript(filePath, context = null) {
  const absPath = path.resolve(filePath);
  const code = fs.readFileSync(absPath, "utf8");
  const options = { filename: absPath };
  if (context) {
    return vm.runInContext(code, context, options);
  }
  return vm.runInThisContext(code, options);
}

module.exports = { loadScript };
