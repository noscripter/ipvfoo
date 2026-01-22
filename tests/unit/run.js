const tests = [
  require("./iputil.test"),
  require("./providers.test"),
  require("./options-ui.test"),
  require("./popup-ui.test"),
];

async function runAll() {
  for (const mod of tests) {
    if (!mod || typeof mod.run !== "function") {
      throw new Error("Test module missing run() export");
    }
    await mod.run();
  }
}

runAll().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
