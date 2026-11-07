import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { agent, connect } from "../agents/rambo-macos.mjs";
import { agent as windowsAgent } from "../agents/rambo-windows.mjs";
import { agent as linuxAgent } from "../agents/rambo-linux.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function svgIcon(pkg) {
  assert.match(pkg.magpie.icon, /^data:image\/svg\+xml;base64,/u);
  return Buffer.from(pkg.magpie.icon.split(",", 2)[1], "base64").toString("utf8");
}

test("package publishes a self-contained rounded SVG icon and discovery metadata", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const logo = readFileSync(join(root, "assets/rambo.png"));
  const svg = svgIcon(pkg);
  assert.ok(pkg.keywords.includes("magpie-plugin"));
  assert.equal(pkg.magpie.agent, "./agents/rambo-macos.mjs");
  assert.match(svg, /viewBox="0 0 24 24"/u);
  assert.match(svg, /<rect[^>]*width="24"[^>]*height="24"[^>]*rx="7\.636"/u);
  assert.match(svg, /clip-path="url\(#r\)"/u);
  assert.match(svg, /href="data:image\/png;base64,/u);
  assert.doesNotMatch(svg, /https?:\/\/(?!www\.w3\.org\/2000\/svg(?=["'\s]))/u);
  assert.ok(existsSync(join(root, pkg.magpie.agent)));
  assert.deepEqual([...logo.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.ok(logo.readUInt32BE(16) >= 112);
  assert.equal(logo.readUInt32BE(16), logo.readUInt32BE(20));
  assert.equal(logo[24], 8);
  assert.ok([2, 6].includes(logo[25]));
});

test("Magpie agent targets Rambo's per-user bridge config", () => {
  assert.equal(agent.id, "rambo");
  assert.equal(agent.icon, pathToFileURL(join(root, "assets/rambo.png")).href);
  assert.ok(existsSync(fileURLToPath(agent.icon)));
  assert.equal(agent.dir, "/Applications/Rambo.app");
  assert.equal(agent.config, "~/Library/Application Support/Rambo/magpie.json");
  assert.equal(agent.model, "model");
  assert.equal("library" in agent, false);
});

test("Windows and Linux agent files target their platform install and config paths", () => {
  assert.equal(windowsAgent.icon, agent.icon);
  assert.equal(linuxAgent.icon, agent.icon);
  assert.equal(windowsAgent.dir, "$LOCALAPPDATA/Programs/Rambo");
  assert.equal(windowsAgent.config, "$APPDATA/Rambo/magpie.json");
  assert.equal(linuxAgent.dir, "~/.config/Rambo");
  assert.equal(linuxAgent.config, "~/.config/Rambo/magpie.json");
});

test("connect writes only the Magpie gateway bridge fields", () => {
  assert.deepEqual(connect({ gateway: {
    v1: "http://127.0.0.1:4312/v1",
    key: "magpie-test-key",
  } }), {
    baseURL: "http://127.0.0.1:4312/v1",
    apiKey: "magpie-test-key",
    managedBy: "magpie",
  });
});
